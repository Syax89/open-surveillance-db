// H1 — expand tests around each status transition and its public visibility.
//
// These integration tests run the real database layer (db/cameras.ts and
// db/moderation.ts — same SQL the deployed Workers runtime executes) against
// a fresh in-memory SQLite database per test. They prove, at runtime:
//
//   1. every legal status transition and its moderation event;
//   2. every illegal transition is a no-op (no status change, no event);
//   3. each status's public visibility in the shared public list and in the
//      nearby search (the single boundary behind JSON/GeoJSON/CSV);
//   4. the full pending -> verified -> needs_review -> verified lifecycle;
//   5. correction-request decisions stay private and record their events;
//   6. malformed moderation input cannot change any status.
//
// The suite is repeatable from an empty database: the schema is applied by
// replaying the real Drizzle migrations (applyDrizzleMigrations), exactly
// like `wrangler d1 migrations apply` on a fresh local DB — no runtime
// demo seeding (H3) and no network access.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

let runtime;
let cameras;
let moderation;
let db;

const REASON = {
  verified: "verified-public-infrastructure",
  duplicate: "duplicate",
  sensitive: "private-or-sensitive-location",
  stale: "inaccurate-or-outdated",
};

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  // H3: the schema is delivered by the Drizzle migrations (0000-0005),
  // exactly like `wrangler d1 migrations apply` on a fresh local DB.
  // There is no runtime table creation and no demo seeding anymore.
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  cameras = runtime.cameras;
  moderation = runtime.moderation;
});

after(async () => cleanupDbRuntime());

async function submitReport(overrides = {}) {
  return cameras.createPendingCamera({
    title: "Corner shop entrance",
    kind: "Dome",
    manufacturer: "Acme Cameras",
    observedOn: "2026-07-01",
    address: "Via Roma 1",
    notes: "Private internal note — must never be published",
    latitude: 41.9005,
    longitude: 12.4937,
    ...overrides,
  });
}

// Bring a freshly submitted (pending) camera into the requested status.
async function toStatus(id, status, reason = REASON.verified) {
  if (status === "pending") return;
  // "rejected" is only reachable directly from pending: reject from
  // verified is an illegal transition (verified allows mark-stale/hide).
  if (status === "rejected") {
    const decision = await moderation.moderateCamera(id, "reject", reason, null);
    assert.ok(decision, `reject on pending #${id} must succeed`);
    return;
  }
  const decision = await moderation.moderateCamera(id, "approve", reason, null);
  assert.ok(decision, `approve on pending #${id} must succeed`);
  if (status === "verified") return;
  const second =
    status === "removed"
      ? await moderation.moderateCamera(id, "hide", reason, null)
      : await moderation.moderateCamera(id, "mark-stale", reason, null);
  assert.ok(second, `second transition to ${status} on #${id} must succeed`);
}

async function statusOf(id) {
  const row = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(id).first();
  return row.status;
}

function expectEvent(event, expected) {
  assert.equal(event.entity, expected.entity);
  assert.equal(event.entityId, expected.entityId);
  assert.equal(event.previousStatus, expected.previousStatus);
  assert.equal(event.newStatus, expected.newStatus);
  assert.equal(event.action, expected.action);
  assert.equal(event.reasonCode, expected.reasonCode);
  assert.equal(event.note, expected.note ?? null);
  assert.equal(event.actor, "Local moderator");
  assert.equal(typeof event.id, "number");
  assert.match(event.createdAt, /^\d{4}-\d{2}-\d{2}T/);
}

async function eventCount() {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM moderation_events").first();
  return row.count;
}

function publicTitles(records) {
  return records.map((record) => record.title);
}

// ---------------------------------------------------------------------------
// Fresh database and intake
// ---------------------------------------------------------------------------

