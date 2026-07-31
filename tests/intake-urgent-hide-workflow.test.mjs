// Wave B (Data & Trust) — private correction/removal intake + urgent-hide
// workflow, exercised against the REAL database layer.
//
// These integration tests run db/cameras.ts, db/corrections.ts and
// db/moderation.ts (the same SQL the deployed Workers runtime executes)
// against a fresh in-memory SQLite database whose schema is applied by
// replaying the real Drizzle migrations (applyDrizzleMigrations), exactly
// like `wrangler d1 migrations apply` on a fresh local DB.
//
// The suite proves, at runtime:
//
//   1. the intake of a correction/removal request is private: the request is
//      stored as a private object and surfaces only in the moderation queue,
//      never in any public representation;
//   2. a plain correction request never alters the referenced public record;
//   3. the urgent-hide workflow: a verified (or pending / under-review /
//      stale) record disappears immediately and permanently from every public
//      surface when an intake reviewer applies the urgent hide;
//   4. every hide writes an auditable event (previousStatus → newStatus,
//      reason code, note, actor) that a retrospective review can use —
//      emergency hiding requires a single actor, not two reviewers;
//   5. a privacy/safety request can be resolved against the hidden record
//      with a recorded outcome, and the resolved request leaves the queue;
//   6. compare-and-set guards keep concurrent decisions from double-applying.
//
// No personal data is used: all fixtures are fictional.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

let runtime;
let cameras;
let corrections;
let moderation;
let db;

const REASON = {
  verified: "verified-public-infrastructure",
  duplicate: "duplicate",
  sensitive: "private-or-sensitive-location",
  privacy: "privacy-or-safety-concern",
  stale: "inaccurate-or-outdated",
};

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  cameras = runtime.cameras;
  corrections = runtime.corrections;
  moderation = runtime.moderation;
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

function publicRecordById(records, id) {
  return records.find((record) => record.id === id);
}

// Submit a report and bring it to the requested lifecycle status.
async function toStatus(id, status, reason = REASON.verified) {
  if (status === "pending") return;
  const approved = await moderation.moderateCamera(id, "approve", reason, null, {
    publishManufacturer: false,
    publishObservedOn: false,
  });
  assert.ok(approved, `approve on pending #${id} must succeed`);
  if (status === "verified") return;
  const secondReason = status === "removed" ? REASON.privacy : REASON.stale;
  const second =
    status === "rejected"
      ? await moderation.moderateCamera(id, "reject", reason, null)
      : status === "removed"
        ? await moderation.moderateCamera(id, "hide", secondReason, null)
        : await moderation.moderateCamera(id, "mark-stale", secondReason, null);
  assert.ok(second, `second transition to ${status} on #${id} must succeed`);
}

// ---------------------------------------------------------------------------
// Private correction/removal intake
// ---------------------------------------------------------------------------

test("a correction request is stored privately and only surfaces in the moderation queue", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  const request = await corrections.createCorrectionRequest({
    cameraId: report.id,
    issueType: "No longer present",
    message: "The camera has been removed from the pole.",
    contact: "reporter@example.test",
  });

  assert.ok(request.id > 0, "the intake must return a private reference id");
  assert.equal(request.status, "pending");
  assert.equal(request.cameraId, report.id);
  assert.equal(request.issueType, "No longer present");
  assert.equal(request.message, "The camera has been removed from the pole.");
  assert.equal(request.contact, "reporter@example.test");

  const queue = await moderation.listPendingModerationItems();
  const listed = queue.correctionRequests.find((item) => item.id === request.id);
  assert.ok(listed, "pending correction requests must be visible to the moderation queue");
  assert.equal(listed.status, "pending");

  // The request is not a camera: no public representation can contain it.
  const records = await cameras.listPublicCameras();
  for (const record of records) {
    assert.notEqual(record.title, request.message);
    assert.notEqual(record.title, request.issueType);
  }
});

test("a removal-style intake accepts a request without an identifiable cameraId", async () => {
  const request = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "Privacy concern",
    message: "A camera on Via Roma appears to face a private courtyard.",
    contact: null,
  });
  assert.ok(request.id > 0);
  assert.equal(request.cameraId, null);
  assert.equal(request.status, "pending");

  const queue = await moderation.listPendingModerationItems();
  assert.ok(queue.correctionRequests.some((item) => item.id === request.id));
});

