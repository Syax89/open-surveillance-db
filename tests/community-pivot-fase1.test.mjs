// ADR 0021 community-driven pivot — FASE 1 DB (kanban t_4a7469bb):
// schema + data-migration + GDPR-erasure tests for migrations 0036-0039.
//
// Runs against the REAL migration files on a fresh in-memory SQLite (same
// harness as the db-runtime suites): the schema is exactly what
// `wrangler d1 migrations apply` produces, and migration 0039 is replayed
// over seeded LEGACY data (statuses, confirmations, appeals, queue,
// moderation decisions) to pin the mapping rules of the ADR's data
// migration plan:
//
//   - pending|verified|needs_review|stale -> active, rejected -> removed;
//   - one public `migration` event per affected record ({from, to}) plus the
//     internal moderation_events audit rows;
//   - camera_confirmations -> camera_community_actions (action_type
//     'confirm', weight = trust-level weight AT MIGRATION TIME) and the old
//     table is dropped;
//   - pending appeals -> dismissed, open queue rows -> closed, both with
//     migration events (history preserved, nothing deleted);
//   - public-history backfill from moderation_events (approve -> published,
//     reject -> removed, hide -> hidden admin-legal) WITHOUT attribution;
//   - community_settings seeded with the ADR 0021 §5 defaults and the code
//     fallback (db/community-settings.ts) agreeing with the seed;
//   - eraseContributor (GDPR art. 17, ADR 0021 §13.1) hard-deletes the
//     contributor's community actions.
//
// No personal data: all fixtures are fictional.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRIZZLE_DIR = path.join(root, "drizzle");
const NOW = "2026-08-01T12:00:00.000Z";
const MIGRATION_TS = "2026-08-04T00:00:00.000Z";

let runtime;
let db;

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  runtime.env.DB = db;
});

after(async () => cleanupDbRuntime());

/** Applies the real migration files with index in [fromIdx, toIdx] (wrangler order). */
async function applyMigrationsRange(db, fromIdx, toIdx) {
  const files = (await readdir(DRIZZLE_DIR))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  for (const file of files) {
    const idx = Number(file.slice(0, 4));
    if (idx < fromIdx || idx > toIdx) continue;
    db.exec(await readFile(path.join(DRIZZLE_DIR, file), "utf8"));
  }
}

/** Applies the real migration files with index <= maxIdx (wrangler order). */
async function applyMigrationsUpTo(db, maxIdx) {
  await applyMigrationsRange(db, 0, maxIdx);
}

async function insertContributor(overrides = {}) {
  const result = await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, NULL, 'pbkdf2$test$fixture', ?, ?) RETURNING id")
    .bind(`pivot-${overrides.id ?? Math.random()}@osdb.test`, NOW, NOW)
    .first();
  return result.id;
}

