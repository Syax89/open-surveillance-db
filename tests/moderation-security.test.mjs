// Real-SQL regression suite for the moderation hardening (security audit):
//
//   1. two-person review is derived server-side — the deciding moderator can
//      only UPGRADE an item's sensitivity, never opt out of a second review;
//   2. no self-moderation — a reviewer whose linked contributor account
//      submitted the item (or owns the targeted record) cannot decide it;
//   3. edit-request approval is race-safe — a concurrent reject or a camera
//      removal landing between the pre-reads and the batch never gets the
//      diff applied;
//   4. the public revision history never shows recusals / first-review
//      intents (previous_status = new_status workflow rows).
//
// Runs the REAL db/moderation.ts against the REAL Drizzle migrations on the
// in-memory D1 adapter. No personal data: fictional fixtures only.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
  seedDemoIdentities,
} from "./helpers/db-runtime-harness.mjs";

const RECORD = 2; // Demo Record Reviewer (users.id 2) — approve/reject
const SENIOR = 3; // Demo Senior Moderator (users.id 3)
const NOW = "2026-08-01T12:00:00.000Z";

let runtime;
let db;
let moderation;

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  await seedDemoIdentities(db);
  runtime.env.DB = db;
  moderation = runtime.moderation;
});

after(async () => cleanupDbRuntime());

let seq = 0;
async function insertContributor() {
  seq += 1;
  return (await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, NULL, 'pbkdf2$210000$test$fixture', ?, ?) RETURNING id")
    .bind(`mod-sec-${seq}-${crypto.randomUUID()}@example.org`, NOW, NOW)
    .first()).id;
}

async function insertCamera({ status = "pending", contributorId = null, title = "Moderation target" } = {}) {
  return (await db
    .prepare(
      `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, contributor_id, created_at)
       VALUES (?, 'Fixed dome', NULL, NULL, 0, 0, NULL, '', 44.1, 12.2, ?, 'Community report', ?, '', ?, ?) RETURNING id`,
    )
    .bind(title, status, NOW, contributorId, NOW)
    .first()).id;
}

async function insertCorrection({ cameraId = null, issueType = "inaccurate", contributorId = null } = {}) {
  return (await db
    .prepare("INSERT INTO correction_requests (camera_id, issue_type, message, contact, contributor_id, status, created_at) VALUES (?, ?, 'Fixture message', NULL, ?, 'pending', ?) RETURNING id")
    .bind(cameraId, issueType, contributorId, NOW)
    .first()).id;
}

async function insertEditRequest({ cameraId, contributorId, proposedTitle = "Edited title" }) {
  const id = (await db
    .prepare(
      `INSERT INTO camera_edit_requests (camera_id, contributor_id, proposed_title, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?) RETURNING id`,
    )
    .bind(cameraId, contributorId, proposedTitle, NOW, NOW)
    .first()).id;
  await db
    .prepare("INSERT INTO moderation_queue (entity, entity_id, state, assignee_id, sensitivity, requires_second_review, second_reviewer_id, escalation_reason, created_at, updated_at) VALUES ('camera_edit', ?, 'queued', NULL, 'standard', 0, NULL, NULL, ?, ?)")
    .bind(id, NOW, NOW)
    .run();
  return id;
}

/** Link a demo reviewer's users row to a contributor account (users.contributor_id). */
async function linkReviewerToContributor(userId, contributorId) {
  await db.prepare("UPDATE users SET contributor_id = ? WHERE id = ?").bind(contributorId, userId).run();
}

async function cameraRow(id) {
  return db.prepare("SELECT status, title FROM cameras WHERE id = ?").bind(id).first();
}

// ---------------------------------------------------------------------------
// 1. Two-person review is server-derived; the client may only upgrade
// ---------------------------------------------------------------------------

test("a removal report on a record forces two-person review even when the client sends standard", async () => {
  const cameraId = await insertCamera();
  await insertCorrection({ cameraId, issueType: "removal" });

  const first = await moderation.moderateCamera(cameraId, "approve", "verified-public-infrastructure", null, undefined, {
    actorId: RECORD,
    sensitivity: "standard",
    requiresSecondReview: false,
  });
  assert.equal(first.kind, "second_review_pending");
  assert.equal(first.queue.sensitivity, "urgent");
  assert.equal(first.queue.requiresSecondReview, 1);
  assert.equal((await cameraRow(cameraId)).status, "pending", "status unchanged until a second reviewer acts");

  const same = await moderation.moderateCamera(cameraId, "approve", "verified-public-infrastructure", null, undefined, { actorId: RECORD });
  assert.equal(same.kind, "second_review_same_reviewer");

  const second = await moderation.moderateCamera(cameraId, "approve", "verified-public-infrastructure", null, undefined, { actorId: SENIOR });
  assert.equal(second.kind, "ok");
  assert.equal((await cameraRow(cameraId)).status, "active");
});

