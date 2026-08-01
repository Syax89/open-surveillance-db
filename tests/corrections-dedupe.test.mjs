// C4 (COMMUNITY_PLAN §2.4) — report dedupe, moderation routing and the
// removal journey, exercised against the REAL database layer.
//
// These integration tests run db/corrections.ts, db/cameras.ts,
// db/moderation.ts and db/appeals.ts (the same SQL the deployed Workers
// runtime executes) against a fresh in-memory SQLite database whose schema
// is applied by replaying the real Drizzle migrations (applyDrizzleMigrations),
// exactly like `wrangler d1 migrations apply` on a fresh local DB — including
// migration 0024 (the two partial unique dedupe indexes).
//
// The suite pins the QA acceptance criteria for the abuso/rimozione area:
//
//   A5 — dedupe: one open report per (submitter, target) answers
//        `duplicate_open` (409 at the route); a repeat report by the same
//        submitter on a target already removed following their report
//        answers `already_removed` (409). Both are race-safe: the partial
//        unique indexes from migration 0024 make concurrent duplicates land
//        exactly one row. Anonymous reporters are keyed only by "no
//        contributor_id" — no IP or identifier is stored.
//   A3 — removal/abuse requests surface in the existing moderation queue
//        (`moderateCorrection`) and every decision writes an append-only
//        `moderation_events` row.
//   A6 — removal approved -> record removed -> the record leaves every
//        public surface (edit surface blocked: the public record 404s, and
//        the owner-edit 409 gate is pinned by C3/E4 once the PATCH route
//        lands) -> an appeal against the removal decision is still possible.
//
// No personal data is used: all fixtures are fictional.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
  seedDemoIdentities,
} from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

let runtime;
let cameras;
let corrections;
let moderation;
let auth;
let appeals;
let db;

const REASON = {
  verified: "verified-public-infrastructure",
  privacy: "privacy-or-safety-concern",
};

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  // Demo identities give fileAppeal its appellant row (user id 6,
  // role 'contributor') and the moderators/reviewers for decisions.
  await seedDemoIdentities(db);
  runtime.env.DB = db;
  cameras = runtime.cameras;
  corrections = runtime.corrections;
  moderation = runtime.moderation;
  auth = runtime.auth;
  appeals = runtime.appeals;
});

after(async () => cleanupDbRuntime());

const reportInput = {
  title: "Corner shop entrance",
  kind: "Fixed dome",
  manufacturer: null,
  observedOn: null,
  address: "Illustrative street 1",
  notes: "Private internal note — must never be published",
  latitude: 41.9004,
  longitude: 12.4936,
};

async function newContributor(email) {
  const contributor = await auth.createContributor({
    email,
    displayName: email.split("@")[0],
    password: "correct horse battery staple",
  });
  return contributor.id;
}

async function newCamera(title = "Camera under report") {
  const report = await cameras.createPendingCamera({ ...reportInput, title });
  await moderation.moderateCamera(report.id, "approve", REASON.verified, null, {
    publishManufacturer: false,
    publishObservedOn: false,
  });
  return report.id;
}

// ---------------------------------------------------------------------------
// A5 — dedupe
// ---------------------------------------------------------------------------

test("A5: a logged-in contributor cannot open a second report on the same camera", async () => {
  const contributorId = await newContributor("alice@example.test");
  const cameraId = await newCamera();

  const first = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "inaccurate",
    message: "The kind label is wrong.",
    contact: null,
    contributorId,
  });
  assert.equal(first.kind, "created");
  assert.equal(first.correction.contributorId, contributorId);

  const second = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "removal",
    message: "Same contributor, same target, open report.",
    contact: null,
    contributorId,
  });
  assert.equal(second.kind, "duplicate_open", "an open report for (contributor, camera) must dedupe");
});

test("A5: different contributors may each open a report on the same camera", async () => {
  const alice = await newContributor("alice@example.test");
  const bob = await newContributor("bob@example.test");
  const cameraId = await newCamera();

  const first = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "inaccurate",
    message: "Alice reports a wrong kind.",
    contact: null,
    contributorId: alice,
  });
  assert.equal(first.kind, "created");

  const second = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "abuse",
    message: "Bob reports the same camera independently.",
    contact: null,
    contributorId: bob,
  });
  assert.equal(second.kind, "created", "a different submitter is not a duplicate");
});

