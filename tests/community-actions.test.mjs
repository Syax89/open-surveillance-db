import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  apiRequest,
  cleanupRouteTree,
  loadLibModule,
  loadRoute,
  loadTreeModule,
  responseBody,
} from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;
let abuseAlerts;
let env;

async function sharedEnv() {
  return (await loadTreeModule("cloudflare-workers.mjs")).env;
}

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  if (!abuseAlerts) abuseAlerts = await loadLibModule("abuse-alerts");
  if (!env) env = await sharedEnv();
  rateLimit.resetRateLimitState();
  abuseAlerts.resetAbuseAlertState();
  for (const key of Object.keys(env)) {
    if (key.startsWith("ACTION_") || key.startsWith("ABUSE_ALERT_")) delete env[key];
  }
});

after(async () => cleanupRouteTree());

const actionsRoute = () => loadRoute("app/api/cameras/[id]/actions/route.mjs");

const contributor = {
  id: 7,
  email: "contributor@example.org",
  displayName: "Contributor",
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
};

const sessionFixture = {
  id: 1,
  contributorId: 7,
  tokenHash: "hash-of-raw-token",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T08:00:00.000Z",
  expiresAt: "2026-08-31T08:00:00.000Z",
  revokedAt: null,
};

function sessionRequest(pathAndQuery, { headers = {}, ...rest } = {}) {
  return apiRequest(pathAndQuery, {
    ...rest,
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      ...headers,
    },
  });
}

function authed(method, pathAndQuery, { headers = {}, body, ...rest } = {}) {
  return sessionRequest(pathAndQuery, {
    method,
    headers: { "x-csrf-token": "csrf-token-123", ...headers },
    body,
    ...rest,
  });
}

// ---------------------------------------------------------------------------
// PUT — upsert/switch
// ---------------------------------------------------------------------------

test("PUT answers 401 without a session", async () => {
  const { PUT } = await actionsRoute();
  const response = await PUT(apiRequest("/api/cameras/5/actions", { method: "PUT", body: { action: "like" } }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("setCommunityAction").length, 0);
});

test("PUT rejects unverified contributors (403)", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: null, authProvider: "password" }));
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
  assert.equal(response.status, 403);
  assert.equal(callArgs("setCommunityAction").length, 0);
});

test("PUT rejects missing or wrong CSRF token", async (t) => {
  const { PUT } = await actionsRoute();
  await t.test("missing header", async () => {
    stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
    stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await PUT(sessionRequest("/api/cameras/5/actions", { method: "PUT", body: { action: "like" } }));
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Invalid CSRF token. Refresh the page and try again.");
    assert.equal(callArgs("setCommunityAction").length, 0);
  });
  await t.test("wrong header", async () => {
    stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
    stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await PUT(
      sessionRequest("/api/cameras/5/actions", {
        method: "PUT",
        headers: { "x-csrf-token": "wrong-token" },
        body: { action: "like" },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(callArgs("setCommunityAction").length, 0);
  });
});

test("PUT rejects cross-origin requests", async () => {
  const { PUT } = await actionsRoute();
  const response = await PUT(
    apiRequest("/api/cameras/5/actions", {
      method: "PUT",
      headers: { origin: "https://evil.test" },
      body: { action: "like" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Cross-origin request rejected.");
  assert.equal(callArgs("setCommunityAction").length, 0);
});

test("PUT answers 414 when URL is too long", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  const { PUT } = await actionsRoute();
  const longPath = "/api/cameras/5/actions?" + "x".repeat(8000);
  const response = await PUT(authed("PUT", longPath, { body: { action: "like" } }));
  assert.equal(response.status, 414);
});

test("PUT answers 404 for a non-numeric id", async (t) => {
  const { PUT } = await actionsRoute();
  for (const id of ["abc", "0", "-1", "1e3"]) {
    await t.test(id, async () => {
      stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
      stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
      const response = await PUT(authed("PUT", `/api/cameras/${id}/actions`, { body: { action: "like" } }));
      assert.equal(response.status, 404, `id ${id} must be 404`);
      assert.equal(callArgs("setCommunityAction").length, 0);
    });
  }
});

test("PUT answers 400 for non-JSON body", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  const { PUT } = await actionsRoute();
  const response = await PUT(
    authed("PUT", "/api/cameras/5/actions", {
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token-123" },
      body: "not json",
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(callArgs("setCommunityAction").length, 0);
});

test("PUT answers 422 for an action type outside the whitelist", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "bogus" } }));
  assert.equal(response.status, 422);
  assert.equal((await responseBody(response)).error, "Invalid action type. Use one of: like, confirm, gone, problem, privacy.");
  assert.equal(callArgs("setCommunityAction").length, 0);
});

test("PUT respects the action rate-limit bucket and answers 429 with Retry-After", async () => {
  env.ACTION_RATE_LIMIT_MAX = "1";
  env.ACTION_RATE_LIMIT_WINDOW_SECONDS = "60";
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "like", counts: { like: 1, confirm: 0, gone: 0, problem: 0, privacy: 0 } }));
  const { PUT } = await actionsRoute();

  const first = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
  assert.equal(first.status, 200);

  const blocked = await PUT(authed("PUT", "/api/cameras/6/actions", { body: { action: "like" } }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.headers.get("cache-control"), "no-store");
});

test("PUT maps duplicate to 409", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => ({ kind: "duplicate" }));
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
  assert.equal(response.status, 409);
  assert.equal((await responseBody(response)).error, "This action is already set.");
});

