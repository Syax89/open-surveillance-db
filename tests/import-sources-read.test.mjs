// Import pipeline FASE C — attribution read side (kanban t_4dbce318).
//
// Exercises the PUBLIC read paths the attribution UI is built on, against
// the REAL migration SQL on an in-memory D1 adapter (same harness as
// tests/import-pipeline.test.mjs):
//
//   - listCommittedImportBatches(): only `committed` batches, newest
//     first, with every field the /fonti table renders (source name + url,
//     licence + url, attribution text, import date, record counts) —
//     running/failed/rolled_back batches are NEVER exposed (an
//     attribution for data that is not published would be a lie);
//   - getImportBatchById(): the batch behind an imported camera, null for
//     missing ids;
//   - getCommunityRecordById(): the record-detail resolver attaches
//     `importBatch` (sourceName/licence/links) for imported rows and
//     `null` for community reports — the client renders the provenance
//     line from it.
//
// Fixtures are fictitious (example.invalid, made-up names).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";
import { runImport } from "../scripts/import/runner.mjs";

const FIXTURE_DESCRIPTOR = {
  slug: "fixture",
  source_name: "Fixture Open Data (test)",
  format: "geojson",
  license: "ODbL 1.0",
  license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
  source_url: "https://example.invalid/fixture",
  attribution_text: "© Fixture contributors (https://example.invalid/copyright)",
  external_id_prefix: "fix:",
};

const RAW_ROWS = [
  { name: "CAM A", kind: "dome", latitude: 45.1, longitude: 9.1, direction: "120", external_id: "a1", address: "Via Roma 1, Milano" },
  { name: "CAM B", kind: "ptz", latitude: 45.2, longitude: 9.2, direction: "200", external_id: "b1", address: "Via Verdi 2, Milano" },
];

let runtime;
let db;

before(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
});

after(async () => cleanupDbRuntime());

/** Insert an import_batches row with the given status (no cameras). */
async function insertBatchRow(status, overrides = {}) {
  return (
    await db
      .prepare(
        `INSERT INTO import_batches (slug, source_name, format, license, license_url, attribution_text, source_url, import_date, status, records_total, records_inserted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        overrides.slug ?? `manual-${status}`,
        overrides.source_name ?? `Manual ${status} source`,
        "geojson",
        overrides.license ?? "CC0 1.0",
        overrides.license_url ?? null,
        overrides.attribution_text ?? null,
        overrides.source_url ?? "https://example.invalid/manual",
        overrides.import_date ?? "2026-08-04T00:00:00.000Z",
        status,
        overrides.records_total ?? 0,
        overrides.records_inserted ?? 0,
        "2026-08-04T00:00:00.000Z",
      )
      .first()
  ).id;
}

async function insertCommunityCamera(overrides = {}) {
  return (
    await db
      .prepare(
        `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, direction, status, source, updated, description, last_verified_at, review_due_at, review_interval_months, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        overrides.title ?? "Community report cam",
        "Bullet",
        null,
        null,
        0,
        0,
        null,
        "",
        45.0,
        9.0,
        null,
        "active",
        "Community report",
        "2026-08-01T00:00:00.000Z",
        "",
        null,
        null,
        12,
        "2026-08-01T00:00:00.000Z",
      )
      .first()
  ).id;
}

test("listCommittedImportBatches: only committed batches, newest first, full attribution fields", async () => {
  // Real runner apply: committed batch with cameras + persisted attribution.
  const result = await runImport(db, {
    slug: "fixture",
    descriptor: FIXTURE_DESCRIPTOR,
    payload: RAW_ROWS,
    options: { apply: true },
  });
  assert.equal(result.committed, true);
  assert.ok(result.batchId > 0);

  // A batch that is still running / failed / rolled back must never leak
  // into the public list (its data is not published).
  await insertBatchRow("running");
  await insertBatchRow("failed");
  await insertBatchRow("rolled_back");

  const batches = await runtime.importSources.listCommittedImportBatches();
  assert.equal(batches.length, 1, "only the committed batch is public");
  const batch = batches[0];
  assert.equal(batch.slug, "fixture");
  assert.equal(batch.sourceName, "Fixture Open Data (test)");
  assert.equal(batch.sourceUrl, "https://example.invalid/fixture");
  assert.equal(batch.license, "ODbL 1.0");
  assert.equal(batch.licenseUrl, "https://opendatacommons.org/licenses/odbl/1-0/");
  assert.equal(batch.attributionText, "© Fixture contributors (https://example.invalid/copyright)");
  assert.equal(batch.recordsInserted, 2);
  assert.ok(batch.importDate, "import date is present for the /fonti column");
  assert.ok(batch.updatedAt, "committed batches carry the commit timestamp (the /fonti 'Last updated' line)");
  assert.ok(batch.id > 0);
});

