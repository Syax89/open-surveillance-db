// Runtime API tests for /api/moderation (GET queue, PATCH decisions).
//
// Wave B (Data & Trust): every decision is attributed to a named reviewer
// (`actorId`), evaluated against the role→action matrix, and tracked in the
// moderation queue. The route maps the db-layer discriminated result to a
// stable HTTP status. See docs/workstreams/DATA_TRUST.md (roles and queue).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest as publicRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

// Route-level authz (ADR 0014): protected routes derive the acting reviewer
// from the authenticated identity header instead of trusting a client-chosen
// actor id. These mock-based suites act as the Demo Record Reviewer
// (moderator coarse role, reviewer id 2) unless a test overrides the stub.
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
const moderatorReviewer = { id: 2, displayName: "Demo Record Reviewer", role: "record_reviewer", active: 1 };
const authRequest = (path, opts = {}) =>
  publicRequest(path, { ...opts, headers: { "x-osdb-user-email": moderatorUser.email, ...(opts.headers ?? {}) } });
const stubModeratorAuth = () => {
  stub("getUserByEmail", async (email) => (email === moderatorUser.email ? moderatorUser : null));
  stub("getReviewerByUserId", async () => moderatorReviewer);
};

beforeEach(() => {
  resetMockState();
  stubModeratorAuth();
});
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/moderation/route.mjs");

const cameraItem = {
  id: 5,
  title: "Pending camera",
  kind: "Dome",
  manufacturer: "Acme",
  observedOn: null,
  publishManufacturer: 0,
  publishObservedOn: 0,
  address: null,
  notes: "",
  latitude: 41.9,
  longitude: 12.5,
  status: "pending",
  source: "Community report",
  updated: "Submitted just now",
  description: "",
  createdAt: "2026-07-30T10:00:00.000Z",
};

const eventFixture = {
  id: 1,
  entity: "camera",
  entityId: 5,
  previousStatus: "pending",
  newStatus: "verified",
  action: "approve",
  reasonCode: "verified-public-infrastructure",
  note: null,
  actor: "Demo Record Reviewer",
  reviewerId: 2,
  actorRole: "record_reviewer",
  recused: 0,
  escalated: 0,
  secondReviewerId: null,
  createdAt: "2026-07-31T08:00:00.000Z",
};

const queueFixture = {
  id: 10,
  entity: "camera",
  entityId: 5,
  state: "closed",
  assigneeId: 2,
  sensitivity: "standard",
  requiresSecondReview: 0,
  secondReviewerId: null,
  escalationReason: null,
  createdAt: "2026-07-31T08:00:00.000Z",
  updatedAt: "2026-07-31T08:00:00.000Z",
  assignee: "Demo Record Reviewer",
  secondReviewer: null,
};

const validReasonCode = "verified-public-infrastructure";
const actorId = 2;

const okResult = (item = cameraItem, event = eventFixture, queue = queueFixture) => ({
  kind: "ok",
  item,
  event,
  queue,
});

// ---------------------------------------------------------------------------
// GET /api/moderation
// ---------------------------------------------------------------------------

