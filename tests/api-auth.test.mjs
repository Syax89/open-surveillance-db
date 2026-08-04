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
import { createHash } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;

beforeEach(async () => {
  resetMockState();
  // Per-IP registration cap (P3-4, t_0941036b): the reservation answers
  // count 0 by default so the register contract tests keep exercising the
  // validation / session / mail layers; the cap's own behaviour (4 ok, 5th
  // 429, 24h reset) has a dedicated E2E suite
  // (tests/registration-ip-cap.test.mjs).
  stub("recordRegistrationAttempt", async () => ({ id: 1, count: 0 }));
  stub("deleteRegistrationAttempt", async () => {});
  // The route derives the per-IP registration key before reserving the
  // attempt; registrationIpHash is a pure helper, so run the real
  // implementation (the E2E cap suite asserts the stored key against it).
  // QA#3 F4: with no REGISTRATION_IP_HMAC_KEY in the test env this is the
  // truncated-SHA-256 fallback — never a raw IP.
  stub("registrationIpHash", async (value) => createHash("sha256").update(value).digest("hex").slice(0, 32));
  stub("verifyPasswordDummy", async () => false);
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
// Email verification + password reset (multi-method auth Fase B).
const verifyEmailRoute = () => loadRoute("app/api/auth/verify-email/route.mjs");
const resendRoute = () => loadRoute("app/api/auth/verify-email/resend/route.mjs");
const resetRequestRoute = () => loadRoute("app/api/auth/reset-password/request/route.mjs");
const resetConfirmRoute = () => loadRoute("app/api/auth/reset-password/confirm/route.mjs");

const contributor = {
  id: 7,
  email: "ada@example.org",
  displayName: "Ada",
  // Fase B: a fresh account is unverified — the write gate reads this same
  // column on every write (403 until set), and since t_6dc1c96f the login
  // route refuses sessions while it is null (generic 401).
  emailVerifiedAt: null,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
};

/** The verified variant used by the verify-email / reset fixtures. */
const verifiedContributor = {
  ...contributor,
  emailVerifiedAt: "2026-08-01T08:30:00.000Z",
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

test("register creates a contributor, mints a verification token, opens a session, and sets both cookies", async () => {
  stub("createContributor", async () => contributor);
  stub("createVerificationToken", async () => ({ rawToken: "verify-token-abc", expiresAt: "2026-08-02T08:00:00.000Z" }));
  stub("createSession", async () => newSession);
  // The canonical mailer (db/mailer.ts sendAuthEmail) is invoked with the
  // minted token; the provider accepts, so sent:true.
  stub("sendAuthEmail", async () => ({ ok: true, messageId: "m1" }));
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "  Ada@Example.ORG ", password: "Sup3rsecret!123", displayName: "  Ada  " },
    }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.deepEqual(body.contributor, contributor);

  // The db layer received the normalised email and trimmed display name.
  const [createArgs] = callArgs("createContributor");
  assert.deepEqual(createArgs, [{ email: "ada@example.org", displayName: "Ada", password: "Sup3rsecret!123" }]);
  // Fase B: a verification token is minted for the new account (purpose
  // 'verify') so the emailed link can prove mailbox control.
  const [tokenArgs] = callArgs("createVerificationToken");
  assert.equal(tokenArgs[0], contributor.id);
  assert.equal(tokenArgs[1], "verify");
  assert.ok(typeof tokenArgs[2] === "string" && tokenArgs[2].length > 0, "token created_at is an ISO timestamp");
  // The canonical mailer receives the minted token for THIS contributor.
  const [mailArgs] = callArgs("sendAuthEmail");
  assert.deepEqual(mailArgs[0].contributorId, contributor.id);
  assert.equal(mailArgs[0].to, "ada@example.org");
  assert.equal(mailArgs[0].kind, "verify");
  assert.equal(mailArgs[0].rawToken, "verify-token-abc");
  assert.ok(typeof mailArgs[0].nowIso === "string" && mailArgs[0].nowIso.length > 0, "nowIso is an ISO timestamp");
  // The DB TTL follows the same env knob as the cookie (sessionTtlSeconds):
  // default 30 days = 2592000 s, so expires_at and Max-Age can never diverge
  // (audit t_5ca60ab2, P2).
  const [sessionArgs] = callArgs("createSession");
  assert.deepEqual(sessionArgs, [7, { ttlSeconds: 2592000 }]);

  // The provider accepted the email: sent:true. The raw token is NEVER in
  // the response — it lives only in the mail channel (fail-closed, no
  // devLink echo, P1-1). The response still marks the session read-only:
  // the contributor's emailVerifiedAt is NULL (the fixture above) and the
  // write gate (Fase E1) enforces it.
  assert.deepEqual(body.verification, { sent: true });
  assert.ok(!("devLink" in body.verification), "no raw token in the API response");

  // Cookie pair: HttpOnly session cookie + script-readable CSRF cookie.
  assert.deepEqual(cookieNames(response).sort(), ["osdb_csrf", "osdb_session"]);
  const sessionCookie = findCookie(response, "osdb_session");
  assert.match(sessionCookie, /osdb_session=raw-session-token-abc123/);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Strict/);
  assert.match(sessionCookie, /Path=\//);
  assert.match(sessionCookie, /Max-Age=2592000/);
  // QA#3 F2: Secure is the DEFAULT (fail-closed). The test env has no
  // AUTH_COOKIE_SECURE and no ENVIRONMENT=development, so the cookie must
  // carry Secure — the old fail-open default (Secure only when the operator
  // remembered the var) is gone. The explicit non-Secure dev override is
  // covered by its own test below.
  assert.match(sessionCookie, /Secure/);
  const csrfCookie = findCookie(response, "osdb_csrf");
  assert.match(csrfCookie, /osdb_csrf=csrf-token-123/);
  assert.doesNotMatch(csrfCookie, /HttpOnly/);
  assert.match(csrfCookie, /SameSite=Strict/);
});

// ---------------------------------------------------------------------------
// Cookie Secure policy (QA#3 F2, t_63e0d13c) — secure-by-default
// ---------------------------------------------------------------------------

/**
 * Build a register POST against an env override and return the session cookie.
 * The mock env object is shared (cloudflare-workers.mjs); we mutate the knob,
 * run, and restore it so sibling tests see the original state.
 */
async function sessionCookieWithEnv(envModule, envChanges) {
  const previous = {};
  for (const [key, value] of Object.entries(envChanges)) {
    previous[key] = envModule.env[key];
    envModule.env[key] = value;
  }
  try {
    resetMockState();
    stub("recordRegistrationAttempt", async () => ({ id: 1, count: 0 }));
    stub("deleteRegistrationAttempt", async () => {});
    stub("registrationIpHash", async (value) => createHash("sha256").update(value).digest("hex").slice(0, 32));
    stub("createContributor", async () => contributor);
    stub("createVerificationToken", async () => ({ rawToken: "verify-token-abc", expiresAt: "2026-08-02T08:00:00.000Z" }));
    stub("createSession", async () => newSession);
    stub("sendAuthEmail", async () => ({ ok: true, messageId: "m1" }));
    const { POST } = await registerRoute();
    const response = await POST(
      apiRequest("/api/auth/register", {
        method: "POST",
        body: { email: "ada@example.org", password: "Sup3rsecret!123", displayName: "Ada" },
      }),
    );
    return findCookie(response, "osdb_session");
  } finally {
    for (const [key] of Object.entries(envChanges)) {
      if (previous[key] === undefined) delete envModule.env[key];
      else envModule.env[key] = previous[key];
    }
  }
}

test("cookie Secure is the fail-closed default (no AUTH_COOKIE_SECURE, no ENVIRONMENT)", async () => {
  // Already covered by the register test above (Secure matched with a bare
  // env); this test pins the policy table explicitly via cookieSecure().
  const { cookieSecure } = await loadLibModule("auth-session");
  assert.equal(cookieSecure({}), true, "unset env → Secure (fail-closed)");
  assert.equal(cookieSecure({ AUTH_COOKIE_SECURE: "true" }), true, "explicit true → Secure");
  assert.equal(cookieSecure({ AUTH_COOKIE_SECURE: "false" }), false, "explicit false → non-Secure (local HTTP prototype)");
  assert.equal(cookieSecure({ ENVIRONMENT: "development" }), false, "development env → non-Secure (plain-HTTP LAN prototype)");
  assert.equal(cookieSecure({ ENVIRONMENT: "production" }), true, "production env → Secure even without the var");
  assert.equal(cookieSecure({ ENVIRONMENT: "staging" }), true, "any non-development env → Secure");
});

test("AUTH_COOKIE_SECURE=false (local prototype on plain HTTP) drops Secure from the cookie", async () => {
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const sessionCookie = await sessionCookieWithEnv(envModule, { AUTH_COOKIE_SECURE: "false" });
  assert.match(sessionCookie, /osdb_session=raw-session-token-abc123/);
  assert.doesNotMatch(sessionCookie, /Secure/, "explicit false override must drop Secure on the LAN prototype");
  assert.match(sessionCookie, /SameSite=Strict/, "SameSite stays Strict on every path");
});

test("ENVIRONMENT=development alone also drops Secure (plain-HTTP prototype default)", async () => {
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const sessionCookie = await sessionCookieWithEnv(envModule, { ENVIRONMENT: "development" });
  assert.doesNotMatch(sessionCookie, /Secure/);
});

test("register reports sent:false when the mailer cannot deliver (provider error) — and never echoes the token", async () => {
  stub("createContributor", async () => contributor);
  stub("createVerificationToken", async () => ({ rawToken: "verify-token-abc", expiresAt: "2026-08-02T08:00:00.000Z" }));
  stub("createSession", async () => newSession);
  // Mail must never break registration: a provider rejection still answers
  // 201, but sent:false — the user can re-send from the session.
  stub("sendAuthEmail", async () => ({
    ok: false,
    reason: "provider",
    code: "E_SENDER_NOT_VERIFIED",
    message: "sender domain not verified",
  }));
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "ada@example.org", password: "Sup3rsecret!123", displayName: "Ada" },
    }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.deepEqual(body.verification, { sent: false });
  assert.equal(JSON.stringify(body).includes("verify-token-abc"), false, "the raw token never leaves the mail channel");
});