test("a removal/abuse correction request is urgent by derivation", async () => {
  for (const issueType of ["removal", "abuse"]) {
    const correctionId = await insertCorrection({ issueType });
    const result = await moderation.moderateCorrection(correctionId, "reject", "insufficient-evidence", null, undefined, {
      actorId: RECORD,
      sensitivity: "standard",
    });
    assert.equal(result.kind, "second_review_pending", issueType);
    assert.equal(result.queue.sensitivity, "urgent", issueType);
  }
});

test("a community privacy flag makes the record (and its edit requests) sensitive", async () => {
  const owner = await insertContributor();
  const flagger = await insertContributor();
  const cameraId = await insertCamera({ status: "active", contributorId: owner });
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'privacy', 1, ?, ?)")
    .bind(cameraId, flagger, NOW, NOW)
    .run();
  const editId = await insertEditRequest({ cameraId, contributorId: owner });
  const result = await moderation.moderateCameraEdit(editId, "approve", "verified-public-infrastructure", null, {
    actorId: RECORD,
    sensitivity: "standard",
  });
  assert.equal(result.kind, "second_review_pending");
  assert.equal(result.queue.sensitivity, "sensitive", "the open standard queue row is upgraded, never kept standard");
});

test("an existing sensitive queue row is never downgraded by the client", async () => {
  const cameraId = await insertCamera();
  await db
    .prepare("INSERT INTO moderation_queue (entity, entity_id, state, assignee_id, sensitivity, requires_second_review, second_reviewer_id, escalation_reason, created_at, updated_at) VALUES ('camera', ?, 'queued', NULL, 'sensitive', 1, NULL, NULL, ?, ?)")
    .bind(cameraId, NOW, NOW)
    .run();
  const result = await moderation.moderateCamera(cameraId, "reject", "insufficient-evidence", null, undefined, {
    actorId: RECORD,
    sensitivity: "standard",
    requiresSecondReview: false,
  });
  assert.equal(result.kind, "second_review_pending");
  assert.equal(result.queue.sensitivity, "sensitive");
});

test("the client may still upgrade a standard item; a plain item without signals decides in one step", async () => {
  const upgraded = await insertCamera();
  const result = await moderation.moderateCamera(upgraded, "approve", "verified-public-infrastructure", null, undefined, {
    actorId: RECORD,
    sensitivity: "sensitive",
  });
  assert.equal(result.kind, "second_review_pending");
  assert.equal(result.queue.sensitivity, "sensitive");

  const plain = await insertCamera();
  const direct = await moderation.moderateCamera(plain, "approve", "verified-public-infrastructure", null, undefined, { actorId: RECORD });
  assert.equal(direct.kind, "ok");
  assert.equal(direct.queue.sensitivity, "standard");
});

// ---------------------------------------------------------------------------
// 2. No self-moderation
// ---------------------------------------------------------------------------

test("a reviewer cannot decide a record submitted by their own contributor account", async () => {
  const contributorId = await insertContributor();
  await linkReviewerToContributor(RECORD, contributorId);
  const cameraId = await insertCamera({ contributorId });

  for (const action of ["approve", "reject", "hide"]) {
    const result = await moderation.moderateCamera(cameraId, action, "verified-public-infrastructure", null, undefined, { actorId: RECORD });
    assert.deepEqual(result, { kind: "self_review" }, action);
  }
  assert.equal((await cameraRow(cameraId)).status, "pending");
  const decisions = await db.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = 'camera' AND entity_id = ?").bind(cameraId).first();
  assert.equal(Number(decisions.n), 0, "a refused self-review writes no event");

  // Recusal stays available (it is how a conflicted reviewer steps aside).
  const recused = await moderation.moderateCamera(cameraId, "approve", "other", null, undefined, { actorId: RECORD, recused: true });
  assert.equal(recused.kind, "recused");

  // Another reviewer decides normally.
  const other = await moderation.moderateCamera(cameraId, "approve", "verified-public-infrastructure", null, undefined, { actorId: SENIOR });
  assert.equal(other.kind, "ok");
});

test("a reviewer cannot decide their own correction request nor one targeting their own record", async () => {
  const contributorId = await insertContributor();
  await linkReviewerToContributor(RECORD, contributorId);

  const ownReport = await insertCorrection({ contributorId });
  assert.deepEqual(
    await moderation.moderateCorrection(ownReport, "approve", "verified-public-infrastructure", null, undefined, { actorId: RECORD }),
    { kind: "self_review" },
  );

  const ownCamera = await insertCamera({ status: "active", contributorId });
  const aboutOwnCamera = await insertCorrection({ cameraId: ownCamera });
  assert.deepEqual(
    await moderation.moderateCorrection(aboutOwnCamera, "reject", "insufficient-evidence", null, undefined, { actorId: RECORD }),
    { kind: "self_review" },
  );

  // Linking someone else's request to the reviewer's own record is refused too.
  const unrelated = await insertCorrection();
  assert.deepEqual(
    await moderation.moderateCorrection(unrelated, "associate", "other", null, { cameraId: ownCamera }, { actorId: RECORD }),
    { kind: "self_review" },
  );
});

