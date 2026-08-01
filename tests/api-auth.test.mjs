// Runtime API tests for the contributor-auth routes (STATUS gap #1, ADR 0013):
//   - POST /api/auth/register     create account + open session (2 cookies)
//   - POST /api/auth/login        verify credentials + open session
//   - POST /api/auth/logout       revoke session + clear cookies (CSRF-gated)
//   - GET  /api/auth/me           current profile or 401
//   - GET  /api/auth/me/submissions  the contributor's own attributed reports
//   - DELETE /api/auth/account    erasure with de-attribution (CSRF-gated, R7)
//   - POST /api/cameras           optional attribution + CSRF when logged in
//
// db/auth is mocked (see tests/helpers/mocks/auth.mjs); pure validation
// helpers run for real. The real database boundary is covered separately by
// tests/auth-d1.test.mjs against an in-memory D1.

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

const registerRoute = () => loadRoute("app/api/auth/register/route.mjs");
const loginRoute = () => loadRoute("app/api/auth/login/route.mjs");
const logoutRoute = () => loadRoute("app/api/auth/logout/route.mjs");
const meRoute = () => loadRoute("app/api/auth/me/route.mjs");
const submissionsRoute = () => loadRoute("app/api/auth/me/submissions/route.mjs");
const accountRoute = () => loadRoute("app/api/auth/account/route.mjs");
const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");

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

const newSession = {
  rawToken: "raw-session-token-abc123",
  csrfToken: "csrf-token-123",
  session,
};

function cookieNames(response) {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split("=")[0]);
}

function findCookie(response, name) {
  const cookie = response.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`));
  return cookie ?? null;
}

function sessionRequest(pathAndQuery, rawToken, { headers = {}, ...rest } = {}) {
  return apiRequest(pathAndQuery, {
    ...rest,
    headers: {
      ...(rawToken ? { cookie: `osdb_session=${rawToken}; osdb_csrf=csrf-token-123` } : {}),
      ...headers,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

test("register creates a contributor, opens a session, and sets both cookies", async () => {
  stub("createContributor", async () => contributor);
  stub("createSession", async () => newSession);
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "  Ada@Example.ORG ", password: "supersecret123", displayName: "  Ada  " },
    }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.deepEqual(body.contributor, contributor);

  // The db layer received the normalised email and trimmed display name.
  const [createArgs] = callArgs("createContributor");
  assert.deepEqual(createArgs, [{ email: "ada@example.org", displayName: "Ada", password: "supersecret123" }]);
  const [sessionArgs] = callArgs("createSession");
  assert.deepEqual(sessionArgs, [7]);

  // Cookie pair: HttpOnly session cookie + script-readable CSRF cookie.
  assert.deepEqual(cookieNames(response).sort(), ["osdb_csrf", "osdb_session"]);
  const sessionCookie = findCookie(response, "osdb_session");
  assert.match(sessionCookie, /osdb_session=raw-session-token-abc123/);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Strict/);
  assert.match(sessionCookie, /Path=\//);
  assert.match(sessionCookie, /Max-Age=2592000/);
  assert.doesNotMatch(sessionCookie, /Secure/);
  const csrfCookie = findCookie(response, "osdb_csrf");
  assert.match(csrfCookie, /osdb_csrf=csrf-token-123/);
  assert.doesNotMatch(csrfCookie, /HttpOnly/);
  assert.match(csrfCookie, /SameSite=Strict/);
});

test("register answers 409 via the unique index, never pre-checking email existence", async () => {
  // Anti-enumeration contract: no fast-path SELECT on the email. The 409
  // comes only from the unique-index constraint on insert, so an existing
  // email costs the same PBKDF2 hashing as a new one (no timing oracle).
  stub("createContributor", async () => {
    throw new Error("UNIQUE constraint failed: contributors.email");
  });
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "ada@example.org", password: "supersecret123" },
    }),
  );
  assert.equal(response.status, 409);
  assert.equal(callArgs("findContributorByEmail").length, 0, "no pre-check query");
});

test("register maps a unique-index race to 409 with the generic, non-distinct body", async () => {
  stub("createContributor", async () => {
    throw new Error("UNIQUE constraint failed: contributors.email");
  });
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "ada@example.org", password: "supersecret123" },
    }),
  );
  assert.equal(response.status, 409);
  // Body must be identical to the 400 validation body so responses do not
  // reveal whether the email is already registered.
  assert.equal((await responseBody(response)).error, "Unable to register with this email.");
});

test("register rejects invalid payloads with 400 and never touches the db", async (t) => {
  const { POST } = await registerRoute();
  const cases = [
    { name: "non-object body", body: "null" },
    { name: "missing email", body: { password: "supersecret123" } },
    { name: "malformed email", body: { email: "not-an-email", password: "supersecret123" } },
    { name: "email too long", body: { email: `${"a".repeat(250)}@example.org`, password: "supersecret123" } },
    { name: "short password", body: { email: "ada@example.org", password: "short" } },
    { name: "numeric password", body: { email: "ada@example.org", password: 1234567890 } },
    { name: "password too long", body: { email: "ada@example.org", password: "p".repeat(201) } },
    { name: "display name too short", body: { email: "ada@example.org", password: "supersecret123", displayName: "A" } },
    { name: "display name too long", body: { email: "ada@example.org", password: "supersecret123", displayName: "n".repeat(61) } },
    { name: "display name not a string", body: { email: "ada@example.org", password: "supersecret123", displayName: 42 } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await POST(apiRequest("/api/auth/register", { method: "POST", body }));
      assert.equal(response.status, 400, name);
      // 400 body identical to the 409 body: a caller cannot tell "invalid
      // input" apart from "email already registered".
      assert.equal((await responseBody(response)).error, "Unable to register with this email.", name);
      assert.equal(callArgs("findContributorByEmail").length + callArgs("createContributor").length, 0, name);
    });
  }
});

test("register rejects cross-origin requests", async () => {
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: { email: "ada@example.org", password: "supersecret123" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("createContributor").length, 0);
});

test("register respects the auth rate-limit bucket", async () => {
  const { POST } = await registerRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(
      apiRequest("/api/auth/register", {
        method: "POST",
        body: { email: "ada@example.org", password: "supersecret123" },
      }),
    );
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed`);
  }
  const blocked = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "ada@example.org", password: "supersecret123" },
    }),
  );
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("register returns 500 when the database is unavailable", async () => {
  stub("createContributor", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "ada@example.org", password: "supersecret123" },
    }),
  );
  assert.equal(response.status, 500);
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

