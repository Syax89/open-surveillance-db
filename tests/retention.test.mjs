// Retention sweep contract (ADR 0004 §3, ADR 0008 p.3, RETENTION_SCHEDULE.md).
//
// Runs the REAL db/retention.ts against the REAL migration SQL replayed on an
// in-memory D1 adapter (same harness as auth-d1 / db-public-contracts), with
// `now` injectable so every R1-R7 window is exercised deterministically.
//
// Coverage map (review t_91d0644f):
//   R1  pending reports hard-deleted after PENDING_RETENTION_DAYS
//   R2  rejected reports purged REJECTED_RETENTION_DAYS after the reject
//       decision, falling back to created_at for legacy rows without an event
//   R3  needs_review/stale records unverified for 6 months → `removed`
//       tombstone, with a moderation event whose previous_status is the REAL
//       prior state (regression: it was hard-coded to 'removed')
//   R4  resolved correction requests purged after CORRECTION_RETENTION_DAYS
//   R6  orphan pending photos + rejected photos removed from D1 and R2;
//       the >100-photo scenario (D1 bound-parameter cap) is a regression test
//   R7  expired / revoked sessions purged
//   atomicity: purgeCameraRecord deletes photos, queue item and camera in one
//       d1.batch (regression: photos were deleted before the batch)
//   R2/R3 photos are deleted only AFTER their D1 rows succeed (R2-first rule)

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

let runtime;

beforeEach(async () => {
  if (!runtime) runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
});

after(async () => cleanupDbRuntime());

const NOW = "2026-08-01T00:00:00.000Z";
const day = 86_400_000;
const daysBefore = (days) => new Date(Date.parse(NOW) - days * day).toISOString();

// ---------------------------------------------------------------------------
// Fixture helpers (direct SQL, mirroring what the app would have written)
// ---------------------------------------------------------------------------

async function insertCamera({ title, status, createdAt, reviewDueAt = null }) {
  await runtime.env.DB.prepare(
    `INSERT INTO cameras (title, kind, address, notes, latitude, longitude, status, source, updated, description, created_at, review_due_at)
     VALUES (?, 'Fixed dome', NULL, '', 41.9, 12.5, ?, 'test', 'test', '', ?, ?)`,
  )
    .bind(title, status, createdAt, reviewDueAt)
    .run();
  const row = await runtime.env.DB.prepare("SELECT id FROM cameras WHERE title = ?").bind(title).first();
  return row.id;
}

async function insertPhoto({ cameraId = null, status = "pending", createdAt, storageKey, redactionConfirmed = 0 }) {
  const { meta } = await runtime.env.DB.prepare(
    `INSERT INTO photos (camera_id, contributor_id, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at)
     VALUES (?, NULL, ?, 'image/jpeg', 100, 100, 1000, ?, 1, ?, ?, ?)`,
  )
    .bind(cameraId, storageKey, status, redactionConfirmed, createdAt, createdAt)
    .run();
  return meta.lastRowId;
}

async function insertRejectEvent(cameraId, createdAt) {
  const row = await runtime.env.DB.prepare(
    `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, created_at)
     VALUES ('camera', ?, 'pending', 'rejected', 'reject', 'privacy-or-safety-concern', 'test', 'Test Reviewer', ?)
     RETURNING id`,
  )
    .bind(cameraId, createdAt)
    .first();
  return row.id;
}

async function insertPhotoRejectEvent(photoId, createdAt) {
  await runtime.env.DB.prepare(
    `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, created_at)
     VALUES ('photo', ?, 'pending', 'rejected', 'reject', 'privacy-or-safety-concern', 'test', 'Test Reviewer', ?)`,
  )
    .bind(photoId, createdAt)
    .run();
}

// A resolved correction request: terminal status ('reviewed' by default) with
// the resolution timestamp the app now writes (moderateCorrection sets
// resolved_at on the approve/reject transition). Open requests pass
// status='pending' and resolvedAt=null.
async function insertCorrection({ createdAt, resolvedAt = null, status = "reviewed", outcome = "kept" }) {
  const row = await runtime.env.DB.prepare(
    `INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, outcome, resolved_at, created_at)
     VALUES (NULL, 'takedown', 'test', NULL, ?, ?, ?, ?)
     RETURNING id`,
  )
    .bind(status, outcome, resolvedAt, createdAt)
    .first();
  return row.id;
}