test("a reviewer cannot decide an edit request on their own record", async () => {
  const contributorId = await insertContributor();
  await linkReviewerToContributor(RECORD, contributorId);
  const cameraId = await insertCamera({ status: "active", contributorId });
  const editId = await insertEditRequest({ cameraId, contributorId });

  assert.deepEqual(
    await moderation.moderateCameraEdit(editId, "approve", "verified-public-infrastructure", null, { actorId: RECORD }),
    { kind: "self_review" },
  );
  assert.equal((await cameraRow(cameraId)).title, "Moderation target");
  const approved = await moderation.moderateCameraEdit(editId, "approve", "verified-public-infrastructure", null, { actorId: SENIOR });
  assert.equal(approved.kind, "ok");
  assert.equal((await cameraRow(cameraId)).title, "Edited title");
});

// ---------------------------------------------------------------------------
// 3. Edit-request approval race
// ---------------------------------------------------------------------------

/** Run `interleave` right before the NEXT d1.batch, simulating a concurrent writer. */
function interleaveBeforeNextBatch(interleave) {
  const original = db.batch.bind(db);
  db.batch = (statements) => {
    db.batch = original;
    interleave();
    return original(statements);
  };
}

test("a concurrent reject between the pre-read and the batch never gets the diff applied", async () => {
  const owner = await insertContributor();
  const cameraId = await insertCamera({ status: "active", contributorId: owner });
  const editId = await insertEditRequest({ cameraId, contributorId: owner });

  interleaveBeforeNextBatch(() => {
    db.db.exec(`UPDATE camera_edit_requests SET status = 'rejected', decided_by = ${SENIOR}, decided_at = '${NOW}', updated_at = '${NOW}' WHERE id = ${editId}`);
  });
  const result = await moderation.moderateCameraEdit(editId, "approve", "verified-public-infrastructure", null, { actorId: RECORD });
  assert.deepEqual(result, { kind: "not_found" });

  assert.equal((await cameraRow(cameraId)).title, "Moderation target", "the rejected diff must not be applied");
  const request = await db.prepare("SELECT status, decided_by AS decidedBy FROM camera_edit_requests WHERE id = ?").bind(editId).first();
  assert.equal(request.status, "rejected");
  assert.equal(request.decidedBy, SENIOR);
  const applied = await db.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = 'camera_edit' AND action = 'edit_applied'").first();
  assert.equal(Number(applied.n), 0);
});

test("a camera removal landing before the batch blocks the approval entirely", async () => {
  const owner = await insertContributor();
  const cameraId = await insertCamera({ status: "active", contributorId: owner });
  const editId = await insertEditRequest({ cameraId, contributorId: owner });

  interleaveBeforeNextBatch(() => {
    db.db.exec(`UPDATE cameras SET status = 'removed' WHERE id = ${cameraId}`);
  });
  const result = await moderation.moderateCameraEdit(editId, "approve", "verified-public-infrastructure", null, { actorId: RECORD });
  assert.deepEqual(result, { kind: "not_found" });

  const camera = await cameraRow(cameraId);
  assert.equal(camera.status, "removed");
  assert.equal(camera.title, "Moderation target", "a removed record never receives the diff");
  const request = await db.prepare("SELECT status FROM camera_edit_requests WHERE id = ?").bind(editId).first();
  assert.equal(request.status, "pending", "the request stays undecided");
});

// ---------------------------------------------------------------------------
// 4. Public revisions hide internal workflow rows
// ---------------------------------------------------------------------------

test("public revisions exclude recusals and first-review intents", async () => {
  const cameraId = await insertCamera();
  await moderation.moderateCamera(cameraId, "approve", "other", null, undefined, { actorId: RECORD, recused: true });
  await moderation.moderateCamera(cameraId, "approve", "verified-public-infrastructure", null, undefined, { actorId: RECORD, sensitivity: "sensitive" });
  await moderation.moderateCamera(cameraId, "approve", "verified-public-infrastructure", null, undefined, { actorId: SENIOR });

  const revisions = await moderation.listPublicCameraRevisions(cameraId);
  assert.deepEqual(
    revisions.map((revision) => [revision.action, revision.previousStatus, revision.newStatus]),
    [["approve", "pending", "active"]],
  );
});