test("A5: a contributor may report a different camera while one report is open", async () => {
  const contributorId = await newContributor("alice@example.test");
  const cameraA = await newCamera("Camera A");
  const cameraB = await newCamera("Camera B");

  await corrections.createCorrectionRequest({
    cameraId: cameraA,
    issueType: "inaccurate",
    message: "Report on A.",
    contact: null,
    contributorId,
  });
  const second = await corrections.createCorrectionRequest({
    cameraId: cameraB,
    issueType: "missing",
    message: "Report on B — different target, allowed.",
    contact: null,
    contributorId,
  });
  assert.equal(second.kind, "created");
});

test("A5: anonymous reporters are deduped per camera without storing any identifier", async () => {
  const cameraId = await newCamera();

  const first = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "removal",
    message: "Anonymous report one.",
    contact: null,
  });
  assert.equal(first.kind, "created");
  assert.equal(first.correction.contributorId, null, "anonymous stays unattributed");

  const second = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "abuse",
    message: "Anonymous report two on the same camera.",
    contact: null,
  });
  assert.equal(second.kind, "duplicate_open", "one open anonymous report per camera");

  const otherCamera = await newCamera("Other camera");
  const third = await corrections.createCorrectionRequest({
    cameraId: otherCamera,
    issueType: "removal",
    message: "Anonymous report on a different camera.",
    contact: null,
  });
  assert.equal(third.kind, "created");
});

test("A5: targetless reports (no cameraId) are not deduped per-target", async () => {
  const first = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "removal",
    message: "General concern one.",
    contact: null,
  });
  assert.equal(first.kind, "created");
  const second = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "abuse",
    message: "General concern two.",
    contact: null,
  });
  assert.equal(second.kind, "created", "a targetless report cannot be deduped per (user, target)");
});

test("A5: a duplicate report on a record already removed following the submitter's report answers already_removed", async () => {
  const contributorId = await newContributor("alice@example.test");
  const cameraId = await newCamera();

  const report = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "removal",
    message: "This camera faces a private courtyard.",
    contact: null,
    contributorId,
  });
  assert.equal(report.kind, "created");

  // Moderator hides the record, then approves the removal request.
  await moderation.moderateCamera(cameraId, "hide", REASON.privacy, "Urgent hide pending review");
  const decided = await moderation.moderateCorrection(report.correction.id, "approve", REASON.privacy, "Record removed after review", {
    cameraId,
    outcome: "removed",
  });
  assert.equal(decided.item.status, "reviewed");
  assert.equal(decided.item.outcome, "removed");

  // Same submitter re-reports the same target: already handled.
  const repeat = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "removal",
    message: "It is still there!",
    contact: null,
    contributorId,
  });
  assert.equal(repeat.kind, "already_removed");

  // A different submitter is not a duplicate of the resolved report.
  const other = await newContributor("bob@example.test");
  const fresh = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "abuse",
    message: "Bob files an independent report.",
    contact: null,
    contributorId: other,
  });
  assert.equal(fresh.kind, "created", "a new submitter is not a duplicate of a resolved removal");
});

test("A5: a resolved report no longer blocks a fresh report by the same submitter", async () => {
  const contributorId = await newContributor("alice@example.test");
  const cameraId = await newCamera();

  const report = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "inaccurate",
    message: "Wrong kind label.",
    contact: null,
    contributorId,
  });
  await moderation.moderateCorrection(report.correction.id, "reject", "duplicate", "Already covered");

  const again = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "missing",
    message: "New, distinct report after the rejection.",
    contact: null,
    contributorId,
  });
  assert.equal(again.kind, "created", "only open (pending) reports dedupe");
});

