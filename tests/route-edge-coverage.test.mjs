// Edge-case route tests for the remaining low-coverage public/auth routes:
//
//   - GET /api/cameras/nearby    URI guard (414), rate-limit bucket (429)
//   - GET /api/cameras/revisions URI guard (414), rate-limit bucket (429)
//   - POST /api/auth/login       URI guard (414), auth bucket (429), non-string
//                                credential fields (401), 413 body cap, 500 on
//                                unexpected db failure
//
// These complement the happy-path and validation suites in
// tests/api-cameras.test.mjs, tests/api-revisions.test.mjs and
// tests/api-auth.test.mjs; the intent is to close the uncovered error branches
// so every route's full contract is pinned. All identities are fictional.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  rateLimit.resetRateLimitState();
});
after(async () => cleanupRouteTree());

const nearbyRoute = () => loadRoute("app/api/cameras/nearby/route.mjs");
const revisionsRoute = () => loadRoute("app/api/cameras/revisions/route.mjs");
const loginRoute = () => loadRoute("app/api/auth/login/route.mjs");

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
  updated: "2026-07-12T09:00:00.000Z",
  description: "",
  createdAt: "2026-07-01T08:00:00.000Z",
};

// ---------------------------------------------------------------------------
// GET /api/cameras/nearby — URI guard + rate limit
// ---------------------------------------------------------------------------

test("nearby answers 414 for absurdly long URIs before any work", async () => {
  const { GET } = await nearbyRoute();
  const response = await GET(apiRequest(`/api/cameras/nearby?${"a".repeat(5000)}`));
  assert.equal(response.status, 414);
  assert.equal(callArgs("findNearbyPublicCameras").length, 0);
});

test("nearby answers 429 past its own bucket, independently of the read bucket", async () => {
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.NEARBY_RATE_LIMIT_MAX;
  envModule.env.NEARBY_RATE_LIMIT_MAX = "1";
  try {
    stub("findNearbyPublicCameras", async () => []);
    const { GET } = await nearbyRoute();
    const allowed = await GET(apiRequest("/api/cameras/nearby?latitude=0&longitude=0&radius=50"));
    assert.equal(allowed.status, 200, "the first call fits the 1/min cap");
    assert.equal(callArgs("findNearbyPublicCameras").length, 1);

    const blocked = await GET(apiRequest("/api/cameras/nearby?latitude=0&longitude=0&radius=50"));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(callArgs("findNearbyPublicCameras").length, 1, "the throttled call never reaches the db layer");
  } finally {
    envModule.env.NEARBY_RATE_LIMIT_MAX = previous;
  }
});

// ---------------------------------------------------------------------------
// GET /api/cameras/revisions — URI guard + rate limit
// ---------------------------------------------------------------------------

test("revisions answers 414 for absurdly long URIs before any work", async () => {
  const { GET } = await revisionsRoute();
  const response = await GET(apiRequest(`/api/cameras/revisions?cameraId=3&${"a".repeat(5000)}`));
  assert.equal(response.status, 414);
  assert.equal(callArgs("getPublicCameraById").length + callArgs("listPublicCameraRevisions").length, 0);
});

test("revisions answers 429 past its own bucket", async () => {
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.REVISIONS_RATE_LIMIT_MAX;
  envModule.env.REVISIONS_RATE_LIMIT_MAX = "1";
  try {
    stub("getPublicCameraById", async () => publicRecord);
    stub("listPublicCameraRevisions", async () => []);
    const { GET } = await revisionsRoute();
    const allowed = await GET(apiRequest("/api/cameras/revisions?cameraId=3"));
    assert.equal(allowed.status, 200, "the first call fits the 1/min cap");

    const blocked = await GET(apiRequest("/api/cameras/revisions?cameraId=3"));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(callArgs("listPublicCameraRevisions").length, 1, "the throttled call never reaches the db layer");
  } finally {
    envModule.env.REVISIONS_RATE_LIMIT_MAX = previous;
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — credential-guessing surface edge cases
// ---------------------------------------------------------------------------

test("login answers 414 for absurdly long URIs before any work", async () => {
  const { POST } = await loginRoute();
  const response = await POST(apiRequest(`/api/auth/login?${"a".repeat(5000)}`, {
    method: "POST",
    body: { email: "ada@example.org", password: "supersecret123" },
  }));
  assert.equal(response.status, 414);
  assert.equal(callArgs("authenticateContributor").length, 0);
});

test("login answers 429 past the auth bucket (brute-force backstop)", async () => {
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.AUTH_RATE_LIMIT_MAX;
  envModule.env.AUTH_RATE_LIMIT_MAX = "1";
  try {
    stub("authenticateContributor", async () => null); // wrong password path
    const { POST } = await loginRoute();
    const allowed = await POST(apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "ada@example.org", password: "wrong-password-123" },
    }));
    assert.equal(allowed.status, 401, "the first attempt fits the 1/min cap");
    assert.equal(callArgs("authenticateContributor").length, 1);

    const blocked = await POST(apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "ada@example.org", password: "wrong-password-123" },
    }));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(callArgs("authenticateContributor").length, 1, "the throttled attempt never reaches the db layer");
  } finally {
    envModule.env.AUTH_RATE_LIMIT_MAX = previous;
  }
});

test("login answers 401 for non-string credential fields without probing", async (t) => {
  const { POST } = await loginRoute();
  const cases = [
    { name: "email number", body: { email: 42, password: "supersecret123" } },
    { name: "email array", body: { email: ["a@b.org"], password: "supersecret123" } },
    { name: "password number", body: { email: "ada@example.org", password: 1234567890 } },
    { name: "password array", body: { email: "ada@example.org", password: ["x".repeat(12)] } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await POST(apiRequest("/api/auth/login", { method: "POST", body }));
      assert.equal(response.status, 401, name);
      assert.equal(callArgs("authenticateContributor").length, 0, name);
    });
  }
});

test("login answers 413 when the body exceeds the byte cap", async () => {
  const { POST } = await loginRoute();
  const oversized = { email: "ada@example.org", password: "x".repeat(40_000) };
  const response = await POST(apiRequest("/api/auth/login", { method: "POST", body: oversized }));
  assert.equal(response.status, 413);
  assert.equal(callArgs("authenticateContributor").length, 0);
});

test("login answers 500 when the db layer fails unexpectedly", async () => {
  stub("authenticateContributor", async () => {
    throw new Error("D1 binding unavailable");
  });
  const { POST } = await loginRoute();
  const response = await POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email: "ada@example.org", password: "supersecret123" },
  }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to log in");
});