// An appeal against the camera's moderation decision. status mirrors the app:
// pending → upheld | dismissed | escalated. Only 'pending'/'escalated' (not
// finally decided) must block the R1/R2 purge. The appellant FK is satisfied
// with a throwaway users row (FK enforcement is ON in the D1 adapter).
async function insertAppeal({ entity = "camera", entityId, decisionEventId, status = "pending" }) {
  const user = await runtime.env.DB.prepare(
    "INSERT INTO users (email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES (?, 'Appellant', 'contributor', 1, 0, ?, ?) RETURNING id",
  )
    .bind(`appellant-${Math.random()}@example.com`, NOW, NOW)
    .first();
  await runtime.env.DB.prepare(
    `INSERT INTO moderation_appeals (entity, entity_id, decision_event_id, appellant_id, reason, status, created_at)
     VALUES (?, ?, ?, ?, 'test appeal', ?, ?)`,
  )
    .bind(entity, entityId, decisionEventId, user.id, status, NOW)
    .run();
}

// A legal-hold audit event for a camera (RETENTION_SCHEDULE.md §2 convention,
// documented at HOLD_EXCLUSION_SQL in db/retention.ts): 'legal-hold' raises
// the hold, 'legal-hold-release' lifts it. A hold never changes the record
// status, so previous_status/new_status mirror the current one.
async function insertHoldEvent(cameraId, action, createdAt, status = "rejected") {
  await runtime.env.DB.prepare(
    `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, created_at)
     VALUES ('camera', ?, ?, ?, ?, 'other', 'test hold', 'Ops', ?)`,
  )
    .bind(cameraId, status, status, action, createdAt)
    .run();
}

async function insertSession({ expiresAt, revokedAt = null }) {
  await runtime.env.DB.prepare(
    "INSERT INTO contributors (email, password_hash, created_at, updated_at) VALUES (?, 'x', ?, ?)",
  )
    .bind(`contrib-${Math.random()}@example.com`, NOW, NOW)
    .run();
  const { lastRowId } = await runtime.env.DB.prepare(
    "INSERT INTO sessions (contributor_id, token_hash, csrf_token, created_at, expires_at, revoked_at) VALUES ((SELECT id FROM contributors ORDER BY id DESC LIMIT 1), ?, 'csrf', ?, ?, ?)",
  )
    .bind(`token-${Math.random()}`, NOW, expiresAt, revokedAt)
    .run();
  return lastRowId;
}

async function count(table, where = "1=1", ...args) {
  const row = await runtime.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
    .bind(...args)
    .first();
  return row.n;
}

// A PHOTOS-bucket spy: records every key the sweep asks to delete.
function makeR2Spy() {
  const deletedKeys = [];
  const r2 = {
    delete: async (key) => {
      deletedKeys.push(key);
    },
  };
  return { r2, deletedKeys };
}

// A D1 wrapper that makes the Nth .run() of statements whose SQL contains
// `sqlSubstring` throw — simulates a transient D1 failure to prove the sweep
// isolates per record / per chunk (a failure must not abort the whole run).
function makeFailOnNthRun(db, sqlSubstring, nthRun) {
  let runCount = 0;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!sql.includes(sqlSubstring)) return statement;
      const originalRun = statement.run.bind(statement);
      statement.run = () => {
        runCount += 1;
        if (runCount === nthRun) throw new Error(`simulated D1 failure on: ${sql}`);
        return originalRun();
      };
      return statement;
    },
    batch(statements) {
      return db.batch(statements);
    },
    exec(sql) {
      return db.exec(sql);
    },
  };
}

// ---------------------------------------------------------------------------
// R1 — pending reports
// ---------------------------------------------------------------------------

