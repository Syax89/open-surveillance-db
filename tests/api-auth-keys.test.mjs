// Runtime API tests for POST /api/auth/keys — mint a private write API key
// (EPIC api-keys, T7, plan §1.3/§5.3, decisions D2/D4/D5/D6/D13).
//
// Contract under test (guard order, from the route docblock / spec §1.3):
//   urlTooLong (414) -> authLimit (429 with Retry-After) -> malformed-cookie
//   (400) -> requireVerifiedContributor (401 anon / 403 unverified, canonical
//   body) -> sameOrigin + csrfVerified (403) -> body validation (400) ->
//   cap count (409) -> createApiKey -> 201 { id, name, key, keyPrefix,
//   scopes, createdAt, expiresAt } + Cache-Control: no-store.
//
// The raw `key` must appear in EXACTLY this response (reveal-once, D2/P1-2):
// never in error bodies, never stored (the db layer keeps only the SHA-256 —
// covered for real in tests/db-api-keys-crud.test.mjs), and the response
// must be uncacheable.
//
// db/api-keys is mocked (tests/helpers/mocks/api-keys.mjs); pure helpers
// (csrf, authLimit + the real rate-limit module, the scope whitelist, the
// D5 env-knob default) run for real. The db boundary (createApiKey,
// countApiKeysForContributor) is covered for real in
// tests/db-api-keys-crud.test.mjs.

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

const keysRoute = () => loadRoute("app/api/auth/keys/route.mjs");

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

function liveSession({ verified = true } = {}) {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({
    id,
    emailVerifiedAt: verified ? "2026-08-01T00:00:00.000Z" : null,
    authProvider: "password",
  }));
}

function authedPost(body, { headers = {}, ...rest } = {}) {
  return apiRequest("/api/auth/keys", {
    method: "POST",
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...headers,
    },
    body,
    ...rest,
  });
}

function absurdUrl(path) {
  return `${path}?${"x".repeat(4200)}`;
}

function evilOrigin(headers = {}) {
  return { origin: "https://evil.example", ...headers };
}

const SCOPES_ALL = ["submit", "confirm", "edit", "action"];

// A createApiKey stub result: the raw key + a row whose scopes column is the
// JSON text the db layer stores (parsed back to an array in the response).
function stubMint({ name = "CI deploy", scopes = SCOPES_ALL, expiresAt = "2027-08-01T00:00:00.000Z" } = {}) {
  const rawKey = "tok-testrawkey0123456789abcdefghij";
  const key = {
    id: 42,
    contributorId: 7,
    // The real createApiKey trims the name at the db boundary, so the row
    // echoes the trimmed value; mirror that here.
    name: name.trim(),
    keyPrefix: rawKey.slice(0, 10),
    keyHash: "a".repeat(64),
    scopes: JSON.stringify(scopes),
    createdAt: "2026-08-01T00:00:00.000Z",
    lastUsedAt: null,
    expiresAt,
    revokedAt: null,
  };
  stub("createApiKey", async () => ({ rawKey, key }));
  return { rawKey, key };
}

// ---------------------------------------------------------------------------
// 1. Guard order: 414 (urlTooLong) and 429 (authLimit) win over everything.
// ---------------------------------------------------------------------------

test("414: POST /api/auth/keys answers 414 for an absurd URL before any auth work", async () => {
  liveSession();
  const { POST } = await keysRoute();
  const response = await POST(
    apiRequest(absurdUrl("/api/auth/keys"), {
      method: "POST",
      headers: evilOrigin({ cookie: "osdb_session=raw-session-token-abc123" }),
      body: { name: "x" },
    }),
  );
  assert.equal(response.status, 414);
  assert.equal((await responseBody(response)).error, "Request URI too long.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createApiKey").length, 0);
});

