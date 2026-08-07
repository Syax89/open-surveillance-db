// Reverse-geocode backfill (CEO 2026-08-07): fill cameras.address (and the
// geocode_reverse_cache table) for public records that have no address yet,
// at ~1 request/second — the Nominatim usage policy ceiling.
//
// Usage:
//   node scripts/reverse-geocode-backfill.mjs [--limit N] [--dry-run]
//
//   --limit N    process at most N records (sanity check on a small slice)
//   --dry-run    print what WOULD be fetched/updated without touching the
//                network or the database (still counts cache hits)
//
// The script talks to the LOCAL D1 database through the same wrangler d1
// path the other db scripts use (scripts/provision-alpha-accounts.mjs),
// so it must run from the repo root with node_modules installed.
//
// Idempotent by design: records that already carry an address are skipped
// (WHERE address IS NULL), and the reverse cache makes repeated runs cheap
// — a record whose coordinates were resolved before hits the cache and is
// never re-fetched.
//
// Rate limit: Nominatim's policy caps community use at ~1 request/second.
// The script sleeps ~1.05 s between LIVE upstream calls (cache hits are
// free). With 7,374 records and a cold cache the full run takes roughly
// two hours — by design, not a bug.
//
// Privacy: only public records (status active/demo) are processed; the
// stored address is the public Nominatim display name (road + locality),
// never a reverse lookup of a private position.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const dbName = "osdb-production";
const mode = ["--local", "--remote", "--persist-to"].some((flag) => process.argv.includes(flag))
  ? process.argv[process.argv.indexOf(process.argv.find((a) => a.startsWith("--local") || a.startsWith("--remote") || a.startsWith("--persist-to")))]
  : "--local";
const persistToIndex = process.argv.indexOf("--persist-to");
const persistTo = persistToIndex !== -1 ? process.argv[persistToIndex + 1] : null;
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex !== -1 ? Number(process.argv[limitIndex + 1]) : null;
const dryRun = process.argv.includes("--dry-run");

const UPSTREAM = process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";
const UA = "OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb.org)";
const SLEEP_MS = 1050;

