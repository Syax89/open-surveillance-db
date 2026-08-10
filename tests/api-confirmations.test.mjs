// Runtime API tests for the community-verification toggle (ADR 0018 §2, C1):
//   PUT    /api/cameras/[id]/confirmation   toggle ON  -> { confirmed, count }
//   DELETE /api/cameras/[id]/confirmation   toggle OFF -> { confirmed, count }
//   GET    /api/cameras/[id]/confirmation   personal state -> { confirmed }
//
// db/confirmations is mocked (see tests/helpers/mocks/confirmations.mjs); the
// real anti-gaming state quota is covered separately by tests/anti-gaming.test.mjs
// against an in-memory D1. This suite pins the HTTP contract: guard order
// (write gate, same-origin/CSRF and IP-hash burst on the session branch only,
// per-caller confirm bucket, additive per-key bucket), the 404/403/409/429/503
// mappings and the no-store cache header. All fixtures are fictional.

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
let ipBurst;
let env;

async function sharedEnv() {
  return (await loadTreeModule("cloudflare-workers.mjs")).env;
}

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  if (!abuseAlerts) abuseAlerts = await loadLibModule("abuse-alerts");
  if (!ipBurst) ipBurst = await loadLibModule("confirm-ip-burst");
  if (!env) env = await sharedEnv();
  rateLimit.resetRateLimitState();
  abuseAlerts.resetAbuseAlertState();
  ipBurst.resetConfirmIpBurstState();
  for (const key of Object.keys(env)) {
    if (key.startsWith("CONFIRM_") || key.startsWith("ABUSE_ALERT_")) delete env[key];
  }
});

after(async () => cleanupRouteTree());

const confirmationRoute = () => loadRoute("app/api/cameras/[id]/confirmation/route.mjs");
const recordRoute = () => loadRoute("app/api/cameras/[id]/route.mjs");

const contributor = {
  id: 7,
  email: "contributor@example.org",
  displayName: "Contributor",
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
};

const session = {
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

const authedToggle = (method, pathAndQuery, { headers = {}, ...rest } = {}) =>
  sessionRequest(pathAndQuery, {
    method,
    headers: { "x-csrf-token": "csrf-token-123", ...headers },
    ...rest,
  });

// ---------------------------------------------------------------------------
// PUT — toggle ON
// ---------------------------------------------------------------------------

test("PUT confirms a public record and returns the decayed count (no-store)", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setConfirmation", async () => ({ kind: "ok", count: 3 }));
  const { PUT } = await confirmationRoute();
  const response = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { confirmed: true, count: 3 });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [input] = callArgs("setConfirmation")[0];
  assert.equal(input.cameraId, 5);
  assert.equal(input.contributorId, 7);
});

test("PUT answers 401 without a session", async () => {
  const { PUT } = await confirmationRoute();
  const response = await PUT(apiRequest("/api/cameras/5/confirmation", { method: "PUT" }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("setConfirmation").length, 0);
});

test("PUT rejects a live session with a missing or wrong CSRF token", async (t) => {
  const { PUT } = await confirmationRoute();
  await t.test("missing header", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await PUT(sessionRequest("/api/cameras/5/confirmation", { method: "PUT" }));
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Cross-site request rejected. Refresh the page and try again.");
    assert.equal(callArgs("setConfirmation").length, 0);
  });
  await t.test("wrong header", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await PUT(
      sessionRequest("/api/cameras/5/confirmation", {
        method: "PUT",
        headers: { "x-csrf-token": "wrong-token" },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(callArgs("setConfirmation").length, 0);
  });
});

test("PUT rejects cross-origin session requests; anonymous callers hit the gate first (401)", async (t) => {
  const { PUT } = await confirmationRoute();
  await t.test("cross-origin with a live session", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await PUT(
      apiRequest("/api/cameras/5/confirmation", {
        method: "PUT",
        headers: {
          cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
          "x-csrf-token": "csrf-token-123",
          origin: "https://evil.test",
        },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Cross-site request rejected. Refresh the page and try again.");
    assert.equal(callArgs("setConfirmation").length, 0);
  });
  await t.test("cross-origin without a session answers the uniform 401 (gate before origin)", async () => {
    const response = await PUT(
      apiRequest("/api/cameras/5/confirmation", {
        method: "PUT",
        headers: { origin: "https://evil.test" },
      }),
    );
    assert.equal(response.status, 401);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(callArgs("setConfirmation").length, 0);
  });
});

test("PUT maps camera_not_public to 404 and malformed ids never touch the db", async (t) => {
  const { PUT } = await confirmationRoute();
  await t.test("camera_not_public", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    stub("setConfirmation", async () => ({ kind: "camera_not_public" }));
    const response = await PUT(authedToggle("PUT", "/api/cameras/9/confirmation"));
    assert.equal(response.status, 404);
    assert.equal((await responseBody(response)).error, "Camera not found.");
  });
  for (const id of ["abc", "0", "-1", "1e3"]) {
    await t.test(`malformed id ${id}`, async () => {
      stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
      const response = await PUT(authedToggle("PUT", `/api/cameras/${id}/confirmation`));
      assert.equal(response.status, 404, `id ${id} must be 404`);
      assert.equal(callArgs("setConfirmation").length, 0, `id ${id} must not reach the db`);
    });
  }
});

test("PUT maps level_gate and self_verify to 403 with distinct messages", async (t) => {
  const { PUT } = await confirmationRoute();
  await t.test("level_gate", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    stub("setConfirmation", async () => ({ kind: "level_gate" }));
    const response = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
    assert.equal(response.status, 403);
    assert.equal(
      (await responseBody(response)).error,
      "Verifications require at least one verified contribution.",
    );
  });
  await t.test("self_verify", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    stub("setConfirmation", async () => ({ kind: "self_verify" }));
    const response = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "You cannot verify your own report.");
  });
});