test("R1: pending reports older than 90 days are hard-deleted with their photos", async () => {
  const oldId = await insertCamera({ title: "Old pending", status: "pending", createdAt: daysBefore(100) });
  const freshId = await insertCamera({ title: "Fresh pending", status: "pending", createdAt: daysBefore(10) });
  await insertPhoto({ cameraId: oldId, status: "pending", createdAt: daysBefore(100), storageKey: "old-pending.jpg" });

  const { r2, deletedKeys } = makeR2Spy();
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.pendingPurged, 1);
  assert.equal(summary.photosDeleted, 1);
  assert.equal(summary.r2ObjectsDeleted, 1);
  assert.deepEqual(deletedKeys, ["old-pending.jpg"], "the R2 object of the purged report must be deleted");
  assert.equal(await count("cameras", "id = ?", oldId), 0, "the old pending report must be gone");
  assert.equal(await count("cameras", "id = ?", freshId), 1, "a recent pending report must survive");
  assert.equal(await count("photos", "camera_id = ?", oldId), 0, "evidence must go with the record");
});

// ---------------------------------------------------------------------------
// R2 — rejected reports
// ---------------------------------------------------------------------------

test("R2: rejected reports are purged 30 days after the reject decision", async () => {
  const expired = await insertCamera({ title: "Rejected long ago", status: "rejected", createdAt: daysBefore(200) });
  const recent = await insertCamera({ title: "Rejected recently", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(expired, daysBefore(40));
  await insertRejectEvent(recent, daysBefore(10));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1, "only the rejection older than 30 days may be purged");
  assert.equal(await count("cameras", "id = ?", expired), 0);
  assert.equal(await count("cameras", "id = ?", recent), 1);
});

test("R2: legacy rejected rows without a moderation event fall back to created_at", async () => {
  const legacyExpired = await insertCamera({ title: "Legacy rejected old", status: "rejected", createdAt: daysBefore(100) });
  const legacyFresh = await insertCamera({ title: "Legacy rejected fresh", status: "rejected", createdAt: daysBefore(10) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1);
  assert.equal(await count("cameras", "id = ?", legacyExpired), 0, "legacy row without event uses created_at");
  assert.equal(await count("cameras", "id = ?", legacyFresh), 1);
});

test("R2: the purge closes open moderation_queue items atomically", async () => {
  const id = await insertCamera({ title: "Rejected with queue", status: "rejected", createdAt: daysBefore(100) });
  await insertRejectEvent(id, daysBefore(40));
  await runtime.env.DB.prepare(
    "INSERT INTO moderation_queue (entity, entity_id, state, created_at, updated_at) VALUES ('camera', ?, 'open', ?, ?)",
  )
    .bind(id, NOW, NOW)
    .run();

  await runtime.retention.runRetentionSweep(NOW);

  const leftover = await runtime.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM moderation_queue WHERE entity = 'camera' AND entity_id = ? AND state != 'closed'",
  )
    .bind(id)
    .first();
  assert.equal(leftover.n, 0, "no open queue item may survive the purge");
});

// ---------------------------------------------------------------------------
// R3 — unverified removal
// ---------------------------------------------------------------------------

test("R3: a stale record unverified for 6 months becomes a removed tombstone", async () => {
  const staleId = await insertCamera({
    title: "Stale beyond grace",
    status: "stale",
    createdAt: daysBefore(400),
    reviewDueAt: daysBefore(200),
  });
  const freshStale = await insertCamera({
    title: "Stale but recent",
    status: "stale",
    createdAt: daysBefore(400),
    reviewDueAt: daysBefore(100),
  });
  await insertPhoto({ cameraId: staleId, status: "approved", createdAt: daysBefore(400), storageKey: "stale-photo.jpg" });

  const { r2, deletedKeys } = makeR2Spy();
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.unverifiedRemoved, 1, "only the record past the 6-month removal window");
  assert.equal(await count("cameras", "id = ? AND status = 'removed'", staleId), 1, "the row stays as a tombstone");
  assert.equal(await count("cameras", "id = ?", freshStale), 1, "a record inside the window must survive");
  assert.equal(await count("photos", "camera_id = ?", staleId), 0, "evidence must be deleted with the record");
  assert.deepEqual(deletedKeys, ["stale-photo.jpg"]);
});