function d1(args, { json = false } = {}) {
  const fullArgs = [wranglerBin, "d1", "execute", dbName, mode, ...(persistTo ? ["--persist-to", persistTo] : []), ...args];
  const stdout = execFileSync(process.execPath, fullArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return json ? JSON.parse(stdout) : stdout;
}

function d1Query(sql) {
  const out = d1(["--command", sql, "--json"], { json: true });
  // wrangler --json returns [{ results: [...], success: true }] per statement.
  return out.flatMap((r) => r.results ?? []);
}

async function reverseLookup(lat, lng) {
  const url = `${UPSTREAM}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=18`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const body = await response.json();
  if (body?.error || typeof body?.display_name !== "string" || body.display_name.length === 0) return null;
  return body.display_name;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`[reverse-geocode-backfill] mode=${mode}${limit ? ` limit=${limit}` : ""}${dryRun ? " DRY-RUN" : ""} upstream=${UPSTREAM}`);

  // 1) Records missing an address (public statuses only).
  const candidates = d1Query(
    `SELECT id, latitude, longitude FROM cameras WHERE address IS NULL AND status IN ('active','demo') ORDER BY id${limit ? ` LIMIT ${limit}` : ""}`,
  );
  console.log(`[reverse-geocode-backfill] ${candidates.length} public records without an address`);

  // 2) Existing cache → skip re-fetching (rounded to 4 decimals, ~11 m).
  const cacheRows = d1Query(`SELECT lat, lng, address FROM geocode_reverse_cache`);
  const cache = new Map(cacheRows.map((r) => [`${r.lat},${r.lng}`, r.address]));

  const factor = 10 ** 4;
  const key = (lat, lng) => `${Math.round(lat * factor) / factor},${Math.round(lng * factor) / factor}`;

  let fetched = 0;
  let hits = 0;
  const updates = []; // { id, address }
  const newCacheRows = new Map(); // rounded key → address (only MISS writes)

  // Checkpoint flush (2026-08-07): the backfill runs for ~2 h and the
  // container may be restarted — write every FLUSH_EVERY records so an
  // interruption never loses more than FLUSH_EVERY live fetches. Both
  // writes are idempotent (UPDATE by id / INSERT OR IGNORE), so a
  // re-run continues where the last checkpoint stopped.
  const FLUSH_EVERY = 100;
  let lastFlush = 0;

  async function flush() {
    if (updates.length === 0) return;
    const batch = updates
      .map((u) => {
        const escaped = u.address.replaceAll("'", "''");
        return `UPDATE cameras SET address = '${escaped}' WHERE id = ${u.id};`;
      })
      .join("\n");
    const batchFile = path.join(root, `.reverse-geocode-batch-${process.pid}.sql`);
    const { writeFileSync, rmSync } = await import("node:fs");
    writeFileSync(batchFile, batch);
    d1(["--file", batchFile]);
    rmSync(batchFile);
    updates.length = 0;
    // Cache rows for every address we just persisted (rounded key).
    const cacheInserts = [...newCacheRows.entries()]
      .map(([k, address]) => {
        const escaped = address.replaceAll("'", "''");
        const [lat, lng] = k.split(",");
        return `INSERT OR IGNORE INTO geocode_reverse_cache (lat, lng, address, updated_at) VALUES (${lat}, ${lng}, '${escaped}', '${new Date().toISOString()}');`;
      })
      .join("\n");
    if (cacheInserts) {
      const cacheFile = path.join(root, `.reverse-geocode-cache-${process.pid}.sql`);
      writeFileSync(cacheFile, cacheInserts);
      d1(["--file", cacheFile]);
      rmSync(cacheFile);
    }
    newCacheRows.clear();
    lastFlush = 0;
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const camera = candidates[i];
    const k = key(camera.latitude, camera.longitude);
    let address = cache.get(k);
    if (address) {
      hits += 1;
    } else if (dryRun) {
      address = "(dry-run placeholder)";
      fetched += 1;
    } else {
      address = await reverseLookup(camera.latitude, camera.longitude);
      fetched += 1;
      if (address) {
        cache.set(k, address);
        newCacheRows.set(k, address);
      }
      await sleep(SLEEP_MS); // Nominatim usage policy: ~1 request/second
    }
    if (address) updates.push({ id: camera.id, address, latitude: camera.latitude, longitude: camera.longitude });
    if ((i + 1) % 50 === 0 || i === candidates.length - 1) {
      console.log(`[reverse-geocode-backfill] ${i + 1}/${candidates.length} (hits=${hits} fetched=${fetched})`);
    }
    // Checkpoint: persist every FLUSH_EVERY records so an interrupted run
    // (container restart, ssh drop) never loses more than that many fetches.
    if (!dryRun && (i + 1) % FLUSH_EVERY === 0) {
      await flush();
      console.log(`[reverse-geocode-backfill] checkpoint @${i + 1} — ${updates.length === 0 ? "written" : "pending"} (hits=${hits} fetched=${fetched})`);
    }
  }

  console.log(`[reverse-geocode-backfill] resolved ${updates.length}/${candidates.length} (cache hits ${hits}, live fetches ${fetched})`);
  if (dryRun) {
    console.log(`[reverse-geocode-backfill] DRY-RUN: would update ${updates.length} records — nothing written`);
    return;
  }
  if (updates.length === 0) {
    console.log("[reverse-geocode-backfill] nothing to update");
    return;
  }

  // Final flush of any records past the last checkpoint.
  await flush();
  console.log(`[reverse-geocode-backfill] done — ${fetched} live fetches, addresses persisted to cameras.address + cache`);
}

main().catch((error) => {
  console.error("[reverse-geocode-backfill] failed:", error);
  process.exit(1);
});