test("login authenticates, opens a session, and sets both cookies", async () => {
  stub("authenticateContributor", async () => contributor);
  stub("createSession", async () => newSession);
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "Ada@Example.ORG", password: "supersecret123" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.contributor, contributor);
  assert.deepEqual(callArgs("authenticateContributor")[0], ["ada@example.org", "supersecret123"]);
  assert.deepEqual(cookieNames(response).sort(), ["osdb_csrf", "osdb_session"]);
});

test("login answers the same generic 401 for unknown email and wrong password", async (t) => {
  const { POST } = await loginRoute();
  const cases = [
    { name: "unknown email", impl: async () => null },
    { name: "wrong password", impl: async () => null },
  ];
  for (const { name, impl } of cases) {
    await t.test(name, async () => {
      stub("authenticateContributor", impl);
      const response = await POST(
        apiRequest("/api/auth/login", {
          method: "POST",
          body: { email: "ada@example.org", password: "wrong-password-123" },
        }),
      );
      assert.equal(response.status, 401);
      assert.equal((await responseBody(response)).error, "Invalid credentials.");
      assert.equal(callArgs("createSession").length, 0);
    });
  }
});

test("login rejects malformed credentials with 401 (not 400) to avoid probing", async (t) => {
  const { POST } = await loginRoute();
  const cases = [
    { name: "missing password", body: { email: "ada@example.org" } },
    { name: "malformed email", body: { email: "nope", password: "supersecret123" } },
    { name: "short password", body: { email: "ada@example.org", password: "short" } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await POST(apiRequest("/api/auth/login", { method: "POST", body }));
      assert.equal(response.status, 401, name);
      assert.equal(callArgs("authenticateContributor").length, 0, name);
    });
  }
});