test("R3: the tombstone event records the REAL previous_status, never 'removed'", async () => {
  const staleId = await insertCamera({
    title: "R3 previous status",
    status: "stale",
    createdAt: daysBefore(400),
    reviewDueAt: daysBefore(200),
  });

  await runtime.retention.runRetentionSweep(NOW);

  const event = await runtime.env.DB.prepare(
    "SELECT previous_status AS previousStatus, new_status AS newStatus, action FROM moderation_events WHERE entity = 'camera' AND entity_id = ? AND action = 'removed'",
  )
    .bind(staleId)
    .first();
  assert.ok(event, "a removal event must be written");
  assert.equal(event.previousStatus, "stale", "previous_status must be the real prior state (BLOCKER 1)");
  assert.equal(event.newStatus, "removed");
  assert.notEqual(event.previousStatus, "removed", "removed -> removed would corrupt the audit trail");
});

// ---------------------------------------------------------------------------
// R4 — resolved correction requests
// ---------------------------------------------------------------------------

test("R4: resolved correction requests are purged 2 years after the RESOLUTION date", async () => {
  // Resolution 800 days ago → past the 2-year floor → purged.
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(800) });
  // Created 900 days ago but resolved only 100 days ago → still inside the
  // floor → must survive (regression: a created_at anchor purged it EARLY).
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(100) });
  // Open request: never resolved → never purged.
  await insertCorrection({ createdAt: daysBefore(900), status: "pending", resolvedAt: null, outcome: null });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1, "only the request past its resolution+2y floor");
  assert.equal(await count("correction_requests"), 2, "the recently resolved and the open request survive");
});

test("R4: rejected corrections (outcome NULL) are purged too — resolution+2y", async () => {
  // The pre-fix predicate (`outcome IS NOT NULL`) never matched rejected
  // requests (only approve sets outcome), so they accumulated forever.
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(800), status: "rejected", outcome: null });
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(100), status: "rejected", outcome: null });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1, "a rejected request is resolved: covered by the 2-year floor");
  assert.equal(await count("correction_requests"), 1, "the recently rejected request survives");
});

test("R4: legacy rows without resolved_at fall back to created_at (documented derogation)", async () => {
  // Rows resolved before migration 0018 have resolved_at = NULL (backfill
  // covers only rows with a decision event; the fixture simulates the rest).
  await insertCorrection({ createdAt: daysBefore(800), resolvedAt: null });
  await insertCorrection({ createdAt: daysBefore(100), resolvedAt: null });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1, "legacy fallback mirrors the R2/R6 pattern");
  assert.equal(await count("correction_requests"), 1);
});

test("R4: the purge ARCHIVES an audit event in the same batch as the delete", async () => {
  const id = await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(800) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1);
  const event = await runtime.env.DB.prepare(
    "SELECT entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, actor FROM moderation_events WHERE entity = 'correction' AND action = 'archive'",
  )
    .first();
  assert.ok(event, "an archive event must be written before the delete (art. 5(2))");
  assert.equal(event.entityId, id);
  assert.equal(event.previousStatus, "reviewed");
  assert.equal(event.newStatus, "archived");
  assert.equal(event.actor, "Retention sweep");
  assert.equal(await count("correction_requests", "id = ?", id), 0, "the row is deleted after archiving");
});

// ---------------------------------------------------------------------------
// Appeals / legal hold — R1/R2 purge exclusions (P1, consolidated review)
// ---------------------------------------------------------------------------

test("R2: a rejected camera with a PENDING appeal survives the purge (P1)", async () => {
  // MODERATION_SLA S5: an appeal can still be open at decision+30d (filed at
  // +29d, decided up to +14d later); purging would destroy record + evidence
  // irreversibly while the appeal is pending.
  const appealed = await insertCamera({ title: "Appealed", status: "rejected", createdAt: daysBefore(200) });
  const eventId = await insertRejectEvent(appealed, daysBefore(40));
  await insertAppeal({ entityId: appealed, decisionEventId: eventId, status: "pending" });
  const normal = await insertCamera({ title: "No appeal", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(normal, daysBefore(40));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1, "only the record without an open appeal");
  assert.equal(await count("cameras", "id = ?", appealed), 1, "the appealed record must survive");
  assert.equal(await count("cameras", "id = ?", normal), 0);
});

test("R2: an ESCALATED appeal still blocks the purge (not finally decided)", async () => {
  const escalated = await insertCamera({ title: "Appeal escalated", status: "rejected", createdAt: daysBefore(200) });
  const eventId = await insertRejectEvent(escalated, daysBefore(40));
  await insertAppeal({ entityId: escalated, decisionEventId: eventId, status: "escalated" });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 0);
  assert.equal(await count("cameras", "id = ?", escalated), 1);
});

