// CI smoke test: schema migrations on a fresh local D1/SQLite database.
//
// Guards against regressions where migrations fail on a clean environment:
//   - a migration file with broken SQL            -> wrangler apply fails
//   - a missing migration journal (d1_migrations) -> assertion fails
//   - a migration dropped/renamed on disk         -> journal mismatch fails
//   - an unexpected table in the schema           -> assertion fails
//   - demo rows sneaking into a fresh DB          -> assertion fails
//   - snapshot drift (schema.ts ahead of the last
//     drizzle/meta snapshot)                      -> `db:generate` would emit
//     a spurious migration, so the no-op check fails
//
// The script is LOCAL-ONLY and side-effect free: it runs against an isolated
// persist directory (.wrangler/smoke-state) that is wiped before every run,
// so it never touches a developer's real .wrangler/state. It uses the same
// wrangler command as `npm run db:migrate` (wrangler d1 migrations apply
// osdb-production --local), so a broken `db:migrate` fails here too.
//
// Usage: node scripts/db-migration-smoke.mjs
// Exit code 0 = schema OK, 1 = any check failed.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "drizzle");
const persistDir = path.join(root, ".wrangler", "smoke-state");
const wranglerBin = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const drizzleKitBin = path.join(root, "node_modules", "drizzle-kit", "bin.cjs");
// Must match the `database_name` of the D1 entry in wrangler.jsonc (the
// production D1 is osdb-production; a mismatch makes wrangler fall back to
// the default `migrations` dir and the smoke test fails).
const dbName = "osdb-production";

// Tables the application schema must expose after a fresh migration.
const expectedTables = [
  "cameras",
  "correction_requests",
  "moderation_events",
  // Wave B Data & Trust (0008): reviewer roles and the moderation queue.
  "reviewers",
  "moderation_queue",
  // STATUS gap #1 (0009): contributor accounts and sessions.
  "contributors",
  "sessions",
  // Auth roles + appeals (0010): role identities and the appeal trail.
  "users",
  "moderation_appeals",
  // Photo evidence (0011): metadata only, image bytes live in R2.
  "photos",
  // Per-email login lockout (0016, ADR 0016): brute-force counter keyed by
  // the SHA-256 of the normalised email — never the address itself.
  "login_attempts",
  // Community verifications + edit requests (0020/0021, ADR 0018): the
  // toggle table (one confirmation per record+contributor) and the two-track
  // PATCH edit-request table.
  "camera_confirmations",
  "camera_edit_requests",
  // Multi-method auth — Fase A (0027): email verification tokens (hashed,
  // 24h TTL, single-use), WebAuthn passkeys (public keys only) and the
  // one-time recovery codes issued at passkey enrollment (hashed).
  "email_verification_tokens",
  "passkeys",
  "recovery_codes",
];
// Indexes declared by the migrations.
const expectedIndexes = [
  "cameras_status_idx",
  "cameras_coordinates_idx",
  "correction_requests_status_idx",
  "moderation_events_created_at_idx",
  "moderation_events_entity_idx",
  "reviewers_role_idx",
  "moderation_queue_state_idx",
  "contributors_email_unique",
  "sessions_token_hash_unique",
  "sessions_contributor_idx",
  "sessions_expires_idx",
  "users_role_idx",
  "users_email_unique",
  // Explicit contributor→users identity link (0026, audit t_5ca60ab2, P2):
  // the only attribution path from a contributor session to a role identity.
  "users_contributor_id_unique",
  "moderation_appeals_status_idx",
  "moderation_appeals_entity_idx",
  "photos_status_idx",
  "photos_camera_idx",
  // Pending-photo quota (0013): only 'pending' rows are indexed.
  "photos_pending_submitter_idx",
  // F0 backend prereq (0019): composite public-directory indexes serving the
  // kind filter, the status+recency navigation and the freshness windows.
  "cameras_status_kind_idx",
  "cameras_status_updated_idx",
  "cameras_status_last_verified_idx",
  // Community verifications (0020): UNIQUE (camera, contributor) + the
  // (contributor_id, created_at) quota-count index.
  "camera_confirmations_camera_contributor_unique",
  "camera_confirmations_contributor_created_idx",
  // Contribution editing (0021): one open edit-request per camera + the
  // per-contributor "my edits" index.
  "camera_edit_requests_open_unique",
  "camera_edit_requests_contributor_idx",
  // Community corrections (0022): per-contributor "my corrections" index.
  "correction_requests_contributor_idx",
  // Community trust levels (0023): index-only level COUNT.
  "cameras_contributor_status_idx",
  // Community profile contributions list (0025): "my contributions" branches
  // for cameras and photos ORDER BY created_at DESC on contributor_id.
  "cameras_contributor_created_idx",
  "photos_contributor_created_idx",
  // Multi-method auth — Fase A (0027): token hash is globally unique and the
  // (contributor_id) / (expires_at) indexes serve the per-account lookups and
  // the expiry sweep; passkey credential_id is globally unique per relying
  // party; recovery code hash is globally unique (point lookup on consume).
  "email_verification_tokens_token_hash_unique",
  "email_verification_tokens_contributor_idx",
  "email_verification_tokens_expires_idx",
  "passkeys_credential_id_unique",
  "passkeys_contributor_idx",
  "recovery_codes_code_hash_unique",
  "recovery_codes_contributor_idx",
];
// Tables that are not application schema but legitimately appear in a local
// D1 database. Anything outside this set is an unexpected schema change.
const allowedExtraTables = ["_cf_METADATA", "sqlite_sequence", "d1_migrations"];