test("a fresh database starts empty: no demo records and empty moderation queues", async () => {
  const records = await cameras.listPublicCameras();
  assert.equal(records.length, 0, "no demo records may be seeded at runtime (H3)");

  const queue = await moderation.listPendingModerationItems();
  assert.deepEqual(queue.cameraReports, []);
  assert.deepEqual(queue.reviewCameras, []);
  assert.deepEqual(queue.correctionRequests, []);
  assert.deepEqual(queue.recentEvents, []);
});

test("a submitted camera starts pending and is absent from every public representation", async () => {
  const report = await submitReport();
  assert.equal(report.status, "pending");
  assert.equal(report.source, "Community report");
  assert.equal(report.publishManufacturer, 0);
  assert.equal(report.publishObservedOn, 0);

  const publicRecords = await cameras.listPublicCameras();
  assert.ok(!publicRecords.some((record) => record.id === report.id), "pending must not appear in the public list");

  const nearby = await cameras.findNearbyPublicCameras(41.9005, 12.4937, 200);
  assert.ok(!nearby.some((record) => record.id === report.id), "pending must not appear in nearby search");

  const queue = await moderation.listPendingModerationItems();
  assert.deepEqual(
    queue.cameraReports.map((item) => item.id),
    [report.id],
    "pending must appear in the moderation queue",
  );
  assert.deepEqual(queue.reviewCameras, []);
  assert.deepEqual(queue.correctionRequests, []);
});

// ---------------------------------------------------------------------------
// Legal transitions: each one updates the status and records an event
// ---------------------------------------------------------------------------

test("every legal camera transition updates the status and records an append-only event", async (t) => {
  const cases = [
    { from: "pending", action: "approve", to: "verified", updated: "ISO", reason: REASON.verified },
    { from: "pending", action: "reject", to: "rejected", updated: "Local moderation: rejected", reason: REASON.duplicate },
    { from: "pending", action: "hide", to: "removed", updated: "Local moderation: hidden from public listing", reason: REASON.sensitive },
    { from: "verified", action: "mark-stale", to: "needs_review", updated: "Local moderation: marked stale and queued for review", reason: REASON.stale },
    { from: "verified", action: "hide", to: "removed", updated: "Local moderation: hidden from public listing", reason: REASON.sensitive },
    { from: "needs_review", action: "reverify", to: "verified", updated: "ISO", reason: REASON.verified },
    { from: "needs_review", action: "hide", to: "removed", updated: "Local moderation: hidden from public listing", reason: REASON.sensitive },
  ];

  for (const { from, action, to, updated, reason } of cases) {
    await t.test(`${from} + ${action} -> ${to}`, async () => {
      const report = await submitReport({ title: `Transition ${from}->${to}` });
      await toStatus(report.id, from);

      const before = await eventCount();
      const decision = await moderation.moderateCamera(report.id, action, reason, "reviewer note");
      assert.ok(decision, `${action} on ${from} must succeed`);

      assert.equal(decision.item.status, to);
      if (updated === "ISO") {
        // Publicly visible transitions must record a comparable ISO verification
        // timestamp so the directory freshness filter stays meaningful; the
        // exact instant is not asserted, only the format.
        assert.match(decision.item.updated, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, "verified transitions must record an ISO 8601 verification timestamp");
        assert.ok(Number.isFinite(new Date(decision.item.updated).getTime()), "the ISO timestamp must be parseable");
      } else {
        assert.equal(decision.item.updated, updated);
      }
      assert.equal(await statusOf(report.id), to);

      expectEvent(decision.event, {
        entity: "camera",
        entityId: report.id,
        previousStatus: from,
        newStatus: to,
        action,
        reasonCode: reason,
        note: "reviewer note",
      });

      assert.equal(await eventCount(), before + 1, "exactly one event per transition");

      const queue = await moderation.listPendingModerationItems();
      const eventInHistory = queue.recentEvents.some((event) => event.entityId === report.id && event.action === action);
      assert.ok(eventInHistory, "the event must be readable from the moderation history");
    });
  }
});

// ---------------------------------------------------------------------------
// Illegal transitions: no status change, no event
// ---------------------------------------------------------------------------

