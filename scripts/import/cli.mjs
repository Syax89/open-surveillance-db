#!/usr/bin/env node
// Import pipeline CLI (FONTI PUBBLICHE FASE A, kanban t_6030d390;
// docs/data-sources/normalizzazione-pipeline.md §8.3/§8.5).
//
//   npm run import:run     -- --slug=<slug> [--source=<file|url>] [--apply] [--force] [--d1-path=<path>]
//   npm run import:rollback -- --slug=<slug> [--d1-path=<path>]
//
// Dry-run is the DEFAULT for import:run (design §8.3 step 8: the mandatory
// human gate before --apply). With --apply the licence gate runs and the
// batch is created + committed. --force refreshes an already-committed
// batch in place (idempotency semantics §8.4).
//
// The adapter for the slug is loaded from scripts/import/adapters/<slug>.mjs
// (FASE B contract); FASE A ships the fixture adapter for offline staging
// via --source=<file>.
//
// DB access: pass --d1-path=<path> to a local SQLite file (the wrangler
// dev database, .wrangler/state/v3/d1/*.sqlite) for offline runs, or leave
// it unset and let the CLI fall back to `cloudflare:workers` env.DB when
// executed inside the Worker runtime (deployment pattern, design §8.6).

import { parseArgs } from "node:util";
import { LocalD1Database } from "./local-d1.mjs";
import { runImport, BATCH_STATUS } from "./runner.mjs";
import { rollbackImport } from "./rollback.mjs";

function usage() {
  console.error(`usage:
  node scripts/import/cli.mjs run    --slug=<slug> [--source=<file|url>] [--apply] [--force] [--d1-path=<path>]
  node scripts/import/cli.mjs rollback --slug=<slug> [--d1-path=<path>]`);
}

async function resolveDb(d1Path) {
  if (d1Path) {
    return new LocalD1Database(d1Path);
  }
  // Inside the Worker runtime env.DB is the real Cloudflare D1 binding
  // (cloudflare:workers). Importing it lazily keeps the CLI importable in
  // plain Node for tests when --d1-path is supplied.
  try {
    const { env } = await import("cloudflare:workers");
    if (env?.DB) return env.DB;
  } catch {
    // not in a Worker context — fall through to the error below
  }
  throw new Error(
    "no database: pass --d1-path=<local sqlite file> (offline run) or execute inside the Worker runtime with the DB binding",
  );
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      slug: { type: "string" },
      source: { type: "string" },
      apply: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "d1-path": { type: "string" },
    },
  });
  const command = positionals[0] ?? "run";
  if (!values.slug) {
    usage();
    process.exit(2);
  }

  const db = await resolveDb(values["d1-path"]);

  if (command === "rollback") {
    const result = await rollbackImport(db, values.slug);
    console.log(`rollback '${result.slug}': removed ${result.removedCameras} camera(s), ${result.eventsRemoved} event(s), ${result.actionsRemoved} action(s) — batch ${result.batchId} marked rolled_back`);
    return;
  }

  // The adapter owns the descriptor (FASE B contract: getDescriptor()).
  // --source overrides the adapter's own fetchPayload (offline staging).
  const summary = await runImport(db, {
    slug: values.slug,
    source: values.source,
    options: { apply: values.apply, force: values.force },
  });

  const { counts } = summary;
  console.log(`import '${summary.slug}' — ${summary.dryRun ? "DRY-RUN (no writes)" : "APPLIED"}`);
  console.log(`  total:              ${counts.total}`);
  console.log(`  inserted:           ${counts.inserted}`);
  console.log(`  skipped (duplicate): ${counts.skippedDuplicate}`);
  console.log(`  review:             ${counts.review}`);
  console.log(`  invalid:            ${counts.invalid}`);
  if (summary.reviewItems.length > 0) {
    console.log("\n  review candidates (human pass required before --apply):");
    for (const item of summary.reviewItems) {
      console.log(`    - ${item.externalId} (${item.title}) ~${item.distanceMeters}m vs #${item.candidateId} [${item.candidateStatus}] — ${item.reason}`);
    }
  }
  if (summary.committed) {
    console.log(`\n  batch ${summary.batchId} committed (${BATCH_STATUS.COMMITTED}).`);
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
