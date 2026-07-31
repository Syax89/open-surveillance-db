// H3 — Moderation event audit trail.
//
// Runs the REAL db/moderation.ts SQL (transitions, event writes, queue) against
// a fresh in-memory SQLite database through the D1 adapter. Locks the audit
// contract documented in docs/MODERATION.md and docs/DATA_DICTIONARY.md:
// every legal transition writes exactly one moderation_events row with the
// full transition context (entity, entityId, previousStatus, newStatus,
// action, reasonCode, note, actor, createdAt); illegal transitions and
// unknown ids are no-ops that write nothing; the queue exposes the 50 most
// recent events newest-first; decisions never leak into public outputs.
//
// Route-level parsing (allowlist enforcement, trimming) is covered by
// tests/api-moderation.test.mjs; here the DB layer stores verbatim what the
// route hands it.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadTreeModule } from "./helpers/api-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { resetMockState } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

let treeEnv = null;
let realCameras = null;
let realCorrections = null;
let realModeration = null;

async function realDb() {
  if (!realCameras) {
    ({ env: treeEnv } = await loadTreeModule("cloudflare-workers.mjs"));
    realCameras = await loadTreeModule("db-real/cameras.mjs");
    realCorrections = await loadTreeModule("db-real/corrections.mjs");
    realModeration = await loadTreeModule("db-real/moderation.mjs");
  }
  return { env: treeEnv, cameras: realCameras, corrections: realCorrections, moderation: realModeration };
}

async function resetDb({ env }) {
  env.DB = new D1();
  // H3: the schema comes from the real Drizzle migrations (fresh-DB contract);
  // getD1() is a pure binding passthrough and bootstraps nothing.
  await applyDrizzleMigrations(env.DB);
  await env.DB.prepare("DELETE FROM cameras").run();
}

async function eventRows(env) {
  const rows = await env.DB.prepare("SELECT * FROM moderation_events ORDER BY id ASC").all();
  return rows.results;
}

async function makePendingCamera(env, cameras, title = "Event camera") {
  return cameras.createPendingCamera({
    title,
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
  });
}

test("approve records a full audit event and publishes the record", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);

  const decision = await moderation.moderateCamera(camera.id, "approve", "verified-public-infrastructure", "Looks legit", {
    publishManufacturer: true,
    publishObservedOn: false,
  });
  assert.equal(decision.item.status, "verified");
  assert.equal(decision.item.updated, "Local moderation: approved and verified");
  assert.equal(decision.item.publishManufacturer, 1);
  assert.equal(decision.item.publishObservedOn, 0);

  assert.deepEqual(decision.event, {
    id: 1,
    entity: "camera",
    entityId: camera.id,
    previousStatus: "pending",
    newStatus: "verified",
    action: "approve",
    reasonCode: "verified-public-infrastructure",
    note: "Looks legit",
    actor: "Local moderator",
    createdAt: decision.event.createdAt,
  });
  assert.match(decision.event.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  const rows = await eventRows(env);
  assert.equal(rows.length, 1, "exactly one event per transition");
  assert.equal(rows[0].entity_id, camera.id);
  assert.equal(rows[0].actor, "Local moderator");
});

test("reject and hide record their own events with the given reason", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const rejected = await makePendingCamera(env, cameras, "Rejected cam");
  const hidden = await makePendingCamera(env, cameras, "Hidden cam");

  const rejectDecision = await moderation.moderateCamera(rejected.id, "reject", "insufficient-evidence", "No photo");
  assert.equal(rejectDecision.item.status, "rejected");
  assert.equal(rejectDecision.event.newStatus, "rejected");
  assert.equal(rejectDecision.event.reasonCode, "insufficient-evidence");

  const hideDecision = await moderation.moderateCamera(hidden.id, "hide", "private-or-sensitive-location", null);
  assert.equal(hideDecision.item.status, "removed");
  assert.equal(hideDecision.event.newStatus, "removed");
  assert.equal(hideDecision.event.reasonCode, "private-or-sensitive-location");
  assert.equal(hideDecision.event.note, null);

  const rows = await eventRows(env);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.action), ["reject", "hide"]);
});

test("verified records can be marked stale and re-verified, each step recorded", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);

  await moderation.moderateCamera(camera.id, "approve", "verified-public-infrastructure", null);
  const stale = await moderation.moderateCamera(camera.id, "mark-stale", "inaccurate-or-outdated", "Seems gone");
  assert.equal(stale.item.status, "needs_review");
  assert.equal(stale.item.updated, "Local moderation: marked stale and queued for review");

  const reverified = await moderation.moderateCamera(camera.id, "reverify", "verified-public-infrastructure", null);
  assert.equal(reverified.item.status, "verified");
  assert.equal(reverified.item.updated, "Local moderation: re-verified");

  const rows = await eventRows(env);
  assert.deepEqual(rows.map((row) => ({ action: row.action, previous_status: row.previous_status, new_status: row.new_status })), [
    { action: "approve", previous_status: "pending", new_status: "verified" },
    { action: "mark-stale", previous_status: "verified", new_status: "needs_review" },
    { action: "reverify", previous_status: "needs_review", new_status: "verified" },
  ]);
});

