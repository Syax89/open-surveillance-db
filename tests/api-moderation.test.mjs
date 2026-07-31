// Runtime API tests for /api/moderation (GET queue, PATCH decisions).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
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
  actor: "Local moderator",
  createdAt: "2026-07-31T08:00:00.000Z",
};

const validReasonCode = "verified-public-infrastructure";

// ---------------------------------------------------------------------------
// GET /api/moderation
// ---------------------------------------------------------------------------

test("GET /api/moderation returns the full queue shape from the database boundary", async () => {
  const queue = {
    cameraReports: [cameraItem],
    publishedCameras: [],
    reviewCameras: [],
    correctionRequests: [],
    recentEvents: [eventFixture],
  };
  stub("listPendingModerationItems", async () => queue);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/moderation"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), queue);
});

test("GET /api/moderation returns 503 when the queue is unavailable", async () => {
  stub("listPendingModerationItems", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await route();
  const response = await GET(apiRequest("/api/moderation"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database binding unavailable");
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — valid decisions
// ---------------------------------------------------------------------------

test("PATCH approve on a camera passes explicit publication choices through", async () => {
  stub("moderateCamera", async () => ({ item: { ...cameraItem, status: "verified" }, event: eventFixture }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: {
        entity: "camera",
        id: 5,
        action: "approve",
        reasonCode: validReasonCode,
        note: "  Matches street view  ",
        publishManufacturer: true,
        publishObservedOn: false,
      },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.entity, "camera");
  assert.equal(body.item.status, "verified");
  assert.deepEqual(body.event, eventFixture);
  assert.deepEqual(callArgs("moderateCamera")[0], [
    5,
    "approve",
    validReasonCode,
    "Matches street view",
    { publishManufacturer: true, publishObservedOn: false },
  ]);
});

test("PATCH approve on a camera defaults omitted publication choices to private", async () => {
  stub("moderateCamera", async () => ({ item: cameraItem, event: eventFixture }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCamera")[0][4], {
    publishManufacturer: false,
    publishObservedOn: false,
  });
});

test("PATCH reject on a camera does not carry metadata publication arguments", async () => {
  stub("moderateCamera", async () => ({ item: { ...cameraItem, status: "rejected" }, event: eventFixture }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "reject", reasonCode: "duplicate" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCamera")[0], [5, "reject", "duplicate", null, undefined]);
});

test("PATCH supports the full camera lifecycle action set", async (t) => {
  const { PATCH } = await route();
  for (const action of ["approve", "reject", "hide", "mark-stale", "reverify"]) {
    await t.test(action, async () => {
      // Stub inside the subtest: beforeEach resets state for every subtest.
      stub("moderateCamera", async () => ({ item: cameraItem, event: eventFixture }));
      const response = await PATCH(
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "camera", id: 5, action, reasonCode: validReasonCode },
        }),
      );
      assert.equal(response.status, 200, action);
    });
  }
});

test("PATCH on a correction routes to moderateCorrection without publication flags", async () => {
  stub("moderateCorrection", async () => ({
    item: { id: 9, cameraId: 3, issueType: "Wrong location", message: "It moved", contact: null, status: "reviewed", createdAt: "2026-07-30T10:00:00.000Z" },
    event: { ...eventFixture, entity: "correction", entityId: 9, previousStatus: "pending", newStatus: "reviewed", action: "approve" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: "verified-public-infrastructure", note: "fixed" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.entity, "correction");
  assert.equal(body.item.status, "reviewed");
  assert.deepEqual(callArgs("moderateCorrection")[0], [9, "approve", validReasonCode, "fixed"]);
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
      const response = await PATCH(apiRequest("/api/moderation", { method: "PATCH", body }));
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
    { name: "missing id", body: { entity: "camera", action: "approve", reasonCode: validReasonCode } },
  ];
  for (const { name, id, body } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: body ?? { entity: "camera", id, action: "approve", reasonCode: validReasonCode },
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
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: { entity, id: 5, action, reasonCode: validReasonCode },
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
    { name: "missing", body: { entity: "camera", id: 5, action: "approve" } },
    { name: "unrecognised", body: { entity: "camera", id: 5, action: "approve", reasonCode: "because-i-say-so" } },
    { name: "empty string", body: { entity: "camera", id: 5, action: "approve", reasonCode: "" } },
    { name: "numeric reason code", body: { entity: "camera", id: 5, action: "approve", reasonCode: 3 } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(apiRequest("/api/moderation", { method: "PATCH", body }));
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
        ...overrides,
      };
      const response = await PATCH(apiRequest("/api/moderation", { method: "PATCH", body }));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
    });
  }
});

test("PATCH accepts a note of exactly 500 characters", async () => {
  stub("moderateCamera", async () => ({ item: cameraItem, event: eventFixture }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "reject", reasonCode: "duplicate", note: "n".repeat(500) },
    }),
  );
  assert.equal(response.status, 200);
});

test("PATCH trims and nullifies blank notes", async () => {
  stub("moderateCamera", async () => ({ item: cameraItem, event: eventFixture }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "reject", reasonCode: "duplicate", note: "   " },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(callArgs("moderateCamera")[0][3], null);
});

// ---------------------------------------------------------------------------
// PATCH /api/moderation — not found and database failures
// ---------------------------------------------------------------------------

test("PATCH returns 404 when the item is missing or the transition is invalid", async () => {
  stub("moderateCamera", async () => null);
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 999, action: "approve", reasonCode: validReasonCode },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Item not found/);
});

test("PATCH returns 500 when the database write fails", async () => {
  stub("moderateCamera", async () => {
    throw new Error("Moderation event could not be recorded");
  });
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode },
    }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Moderation event could not be recorded");
});

test("PATCH maps malformed JSON bodies to 500", async () => {
  const { PATCH } = await route();
  const response = await PATCH(apiRequest("/api/moderation", { method: "PATCH", body: "{nope" }));
  assert.equal(response.status, 500);
});