test("R2: a finally DECIDED appeal (dismissed) does not block the purge", async () => {
  const decided = await insertCamera({ title: "Appeal dismissed", status: "rejected", createdAt: daysBefore(200) });
  const eventId = await insertRejectEvent(decided, daysBefore(40));
  await insertAppeal({ entityId: decided, decisionEventId: eventId, status: "dismissed" });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1);
  assert.equal(await count("cameras", "id = ?", decided), 0);
});

test("R2: a camera under ACTIVE legal hold survives the purge (RETENTION_SCHEDULE §2)", async () => {
  const held = await insertCamera({ title: "Legal hold", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(held, daysBefore(40));
  await insertHoldEvent(held, "legal-hold", daysBefore(20));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 0, "the hold suspends the deletion");
  assert.equal(await count("cameras", "id = ?", held), 1);
});

test("R2: a RELEASED legal hold no longer blocks the purge", async () => {
  const released = await insertCamera({ title: "Hold released", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(released, daysBefore(40));
  await insertHoldEvent(released, "legal-hold", daysBefore(60));
  await insertHoldEvent(released, "legal-hold-release", daysBefore(10));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1, "the matter is closed: the 30-day clock resumes");
  assert.equal(await count("cameras", "id = ?", released), 0);
});

test("R1: a pending camera under legal hold survives the pending purge", async () => {
  const held = await insertCamera({ title: "Pending held", status: "pending", createdAt: daysBefore(100) });
  await insertHoldEvent(held, "legal-hold", daysBefore(50), "pending");
  const normal = await insertCamera({ title: "Pending normal", status: "pending", createdAt: daysBefore(100) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.pendingPurged, 1);
  assert.equal(await count("cameras", "id = ?", held), 1, "held record survives");
  assert.equal(await count("cameras", "id = ?", normal), 0);
});

// ---------------------------------------------------------------------------
// R6 — photos
// ---------------------------------------------------------------------------

test("R6: orphan pending photos expire after 90 days; rejected photos after 30 days (R13)", async () => {
  await insertPhoto({ cameraId: null, status: "pending", createdAt: daysBefore(100), storageKey: "orphan.jpg" });
  await insertPhoto({ cameraId: null, status: "pending", createdAt: daysBefore(10), storageKey: "young-orphan.jpg" });

  // R13: the rejection decision date (entity='photo' AND action='reject')
  // anchors the 30-day clock — NOT the upload date and NOT the next sweep.
  const oldRejectedId = await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(60), storageKey: "old-rejected.jpg" });
  await insertPhotoRejectEvent(oldRejectedId, daysBefore(40));
  const recentRejectedId = await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(60), storageKey: "recent-rejected.jpg" });
  await insertPhotoRejectEvent(recentRejectedId, daysBefore(5));

  const { r2, deletedKeys } = makeR2Spy();
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.photosDeleted, 2, "orphan past 90 days + rejection past 30 days");
  assert.deepEqual(deletedKeys.sort(), ["orphan.jpg", "old-rejected.jpg"].sort());
  assert.equal(await count("photos", "storage_key = 'young-orphan.jpg'"), 1, "a pending orphan inside the window survives");
  assert.equal(await count("photos", "storage_key = 'recent-rejected.jpg'"), 1, "a rejection inside the 30-day window survives");
});