test("PUT maps self_action to 403", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => ({ kind: "self_action" }));
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "You cannot like or confirm your own report.");
});

test("PUT maps camera_not_found to 404", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => ({ kind: "camera_not_found" }));
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
  assert.equal(response.status, 404);
  assert.equal((await responseBody(response)).error, "Camera not found.");
});

test("PUT ok returns {action, counts} with no-store header", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "like", counts: { like: 3, confirm: 0, gone: 1, problem: 0, privacy: 0 } }));
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: "like", counts: { like: 3, confirm: 0, gone: 1, problem: 0, privacy: 0 } });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [input] = callArgs("setCommunityAction")[0];
  assert.equal(input.cameraId, 5);
  assert.equal(input.contributorId, 7);
  assert.equal(input.actionType, "like");
});

test("PUT switched returns {action, switchedFrom, counts}", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => ({ kind: "switched", actionType: "gone", switchedFrom: "like", counts: { like: 0, confirm: 0, gone: 1, problem: 0, privacy: 0 } }));
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "gone" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: "gone", switchedFrom: "like", counts: { like: 0, confirm: 0, gone: 1, problem: 0, privacy: 0 } });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("PUT maps both quota kinds to 429 with Retry-After", async (t) => {
  const { PUT } = await actionsRoute();
  for (const [kind, result] of [
    ["daily_quota_exceeded", { kind: "daily_quota_exceeded", retryAfterSeconds: 42 }],
    ["per_record_cap_exceeded", { kind: "per_record_cap_exceeded", retryAfterSeconds: 43 }],
  ]) {
    await t.test(kind, async () => {
      stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
      stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
      stub("setCommunityAction", async () => result);
      const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
      assert.equal(response.status, 429);
      assert.equal((await responseBody(response)).error, "Too many actions. Try again later.");
      assert.equal(response.headers.get("retry-after"), String(result.retryAfterSeconds));
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});

test("PUT returns 503 when the database is unavailable", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => {
    throw new Error("Database binding unavailable");
  });
  const { PUT } = await actionsRoute();
  const response = await PUT(authed("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database unavailable");
});

// ---------------------------------------------------------------------------
// DELETE — remove action
// ---------------------------------------------------------------------------

test("DELETE answers 401 without a session", async () => {
  const { DELETE: del } = await actionsRoute();
  const response = await del(apiRequest("/api/cameras/5/actions", { method: "DELETE" }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("removeCommunityAction").length, 0);
});

test("DELETE rejects missing CSRF token", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  const { DELETE: del } = await actionsRoute();
  const response = await del(sessionRequest("/api/cameras/5/actions", { method: "DELETE" }));
  assert.equal(response.status, 403);
  assert.equal(callArgs("removeCommunityAction").length, 0);
});

test("DELETE rejects cross-origin requests", async () => {
  const { DELETE: del } = await actionsRoute();
  const response = await del(
    apiRequest("/api/cameras/5/actions", {
      method: "DELETE",
      headers: { origin: "https://evil.test" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("removeCommunityAction").length, 0);
});

test("DELETE returns {action:null} with no-store on success", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("removeCommunityAction", async () => ({ kind: "ok" }));
  const { DELETE: del } = await actionsRoute();
  const response = await del(authed("DELETE", "/api/cameras/5/actions"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: null });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [input] = callArgs("removeCommunityAction")[0];
  assert.equal(input.cameraId, 5);
  assert.equal(input.contributorId, 7);
});

test("DELETE answers 404 when no action exists", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("removeCommunityAction", async () => ({ kind: "not_found" }));
  const { DELETE: del } = await actionsRoute();
  const response = await del(authed("DELETE", "/api/cameras/5/actions"));
  assert.equal(response.status, 404);
  assert.equal((await responseBody(response)).error, "No action found.");
});

// ---------------------------------------------------------------------------
// GET — personal state
// ---------------------------------------------------------------------------

test("GET returns {action:null} for anonymous callers with no-store", async () => {
  const { GET } = await actionsRoute();
  const response = await GET(apiRequest("/api/cameras/5/actions"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: null });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET returns the caller's action with no-store", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getCommunityAction", async () => ({ actionType: "like" }));
  const { GET } = await actionsRoute();
  const response = await GET(sessionRequest("/api/cameras/5/actions"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: "like" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [camId, contribId] = callArgs("getCommunityAction")[0];
  assert.equal(camId, 5);
  assert.equal(contribId, 7);
});

test("GET returns {action:null} when the contributor has no action", async () => {
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getCommunityAction", async () => null);
  const { GET } = await actionsRoute();
  const response = await GET(sessionRequest("/api/cameras/5/actions"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: null });
});

test("GET answers 404 for a malformed id", async (t) => {
  const { GET } = await actionsRoute();
  for (const id of ["abc", "0", "-1", "1e3"]) {
    await t.test(id, async () => {
      const response = await GET(apiRequest(`/api/cameras/${id}/actions`));
      assert.equal(response.status, 404);
    });
  }
});

test("GET returns 503 when session lookup fails", async () => {
  stub("findSessionByToken", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await actionsRoute();
  const response = await GET(authed("GET", "/api/cameras/5/actions"));
  assert.equal(response.status, 503);
});

test("GET respects the read rate-limit bucket BEFORE session resolution (429 + Retry-After)", async () => {
  // Audit 2026-08-09 (P2): the personal-state read was completely unmetered
  // — an anonymous caller could enumerate camera ids with no bucket in the
  // way. It now shares the read bucket (60/min); the throttled request must
  // never reach session resolution or the db layer.
  const previousMax = env.READ_RATE_LIMIT_MAX;
  const previousWindow = env.READ_RATE_LIMIT_WINDOW_SECONDS;
  env.READ_RATE_LIMIT_MAX = "1";
  env.READ_RATE_LIMIT_WINDOW_SECONDS = "60";
  let lookups = 0;
  stub("findSessionByToken", async () => {
    lookups += 1;
    return null;
  });
  try {
    const { GET } = await actionsRoute();
    const first = await GET(sessionRequest("/api/cameras/5/actions"));
    assert.equal(first.status, 200, "the first read within the window must be answered");
    assert.deepEqual(await responseBody(first), { action: null });
    assert.equal(lookups, 1, "the first request resolves the session");

    const blocked = await GET(sessionRequest("/api/cameras/6/actions"));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.equal(blocked.headers.get("cache-control"), "no-store");
    assert.equal(lookups, 1, "the throttled request must never reach session resolution");
    assert.equal(callArgs("getCommunityAction").length, 0, "the throttled request must never reach the db layer");
  } finally {
    env.READ_RATE_LIMIT_MAX = previousMax;
    env.READ_RATE_LIMIT_WINDOW_SECONDS = previousWindow;
  }
});