test("GET /api/moderation returns the full queue shape from the database boundary", async () => {
  const queue = {
    cameraReports: [cameraItem],
    publishedCameras: [],
    reviewCameras: [],
    correctionRequests: [],
    photoReports: [
      {
        id: 21,
        cameraId: null,
        mimeType: "image/jpeg",
        width: 64,
        height: 48,
        sizeBytes: 512,
        status: "pending",
        exifStripped: 1,
        redactionConfirmed: 0,
        createdAt: "2026-07-31T09:00:00.000Z",
        updatedAt: "2026-07-31T09:00:00.000Z",
      },
    ],
    recentEvents: [eventFixture],
    reviewers: [{ id: 2, displayName: "Demo Record Reviewer", role: "record_reviewer", active: 1 }],
    queueItems: [queueFixture],
  };
  stub("listPendingModerationItems", async () => queue);
  const { GET } = await route();
  const response = await GET(authRequest("/api/moderation"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.photoReports.length, 1);
  assert.equal(body.photoReports[0].status, "pending");
  assert.equal(body.photoReports[0].storageKey, undefined, "the storage key must never leave the db layer");
  assert.deepEqual(body, queue);
});

test("GET /api/moderation returns 503 when the queue is unavailable", async () => {
  stub("listPendingModerationItems", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await route();
  const response = await GET(authRequest("/api/moderation"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Moderation queue unavailable");
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — valid decisions
// ---------------------------------------------------------------------------

test("PATCH approve on a camera passes explicit publication choices through", async () => {
  stub("moderateCamera", async () => okResult({ ...cameraItem, status: "verified" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: {
        entity: "camera",
        id: 5,
        action: "approve",
        reasonCode: validReasonCode,
        note: "  Matches street view  ",
        publishManufacturer: true,
        publishObservedOn: false,
        actorId,
      },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.entity, "camera");
  assert.equal(body.kind, "ok");
  assert.equal(body.item.status, "verified");
  assert.deepEqual(body.event, eventFixture);
  assert.deepEqual(callArgs("moderateCamera")[0], [
    5,
    "approve",
    validReasonCode,
    "Matches street view",
    { publishManufacturer: true, publishObservedOn: false },
    { actorId },
  ]);
});

test("PATCH approve on a camera defaults omitted publication choices to private", async () => {
  stub("moderateCamera", async () => okResult());
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCamera")[0][4], {
    publishManufacturer: false,
    publishObservedOn: false,
  });
});

test("PATCH reject on a camera does not carry metadata publication arguments", async () => {
  stub("moderateCamera", async () => okResult({ ...cameraItem, status: "rejected" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "reject", reasonCode: "duplicate", actorId },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCamera")[0], [5, "reject", "duplicate", null, undefined, { actorId }]);
});

test("PATCH supports the full camera lifecycle action set", async (t) => {
  const { PATCH } = await route();
  for (const action of ["approve", "reject", "hide", "mark-stale", "reverify", "escalate"]) {
    await t.test(action, async () => {
      // Stub inside the subtest: beforeEach resets state for every subtest.
      stub("moderateCamera", async () => okResult());
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "camera", id: 5, action, reasonCode: validReasonCode, actorId },
        }),
      );
      assert.equal(response.status, 200, action);
    });
  }
});

test("PATCH on a correction routes to moderateCorrection without publication flags", async () => {
  stub("moderateCorrection", async () =>
    okResult(
      { id: 9, cameraId: 3, issueType: "Wrong location", message: "It moved", contact: null, status: "reviewed", createdAt: "2026-07-30T10:00:00.000Z" },
      { ...eventFixture, entity: "correction", entityId: 9, previousStatus: "pending", newStatus: "reviewed", action: "approve" },
      { ...queueFixture, entity: "correction", entityId: 9 },
    ),
  );
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, note: "fixed", actorId },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.entity, "correction");
  assert.equal(body.item.status, "reviewed");
  assert.deepEqual(callArgs("moderateCorrection")[0], [9, "approve", validReasonCode, "fixed", undefined, { actorId }]);
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — photo decisions (redaction gate)
// ---------------------------------------------------------------------------

const photoItem = {
  id: 21,
  cameraId: null,
  mimeType: "image/jpeg",
  width: 64,
  height: 48,
  sizeBytes: 512,
  status: "pending",
  exifStripped: 1,
  redactionConfirmed: 0,
  createdAt: "2026-07-31T09:00:00.000Z",
  updatedAt: "2026-07-31T09:00:00.000Z",
};

test("PATCH approve on a photo requires redaction confirmation and forwards it", async () => {
  stub("moderatePhoto", async () => ({
    kind: "ok",
    item: { ...photoItem, status: "approved", redactionConfirmed: 1 },
    event: { ...eventFixture, entity: "photo", entityId: 21, previousStatus: "pending", newStatus: "approved", action: "approve" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "photo", id: 21, action: "approve", reasonCode: "verified-public-infrastructure", redactionConfirmed: true, actorId },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.entity, "photo");
  assert.equal(body.item.status, "approved");
  assert.equal(body.item.redactionConfirmed, 1);
  assert.deepEqual(callArgs("moderatePhoto")[0], [21, "approve", true, "verified-public-infrastructure", null, actorId]);
});

test("PATCH approve on a photo without redaction confirmation is rejected before the db layer", async () => {
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "photo", id: 21, action: "approve", reasonCode: "verified-public-infrastructure", actorId },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(callArgs("moderatePhoto").length, 0, "no db write without redaction confirmation");
});

test("PATCH approve on a photo maps a redaction_required result to 400", async () => {
  // The db layer can still answer redaction_required (e.g. the flag was not
  // persisted); the route must surface that specific error, not a generic one.
  stub("moderatePhoto", async () => ({ kind: "redaction_required" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "photo", id: 21, action: "approve", reasonCode: "verified-public-infrastructure", redactionConfirmed: true, actorId },
    }),
  );
  assert.equal(response.status, 400);
  assert.match((await responseBody(response)).error, /redacted/);
});

test("PATCH reject on a photo forwards redactionConfirmed false and leaves it pending for metadata", async () => {
  stub("moderatePhoto", async () => ({
    kind: "ok",
    item: { ...photoItem, status: "rejected" },
    event: { ...eventFixture, entity: "photo", entityId: 21, previousStatus: "pending", newStatus: "rejected", action: "reject" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "photo", id: 21, action: "reject", reasonCode: "privacy-or-safety-concern", redactionConfirmed: false, actorId },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderatePhoto")[0], [21, "reject", false, "privacy-or-safety-concern", null, actorId]);
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — actor attribution and queue workflow context
// ---------------------------------------------------------------------------

test("PATCH forwards queue workflow fields to the db layer", async () => {
  stub("moderateCamera", async () => okResult());
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: {
        entity: "camera",
        id: 5,
        action: "approve",
        reasonCode: validReasonCode,
        actorId,
        sensitivity: "sensitive",
        assigneeId: 3,
        requiresSecondReview: true,
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCamera")[0][5], {
    actorId,
    sensitivity: "sensitive",
    assigneeId: 3,
    requiresSecondReview: true,
  });
});

test("PATCH maps a pending second review to 202 with the item untouched", async () => {
  stub("moderateCamera", async () => ({
    kind: "second_review_pending",
    item: cameraItem,
    event: eventFixture,
    queue: { ...queueFixture, state: "second_review" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId },
    }),
  );
  assert.equal(response.status, 202);
  const body = await responseBody(response);
  assert.equal(body.kind, "second_review_pending");
  assert.equal(body.item.status, "pending", "a first review step must not change the record status");
});

test("PATCH maps a recusal to 200 and never changes the record", async () => {
  stub("moderateCamera", async () => ({ kind: "recused", item: cameraItem, event: eventFixture, queue: queueFixture }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId, recused: true },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await responseBody(response)).kind, "recused");
  assert.deepEqual(callArgs("moderateCamera")[0][5], { actorId, recused: true });
});

test("PATCH maps role/state violations to their documented statuses", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "forbidden action for the role", kind: "forbidden", status: 403 },
    { name: "inactive reviewer", kind: "actor_inactive", status: 403 },
    { name: "unknown reviewer", kind: "actor_not_found", status: 404 },
    { name: "second reviewer must differ", kind: "second_review_same_reviewer", status: 409 },
    { name: "escalation needs a note", kind: "escalation_requires_note", status: 400 },
  ];
  for (const { name, kind, status } of cases) {
    await t.test(name, async () => {
      stub("moderateCamera", async () => ({ kind }));
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "camera", id: 5, action: "escalate", reasonCode: validReasonCode, actorId },
        }),
      );
      assert.equal(response.status, status, name);
    });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — malformed payloads (all must be 400, no db writes)
// ---------------------------------------------------------------------------

test("PATCH rejects non-object bodies", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "null", body: "null" },
    { name: "array", body: "[]" },
    { name: "number", body: "7" },
    { name: "string", body: '"approve"' },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(authRequest("/api/moderation", { method: "PATCH", body }));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH rejects invalid ids", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "zero", id: 0 },
    { name: "negative", id: -1 },
    { name: "fractional", id: 2.5 },
    { name: "string id", id: "5" },
    { name: "null id", id: null },
    { name: "missing id", body: { entity: "camera", action: "approve", reasonCode: validReasonCode, actorId } },
  ];
  for (const { name, id, body } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: body ?? { entity: "camera", id, action: "approve", reasonCode: validReasonCode, actorId },
        }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH rejects invalid actor ids", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "missing actorId", body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode } },
    { name: "zero", actorId: 0 },
    { name: "negative", actorId: -2 },
    { name: "fractional", actorId: 1.5 },
    { name: "string", actorId: "2" },
    { name: "null", actorId: null },
    { name: "boolean", actorId: true },
  ];
  for (const { name, actorId: badActorId, body } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: body ?? { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId: badActorId },
        }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH rejects invalid queue workflow fields", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "unknown sensitivity", sensitivity: "ultra" },
    { name: "sensitivity not a string", sensitivity: 3 },
    { name: "fractional assignee", assigneeId: 2.5 },
    { name: "string assignee", assigneeId: "3" },
    { name: "recused not boolean", recused: "yes" },
    { name: "requiresSecondReview not boolean", requiresSecondReview: 1 },
  ];
  for (const { name, ...overrides } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId, ...overrides },
        }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH rejects invalid entities and actions", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "unknown entity", entity: "streetlight" },
    { name: "camera unknown action", action: "delete" },
    { name: "camera uppercase action", action: "APPROVE" },
    { name: "correction unknown action", entity: "correction", action: "hide" },
  ];
  for (const { name, entity = "camera", action = "approve" } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity, id: 5, action, reasonCode: validReasonCode, actorId },
        }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH rejects missing or unrecognised reason codes", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "missing", body: { entity: "camera", id: 5, action: "approve", actorId } },
    { name: "unrecognised", body: { entity: "camera", id: 5, action: "approve", reasonCode: "because-i-say-so", actorId } },
    { name: "empty string", body: { entity: "camera", id: 5, action: "approve", reasonCode: "", actorId } },
    { name: "numeric reason code", body: { entity: "camera", id: 5, action: "approve", reasonCode: 3, actorId } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(authRequest("/api/moderation", { method: "PATCH", body }));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH rejects invalid notes and publication flags", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "note too long", note: "n".repeat(501) },
    { name: "note not a string", note: 42 },
    { name: "publishManufacturer not boolean", publishManufacturer: "yes" },
    { name: "publishObservedOn not boolean", publishObservedOn: 1 },
    { name: "publish flags on reject", action: "reject", publishManufacturer: true },
    { name: "publish flags on correction", entity: "correction", publishObservedOn: true },
  ];
  for (const { name, ...overrides } of cases) {
    await t.test(name, async () => {
      const body = {
        entity: "camera",
        id: 5,
        action: "approve",
        reasonCode: validReasonCode,
        actorId,
        ...overrides,
      };
      const response = await PATCH(authRequest("/api/moderation", { method: "PATCH", body }));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH accepts a note of exactly 500 characters", async () => {
  stub("moderateCamera", async () => okResult());
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "reject", reasonCode: "duplicate", note: "n".repeat(500), actorId },
    }),
  );
  assert.equal(response.status, 200);
});

