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
    assert.equal((await responseBody(response)).error, "Cross-site request rejected. Refresh the page and try again.");
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

test("PUT rejects cross-origin session requests; anonymous callers hit the gate first (401)", async (t) => {
  const { PUT } = await actionsRoute();
  await t.test("cross-origin with a live session", async () => {
    stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
    stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await PUT(
      apiRequest("/api/cameras/5/actions", {
        method: "PUT",
        headers: {
          cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
          "x-csrf-token": "csrf-token-123",
          origin: "https://evil.test",
        },
        body: { action: "like" },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Cross-site request rejected. Refresh the page and try again.");
    assert.equal(callArgs("setCommunityAction").length, 0);
  });
  await t.test("cross-origin without a session answers the uniform 401 (gate before origin)", async () => {
    const response = await PUT(
      apiRequest("/api/cameras/5/actions", {
        method: "PUT",
        headers: { origin: "https://evil.test" },
        body: { action: "like" },
      }),
    );
    assert.equal(response.status, 401);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(callArgs("setCommunityAction").length, 0);
  });
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

test("DELETE rejects cross-origin session requests; anonymous callers hit the gate first (401)", async (t) => {
  const { DELETE: del } = await actionsRoute();
  await t.test("cross-origin with a live session", async () => {
    stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
    stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await del(
      apiRequest("/api/cameras/5/actions", {
        method: "DELETE",
        headers: {
          cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
          "x-csrf-token": "csrf-token-123",
          origin: "https://evil.test",
        },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Cross-site request rejected. Refresh the page and try again.");
    assert.equal(callArgs("removeCommunityAction").length, 0);
  });
  await t.test("cross-origin without a session answers the uniform 401 (gate before origin)", async () => {
    const response = await del(
      apiRequest("/api/cameras/5/actions", {
        method: "DELETE",
        headers: { origin: "https://evil.test" },
      }),
    );
    assert.equal(response.status, 401);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(callArgs("removeCommunityAction").length, 0);
  });
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

// ---------------------------------------------------------------------------
// PUT/DELETE — write API keys (EPIC api-keys T16)
// ---------------------------------------------------------------------------
// The toggle gates on requireWriteAuth(request, "action"), so a machine
// client authenticates with `Authorization: Bearer *** (D4 `action`
// scope) instead of a session cookie. The session-only extras (same-origin +
// CSRF) are skipped on the key path: a machine client holding a secret
// bearer credential carries no ambient browser authority, and its toggle
// volume is bounded by the additive per-key `key:<id>` bucket (D8/T12). The
// bearer chain (sha256Hex -> findApiKeyByHash -> touchApiKeyLastUsed) is
// exercised with the db boundary mocked, exactly as in tests/write-gate.test.mjs.

const apiKey = {
  id: 41,
  contributorId: 7,
  name: "ci",
  keyPrefix: "osdb_AbCde",
  keyHash: "hash",
  scopes: JSON.stringify(["submit", "action"]),
  createdAt: "2026-08-01T00:00:00.000Z",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
};
const keyContributor = {
  id: 7,
  email: "contributor@osdb.test",
  displayName: "Contributor",
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  authProvider: "password",
};

/** Resolve a live key whose scopes / owner-verification can be overridden. */
function liveKey({ scopes = ["submit", "action"], emailVerifiedAt = keyContributor.emailVerifiedAt } = {}) {
  stub("sha256Hex", async (token) => `hash-of-${token}`);
  stub("findApiKeyByHash", async () => ({
    key: { ...apiKey, scopes: JSON.stringify(scopes) },
    contributor: { ...keyContributor, emailVerifiedAt },
  }));
  stub("touchApiKeyLastUsed", async () => true);
}

/** PUT/DELETE /api/cameras/[id]/actions authenticating with a Bearer key. */
function bearerAction(method, pathAndQuery, { headers = {}, body, ...rest } = {}) {
  return apiRequest(pathAndQuery, {
    method,
    headers: { authorization: "Bearer osdb_test-key-123", ...headers },
    body,
    ...rest,
  });
}

test("PUT with a valid Bearer key (action scope) applies the action under the key owner (T16)", async () => {
  liveKey();
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "like", counts: { like: 3, confirm: 0, gone: 0, problem: 0, privacy: 0 } }));
  const { PUT } = await actionsRoute();
  const response = await PUT(bearerAction("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: "like", counts: { like: 3, confirm: 0, gone: 0, problem: 0, privacy: 0 } });
  assert.equal(callArgs("setCommunityAction")[0][0].contributorId, 7, "attribution is the key owner, never anonymous");
  assert.equal(callArgs("findSessionByToken").length, 0, "the session store must never be consulted on the key path");
  assert.equal(callArgs("touchApiKeyLastUsed").length, 1, "a successful key resolution touches last_used (throttled in the db layer)");
});

test("DELETE with a valid Bearer key (action scope) removes the action (T16)", async () => {
  liveKey();
  stub("removeCommunityAction", async () => ({ kind: "ok" }));
  const { DELETE: del } = await actionsRoute();
  const response = await del(bearerAction("DELETE", "/api/cameras/5/actions"));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { action: null });
  assert.equal(callArgs("removeCommunityAction")[0][0].contributorId, 7);
  assert.equal(callArgs("findSessionByToken").length, 0);
});

test("key path skips same-origin and CSRF (T16 conditional guards)", async () => {
  // The CSRF/same-origin check is conditional on authMethod === "session": a
  // machine client holding a secret bearer credential carries no ambient
  // browser authority. So a key-authenticated request must sail through a
  // cross-site Origin and a missing X-CSRF-Token — neither session-branch
  // 403 may surface.
  liveKey();
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "gone", counts: { like: 0, confirm: 0, gone: 1, problem: 0, privacy: 0 } }));
  const { PUT } = await actionsRoute();

  const response = await PUT(
    bearerAction("PUT", "/api/cameras/5/actions", {
      origin: "https://evil.example",
      referer: "https://evil.example/phish",
      body: { action: "gone" },
    }),
  );
  assert.equal(response.status, 200, "a key request with a cross-site Origin and no CSRF token must pass");
  assert.equal(callArgs("setCommunityAction").length, 1);
});

test("PUT rejects a key without the action scope (403 canonical, no write)", async () => {
  liveKey({ scopes: ["submit", "confirm"] });
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "like", counts: {} }));
  const { PUT } = await actionsRoute();
  const response = await PUT(bearerAction("PUT", "/api/cameras/5/actions", { body: { action: "like" } }));

  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("setCommunityAction").length, 0, "no write on scope mismatch");
});

test("PUT rejects an invalid/revoked/expired key (401 canonical, no session fallback)", async () => {
  // findApiKeyByHash -> null collapses unknown/revoked/expired (D6/D9): the
  // route must answer the uniform 401 even when a verified session cookie is
  // ALSO present — fail-closed, never a silent downgrade to the session.
  stub("sha256Hex", async () => "hash");
  stub("findApiKeyByHash", async () => null);
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "like", counts: {} }));
  const { PUT } = await actionsRoute();
  const response = await PUT(
    bearerAction("PUT", "/api/cameras/5/actions", {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      body: { action: "like" },
    }),
  );

  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(callArgs("findSessionByToken").length, 0, "fail-closed: a dead key must never fall through to the session");
  assert.equal(callArgs("setCommunityAction").length, 0);
});

