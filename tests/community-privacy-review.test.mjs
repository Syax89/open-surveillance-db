// Community privacy flags reach a human (ADR 0021 §6.4, owner 2026-11).
//
// Real SQL (db-runtime harness, in-memory SQLite replaying every Drizzle
// migration): the privacy flag still hides at once, the hidden record lands
// in the moderator's review tab as `sensitive`, the moderator's restore is
// final against later community actions, the per-account privacy cap (5 in
// a rolling 24 h) answers privacy_quota_exceeded, and an account with ≥ 2
// rejected privacy flags in 90 days only queues — never hides.
//
// Timing note: moderator decisions are stamped with the real clock
// (new Date()), community actions with the `now` the test passes. Flags
// meant to land AFTER a moderator verdict use FUTURE timestamps.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = "2026-08-01T12:00:00.000Z";
/** Comfortably after any real-clock moderator decision of this run. */
const LATER = new Date(Date.now() + 2 * DAY_MS).toISOString();
const plusMinutes = (iso, minutes) => new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString();

let runtime;
let db;
let seq = 0;

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  runtime.communitySettings.resetCommunitySettingsCache();
  // ONE active reviewer: the two-person rule only applies when another
  // active reviewer exists (hasOtherActiveReviewer), so decisions are final.
  db.exec(`INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
    (1, 'Record Reviewer', 'record_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')`);
});

after(async () => cleanupDbRuntime());

async function insertCamera(overrides = {}) {
  seq += 1;
  const row = { status: "active", contributorId: null, createdAt: `2026-07-01T00:00:${String(seq % 60).padStart(2, "0")}.000Z`, ...overrides };
  const result = await db
    .prepare(
      `INSERT INTO cameras (title, kind, notes, latitude, longitude, status, source, updated, description, review_interval_months, contributor_id, created_at)
       VALUES (?, 'Fixed dome', '', 44.1, 12.2, ?, 'Community report', 'Test update', '', 12, ?, ?) RETURNING id`,
    )
    .bind(`Privacy camera ${seq}`, row.status, row.contributorId, row.createdAt)
    .first();
  return result.id;
}

async function makeContributor() {
  seq += 1;
  const result = await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, NULL, 'pbkdf2$210000$test$fixture', ?, ?) RETURNING id")
    .bind(`privacy-${seq}-${crypto.randomUUID()}@example.org`, "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z")
    .first();
  // One live contribution → verified (L1) account.
  await insertCamera({ contributorId: result.id });
  return result.id;
}

const flag = (cameraId, contributorId, actionType = "privacy", now = NOW) =>
  runtime.communityActions.setCommunityAction({ cameraId, contributorId, actionType, now, env: runtime.env });

const status = async (cameraId) => (await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first()).status;

const decide = (cameraId, action) =>
  runtime.moderation.moderateCamera(cameraId, action, "privacy-or-safety-concern", "test verdict", undefined, { actorId: 1 });

const reviewIds = async () => (await runtime.moderation.listPendingModerationItems()).reviewCameras.map((camera) => camera.id);

async function rejectedFlagCount(contributorId) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE action = 'community-privacy-flag-rejected' AND actor = ?")
    .bind(`community:${contributorId}`)
    .first();
  return Number(row.n);
}

/** A flag by `contributorId` on a fresh record, hidden, then restored by the moderator. */
async function flagAndGetRejected(contributorId, now = NOW) {
  const cameraId = await insertCamera();
  assert.equal((await flag(cameraId, contributorId, "privacy", now)).kind, "ok");
  assert.equal(await status(cameraId), "hidden");
  assert.equal((await decide(cameraId, "reverify")).kind, "ok");
  assert.equal(await status(cameraId), "active");
  return cameraId;
}

test("one privacy flag still hides the record immediately", async () => {
  const cameraId = await insertCamera();
  const result = await flag(cameraId, await makeContributor());
  assert.equal(result.kind, "ok");
  assert.equal(result.queuedForReview, undefined, "a hiding flag is not reported as 'queued only'");
  assert.equal(await status(cameraId), "hidden");
});

test("a privacy-hidden record lands at once in the review queue, marked sensitive", async () => {
  const cameraId = await insertCamera();
  await flag(cameraId, await makeContributor());

  const queueRow = await db
    .prepare("SELECT state, sensitivity, requires_second_review AS rsr FROM moderation_queue WHERE entity = 'camera' AND entity_id = ? AND state != 'closed'")
    .bind(cameraId)
    .first();
  assert.ok(queueRow, "an open moderation_queue row exists right after the hide");
  assert.equal(queueRow.state, "queued");
  assert.equal(queueRow.sensitivity, "sensitive");

  const queue = await runtime.moderation.listPendingModerationItems();
  assert.ok(queue.reviewCameras.some((camera) => camera.id === cameraId && camera.status === "hidden"), "the review tab lists the hidden record");
  assert.equal(queue.queueTotals.review, 1);
  const item = queue.queueItems.find((entry) => entry.entity === "camera" && entry.entityId === cameraId);
  assert.equal(item?.sensitivity, "sensitive");

  // The ledger keeps the flagger even though the hide consumed the action row.
  const hidden = await db
    .prepare("SELECT note FROM moderation_events WHERE entity_id = ? AND action = 'community-privacy-hidden'")
    .bind(cameraId)
    .first();
  assert.equal(JSON.parse(hidden.note).contributorIds.length, 1);
});