test("register propagates AUTH_SESSION_TTL_DAYS to BOTH the DB session and the cookie Max-Age (no TTL divergence)", async () => {
  // Audit t_5ca60ab2, P2: the DB expires_at and the cookie Max-Age must
  // derive from the same sessionTtlSeconds(env). With the knob at 7 days the
  // db layer receives ttlSeconds 604800 and the cookie carries Max-Age=604800.
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.AUTH_SESSION_TTL_DAYS;
  envModule.env.AUTH_SESSION_TTL_DAYS = "7";
  try {
    stub("createContributor", async () => contributor);
    stub("createVerificationToken", async () => ({ rawToken: "verify-token-abc", expiresAt: "2026-08-02T08:00:00.000Z" }));
    stub("createSession", async () => newSession);
    stub("sendAuthEmail", async () => ({ ok: true, messageId: "m1" }));
    const { POST } = await registerRoute();
    const response = await POST(
      apiRequest("/api/auth/register", {
        method: "POST",
        body: { email: "ada@example.org", password: "Sup3rsecret!123", displayName: "Ada" },
      }),
    );
    assert.equal(response.status, 201);
    assert.deepEqual(callArgs("createSession")[0], [7, { ttlSeconds: 604800 }]);
    const sessionCookie = findCookie(response, "osdb_session");
    assert.match(sessionCookie, /Max-Age=604800/, "cookie Max-Age matches the DB TTL");
  } finally {
    envModule.env.AUTH_SESSION_TTL_DAYS = previous;
  }
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
      body: { email: "ada@example.org", password: "Sup3rsecret!123" },
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
      body: { email: "ada@example.org", password: "Sup3rsecret!123" },
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
    { name: "missing email", body: { password: "Sup3rsecret!123" } },
    { name: "malformed email", body: { email: "not-an-email", password: "Sup3rsecret!123" } },
    { name: "email too long", body: { email: `${"a".repeat(250)}@example.org`, password: "Sup3rsecret!123" } },
    { name: "short password", body: { email: "ada@example.org", password: "short" } },
    // Composition policy (CEO feedback 2026-08-03): each fixture is 10+ chars
    // and satisfies all classes but one, so exactly one rule fails.
    { name: "password no uppercase", body: { email: "ada@example.org", password: "lowercase1!" } },
    { name: "password no lowercase", body: { email: "ada@example.org", password: "UPPERCASE1!" } },
    { name: "password no digit", body: { email: "ada@example.org", password: "Uppercase!" } },
    { name: "password no special", body: { email: "ada@example.org", password: "Uppercase123" } },
    { name: "numeric password", body: { email: "ada@example.org", password: 1234567890 } },
    { name: "password too long", body: { email: "ada@example.org", password: "p".repeat(201) } },
    { name: "display name too short", body: { email: "ada@example.org", password: "Sup3rsecret!123", displayName: "A" } },
    { name: "display name too long", body: { email: "ada@example.org", password: "Sup3rsecret!123", displayName: "n".repeat(61) } },
    { name: "display name not a string", body: { email: "ada@example.org", password: "Sup3rsecret!123", displayName: 42 } },
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
      body: { email: "ada@example.org", password: "Sup3rsecret!123" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("createContributor").length, 0);
});

