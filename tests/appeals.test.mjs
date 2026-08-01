// DB-layer tests for the contributor appeal workflow (ADR 0014).
//
// The E2E suite (auth-flow-e2e.test.mjs) proves the appeals flow through the
// real HTTP routes; this suite pins the db-layer invariants directly on the
// real SQL: filing rules (final decision only, one pending appeal per
// decision), the independence rule, escalation to the administrator, the
// audit trail with the appeal link, and the "upheld → back to the queue"
// reversal. Runs against the real Drizzle migrations on in-memory D1.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime, seedDemoIdentities } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";

let env;
let cameras;
let moderation;
let users;
let appeals;

const CONTRIBUTOR_USER_ID = 6; // Demo Contributor (migration 0010 seed)
const INTAKE = { id: 1, displayName: "Demo Intake Reviewer", role: "intake_reviewer", active: 1 };
const RECORD = { id: 2, displayName: "Demo Record Reviewer", role: "record_reviewer", active: 1 };
const SENIOR = { id: 3, displayName: "Demo Senior Moderator", role: "senior_moderator", active: 1 };
const ADMIN = { id: 5, displayName: "Demo Administrator", role: "administrator", active: 1 };

beforeEach(async () => {
  ({ env, cameras, moderation, users, appeals } = await loadDbRuntime());
  env.DB = new D1();
  await applyDrizzleMigrations(env.DB);
  // Migration 0017 removes the demo seed; this suite pins the appeal flow on
  // the real demo identities (contributor id 6, reviewers 1/2/3/5), so it
  // provisions them explicitly like a deploy would before opening the DB.
  await seedDemoIdentities(env.DB);
  // The shared env mock is reused across tests: reset the per-appellant
  // appeal threshold knobs so a test that lowers them cannot leak.
  delete env.APPEAL_APPELLANT_RATE_LIMIT_MAX;
  delete env.APPEAL_APPELLANT_RATE_LIMIT_WINDOW_SECONDS;
});

after(async () => cleanupDbRuntime());

async function auditEvents() {
  const rows = await env.DB.prepare("SELECT * FROM moderation_events ORDER BY id ASC").all();
  return rows.results;
}

async function submitPending() {
  return cameras.createPendingCamera({
    title: "Appeal target",
    kind: "Fixed dome",
    manufacturer: "Acme",
    observedOn: "2026-07-01",
    address: "Via Roma 1",
    notes: "private",
    latitude: 41.9005,
    longitude: 12.4937,
  });
}

test("fileAppeal records the appeal and an audit event linked via appeal_id", async () => {
  const record = await submitPending();
  await moderation.moderateCamera(record.id, "reject", "insufficient-evidence", null, undefined, { actorId: INTAKE.id });

  const decision = (await auditEvents())[0];
  const result = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "The camera is on a public street.",
  });
  assert.equal(result.kind, "ok");
  assert.equal(result.appeal.status, "pending");
  assert.equal(result.appeal.decisionEventId, decision.id);
  assert.equal(result.event.action, "appeal-filed");
  assert.equal(result.event.appealId, result.appeal.id);

  const events = await auditEvents();
  assert.equal(events.length, 2);
  assert.equal(events[1].appeal_id, result.appeal.id);

  const row = await env.DB.prepare("SELECT status FROM moderation_appeals WHERE id = ?").bind(result.appeal.id).first();
  assert.equal(row.status, "pending");
});

test("fileAppeal rejects non-final decisions and unknown decisions", async () => {
  const record = await submitPending();
  // Escalation keeps the record status: previous === new → not a final decision.
  await moderation.moderateCamera(record.id, "escalate", "requires-senior-review", "Needs senior", undefined, {
    actorId: RECORD.id,
  });
  const escalation = (await auditEvents())[0];
  assert.equal(escalation.previous_status, escalation.new_status);

  const nonFinal = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: escalation.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Contesting",
  });
  assert.equal(nonFinal.kind, "decision_not_final");

  const missing = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: 999999,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Contesting",
  });
  assert.equal(missing.kind, "decision_not_found");
});

test("only one pending appeal per decision; unknown appellant is rejected", async () => {
  const record = await submitPending();
  await moderation.moderateCamera(record.id, "approve", "verified-public-infrastructure", null, undefined, {
    actorId: RECORD.id,
  });
  const decision = (await auditEvents())[0];

  const first = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "First appeal",
  });
  assert.equal(first.kind, "ok");

  const duplicate = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Second appeal",
  });
  assert.equal(duplicate.kind, "duplicate_pending");

  const stranger = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: 999999,
    reason: "Who am I?",
  });
  assert.equal(stranger.kind, "appellant_not_found");
});