test("moderator 'hide' on a privacy-hidden record confirms the removal and closes the review", async () => {
  const cameraId = await insertCamera();
  const flagger = await makeContributor();
  await flag(cameraId, flagger);
  const result = await decide(cameraId, "hide");
  assert.equal(result.kind, "ok");
  assert.equal(await status(cameraId), "removed");
  assert.ok(!(await reviewIds()).includes(cameraId));
  assert.equal(await rejectedFlagCount(flagger), 0, "a confirmed flag is not penalised");

  // A moderator removal is never community-restorable.
  for (let i = 0; i < 4; i += 1) await flag(cameraId, await makeContributor(), "confirm", plusMinutes(LATER, i));
  assert.equal(await status(cameraId), "removed");
});

test("moderator restore of a privacy hide is recorded, penalises the flagger and is final", async () => {
  const cameraId = await insertCamera();
  const flagger = await makeContributor();
  await flag(cameraId, flagger);

  const result = await decide(cameraId, "reverify");
  assert.equal(result.kind, "ok");
  assert.equal(result.event.previousStatus, "hidden");
  assert.equal(result.event.newStatus, "active");
  assert.equal(await status(cameraId), "active");
  assert.equal(await rejectedFlagCount(flagger), 1, "the unfounded flag is charged to its author");
  assert.ok(!(await reviewIds()).includes(cameraId), "the verdict closes the review");
  const closed = await db.prepare("SELECT state FROM moderation_queue WHERE entity = 'camera' AND entity_id = ?").bind(cameraId).first();
  assert.equal(closed.state, "closed");

  // Later community actions cannot undo the verdict: a fresh privacy flag
  // from a clean account queues (sensitive) instead of hiding, and a
  // problem consensus does not hide either.
  const fresh = await flag(cameraId, await makeContributor(), "privacy", LATER);
  assert.equal(fresh.kind, "ok");
  assert.equal(fresh.queuedForReview, true);
  assert.equal(await status(cameraId), "active");
  for (let i = 1; i <= 3; i += 1) await flag(cameraId, await makeContributor(), "problem", plusMinutes(LATER, i));
  assert.equal(await status(cameraId), "active");
  assert.ok((await reviewIds()).includes(cameraId), "the new flag is back in front of the moderator");
});

test("privacy cap: 5 privacy flags per rolling 24 h, the 6th answers privacy_quota_exceeded", async () => {
  const flagger = await makeContributor();
  for (let i = 0; i < 5; i += 1) {
    const result = await flag(await insertCamera(), flagger, "privacy", plusMinutes(NOW, i));
    assert.equal(result.kind, "ok", `flag ${i + 1} is accepted`);
  }
  const sixthCamera = await insertCamera();
  const sixth = await flag(sixthCamera, flagger, "privacy", plusMinutes(NOW, 10));
  assert.equal(sixth.kind, "privacy_quota_exceeded");
  assert.ok(sixth.retryAfterSeconds > 0);
  assert.equal(await status(sixthCamera), "active", "a refused flag changes nothing");

  // Other action types are not affected by the privacy cap.
  assert.equal((await flag(sixthCamera, flagger, "gone", plusMinutes(NOW, 11))).kind, "ok");
  // Switching into privacy is a privacy flag too.
  const switched = await flag(sixthCamera, flagger, "privacy", plusMinutes(NOW, 12));
  assert.equal(switched.kind, "privacy_quota_exceeded");

  // The window rolls: 24 h after the first flag the allowance is back.
  const nextDay = new Date(Date.parse(NOW) + DAY_MS + 60 * 1000).toISOString();
  assert.equal((await flag(await insertCamera(), flagger, "privacy", nextDay)).kind, "ok");
});

test("the privacy cap counts flags consumed by a hide and is not refunded by remove + re-flag", async () => {
  const flagger = await makeContributor();
  const cameraId = await insertCamera({ status: "active" });
  // A flag on an already-hidden record (no hide → the action row survives)
  const hiddenCamera = await insertCamera();
  await flag(hiddenCamera, await makeContributor(), "privacy", NOW);
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await flag(hiddenCamera, flagger, "privacy", plusMinutes(NOW, i + 1))).kind, "ok");
    await runtime.communityActions.removeCommunityAction({ cameraId: hiddenCamera, contributorId: flagger });
  }
  assert.equal((await flag(cameraId, flagger, "privacy", plusMinutes(NOW, 30))).kind, "privacy_quota_exceeded");
});

