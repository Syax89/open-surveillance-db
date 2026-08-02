// Runtime API tests for PATCH /api/auth/me — profile displayName update
// (QA review P1-1: the route had ZERO direct API tests; module coverage was
// the lowest in the codebase, 54.72%).
//
// Contract under test (guard order, from the route docblock):
//   urlTooLong (414) -> sameOrigin (403) -> auth rate-limit (429) ->
//   session (401) -> CSRF (403) -> body validation (400) -> db -> 200.
//
// The payload is a single-field whitelist: only `displayName` is accepted
// (2..60 chars after trim, or null/empty to clear). Any other key answers
// 400 with no partial effects. Every branch carries Cache-Control: no-store
// (personal data). The response is the refreshed public profile.
//
// db/auth is mocked (tests/helpers/mocks/auth.mjs) exactly like the rest of
// api-auth.test.mjs; pure helpers (parseDisplayName, csrf, rate-limit) run
// for real. The db boundary (updateContributorDisplayName) is covered for
// real in tests/auth-d1.test.mjs.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  rateLimit.resetRateLimitState();
});

after(async () => cleanupRouteTree());

const meRoute = () => loadRoute("app/api/auth/me/route.mjs");

const contributor = {
  id: 7,
  email: "ada@example.org",
  displayName: "Ada",
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

function liveSession() {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
}

function authedPatch(pathAndQuery, body, { headers = {} } = {}) {
  return apiRequest(pathAndQuery, {
    method: "PATCH",
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...headers,
    },
    body,
  });
}

// ---------------------------------------------------------------------------
// 1. Happy path: single-key whitelist + CSRF ok -> 200, refreshed profile,
//    no-store, displayName trimmed before the db call.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me updates the display name and returns the refreshed profile", async () => {
  liveSession();
  const updated = { ...contributor, displayName: "New Name", updatedAt: "2026-08-02T09:00:00.000Z" };
  stub("updateContributorDisplayName", async () => updated);
  const { PATCH } = await meRoute();

  const response = await PATCH(authedPatch("/api/auth/me", { displayName: "  New Name  " }));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { contributor: updated });
  assert.equal(response.headers.get("cache-control"), "no-store");
  // The db layer receives the trimmed value (registration grammar).
  assert.deepEqual(callArgs("updateContributorDisplayName")[0], [7, "New Name"]);
});

// ---------------------------------------------------------------------------
// 2. Whitelist: any key other than displayName answers 400 with NO partial
//    effect — the db layer is never reached.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me rejects extra keys with 400 and no partial effect", async () => {
  liveSession();
  const { PATCH } = await meRoute();

  const response = await PATCH(authedPatch("/api/auth/me", { displayName: "X", role: "admin" }));
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, 'Only the "displayName" field can be updated.');
  assert.equal(callArgs("updateContributorDisplayName").length, 0, "no db write for a whitelist violation");
});

test("PATCH /api/auth/me rejects a payload with only a non-displayName key", async () => {
  liveSession();
  const { PATCH } = await meRoute();

  const response = await PATCH(authedPatch("/api/auth/me", { role: "admin" }));
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, 'Only the "displayName" field can be updated.');
  assert.equal(callArgs("updateContributorDisplayName").length, 0);
});

test("PATCH /api/auth/me rejects an empty payload object", async () => {
  liveSession();
  const { PATCH } = await meRoute();

  const response = await PATCH(authedPatch("/api/auth/me", {}));
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, 'Only the "displayName" field can be updated.');
  assert.equal(callArgs("updateContributorDisplayName").length, 0);
});

// ---------------------------------------------------------------------------
// 3. Body shape: non-object / array / malformed JSON -> 400, no db write.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me rejects non-object and array bodies with 400", async (t) => {
  const { PATCH } = await meRoute();
  for (const [name, body] of [["null", "null"], ["array", ["displayName"]], ["number", "42"]]) {
    await t.test(name, async () => {
      liveSession();
      const response = await PATCH(authedPatch("/api/auth/me", body));
      assert.equal(response.status, 400);
      assert.equal((await responseBody(response)).error, "A JSON object with the displayName field is required.");
      assert.equal(callArgs("updateContributorDisplayName").length, 0);
    });
  }
});

test("PATCH /api/auth/me maps syntactically invalid JSON to 400 (not 500)", async () => {
  liveSession();
  const { PATCH } = await meRoute();
  const response = await PATCH(authedPatch("/api/auth/me", '{"displayName": "New", broken'));
  assert.equal(response.status, 400);
  // The body is read through the shared readJsonBody contract (PR #124 /
  // #221): malformed JSON answers the transport-level message BEFORE the
  // handler's own shape validation, exactly like every other JSON route.
  assert.equal((await responseBody(response)).error, "Request body is not valid JSON.");
  assert.equal(callArgs("updateContributorDisplayName").length, 0);
});

// ---------------------------------------------------------------------------
// 4. Guard order: session (401) before CSRF (403); CSRF before body
//    validation; sameOrigin before session; urlTooLong before everything.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me without a session answers 401 even with a body that would 400", async () => {
  const { PATCH } = await meRoute();
  const response = await PATCH(
    apiRequest("/api/auth/me", { method: "PATCH", body: { role: "admin" } }),
  );
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Not authenticated.");
  assert.equal(callArgs("findSessionByToken").length, 0, "no cookie must not touch the database");
});