test("PATCH trims and nullifies blank notes", async () => {
  stub("moderateCamera", async () => okResult());
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "reject", reasonCode: "duplicate", note: "   ", actorId },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(callArgs("moderateCamera")[0][3], null);
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — not found and database failures
// ---------------------------------------------------------------------------

test("PATCH returns 404 when the item is missing or the transition is invalid", async () => {
  stub("moderateCamera", async () => ({ kind: "not_found" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 999, action: "approve", reasonCode: validReasonCode, actorId },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Item not found/);
});

test("PATCH returns 404 when a correction associate targets a non-existent camera", async () => {
  stub("moderateCorrection", async () => ({ kind: "camera_not_found" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "associate", reasonCode: validReasonCode, cameraId: 4242, actorId },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Camera not found/);
});

test("PATCH returns 404 when an approve outcome targets a non-existent camera", async () => {
  stub("moderateCorrection", async () => ({ kind: "camera_not_found" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome: "removed", cameraId: 4242, actorId },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Camera not found/);
});

test("PATCH returns 500 when the database write fails", async () => {
  stub("moderateCamera", async () => {
    throw new Error("Moderation event could not be recorded");
  });
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId },
    }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to update moderation item");
});

test("PATCH maps malformed JSON bodies to 400", async () => {
  const { PATCH } = await route();
  const response = await PATCH(authRequest("/api/moderation", { method: "PATCH", body: "{nope" }));
  assert.equal(response.status, 400);
  assert.equal(callArgs("moderateCamera").length, 0, "no db write for malformed JSON");
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — edge-cache purge (follow-up F0, t_ae600b90)
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
const capturedPurgeRequests = [];
function stubPurgeFetch() {
  capturedPurgeRequests.length = 0;
  globalThis.fetch = async (input, init) => {
    capturedPurgeRequests.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
}

test("PATCH on a camera decision purges the record and shared camera tags via the Cache Purge API", async () => {
  stub("moderateCamera", async () => okResult());
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  env.CACHE_PURGE_TOKEN = "test-token";
  env.CACHE_PURGE_ZONE_ID = "test-zone";
  stubPurgeFetch();
  try {
    const { PATCH } = await route();
    const response = await PATCH(
      authRequest("/api/moderation", {
        method: "PATCH",
        body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(capturedPurgeRequests.length, 1, "one purge call for a camera decision");
    const call = capturedPurgeRequests[0];
    assert.equal(call.url, "https://api.cloudflare.com/client/v4/zones/test-zone/purge_cache");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.Authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(call.init.body), {
      tags: ["cameras-list", "cameras-bbox", "cameras-export", "camera-5"],
    });
  } finally {
    delete env.CACHE_PURGE_TOKEN;
    delete env.CACHE_PURGE_ZONE_ID;
    globalThis.fetch = originalFetch;
  }
});

test("PATCH on a correction decision purges the linked camera when present", async () => {
  stub("moderateCorrection", async () => okResult({ ...cameraItem, cameraId: 42 }));
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  env.CACHE_PURGE_TOKEN = "test-token";
  env.CACHE_PURGE_ZONE_ID = "test-zone";
  stubPurgeFetch();
  try {
    const { PATCH } = await route();
    const response = await PATCH(
      authRequest("/api/moderation", {
        method: "PATCH",
        body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome: "corrected", cameraId: 42, actorId },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(capturedPurgeRequests.length, 1);
    assert.deepEqual(JSON.parse(capturedPurgeRequests[0].init.body).tags, [
      "cameras-list",
      "cameras-bbox",
      "cameras-export",
      "camera-42",
    ]);
  } finally {
    delete env.CACHE_PURGE_TOKEN;
    delete env.CACHE_PURGE_ZONE_ID;
    globalThis.fetch = originalFetch;
  }
});

test("PATCH does not call the purge API when cache-purge credentials are absent", async () => {
  stub("moderateCamera", async () => okResult());
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  delete env.CACHE_PURGE_TOKEN;
  delete env.CACHE_PURGE_ZONE_ID;
  stubPurgeFetch();
  try {
    const { PATCH } = await route();
    const response = await PATCH(
      authRequest("/api/moderation", {
        method: "PATCH",
        body: { entity: "camera", id: 5, action: "reject", reasonCode: "duplicate", actorId },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(capturedPurgeRequests.length, 0, "no purge call without credentials (documented no-op)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PATCH does not purge when the decision did not succeed", async () => {
  stub("moderateCamera", async () => ({ kind: "second_review_pending" }));
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  env.CACHE_PURGE_TOKEN = "test-token";
  env.CACHE_PURGE_ZONE_ID = "test-zone";
  stubPurgeFetch();
  try {
    const { PATCH } = await route();
    const response = await PATCH(
      authRequest("/api/moderation", {
        method: "PATCH",
        body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId },
      }),
    );
    assert.equal(response.status, 202);
    assert.equal(capturedPurgeRequests.length, 0, "a pending second review did not change the public set");
  } finally {
    delete env.CACHE_PURGE_TOKEN;
    delete env.CACHE_PURGE_ZONE_ID;
    globalThis.fetch = originalFetch;
  }
});
