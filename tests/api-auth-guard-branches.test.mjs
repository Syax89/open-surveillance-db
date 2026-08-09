// Guard-branch tests for the NEW multi-method auth routes (QA review P1-1,
// t_720ead0c): the 414/429/503/no-store branches that had ZERO direct
// coverage on:
//   - GET/DELETE /api/auth/passkey/credentials (77.22%)
//   - POST /api/auth/recovery                      (79.45%)
//   - POST /api/auth/passkey/login/complete        (80.91%)
//   - POST /api/auth/logout                        (82.50%)
//   - POST /api/auth/reset-password/request        (82-83%)
//   - POST /api/auth/reset-password/confirm        (82-83%)
//
// Contract under test (mirrors api-auth-me-patch.test.mjs guard order):
//   urlTooLong (414) -> sameOrigin (403) -> auth rate-limit (429 with
//   Retry-After) -> ... -> db unavailable (500/503 per route, no crash).
//
// The db/auth and db/passkeys modules are mocked exactly like the rest of
// api-auth.test.mjs / api-passkey.test.mjs; pure helpers (urlTooLong,
// csrf sameOrigin, authLimit + the real rate-limit module) run for real.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  apiRequest,
  cleanupRouteTree,
  loadLibModule,
  loadRoute,
  responseBody,
} from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  rateLimit.resetRateLimitState();
});

after(async () => cleanupRouteTree());

const credentialsRoute = () => loadRoute("app/api/auth/passkey/credentials/route.mjs");
const recoveryRoute = () => loadRoute("app/api/auth/recovery/route.mjs");
const loginCompleteRoute = () => loadRoute("app/api/auth/passkey/login/complete/route.mjs");
const logoutRoute = () => loadRoute("app/api/auth/logout/route.mjs");
const resetRequestRoute = () => loadRoute("app/api/auth/reset-password/request/route.mjs");
const resetConfirmRoute = () => loadRoute("app/api/auth/reset-password/confirm/route.mjs");

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

function stubSession() {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
}

function authedRequest(pathAndQuery, { headers = {}, ...rest } = {}) {
  return apiRequest(pathAndQuery, {
    ...rest,
    headers: {
      cookie: "osdb_session=raw-token; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...headers,
    },
  });
}

// A URL over the 4096-char guard. Combined with an evil Origin so the test
// proves urlTooLong runs BEFORE sameOrigin (414 wins over 403).
function absurdUrl(path) {
  return `${path}?${"x".repeat(4200)}`;
}

function evilOrigin(headers = {}) {
  return { origin: "https://evil.example", ...headers };
}

// ---------------------------------------------------------------------------
// 1. 414: URL > 4096 answers 414 on EVERY route, BEFORE the sameOrigin guard.
// ---------------------------------------------------------------------------

test("414 guard: credentials GET answers 414 for an absurd URL before sameOrigin", async () => {
  const { GET } = await credentialsRoute();
  const response = await GET(apiRequest(absurdUrl("/api/auth/passkey/credentials"), { headers: evilOrigin() }));
  assert.equal(response.status, 414);
  assert.equal((await responseBody(response)).error, "Request URI too long.");
});

test("414 guard: credentials DELETE answers 414 for an absurd URL before sameOrigin", async () => {
  const { DELETE } = await credentialsRoute();
  const response = await DELETE(
    apiRequest(absurdUrl("/api/auth/passkey/credentials"), {
      method: "DELETE",
      headers: evilOrigin(),
      body: { credentialId: "cred-1" },
    }),
  );
  assert.equal(response.status, 414);
});

test("414 guard: recovery answers 414 for an absurd URL before sameOrigin", async () => {
  const { POST } = await recoveryRoute();
  const response = await POST(
    apiRequest(absurdUrl("/api/auth/recovery"), {
      method: "POST",
      headers: evilOrigin(),
      body: { email: "contributor@example.org", code: "abcd-efgh-ijkl-mnop" },
    }),
  );
  assert.equal(response.status, 414);
  assert.equal(callArgs("consumeRecoveryCode").length, 0, "414 must short-circuit before any db work");
});

test("414 guard: passkey login/complete answers 414 for an absurd URL before sameOrigin", async () => {
  const { POST } = await loginCompleteRoute();
  const response = await POST(
    apiRequest(absurdUrl("/api/auth/passkey/login/complete"), {
      method: "POST",
      headers: evilOrigin(),
      body: { challenge: "c1", response: { id: "cred-1" } },
    }),
  );
  assert.equal(response.status, 414);
  assert.equal(callArgs("consumeWebAuthnChallenge").length, 0, "414 must short-circuit before the challenge consume");
});