test("login rejects cross-origin requests", async () => {
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: { email: "ada@example.org", password: "supersecret123" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("authenticateContributor").length, 0);
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

test("logout revokes the session and clears both cookies", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("revokeSession", async () => true);
  const { POST } = await logoutRoute();
  const response = await POST(
    sessionRequest("/api/auth/logout", "raw-session-token-abc123", {
      method: "POST",
      headers: { "x-csrf-token": "csrf-token-123" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("revokeSession")[0], ["raw-session-token-abc123"]);
  const cookies = response.headers.getSetCookie();
  assert.match(cookies.join(" "), /osdb_session=;/);
  assert.match(cookies.join(" "), /osdb_csrf=;/);
  assert.match(cookies.join(" "), /Max-Age=0/);
});

test("logout without a session is idempotent and clears cookies anyway", async () => {
  const { POST } = await logoutRoute();
  const response = await POST(apiRequest("/api/auth/logout", { method: "POST" }));
  assert.equal(response.status, 200);
  assert.equal(callArgs("revokeSession").length, 0);
  assert.match(response.headers.getSetCookie().join(" "), /Max-Age=0/);
});

test("logout with a live session but a wrong CSRF token is rejected", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { POST } = await logoutRoute();
  const response = await POST(
    sessionRequest("/api/auth/logout", "raw-session-token-abc123", {
      method: "POST",
      headers: { "x-csrf-token": "wrong-token" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("revokeSession").length, 0);
});

test("logout with a live session but a missing CSRF token is rejected", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { POST } = await logoutRoute();
  const response = await POST(
    sessionRequest("/api/auth/logout", "raw-session-token-abc123", { method: "POST" }),
  );
  assert.equal(response.status, 403);
});

// ---------------------------------------------------------------------------
// GET /api/auth/me + GET /api/auth/me/submissions
// ---------------------------------------------------------------------------

test("me returns the profile for a live session", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { GET } = await meRoute();
  const response = await GET(sessionRequest("/api/auth/me", "raw-session-token-abc123"));
  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)).contributor, contributor);
});

test("me returns 401 without a session", async () => {
  const { GET } = await meRoute();
  const response = await GET(apiRequest("/api/auth/me"));
  assert.equal(response.status, 401);
  assert.equal(callArgs("findSessionByToken").length, 0, "no cookie must not touch the database");
});

test("me returns 401 for an unknown or expired session token", async () => {
  stub("findSessionByToken", async () => null);
  const { GET } = await meRoute();
  const response = await GET(sessionRequest("/api/auth/me", "dead-token"));
  assert.equal(response.status, 401);
});

test("me returns 503 when the session lookup fails", async () => {
  stub("findSessionByToken", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await meRoute();
  const response = await GET(sessionRequest("/api/auth/me", "raw-session-token-abc123"));
  assert.equal(response.status, 503);
});

test("me/submissions lists only the contributor's attributed reports", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const submissions = [
    { id: 11, title: "Station camera", status: "pending", createdAt: "2026-08-01T09:00:00.000Z" },
    { id: 9, title: "Market square", status: "verified", createdAt: "2026-07-30T09:00:00.000Z" },
  ];
  stub("listContributorSubmissions", async () => submissions);
  const { GET } = await submissionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/submissions", "raw-session-token-abc123"));
  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)).submissions, submissions);
  assert.deepEqual(callArgs("listContributorSubmissions")[0], [7]);
});