test("R6: legacy rejected photos without a moderation event fall back to created_at", async () => {
  // Rows rejected before the event trail existed (or whose event was pruned)
  // anchor the 30-day clock on created_at, mirroring the camera R2 fallback.
  await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(40), storageKey: "legacy-old.jpg" });
  await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(10), storageKey: "legacy-fresh.jpg" });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.photosDeleted, 1, "only the legacy rejection past 30 days may be purged");
  assert.equal(await count("photos", "storage_key = 'legacy-old.jpg'"), 0);
  assert.equal(await count("photos", "storage_key = 'legacy-fresh.jpg'"), 1);
});

test("R6 regression: more than 100 rejected photos are deleted in bounded chunks", async () => {
  // D1 caps bound parameters at 100 per query; a single DELETE ... IN (...)
  // with 150 ids used to throw `too many SQL variables` and leave orphaned
  // rows. The sweep must chunk the deletion (BLOCKER 2).
  for (let i = 0; i < 150; i += 1) {
    await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(40), storageKey: `rejected-${i}.jpg` });
  }

  const { r2, deletedKeys } = makeR2Spy();
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.photosDeleted, 150);
  assert.equal(await count("photos", "status = 'rejected'"), 0, "every rejected photo must be gone");
  assert.equal(deletedKeys.length, 150, "every R2 object must be requested for deletion");
});

test("R6: the sweep is idempotent — a second run deletes nothing new", async () => {
  await insertPhoto({ cameraId: null, status: "pending", createdAt: daysBefore(100), storageKey: "orphan.jpg" });
  const rejectedId = await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(60), storageKey: "rejected.jpg" });
  await insertPhotoRejectEvent(rejectedId, daysBefore(40));

  const { r2, deletedKeys } = makeR2Spy();
  const first = await runtime.retention.runRetentionSweep(NOW, { r2 });
  const second = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(first.photosDeleted, 2);
  assert.equal(second.photosDeleted, 0, "nothing is left for a second pass");
  assert.equal(await count("photos"), 0, "all eligible rows are gone after the first run");
  assert.equal(deletedKeys.length, 2, "no R2 object is deleted twice");
});

test("R6: approved + redacted photos on a verified camera are never touched", async () => {
  // R13: approved evidence on a verified camera follows the 12-month record
  // cycle (R3) and is deleted WITH the record — never by the photo sweep.
  const verified = await insertCamera({ title: "Verified camera", status: "verified", createdAt: daysBefore(200) });
  await insertPhoto({
    cameraId: verified,
    status: "approved",
    createdAt: daysBefore(100),
    storageKey: "approved.jpg",
    redactionConfirmed: 1,
  });
  await insertPhoto({
    cameraId: verified,
    status: "approved",
    createdAt: daysBefore(5),
    storageKey: "approved-fresh.jpg",
    redactionConfirmed: 1,
  });

  const { r2, deletedKeys } = makeR2Spy();
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.photosDeleted, 0, "approved evidence must not be swept while its record is verified");
  assert.equal(deletedKeys.length, 0, "no R2 object may be deleted for approved evidence");
  assert.equal(await count("photos", "storage_key = 'approved.jpg'"), 1);
  assert.equal(await count("photos", "storage_key = 'approved-fresh.jpg'"), 1);
});

test("R6 regression: a chunk DELETE failure deletes R2 per-chunk, leaking nothing (review t_eed5f080 #1)", async () => {
  // Pre-fix the sweep deleted ALL D1 chunks first and only then the R2
  // objects; a failure on chunk N leaked the objects of chunks 1..N-1 whose
  // rows were already gone. Now each chunk's R2 objects are deleted right
  // after its own D1 rows, so an early failure cannot orphan earlier chunks.
  for (let i = 0; i < 150; i += 1) {
    await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(40), storageKey: `chunk-${i}.jpg` });
  }
  // Fail the SECOND `DELETE ... WHERE id IN (...)` (the 100-row chunk is the
  // first call; the 50-row tail is the second).
  const failingDb = makeFailOnNthRun(runtime.env.DB, "DELETE FROM photos WHERE id IN", 2);
  runtime.env.DB = failingDb;

  const { r2, deletedKeys } = makeR2Spy();
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.failures, 1, "the failed chunk must be counted, not fatal");
  assert.equal(summary.photosDeleted, 100, "chunk 1 rows are gone, chunk 2 rows survive");
  assert.equal(await count("photos", "status = 'rejected'"), 50, "the failed chunk keeps its D1 rows for the next run");
  assert.equal(deletedKeys.length, 100, "exactly chunk 1's objects are deleted — nothing leaks, nothing is orphaned");
  assert.equal(summary.r2ObjectsDeleted, 100);
  assert.equal(summary.r2ObjectsFailed, 0);
  // Chunk 1's keys are the first 100 inserted (id order), chunk 2's the last 50.
  assert.deepEqual(
    [...deletedKeys].sort(),
    Array.from({ length: 100 }, (_, i) => `chunk-${i}.jpg`).sort(),
    "only the rows actually deleted from D1 have their R2 objects removed",
  );
});