test("PATCH /api/auth/me with a dead session answers 401", async () => {
  stub("findSessionByToken", async () => null);
  const { PATCH } = await meRoute();
  const response = await PATCH(authedPatch("/api/auth/me", { displayName: "New Name" }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("updateContributorDisplayName").length, 0);
});

test("PATCH /api/auth/me with a wrong CSRF token answers 403 before body validation", async () => {
  liveSession();
  const { PATCH } = await meRoute();
  // An otherwise-invalid body must NOT answer 400: CSRF is checked first.
  const response = await PATCH(
    authedPatch("/api/auth/me", { role: "admin" }, { headers: { "x-csrf-token": "wrong-token" } }),
  );
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Invalid CSRF token. Refresh the page and try again.");
  assert.equal(callArgs("updateContributorDisplayName").length, 0);
});

test("PATCH /api/auth/me with a missing CSRF token answers 403", async () => {
  liveSession();
  const { PATCH } = await meRoute();
  const response = await PATCH(
    apiRequest("/api/auth/me", {
      method: "PATCH",
      headers: { cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123" },
      body: { displayName: "New Name" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("updateContributorDisplayName").length, 0);
});

test("PATCH /api/auth/me rejects cross-origin requests before any session work", async () => {
  // sameOrigin runs BEFORE the session lookup: an evil Origin answers 403
  // even with a valid cookie pair on the wire.
  liveSession();
  const { PATCH } = await meRoute();
  const response = await PATCH(
    authedPatch("/api/auth/me", { displayName: "New Name" }, { headers: { origin: "https://evil.example" } }),
  );
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Cross-origin request rejected.");
  assert.equal(callArgs("findSessionByToken").length, 0, "cross-origin must short-circuit before the session read");
  assert.equal(callArgs("updateContributorDisplayName").length, 0);
});

test("PATCH /api/auth/me answers 414 for an absurdly long URL before any other guard", async () => {
  // urlTooLong is the FIRST guard: even a cross-origin request with a
  // > 4096-char URL answers 414, never 403.
  const { PATCH } = await meRoute();
  const longQuery = `/api/auth/me?${"x".repeat(4200)}`;
  const response = await PATCH(
    apiRequest(longQuery, {
      method: "PATCH",
      headers: { origin: "https://evil.example" },
      body: { displayName: "New Name" },
    }),
  );
  assert.equal(response.status, 414);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

// ---------------------------------------------------------------------------
// 5. Rate limit: the shared `auth` bucket (10/min) trips before the session.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me respects the auth rate-limit bucket", async () => {
  const { PATCH } = await meRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await PATCH(
      apiRequest("/api/auth/me", { method: "PATCH", body: { displayName: "New Name" } }),
    );
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed (401 without session)`);
  }
  const blocked = await PATCH(
    apiRequest("/api/auth/me", { method: "PATCH", body: { displayName: "New Name" } }),
  );
  assert.equal(blocked.status, 429);
  assert.equal((await responseBody(blocked)).error, "Too many requests. Please try again shortly.");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

// ---------------------------------------------------------------------------
// 6. displayName grammar: 2..60 chars after trim, must be a string.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me rejects out-of-range and non-string display names with 400", async (t) => {
  const { PATCH } = await meRoute();
  for (const [name, value] of [
    ["1 char", "A"],
    ["61 chars", "n".repeat(61)],
    ["non-string", 42],
    ["whitespace only", "   "],
  ]) {
    await t.test(name, async () => {
      liveSession();
      const response = await PATCH(authedPatch("/api/auth/me", { displayName: value }));
      assert.equal(response.status, 400);
      assert.equal((await responseBody(response)).error, "The display name must be between 2 and 60 characters.");
      assert.equal(callArgs("updateContributorDisplayName").length, 0);
    });
  }
});

test("PATCH /api/auth/me clears the display name with null or empty string", async (t) => {
  const cleared = { ...contributor, displayName: null, updatedAt: "2026-08-02T09:00:00.000Z" };
  const { PATCH } = await meRoute();
  for (const value of [null, ""]) {
    await t.test(String(value), async () => {
      liveSession();
      stub("updateContributorDisplayName", async () => cleared);
      const response = await PATCH(authedPatch("/api/auth/me", { displayName: value }));
      assert.equal(response.status, 200);
      assert.deepEqual((await responseBody(response)).contributor.displayName, null);
      assert.deepEqual(callArgs("updateContributorDisplayName")[0], [7, null]);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. db boundary: updateContributorDisplayName returning null (account
//    erased between session read and write) -> 401.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me maps a vanished contributor to 401", async () => {
  liveSession();
  stub("updateContributorDisplayName", async () => null);
  const { PATCH } = await meRoute();
  const response = await PATCH(authedPatch("/api/auth/me", { displayName: "New Name" }));
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Not authenticated.");
});

// ---------------------------------------------------------------------------
// 8. db unavailable -> 503, no-store, no crash.
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me returns 503 when the database is unavailable", async () => {
  liveSession();
  stub("updateContributorDisplayName", async () => {
    throw new Error("Database binding unavailable");
  });
  const { PATCH } = await meRoute();
  const response = await PATCH(authedPatch("/api/auth/me", { displayName: "New Name" }));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Unable to update the profile");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

// ---------------------------------------------------------------------------
// no-store contract: every PATCH branch carries Cache-Control: no-store
// (personal data must never be edge-cached).
// ---------------------------------------------------------------------------

test("PATCH /api/auth/me answers no-store on every guard branch", async (t) => {
  const { PATCH } = await meRoute();
  const cases = [
    ["401 no session", apiRequest("/api/auth/me", { method: "PATCH", body: { displayName: "X" } }), 401, null],
    ["400 whitelist", authedPatch("/api/auth/me", { role: "admin" }), 400, "live"],
  ];
  for (const [name, request, status, session] of cases) {
    await t.test(name, async () => {
      if (session === "live") liveSession();
      const response = await PATCH(request);
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});