test("PUT maps duplicate to 409", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setConfirmation", async () => ({ kind: "duplicate" }));
  const { PUT } = await confirmationRoute();
  const response = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
  assert.equal(response.status, 409);
  assert.equal((await responseBody(response)).error, "This record is already verified by you.");
});

test("PUT maps both quota kinds to 429 with Retry-After", async (t) => {
  const { PUT } = await confirmationRoute();
  for (const [kind, result] of [
    ["daily_quota_exceeded", { kind: "daily_quota_exceeded", retryAfterSeconds: 42 }],
    ["per_record_cap_exceeded", { kind: "per_record_cap_exceeded", retryAfterSeconds: 43 }],
  ]) {
    await t.test(kind, async () => {
      stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
      stub("setConfirmation", async () => result);
      const response = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
      assert.equal(response.status, 429);
      assert.equal((await responseBody(response)).error, "Too many verifications. Try again later.");
      assert.equal(response.headers.get("retry-after"), String(result.retryAfterSeconds));
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});

test("PUT respects the confirm rate-limit bucket, independent of the read bucket", async () => {
  env.CONFIRM_RATE_LIMIT_MAX = "1";
  env.CONFIRM_RATE_LIMIT_WINDOW_SECONDS = "60";
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setConfirmation", async () => ({ kind: "ok", count: 1 }));
  const { PUT } = await confirmationRoute();

  const first = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
  assert.equal(first.status, 200, "the first request stays within the bucket");

  const blocked = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.headers.get("cache-control"), "no-store");

  // The confirm bucket is separate from the read bucket: a plain record read
  // still passes even while the toggle is blocked.
  stub("getCommunityRecordById", async () => ({ id: 5, title: "Read still ok" }));
  const { GET: recordGet } = await recordRoute();
  const read = await recordGet(apiRequest("/api/cameras/5"));
  assert.equal(read.status, 200);
});

test("PUT trips the IP-hash burst bucket and the alert never carries the raw IP", async () => {
  env.CONFIRM_IP_BURST_MAX = "2";
  env.CONFIRM_IP_BURST_WINDOW_SECONDS = "60";
  env.ABUSE_ALERT_THRESHOLD = "1";
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setConfirmation", async () => ({ kind: "ok", count: 1 }));
  const { PUT } = await confirmationRoute();

  const captured = [];
  const originalError = console.error;
  console.error = (...args) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    const first = await PUT(
      authedToggle("PUT", "/api/cameras/5/confirmation", { headers: { "cf-connecting-ip": "203.0.113.7" } }),
    );
    assert.equal(first.status, 200);
    const second = await PUT(
      authedToggle("PUT", "/api/cameras/6/confirmation", { headers: { "cf-connecting-ip": "203.0.113.7" } }),
    );
    assert.equal(second.status, 200);
    const third = await PUT(
      authedToggle("PUT", "/api/cameras/7/confirmation", { headers: { "cf-connecting-ip": "203.0.113.7" } }),
    );
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get("retry-after")) > 0);
    // Let the fire-and-forget alert delivery complete.
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    console.error = originalError;
  }

  assert.ok(abuseAlerts.getAbuseAlertState().trackedCallers >= 1, "a surge alert must be recorded");
  const alertLog = captured.join("\n");
  assert.ok(alertLog.includes("callerHash"), "the alert must identify the caller by hash");
  assert.ok(!alertLog.includes("203.0.113.7"), "the alert must never carry the raw IP");
});

