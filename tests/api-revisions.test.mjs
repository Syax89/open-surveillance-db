// Runtime API tests for GET /api/cameras/revisions — the reviewed public
// change summary of a camera record (docs/FUTURE_ROADMAP.md, Horizon 1).
// The summary must never carry contributor identity or internal notes.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/cameras/revisions/route.mjs");

const publicRecord = {
  id: 3,
  title: "Verified camera",
  kind: "Dome",
  manufacturer: null,
  observedOn: null,
  publishManufacturer: 0,
  publishObservedOn: 0,
  address: null,
  latitude: 41.9,
  longitude: 12.5,
  status: "verified",
  source: "Community report",
  updated: "Local moderation: re-verified",
  description: "",
  createdAt: "2026-07-01T08:00:00.000Z",
};

// Shape the db boundary returns: exactly the non-identifying projection.
const revisionsFixture = [
  { id: 1, entityId: 3, previousStatus: "pending", newStatus: "verified", action: "approve", createdAt: "2026-07-02T09:00:00.000Z" },
  { id: 2, entityId: 3, previousStatus: "verified", newStatus: "needs_review", action: "mark-stale", createdAt: "2026-07-10T09:00:00.000Z" },
  { id: 3, entityId: 3, previousStatus: "needs_review", newStatus: "verified", action: "reverify", createdAt: "2026-07-12T09:00:00.000Z" },
];

test("GET returns the public change summary for a verified record", async () => {
  stub("getPublicCameraById", async () => publicRecord);
  stub("listPublicCameraRevisions", async () => revisionsFixture);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/revisions?cameraId=3"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.recordId, 3);
  assert.deepEqual(body.revisions, revisionsFixture);
  assert.deepEqual(callArgs("getPublicCameraById")[0], [3]);
  assert.deepEqual(callArgs("listPublicCameraRevisions")[0], [3]);
});

test("GET returns an empty history for a public record without moderation events", async () => {
  stub("getPublicCameraById", async () => publicRecord);
  stub("listPublicCameraRevisions", async () => []);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/revisions?cameraId=3"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.recordId, 3);
  assert.deepEqual(body.revisions, []);
});

test("GET returns 404 for records that are not currently public", async () => {
  stub("getPublicCameraById", async () => null);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/revisions?cameraId=3"));
  assert.equal(response.status, 404);
  assert.equal((await responseBody(response)).error, "Record unavailable");
  assert.equal(callArgs("listPublicCameraRevisions").length, 0, "the history must not be read for a non-public record");
});

test("GET rejects missing or invalid cameraId without touching the database", async (t) => {
  const { GET } = await route();
  const cases = [
    { name: "missing", query: "/api/cameras/revisions" },
    { name: "empty", query: "/api/cameras/revisions?cameraId=" },
    { name: "zero", query: "/api/cameras/revisions?cameraId=0" },
    { name: "negative", query: "/api/cameras/revisions?cameraId=-1" },
    { name: "fractional", query: "/api/cameras/revisions?cameraId=2.5" },
    { name: "non-numeric", query: "/api/cameras/revisions?cameraId=abc" },
  ];
  for (const { name, query } of cases) {
    await t.test(name, async () => {
      const response = await GET(apiRequest(query));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("getPublicCameraById").length + callArgs("listPublicCameraRevisions").length, 0, name);
    });
  }
});

test("GET returns 503 when the database is unavailable", async () => {
  stub("getPublicCameraById", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/revisions?cameraId=3"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Change history unavailable");
});