test("register maps a syntactically invalid JSON body to 400 (not 500)", async () => {
  const { POST } = await registerRoute();
  const response = await POST(
    apiRequest("/api/auth/register", { method: "POST", body: '{"email": "ada@example.org", broken' }),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, "Request body is not valid JSON.");
  assert.equal(
    callArgs("findContributorByEmail").length + callArgs("createContributor").length,
    0,
    "no auth db call for malformed JSON",
  );
});

test("register respects the auth rate-limit bucket", async () => {
  stub("createContributor", async () => contributor);
  stub("createVerificationToken", async () => ({ rawToken: "verify-token-abc", expiresAt: "2026-08-02T08:00:00.000Z" }));
  stub("createSession", async () => newSession);
  stub("sendAuthEmail", async () => ({ ok: true, messageId: "m1" }));
  const { POST } = await registerRoute();
  for (let index = 0; index < 10; index += 1) {
    const response = await POST(
      apiRequest("/api/auth/register", {
        method: "POST",
        body: { email: "ada@example.org", password: "Sup3rsecret!123" },
      }),
    );
    assert.equal(response.status, 201, `request ${index + 1} must stay allowed`);
  }
  const blocked = await POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      body: { email: "ada@example.org", password: "Sup3rsecret!123" },
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
      body: { email: "ada@example.org", password: "Sup3rsecret!123" },
    }),
  );
  assert.equal(response.status, 500);
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