test("PUT returns 503 when the database is unavailable", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setConfirmation", async () => {
    throw new Error("Database binding unavailable");
  });
  const { PUT } = await confirmationRoute();
  const response = await PUT(authedToggle("PUT", "/api/cameras/5/confirmation"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database unavailable");
});

// ---------------------------------------------------------------------------
// DELETE — toggle OFF
// ---------------------------------------------------------------------------

test("DELETE removes the verification and returns the decayed count (no-store)", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("removeConfirmation", async () => ({ kind: "ok", count: 2 }));
  const { DELETE } = await confirmationRoute();
  const response = await DELETE(authedToggle("DELETE", "/api/cameras/5/confirmation"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { confirmed: false, count: 2 });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [input] = callArgs("removeConfirmation")[0];
  assert.equal(input.cameraId, 5);
  assert.equal(input.contributorId, 7);
});

test("DELETE answers 404 when no verification exists", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("removeConfirmation", async () => ({ kind: "not_found" }));
  const { DELETE } = await confirmationRoute();
  const response = await DELETE(authedToggle("DELETE", "/api/cameras/5/confirmation"));
  assert.equal(response.status, 404);
  assert.equal((await responseBody(response)).error, "No verification found.");
});

test("DELETE shares the guard order: 401 anonymous, 403 CSRF, 403 cross-origin session", async (t) => {
  const { DELETE } = await confirmationRoute();
  await t.test("anonymous", async () => {
    const response = await DELETE(apiRequest("/api/cameras/5/confirmation", { method: "DELETE" }));
    assert.equal(response.status, 401);
    assert.equal(callArgs("removeConfirmation").length, 0);
  });
  await t.test("missing CSRF", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await DELETE(sessionRequest("/api/cameras/5/confirmation", { method: "DELETE" }));
    assert.equal(response.status, 403);
    assert.equal(callArgs("removeConfirmation").length, 0);
  });
  await t.test("cross-origin with a live session", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await DELETE(
      apiRequest("/api/cameras/5/confirmation", {
        method: "DELETE",
        headers: {
          cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
          "x-csrf-token": "csrf-token-123",
          origin: "https://evil.test",
        },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(callArgs("removeConfirmation").length, 0);
  });
});

// ---------------------------------------------------------------------------
// GET — personal state
// ---------------------------------------------------------------------------

test("GET answers confirmed:false for anonymous callers (no-store)", async () => {
  const { GET } = await confirmationRoute();
  const response = await GET(apiRequest("/api/cameras/5/confirmation"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { confirmed: false });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET returns the caller's personal state from the confirmation row", async (t) => {
  const { GET } = await confirmationRoute();
  await t.test("row exists", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    stub("getConfirmation", async () => ({ id: 1, cameraId: 5, contributorId: 7, createdAt: "2026-08-01T09:00:00.000Z" }));
    const response = await GET(sessionRequest("/api/cameras/5/confirmation"));
    assert.equal(response.status, 200);
    assert.deepEqual(await responseBody(response), { confirmed: true });
    assert.equal(callArgs("getConfirmation")[0][0], 5);
    assert.equal(callArgs("getConfirmation")[0][1], 7);
  });
  await t.test("no row", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    stub("getConfirmation", async () => null);
    const response = await GET(sessionRequest("/api/cameras/5/confirmation"));
    assert.equal(response.status, 200);
    assert.deepEqual(await responseBody(response), { confirmed: false });
  });
});

test("GET answers 404 for a malformed id", async (t) => {
  const { GET } = await confirmationRoute();
  for (const id of ["abc", "0", "-1", "1e3"]) {
    await t.test(id, async () => {
      const response = await GET(apiRequest(`/api/cameras/${id}/confirmation`));
      assert.equal(response.status, 404);
    });
  }
});