test("invalid transitions return null and write no event", async (t) => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);

  const invalidActions = [
    ["reverify", "verified-public-infrastructure"],
    ["mark-stale", "inaccurate-or-outdated"],
  ];
  for (const [action, reasonCode] of invalidActions) {
    await t.test(`pending + ${action} is a no-op`, async () => {
      const result = await moderation.moderateCamera(camera.id, action, reasonCode, null);
      assert.equal(result, null);
      const rows = await eventRows(env);
      assert.equal(rows.length, 0, `${action} on a pending record must not write an event`);
    });
  }

  const verified = await moderation.moderateCamera(camera.id, "approve", "verified-public-infrastructure", null);
  assert.ok(verified);
  const rejectFromVerified = await moderation.moderateCamera(camera.id, "reject", "insufficient-evidence", null);
  assert.equal(rejectFromVerified, null, "reject is only legal from pending");
  const rows = await eventRows(env);
  assert.equal(rows.length, 1, "only the legal approve transition may be recorded");
});

test("unknown ids return null and write no event", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const result = await moderation.moderateCamera(9999, "approve", "verified-public-infrastructure", null);
  assert.equal(result, null);
  assert.equal((await eventRows(env)).length, 0);
});

test("notes are stored verbatim at the DB layer; the route is the normaliser", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);

  await moderation.moderateCamera(camera.id, "approve", "verified-public-infrastructure", "  spaced note  ");
  const [row] = await eventRows(env);
  assert.equal(row.note, "  spaced note  ", "the db layer stores the note exactly as handed over");
});

test("non-allowlist reason codes are stored verbatim at the DB layer (route enforces the allowlist)", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);

  const decision = await moderation.moderateCamera(camera.id, "approve", "made-up-code", null);
  assert.ok(decision, "the db layer does not reject unknown codes");
  assert.equal(decision.event.reasonCode, "made-up-code");
});

test("moderation events are append-only and surfaced newest-first in the queue", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);

  await moderation.moderateCamera(camera.id, "approve", "verified-public-infrastructure", null);
  await moderation.moderateCamera(camera.id, "mark-stale", "inaccurate-or-outdated", null);
  await moderation.moderateCamera(camera.id, "reverify", "verified-public-infrastructure", null);

  const queue = await moderation.listPendingModerationItems();
  assert.deepEqual(queue.recentEvents.map((event) => event.action), ["reverify", "mark-stale", "approve"]);
  assert.deepEqual(
    queue.recentEvents.map((event) => event.id),
    [3, 2, 1],
    "events ordered by created_at DESC, id DESC",
  );
});

test("the queue caps recent events at the 50 most recent", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });

  let lastEventId = null;
  for (let index = 0; index < 55; index += 1) {
    const camera = await makePendingCamera(env, cameras, `Bulk ${index}`);
    const decision = await moderation.moderateCamera(camera.id, "approve", "verified-public-infrastructure", null);
    lastEventId = decision.event.id;
  }

  const queue = await moderation.listPendingModerationItems();
  assert.equal(queue.recentEvents.length, 50, "only the 50 most recent events are exposed");
  assert.equal(queue.recentEvents[0].id, lastEventId, "the newest event is first");
  assert.equal(queue.recentEvents.some((event) => event.id === 1), false, "the oldest event is dropped");
  const ids = queue.recentEvents.map((event) => event.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a), "strictly newest-first");
});

test("correction moderation records events and keeps decisions private", async () => {
  const { env, cameras, corrections, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);
  const request = await corrections.createCorrectionRequest({
    cameraId: camera.id,
    issueType: "inaccurate details",
    message: "Wrong kind label",
    contact: "",
  });

  const approved = await moderation.moderateCorrection(request.id, "approve", "duplicate", null);
  assert.equal(approved.item.status, "reviewed");
  assert.deepEqual(approved.event, {
    id: 1,
    entity: "correction",
    entityId: request.id,
    previousStatus: "pending",
    newStatus: "reviewed",
    action: "approve",
    reasonCode: "duplicate",
    note: null,
    actor: "Local moderator",
    createdAt: approved.event.createdAt,
  });

  const rejected = await moderation.moderateCorrection(request.id, "reject", "insufficient-evidence", null);
  assert.equal(rejected, null, "a non-pending correction cannot be moderated again");
  assert.equal((await eventRows(env)).length, 1, "the failed re-moderation writes nothing");

  const queue = await moderation.listPendingModerationItems();
  assert.equal(queue.correctionRequests.length, 0, "moderated corrections leave the pending queue");
  assert.equal(queue.recentEvents.length, 1);
  assert.equal(queue.recentEvents[0].entity, "correction");
});

test("moderation decisions never leak moderation metadata into public outputs", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const camera = await makePendingCamera(env, cameras);
  await moderation.moderateCamera(camera.id, "approve", "verified-public-infrastructure", "Internal note");

  const records = await cameras.listPublicCameras();
  const record = records.find((item) => item.id === camera.id);
  assert.ok(record, "the approved camera is public");
  for (const forbidden of ["reasonCode", "note", "actor", "event", "previousStatus", "newStatus"]) {
    assert.equal(forbidden in record, false, `public records must not carry ${forbidden}`);
  }
});
