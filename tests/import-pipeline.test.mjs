// Import pipeline FASE A tests (kanban t_6030d390 —
// docs/data-sources/normalizzazione-pipeline.md).
//
// Exercises the FASE A infrastructure END-TO-END against the REAL migration
// SQL on an in-memory D1 adapter (same harness as tests/db-camera-edits):
//
//   - dedup Pass 1 (intra-source) + Pass 2 (cross-source: community reports
//     AND previous imports, hidden/removed collisions → review);
//   - idempotency: apply → re-run aborts without --force; --force never
//     duplicates (the partial UNIQUE (source, external_id) is the key);
//   - state semantics: imported rows are born `active` with
//     `last_verified_at = NULL` ("never confirmed", ADR 0021 §9.1) and
//     `source = 'import:<slug>'`, one public `imported` lifecycle event;
//   - rollback: removes ONLY the batch's own rows (events + actions
//     cascaded), never community data, writes the internal
//     `moderation_events` audit row, marks the batch `rolled_back`;
//   - GDPR-neutral: the runner ingests only the camera-metadata whitelist;
//     `notes` is a deterministic provenance string, never source free text;
//     imported rows carry no contributor id.
//
// Plus the parity test the text-similarity mirror promises: the import
// runner reuses the project's duplicate-detection math, so the .mjs mirror
// must return IDENTICAL results to the transpiled app/lib/duplicate-
// detection.ts on a corpus of pairs — drift is a test failure.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
} from "./helpers/db-runtime-harness.mjs";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";
import { runImport } from "../scripts/import/runner.mjs";
import { rollbackImport } from "../scripts/import/rollback.mjs";
import { pass1IntraSource, pass2CrossSource } from "../scripts/import/dedup.mjs";
import { textSimilarity as mirrorSimilarity } from "../scripts/import/text-similarity.mjs";

// ------------------------------------------------------------------ helpers

const FIXTURE_DESCRIPTOR = {
  slug: "fixture",
  source_name: "Fixture Open Data (test)",
  format: "geojson",
  license: "ODbL 1.0",
  license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
  source_url: "https://example.invalid/fixture",
  attribution_text: "© Fixture",
  external_id_prefix: "fix:",
};

// Raw fixture rows in the common field names the fixture adapter reads
// (name/kind/latitude/longitude/...); external ids are source-native.
const RAW_ROWS = [
  { name: "CAM A", kind: "dome", latitude: 45.1, longitude: 9.1, direction: "120", external_id: "a1", address: "Via Roma 1, Milano" },
  { name: "CAM B", kind: "ptz", latitude: 45.2, longitude: 9.2, direction: "200", external_id: "b1", address: "Via Verdi 2, Milano" },
  { name: "CAM C", kind: "bullet", latitude: 45.3, longitude: 9.3, direction: null, external_id: "c1" },
];

let db;

async function freshDb() {
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  return db;
}

