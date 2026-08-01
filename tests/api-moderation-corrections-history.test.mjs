// QA contract — H1 (t_69891619): private per-record correction history.
//
// GET /api/moderation/corrections?cameraId=N
//   - moderator+ only (worker edge gate + coarse role, ADR 0014)
//   - cameraId: required positive integer; missing/invalid → 400
//   - unknown record → 404 (typo distinguishable from empty history)
//   - success → { camera: { id, title, status }, requests: [...] } with
//     every request linked to the record (pending and resolved), each
//     carrying status/outcome/resolvedAt and its own decision events
//     (approve/reject/associate/escalate) from the append-only trail
//   - response never cached
//
// Privacy (AC-5): the payload carries contact details, internal notes and
// reviewer attribution, so it must never be reachable outside the gated
// moderation API. The route lives under /api/moderation/* (edge gate) and
// the route layer enforces the coarse moderator role.
//
// Two layers:
//   1. Route layer with the mocked db layer (validation, authz, status).
//   2. Real db layer (db-real/moderation.mjs) against in-memory D1:
//      grouping of requests + events, ordering, resolvedAt, missing record.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest as publicRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

const moderatorUser = {
  id: 2,
  email: "record@osdb.test",
  displayName: "Demo Record Reviewer",
  role: "moderator",
  active: 1,
  mfaEnabled: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const contributorUser = {
  ...moderatorUser,
  id: 3,
  email: "contributor@osdb.test",
  role: "contributor",
};
const authRequest = (path, opts = {}) =>
  publicRequest(path, { ...opts, headers: { "x-osdb-user-email": moderatorUser.email, ...(opts.headers ?? {}) } });

beforeEach(() => {
  resetMockState();
  stub("getUserByEmail", async (email) => {
    if (email === moderatorUser.email) return moderatorUser;
    if (email === contributorUser.email) return contributorUser;
    return null;
  });
});
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/moderation/corrections/route.mjs");

const historyFixture = {
  camera: { id: 7, title: "Fixture corner camera", status: "verified" },
  requests: [
    {
      id: 9,
      cameraId: 7,
      issueType: "inaccurate",
      message: "The camera moved to the other corner",
      contact: null,
      status: "reviewed",
      outcome: "corrected",
      createdAt: "2026-07-28T09:00:00.000Z",
      resolvedAt: "2026-07-29T10:00:00.000Z",
      events: [
        {
          id: 7,
          entity: "correction",
          entityId: 9,
          previousStatus: "pending",
          newStatus: "reviewed",
          action: "approve",
          reasonCode: "inaccurate-or-outdated",
          note: null,
          actor: "Demo Record Reviewer",
          reviewerId: 2,
          actorRole: "record_reviewer",
          recused: 0,
          escalated: 0,
          secondReviewerId: null,
          createdAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    },
    {
      id: 8,
      cameraId: 7,
      issueType: "removal",
      message: "This camera is not public infrastructure",
      contact: "reporter@example.test",
      status: "pending",
      outcome: null,
      createdAt: "2026-07-30T09:00:00.000Z",
      resolvedAt: null,
      events: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Authz (ADR 0014)
// ---------------------------------------------------------------------------

test("GET without an authenticated identity answers 401", async () => {
  const { GET } = await route();
  const response = await GET(publicRequest("/api/moderation/corrections?cameraId=7"));
  assert.equal(response.status, 401);
  assert.equal(callArgs("listCorrectionHistoryForCamera").length, 0);
});

test("GET as a contributor answers 403 and never touches the db", async () => {
  const { GET } = await route();
  const response = await GET(
    publicRequest("/api/moderation/corrections?cameraId=7", {
      headers: { "x-osdb-user-email": contributorUser.email },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("listCorrectionHistoryForCamera").length, 0);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("GET without cameraId answers 400", async () => {
  const { GET } = await route();
  const response = await GET(authRequest("/api/moderation/corrections"));
  assert.equal(response.status, 400);
  assert.match((await responseBody(response)).error, /cameraId/);
  assert.equal(callArgs("listCorrectionHistoryForCamera").length, 0);
});

test("GET rejects invalid cameraId values", async (t) => {
  const { GET } = await route();
  const cases = [
    { name: "zero", query: "cameraId=0" },
    { name: "negative", query: "cameraId=-3" },
    { name: "fractional", query: "cameraId=2.5" },
    { name: "alpha", query: "cameraId=abc" },
    { name: "empty", query: "cameraId=" },
  ];
  for (const { name, query } of cases) {
    await t.test(name, async () => {
      const response = await GET(authRequest(`/api/moderation/corrections?${query}`));
      assert.equal(response.status, 400, name);
    });
  }
  assert.equal(callArgs("listCorrectionHistoryForCamera").length, 0);
});

// ---------------------------------------------------------------------------
// Success / error mapping
// ---------------------------------------------------------------------------

test("GET returns the record history with its decision trail", async () => {
  stub("listCorrectionHistoryForCamera", async () => historyFixture);
  const { GET } = await route();
  const response = await GET(authRequest("/api/moderation/corrections?cameraId=7"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body, historyFixture);
  assert.deepEqual(callArgs("listCorrectionHistoryForCamera")[0], [7]);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("GET answers 404 when the record does not exist", async () => {
  stub("listCorrectionHistoryForCamera", async () => ({ camera: null, requests: [] }));
  const { GET } = await route();
  const response = await GET(authRequest("/api/moderation/corrections?cameraId=4242"));
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Record not found/);
});

test("GET answers 503 when the history read fails", async () => {
  stub("listCorrectionHistoryForCamera", async () => {
    throw new Error("D1 unavailable");
  });
  const { GET } = await route();
  const response = await GET(authRequest("/api/moderation/corrections?cameraId=7"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Correction history unavailable");
});

// ---------------------------------------------------------------------------
// Real db layer (in-memory D1)
// ---------------------------------------------------------------------------

let treeEnv = null;
let realModeration = null;

async function realDb() {
  if (!realModeration) {
    ({ env: treeEnv } = await loadTreeModule("cloudflare-workers.mjs"));
    realModeration = await loadTreeModule("db-real/moderation.mjs");
  }
  return { env: treeEnv, moderation: realModeration };
}

async function resetDb({ env }) {
  env.DB = new D1();
  await applyDrizzleMigrations(env.DB);
  await env.DB.prepare("DELETE FROM cameras").run();
  await env.DB.prepare("DELETE FROM correction_requests").run();
  await env.DB.prepare("DELETE FROM moderation_events").run();
}

const insertCameraColumns =
  "INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, title, status";

async function insertCamera(env, overrides = {}) {
  const row = {
    title: "History camera",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    publishManufacturer: 0,
    publishObservedOn: 0,
    address: null,
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
    status: "verified",
    source: "Community report",
    updated: "Test update",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  return env.DB.prepare(insertCameraColumns).bind(
    row.title,
    row.kind,
    row.manufacturer,
    row.observedOn,
    row.publishManufacturer,
    row.publishObservedOn,
    row.address,
    row.notes,
    row.latitude,
    row.longitude,
    row.status,
    row.source,
    row.updated,
    row.description,
    row.createdAt,
  ).first();
}

async function insertCorrection(env, overrides = {}) {
  const row = {
    cameraId: 1,
    issueType: "inaccurate",
    message: "Fixture request",
    contact: null,
    status: "pending",
    outcome: null,
    resolvedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
  return env.DB.prepare(
    "INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, outcome, resolved_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
  ).bind(row.cameraId, row.issueType, row.message, row.contact, row.status, row.outcome, row.resolvedAt, row.createdAt).first();
}

async function insertCorrectionEvent(env, correctionId, overrides = {}) {
  const row = {
    entity: "correction",
    entityId: correctionId,
    previousStatus: "pending",
    newStatus: "reviewed",
    action: "approve",
    reasonCode: "inaccurate-or-outdated",
    note: null,
    actor: "Demo Record Reviewer",
    reviewerId: null,
    actorRole: null,
    recused: 0,
    escalated: 0,
    secondReviewerId: null,
    appealId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
  return env.DB.prepare(
    "INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
  ).bind(
    row.entity,
    row.entityId,
    row.previousStatus,
    row.newStatus,
    row.action,
    row.reasonCode,
    row.note,
    row.actor,
    row.reviewerId,
    row.actorRole,
    row.recused,
    row.escalated,
    row.secondReviewerId,
    row.appealId,
    row.createdAt,
  ).first();
}

test("listCorrectionHistoryForCamera groups requests with their decision events", async () => {
  const { env, moderation } = await realDb();
  await resetDb({ env });
  const camera = await insertCamera(env);
  const pending = await insertCorrection(env, { cameraId: camera.id, createdAt: "2026-07-05T00:00:00.000Z" });
  const resolved = await insertCorrection(env, {
    cameraId: camera.id,
    issueType: "removal",
    status: "reviewed",
    outcome: "removed",
    resolvedAt: "2026-07-06T00:00:00.000Z",
    createdAt: "2026-07-04T00:00:00.000Z",
  });
  await insertCorrectionEvent(env, resolved.id, { action: "associate", newStatus: "pending", createdAt: "2026-07-04T12:00:00.000Z" });
  await insertCorrectionEvent(env, resolved.id, { action: "approve", newStatus: "reviewed", note: "Confirmed removal", createdAt: "2026-07-06T09:00:00.000Z" });
  // A second record's request must never leak into this record's history.
  const other = await insertCamera(env, { title: "Other camera" });
  await insertCorrection(env, { cameraId: other.id, issueType: "abuse", message: "Unrelated" });

  const history = await moderation.listCorrectionHistoryForCamera(camera.id);

  assert.equal(history.camera?.id, camera.id);
  assert.equal(history.camera?.title, "History camera");
  assert.equal(history.camera?.status, "verified");
  // Newest first (pending request was created later).
  assert.deepEqual(
    history.requests.map((request) => request.id),
    [pending.id, resolved.id],
  );
  const resolvedRow = history.requests.find((request) => request.id === resolved.id);
  assert.equal(resolvedRow?.status, "reviewed");
  assert.equal(resolvedRow?.outcome, "removed");
  assert.equal(resolvedRow?.resolvedAt, "2026-07-06T00:00:00.000Z");
  assert.equal(resolvedRow?.events.length, 2);
  // Events come oldest first: associate → approve.
  assert.deepEqual(
    resolvedRow?.events.map((event) => event.action),
    ["associate", "approve"],
  );
  assert.equal(resolvedRow?.events[1].note, "Confirmed removal");
  const pendingRow = history.requests.find((request) => request.id === pending.id);
  assert.equal(pendingRow?.outcome, null);
  assert.equal(pendingRow?.resolvedAt, null);
  assert.equal(pendingRow?.events.length, 0);
});

test("listCorrectionHistoryForCamera keeps a removed record's history visible", async () => {
  const { env, moderation } = await realDb();
  await resetDb({ env });
  const camera = await insertCamera(env, { status: "removed" });
  const request = await insertCorrection(env, { cameraId: camera.id, status: "reviewed", outcome: "removed", resolvedAt: "2026-07-06T00:00:00.000Z" });
  await insertCorrectionEvent(env, request.id, { action: "removed", newStatus: "removed" });

  const history = await moderation.listCorrectionHistoryForCamera(camera.id);
  assert.equal(history.camera?.status, "removed");
  assert.equal(history.requests.length, 1);
  assert.equal(history.requests[0].events[0].action, "removed");
});

test("listCorrectionHistoryForCamera answers a missing record with camera null", async () => {
  const { env, moderation } = await realDb();
  await resetDb({ env });
  const history = await moderation.listCorrectionHistoryForCamera(9999);
  assert.deepEqual(history, { camera: null, requests: [] });
});