test("listCommittedImportBatches: orders newest first across committed batches", async () => {
  const olderId = await insertBatchRow("committed", {
    slug: "manual-older", source_name: "Older dataset",
    import_date: "2026-08-01T00:00:00.000Z",
  });
  const newerId = await insertBatchRow("committed", {
    slug: "manual-newer", source_name: "Newer dataset",
    import_date: "2026-08-03T00:00:00.000Z",
  });
  assert.ok(olderId && newerId);

  const batches = await runtime.importSources.listCommittedImportBatches();
  // Manual newer (2026-08-03) → manual older (2026-08-01) → runner fixture
  // (2026-08-05 in real time; the runner stamps `now` so it lands first
  // only when its import_date is the newest — assert the two manual rows
  // are correctly ordered relative to each other regardless).
  const manualIndexes = batches
    .map((batch, index) => ({ slug: batch.slug, index }))
    .filter((entry) => entry.slug.startsWith("manual-"));
  assert.equal(manualIndexes.length, 2);
  assert.equal(manualIndexes[0].slug, "manual-newer", "newest import_date first");
  assert.equal(manualIndexes[1].slug, "manual-older", "older import_date second");
});

test("getImportBatchById: the batch for an existing id, null for a missing one", async () => {
  const id = await insertBatchRow("committed", {
    slug: "manual-byid", source_name: "By-id dataset",
    license: "CC BY 3.0 IT",
    license_url: "https://example.invalid/licenses/cc-by-3-it",
    attribution_text: "Source: By-id dataset (https://example.invalid/byid), CC BY 3.0 IT.",
    source_url: "https://example.invalid/byid",
    records_inserted: 213,
  });
  const found = await runtime.importSources.getImportBatchById(id);
  assert.equal(found.slug, "manual-byid");
  assert.equal(found.sourceName, "By-id dataset");
  assert.equal(found.license, "CC BY 3.0 IT");
  assert.equal(found.licenseUrl, "https://example.invalid/licenses/cc-by-3-it");
  assert.equal(found.recordsInserted, 213);

  const missing = await runtime.importSources.getImportBatchById(999_999);
  assert.equal(missing, null);
});

test("getCommunityRecordById: attaches importBatch for an imported row, null for a community report", async () => {
  const importedId = (
    await db
      .prepare("SELECT id FROM cameras WHERE source = 'import:fixture' ORDER BY id LIMIT 1")
      .first()
  ).id;
  const imported = await runtime.cameras.getCommunityRecordById(importedId);
  assert.ok(imported, "the imported row resolves as a public record");
  assert.equal(imported.source, "import:fixture");
  assert.ok(imported.importBatch, "imported rows carry the provenance payload");
  assert.equal(imported.importBatch.sourceName, "Fixture Open Data (test)");
  assert.equal(imported.importBatch.sourceUrl, "https://example.invalid/fixture");
  assert.equal(imported.importBatch.license, "ODbL 1.0");
  assert.equal(imported.importBatch.licenseUrl, "https://opendatacommons.org/licenses/odbl/1-0/");
  assert.equal(imported.lastVerifiedAt, null, "imported rows stay 'never confirmed' (ADR 0021 §9.1)");

  const communityId = await insertCommunityCamera();
  const community = await runtime.cameras.getCommunityRecordById(communityId);
  assert.equal(community.importBatch, null, "community reports carry no import provenance");
});