test("GET returns 503 when the session lookup fails", async () => {
  stub("findSessionByToken", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await confirmationRoute();
  const response = await GET(sessionRequest("/api/cameras/5/confirmation"));
  assert.equal(response.status, 503);
});

// ---------------------------------------------------------------------------
// PUT/DELETE — write API keys (EPIC api-keys T15)
// ---------------------------------------------------------------------------
// The toggle gates on requireWriteAuth(request, "confirm"), so a machine
// client authenticates with `Authorization: Bearer *** (D4 `confirm`
// scope) instead of a session cookie. The session-only extras (same-origin +
// CSRF, IP-hash burst) are skipped on the key path: a machine client
// holding a secret bearer credential carries no ambient browser authority,
// and its toggle volume is bounded by the additive per-key `key:<id>`
// bucket (D8/T12) — the bucket that covers machine clients. The bearer
// chain (sha256Hex → findApiKeyByHash → touchApiKeyLastUsed) is exercised
// with the db boundary mocked, exactly as in tests/write-gate.test.mjs.

const apiKey = {
  id: 41,
  contributorId: 7,
  name: "ci",
  keyPrefix: "osdb_AbCde",
  keyHash: "hash",
  scopes: JSON.stringify(["submit", "confirm"]),
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
function liveKey({ scopes = ["submit", "confirm"], emailVerifiedAt = keyContributor.emailVerifiedAt } = {}) {
  stub("sha256Hex", async (token) => `hash-of-${token}`);
  stub("findApiKeyByHash", async () => ({
    key: { ...apiKey, scopes: JSON.stringify(scopes) },
    contributor: { ...keyContributor, emailVerifiedAt },
  }));
  stub("touchApiKeyLastUsed", async () => true);
}

/** PUT/DELETE /api/cameras/[id]/confirmation authenticating with a Bearer key. */
function bearerToggle(method, pathAndQuery, headers = {}) {
  return apiRequest(pathAndQuery, {
    method,
    headers: { authorization: "Bearer osdb_test-key-123", ...headers },
  });
}

test("PUT with a valid Bearer key (confirm scope) toggles on under the key owner (T15)", async () => {
  liveKey();
  stub("setConfirmation", async () => ({ kind: "ok", count: 4 }));
  const { PUT } = await confirmationRoute();
  const response = await PUT(bearerToggle("PUT", "/api/cameras/5/confirmation"));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { confirmed: true, count: 4 });
  assert.equal(callArgs("setConfirmation")[0][0].contributorId, 7, "attribution is the key owner, never anonymous");
  assert.equal(callArgs("findSessionByToken").length, 0, "the session store must never be consulted on the key path");
  assert.equal(callArgs("touchApiKeyLastUsed").length, 1, "a successful key resolution touches last_used (throttled in the db layer)");
});

test("DELETE with a valid Bearer key (confirm scope) toggles off (T15)", async () => {
  liveKey();
  stub("removeConfirmation", async () => ({ kind: "ok", count: 2 }));
  const { DELETE } = await confirmationRoute();
  const response = await DELETE(bearerToggle("DELETE", "/api/cameras/5/confirmation"));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { confirmed: false, count: 2 });
  assert.equal(callArgs("removeConfirmation")[0][0].contributorId, 7);
  assert.equal(callArgs("findSessionByToken").length, 0);
});

test("key path skips same-origin, CSRF AND the IP-hash burst bucket (T15 conditional guards)", async () => {
  // The CSRF/same-origin check is conditional on authMethod === "session"
  // and checkConfirmIpBurst runs on the session branch ONLY: a machine
  // client holding a secret bearer credential carries no ambient browser
  // authority, and its toggle volume is bounded by the per-key bucket. So a
  // key-authenticated request must sail through a cross-site Origin, a
  // missing X-CSRF-Token, and a burst max of 1 even on its second call from
  // the same caller — none of the session-branch 403/429s may surface.
  liveKey();
  stub("setConfirmation", async () => ({ kind: "ok", count: 1 }));
  env.CONFIRM_IP_BURST_MAX = "1";
  env.CONFIRM_IP_BURST_WINDOW_SECONDS = "60";
  const { PUT } = await confirmationRoute();

  const first = await PUT(
    bearerToggle("PUT", "/api/cameras/5/confirmation", {
      origin: "https://evil.example",
      referer: "https://evil.example/phish",
    }),
  );
  assert.equal(first.status, 200, "the first key request passes the burst max of 1");
  const second = await PUT(bearerToggle("PUT", "/api/cameras/6/confirmation"));
  assert.equal(second.status, 200, "the second key request from the same caller must NOT trip the burst bucket");
  assert.equal(callArgs("setConfirmation").length, 2);
  assert.equal(
    abuseAlerts.getAbuseAlertState().trackedCallers,
    0,
    "no surge alert: the burst bucket is never consulted on the key path",
  );
});