test("A5 (race): two concurrent identical reports land exactly one row", async () => {
  const contributorId = await newContributor("alice@example.test");
  const cameraId = await newCamera();

  const [a, b] = await Promise.all([
    corrections.createCorrectionRequest({
      cameraId,
      issueType: "removal",
      message: "Race report.",
      contact: null,
      contributorId,
    }),
    corrections.createCorrectionRequest({
      cameraId,
      issueType: "removal",
      message: "Race report.",
      contact: null,
      contributorId,
    }),
  ]);
  const kinds = [a.kind, b.kind].sort();
  assert.deepEqual(kinds, ["created", "duplicate_open"], "the partial unique index must yield exactly one row");
  const count = db.prepare("SELECT COUNT(*) AS n FROM correction_requests WHERE camera_id = ?").bind(cameraId).first();
  assert.equal(Number(count.n), 1);
});

// ---------------------------------------------------------------------------
// A3 — removal/abuse routing to the existing moderation queue
// ---------------------------------------------------------------------------

test("A3: removal and abuse requests surface in the moderation queue and decisions write append-only events", async () => {
  const cameraId = await newCamera();
  const removal = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "removal",
    message: "Faces a private window.",
    contact: null,
  });
  assert.equal(removal.kind, "created");

  const abuse = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "abuse",
    message: "General abuse concern.",
    contact: null,
  });
  assert.equal(abuse.kind, "created");

  const queue = await moderation.listPendingModerationItems();
  assert.ok(
    queue.correctionRequests.some((item) => item.id === removal.correction.id),
    "removal requests must surface in the existing correction queue",
  );
  assert.ok(
    queue.correctionRequests.some((item) => item.id === abuse.correction.id),
    "abuse requests must surface in the existing correction queue",
  );

  const decided = await moderation.moderateCorrection(removal.correction.id, "reject", "duplicate", "Already reported");
  assert.equal(decided.kind, "ok");
  assert.equal(decided.event.entity, "correction");
  assert.equal(decided.event.entityId, removal.correction.id);
  assert.equal(decided.event.previousStatus, "pending");
  assert.equal(decided.event.newStatus, "rejected");

  // Append-only: exactly one decision event, and a second decision cannot apply.
  const again = await moderation.moderateCorrection(removal.correction.id, "approve", REASON.privacy, null);
  assert.equal(again.kind, "not_found");
  const events = db.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = 'correction' AND entity_id = ?").bind(removal.correction.id).first();
  assert.equal(Number(events.n), 1, "decisions must be written exactly once (append-only)");
});

// ---------------------------------------------------------------------------
// A6 — removal journey: approved removal -> record removed -> appeal possible
// ---------------------------------------------------------------------------

test("A6: an approved removal takes the record off every public surface and an appeal is still possible", async () => {
  const cameraId = await newCamera("Targeted camera");
  const report = await corrections.createCorrectionRequest({
    cameraId,
    issueType: "removal",
    message: "This camera is aimed at a private courtyard.",
    contact: null,
  });
  assert.equal(report.kind, "created");

  // Public before the decision.
  assert.ok((await cameras.listPublicCameras()).some((r) => r.id === cameraId));

  // Moderator hides the record and approves the removal request.
  await moderation.moderateCamera(cameraId, "hide", REASON.privacy, "Urgent hide pending review");
  const decided = await moderation.moderateCorrection(report.correction.id, "approve", REASON.privacy, "Record removed after review", {
    cameraId,
    outcome: "removed",
  });
  assert.equal(decided.item.status, "reviewed");
  assert.equal(decided.item.outcome, "removed");

  // The record is gone from every public surface (E4 precondition: the edit
  // surface on a removed record 409s in C3; here the record itself 404s).
  assert.equal(
    (await cameras.listPublicCameras()).some((r) => r.id === cameraId),
    false,
    "the removed record must disappear from the public list",
  );
  assert.equal(
    await cameras.getPublicCameraById(cameraId),
    null,
    "the removed record must 404 on the by-id lookup",
  );

  // The removal decision is still appealable (fileAppeal, user id 6 =
  // demo contributor).
  const appeal = await appeals.fileAppeal({
    entity: "correction",
    entityId: report.correction.id,
    decisionEventId: decided.event.id,
    appellantId: 6,
    reason: "The camera is public infrastructure on a public street; the removal was based on a mistake.",
  });
  assert.equal(appeal.kind, "ok", "an appeal against the removal decision must be possible");
  assert.equal(appeal.appeal.status, "pending");
});