test("an account with 2 rejected privacy flags in 90 days queues its next flag instead of hiding", async () => {
  const flagger = await makeContributor();
  await flagAndGetRejected(flagger, NOW);
  await flagAndGetRejected(flagger, plusMinutes(NOW, 1));
  assert.equal(await rejectedFlagCount(flagger), 2);

  const target = await insertCamera();
  const result = await flag(target, flagger, "privacy", LATER);
  assert.equal(result.kind, "ok");
  assert.equal(result.queuedForReview, true, "the flag is stored and sent to the moderator only");
  assert.equal(await status(target), "active", "a penalised account's flag never hides");
  const stored = await db.prepare("SELECT action_type AS t FROM camera_community_actions WHERE camera_id = ? AND contributor_id = ?").bind(target, flagger).first();
  assert.equal(stored.t, "privacy");
  const queued = await db.prepare("SELECT note FROM moderation_events WHERE entity_id = ? AND action = 'community-privacy-queued'").bind(target).first();
  assert.equal(JSON.parse(queued.note).reason, "penalised");

  const queue = await runtime.moderation.listPendingModerationItems();
  const listed = queue.reviewCameras.find((camera) => camera.id === target);
  assert.equal(listed?.status, "active", "the still-public record is in the review tab");
  assert.equal(queue.queueItems.find((entry) => entry.entity === "camera" && entry.entityId === target)?.sensitivity, "sensitive");

  // A clean account's flag on the same record still hides it at once.
  await flag(target, await makeContributor(), "privacy", plusMinutes(LATER, 1));
  assert.equal(await status(target), "hidden");
});

test("moderator dismissal of a queued flag penalises it, consumes it and closes the review", async () => {
  const flagger = await makeContributor();
  await flagAndGetRejected(flagger, NOW);
  await flagAndGetRejected(flagger, plusMinutes(NOW, 1));
  const target = await insertCamera();
  await flag(target, flagger, "privacy", LATER);

  const result = await decide(target, "reverify");
  assert.equal(result.kind, "ok");
  assert.equal(await status(target), "active");
  assert.equal(await rejectedFlagCount(flagger), 3);
  const left = await db.prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = 'privacy'").bind(target).first();
  assert.equal(Number(left.n), 0, "the rejected privacy action is consumed");
  assert.ok(!(await reviewIds()).includes(target));
});

test("rejected flags outside the 90-day window do not penalise", async () => {
  const flagger = await makeContributor();
  await flagAndGetRejected(flagger, NOW);
  await flagAndGetRejected(flagger, plusMinutes(NOW, 1));
  // The rejections were stamped now (real clock); 91 days later they age out.
  const outside = new Date(Date.now() + 91 * DAY_MS).toISOString();
  const target = await insertCamera();
  const result = await flag(target, flagger, "privacy", outside);
  assert.equal(result.kind, "ok");
  assert.equal(result.queuedForReview, undefined);
  assert.equal(await status(target), "hidden", "an old record of rejections no longer blocks the auto-hide");
});

test("one rejected flag is not enough, and the penalty knobs are tunable via community_settings", async () => {
  const flagger = await makeContributor();
  await flagAndGetRejected(flagger, NOW);
  const target = await insertCamera();
  await flag(target, flagger, "privacy", LATER);
  assert.equal(await status(target), "hidden", "1 rejected flag < default threshold 2");

  // Tune the knob down to 1: the next flag only queues.
  await db
    .prepare("INSERT INTO community_settings (key, value, updated_at) VALUES ('penalties.privacyRejectedFlags', '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(NOW)
    .run();
  runtime.communitySettings.resetCommunitySettingsCache();
  const second = await insertCamera();
  const result = await flag(second, flagger, "privacy", plusMinutes(LATER, 1));
  assert.equal(result.queuedForReview, true);
  assert.equal(await status(second), "active");
});

test("with a second active reviewer, a restore needs two people and penalises only on the final step", async () => {
  db.exec(`INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
    (2, 'Senior Moderator', 'senior_moderator', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')`);
  const cameraId = await insertCamera();
  const flagger = await makeContributor();
  await flag(cameraId, flagger);

  const first = await decide(cameraId, "reverify");
  assert.equal(first.kind, "second_review_pending");
  assert.equal(await status(cameraId), "hidden");
  assert.equal(await rejectedFlagCount(flagger), 0);

  const second = await runtime.moderation.moderateCamera(cameraId, "reverify", "privacy-or-safety-concern", "agree", undefined, { actorId: 2 });
  assert.equal(second.kind, "ok");
  assert.equal(await status(cameraId), "active");
  assert.equal(await rejectedFlagCount(flagger), 1);
});