test("PUT rejects a key without the confirm scope (403 canonical, no write)", async () => {
  liveKey({ scopes: ["submit", "action"] });
  stub("setConfirmation", async () => ({ kind: "ok", count: 1 }));
  const { PUT } = await confirmationRoute();
  const response = await PUT(bearerToggle("PUT", "/api/cameras/5/confirmation"));

  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("setConfirmation").length, 0, "no write on scope mismatch");
});

test("PUT rejects an invalid/revoked/expired key (401 canonical, no session fallback)", async () => {
  // findApiKeyByHash -> null collapses unknown/revoked/expired (D6/D9): the
  // route must answer the uniform 401 even when a verified session cookie is
  // ALSO present — fail-closed, never a silent downgrade to the session.
  stub("sha256Hex", async () => "hash");
  stub("findApiKeyByHash", async () => null);
  stub("setConfirmation", async () => ({ kind: "ok", count: 1 }));
  const { PUT } = await confirmationRoute();
  const response = await PUT(
    bearerToggle("PUT", "/api/cameras/5/confirmation", {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
    }),
  );

  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(callArgs("findSessionByToken").length, 0, "fail-closed: a dead key must never fall through to the session");
  assert.equal(callArgs("setConfirmation").length, 0);
});

test("key-authenticated requests are double-counted against their key:<id> bucket (D8/T15)", async () => {
  // The additive per-key check runs AFTER the gate on top of the per-IP
  // check: a key caller must pass BOTH buckets. Each request rotates its
  // cf-connecting-ip so the per-IP bucket never trips; once the key's own
  // budget (CONFIRM_RATE_LIMIT_MAX=1) is spent the next request answers 429
  // with Retry-After even though the per-IP bucket still has room.
  liveKey();
  stub("setConfirmation", async () => ({ kind: "ok", count: 1 }));
  env.CONFIRM_RATE_LIMIT_MAX = "1";
  env.CONFIRM_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { PUT } = await confirmationRoute();

  const first = await PUT(
    bearerToggle("PUT", "/api/cameras/5/confirmation", { "cf-connecting-ip": "203.0.113.10" }),
  );
  assert.equal(first.status, 200, "first request passes both buckets");
  assert.equal(callArgs("setConfirmation").length, 1);

  const second = await PUT(
    bearerToggle("PUT", "/api/cameras/6/confirmation", { "cf-connecting-ip": "203.0.113.11" }),
  );
  assert.equal(second.status, 429, "the key's own budget is spent -> 429 despite a fresh IP");
  assert.ok(Number(second.headers.get("retry-after")) > 0, "Retry-After is present");
  assert.equal((await responseBody(second)).error, "Too many requests. Please try again shortly.");
  assert.equal(callArgs("setConfirmation").length, 1, "no write on the blocked request");
});

test("session requests consume ONLY the per-IP bucket (no per-key double-count, D8)", async () => {
  // Session/anonymous callers have no additive per-key bucket: the pre-gate
  // per-IP check is the whole story. With the confirm per-IP budget set to 1
  // per caller, a session caller rotating IPs passes every request — a
  // (wrong) shared per-key bucket would have blocked the second one.
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("setConfirmation", async () => ({ kind: "ok", count: 1 }));
  env.CONFIRM_RATE_LIMIT_MAX = "1";
  env.CONFIRM_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { PUT } = await confirmationRoute();

  const first = await PUT(
    authedToggle("PUT", "/api/cameras/5/confirmation", { headers: { "cf-connecting-ip": "203.0.113.20" } }),
  );
  assert.equal(first.status, 200);
  const second = await PUT(
    authedToggle("PUT", "/api/cameras/6/confirmation", { headers: { "cf-connecting-ip": "203.0.113.21" } }),
  );
  assert.equal(second.status, 200, "a session caller on a fresh IP is never double-counted against a per-key bucket");
});