test("login authenticates, opens a session, and sets both cookies", async () => {
  stub("loginLockoutKey", async (email) => `lockout:${email}`);
  stub("getLoginLockout", async () => ({ locked: false, retryAfterSeconds: 0 }));
  // Verified account: since t_6dc1c96f the login route only opens a session
  // when email_verified_at is set (CEO feedback 2026-08-03, option (a)).
  stub("authenticateContributor", async () => verifiedContributor);
  stub("clearLoginAttempts", async () => {});
  stub("createSession", async () => newSession);
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "Ada@Example.ORG", password: "Sup3rsecret!123" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.contributor, verifiedContributor);
  assert.deepEqual(callArgs("authenticateContributor")[0], ["ada@example.org", "Sup3rsecret!123"]);
  assert.deepEqual(callArgs("loginLockoutKey")[0], ["ada@example.org"], "the key derives from the normalised email");
  assert.deepEqual(callArgs("clearLoginAttempts")[0], ["lockout:ada@example.org"], "a successful login clears the per-email counter");
  assert.deepEqual(cookieNames(response).sort(), ["osdb_csrf", "osdb_session"]);
});

test("login refuses a correct password on an UNVERIFIED account with the same generic 401 (no session, no counter change)", async () => {
  // CEO feedback 2026-08-03 (t_6dc1c96f, option (a)): "finché non è
  // attivato non è possibile fare login". A correct password on an account
  // whose email is not yet verified must NOT open a session.
  stub("loginLockoutKey", async (email) => `lockout:${email}`);
  stub("getLoginLockout", async () => ({ locked: false, retryAfterSeconds: 0 }));
  stub("authenticateContributor", async () => contributor); // fixture: emailVerifiedAt null
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "ada@example.org", password: "supersecret123" },
    }),
  );
  assert.equal(response.status, 401);
  // Identical body to unknown email / wrong password — the response never
  // reveals the account exists (anti-enumeration, the login route rule).
  assert.equal((await responseBody(response)).error, "Invalid credentials.");
  assert.equal(callArgs("createSession").length, 0, "no session for an unverified account");
  assert.equal(callArgs("clearLoginAttempts").length, 0, "the counter is not cleared (the login did not succeed)");
  assert.equal(callArgs("recordFailedLogin").length, 0, "a correct password is not a failed attempt — no lockout DoS for the owner");
  assert.equal(response.headers.getSetCookie().length, 0, "no cookies are set");
});

test("login answers the same generic 401 for unknown email and wrong password", async (t) => {
  const { POST } = await loginRoute();
  const cases = [
    { name: "unknown email", impl: async () => null },
    { name: "wrong password", impl: async () => null },
  ];
  for (const { name, impl } of cases) {
    await t.test(name, async () => {
      stub("loginLockoutKey", async (email) => `lockout:${email}`);
      stub("getLoginLockout", async () => ({ locked: false, retryAfterSeconds: 0 }));
      stub("authenticateContributor", impl);
      stub("recordFailedLogin", async () => ({ locked: false, retryAfterSeconds: 0 }));
      const response = await POST(
        apiRequest("/api/auth/login", {
          method: "POST",
          body: { email: "ada@example.org", password: "wrong-password-123" },
        }),
      );
      assert.equal(response.status, 401);
      assert.equal((await responseBody(response)).error, "Invalid credentials.");
      assert.equal(callArgs("createSession").length, 0);
      assert.deepEqual(callArgs("recordFailedLogin")[0][0], "lockout:ada@example.org", "the failure is recorded under the email key");
    });
  }
});