test("every illegal camera transition is a no-op: status unchanged and no event recorded", async (t) => {
  const cases = [
    { from: "pending", actions: ["reverify", "mark-stale"] },
    { from: "verified", actions: ["approve", "reject", "reverify"] },
    { from: "needs_review", actions: ["approve", "reject", "mark-stale"] },
    { from: "rejected", actions: ["approve", "reject", "hide", "mark-stale", "reverify"] },
    { from: "removed", actions: ["approve", "reject", "hide", "mark-stale", "reverify"] },
  ];

  for (const { from, actions } of cases) {
    for (const action of actions) {
      await t.test(`${from} + ${action} is rejected`, async () => {
        const report = await submitReport({ title: `Noop ${from}->${action}` });
        await toStatus(report.id, from, REASON.duplicate);

        const before = await eventCount();
        const decision = await moderation.moderateCamera(report.id, action, REASON.duplicate, null);

        assert.equal(decision.kind, "not_found");
        assert.equal(await statusOf(report.id), from, "status must stay unchanged");
        assert.equal(await eventCount(), before, "no event may be recorded for an illegal transition");
      });
    }
  }
});

test("moderating a missing camera or a demo record returns null and writes nothing", async () => {
  const before = await eventCount();

  const missing = await moderation.moderateCamera(9999, "approve", REASON.verified, null);
  assert.equal(missing.kind, "not_found");

  // H3: demo records are never seeded at runtime. A record can still land in
  // the reserved 'demo' status via a direct database edit, and it must not
  // be moderateable (the public query whitelists demo, moderation does not).
  const report = await submitReport({ title: "Demo-status camera" });
  await db.prepare("UPDATE cameras SET status = 'demo' WHERE id = ?").bind(report.id).run();
  const decision = await moderation.moderateCamera(report.id, "approve", REASON.verified, null);
  assert.equal(decision.kind, "not_found", "demo record must not be moderateable");

  assert.equal(await eventCount(), before);
});

// ---------------------------------------------------------------------------
// Public visibility per status — the single boundary behind JSON/GeoJSON/CSV
// ---------------------------------------------------------------------------

test("only verified and demo cameras are publicly visible; every other status disappears", async (t) => {
  const visibility = [
    { status: "pending", visible: false },
    { status: "verified", visible: true },
    { status: "needs_review", visible: false },
    { status: "rejected", visible: false },
    { status: "removed", visible: false },
    { status: "demo", visible: true },
  ];

  for (const { status, visible } of visibility) {
    await t.test(`${status} -> ${visible ? "visible" : "hidden"}`, async () => {
      const report = await submitReport({ title: `Visibility ${status}`, latitude: 41.9, longitude: 12.5 });
      if (status === "demo") {
        // H3: demo is not a moderation-reachable status; simulate the legacy
        // reserved status with a direct database edit.
        await db.prepare("UPDATE cameras SET status = 'demo' WHERE id = ?").bind(report.id).run();
      } else {
        await toStatus(report.id, status);
      }

      const publicRecords = await cameras.listPublicCameras();
      assert.equal(
        publicRecords.some((record) => record.id === report.id),
        visible,
        `status ${status} must ${visible ? "appear in" : "stay out of"} the public list`,
      );

      const nearby = await cameras.findNearbyPublicCameras(41.9, 12.5, 100);
      assert.equal(
        nearby.some((record) => record.id === report.id),
        visible,
        `status ${status} must ${visible ? "appear in" : "stay out of"} nearby search`,
      );
    });
  }
});