test("R6: a failed chunk retries cleanly on the next run (rows + objects stay consistent)", async () => {
  for (let i = 0; i < 150; i += 1) {
    await insertPhoto({ cameraId: null, status: "rejected", createdAt: daysBefore(40), storageKey: `retry-${i}.jpg` });
  }
  const failingDb = makeFailOnNthRun(runtime.env.DB, "DELETE FROM photos WHERE id IN", 2);
  runtime.env.DB = failingDb;

  const first = await runtime.retention.runRetentionSweep(NOW, { r2: undefined });
  assert.equal(first.failures, 1);

  // Second run: the 50 surviving rows are now the only candidates; no failure.
  runtime.env.DB = failingDb; // still the same wrapper (fail only on the 2nd IN-delete)
  const second = await runtime.retention.runRetentionSweep(NOW, { r2: undefined });
  assert.equal(second.failures, 0);
  assert.equal(await count("photos"), 0, "the retry clears the leftover chunk");
});

test("R2/R3: a failing record is isolated — the sweep continues and counts it (review t_eed5f080 #2)", async () => {
  // Two expired rejected cameras; the FIRST purge (DELETE FROM cameras) fails.
  const a = await insertCamera({ title: "Rejected A", status: "rejected", createdAt: daysBefore(200) });
  const b = await insertCamera({ title: "Rejected B", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(a, daysBefore(40));
  await insertRejectEvent(b, daysBefore(40));

  const failingDb = makeFailOnNthRun(runtime.env.DB, "DELETE FROM cameras WHERE id = ?", 1);
  runtime.env.DB = failingDb;

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.failures, 1, "the failing record is counted, not fatal");
  assert.equal(summary.rejectedPurged, 1, "the other record is still purged");
  assert.equal(await count("cameras", "id = ?", a), 1, "the failing record survives for retry");
  assert.equal(await count("cameras", "id = ?", b), 0);
});

test("R6: failed R2 object deletions are reported in r2ObjectsFailed (review t_eed5f080 #5)", async () => {
  await insertPhoto({ cameraId: null, status: "pending", createdAt: daysBefore(100), storageKey: "orphan-ok.jpg" });
  await insertPhoto({ cameraId: null, status: "pending", createdAt: daysBefore(100), storageKey: "orphan-fail.jpg" });

  const r2 = {
    delete: async (key) => {
      if (key === "orphan-fail.jpg") throw new Error("bucket unavailable");
    },
  };
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.photosDeleted, 2, "D1 rows are removed regardless of bucket failures");
  assert.equal(summary.r2ObjectsDeleted, 1);
  assert.equal(summary.r2ObjectsFailed, 1, "the failed object deletion is surfaced in the summary");
});

test("R6: rejected photos are swept even when linked to a live camera; pending linked photos are not (review t_eed5f080 #8)", async () => {
  // The orphan query requires camera_id IS NULL, but the rejected query has
  // NO camera_id filter: rejected evidence is never public and expires 30
  // days after the reject decision even if the record is still alive.
  const verified = await insertCamera({ title: "Verified", status: "verified", createdAt: daysBefore(200) });
  const rejectedLinked = await insertPhoto({
    cameraId: verified,
    status: "rejected",
    createdAt: daysBefore(60),
    storageKey: "rejected-linked.jpg",
  });
  await insertPhotoRejectEvent(rejectedLinked, daysBefore(40));
  await insertPhoto({
    cameraId: verified,
    status: "pending",
    createdAt: daysBefore(100),
    storageKey: "pending-linked.jpg",
  });

  const { r2, deletedKeys } = makeR2Spy();
  const summary = await runtime.retention.runRetentionSweep(NOW, { r2 });

  assert.equal(summary.photosDeleted, 1, "only the rejected linked photo is swept");
  assert.deepEqual(deletedKeys, ["rejected-linked.jpg"]);
  assert.equal(await count("photos", "storage_key = 'pending-linked.jpg'"), 1, "pending linked evidence follows the record lifecycle");
  assert.equal(await count("photos", "storage_key = 'rejected-linked.jpg'"), 0);
  assert.equal(await count("cameras", "id = ?", verified), 1, "the verified record itself is untouched");
});