async function insertCamera(overrides = {}) {
  const row = {
    title: "Pivot camera",
    kind: "Fixed dome",
    status: "active",
    source: "test",
    updated: "Test update",
    description: "",
    latitude: 44.1,
    longitude: 12.2,
    reviewIntervalMonths: 12,
    contributorId: null,
    createdAt: NOW,
    ...overrides,
  };
  const result = await db
    .prepare(
      `INSERT INTO cameras (title, kind, status, source, updated, description, latitude, longitude, review_interval_months, contributor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(row.title, row.kind, row.status, row.source, row.updated, row.description, row.latitude, row.longitude, row.reviewIntervalMonths, row.contributorId, row.createdAt)
    .first();
  return result.id;
}

async function insertLegacyConfirmation(cameraId, contributorId, createdAt) {
  await db
    .prepare("INSERT INTO camera_confirmations (camera_id, contributor_id, created_at) VALUES (?, ?, ?)")
    .bind(cameraId, contributorId, createdAt)
    .run();
}

// ---------------------------------------------------------------------------
// 1. Schema: tables, UNIQUE, CHECK, settings seed
// ---------------------------------------------------------------------------

test("0036-0038 schema: new tables exist, camera_confirmations is gone, UNIQUE + CHECK enforced", async () => {
  await applyMigrationsUpTo(db, 39);

  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map((r) => r.name);
  assert.ok(tables.includes("camera_community_actions"), "camera_community_actions must exist");
  assert.ok(tables.includes("community_settings"), "community_settings must exist");
  assert.ok(tables.includes("camera_lifecycle_events"), "camera_lifecycle_events must exist");
  assert.ok(!tables.includes("camera_confirmations"), "camera_confirmations must be dropped by 0039");

  // One active action per (record, contributor): a second row of ANY type
  // must trip the UNIQUE constraint (ADR 0021 §3 structural anti-gaming).
  await insertCamera({ id: 1 });
  await insertContributor({ id: 1 });
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (1, 1, 'confirm', 1, ?, ?)")
    .bind(NOW, NOW)
    .run();
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (1, 1, 'like', 1, ?, ?)")
        .bind(NOW, NOW)
        .run(),
    /UNIQUE/i,
    "a second action for the same pair must be rejected at the SQL level",
  );

  // The five-type whitelist is a CHECK constraint (ADR 0021 §3).
  await insertCamera({ id: 2 });
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (2, 1, 'bogus', 1, ?, ?)")
        .bind(NOW, NOW)
        .run(),
    /CHECK/i,
    "an action_type outside like/confirm/gone/problem/privacy must be rejected",
  );

  // Public lifecycle history carries NO attribution (ADR 0021 §7.2).
  const eventColumns = (await db.prepare("PRAGMA table_info(camera_lifecycle_events)").all()).results.map((r) => r.name);
  for (const forbidden of ["actor", "contributor_id", "email"]) {
    assert.ok(!eventColumns.includes(forbidden), `camera_lifecycle_events must never carry ${forbidden}`);
  }
});

test("0037 seed: community_settings carries the ADR defaults and agrees with the code fallback", async () => {
  await applyMigrationsUpTo(db, 39);
  const rows = await db.prepare("SELECT key, value AS value FROM community_settings").all();
  const seeded = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
  const expected = runtime.communitySettings.DEFAULT_COMMUNITY_SETTINGS;
  assert.equal(rows.results.length, Object.keys(expected).length, "seed row count must match the code defaults");
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(key in seeded, `seeded key ${key} must exist`);
    assert.deepEqual(JSON.parse(seeded[key]), value, `seeded ${key} must equal the code default`);
  }
  // The read path merges DB over defaults; a deleted row falls back.
  const merged = await runtime.communitySettings.getCommunitySettings();
  assert.equal(merged["thresholds.gone"], 3);
  await db.prepare("DELETE FROM community_settings WHERE key = 'thresholds.gone'").run();
  const afterDelete = await runtime.communitySettings.getCommunitySettings();
  assert.equal(afterDelete["thresholds.gone"], 3, "missing row must fall back to the code default");
  assert.deepEqual(afterDelete["weights.byLevel"], { L0: 0.25, L1: 1, L2: 2, L3: 3, L4: 5 });
});

// ---------------------------------------------------------------------------
// 2. Data migration 0039 over legacy data
// ---------------------------------------------------------------------------

test("0039: status map + migration events + internal audit rows", async () => {
  await applyMigrationsUpTo(db, 38);
  const ids = {};
  for (const status of ["pending", "verified", "needs_review", "stale", "rejected", "removed", "demo"]) {
    ids[status] = await insertCamera({ title: `Legacy ${status}`, status });
  }
  await applyMigrationsRange(db, 39, 39);

  const byTitle = async (title) =>
    (await db.prepare("SELECT status FROM cameras WHERE title = ?").bind(title).first()).status;
  assert.equal(await byTitle("Legacy pending"), "active", "pending publishes retroactively");
  assert.equal(await byTitle("Legacy verified"), "active", "verified is a straight rename to active");
  assert.equal(await byTitle("Legacy needs_review"), "active", "needs_review re-enters the public surface");
  assert.equal(await byTitle("Legacy stale"), "active", "stale re-enters the public surface");
  assert.equal(await byTitle("Legacy rejected"), "removed", "rejected becomes reversible removed");
  assert.equal(await byTitle("Legacy removed"), "removed", "removed is untouched");
  assert.equal(await byTitle("Legacy demo"), "demo", "demo is untouched");

  // One public migration event per affected record with {from, to}.
  const events = await db
    .prepare("SELECT camera_id AS cameraId, event_type AS eventType, detail AS detail FROM camera_lifecycle_events WHERE event_type = 'migration' ORDER BY camera_id")
    .all();
  assert.equal(events.results.length, 5, "exactly the five changed records get a migration event");
  const pendingEvent = events.results.find((e) => e.cameraId === ids.pending);
  assert.deepEqual(JSON.parse(pendingEvent.detail), { from: "pending", to: "active" });
  const rejectedEvent = events.results.find((e) => e.cameraId === ids.rejected);
  assert.deepEqual(JSON.parse(rejectedEvent.detail), { from: "rejected", to: "removed" });

  // Equivalent internal audit rows (append-only trail keeps full attribution
  // internally; the public projection carries none).
  const audit = await db
    .prepare("SELECT entity_id AS entityId, previous_status AS prev, new_status AS next, action AS action, actor AS actor FROM moderation_events WHERE action = 'migration' ORDER BY entity_id")
    .all();
  assert.equal(audit.results.length, 5);
  assert.deepEqual(audit.results[0], { entityId: ids.pending, prev: "pending", next: "active", action: "migration", actor: "migration" });
  for (const row of audit.results) assert.equal(row.actor, "migration", "migration audit rows are system-attributed");
});

test("0039: confirmations -> actions with weight snapshot, then camera_confirmations dropped", async () => {
  await applyMigrationsUpTo(db, 38);

  // Contributors with different trust levels AT MIGRATION TIME:
  //  - c0: no own records           -> L0, weight 0.25
  //  - c1: 1 own active record      -> L1, weight 1
  //  - c2: 6 own active records     -> L2, weight 2
  const c0 = await insertContributor({ id: 1 });
  const c1 = await insertContributor({ id: 2 });
  const c2 = await insertContributor({ id: 3 });
  await insertCamera({ contributorId: c1, status: "active" }); // -> active
  for (let i = 0; i < 6; i += 1) await insertCamera({ contributorId: c2, status: "pending" }); // -> active

  const t1 = await insertCamera({ id: 100, title: "Target 1" });
  const t2 = await insertCamera({ id: 101, title: "Target 2" });
  await insertLegacyConfirmation(t1, c0, "2026-07-01T00:00:00.000Z");
  await insertLegacyConfirmation(t1, c1, "2026-07-02T00:00:00.000Z");
  await insertLegacyConfirmation(t2, c2, "2026-07-03T00:00:00.000Z");

  await applyMigrationsRange(db, 39, 39);

  const actions = await db
    .prepare("SELECT camera_id AS cameraId, contributor_id AS contributorId, action_type AS actionType, weight AS weight FROM camera_community_actions ORDER BY camera_id, contributor_id")
    .all();
  assert.deepEqual(
    actions.results.map((r) => [r.cameraId, r.contributorId, r.actionType, r.weight]),
    [
      [t1, c0, "confirm", 0.25],
      [t1, c1, "confirm", 1],
      [t2, c2, "confirm", 2],
    ],
    "every confirmation becomes a confirm action with the trust-level weight snapshot",
  );

  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map((r) => r.name);
  assert.ok(!tables.includes("camera_confirmations"), "camera_confirmations is dropped after the copy");
});

test("0039: pending appeals and open queue rows close with migration events, history preserved", async () => {
  await applyMigrationsUpTo(db, 38);

  const cam = await insertCamera({ id: 200, title: "Appealed camera" });
  // Capture the real id: migration 0017 deletes the demo users, but the
  // AUTOINCREMENT sequence keeps counting, so the first fresh user is NOT
  // necessarily id 1 (the appeals FK is on users.id — hardcoding 1 breaks).
  const appellant = await db
    .prepare("INSERT INTO users (email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES (?, 'Appellant', 'contributor', 1, 0, ?, ?) RETURNING id")
    .bind("appellant@osdb.test", NOW, NOW)
    .first();
  // A real decision event to link the appeal (the 0033 partial UNIQUE index
  // requires one pending appeal per decision).
  await db
    .prepare("INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, actor, created_at) VALUES ('camera', ?, 'pending', 'rejected', 'reject', 'not-present', 'reviewer', ?)")
    .bind(cam, "2026-07-10T00:00:00.000Z")
    .run();
  const decision = await db.prepare("SELECT id FROM moderation_events WHERE action = 'reject'").first();
  await db
    .prepare("INSERT INTO moderation_appeals (entity, entity_id, decision_event_id, appellant_id, reason, status, created_at) VALUES ('camera', ?, ?, ?, 'It is there', 'pending', ?)")
    .bind(cam, decision.id, appellant.id, "2026-07-11T00:00:00.000Z")
    .run();
  await db
    .prepare("INSERT INTO moderation_queue (entity, entity_id, state, created_at, updated_at) VALUES ('camera', ?, 'queued', ?, ?)")
    .bind(cam, "2026-07-12T00:00:00.000Z", "2026-07-12T00:00:00.000Z")
    .run();

  await applyMigrationsRange(db, 39, 39);

  const appeal = await db.prepare("SELECT status AS status, decided_at AS decidedAt FROM moderation_appeals").first();
  assert.equal(appeal.status, "dismissed", "pending appeals close by migration (contrary consensus replaces the flow)");
  assert.equal(appeal.decidedAt, MIGRATION_TS);
  const appealRows = await db.prepare("SELECT COUNT(*) AS n FROM moderation_appeals").first();
  assert.equal(Number(appealRows.n), 1, "appeal rows are preserved, nothing is deleted");

  const queue = await db.prepare("SELECT state AS state FROM moderation_queue").first();
  assert.equal(queue.state, "closed", "open queue rows close by migration");
  const queueRows = await db.prepare("SELECT COUNT(*) AS n FROM moderation_queue").first();
  assert.equal(Number(queueRows.n), 1, "queue rows are preserved");

  // Both close actions left a public migration event on the record.
  const closeEvents = await db
    .prepare("SELECT detail AS detail FROM camera_lifecycle_events WHERE camera_id = ? AND event_type = 'migration'")
    .bind(cam)
    .all();
  const details = closeEvents.results.map((r) => JSON.parse(r.detail));
  assert.ok(details.some((d) => d.appeal === "closed-by-migration"), "appeal closure is in the public history");
  assert.ok(details.some((d) => d.queue === "closed-by-migration"), "queue closure is in the public history");
});

test("0039: public-history backfill from moderation_events, no attribution", async () => {
  await applyMigrationsUpTo(db, 38);

  const cam = await insertCamera({ id: 300, title: "Backfilled camera" });
  const decisions = [
    { action: "approve", prev: "pending", next: "verified", ts: "2026-06-01T00:00:00.000Z", expected: "published" },
    { action: "reject", prev: "pending", next: "rejected", ts: "2026-06-02T00:00:00.000Z", expected: "removed" },
    { action: "hide", prev: "verified", next: "removed", ts: "2026-06-03T00:00:00.000Z", expected: "hidden" },
  ];
  for (const d of decisions) {
    await db
      .prepare("INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, actor, created_at) VALUES ('camera', ?, ?, ?, ?, 'reason-code', 'reviewer', ?)")
      .bind(cam, d.prev, d.next, d.action, d.ts)
      .run();
  }

  await applyMigrationsRange(db, 39, 39);

  const events = await db
    .prepare("SELECT event_type AS eventType, detail AS detail, created_at AS createdAt FROM camera_lifecycle_events WHERE camera_id = ? ORDER BY created_at")
    .bind(cam)
    .all();
  const byCreated = Object.fromEntries(events.results.map((e) => [e.createdAt, e]));
  assert.equal(byCreated["2026-06-01T00:00:00.000Z"].eventType, "published", "approve backfills as published");
  assert.equal(byCreated["2026-06-02T00:00:00.000Z"].eventType, "removed", "reject backfills as removed");
  assert.equal(byCreated["2026-06-03T00:00:00.000Z"].eventType, "hidden", "hide backfills as hidden");
  const hiddenDetail = JSON.parse(byCreated["2026-06-03T00:00:00.000Z"].detail);
  assert.equal(hiddenDetail.reason, "admin-legal", "the hide reason is the residual admin-legal one");
  assert.equal("actor" in byCreated["2026-06-01T00:00:00.000Z"], false, "no attribution ever crosses into the public history");
  // The old reviewer identity must not appear anywhere in the payloads.
  const payload = JSON.stringify(events.results);
  assert.ok(!payload.includes("reviewer"), "the internal actor name must not leak into the public history");
});

// ---------------------------------------------------------------------------
// 3. Erasure (GDPR art. 17, ADR 0021 §13.1)
// ---------------------------------------------------------------------------

test("eraseContributor deletes the contributor's community actions of every type", async () => {
  await applyMigrationsUpTo(db, 39);

  const erased = await insertContributor({ id: 50 });
  const other = await insertContributor({ id: 51 });
  // One active action per (record, contributor) — different cameras so the
  // UNIQUE (camera_id, contributor_id) lets the erased account hold three
  // actions of three types (ADR 0021 §3 structural constraint).
  const camA = await insertCamera({ id: 400, title: "Erasure A" });
  const camB = await insertCamera({ id: 401, title: "Erasure B" });
  const camC = await insertCamera({ id: 402, title: "Erasure C" });
  for (const [cameraId, type, weight] of [
    [camA, "confirm", 1],
    [camB, "gone", 0.25],
    [camC, "like", 2],
  ]) {
    await db
      .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(cameraId, erased, type, weight, NOW, NOW)
      .run();
  }
  // A foreign action on the same record must survive.
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'confirm', 1, ?, ?)")
    .bind(camA, other, NOW, NOW)
    .run();

  const result = await runtime.auth.eraseContributor(erased);
  assert.equal(result.deleted, true);
  assert.equal(result.deletedConfirmations, 3, "every action row of the erased account is hard-deleted");

  const mine = await db.prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE contributor_id = ?").bind(erased).first();
  assert.equal(Number(mine.n), 0, "no action of the erased contributor survives");
  const theirs = await db.prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE contributor_id = ?").bind(other).first();
  assert.equal(Number(theirs.n), 1, "other contributors' actions are untouched");
});