test("approving a camera publishes it; marking it stale withdraws it; reverifying republishes it", async () => {
  const report = await submitReport({ title: "Lifecycle camera" });

  // pending -> verified: published.
  const approved = await moderation.moderateCamera(report.id, "approve", REASON.verified, null);
  assert.equal(approved.item.status, "verified");
  assert.ok(publicTitles(await cameras.listPublicCameras()).includes("Lifecycle camera"));

  // verified -> needs_review: withdrawn from public output.
  const stale = await moderation.moderateCamera(report.id, "mark-stale", REASON.stale, "sensor drift");
  assert.equal(stale.item.status, "needs_review");
  assert.ok(!publicTitles(await cameras.listPublicCameras()).includes("Lifecycle camera"));
  assert.ok(!(await cameras.findNearbyPublicCameras(41.9005, 12.4937, 200)).some((record) => record.id === report.id));

  // needs_review -> verified: published again.
  const reverified = await moderation.moderateCamera(report.id, "reverify", REASON.verified, null);
  assert.equal(reverified.item.status, "verified");
  assert.ok(publicTitles(await cameras.listPublicCameras()).includes("Lifecycle camera"));
});

test("private notes never leak into the public list, even after approval", async () => {
  const report = await submitReport({ notes: "Contains the word pending plus a private phone number" });
  await moderation.moderateCamera(report.id, "approve", REASON.verified, null);

  const publicRecord = (await cameras.listPublicCameras()).find((record) => record.id === report.id);
  assert.ok(publicRecord, "approved camera must be public");
  assert.ok(!Object.hasOwn(publicRecord, "notes"), "notes column must not exist on public records");
  assert.doesNotMatch(JSON.stringify(publicRecord), /private phone number/);
});

test("metadata publication choices control manufacturer and observed-on on the public list", async () => {
  const report = await submitReport({ manufacturer: "Public Brand", observedOn: "2026-07-01" });

  // Default approve keeps both private.
  await moderation.moderateCamera(report.id, "approve", REASON.verified, null);
  let publicRecord = (await cameras.listPublicCameras()).find((record) => record.id === report.id);
  assert.equal(publicRecord.manufacturer, null);
  assert.equal(publicRecord.observedOn, null);
  assert.equal(publicRecord.publishManufacturer, 0);

  // A fresh report approved with explicit choices publishes only manufacturer.
  const second = await submitReport({ title: "Metadata camera 2", manufacturer: "Public Brand", observedOn: "2026-07-01" });
  await moderation.moderateCamera(second.id, "approve", REASON.verified, null, {
    publishManufacturer: true,
    publishObservedOn: false,
  });
  publicRecord = (await cameras.listPublicCameras()).find((record) => record.id === second.id);
  assert.equal(publicRecord.manufacturer, "Public Brand");
  assert.equal(publicRecord.observedOn, null);
  assert.equal(publicRecord.publishManufacturer, 1);
  assert.equal(publicRecord.publishObservedOn, 0);
});

test("rejecting a pending camera never touches its publication flags", async () => {
  const report = await submitReport({ manufacturer: "Brand X" });
  await moderation.moderateCamera(report.id, "reject", REASON.duplicate, null, {
    publishManufacturer: true,
    publishObservedOn: true,
  });
  const row = await db.prepare("SELECT publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn FROM cameras WHERE id = ?").bind(report.id).first();
  assert.deepEqual(row, { publishManufacturer: 0, publishObservedOn: 0 }, "publication choices apply only to pending+approve");
});

// ---------------------------------------------------------------------------
// Event history: append-only and correctly ordered
// ---------------------------------------------------------------------------

test("a full lifecycle writes three ordered events with correct previous/new statuses", async () => {
  const report = await submitReport({ title: "Event trail camera" });

  await moderation.moderateCamera(report.id, "approve", REASON.verified, "ok");
  await moderation.moderateCamera(report.id, "mark-stale", REASON.stale, "drift");

  // Mid-lifecycle: the stale record must sit in the review queue.
  const midQueue = await moderation.listPendingModerationItems();
  assert.deepEqual(
    midQueue.reviewCameras.map((item) => item.id),
    [report.id],
    "the stale record must sit in the review queue",
  );

  await moderation.moderateCamera(report.id, "reverify", REASON.verified, null);

  const queue = await moderation.listPendingModerationItems();
  const events = queue.recentEvents.filter((event) => event.entityId === report.id);
  assert.equal(events.length, 3);

  // History is newest first.
  assert.deepEqual(
    events.map((event) => [event.previousStatus, event.newStatus]),
    [
      ["needs_review", "verified"],
      ["verified", "needs_review"],
      ["pending", "verified"],
    ],
  );
  for (const event of events) {
    expectEvent(event, {
      entity: "camera",
      entityId: report.id,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      action: event.action,
      reasonCode: event.reasonCode,
      note: event.note,
    });
  }

  // After reverify the record leaves the review queue and is published again.
  assert.deepEqual(
    queue.reviewCameras.map((item) => item.id),
    [],
    "after reverify the record must leave the review queue",
  );
  assert.ok(
    queue.publishedCameras.some((item) => item.id === report.id),
    "after reverify the record must be published again",
  );
});