// ---------------------------------------------------------------------------
// R7 — sessions
// ---------------------------------------------------------------------------

test("R7: expired and revoked sessions are purged, live ones survive", async () => {
  await insertSession({ expiresAt: daysBefore(1) });
  await insertSession({ expiresAt: daysBefore(1), revokedAt: daysBefore(5) });
  await insertSession({ expiresAt: daysAfter(30) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.sessionsPurged, 2);
  assert.equal(await count("sessions"), 1, "the live session survives");
});

function daysAfter(days) {
  return new Date(Date.parse(NOW) + days * day).toISOString();
}

// ---------------------------------------------------------------------------
// Atomicity (MINORE 1) + D1 bound cap (BLOCKER 2) — static guarantees
// ---------------------------------------------------------------------------

test("purgeCameraRecord deletes photos inside the same d1.batch as the camera", async () => {
  const retention = await readSource("db/retention.ts");
  const purgeStart = retention.indexOf("async function purgeCameraRecord");
  const purgeEnd = retention.indexOf("// ---", purgeStart);
  const purge = retention.slice(purgeStart, purgeEnd);

  assert.match(
    purge,
    /d1\.batch\(\[/,
    "the destructive work must be one atomic batch",
  );
  assert.ok(
    purge.indexOf("DELETE FROM photos WHERE camera_id = ?") < purge.indexOf("DELETE FROM cameras WHERE id = ?"),
    "the photo rows must be deleted inside the batch, before the camera row",
  );
});

test("R6 deletion chunks against the D1 100-bound-parameter cap", async () => {
  const retention = await readSource("db/retention.ts");
  const r6Start = retention.indexOf("const orphanAndRejected");
  const r6End = retention.indexOf("// --- R7");
  const r6 = retention.slice(r6Start, r6End);

  assert.match(retention, /D1_MAX_BOUND_PARAMS\s*=\s*100/, "the D1 cap must be an explicit constant");
  assert.match(
    r6,
    /offset\s*<\s*ids\.length;\s*offset\s*\+=\s*D1_MAX_BOUND_PARAMS/,
    "the deletion must iterate in chunks of at most 100 ids",
  );
  // Per-chunk (review t_eed5f080 #1): each chunk's R2 objects are deleted
  // right after ITS OWN D1 rows, so a later chunk failure can no longer
  // orphan the objects of already-deleted chunks. The actual deleteR2Objects
  // CALL must still come after the DELETE inside the loop body.
  const deleteCall = r6.indexOf("await deleteR2Objects(r2, chunk.map");
  assert.ok(deleteCall > 0, "the R2 deletion must be the per-chunk call in the loop");
  assert.ok(
    r6.indexOf("DELETE FROM photos WHERE id IN") < deleteCall,
    "each chunk's D1 rows must be deleted BEFORE that chunk's R2 objects (no orphaned objects on failure)",
  );
});

test("the R3 unverified SELECT carries the real status for the audit event", async () => {
  const retention = await readSource("db/retention.ts");
  const r3Start = retention.indexOf("const unverifiedCutoff");
  const r3End = retention.indexOf("// --- R1");
  const r3 = retention.slice(r3Start, r3End);

  assert.match(r3, /SELECT id, status FROM cameras/, "the SELECT must read the real status (BLOCKER 1)");
  assert.match(
    r3,
    /\.bind\(id, status, /,
    "the audit event must bind the real status as previous_status (BLOCKER 1)",
  );
});