test("429: the auth bucket trips with Retry-After before the session read", async () => {
  const { POST } = await keysRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(apiRequest("/api/auth/keys", { method: "POST", body: { name: "x" } }));
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (401 without session)`);
  }
  const blocked = await POST(apiRequest("/api/auth/keys", { method: "POST", body: { name: "x" } }));
  assert.equal(blocked.status, 429);
  assert.equal((await responseBody(blocked)).error, "Too many requests. Please try again shortly.");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(callArgs("createApiKey").length, 0, "rate limit short-circuits before the mint");
});

test("429 wins over the malformed-cookie 400: authLimit runs first (spec guard order)", async () => {
  const { POST } = await keysRoute();
  // Every request carries a present-but-undecodable session cookie: without
  // the rate limit it would answer 400 (malformed), so the 429 on the 11th
  // proves authLimit is evaluated BEFORE the malformed-cookie guard.
  const malformedCookie = { cookie: "osdb_session=%E0%A4%A" };
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(
      apiRequest("/api/auth/keys", { method: "POST", headers: malformedCookie, body: { name: "x" } }),
    );
    assert.equal(response.status, 400, `request ${index + 1} must stay allowed (malformed cookie 400)`);
  }
  const blocked = await POST(
    apiRequest("/api/auth/keys", { method: "POST", headers: malformedCookie, body: { name: "x" } }),
  );
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

// ---------------------------------------------------------------------------
// 2. Malformed session cookie: clean 400 (QA F1) before the write gate.
// ---------------------------------------------------------------------------

test("400: a present-but-undecodable session cookie answers the clean malformed message", async () => {
  liveSession();
  const { POST } = await keysRoute();
  const response = await POST(
    apiRequest("/api/auth/keys", {
      method: "POST",
      headers: { cookie: "osdb_session=%E0%A4%A" },
      body: { name: "x" },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(
    (await responseBody(response)).error,
    "Malformed session cookie. Clear cookies and log in again.",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createApiKey").length, 0);
});

// ---------------------------------------------------------------------------
// 3. Write gate: 401 anonymous / 403 unverified, single canonical body.
// ---------------------------------------------------------------------------

test("401: anonymous mint answers the canonical write-gate body (no-store)", async () => {
  const { POST } = await keysRoute();
  const response = await POST(apiRequest("/api/auth/keys", { method: "POST", body: { name: "x" } }));
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createApiKey").length, 0);
});

test("403: an unverified contributor cannot mint (same canonical body)", async () => {
  liveSession({ verified: false });
  const { POST } = await keysRoute();
  const response = await POST(authedPost({ name: "x" }));
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createApiKey").length, 0);
});

// ---------------------------------------------------------------------------
// 4. sameOrigin + csrfVerified come AFTER the gate (spec guard order).
// ---------------------------------------------------------------------------

test("403: cross-origin is rejected after the gate resolves, before any db work", async () => {
  liveSession();
  const { POST } = await keysRoute();
  const response = await POST(authedPost({ name: "x" }, { headers: evilOrigin() }));
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Cross-origin request rejected.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  // The session WAS resolved (gate runs before sameOrigin) but the mint is
  // never reached — the state change is refused before the cap count.
  assert.ok(callArgs("findSessionByToken").length > 0, "gate resolves the session first");
  assert.equal(callArgs("countApiKeysForContributor").length, 0, "no cap count for a refused request");
  assert.equal(callArgs("createApiKey").length, 0);
});

test("403: a wrong CSRF token is rejected (same-origin, bad double-submit)", async () => {
  liveSession();
  const { POST } = await keysRoute();
  const response = await POST(
    authedPost({ name: "x" }, { headers: { "x-csrf-token": "wrong-token" } }),
  );
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Cross-origin request rejected.");
  assert.equal(callArgs("createApiKey").length, 0);
});

// ---------------------------------------------------------------------------
// 5. Body validation: friendly 400s, no db work.
// ---------------------------------------------------------------------------

test("400: non-object bodies are rejected", async (t) => {
  const { POST } = await keysRoute();
  for (const [name, body] of [
    ["null", "null"],
    ["array", ["name"]],
    ["number", "42"],
  ]) {
    await t.test(name, async () => {
      liveSession();
      const response = await POST(authedPost(body));
      assert.equal(response.status, 400);
      assert.equal((await responseBody(response)).error, "Provide a name for the API key.");
      assert.equal(callArgs("createApiKey").length, 0);
    });
  }
});

test("400: a missing, non-string or empty name is rejected", async (t) => {
  const { POST } = await keysRoute();
  const cases = [
    ["missing", {}, "Provide a name for the API key."],
    ["null name", { name: null }, "Provide a name for the API key."],
    ["numeric name", { name: 42 }, "Provide a name for the API key."],
    ["whitespace-only name", { name: "   " }, "The API key name must be between 1 and 60 characters."],
    ["61-char name", { name: "x".repeat(61) }, "The API key name must be between 1 and 60 characters."],
  ];
  for (const [label, body, message] of cases) {
    await t.test(label, async () => {
      liveSession();
      const response = await POST(authedPost(body));
      assert.equal(response.status, 400);
      assert.equal((await responseBody(response)).error, message);
      assert.equal(callArgs("createApiKey").length, 0);
    });
  }
});

test("400: invalid scopes are rejected (whitelist D4, non-empty)", async (t) => {
  const { POST } = await keysRoute();
  const cases = [
    ["empty array", { name: "x", scopes: [] }],
    ["unknown scope", { name: "x", scopes: ["delete"] }],
    ["mixed unknown", { name: "x", scopes: ["submit", "read"] }],
    ["non-array", { name: "x", scopes: "submit" }],
    ["array of numbers", { name: "x", scopes: [1] }],
  ];
  for (const [label, body] of cases) {
    await t.test(label, async () => {
      liveSession();
      const response = await POST(authedPost(body));
      assert.equal(response.status, 400);
      assert.equal(
        (await responseBody(response)).error,
        "Choose at least one scope: submit, confirm, edit, action.",
      );
      assert.equal(callArgs("createApiKey").length, 0);
    });
  }
});

test("400: a non-ISO expiresAt is rejected", async (t) => {
  const { POST } = await keysRoute();
  const cases = [
    ["garbage string", { name: "x", expiresAt: "not-a-date" }],
    ["numeric", { name: "x", expiresAt: 42 }],
    ["boolean", { name: "x", expiresAt: true }],
  ];
  for (const [label, body] of cases) {
    await t.test(label, async () => {
      liveSession();
      const response = await POST(authedPost(body));
      assert.equal(response.status, 400);
      assert.equal((await responseBody(response)).error, "expiresAt must be an ISO-8601 date or null.");
      assert.equal(callArgs("createApiKey").length, 0);
    });
  }
});

test("400: malformed JSON maps to the transport message, not a 500", async () => {
  liveSession();
  const { POST } = await keysRoute();
  const response = await POST(authedPost('{"name": "x", broken'));
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, "Request body is not valid JSON.");
  assert.equal(callArgs("createApiKey").length, 0);
});

test("413: an oversized body is rejected before any db work", async () => {
  liveSession();
  const { POST } = await keysRoute();
  const huge = JSON.stringify({ name: "x".repeat(33 * 1024) });
  const response = await POST(authedPost(huge));
  assert.equal(response.status, 413);
  assert.equal((await responseBody(response)).error, "Request body too large.");
  assert.equal(callArgs("createApiKey").length, 0);
});

// ---------------------------------------------------------------------------
// 6. Cap D5: at the limit the mint answers 409, no key is created.
// ---------------------------------------------------------------------------

test("409: the mint refuses once the contributor is at the cap (5 by default)", async () => {
  liveSession();
  stub("countApiKeysForContributor", async () => 5);
  const { POST } = await keysRoute();
  const response = await POST(authedPost({ name: "sixth" }));
  assert.equal(response.status, 409);
  const body = await responseBody(response);
  assert.equal(body.error, "API key limit reached. Revoke an existing key before creating a new one.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createApiKey").length, 0, "no key is created at the cap");
  // The 409 body carries no key material (P0-2).
  assert.deepEqual(Object.keys(body), ["error"]);
});

test("409: a revoked/expired key frees its slot — the count is over active keys only", async () => {
  liveSession();
  // 5 rows exist but one is revoked/expired -> count 4 < cap -> mint succeeds.
  stub("countApiKeysForContributor", async () => 4);
  stubMint({ name: "slot freed" });
  const { POST } = await keysRoute();
  const response = await POST(authedPost({ name: "slot freed" }));
  assert.equal(response.status, 201);
});

// ---------------------------------------------------------------------------
// 7. Happy path: 201 with the raw key exactly once, no-store, parsed scopes.
// ---------------------------------------------------------------------------

test("201: mints a key, reveals the raw key once and never exposes the hash", async () => {
  liveSession();
  stub("countApiKeysForContributor", async () => 0);
  const { rawKey, key } = stubMint({ name: "  CI deploy  " });
  const { POST } = await keysRoute();

  const response = await POST(authedPost({ name: "  CI deploy  " }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await responseBody(response);
  assert.deepEqual(body, {
    id: key.id,
    name: "CI deploy", // trimmed before the db call
    key: rawKey,
    keyPrefix: key.keyPrefix,
    scopes: SCOPES_ALL, // JSON text parsed back to an array
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
  });
  assert.equal("keyHash" in body, false, "the hash is never exposed (D3)");
  assert.equal("lastUsedAt" in body, false, "metadata-only surface keeps the shape tight");

  // The db layer receives the parsed inputs, including the trimmed name.
  assert.deepEqual(callArgs("createApiKey")[0], [
    { contributorId: 7, name: "CI deploy", scopes: SCOPES_ALL, expiresAt: undefined },
  ]);
  assert.deepEqual(callArgs("countApiKeysForContributor")[0], [7]);
});

test("201: a narrowed scope subset and an explicit expiry are passed through", async () => {
  liveSession();
  stub("countApiKeysForContributor", async () => 0);
  stubMint({ name: "submit only", scopes: ["submit"], expiresAt: "2026-09-01T00:00:00.000Z" });
  const { POST } = await keysRoute();

  const response = await POST(
    authedPost({ name: "submit only", scopes: ["submit"], expiresAt: "2026-09-01T00:00:00.000Z" }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.deepEqual(body.scopes, ["submit"]);
  assert.equal(body.expiresAt, "2026-09-01T00:00:00.000Z");
  assert.deepEqual(callArgs("createApiKey")[0], [
    { contributorId: 7, name: "submit only", scopes: ["submit"], expiresAt: "2026-09-01T00:00:00.000Z" },
  ]);
});

test("201: an explicit null expiry means never and is passed through", async () => {
  liveSession();
  stub("countApiKeysForContributor", async () => 0);
  stubMint({ name: "never", expiresAt: null });
  const { POST } = await keysRoute();

  const response = await POST(authedPost({ name: "never", expiresAt: null }));
  assert.equal(response.status, 201);
  assert.equal((await responseBody(response)).expiresAt, null);
  assert.deepEqual(callArgs("createApiKey")[0], [
    { contributorId: 7, name: "never", scopes: SCOPES_ALL, expiresAt: null },
  ]);
});

// ---------------------------------------------------------------------------
// 8. db failures -> 500, never a crash, never key material.
// ---------------------------------------------------------------------------

test("500: a failing cap count maps to the generic mint error", async () => {
  liveSession();
  stub("countApiKeysForContributor", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await keysRoute();
  const response = await POST(authedPost({ name: "x" }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to create the API key");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("500: a failing createApiKey maps to the generic mint error", async () => {
  liveSession();
  stub("countApiKeysForContributor", async () => 0);
  stub("createApiKey", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await keysRoute();
  const response = await POST(authedPost({ name: "x" }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to create the API key");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
