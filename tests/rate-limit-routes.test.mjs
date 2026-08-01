// Route-level rate-limit contract (Wave B, Operations) — the per-route
// follow-up to the library-level coverage in abuse-controls.test.mjs.
//
// Pins the 429 + Retry-After behaviour of every route family that calls
// checkRateLimit, using the real handlers against the mocked db boundary
// (helpers/api-harness.mjs):
//
//   POST /api/photos             submit bucket    (POST_RATE_LIMIT_*)
//   POST /api/cameras            submit bucket    (POST_RATE_LIMIT_*)
//   POST /api/appeals            appeal bucket    (MODERATION_RATE_LIMIT_*)
//   PATCH /api/moderation        moderate bucket  (MODERATION_RATE_LIMIT_*)
//   GET  /api/cameras/nearby     nearby bucket    (NEARBY_RATE_LIMIT_*)
//   GET  /api/cameras/revisions  revisions bucket (REVISIONS_RATE_LIMIT_*)
//
// Per route the suite proves, at the HTTP layer:
//   1. exceeding the family limit answers 429 with a positive Retry-After
//      and never reaches the database layer;
//   2. calls under the threshold are not rate-limited (no spurious 429);
//   3. each route family keeps an independent window (a submit burst never
//      starves read/search/nearby/revisions and vice versa);
//   4. the caller key prefers the edge IP over X-Forwarded-For, falls back
//      to the first forwarded hop, and degrades to "unknown" without
//      crashing when no identity header is present;
//   5. a block is a clean 429 (never a 500) and the hashed abuse alert
//      fires at most once per cooldown window.
//
// All fixtures are fictional; no personal data is used.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  apiRequest,
  buildRouteTree,
  cleanupRouteTree,
  loadLibModule,
  loadRoute,
} from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

// The shared env mock the transpiled routes read (same instance the tree
// routes import); tests lower one knob at a time to make a block cheap and
// deterministic.
let env;
let rateLimit;
let abuseAlerts;

async function sharedEnv() {
  const tree = await buildRouteTree();
  return import(pathToFileURL(path.join(tree, "cloudflare-workers.mjs"))).then((m) => m.env);
}

const DEFAULT_ENV = {
  POST_RATE_LIMIT_MAX: "1000000",
  POST_RATE_LIMIT_WINDOW_SECONDS: "60",
  READ_RATE_LIMIT_MAX: "1000000",
  READ_RATE_LIMIT_WINDOW_SECONDS: "60",
  EXPORT_RATE_LIMIT_MAX: "1000000",
  EXPORT_RATE_LIMIT_WINDOW_SECONDS: "60",
  NEARBY_RATE_LIMIT_MAX: "1000000",
  NEARBY_RATE_LIMIT_WINDOW_SECONDS: "60",
  REVISIONS_RATE_LIMIT_MAX: "1000000",
  REVISIONS_RATE_LIMIT_WINDOW_SECONDS: "60",
  MODERATION_RATE_LIMIT_MAX: "1000000",
  MODERATION_RATE_LIMIT_WINDOW_SECONDS: "60",
  POST_SUBMISSIONS_DISABLED: "false",
  SEARCH_RATE_LIMIT_MAX: "1000000",
  SEARCH_RATE_LIMIT_WINDOW_SECONDS: "60",
};

beforeEach(async () => {
  resetMockState();
  if (!env) {
    env = await sharedEnv();
    [rateLimit, abuseAlerts] = await Promise.all([
      loadLibModule("rate-limit"),
      loadLibModule("abuse-alerts"),
    ]);
  }
  rateLimit.resetRateLimitState();
  abuseAlerts.resetAbuseAlertState();
});

afterEach(() => {
  Object.assign(env, DEFAULT_ENV);
  delete env.ABUSE_ALERT_THRESHOLD;
  delete env.ABUSE_ALERT_SURGE_THRESHOLD;
  delete env.ABUSE_ALERT_COOLDOWN_SECONDS;
  delete env.ABUSE_ALERT_WEBHOOK_URL;
});