test("fileAppeal on another contributor's attributed submission stays allowed (documented relevance rule, P3 appeal-ownership)", async () => {
  // ADR 0013 attribution: the camera was submitted by contributor id 77
  // (contributors table, seeded directly with an explicit id — the migration
  // has no seed rows).
  await env.DB.prepare(
    "INSERT INTO contributors (id, email, display_name, password_hash, created_at, updated_at) VALUES (77, ?, ?, ?, ?, ?)",
  ).bind(
    "other@osdb.test",
    "Other Contributor",
    "x".repeat(64),
    new Date().toISOString(),
    new Date().toISOString(),
  ).run();

  const record = await cameras.createPendingCamera({
    title: "Attributed to another contributor",
    kind: "Fixed dome",
    manufacturer: "Acme",
    observedOn: "2026-07-01",
    address: "Via Roma 2",
    notes: "private",
    latitude: 41.9006,
    longitude: 12.4938,
    contributorId: 77,
  });
  await moderation.moderateCamera(record.id, "reject", "insufficient-evidence", null, undefined, {
    actorId: INTAKE.id,
  });
  const decision = (await auditEvents())[0];

  // Standing cannot be verified for attributed submissions without a product
  // decision (option 1 of the audit: hard 403 + "not my submission" reason
  // code, pending Ada/PM). Under the documented rule (option 2) the appeal is
  // filed and moderation evaluates the stated relevance; the per-appellant
  // threshold and the route's minimum reason length bound abuse.
  const result = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "I recorded this camera myself and can confirm it is on a public street.",
  });
  assert.equal(result.kind, "ok");
  assert.equal(result.appeal.appellantId, CONTRIBUTOR_USER_ID);
});

test("fileAppeal enforces the per-appellant threshold; failed attempts do not count", async () => {
  env.APPEAL_APPELLANT_RATE_LIMIT_MAX = "2";

  // Three final decisions on three different records.
  const decisionIds = [];
  for (let i = 0; i < 3; i += 1) {
    const record = await submitPending();
    await moderation.moderateCamera(record.id, "reject", "insufficient-evidence", null, undefined, {
      actorId: INTAKE.id,
    });
    decisionIds.push((await auditEvents()).find((event) => event.entity_id === record.id).id);
  }

  const first = await appeals.fileAppeal({
    entity: "camera",
    entityId: 1,
    decisionEventId: decisionIds[0],
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "First appeal with a substantive reason",
  });
  assert.equal(first.kind, "ok");

  // A failed attempt (unknown decision) must not consume the budget.
  const failed = await appeals.fileAppeal({
    entity: "camera",
    entityId: 2,
    decisionEventId: 999999,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Attempt that fails before the threshold check",
  });
  assert.equal(failed.kind, "decision_not_found");

  const second = await appeals.fileAppeal({
    entity: "camera",
    entityId: 2,
    decisionEventId: decisionIds[1],
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Second appeal with a substantive reason",
  });
  assert.equal(second.kind, "ok");

  // Budget exhausted (2 filed inside the window): the third is refused.
  const third = await appeals.fileAppeal({
    entity: "camera",
    entityId: 3,
    decisionEventId: decisionIds[2],
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Third appeal that must hit the per-appellant threshold",
  });
  assert.equal(third.kind, "appeal_limit_exceeded");

  // A different appellant is not affected by the same threshold.
  await env.DB.prepare(
    "INSERT INTO users (email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES (?, ?, 'contributor', 1, 0, ?, ?)",
  ).bind(
    "second-contributor@osdb.test",
    "Second Contributor",
    new Date().toISOString(),
    new Date().toISOString(),
  ).run();
  const otherAppellant = await appeals.fileAppeal({
    entity: "camera",
    entityId: 3,
    decisionEventId: decisionIds[2],
    appellantId: 7,
    reason: "A different contributor files within their own budget",
  });
  assert.equal(otherAppellant.kind, "ok");
});

test("decideAppeal enforces the independence and seniority rules", async () => {
  const record = await submitPending();
  await moderation.moderateCamera(record.id, "approve", "verified-public-infrastructure", null, undefined, {
    actorId: RECORD.id,
  });
  const decision = (await auditEvents())[0];
  const filed = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Contesting the approval",
  });
  assert.equal(filed.kind, "ok");
  const appealId = filed.appeal.id;

  // Non-senior reviewers cannot decide.
  const recordReviewer = await appeals.decideAppeal({
    id: appealId,
    decision: "dismiss",
    reviewer: RECORD,
    note: null,
  });
  assert.equal(recordReviewer.kind, "forbidden");

  // The original reviewer (record reviewer id 2) cannot decide — but here the
  // decider tier is senior+, so use a senior who did NOT make the decision.
  const seniorDecision = await appeals.decideAppeal({
    id: appealId,
    decision: "uphold",
    reviewer: SENIOR,
    note: "Evidence supports a public street",
  });
  assert.equal(seniorDecision.kind, "ok");
  assert.equal(seniorDecision.appeal.status, "upheld");
  assert.equal(seniorDecision.appeal.deciderName, "Demo Senior Moderator");

  // The record returns to the moderation queue, never published directly.
  const row = await env.DB.prepare("SELECT status FROM cameras WHERE id = ?").bind(record.id).first();
  assert.equal(row.status, "pending");
  const openQueue = await env.DB
    .prepare("SELECT state FROM moderation_queue WHERE entity = 'camera' AND entity_id = ? AND state != 'closed'")
    .bind(record.id)
    .first();
  assert.equal(openQueue.state, "queued", "an upheld appeal reopens the queue for a fresh decision");

  const events = await auditEvents();
  assert.equal(events.length, 3);
  assert.equal(events[2].action, "appeal-uphold");
  assert.equal(events[2].appeal_id, appealId);
  assert.equal(events[2].previous_status, "verified");
  assert.equal(events[2].new_status, "pending");
});