// Tables that migration 0008 (Wave B Data & Trust) deliberately seeds with
// the reviewer roles, and migration 0010 with the demo identity accounts.
// Migration 0017 (LAST) removes every demo seed, so a fresh DB must contain
// ZERO rows in both tables — no demo identities survive into alpha/prod.
const expectedSeedCounts = {
  reviewers: 0,
  users: 0,
};

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function runWrangler(args) {
  return execFileSync(process.execPath, [wranglerBin, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

// Run a read-only query against the isolated local DB and return the rows.
function query(sql) {
  const stdout = runWrangler([
    "d1", "execute", dbName, "--local", "--persist-to", persistDir,
    "--json", "--command", sql,
  ]);
  const payload = JSON.parse(stdout);
  const first = payload[0];
  if (!first || first.success !== true) {
    throw new Error(`wrangler d1 execute failed for: ${sql}`);
  }
  return first.results ?? [];
}

function namesOf(rows) {
  return rows.map((r) => String(r.name)).sort();
}

console.log("┌─────────────────────────────────────────────┐");
console.log("│ DB migration smoke test (fresh local D1)     │");
console.log("└─────────────────────────────────────────────┘");

// 1. Fresh database guarantee: wipe the isolated state, then apply every
//    migration exactly like `npm run db:migrate` does, but isolated.
if (existsSync(persistDir)) {
  rmSync(persistDir, { recursive: true, force: true });
}
console.log(`[1/10] fresh persist dir: ${path.relative(root, persistDir)}`);

console.log("[2/10] applying migrations (wrangler d1 migrations apply --local)…");
try {
  runWrangler(["d1", "migrations", "apply", dbName, "--local", "--persist-to", persistDir]);
} catch (err) {
  console.error("✗ migration apply failed — broken SQL or invalid migration:");
  console.error(err.stderr || err.message);
  process.exit(1);
}
console.log("      migrations applied successfully");

// 2. Migration journal must exist and match the files in drizzle/.
console.log("[3/10] checking migration journal (d1_migrations)…");
let journalRows;
try {
  journalRows = query("SELECT name FROM d1_migrations;");
} catch {
  fail("migration journal table d1_migrations is missing — migrations were not applied");
  journalRows = [];
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const appliedNames = namesOf(journalRows);
const filesSorted = [...migrationFiles].sort();

if (appliedNames.join("\n") !== filesSorted.join("\n")) {
  fail(
    `migration journal mismatch: applied=${JSON.stringify(appliedNames)} ` +
      `files=${JSON.stringify(filesSorted)}`,
  );
} else {
  console.log(`      journal OK: ${appliedNames.length}/${migrationFiles.length} migrations applied and tracked`);
}

// 3. drizzle-kit meta journal must agree with the SQL files on disk. This is
//    what catches a migration dropped or renamed in the migrations dir: the
//    DB journal only reflects what was applied, so a missing file is invisible
//    to it — but drizzle/meta/_journal.json still lists the expected set.
console.log("[4/10] checking drizzle meta journal…");
let metaTags = [];
const metaJournalPath = path.join(migrationsDir, "meta", "_journal.json");
try {
  const meta = JSON.parse(readFileSync(metaJournalPath, "utf8"));
  metaTags = (meta.entries ?? []).map((e) => String(e.tag));
} catch {
  fail(`drizzle meta journal (${path.relative(root, metaJournalPath)}) is missing or unreadable`);
}
const filesNoExt = migrationFiles.map((f) => f.replace(/\.sql$/, "")).sort();
const metaSorted = [...metaTags].sort();
if (metaSorted.join("\n") !== filesNoExt.join("\n")) {
  fail(
    `drizzle meta journal mismatch: meta=${JSON.stringify(metaSorted)} ` +
      `files=${JSON.stringify(filesNoExt)}`,
  );
} else {
  console.log(`      meta journal OK: ${metaTags.length} migrations registered`);
}

// 4b. The "no-op guarantee": `npm run db:generate` must not emit any new
//     migration. Drizzle diffs schema.ts against the LAST snapshot in
//     drizzle/meta/; when snapshots are missing or stale it silently emits a
//     spurious migration (the audit's 0011-0025 gap would have produced a
//     giant 0026). drizzle-kit 0.31 has no --dry-run, so we run the real
//     generate against a throwaway COPY of drizzle/ and assert zero new .sql
//     files appeared — the developer tree is never touched.
console.log("[5/10] checking drizzle-kit generate is a no-op…");
const genScratch = path.join(root, ".wrangler", "smoke-generate");
const genOut = path.join(genScratch, "drizzle");
const genConfig = path.join(genScratch, "drizzle.config.ts");
let genSqlBefore = [];
let genScratchReady = true;
try {
  rmSync(genScratch, { recursive: true, force: true });
  mkdirSync(genOut, { recursive: true });
  cpSync(migrationsDir, genOut, { recursive: true });
  writeFileSync(
    genConfig,
    [
      'import { defineConfig } from "drizzle-kit";',
      "",
      "export default defineConfig({",
      `  out: ${JSON.stringify(path.relative(root, genOut))},`,
      '  schema: "./db/schema.ts",',
      '  dialect: "sqlite",',
      "});",
      "",
    ].join("\n"),
  );
  genSqlBefore = readdirSync(genOut).filter((f) => f.endsWith(".sql")).sort();
} catch (err) {
  genScratchReady = false;
  fail(`could not prepare generate scratch copy: ${err.message}`);
}
if (genScratchReady) {
  try {
    execFileSync(process.execPath, [drizzleKitBin, "generate", "--config", genConfig], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (err) {
    fail(`drizzle-kit generate failed on the scratch copy: ${err.stderr || err.message}`);
  }
  const genSqlAfter = readdirSync(genOut).filter((f) => f.endsWith(".sql")).sort();
  rmSync(genScratch, { recursive: true, force: true });
  const spurious = genSqlAfter.filter((f) => !genSqlBefore.includes(f));
  if (spurious.length > 0) {
    fail(
      `drizzle-kit generate emitted ${spurious.length} spurious migration(s): ` +
        `${spurious.join(", ")} — schema.ts and the last snapshot have drifted; ` +
        "run `npm run db:generate` and commit the result",
    );
  } else {
    console.log("      ✓ generate no-op: 0 new migrations (schema.ts == last snapshot)");
  }
}

// 4. Expected application tables must exist.
console.log("[6/10] checking application tables…");
let tableRows;
try {
  tableRows = query("SELECT name FROM sqlite_master WHERE type = 'table';");
} catch (err) {
  fail(`could not read schema: ${err.message}`);
  tableRows = [];
}
const tableNames = namesOf(tableRows);
for (const t of expectedTables) {
  if (tableNames.includes(t)) {
    console.log(`      ✓ table ${t}`);
  } else {
    fail(`expected table ${t} is missing after fresh migration`);
  }
}

// 4. No unexpected tables (protects against stray CREATE TABLE).
const unexpected = tableNames.filter((t) => !expectedTables.includes(t) && !allowedExtraTables.includes(t));
if (unexpected.length > 0) {
  fail(`unexpected tables in schema: ${unexpected.join(", ")}`);
}

// 4b. Multi-method auth columns on `contributors` (0027): the ALTER TABLE
// part of the migration must have landed — the tables alone don't prove it.
console.log("[7/10] checking contributors auth columns…");
let contributorColumns;
try {
  const colRows = query("PRAGMA table_info(contributors);");
  contributorColumns = namesOf(colRows);
} catch (err) {
  fail(`could not read contributors columns: ${err.message}`);
  contributorColumns = [];
}
for (const col of ["email_verified_at", "auth_provider", "external_sub"]) {
  if (contributorColumns.includes(col)) {
    console.log(`      ✓ contributors.${col}`);
  } else {
    fail(`expected contributors.${col} is missing after fresh migration`);
  }
}

// 5. Expected indexes must exist.
console.log("[8/10] checking indexes…");
let indexRows;
try {
  indexRows = query("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%';");
} catch (err) {
  fail(`could not read indexes: ${err.message}`);
  indexRows = [];
}
const indexNames = namesOf(indexRows);
for (const i of expectedIndexes) {
  if (indexNames.includes(i)) {
    console.log(`      ✓ index ${i}`);
  } else {
    fail(`expected index ${i} is missing after fresh migration`);
  }
}

// 6. A fresh migrated database must be empty (no demo/seed rows), except for
//    tables the migrations deliberately seed with a fixed row set.
console.log("[9/10] checking row counts (fresh DB must be empty)…");
for (const t of expectedTables) {
  const seeded = expectedSeedCounts[t];
  let count = -1;
  try {
    const rows = query(`SELECT COUNT(*) AS n FROM ${t};`);
    count = Number(rows[0]?.n ?? -1);
  } catch (err) {
    fail(`could not count rows in ${t}: ${err.message}`);
    continue;
  }
  if (count === 0) {
    console.log(`      ✓ ${t}: 0 rows`);
  } else if (seeded !== undefined) {
    if (count === seeded) {
      console.log(`      ✓ ${t}: ${count} rows (migration seed, expected)`);
    } else {
      fail(`expected ${t} to have exactly ${seeded} seeded rows, found ${count}`);
    }
  } else {
    fail(`expected ${t} to be empty on a fresh DB, found ${count} row(s)`);
  }
}

// 7. Zero demo identities: migration 0017 (LAST) must have removed every
//    "Demo *" reviewer and every @osdb.test demo user seeded by 0008/0010.
//    This is the security gate that keeps demo moderation/admin accounts out
//    of a fresh alpha/prod database.
console.log("[10/10] checking zero demo identities (0017 removal)…");
const demoChecks = [
  {
    label: "demo reviewers (display_name LIKE 'Demo %')",
    sql: "SELECT COUNT(*) AS n FROM reviewers WHERE display_name LIKE 'Demo %'",
  },
  {
    label: "demo users (email LIKE '%@osdb.test')",
    sql: "SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@osdb.test'",
  },
  {
    label: "demo-linked reviewer profiles (user_id -> demo user)",
    sql: "SELECT COUNT(*) AS n FROM reviewers r JOIN users u ON u.id = r.user_id WHERE u.email LIKE '%@osdb.test'",
  },
];
for (const check of demoChecks) {
  try {
    const rows = query(check.sql);
    const n = Number(rows[0]?.n ?? -1);
    if (n === 0) {
      console.log(`      ✓ ${check.label}: 0 rows`);
    } else {
      fail(`${check.label}: found ${n} row(s) on a fresh DB — demo seed was not removed`);
    }
  } catch (err) {
    fail(`could not run demo check (${check.label}): ${err.message}`);
  }
}

console.log("");
if (failures > 0) {
  console.error(`✗ DB migration smoke test FAILED (${failures} check(s) failed)`);
  process.exit(1);
}
console.log("✓ DB migration smoke test PASSED — fresh schema is healthy");