test("creating a correction request never alters the referenced camera", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");

  await corrections.createCorrectionRequest({
    cameraId: report.id,
    issueType: "Wrong location",
    message: "The coordinates look off.",
    contact: null,
  });

  const records = await cameras.listPublicCameras();
  const record = publicRecordById(records, report.id);
  assert.ok(record, "a plain correction request must not hide the record automatically");
  assert.equal(record.status, "verified");
  assert.equal(record.latitude, reportInput.latitude);
  assert.equal(record.longitude, reportInput.longitude);
});

// ---------------------------------------------------------------------------
// Urgent-hide workflow: public record → immediately non-public
// ---------------------------------------------------------------------------

test("a verified camera disappears from the public list after an urgent hide", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");

  const before = await cameras.listPublicCameras();
  assert.ok(publicRecordById(before, report.id), "the verified record must be public before the hide");

  // A private correction request arrives (privacy/safety concern).
  const request = await corrections.createCorrectionRequest({
    cameraId: report.id,
    issueType: "Privacy concern",
    message: "This camera appears to face a private window.",
    contact: null,
  });
  assert.ok(request.id > 0, "the request must return a private reference id");

  // The intake reviewer applies the urgent temporary hide — a single actor,
  // no two-reviewer requirement for the emergency action.
  const hidden = await moderation.moderateCamera(report.id, "hide", REASON.privacy, "Urgent hide pending review");
  assert.ok(hidden, "the urgent hide must succeed on a verified record");
  assert.equal(hidden.item.status, "removed");

  const after = await cameras.listPublicCameras();
  assert.equal(
    publicRecordById(after, report.id),
    undefined,
    "the hidden record must be removed from the public list immediately",
  );
});

test("an urgent hide removes the record from every public surface, not just the list", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");
  await moderation.moderateCamera(report.id, "hide", REASON.privacy, "Urgent hide pending review");

  // 1. Public list (JSON/GeoJSON/CSV are all derived from this query).
  assert.equal(publicRecordById(await cameras.listPublicCameras(), report.id), undefined);

  // 2. Record detail and the change-summary route share this gate.
  assert.equal(await cameras.getPublicCameraById(report.id), null, "by-id lookup must 404 the removed record");

  // 3. Nearby search (duplicate/proximity boundary) is public-list-only.
  const nearby = await cameras.findNearbyPublicCameras(reportInput.latitude, reportInput.longitude, 500);
  assert.equal(
    nearby.some((candidate) => candidate.id === report.id),
    false,
    "the removed record must not surface in nearby search",
  );
});

test("an urgent hide writes an auditable event with the full transition", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");

  const hidden = await moderation.moderateCamera(
    report.id,
    "hide",
    REASON.privacy,
    "Temporary hide while the privacy concern is assessed",
  );

  assert.equal(hidden.event.entity, "camera");
  assert.equal(hidden.event.entityId, report.id);
  assert.equal(hidden.event.previousStatus, "verified");
  assert.equal(hidden.event.newStatus, "removed");
  assert.equal(hidden.event.action, "hide");
  assert.equal(hidden.event.reasonCode, REASON.privacy);
  assert.equal(hidden.event.note, "Temporary hide while the privacy concern is assessed");
  assert.equal(hidden.event.actor, "Local moderator");
  assert.ok(!Number.isNaN(Date.parse(hidden.event.createdAt)), "event time must be a valid timestamp");

  const queue = await moderation.listPendingModerationItems();
  const matchingEvent = queue.recentEvents.find((event) => event.entityId === report.id);
  assert.ok(matchingEvent, "the hide must be visible in the recent audit events");
  assert.equal(matchingEvent.previousStatus, "verified");
  assert.equal(matchingEvent.newStatus, "removed");
});