async function insertCommunityCamera(overrides = {}) {
  const row = {
    title: "Community report cam",
    kind: "Bullet",
    manufacturer: null,
    observedOn: null,
    publishManufacturer: 0,
    publishObservedOn: 0,
    address: null,
    notes: "",
    latitude: 45.0,
    longitude: 9.0,
    direction: null,
    status: "active",
    source: "Community report",
    updated: "2026-08-01T00:00:00.000Z",
    description: "",
    lastVerifiedAt: null,
    reviewDueAt: null,
    reviewIntervalMonths: 12,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  return (
    await db
      .prepare(
        `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, direction, status, source, updated, description, last_verified_at, review_due_at, review_interval_months, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        row.title, row.kind, row.manufacturer, row.observedOn, row.publishManufacturer,
        row.publishObservedOn, row.address, row.notes, row.latitude, row.longitude,
        row.direction, row.status, row.source, row.updated, row.description,
        row.lastVerifiedAt, row.reviewDueAt, row.reviewIntervalMonths, row.createdAt,
      )
      .first()
  ).id;
}

async function applyFixture(options = {}) {
  return runImport(db, {
    slug: "fixture",
    descriptor: FIXTURE_DESCRIPTOR,
    payload: RAW_ROWS,
    options: { apply: true, ...options },
  });
}

before(async () => {
  await freshDb();
});

after(async () => cleanupDbRuntime());

// ------------------------------------------------------- dedup Pass 1 (pure)

test("pass1: same snap cell + same kind keeps the most complete row", () => {
  const a = { external_id: "x1", title: "A", kind: "Bullet", latitude: 45.123456, longitude: 9.123456, address: "Via 1", direction: 90 };
  const b = { external_id: "x2", title: "B", kind: "Bullet", latitude: 45.123456, longitude: 9.123456 }; // less complete
  const { kept, skipped } = pass1IntraSource([a, b]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].external_id, "x1"); // the complete one wins
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].row.external_id, "x2");
  assert.match(skipped[0].reason, /intra-source duplicate/);
});

test("pass1: external_id duplicates keep the first", () => {
  const a = { external_id: "same", title: "A", kind: "Bullet", latitude: 45.1, longitude: 9.1 };
  const b = { external_id: "same", title: "B", kind: "Bullet", latitude: 45.9, longitude: 9.9 };
  const { kept, skipped } = pass1IntraSource([a, b]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].external_id, "same");
  assert.equal(skipped[0].reason, "external_id duplicate");
});

test("pass1: same cell + different kind keeps both (real-world pole)", () => {
  const dome = { external_id: "d1", title: "Dome", kind: "Fixed dome", latitude: 45.123456, longitude: 9.123456 };
  const alpr = { external_id: "d2", title: "ALPR", kind: "Traffic / licence plate reader", latitude: 45.123456, longitude: 9.123456 };
  const { kept, skipped } = pass1IntraSource([dome, alpr]);
  assert.equal(kept.length, 2);
  assert.equal(skipped.length, 0);
});

// ---------------------------------------------------- dedup Pass 2 (injected)

test("pass2: <10m same kind → skip (auto-duplicate)", async () => {
  const candidate = { id: 7, title: "Community report cam", kind: "Bullet", address: null, latitude: 45.1, longitude: 9.1, status: "active" };
  const staged = { external_id: "fix:a1", title: "CAM A", kind: "Bullet", latitude: 45.10005, longitude: 9.10005 };
  const { inserts, skips, reviews } = await pass2CrossSource([staged], () => [candidate]);
  assert.equal(inserts.length, 0);
  assert.equal(reviews.length, 0);
  assert.equal(skips.length, 1);
  assert.match(skips[0].reason, /duplicate within 10 m/);
});

test("pass2: <10m different kind → review (never auto-skip a mixed pole)", async () => {
  const candidate = { id: 7, title: "Community report cam", kind: "Bullet", address: null, latitude: 45.1, longitude: 9.1, status: "active" };
  const staged = { external_id: "fix:a1", title: "CAM A", kind: "Fixed dome", latitude: 45.10005, longitude: 9.10005 };
  const { inserts, skips, reviews } = await pass2CrossSource([staged], () => [candidate]);
  assert.equal(inserts.length, 0);
  assert.equal(skips.length, 0);
  assert.equal(reviews.length, 1);
  assert.match(reviews[0].reason, /different kind/);
});

test("pass2: hidden/removed collision → review (never resurrect)", async () => {
  const hidden = { id: 9, title: "Withdrawn cam", kind: "Bullet", address: null, latitude: 45.1, longitude: 9.1, status: "removed" };
  const staged = { external_id: "fix:a1", title: "CAM A", kind: "Bullet", latitude: 45.10005, longitude: 9.10005 };
  const { inserts, skips, reviews } = await pass2CrossSource([staged], () => [hidden]);
  assert.equal(inserts.length, 0);
  assert.equal(skips.length, 0);
  assert.equal(reviews.length, 1);
  assert.match(reviews[0].reason, /hidden\/removed/);
});

test("pass2: 10-75m with matching text (≥0.6) → skip", async () => {
  const candidate = { id: 7, title: "Videosorveglianza Piazza Garibaldi", kind: "Bullet", address: null, latitude: 45.1, longitude: 9.1006, status: "active" };
  const staged = { external_id: "fix:a1", title: "Videosorveglianza Piazza Garibaldi", kind: "Bullet", latitude: 45.10005, longitude: 9.10005 };
  const { inserts, skips, reviews } = await pass2CrossSource([staged], () => [candidate]);
  assert.equal(inserts.length, 0);
  assert.equal(reviews.length, 0);
  assert.equal(skips.length, 1);
  assert.match(skips[0].reason, /75 m/);
});

test("pass2: far (>200m) → insert", async () => {
  const candidate = { id: 7, title: "Community report cam", kind: "Bullet", address: null, latitude: 45.0, longitude: 9.0, status: "active" };
  const staged = { external_id: "fix:a1", title: "CAM A", kind: "Bullet", latitude: 45.5, longitude: 9.5 };
  const { inserts, skips, reviews } = await pass2CrossSource([staged], () => [candidate]);
  assert.equal(inserts.length, 1);
  assert.equal(skips.length, 0);
  assert.equal(reviews.length, 0);
});

// -------------------------------------------------- end-to-end: apply (run 1)

test("apply: imported rows are active, never-confirmed, import:<slug>, with events", async () => {
  const summary = await applyFixture();

  assert.equal(summary.committed, true);
  assert.equal(summary.dryRun, false);
  assert.equal(summary.counts.inserted, 3);
  assert.equal(summary.counts.total, 3);

  const rows = (await db.prepare("SELECT * FROM cameras WHERE source = 'import:fixture'").all()).results;
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.status, "active"); // D1
    assert.equal(row.last_verified_at, null); // never confirmed (ADR 0021 §9.1)
    assert.equal(row.source, "import:fixture");
    assert.equal(row.contributor_id, null); // imports are not community submissions
    assert.ok(row.external_id); // idempotency key set
    assert.ok(row.import_batch_id); // rollback handle set
    assert.match(row.notes, /^Imported from Fixture Open Data \(test\), batch fixture$/); // deterministic, no PII
  }

  // Public lifecycle event per inserted row (provenance without attribution).
  const events = (await db.prepare("SELECT * FROM camera_lifecycle_events WHERE event_type = 'imported'").all()).results;
  assert.equal(events.length, 3);
  for (const event of events) {
    const detail = JSON.parse(event.detail);
    assert.equal(detail.batch, "fixture");
    assert.ok(detail.external_id);
  }

  // Batch row committed with counters.
  const batch = await db.prepare("SELECT * FROM import_batches WHERE slug = 'fixture'").first();
  assert.equal(batch.status, "committed");
  assert.equal(batch.records_total, 3);
  assert.equal(batch.records_inserted, 3);
  assert.equal(batch.records_skipped_duplicate, 0);
  assert.equal(batch.records_review, 0);
  assert.equal(batch.records_invalid, 0);
  assert.equal(batch.source_name, "Fixture Open Data (test)");
  assert.equal(batch.license, "ODbL 1.0");
  assert.ok(batch.source_checksum); // sha256 reproducibility gate
  assert.ok(batch.import_date);
});

// -------------------------------------------------- idempotency (re-run)

test("idempotency: re-run without --force aborts (batch committed)", async () => {
  await assert.rejects(
    () => applyFixture(),
    /already committed/,
  );
  // Nothing duplicated.
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM cameras WHERE source = 'import:fixture'").all()).results[0].n;
  assert.equal(n, 3);
});

test("idempotency: --force re-run never duplicates, counts as idempotent skip", async () => {
  const summary = await applyFixture({ force: true });
  assert.equal(summary.counts.inserted, 0);
  assert.equal(summary.counts.skippedDuplicate, 3); // idempotent re-run skip
  assert.equal(summary.counts.total, 3);
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM cameras WHERE source = 'import:fixture'").all()).results[0].n;
  assert.equal(n, 3);
  const batch = await db.prepare("SELECT * FROM import_batches WHERE slug = 'fixture'").first();
  assert.equal(batch.status, "committed");
  assert.equal(batch.records_inserted, 0);
});

// ------------------------------------- end-to-end: dedup vs community report

test("dedup: an import row <10m from an active community report is skipped", async () => {
  await freshDb(); // isolated DB for this scenario
  await insertCommunityCamera({
    title: "Videosorveglianza Stazione Centrale",
    kind: "Bullet",
    latitude: 45.1,
    longitude: 9.1,
  });
  const summary = await runImport(db, {
    slug: "fixture",
    descriptor: FIXTURE_DESCRIPTOR,
    payload: [{ name: "Videosorveglianza Stazione Centrale", kind: "bullet", latitude: 45.10002, longitude: 9.10002, external_id: "staz1" }],
    options: { apply: true },
  });
  assert.equal(summary.counts.inserted, 0);
  assert.equal(summary.counts.skippedDuplicate, 1);
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM cameras WHERE source = 'import:fixture'").all()).results[0].n;
  assert.equal(n, 0);
  // The community report is untouched and still wins.
  const report = await db.prepare("SELECT status, last_verified_at, source FROM cameras WHERE title = 'Videosorveglianza Stazione Centrale' AND source = 'Community report'").first();
  assert.equal(report.status, "active");
  assert.equal(report.last_verified_at, null);
});

// ---------------------------------------------------------------- rollback

test("rollback: removes only the batch rows, cascades events, never community data", async () => {
  await freshDb();
  // Community data present before the import.
  const communityId = await insertCommunityCamera({ title: "Community keeps this", latitude: 44.0, longitude: 8.0 });
  await applyFixture();

  const result = await rollbackImport(db, "fixture");
  assert.equal(result.removedCameras, 3);
  assert.equal(result.eventsRemoved, 3); // imported lifecycle events cascaded
  assert.equal(result.actionsRemoved, 0);

  // Batch rows gone; community row untouched.
  const imported = (await db.prepare("SELECT COUNT(*) AS n FROM cameras WHERE source = 'import:fixture'").all()).results[0].n;
  assert.equal(imported, 0);
  const community = await db.prepare("SELECT id, title, status FROM cameras WHERE id = ?").bind(communityId).first();
  assert.equal(community.title, "Community keeps this");
  assert.equal(community.status, "active");

  // No dangling lifecycle events.
  const events = (await db.prepare("SELECT COUNT(*) AS n FROM camera_lifecycle_events").all()).results[0].n;
  assert.equal(events, 0);

  // Batch row survives with rolled_back status (attribution history).
  const batch = await db.prepare("SELECT * FROM import_batches WHERE slug = 'fixture'").first();
  assert.equal(batch.status, "rolled_back");

  // Internal audit row (append-only moderation_events).
  const audit = await db.prepare("SELECT * FROM moderation_events WHERE action = 'import-rollback'").first();
  assert.ok(audit);
  assert.equal(audit.actor, "import-runner");
  assert.equal(audit.previous_status, "committed");
  assert.equal(audit.new_status, "rolled_back");
});

test("rollback: abort unless the batch is committed (running/failed/rolled_back)", async () => {
  await freshDb();
  await applyFixture();
  await rollbackImport(db, "fixture");
  await assert.rejects(() => rollbackImport(db, "fixture"), /expected 'committed'/);
  await assert.rejects(() => rollbackImport(db, "nope"), /not found/);
});

// -------------------------------------------------- GDPR-neutral guarantees

test("GDPR: PII-like source fields never reach the database", async () => {
  await freshDb();
  const payload = [
    {
      name: "CAM PII",
      kind: "ptz",
      latitude: 46.0,
      longitude: 10.0,
      external_id: "pii1",
      // Person-ish fields the whitelist must drop:
      email: "mario.rossi@example.org",
      phone: "+39 333 1234567",
      operator: "Mario Rossi",
      note_libre: "gestore: Mario Rossi, tel 3331234567",
    },
  ];
  const summary = await runImport(db, {
    slug: "fixture",
    descriptor: FIXTURE_DESCRIPTOR,
    payload,
    options: { apply: true },
  });
  assert.equal(summary.counts.inserted, 1);
  const row = await db.prepare("SELECT * FROM cameras WHERE source = 'import:fixture'").first();
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes("mario.rossi@example.org"), false);
  assert.equal(serialized.includes("333"), false);
  assert.equal(serialized.includes("Mario Rossi"), false);
  // notes is the deterministic provenance string, never the free source text.
  assert.equal(row.notes, "Imported from Fixture Open Data (test), batch fixture");
  // The explicit source name wins; the person-name operator is NOT part of
  // the title (the PII strings above already prove it never lands anywhere).
  assert.equal(row.title, "CAM PII");
});

test("GDPR: invalid rows are counted and reported, never inserted", async () => {
  await freshDb();
  const payload = [
    ...RAW_ROWS,
    { name: "Bad lat", kind: "ptz", latitude: 91, longitude: 9.1, external_id: "bad1" },
    { name: "Origin placeholder", kind: "ptz", latitude: 0, longitude: 0, external_id: "bad2" }, // (0,0) rejected §7.1
    { name: "No coords", kind: "ptz", latitude: null, longitude: null, external_id: "bad3" },
  ];
  const summary = await runImport(db, {
    slug: "fixture",
    descriptor: FIXTURE_DESCRIPTOR,
    payload,
    options: { apply: true },
  });
  assert.equal(summary.counts.invalid, 3);
  assert.equal(summary.counts.inserted, 3);
  assert.equal(summary.report.errors.length, 3);
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM cameras WHERE source = 'import:fixture'").all()).results[0].n;
  assert.equal(n, 3);
});

test("GDPR: dry-run writes NOTHING (mandatory human gate before --apply)", async () => {
  await freshDb();
  const summary = await runImport(db, {
    slug: "fixture",
    descriptor: FIXTURE_DESCRIPTOR,
    payload: RAW_ROWS,
    options: { apply: false },
  });
  assert.equal(summary.dryRun, true);
  assert.equal(summary.committed, false);
  const batches = (await db.prepare("SELECT COUNT(*) AS n FROM import_batches").all()).results[0].n;
  assert.equal(batches, 0);
  const cams = (await db.prepare("SELECT COUNT(*) AS n FROM cameras WHERE source = 'import:fixture'").all()).results[0].n;
  assert.equal(cams, 0);
});

// ------------------------------------ parity: mirror vs duplicate-detection.ts

const dupDetectionPromise = loadLib("app/lib/duplicate-detection.mjs");

test("parity: text-similarity.mjs mirror matches duplicate-detection.ts", async () => {
  const dupTree = await dupDetectionPromise;
  const corpus = [
    ["Videosorveglianza Piazza Garibaldi", "Videosorveglianza Piazza Garibaldi"],
    ["Piazza Garibaldi camera", "Camera Piazza Garibaldi"],
    ["Corso Como angolo Via Boccaccio", "Corso Como 12"],
    ["Telecamera via Roma 1", "Videosorveglianza via Verdi 2"],
    ["", "Corso Como"],
    ["PTZ stazione", "ptz stazione"],
    ["a b c", "d e f"],
    ["Comune di Milano varchi ZTL", "Varchi ZTL Comune di Milano"],
    ["X".repeat(200), "X".repeat(200)],
  ];
  for (const [left, right] of corpus) {
    assert.equal(mirrorSimilarity(left, right), dupTree.textSimilarity(left, right), `textSimilarity mismatch on ${JSON.stringify([left, right])}`);
  }
});

after(async () => cleanupRouteTree());