test("414 guard: logout answers 414 for an absurd URL before sameOrigin", async () => {
  const { POST } = await logoutRoute();
  const response = await POST(
    apiRequest(absurdUrl("/api/auth/logout"), { method: "POST", headers: evilOrigin() }),
  );
  assert.equal(response.status, 414);
});

test("414 guard: reset-password/request answers 414 for an absurd URL", async () => {
  const { POST } = await resetRequestRoute();
  const response = await POST(
    apiRequest(absurdUrl("/api/auth/reset-password/request"), {
      method: "POST",
      headers: evilOrigin(),
      body: { email: "contributor@example.org" },
    }),
  );
  assert.equal(response.status, 414);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("414 guard: reset-password/confirm answers 414 for an absurd URL", async () => {
  const { POST } = await resetConfirmRoute();
  const response = await POST(
    apiRequest(absurdUrl("/api/auth/reset-password/confirm"), {
      method: "POST",
      headers: evilOrigin(),
      body: { token: "x".repeat(24), password: "Sup3rsecret!123" },
    }),
  );
  assert.equal(response.status, 414);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

// ---------------------------------------------------------------------------
// 2. 429: the shared auth bucket (10/min) trips with Retry-After, before any
//    session/db work. One test per route.
// ---------------------------------------------------------------------------

test("429 bucket: credentials GET trips the auth bucket with Retry-After", async () => {
  const { GET } = await credentialsRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await GET(apiRequest("/api/auth/passkey/credentials"));
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (401 without session)`);
  }
  const blocked = await GET(apiRequest("/api/auth/passkey/credentials"));
  assert.equal(blocked.status, 429);
  assert.equal((await responseBody(blocked)).error, "Too many requests. Please try again shortly.");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("429 bucket: credentials DELETE trips the auth bucket with Retry-After", async () => {
  const { DELETE } = await credentialsRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await DELETE(apiRequest("/api/auth/passkey/credentials", { method: "DELETE", body: { credentialId: "cred-1" } }));
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (401 without session)`);
  }
  const blocked = await DELETE(apiRequest("/api/auth/passkey/credentials", { method: "DELETE", body: { credentialId: "cred-1" } }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("429 bucket: recovery trips the auth bucket with Retry-After", async () => {
  stub("findContributorByEmail", async () => contributor);
  stub("consumeRecoveryCode", async () => false);
  const { POST } = await recoveryRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(
      apiRequest("/api/auth/recovery", { method: "POST", body: { email: "contributor@example.org", code: "abcd-efgh-ijkl-mnop" } }),
    );
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (401 for bad code)`);
  }
  const blocked = await POST(
    apiRequest("/api/auth/recovery", { method: "POST", body: { email: "contributor@example.org", code: "abcd-efgh-ijkl-mnop" } }),
  );
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("429 bucket: passkey login/complete trips the auth bucket with Retry-After", async () => {
  stub("consumeWebAuthnChallenge", async () => null);
  const { POST } = await loginCompleteRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(
      apiRequest("/api/auth/passkey/login/complete", { method: "POST", body: { challenge: "c1", response: { id: "cred-1" } } }),
    );
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (401 for bad assertion)`);
  }
  const blocked = await POST(
    apiRequest("/api/auth/passkey/login/complete", { method: "POST", body: { challenge: "c1", response: { id: "cred-1" } } }),
  );
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("429 bucket: logout trips the auth bucket with Retry-After", async () => {
  const { POST } = await logoutRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(apiRequest("/api/auth/logout", { method: "POST" }));
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (200 idempotent)`);
  }
  const blocked = await POST(apiRequest("/api/auth/logout", { method: "POST" }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("429 bucket: reset-password/request trips the auth bucket with Retry-After", async () => {
  stub("findContributorByEmail", async () => null);
  const { POST } = await resetRequestRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(
      apiRequest("/api/auth/reset-password/request", { method: "POST", body: { email: "nobody@example.org" } }),
    );
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (200 sent:true)`);
  }
  const blocked = await POST(
    apiRequest("/api/auth/reset-password/request", { method: "POST", body: { email: "nobody@example.org" } }),
  );
  assert.equal(blocked.status, 429);
  assert.equal((await responseBody(blocked)).error, "Too many requests. Please try again shortly.");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("429 bucket: reset-password/confirm trips the auth bucket with Retry-After", async () => {
  stub("consumeVerificationToken", async () => ({ kind: "invalid" }));
  const { POST } = await resetConfirmRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(
      apiRequest("/api/auth/reset-password/confirm", { method: "POST", body: { token: "x".repeat(24), password: "Sup3rsecret!123" } }),
    );
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (400 for bad token)`);
  }
  const blocked = await POST(
    apiRequest("/api/auth/reset-password/confirm", { method: "POST", body: { token: "x".repeat(24), password: "Sup3rsecret!123" } }),
  );
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

// ---------------------------------------------------------------------------
// 3. sameOrigin: cross-origin answers 403 before any session/db work.
// ---------------------------------------------------------------------------

test("403 guard: credentials GET rejects cross-origin before the session read", async () => {
  stubSession();
  const { GET } = await credentialsRoute();
  const response = await GET(
    apiRequest("/api/auth/passkey/credentials", {
      headers: { cookie: "osdb_session=raw-token", origin: "https://evil.example" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Cross-origin request rejected.");
  assert.equal(callArgs("findSessionByToken").length, 0, "sameOrigin must short-circuit before the session read");
});

test("403 guard: recovery rejects cross-origin before any db work", async () => {
  stub("findContributorByEmail", async () => contributor);
  const { POST } = await recoveryRoute();
  const response = await POST(
    apiRequest("/api/auth/recovery", {
      method: "POST",
      headers: evilOrigin(),
      body: { email: "contributor@example.org", code: "abcd-efgh-ijkl-mnop" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("findContributorByEmail").length, 0);
});

test("403 guard: logout rejects cross-origin before revoking anything", async () => {
  stubSession();
  const { POST } = await logoutRoute();
  const response = await POST(
    apiRequest("/api/auth/logout", { method: "POST", headers: { cookie: "osdb_session=raw-token", origin: "https://evil.example" } }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("revokeSession").length, 0);
});

// ---------------------------------------------------------------------------
// 4. db unavailable -> 500 (credentials/recovery/login-complete/logout) or
//    503 (reset request/confirm): the handler catches, never crashes.
// ---------------------------------------------------------------------------

test("500: credentials GET returns 500 when the db is unavailable", async () => {
  stubSession();
  stub("listPasskeys", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await credentialsRoute();
  const response = await GET(apiRequest("/api/auth/passkey/credentials", { headers: { cookie: "osdb_session=raw-token" } }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to list passkeys");
});

test("500: credentials DELETE returns 500 when the db is unavailable", async () => {
  stubSession();
  stub("deletePasskey", async () => {
    throw new Error("Database binding unavailable");
  });
  const { DELETE } = await credentialsRoute();
  const response = await DELETE(authedRequest("/api/auth/passkey/credentials", { method: "DELETE", body: { credentialId: "cred-1" } }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to remove passkey");
});

test("500: recovery returns 500 when the db is unavailable", async () => {
  stub("findContributorByEmail", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await recoveryRoute();
  const response = await POST(
    apiRequest("/api/auth/recovery", { method: "POST", body: { email: "contributor@example.org", code: "abcd-efgh-ijkl-mnop" } }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to redeem recovery code");
});

test("500: passkey login/complete returns 500 when the db is unavailable", async () => {
  stub("consumeWebAuthnChallenge", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await loginCompleteRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: "c1", response: { id: "cred-1" } },
    }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to log in with passkey");
});

test("500: logout returns 500 when revoking the session fails", async () => {
  stubSession();
  stub("revokeSession", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await logoutRoute();
  const response = await POST(
    apiRequest("/api/auth/logout", { method: "POST", headers: { cookie: "osdb_session=raw-token", "x-csrf-token": "csrf-token-123", origin: "https://osdb.test" } }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to log out");
});

test("503: reset-password/request returns 503 (no-store) when the db is unavailable", async () => {
  stub("findContributorByEmail", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await resetRequestRoute();
  const response = await POST(
    apiRequest("/api/auth/reset-password/request", { method: "POST", body: { email: "contributor@example.org" } }),
  );
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Unable to request a password reset");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("503: reset-password/confirm returns 503 (no-store) when the db is unavailable", async () => {
  stub("consumeVerificationToken", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await resetConfirmRoute();
  const response = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "valid-token-0123456789abcdef", password: "Sup3rsecret!123" },
    }),
  );
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Unable to reset the password");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