test("both privacy/safety reason codes are accepted for the urgent hide", async () => {
  for (const [name, reason] of [
    ["privacy-or-safety-concern", REASON.privacy],
    ["private-or-sensitive-location", REASON.sensitive],
  ]) {
    const report = await cameras.createPendingCamera({ ...reportInput, title: `Camera ${name}` });
    await toStatus(report.id, "verified");
    const hidden = await moderation.moderateCamera(report.id, "hide", reason, null);
    assert.ok(hidden, `${name}: hide must succeed`);
    assert.equal(hidden.item.status, "removed", name);
    assert.equal(hidden.event.reasonCode, reason, name);
  }
});

test("an urgent hide also works on a record already under review", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "needs_review");
  assert.equal((await cameras.listPublicCameras()).some((r) => r.id === report.id), false);

  const hidden = await moderation.moderateCamera(report.id, "hide", REASON.privacy, null);
  assert.ok(hidden, "hide must be available on needs_review records");
  assert.equal(hidden.item.status, "removed");
  assert.equal(hidden.event.previousStatus, "needs_review");
});

test("an urgent hide also works on a stale record", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");
  await moderation.moderateCamera(report.id, "mark-stale", REASON.stale, null);
  await moderation.moderateCamera(report.id, "hide", REASON.privacy, null);
  assert.equal((await cameras.listPublicCameras()).some((r) => r.id === report.id), false);
});

test("a removed record cannot be reverted to a public status by any action", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");
  await moderation.moderateCamera(report.id, "hide", REASON.privacy, null);

  // No transition leads out of `removed` in the current lifecycle.
  for (const action of ["approve", "reject", "hide", "mark-stale", "reverify"]) {
    const attempt = await moderation.moderateCamera(report.id, action, REASON.privacy, null);
    assert.equal(attempt, null, `action ${action} must not revive a removed record`);
  }

  const records = await cameras.listPublicCameras();
  assert.equal(publicRecordById(records, report.id), undefined);
});

// ---------------------------------------------------------------------------
// Resolving the request against the hidden record (outcome association)
// ---------------------------------------------------------------------------

test("a privacy/safety request is resolved with a removed outcome against the hidden record", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");

  const request = await corrections.createCorrectionRequest({
    cameraId: report.id,
    issueType: "Safety concern",
    message: "The camera is aimed at a school entrance.",
    contact: null,
  });

  // Urgent hide first, then the documented outcome decision.
  const hidden = await moderation.moderateCamera(report.id, "hide", REASON.privacy, null);
  assert.equal(hidden.item.status, "removed");

  const resolved = await moderation.moderateCorrection(request.id, "approve", REASON.privacy, "Record removed after review", {
    cameraId: report.id,
    outcome: "removed",
  });
  assert.ok(resolved, "the request must be resolvable");
  assert.equal(resolved.item.status, "reviewed");
  assert.equal(resolved.item.outcome, "removed");
  assert.equal(resolved.item.cameraId, report.id);
  assert.equal(resolved.event.entity, "correction");
  assert.equal(resolved.event.previousStatus, "pending");
  assert.equal(resolved.event.newStatus, "reviewed");

  // The resolved request leaves the pending queue and stays private.
  const queue = await moderation.listPendingModerationItems();
  assert.equal(queue.correctionRequests.some((item) => item.id === request.id), false);
  assert.equal((await cameras.listPublicCameras()).some((r) => r.id === report.id), false);
});

test("a cameraId-less removal request can be resolved with a removed outcome", async () => {
  const request = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "Private/non-public",
    message: "This is a doorbell camera on private property.",
    contact: null,
  });

  const resolved = await moderation.moderateCorrection(request.id, "approve", REASON.sensitive, "Out of scope", {
    outcome: "removed",
  });
  assert.ok(resolved);
  assert.equal(resolved.item.status, "reviewed");
  assert.equal(resolved.item.outcome, "removed");

  const queue = await moderation.listPendingModerationItems();
  assert.equal(queue.correctionRequests.some((item) => item.id === request.id), false);
});

test("a correction request can be resolved with a reasoned, auditable decision", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  const request = await corrections.createCorrectionRequest({
    cameraId: report.id,
    issueType: "Privacy concern",
    message: "Faces a private window.",
    contact: null,
  });

  const approved = await moderation.moderateCorrection(request.id, "approve", REASON.verified, "Location generalised");
  assert.equal(approved.item.status, "reviewed");
  assert.equal(approved.event.entity, "correction");
  assert.equal(approved.event.previousStatus, "pending");
  assert.equal(approved.event.newStatus, "reviewed");

  // The request is no longer pending: resolving it twice must fail.
  const again = await moderation.moderateCorrection(request.id, "reject", REASON.duplicate, null);
  assert.equal(again, null);
});