test("key-authenticated requests are double-counted against their key:<id> bucket (D8/T16)", async () => {
  // The additive per-key check runs AFTER the gate on top of the per-IP
  // check: a key caller must pass BOTH buckets. Each request rotates its
  // cf-connecting-ip so the per-IP bucket never trips; once the key's own
  // budget (ACTION_RATE_LIMIT_MAX=1) is spent the next request answers 429
  // with Retry-After even though the per-IP bucket still has room.
  liveKey();
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "like", counts: { like: 1, confirm: 0, gone: 0, problem: 0, privacy: 0 } }));
  env.ACTION_RATE_LIMIT_MAX = "1";
  env.ACTION_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { PUT } = await actionsRoute();

  const first = await PUT(
    bearerAction("PUT", "/api/cameras/5/actions", { "cf-connecting-ip": "203.0.113.10", body: { action: "like" } }),
  );
  assert.equal(first.status, 200, "first request passes both buckets");
  assert.equal(callArgs("setCommunityAction").length, 1);

  const second = await PUT(
    bearerAction("PUT", "/api/cameras/6/actions", { "cf-connecting-ip": "203.0.113.11", body: { action: "like" } }),
  );
  assert.equal(second.status, 429, "the key's own budget is spent -> 429 despite a fresh IP");
  assert.ok(Number(second.headers.get("retry-after")) > 0, "Retry-After is present");
  assert.equal((await responseBody(second)).error, "Too many requests. Please try again shortly.");
  assert.equal(callArgs("setCommunityAction").length, 1, "no write on the blocked request");
});

test("session requests consume ONLY the per-IP bucket (no per-key double-count, D8)", async () => {
  // Session/anonymous callers have no additive per-key bucket: the pre-gate
  // per-IP check is the whole story. With the action per-IP budget set to 1
  // per caller, a session caller rotating IPs passes every request — a
  // (wrong) shared per-key bucket would have blocked the second one.
  stub("findSessionByToken", async () => ({ ...sessionFixture, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setCommunityAction", async () => ({ kind: "ok", actionType: "like", counts: { like: 1, confirm: 0, gone: 0, problem: 0, privacy: 0 } }));
  env.ACTION_RATE_LIMIT_MAX = "1";
  env.ACTION_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { PUT } = await actionsRoute();

  const first = await PUT(
    authed("PUT", "/api/cameras/5/actions", { headers: { "cf-connecting-ip": "203.0.113.20" }, body: { action: "like" } }),
  );
  assert.equal(first.status, 200);
  const second = await PUT(
    authed("PUT", "/api/cameras/6/actions", { headers: { "cf-connecting-ip": "203.0.113.21" }, body: { action: "like" } }),
  );
  assert.equal(second.status, 200, "a session caller on a fresh IP is never double-counted against a per-key bucket");
});