// ---------------------------------------------------------------------------
// Correction lifecycle: decisions stay private and are recorded
// ---------------------------------------------------------------------------

test("correction decisions record events and never touch public output", async () => {
  const report = await submitReport();
  await moderation.moderateCamera(report.id, "approve", REASON.verified, null);

  const insert = await db
    .prepare(
      "INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, created_at) VALUES (?, 'wrong-location', 'The camera moved', NULL, 'pending', ?)",
    )
    .bind(report.id, "2026-07-31T09:00:00.000Z")
    .run();

  const correctionId = Number(insert.meta.lastRowId);
  const queue = await moderation.listPendingModerationItems();
  assert.deepEqual(queue.correctionRequests.map((item) => item.id), [correctionId]);

  // Approve -> reviewed + event.
  const approved = await moderation.moderateCorrection(correctionId, "approve", REASON.verified, "location fixed");
  assert.equal(approved.item.status, "reviewed");
  expectEvent(approved.event, {
    entity: "correction",
    entityId: correctionId,
    previousStatus: "pending",
    newStatus: "reviewed",
    action: "approve",
    reasonCode: REASON.verified,
    note: "location fixed",
  });

  // Re-deciding an already processed correction is a no-op.
  const before = await eventCount();
  const again = await moderation.moderateCorrection(correctionId, "reject", REASON.duplicate, null);
  assert.equal(again.kind, "not_found");
  assert.equal(await eventCount(), before);

  // A second correction can be rejected -> rejected + event.
  const insert2 = await db
    .prepare(
      "INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, created_at) VALUES (?, 'inaccurate', 'Wrong date', NULL, 'pending', ?)",
    )
    .bind(report.id, "2026-07-31T09:05:00.000Z")
    .run();
  const secondId = Number(insert2.meta.lastRowId);
  const rejected = await moderation.moderateCorrection(secondId, "reject", REASON.duplicate, null);
  assert.equal(rejected.item.status, "rejected");
  expectEvent(rejected.event, {
    entity: "correction",
    entityId: secondId,
    previousStatus: "pending",
    newStatus: "rejected",
    action: "reject",
    reasonCode: REASON.duplicate,
    note: null,
  });

  // Corrections never appear in any public representation.
  const publicRecords = await cameras.listPublicCameras();
  assert.ok(!publicRecords.some((record) => JSON.stringify(record).includes("The camera moved")));
  const queueAfter = await moderation.listPendingModerationItems();
  assert.deepEqual(queueAfter.correctionRequests, [], "processed corrections leave the pending queue");
});

// ---------------------------------------------------------------------------
// Malformed moderation input cannot change any status (DB layer)
// ---------------------------------------------------------------------------

test("malformed actions and identifiers leave every status untouched", async () => {
  const report = await submitReport({ title: "Fuzz target" });
  await toStatus(report.id, "verified");

  const malformed = [null, 42, "", "approve ", "APPROVE", "approve\n", "DELETE FROM cameras", "drop table cameras"];
  const before = await eventCount();
  for (const action of malformed) {
    const decision = await moderation.moderateCamera(report.id, action, REASON.verified, null);
    assert.equal(decision.kind, "not_found", `action ${JSON.stringify(action)} must be rejected`);
  }
  assert.equal(await statusOf(report.id), "verified");
  assert.equal(await eventCount(), before);
});