test("me/submissions returns 401 without a session", async () => {
  const { GET } = await submissionsRoute();
  const response = await GET(apiRequest("/api/auth/me/submissions"));
  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/account — account erasure (RETENTION_SCHEDULE R7)
// ---------------------------------------------------------------------------

test("account erasure deletes the account, de-attributes reports, and clears cookies", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("eraseContributor", async () => ({ deleted: true, deattributedReports: 3 }));
  const { DELETE } = await accountRoute();
  const response = await DELETE(
    sessionRequest("/api/auth/account", "raw-session-token-abc123", {
      method: "DELETE",
      headers: { "x-csrf-token": "csrf-token-123" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { ok: true, deattributedReports: 3 });
  assert.deepEqual(callArgs("eraseContributor")[0], [7]);
  const cookies = response.headers.getSetCookie();
  assert.match(cookies.join(" "), /osdb_session=;/);
  assert.match(cookies.join(" "), /osdb_csrf=;/);
  assert.match(cookies.join(" "), /Max-Age=0/);
});

test("account erasure returns 401 without a session and never touches the db", async () => {
  const { DELETE } = await accountRoute();
  const response = await DELETE(apiRequest("/api/auth/account", { method: "DELETE" }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("eraseContributor").length, 0);
});

test("account erasure returns 401 for an unknown or expired session token", async () => {
  stub("findSessionByToken", async () => null);
  const { DELETE } = await accountRoute();
  const response = await DELETE(
    sessionRequest("/api/auth/account", "dead-token", { method: "DELETE" }),
  );
  assert.equal(response.status, 401);
});

test("account erasure with a live session but a wrong CSRF token is rejected", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { DELETE } = await accountRoute();
  const response = await DELETE(
    sessionRequest("/api/auth/account", "raw-session-token-abc123", {
      method: "DELETE",
      headers: { "x-csrf-token": "wrong-token" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("eraseContributor").length, 0);
});

test("account erasure with a live session but a missing CSRF token is rejected", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { DELETE } = await accountRoute();
  const response = await DELETE(
    sessionRequest("/api/auth/account", "raw-session-token-abc123", { method: "DELETE" }),
  );
  assert.equal(response.status, 403);
});

test("account erasure rejects cross-origin requests", async () => {
  const { DELETE } = await accountRoute();
  const response = await DELETE(
    apiRequest("/api/auth/account", {
      method: "DELETE",
      headers: { origin: "https://evil.example" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("eraseContributor").length, 0);
});

test("account erasure respects the auth rate-limit bucket", async () => {
  stub("findSessionByToken", async () => null);
  const { DELETE } = await accountRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await DELETE(
      sessionRequest("/api/auth/account", `token-${index}`, { method: "DELETE" }),
    );
    assert.notEqual(response.status, 429, `request ${index + 1} must stay allowed`);
  }
  const blocked = await DELETE(
    sessionRequest("/api/auth/account", "token-blocked", { method: "DELETE" }),
  );
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("account erasure returns 500 when the database is unavailable", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("eraseContributor", async () => {
    throw new Error("Database binding unavailable");
  });
  const { DELETE } = await accountRoute();
  const response = await DELETE(
    sessionRequest("/api/auth/account", "raw-session-token-abc123", {
      method: "DELETE",
      headers: { "x-csrf-token": "csrf-token-123" },
    }),
  );
  assert.equal(response.status, 500);
});

// ---------------------------------------------------------------------------
// POST /api/cameras — optional attribution and CSRF when logged in
// ---------------------------------------------------------------------------

const cameraFixture = {
  id: 5,
  title: "Corner camera",
  kind: "Dome",
  manufacturer: null,
  observedOn: null,
  publishManufacturer: 0,
  publishObservedOn: 0,
  address: null,
  notes: "",
  latitude: 44.83,
  longitude: 11.62,
  status: "pending",
  source: "Community report",
  updated: "Submitted just now",
  description: "",
  createdAt: "2026-08-01T09:00:00.000Z",
};

const validCameraBody = {
  title: "Corner camera",
  kind: "Dome",
  latitude: 44.83,
  longitude: 11.62,
};

test("anonymous camera submissions stay possible and are not attributed", async () => {
  stub("createPendingCamera", async () => cameraFixture);
  const { POST } = await camerasRoute();
  const response = await POST(apiRequest("/api/cameras", { method: "POST", body: validCameraBody }));
  assert.equal(response.status, 201);
  assert.deepEqual(callArgs("createPendingCamera")[0][0].contributorId, null);
});

test("authenticated camera submissions carry the contributor id", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("createPendingCamera", async () => cameraFixture);
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionRequest("/api/cameras", "raw-session-token-abc123", {
      method: "POST",
      headers: { "x-csrf-token": "csrf-token-123" },
      body: validCameraBody,
    }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(callArgs("createPendingCamera")[0][0].contributorId, 7);
});

test("authenticated camera submissions without a valid CSRF token are rejected", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionRequest("/api/cameras", "raw-session-token-abc123", {
      method: "POST",
      body: validCameraBody,
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("createPendingCamera").length, 0);
});

test("a dead session cookie falls back to the anonymous submission path", async () => {
  stub("findSessionByToken", async () => null);
  stub("createPendingCamera", async () => cameraFixture);
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionRequest("/api/cameras", "dead-token", { method: "POST", body: validCameraBody }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(callArgs("createPendingCamera")[0][0].contributorId, null);
});