after(async () => cleanupRouteTree());

// ---------------------------------------------------------------------------
// Auth fixtures (route-level authz runs for real against the mocked users
// boundary, exactly like the api-moderation / appeals suites).
// ---------------------------------------------------------------------------

const CONTRIBUTOR = {
  id: 6,
  email: "contributor@osdb.test",
  displayName: "Demo Contributor",
  role: "contributor",
  active: 1,
  mfaEnabled: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const MODERATOR = {
  id: 2,
  email: "record@osdb.test",
  displayName: "Demo Record Reviewer",
  role: "moderator",
  active: 1,
  mfaEnabled: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const REVIEWER = { id: 2, displayName: "Demo Record Reviewer", role: "record_reviewer", active: 1 };

const stubAuth = (user) =>
  stub("getUserByEmail", async (email) => (email === user.email ? user : null));

// ---------------------------------------------------------------------------
// Request builders per route. `ip` becomes cf-connecting-ip (the edge IP the
// callerKey prefers); pass xff to exercise the forwarded-hop fallback.
// ---------------------------------------------------------------------------

function identityHeaders(ip, xff) {
  const headers = {};
  if (ip) headers["cf-connecting-ip"] = ip;
  if (xff) headers["x-forwarded-for"] = xff;
  return headers;
}

const build = {
  photos: (ip, xff) =>
    apiRequest("/api/photos", {
      method: "POST",
      headers: { "content-type": "image/jpeg", ...identityHeaders(ip, xff) },
    }),
  cameras: (ip) =>
    apiRequest("/api/cameras", {
      method: "POST",
      body: { title: "Rate-limit test camera", kind: "Dome", latitude: 44.4, longitude: 12.2 },
      headers: identityHeaders(ip),
    }),
  appeals: (ip) =>
    apiRequest("/api/appeals", {
      method: "POST",
      body: {
        entity: "camera",
        entityId: 42,
        decisionEventId: 7,
        reason: "The decision relies on stale data.",
      },
      headers: { "x-osdb-user-email": CONTRIBUTOR.email, ...identityHeaders(ip) },
    }),
  moderation: (ip) =>
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: {
        entity: "camera",
        id: 5,
        action: "approve",
        reasonCode: "verified-public-infrastructure",
        actorId: 2,
      },
      headers: { "x-osdb-user-email": MODERATOR.email, ...identityHeaders(ip) },
    }),
  nearby: (ip) =>
    apiRequest("/api/cameras/nearby?latitude=44.4&longitude=12.2&radius=75", {
      headers: identityHeaders(ip),
    }),
  revisions: (ip) =>
    apiRequest("/api/cameras/revisions?cameraId=5", { headers: identityHeaders(ip) }),
  search: (ip) =>
    apiRequest(`/api/cameras/search?q=${encodeURIComponent("41.9004, 12.4936")}`, {
      headers: identityHeaders(ip),
    }),
};

const routes = {
  photos: () => loadRoute("app/api/photos/route.mjs"),
  cameras: () => loadRoute("app/api/cameras/route.mjs"),
  appeals: () => loadRoute("app/api/appeals/route.mjs"),
  moderation: () => loadRoute("app/api/moderation/route.mjs"),
  nearby: () => loadRoute("app/api/cameras/nearby/route.mjs"),
  revisions: () => loadRoute("app/api/cameras/revisions/route.mjs"),
};

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

function assertBlocked(response, message = "the request must be rate-limited") {
  assert.equal(response.status, 429, `${message} (status must be exactly 429, never a 500)`);
  const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  assert.ok(
    Number.isInteger(retryAfter) && retryAfter >= 1,
    `the 429 must carry a positive Retry-After, got "${response.headers.get("Retry-After")}"`,
  );
}