test("a rejected correction request records its decision and leaves the pending queue", async () => {
  const request = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "Other",
    message: "Test message.",
    contact: null,
  });

  const rejected = await moderation.moderateCorrection(request.id, "reject", REASON.duplicate, "Already reported");
  assert.equal(rejected.item.status, "rejected");
  assert.equal(rejected.event.reasonCode, REASON.duplicate);

  const queue = await moderation.listPendingModerationItems();
  assert.equal(queue.correctionRequests.some((item) => item.id === request.id), false);
});

test("moderating a missing correction request returns null", async () => {
  const result = await moderation.moderateCorrection(9999, "approve", REASON.verified, null);
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Public boundary and queue separation at the database level
// ---------------------------------------------------------------------------

test("pending reports never appear in the public list", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  const records = await cameras.listPublicCameras();
  assert.equal(publicRecordById(records, report.id), undefined);
  assert.equal(report.status, "pending");
});

test("the public list returns only verified records on a migrated database", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "verified");
  await moderation.moderateCamera(report.id, "mark-stale", REASON.stale, null);

  const records = await cameras.listPublicCameras();
  for (const record of records) {
    assert.equal(record.status, "verified", `unexpected public status ${record.status}`);
  }
  assert.equal(publicRecordById(records, report.id), undefined);
});

test("the moderation queue separates pending, published, and review buckets", async () => {
  const pendingReport = await cameras.createPendingCamera(reportInput);
  const publishedReport = await cameras.createPendingCamera({ ...reportInput, title: "Second camera" });
  await toStatus(publishedReport.id, "needs_review");
  const request = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "Other",
    message: "Third-party request.",
    contact: null,
  });

  const queue = await moderation.listPendingModerationItems();
  assert.ok(queue.cameraReports.some((item) => item.id === pendingReport.id));
  assert.equal(queue.publishedCameras.some((item) => item.id === publishedReport.id), false);
  assert.ok(queue.reviewCameras.some((item) => item.id === publishedReport.id));
  assert.ok(queue.correctionRequests.some((item) => item.id === request.id));
  assert.ok(Array.isArray(queue.recentEvents) && queue.recentEvents.length >= 2);
});

test("recent audit events are ordered newest first", async () => {
  const report = await cameras.createPendingCamera(reportInput);
  await toStatus(report.id, "needs_review");

  const queue = await moderation.listPendingModerationItems();
  const timestamps = queue.recentEvents.map((event) => Date.parse(event.createdAt));
  for (let index = 1; index < timestamps.length; index += 1) {
    assert.ok(
      timestamps[index - 1] >= timestamps[index],
      "recent events must be sorted by descending creation time",
    );
  }
});

test("compare-and-set guards prevent a second concurrent decision from applying", async () => {
  const report = await cameras.createPendingCamera(reportInput);

  const first = await moderation.moderateCamera(report.id, "approve", REASON.verified, null, {
    publishManufacturer: false,
    publishObservedOn: false,
  });
  assert.ok(first, "the first decision must apply");

  const second = await moderation.moderateCamera(report.id, "approve", REASON.verified, null, {
    publishManufacturer: false,
    publishObservedOn: false,
  });
  assert.equal(second, null, "a second approve on the same status must not apply");

  const hidden = await moderation.moderateCamera(report.id, "hide", REASON.privacy, null);
  assert.ok(hidden);
  const hiddenAgain = await moderation.moderateCamera(report.id, "hide", REASON.privacy, null);
  assert.equal(hiddenAgain, null, "a second hide on the same status must not apply");

  // Exactly one audit event per applied decision.
  const queue = await moderation.listPendingModerationItems();
  const eventsForReport = queue.recentEvents.filter((event) => event.entityId === report.id);
  assert.equal(eventsForReport.length, 2);
});

test("moderating a missing camera returns null", async () => {
  const result = await moderation.moderateCamera(9999, "hide", REASON.privacy, null);
  assert.equal(result, null);
});