test("login records the failed attempt under the email-derived hash key — never the address", async () => {
  stub("loginLockoutKey", async (email) => `sha256:${email}`);
  stub("getLoginLockout", async () => ({ locked: false, retryAfterSeconds: 0 }));
  stub("authenticateContributor", async () => null);
  stub("recordFailedLogin", async () => ({ locked: false, retryAfterSeconds: 0 }));
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "Ada@Example.ORG", password: "wrong-password-123" },
    }),
  );
  assert.equal(response.status, 401);
  const [key, policy] = callArgs("recordFailedLogin")[0];
  assert.equal(key, "sha256:ada@example.org");
  assert.equal(policy.maxAttempts, 5, "the default policy applies when no env knobs are set");
  assert.equal(policy.windowSeconds, 900);
});

test("login answers 429 with Retry-After while the account is locked, before any auth work", async () => {
  stub("loginLockoutKey", async (email) => `lockout:${email}`);
  stub("getLoginLockout", async () => ({ locked: true, retryAfterSeconds: 42 }));
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "ada@example.org", password: "Sup3rsecret!123" },
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.equal(callArgs("authenticateContributor").length, 0, "no credential work happens while locked");
  assert.equal(callArgs("recordFailedLogin").length, 0, "a blocked attempt is not counted again");
  // QA#3 F1: the locked branch must still pay the constant PBKDF2 cost, so
  // the 429 timing cannot reveal whether the email exists (a locked account
  // vs. a never-seen address must be indistinguishable by response time).
  assert.equal(callArgs("verifyPasswordDummy").length, 1, "the locked path derives the dummy hash");
});

test("login answers 429 when the failed attempt trips the lockout", async () => {
  stub("loginLockoutKey", async (email) => `lockout:${email}`);
  stub("getLoginLockout", async () => ({ locked: false, retryAfterSeconds: 0 }));
  stub("authenticateContributor", async () => null);
  stub("recordFailedLogin", async () => ({ locked: true, retryAfterSeconds: 900 }));
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "ada@example.org", password: "wrong-password-123" },
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "900");
  assert.equal(callArgs("createSession").length, 0);
});

test("failed logins from different client IPs share the same email key", async () => {
  stub("loginLockoutKey", async (email) => `lockout:${email}`);
  stub("getLoginLockout", async () => ({ locked: false, retryAfterSeconds: 0 }));
  stub("authenticateContributor", async () => null);
  stub("recordFailedLogin", async () => ({ locked: false, retryAfterSeconds: 0 }));
  const { POST } = await loginRoute();
  for (const ip of ["10.0.0.1", "10.0.0.2", "10.0.0.3"]) {
    const response = await POST(
      apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "cf-connecting-ip": ip },
        body: { email: "ada@example.org", password: "wrong-password-123" },
      }),
    );
    assert.equal(response.status, 401, `attempt from ${ip} must stay allowed (per-IP bucket) but fail auth`);
  }
  const keys = callArgs("recordFailedLogin").map(([key]) => key);
  assert.deepEqual(keys, ["lockout:ada@example.org", "lockout:ada@example.org", "lockout:ada@example.org"], "every IP counts against the same email key");
});

test("login rejects malformed credentials with 401 (not 400) to avoid probing", async (t) => {
  const { POST } = await loginRoute();
  const cases = [
    { name: "missing password", body: { email: "ada@example.org" } },
    { name: "malformed email", body: { email: "nope", password: "Sup3rsecret!123" } },
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
      body: { email: "ada@example.org", password: "Sup3rsecret!123" },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("authenticateContributor").length, 0);
});

test("login maps a syntactically invalid JSON body to 400 (not 500)", async () => {
  const { POST } = await loginRoute();
  const response = await POST(
    apiRequest("/api/auth/login", { method: "POST", body: '{"email": "ada@example.org", broken' }),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, "Request body is not valid JSON.");
  assert.equal(callArgs("authenticateContributor").length, 0, "no credential check for malformed JSON");
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

test("logout revokes the session and clears both cookies", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  const { POST } = await logoutRoute();
  const response = await POST(
    sessionRequest("/api/auth/logout", "raw-session-token-abc123", { method: "POST" }),
  );
  assert.equal(response.status, 403);
});

// ---------------------------------------------------------------------------
// GET /api/auth/me + GET /api/auth/me/submissions
// ---------------------------------------------------------------------------

test("me returns the profile and the caller's trust level for a live session", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("countVerifiedCameras", async () => 7);
  const { GET } = await meRoute();
  const response = await GET(sessionRequest("/api/auth/me", "raw-session-token-abc123"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.contributor, contributor);
  // C2: level is derived on the fly from the verified count (7 -> L2, next 20).
  assert.deepEqual(body.level, {
    level: 2,
    verifiedCount: 7,
    threshold: 5,
    nextThreshold: 20,
  });
  assert.deepEqual(callArgs("countVerifiedCameras")[0], [7]);
});

test("me returns 401 without a session", async () => {
  const { GET } = await meRoute();
  const response = await GET(apiRequest("/api/auth/me"));
  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("cache-control"),
    "no-store",
    "the anonymous profile is personal-data-shaped too and must never be edge-cached (P3-3)",
  );
  assert.equal(callArgs("findSessionByToken").length, 0, "no cookie must not touch the database");
});

