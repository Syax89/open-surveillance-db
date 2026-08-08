/**
 * sync-d1-backfill.mjs — one-way container → D1 prod data sync.
 *
 * Dumps the LOCAL miniflare D1 database (the container's source of truth
 * for imported camera data) into INSERT OR IGNORE chunks and applies them
 * to the REMOTE Cloudflare D1 database ("osdb-production").
 *
 * Why INSERT OR IGNORE: remote rows (community contributions, corrections,
 * user data) are NEVER overwritten by the sync — only ids missing on the
 * remote are added. Deletes are not propagated (a camera removed locally
 * stays on the remote; the moderation flow owns removals).
 *
 * Requirements:
 *   - run from the repo root (uses wrangler.jsonc → osdb-production)
 *   - CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env
 *   - the local DB path may be passed with --db=<path>; it defaults to
 *     the miniflare v3 D1 state directory.
 *
 * Usage:
 *   node scripts/sync-d1-backfill.mjs [--db=<local sqlite>] [--dir=/tmp/backfill-chunks]
 *
 * Design notes (2026-08-08, limits learned the hard way):
 *   - D1 remote limits: max SQL statement length 100 KB, max string/BLOB
 *     row 2 MB, batch file import up to 5 GB. Statements MUST stay under
 *     100 KB or wrangler fails with SQLITE_TOOBIG on the WHOLE file.
 *   - import_batches.report/notes hold multi-KB diagnostic JSON (76 KB+
 *     real) — a single row can exceed the statement limit, so those fields
 *     are truncated to 40 KB each and batches use 1 row/statement.
 *   - FK order matters: contributors → import_batches → cameras →
 *     lifecycle → community_actions → settings → passkeys → recovery.
 *   - geocode_reverse_cache is deliberately skipped: it is a regenerable
 *     cache whose JSON rows are huge; it rebuilds itself on demand.
 */
import { DatabaseSync } from "node:sqlite";
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const DB_PATH =
  arg("db") ??
  path.join(
    process.cwd(),
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    (() => {
      const state = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
      const files = existsSync(state) ? readdirSync(state) : [];
      // Prendi SOLO il DB miniflare reale: nome = hash hex di 64 char.
      // PITFALL (2026-08-09): esiste anche `db.sqlite` (stale, da un
      // vecchio state) che finisce in .sqlite ma NON è il DB attivo —
      // prenderlo silenziosamente sincronizzava un DB vecchio su D1 prod.
      const sqlite = files
        .filter((f) => /^[a-f0-9]{64}\.sqlite$/.test(f))
        .sort((a, b) => statSync(path.join(state, b)).mtimeMs - statSync(path.join(state, a)).mtimeMs)[0];
      return sqlite ?? "";
    })(),
  );

const OUT_DIR = arg("dir", "/tmp/backfill-chunks");
const DRY = args.includes("--dry-run");

// ---- Tables in FK-safe order (geocode_reverse_cache excluded on purpose). ----
const TABLES = [
  "contributors",
  "import_batches",
  "cameras",
  "camera_lifecycle_events",
  "camera_community_actions",
  "community_settings",
  "passkeys",
  "recovery_codes",
  "correction_requests",
  "photos",
];

const Q = String.fromCharCode(39);

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return Q + String(v).split(Q).join(Q + Q) + Q;
}

if (!existsSync(DB_PATH)) {
  console.error(`✗ local DB not found: ${DB_PATH}`);
  process.exit(2);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH, { readOnly: true });

let fileIdx = 0;
let buf = "";
let stmtsInFile = 0;
const ROWS_PER_STMT = 10;
const MAX_STMTS_PER_FILE = 20;

function flush() {
  if (buf.length === 0) return;
  writeFileSync(path.join(OUT_DIR, `part-${String(fileIdx).padStart(4, "0")}.sql`), buf);
  fileIdx++;
  buf = "";
  stmtsInFile = 0;
}

let totalRows = 0;

for (const t of TABLES) {
  let cols;
  try {
    cols = db.prepare(`PRAGMA table_info("${t}")`).all();
  } catch {
    continue;
  }
  const names = cols.map((c) => c.name);
  let n = 0;
  try {
    n = db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n;
  } catch {
    continue;
  }
  if (n === 0) continue;
  const rows = db.prepare(`SELECT * FROM "${t}"`).all();
  totalRows += n;

  let curVals = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (t === "import_batches" && (r.report != null || r.notes != null)) {
      for (const k of ["report", "notes"]) {
        if (r[k] == null) continue;
        const rep = typeof r[k] === "string" ? r[k] : JSON.stringify(r[k]);
        r[k] = rep.length > 40000 ? rep.slice(0, 40000) + "...[truncated in sync]" : rep;
      }
    }
    const rowsPerStmt = t === "import_batches" ? 1 : ROWS_PER_STMT;
    curVals.push(`(${names.map((c) => lit(r[c])).join(",")})`);
    if (curVals.length >= rowsPerStmt) {
      buf += `INSERT OR IGNORE INTO "${t}" ("${names.join('","')}") VALUES\n${curVals.join(",\n")};\n`;
      curVals = [];
      stmtsInFile++;
      if (stmtsInFile >= MAX_STMTS_PER_FILE) flush();
    }
  }
  if (curVals.length > 0) {
    buf += `INSERT OR IGNORE INTO "${t}" ("${names.join('","')}") VALUES\n${curVals.join(",\n")};\n`;
    stmtsInFile++;
  }
  flush();
}

console.log(`dump: ${fileIdx} chunk(s), ${totalRows} righe da ${DB_PATH}`);

if (DRY) {
  console.log("dry-run: nessuna esecuzione su D1 remoto");
  process.exit(0);
}

// ---- Apply to remote. ----
const files = Array.from({ length: fileIdx }, (_, i) =>
  path.join(OUT_DIR, `part-${String(i).padStart(4, "0")}.sql`),
);
let fails = 0;
for (const f of files) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = execFileSync(
        "npx",
        ["wrangler", "d1", "execute", "osdb-production", "--remote", "--file", f],
        { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      if (!out.includes("ERROR")) break;
      fails++;
      console.error(`FAIL ${path.basename(f)} (tentativo ${attempt}): ${out.match(/ERROR[^\n]*/)?.[0] ?? ""}`);
      await new Promise((res) => setTimeout(res, 3000));
    } catch (e) {
      fails++;
      console.error(`FAIL ${path.basename(f)} (tentativo ${attempt}): ${String(e.message).slice(0, 200)}`);
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

console.log(fails === 0 ? `sync OK: ${fileIdx} chunk applicati` : `sync CON ERRORI: ${fails} chunk falliti`);
process.exit(fails === 0 ? 0 : 1);