test("decideAppeal: the original reviewer is blocked; escalation needs a note and the administrator resolves it", async () => {
  const record = await submitPending();
  await moderation.moderateCamera(record.id, "approve", "verified-public-infrastructure", null, undefined, {
    actorId: SENIOR.id,
  });
  const decision = (await auditEvents())[0];
  const filed = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Contesting the approval",
  });
  assert.equal(filed.kind, "ok");
  const appealId = filed.appeal.id;

  // The senior moderator who made the original decision is blocked.
  const original = await appeals.decideAppeal({ id: appealId, decision: "dismiss", reviewer: SENIOR, note: "Stands" });
  assert.equal(original.kind, "original_reviewer");

  // Escalation requires a note.
  const noNote = await appeals.decideAppeal({ id: appealId, decision: "escalate", reviewer: ADMIN, note: null });
  assert.equal(noNote.kind, "escalation_requires_note");

  // The administrator escalates, then only the administrator can decide.
  const escalated = await appeals.decideAppeal({
    id: appealId,
    decision: "escalate",
    reviewer: ADMIN,
    note: "Sensitive location dispute",
  });
  assert.equal(escalated.kind, "ok");
  assert.equal(escalated.appeal.status, "escalated");

  const seniorOnEscalated = await appeals.decideAppeal({
    id: appealId,
    decision: "dismiss",
    reviewer: SENIOR,
    note: "Still standing",
  });
  assert.equal(seniorOnEscalated.kind, "forbidden");

  const adminDismisses = await appeals.decideAppeal({
    id: appealId,
    decision: "dismiss",
    reviewer: ADMIN,
    note: "Original decision stands",
  });
  assert.equal(adminDismisses.kind, "ok");
  assert.equal(adminDismisses.appeal.status, "dismissed");

  // A dismissed appeal changes nothing: the record stays verified.
  const row = await env.DB.prepare("SELECT status FROM cameras WHERE id = ?").bind(record.id).first();
  assert.equal(row.status, "verified");
});

test("listAppeals returns the joined display fields, newest first", async () => {
  const record = await submitPending();
  await moderation.moderateCamera(record.id, "reject", "insufficient-evidence", null, undefined, { actorId: INTAKE.id });
  const decision = (await auditEvents())[0];
  await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "First appeal",
  });

  const secondRecord = await submitPending();
  await moderation.moderateCamera(secondRecord.id, "reject", "insufficient-evidence", null, undefined, {
    actorId: INTAKE.id,
  });
  const secondDecision = (await auditEvents()).find((event) => event.entity_id === secondRecord.id);
  await appeals.fileAppeal({
    entity: "camera",
    entityId: secondRecord.id,
    decisionEventId: secondDecision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "Second appeal",
  });

  const list = await appeals.listAppeals();
  assert.equal(list.length, 2);
  assert.equal(list[0].reason, "Second appeal", "list is newest first");
  assert.equal(list[0].appellantName, "Demo Contributor");
  assert.equal(list[0].decisionAction, "reject");
  assert.equal(list[1].reason, "First appeal");
});

test("users module: role helpers and reviewer linkage are consistent with the seed", async () => {
  const contributor = await users.getUserByEmail("contributor@osdb.test");
  assert.equal(contributor.role, "contributor");
  assert.equal(contributor.active, 1);
  assert.equal(users.roleAtLeast("moderator", "contributor"), true);
  assert.equal(users.roleAtLeast("contributor", "moderator"), false);
  assert.equal(users.roleAtLeast("admin", "admin"), true);

  const senior = await users.getUserByEmail("senior@osdb.test");
  assert.equal(senior.role, "moderator");
  const linked = await users.getReviewerByUserId(senior.id);
  assert.equal(linked.id, SENIOR.id);
  assert.equal(linked.role, "senior_moderator");

  // Deactivating a user makes the identity unusable for authz (401 path).
  await users.setUserActive(contributor.id, false);
  const inactive = await users.getUserByEmail("contributor@osdb.test");
  assert.equal(inactive.active, 0);
});