async function assertErrorBody(response, pattern) {
  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.match(body.error, pattern);
}

// Run fn with console.error captured so the fire-and-forget abuse-alert
// delivery can be asserted without a real webhook. When `sink` is provided
// the captured args are pushed into it, so callers can poll for async
// deliveries (the alert awaits WebCrypto before logging).
async function captureErrors(fn, sink = []) {
  const original = console.error;
  console.error = (...args) => sink.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return sink;
}

// deliverAbuseAlert awaits sha256Hex (WebCrypto) before logging, so the
// fire-and-forget alert needs a real tick or two. Poll for the captured
// message instead of sleeping a fixed 25ms: deterministic under load.
async function waitForAlert(messages, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (messages.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// ---------------------------------------------------------------------------
// 1. Each route family answers 429 + Retry-After once its limit is exceeded,
//    and the blocked request never reaches the database layer.
// ---------------------------------------------------------------------------

test("POST /api/photos rate-limits the submit family with 429 + Retry-After", async () => {
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { POST } = await routes.photos();
  const caller = "203.0.113.101";

  const first = await POST(build.photos(caller));
  assert.equal(first.status, 415, "the first request must pass the rate gate (and fail image validation)");

  const blocked = await POST(build.photos(caller));
  assertBlocked(blocked);
  await assertErrorBody(blocked, /too many submissions/i);
});

test("POST /api/cameras rate-limits the submit family with 429 + Retry-After", async () => {
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  stub("createPendingCamera", async (input) => ({ id: 1, ...input }));
  stub("linkPhotosToCamera", async () => 0);
  stub("findNearbyPublicCameras", async () => []);
  const { POST } = await routes.cameras();
  const caller = "203.0.113.102";

  const first = await POST(build.cameras(caller));
  assert.equal(first.status, 201, "the first request within the window must be stored");

  const blocked = await POST(build.cameras(caller));
  assertBlocked(blocked);
  await assertErrorBody(blocked, /too many submissions/i);
  assert.equal(callArgs("createPendingCamera").length, 1, "the blocked request must not reach the db layer");
});

test("POST /api/appeals rate-limits the appeal family with 429 + Retry-After", async () => {
  env.MODERATION_RATE_LIMIT_MAX = "1";
  env.MODERATION_RATE_LIMIT_WINDOW_SECONDS = "60";
  stubAuth(CONTRIBUTOR);
  stub("fileAppeal", async (input) => ({
    kind: "ok",
    appeal: { id: 9, status: "pending", ...input },
    event: { id: 1 },
  }));
  const { POST } = await routes.appeals();
  const caller = "203.0.113.103";

  const first = await POST(build.appeals(caller));
  assert.equal(first.status, 201, "the first appeal within the window must be filed");

  const blocked = await POST(build.appeals(caller));
  assertBlocked(blocked);
  await assertErrorBody(blocked, /too many requests/i);
  assert.equal(callArgs("fileAppeal").length, 1, "the blocked request must not reach the db layer");
});

test("PATCH /api/moderation rate-limits the moderate family with 429 + Retry-After", async () => {
  env.MODERATION_RATE_LIMIT_MAX = "1";
  env.MODERATION_RATE_LIMIT_WINDOW_SECONDS = "60";
  stubAuth(MODERATOR);
  stub("getReviewerByUserId", async () => REVIEWER);
  stub("moderateCamera", async () => ({ kind: "ok", entity: "camera", id: 5 }));
  const { PATCH } = await routes.moderation();
  const caller = "203.0.113.104";

  const first = await PATCH(build.moderation(caller));
  assert.equal(first.status, 200, "the first decision within the window must be recorded");

  const blocked = await PATCH(build.moderation(caller));
  assertBlocked(blocked);
  await assertErrorBody(blocked, /too many requests/i);
  assert.equal(callArgs("moderateCamera").length, 1, "the blocked request must not reach the db layer");
});

test("GET /api/cameras/nearby rate-limits the nearby family with 429 + Retry-After", async () => {
  env.NEARBY_RATE_LIMIT_MAX = "1";
  env.NEARBY_RATE_LIMIT_WINDOW_SECONDS = "60";
  stub("findNearbyPublicCameras", async () => []);
  const { GET } = await routes.nearby();
  const caller = "203.0.113.105";

  const first = await GET(build.nearby(caller));
  assert.equal(first.status, 200, "the first query within the window must be answered");

  const blocked = await GET(build.nearby(caller));
  assertBlocked(blocked);
  await assertErrorBody(blocked, /too many requests/i);
  assert.equal(callArgs("findNearbyPublicCameras").length, 1, "the blocked request must not reach the db layer");
});

test("GET /api/cameras/revisions rate-limits the revisions family with 429 + Retry-After", async () => {
  env.REVISIONS_RATE_LIMIT_MAX = "1";
  env.REVISIONS_RATE_LIMIT_WINDOW_SECONDS = "60";
  stub("getPublicCameraById", async () => ({ id: 5, title: "Rate-limit test record" }));
  stub("listPublicCameraRevisions", async () => []);
  const { GET } = await routes.revisions();
  const caller = "203.0.113.106";

  const first = await GET(build.revisions(caller));
  assert.equal(first.status, 200, "the first summary within the window must be answered");

  const blocked = await GET(build.revisions(caller));
  assertBlocked(blocked);
  await assertErrorBody(blocked, /too many requests/i);
  assert.equal(callArgs("listPublicCameraRevisions").length, 1, "the blocked request must not reach the db layer");
});

// ---------------------------------------------------------------------------
// 2. Calls under the threshold are never rate-limited (no spurious 429).
// ---------------------------------------------------------------------------

test("calls under the threshold are not rate-limited on any route family", async (t) => {
  const cases = [
    {
      name: "POST /api/photos",
      knob: "POST_RATE_LIMIT_MAX",
      handler: async () => (await routes.photos()).POST,
      request: () => build.photos("203.0.113.111"),
      expected: 415,
    },
    {
      name: "POST /api/cameras",
      knob: "POST_RATE_LIMIT_MAX",
      setup: () => {
        stub("createPendingCamera", async (input) => ({ id: 1, ...input }));
        stub("linkPhotosToCamera", async () => 0);
        stub("findNearbyPublicCameras", async () => []);
      },
      handler: async () => (await routes.cameras()).POST,
      request: () => build.cameras("203.0.113.112"),
      expected: 201,
    },
    {
      name: "POST /api/appeals",
      knob: "MODERATION_RATE_LIMIT_MAX",
      setup: () => {
        stubAuth(CONTRIBUTOR);
        stub("fileAppeal", async (input) => ({ kind: "ok", appeal: { id: 9, ...input }, event: { id: 1 } }));
      },
      handler: async () => (await routes.appeals()).POST,
      request: () => build.appeals("203.0.113.113"),
      expected: 201,
    },
    {
      name: "PATCH /api/moderation",
      knob: "MODERATION_RATE_LIMIT_MAX",
      setup: () => {
        stubAuth(MODERATOR);
        stub("getReviewerByUserId", async () => REVIEWER);
        stub("moderateCamera", async () => ({ kind: "ok", entity: "camera", id: 5 }));
      },
      handler: async () => (await routes.moderation()).PATCH,
      request: () => build.moderation("203.0.113.114"),
      expected: 200,
    },
    {
      name: "GET /api/cameras/nearby",
      knob: "NEARBY_RATE_LIMIT_MAX",
      setup: () => stub("findNearbyPublicCameras", async () => []),
      handler: async () => (await routes.nearby()).GET,
      request: () => build.nearby("203.0.113.115"),
      expected: 200,
    },
    {
      name: "GET /api/cameras/revisions",
      knob: "REVISIONS_RATE_LIMIT_MAX",
      setup: () => {
        stub("getPublicCameraById", async () => ({ id: 5, title: "Rate-limit test record" }));
        stub("listPublicCameraRevisions", async () => []);
      },
      handler: async () => (await routes.revisions()).GET,
      request: () => build.revisions("203.0.113.116"),
      expected: 200,
    },
  ];

  for (const { name, knob, setup, handler, request, expected } of cases) {
    await t.test(name, async () => {
      resetMockState();
      rateLimit.resetRateLimitState();
      env[knob] = "3"; // three allowed slots per window
      env[`${knob.replace("_MAX", "_WINDOW_SECONDS")}`] = "60";
      setup?.();
      const call = await handler();
      const responses = [];
      for (let i = 0; i < 3; i += 1) {
        responses.push(await call(request()));
      }
      for (const [index, response] of responses.entries()) {
        assert.notEqual(response.status, 429, `request ${index + 1} must not be rate-limited`);
        assert.equal(response.status, expected, `request ${index + 1} must reach its normal handler path`);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Route families keep independent windows.
// ---------------------------------------------------------------------------

test("route families keep independent rate-limit windows", async () => {
  const caller = "203.0.113.200";

  // Exhaust the submit family through POST /api/photos.
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  const photosRoute = await routes.photos();
  const first = await photosRoute.POST(build.photos(caller));
  assert.notEqual(first.status, 429, "the first submit must pass");
  const submitBlocked = await photosRoute.POST(build.photos(caller));
  assertBlocked(submitBlocked, "the submit family must be exhausted for this caller");

  // The plain read family is untouched by the submit burst.
  stub("listPublicCameras", async () => []);
  const camerasRoute = await routes.cameras();
  const read = await camerasRoute.GET(apiRequest("/api/cameras", { headers: identityHeaders(caller) }));
  assert.equal(read.status, 200, "the read bucket must not be affected by the submit bucket");

  // The search family is untouched too (the task's canonical example: a
  // photos burst must not starve search).
  stub("searchPublicCamerasNear", async () => []);
  const searchRoute = await loadRoute("app/api/cameras/search/route.mjs");
  const search = await searchRoute.GET(build.search(caller));
  assert.equal(search.status, 200, "the search bucket must not be affected by the submit bucket");

  // Nearby and revisions are untouched as well.
  stub("findNearbyPublicCameras", async () => []);
  const nearbyRoute = await routes.nearby();
  const nearby = await nearbyRoute.GET(build.nearby(caller));
  assert.equal(nearby.status, 200, "the nearby bucket must not be affected by the submit bucket");

  stub("getPublicCameraById", async () => ({ id: 5, title: "Rate-limit test record" }));
  stub("listPublicCameraRevisions", async () => []);
  const revisionsRoute = await routes.revisions();
  const revisions = await revisionsRoute.GET(build.revisions(caller));
  assert.equal(revisions.status, 200, "the revisions bucket must not be affected by the submit bucket");

  // Reverse direction: exhausting nearby must not block a fresh submit
  // caller in the submit family.
  env.NEARBY_RATE_LIMIT_MAX = "1";
  env.NEARBY_RATE_LIMIT_WINDOW_SECONDS = "60";
  rateLimit.resetRateLimitState();
  const nearFirst = await nearbyRoute.GET(build.nearby(caller));
  assert.notEqual(nearFirst.status, 429);
  const nearBlocked = await nearbyRoute.GET(build.nearby(caller));
  assertBlocked(nearBlocked, "the nearby family must be exhausted for this caller");

  const freshSubmit = await photosRoute.POST(build.photos("203.0.113.201"));
  assert.notEqual(freshSubmit.status, 429, "a fresh submit caller must not inherit the nearby block");
});

// ---------------------------------------------------------------------------
// 4. Caller identity: edge IP preferred, forwarded-hop fallback, "unknown"
//    degradation without crashes.
// ---------------------------------------------------------------------------

test("the caller key prefers the edge IP over X-Forwarded-For at the route layer", async () => {
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { POST } = await routes.photos();

  // Same edge IP with a different forwarded hop stays blocked: the edge IP
  // is authoritative when present.
  rateLimit.resetRateLimitState();
  const edgeA1 = await POST(build.photos("1.1.1.1", "9.9.9.9, 10.0.0.1"));
  assert.notEqual(edgeA1.status, 429, "first request for edge IP 1.1.1.1 must pass");
  const edgeA2 = await POST(build.photos("1.1.1.1", "8.8.8.8, 10.0.0.1"));
  assertBlocked(edgeA2, "a second request from the same edge IP must be blocked even with a different XFF");
  const edgeB = await POST(build.photos("2.2.2.2", "9.9.9.9, 10.0.0.1"));
  assert.notEqual(edgeB.status, 429, "a different edge IP must have its own window");
});

test("the caller key falls back to the first X-Forwarded-For hop without an edge IP", async () => {
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { POST } = await routes.photos();

  const first = await POST(build.photos(undefined, "203.0.113.9, 10.0.0.1"));
  assert.notEqual(first.status, 429, "first request for this forwarded hop must pass");
  const sameHop = await POST(build.photos(undefined, "203.0.113.9, 10.0.0.1"));
  assertBlocked(sameHop, "a second request with the same first hop must be blocked");
  const otherHop = await POST(build.photos(undefined, "203.0.113.10, 10.0.0.1"));
  assert.notEqual(otherHop.status, 429, "a different first hop must have its own window");
});

test("a request with no identity header degrades to the unknown key without crashing", async () => {
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { POST } = await routes.photos();

  const first = await POST(build.photos());
  assert.notEqual(first.status, 429, "the first anonymous request must not be rate-limited");
  assert.equal(first.status, 415, "it must reach the normal handler path (image validation), not crash");
  const blocked = await POST(build.photos());
  assertBlocked(blocked, "the shared unknown key must hit the limit — but answer a clean 429, never a 500");
});

// ---------------------------------------------------------------------------
// 5. A block is a clean 429 (never a 500) and the hashed abuse alert fires
//    once per cooldown window.
// ---------------------------------------------------------------------------

test("a 429 is a clean 429 and the hashed abuse alert fires once per cooldown", async () => {
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  env.ABUSE_ALERT_THRESHOLD = "1";
  env.ABUSE_ALERT_SURGE_THRESHOLD = "1000"; // silence the aggregate surge alert
  env.ABUSE_ALERT_COOLDOWN_SECONDS = "300";
  const caller = "203.0.113.210";
  const { POST } = await routes.photos();

  const messages = [];
  await captureErrors(async () => {
    const first = await POST(build.photos(caller));
    assert.notEqual(first.status, 429);
    const blocked = await POST(build.photos(caller));
    assertBlocked(blocked);
    const again = await POST(build.photos(caller));
    assertBlocked(again, "a repeated block within the cooldown must still answer 429, not 500");
    await waitForAlert(messages);
  }, messages);

  assert.equal(messages.length, 1, "exactly one alert fires when the per-caller threshold is crossed");
  const [label, serialized] = messages[0];
  assert.equal(label, "[abuse-alert]");
  const payload = JSON.parse(serialized);
  assert.equal(payload.source, "open-surveillance-db");
  assert.equal(payload.event, "rate_limited");
  assert.equal(payload.route, "/api/photos");
  assert.match(payload.callerHash, /^[0-9a-f]{64}$/, "the caller must be identified only by a SHA-256 hash");
  assert.ok(!serialized.includes(caller), "the alert must never carry the raw caller key");
  assert.ok(!serialized.includes("203.0.113"), "no part of the raw IP may leak into an alert");
  assert.equal(payload.count, 1, "the alert reports the block counter at the moment it crosses the threshold");
  assert.equal(payload.windowSeconds, 60);
});