test("me returns 401 for an unknown or expired session token", async () => {
  stub("findSessionByToken", async () => null);
  const { GET } = await meRoute();
  const response = await GET(sessionRequest("/api/auth/me", "dead-token"));
  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("cache-control"),
    "no-store",
    "the anonymous profile is personal-data-shaped too and must never be edge-cached (P3-3)",
  );
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("eraseContributor", async () => ({ deleted: true, deattributedReports: 3, deattributedPhotos: 2 }));
  const { DELETE } = await accountRoute();
  const response = await DELETE(
    sessionRequest("/api/auth/account", "raw-session-token-abc123", {
      method: "DELETE",
      headers: { "x-csrf-token": "csrf-token-123" },
    }),
  );
  assert.equal(response.status, 200);
  // QA#3 F3: the erasure response now also reports the de-attributed photos.
  assert.deepEqual(await responseBody(response), { ok: true, deattributedReports: 3, deattributedPhotos: 2 });
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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

test("anonymous camera submissions are refused by the write gate (401, no-store)", async () => {
  stub("createPendingCamera", async () => cameraFixture);
  const { POST } = await camerasRoute();
  const response = await POST(apiRequest("/api/cameras", { method: "POST", body: validCameraBody }));
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createPendingCamera").length, 0, "the gate must fail before any db write");
});

test("authenticated camera submissions carry the contributor id", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
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

test("a dead session cookie is refused by the write gate (401, no-store, no db write)", async () => {
  stub("findSessionByToken", async () => null);
  stub("createPendingCamera", async () => cameraFixture);
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionRequest("/api/cameras", "dead-token", { method: "POST", body: validCameraBody }),
  );
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createPendingCamera").length, 0, "the gate must fail before any db write");
});

// ---------------------------------------------------------------------------
// GET /api/auth/verify-email (multi-method auth Fase B)
// ---------------------------------------------------------------------------

test("verify-email consumes a live token and flips the account to verified", async () => {
  stub("consumeVerificationToken", async () => ({ kind: "verified", contributorId: 7 }));
  stub("markContributorEmailVerified", async () => verifiedContributor);
  const { GET } = await verifyEmailRoute();
  const response = await GET(apiRequest("/api/auth/verify-email?token=tok-abcdefghijklmnopqrstuvwxyz"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.verified, true);
  assert.deepEqual(body.contributor, verifiedContributor);
  assert.equal(response.headers.get("cache-control"), "no-store");
  // The db layer consumed with the exact purpose 'verify'.
  assert.deepEqual(callArgs("consumeVerificationToken")[0], ["tok-abcdefghijklmnopqrstuvwxyz", "verify"]);
});

test("verify-email answers 400 for malformed or unknown tokens (generic, anti-enumeration)", async () => {
  const { GET } = await verifyEmailRoute();
  // Malformed (too short / illegal characters): rejected before any db call.
  for (const token of ["short", "has spaces!", "tok!en@chars", ""]) {
    const response = await GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(token)}`));
    assert.equal(response.status, 400, token);
    assert.equal((await responseBody(response)).error, "Invalid or expired verification link.", token);
  }
  assert.equal(callArgs("consumeVerificationToken").length, 0, "malformed tokens never touch the db");

  // Unknown hash: the db answers invalid and the route maps it to the SAME
  // generic 400 body — a caller cannot tell a live token from a dead one.
  stub("consumeVerificationToken", async () => ({ kind: "invalid" }));
  const unknown = await GET(apiRequest("/api/auth/verify-email?token=tok-unknown00000000000000000000"));
  assert.equal(unknown.status, 400);
  assert.equal((await responseBody(unknown)).error, "Invalid or expired verification link.");
});

test("verify-email answers 410 Gone for used and expired tokens", async () => {
  const { GET } = await verifyEmailRoute();
  stub("consumeVerificationToken", async () => ({ kind: "used" }));
  const used = await GET(apiRequest("/api/auth/verify-email?token=tok-used000000000000000000000000"));
  assert.equal(used.status, 410);
  assert.match((await responseBody(used)).error, /already been used or has expired/);

  stub("consumeVerificationToken", async () => ({ kind: "expired" }));
  const expired = await GET(apiRequest("/api/auth/verify-email?token=tok-expired0000000000000000000000"));
  assert.equal(expired.status, 410);
  assert.match((await responseBody(expired)).error, /already been used or has expired/);
});

test("verify-email treats an erased account like an unknown token (400)", async () => {
  stub("consumeVerificationToken", async () => ({ kind: "verified", contributorId: 7 }));
  stub("markContributorEmailVerified", async () => null);
  const { GET } = await verifyEmailRoute();
  const response = await GET(apiRequest("/api/auth/verify-email?token=tok-erased00000000000000000000000"));
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, "Invalid or expired verification link.");
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-email/resend (multi-method auth Fase B)
// ---------------------------------------------------------------------------

test("resend requires a live session (401 anonymous)", async () => {
  stub("findSessionByToken", async () => null);
  const { POST } = await resendRoute();
  const response = await POST(apiRequest("/api/auth/verify-email/resend", { method: "POST" }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("createVerificationToken").length, 0);
});

test("resend on an already-verified account is a no-op success", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor: verifiedContributor }));
  const { POST } = await resendRoute();
  const response = await POST(
    sessionRequest("/api/auth/verify-email/resend", "raw-session-token-abc123", { method: "POST" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)).verified, true);
  assert.equal(callArgs("createVerificationToken").length, 0, "no new token for a verified account");
});

test("resend mints a fresh verify token and sends it through the canonical mailer", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  // Budget pre-flight (email_send_log): allowed.
  stub("canSendAuthEmail", async () => ({ allowed: true, retryAfterSeconds: 0 }));
  stub("createVerificationToken", async () => ({ rawToken: "resend-token-456", expiresAt: "2026-08-02T09:00:00.000Z" }));
  // The canonical mailer accepts the email.
  stub("sendAuthEmail", async () => ({ ok: true, messageId: "m1" }));
  const { POST } = await resendRoute();
  const response = await POST(
    sessionRequest("/api/auth/verify-email/resend", "raw-session-token-abc123", { method: "POST" }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.sent, true);
  // Fail-closed: the raw token is NEVER echoed in the API response — it
  // lives only in the mail channel (P1-1: devLink echo removed).
  assert.ok(!("devLink" in body), "no raw token in the response");
  // The new token is minted for the caller's own account, purpose 'verify',
  // and handed to the canonical mailer.
  const [tokenArgs] = callArgs("createVerificationToken");
  assert.deepEqual(tokenArgs.slice(0, 2), [7, "verify"]);
  const [mailArgs] = callArgs("sendAuthEmail");
  assert.deepEqual(mailArgs[0].contributorId, 7);
  assert.equal(mailArgs[0].kind, "verify");
  assert.equal(mailArgs[0].rawToken, "resend-token-456");
});

test("resend honours the 3/h budget: the 4th email answers 429 with Retry-After", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  // Budget pre-flight: the email_send_log window is exhausted (3 sends).
  stub("canSendAuthEmail", async () => ({ allowed: false, retryAfterSeconds: 3600 }));
  const { POST } = await resendRoute();
  const response = await POST(
    sessionRequest("/api/auth/verify-email/resend", "raw-session-token-abc123", { method: "POST" }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "3600");
  assert.equal(callArgs("createVerificationToken").length, 0, "no token minted past the budget");
  assert.equal(callArgs("sendAuthEmail").length, 0, "no mail sent past the budget");
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password/request (multi-method auth Fase B)
// ---------------------------------------------------------------------------

test("reset request answers 200 {sent:true} for an UNKNOWN email (anti-enumeration)", async () => {
  stub("findContributorByEmail", async () => null);
  const { POST } = await resetRequestRoute();
  const response = await POST(
    apiRequest("/api/auth/reset-password/request", {
      method: "POST",
      body: { email: "nobody@example.org" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)), { sent: true });
  assert.equal(callArgs("createVerificationToken").length, 0, "no token for unknown accounts");
});

test("reset request mints a reset token for a known email and never echoes it", async () => {
  stub("findContributorByEmail", async () => contributor);
  stub("canSendAuthEmail", async () => ({ allowed: true, retryAfterSeconds: 0 }));
  stub("createVerificationToken", async () => ({ rawToken: "reset-token-789", expiresAt: "2026-08-02T10:00:00.000Z" }));
  stub("sendAuthEmail", async () => ({ ok: true, messageId: "m1" }));
  const { POST } = await resetRequestRoute();
  const response = await POST(
    apiRequest("/api/auth/reset-password/request", {
      method: "POST",
      body: { email: "Ada@Example.ORG" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  // Anti-enumeration: the success body is identical to the unknown-email one,
  // and the token NEVER appears in the response (it goes only in the mail).
  assert.deepEqual(body, { sent: true });
  assert.deepEqual(callArgs("createVerificationToken")[0].slice(0, 2), [7, "reset"]);
  // The reset link is handed to the canonical mailer (kind 'reset').
  const [mailArgs] = callArgs("sendAuthEmail");
  assert.deepEqual(mailArgs[0].contributorId, 7);
  assert.equal(mailArgs[0].kind, "reset");
  assert.equal(mailArgs[0].rawToken, "reset-token-789");
});

test("reset request keeps answering 200 {sent:true} past the 3/h budget (no token, no mail)", async () => {
  stub("findContributorByEmail", async () => contributor);
  stub("canSendAuthEmail", async () => ({ allowed: false, retryAfterSeconds: 3600 }));
  const { POST } = await resetRequestRoute();
  const response = await POST(
    apiRequest("/api/auth/reset-password/request", {
      method: "POST",
      body: { email: "ada@example.org" },
    }),
  );
  // Anti-enumeration (P1-1): an exhausted budget MUST NOT answer differently
  // from an unknown address — a 429 here is reachable only for registered
  // emails and is a binary existence oracle. Same generic body, no token
  // minted, no mail sent (the budget still caps real sends at 3/h).
  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)), { sent: true });
  assert.equal(callArgs("createVerificationToken").length, 0, "no token minted past the budget");
  assert.equal(callArgs("sendAuthEmail").length, 0, "no mail sent past the budget");
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password/confirm (multi-method auth Fase B)
// ---------------------------------------------------------------------------

test("reset confirm rotates the password, revokes sessions, and verifies the email", async () => {
  stub("consumeVerificationToken", async () => ({ kind: "verified", contributorId: 7 }));
  stub("applyPasswordReset", async () => verifiedContributor);
  const { POST } = await resetConfirmRoute();
  const response = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE", password: "Brand-New-Password1" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.ok, true);
  assert.deepEqual(body.contributor, verifiedContributor);
  // Consumed with purpose 'reset'; the atomic applyPasswordReset batch rotates
  // the hash, revokes every live session and verifies the address.
  assert.deepEqual(callArgs("consumeVerificationToken")[0][1], "reset");
  assert.equal(callArgs("applyPasswordReset")[0][0], 7);
  assert.equal(callArgs("applyPasswordReset")[0][1], "Brand-New-Password1");
});

test("reset confirm answers 400 for malformed input and unknown tokens", async () => {
  const { POST } = await resetConfirmRoute();
  // Malformed token / weak password: rejected before any db call.
  const malformed = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "short", password: "Brand-New-Password1" },
    }),
  );
  assert.equal(malformed.status, 400);
  const weak = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE", password: "short" },
    }),
  );
  assert.equal(weak.status, 400);
  assert.equal(callArgs("consumeVerificationToken").length, 0);

  stub("consumeVerificationToken", async () => ({ kind: "invalid" }));
  const unknown = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", password: "Brand-New-Password1" },
    }),
  );
  assert.equal(unknown.status, 400);
  assert.equal((await responseBody(unknown)).error, "Invalid or expired reset link.");
});

test("reset confirm answers 410 Gone for used and expired reset tokens", async () => {
  const { POST } = await resetConfirmRoute();
  stub("consumeVerificationToken", async () => ({ kind: "used" }));
  const used = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", password: "Brand-New-Password1" },
    }),
  );
  assert.equal(used.status, 410);
  assert.equal(callArgs("applyPasswordReset").length, 0, "no hash rotation on a dead token");

  stub("consumeVerificationToken", async () => ({ kind: "expired" }));
  const expired = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH", password: "Brand-New-Password1" },
    }),
  );
  assert.equal(expired.status, 410);
});

test("reset confirm treats an erased account like an unknown token (400)", async () => {
  stub("consumeVerificationToken", async () => ({ kind: "verified", contributorId: 7 }));
  stub("applyPasswordReset", async () => null);
  const { POST } = await resetConfirmRoute();
  const response = await POST(
    apiRequest("/api/auth/reset-password/confirm", {
      method: "POST",
      body: { token: "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII", password: "Brand-New-Password1" },
    }),
  );
  assert.equal(response.status, 400);
});
