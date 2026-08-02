// Runtime API tests for multi-method auth Fase C (t_36989e06) — passkey
// ceremonies, passkey management and one-time recovery codes:
//   - POST /api/auth/passkey/register/begin|complete   enroll a passkey (session + CSRF)
//   - POST /api/auth/passkey/login/begin|complete      WebAuthn sign-in (public)
//   - GET/DELETE /api/auth/passkey/credentials         manage enrolled passkeys (session)
//   - POST /api/auth/recovery                          redeem a one-time recovery code (public)
//
// db/passkeys and db/auth are mocked (tests/helpers/mocks/*.mjs); pure
// helpers (webauthnRpConfig, userHandle encode/decode, counter policy) run
// for real. The cryptographic verification itself (verifyRegistrationResponse
// / verifyAuthenticationResponse from @simplewebauthn/server) is exercised
// for real on its REJECTION paths — a genuine attestation/assertion requires
// a real authenticator, which the upstream WebAuthn conformance story covers;
// every layer of OUR orchestration around it (challenge consume, credential
// lookup, generic errors, session/cookie issuance) is tested here. The real
// database boundary is covered separately by tests/passkey-d1.test.mjs.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  rateLimit.resetRateLimitState();
});

after(async () => cleanupRouteTree());

const registerBeginRoute = () => loadRoute("app/api/auth/passkey/register/begin/route.mjs");
const registerCompleteRoute = () => loadRoute("app/api/auth/passkey/register/complete/route.mjs");
const loginBeginRoute = () => loadRoute("app/api/auth/passkey/login/begin/route.mjs");
const loginCompleteRoute = () => loadRoute("app/api/auth/passkey/login/complete/route.mjs");
const credentialsRoute = () => loadRoute("app/api/auth/passkey/credentials/route.mjs");
const recoveryRoute = () => loadRoute("app/api/auth/recovery/route.mjs");

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
  return response.headers.getSetCookie().map((cookie) => cookie.split("=")[0]);
}

/** Live-session request with both cookies AND the double-submit CSRF header. */
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

function stubSession() {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/register/begin
// ---------------------------------------------------------------------------

test("register/begin requires a live session", async () => {
  stub("findSessionByToken", async () => null);
  const { POST } = await registerBeginRoute();
  const response = await POST(apiRequest("/api/auth/passkey/register/begin", { method: "POST" }));
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Sign in required to enroll a passkey.");
});

test("register/begin requires a valid CSRF token", async () => {
  stubSession();
  const { POST } = await registerBeginRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/register/begin", {
      method: "POST",
      headers: { cookie: "osdb_session=raw-token; osdb_csrf=csrf-token-123" }, // no CSRF header
    }),
  );
  assert.equal(response.status, 403);
});

test("register/begin issues privacy-preserving options and stores a hashed register challenge", async () => {
  stubSession();
  stub("sweepExpiredWebAuthnChallenges", async () => 0);
  stub("listPasskeys", async () => []);
  stub("createWebAuthnChallenge", async () => ({ id: 1 }));
  const { POST } = await registerBeginRoute();
  const response = await POST(authedRequest("/api/auth/passkey/register/begin", { method: "POST" }));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.ok(body.options, "options object returned");
  assert.equal(typeof body.options.challenge, "string");
  assert.ok(body.options.challenge.length > 0);
  assert.equal(body.options.rp.id, "localhost", "RP identity comes from WEBAUTHN_* env");
  assert.equal(body.options.attestation, "none", "privacy: no device attestation is collected");
  assert.equal(body.options.authenticatorSelection.userVerification, "preferred");

  const [challengeArgs] = callArgs("createWebAuthnChallenge");
  assert.equal(challengeArgs[0].challenge, body.options.challenge, "the exact challenge is stored");
  assert.equal(challengeArgs[0].kind, "register");
  assert.equal(challengeArgs[0].contributorId, 7);
  const passkeyLib = await loadLibModule("passkey");
  assert.equal(challengeArgs[0].userHandle, passkeyLib.userHandleForContributor(7));
});

test("register/begin excludes the contributor's existing passkeys from re-enrollment", async () => {
  stubSession();
  stub("sweepExpiredWebAuthnChallenges", async () => 0);
  stub("listPasskeys", async () => [{ credentialId: "cred-1", transports: '["usb"]' }]);
  stub("createWebAuthnChallenge", async () => ({ id: 1 }));
  const { POST } = await registerBeginRoute();
  const response = await POST(authedRequest("/api/auth/passkey/register/begin", { method: "POST" }));
  const body = await responseBody(response);
  // SimpleWebAuthn completes each exclude entry with type "public-key".
  assert.deepEqual(body.options.excludeCredentials, [
    { id: "cred-1", transports: ["usb"], type: "public-key" },
  ]);
});

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/register/complete
// ---------------------------------------------------------------------------

test("register/complete requires a live session", async () => {
  stub("findSessionByToken", async () => null);
  const { POST } = await registerCompleteRoute();
  const response = await POST(apiRequest("/api/auth/passkey/register/complete", { method: "POST" }));
  assert.equal(response.status, 401);
});

test("register/complete requires a valid CSRF token", async () => {
  stubSession();
  const { POST } = await registerCompleteRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/register/complete", {
      method: "POST",
      headers: { cookie: "osdb_session=raw-token; osdb_csrf=csrf-token-123" },
      body: { challenge: "c1", response: {} },
    }),
  );
  assert.equal(response.status, 403);
});

test("register/complete rejects a malformed payload", async () => {
  stubSession();
  const { POST } = await registerCompleteRoute();
  const response = await POST(
    authedRequest("/api/auth/passkey/register/complete", {
      method: "POST",
      body: { response: {} }, // challenge missing
    }),
  );
  assert.equal(response.status, 400);
});

test("register/complete rejects an expired or already-used challenge", async () => {
  stubSession();
  stub("consumeWebAuthnChallenge", async () => null);
  const { POST } = await registerCompleteRoute();
  const response = await POST(
    authedRequest("/api/auth/passkey/register/complete", {
      method: "POST",
      body: { challenge: "stale", response: {} },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, "This enrollment has expired or was already used. Please start again.");
});

test("register/complete rejects an invalid attestation (verification runs for real)", async () => {
  stubSession();
  stub("consumeWebAuthnChallenge", async () => ({ id: 1, kind: "register", contributorId: 7 }));
  const { POST } = await registerCompleteRoute();
  const response = await POST(
    authedRequest("/api/auth/passkey/register/complete", {
      method: "POST",
      body: {
        challenge: "c1",
        response: {
          id: "cred-x",
          rawId: "cred-x",
          type: "public-key",
          response: { clientDataJSON: "e30=", attestationObject: "AAAA" },
        },
      },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(callArgs("createPasskey").length, 0, "no credential stored on a failed verification");
});

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/login/begin
// ---------------------------------------------------------------------------

test("login/begin without email issues discoverable options and stores a login challenge", async () => {
  stub("sweepExpiredWebAuthnChallenges", async () => 0);
  stub("createWebAuthnChallenge", async () => ({ id: 1 }));
  const { POST } = await loginBeginRoute();
  const response = await POST(apiRequest("/api/auth/passkey/login/begin", { method: "POST" }));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.ok(body.options);
  assert.equal(typeof body.options.challenge, "string");
  assert.deepEqual(body.options.allowCredentials, [], "empty allowCredentials = discoverable / Conditional UI");
  const [challengeArgs] = callArgs("createWebAuthnChallenge");
  assert.equal(challengeArgs[0].kind, "login");
  assert.ok(!("contributorId" in challengeArgs[0]), "public login challenge is not bound to a contributor");
  assert.equal(challengeArgs[0].userHandle, null);
});

test("login/begin with a known email narrows the ceremony to that account's passkeys", async () => {
  stub("sweepExpiredWebAuthnChallenges", async () => 0);
  stub("findContributorByEmail", async () => contributor);
  stub("listPasskeys", async () => [{ credentialId: "cred-1", transports: null }]);
  stub("createWebAuthnChallenge", async () => ({ id: 1 }));
  const { POST } = await loginBeginRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/begin", {
      method: "POST",
      body: { email: "ada@example.org" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  // SimpleWebAuthn completes the entry with type "public-key".
  assert.deepEqual(body.options.allowCredentials, [{ id: "cred-1", type: "public-key" }]);
  assert.deepEqual(callArgs("findContributorByEmail")[0], ["ada@example.org"], "email normalised before lookup");
  const [challengeArgs] = callArgs("createWebAuthnChallenge");
  const passkeyLib = await loadLibModule("passkey");
  assert.equal(challengeArgs[0].userHandle, passkeyLib.userHandleForContributor(7));
});

test("login/begin with an unknown email is indistinguishable from no email (anti-enumeration)", async () => {
  stub("sweepExpiredWebAuthnChallenges", async () => 0);
  stub("findContributorByEmail", async () => null);
  stub("createWebAuthnChallenge", async () => ({ id: 1 }));
  const { POST } = await loginBeginRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/begin", {
      method: "POST",
      body: { email: "ghost@example.org" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.options.allowCredentials, []);
});

test("login/begin rejects cross-origin requests", async () => {
  const { POST } = await loginBeginRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/begin", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }),
  );
  assert.equal(response.status, 403);
});

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/login/complete
// ---------------------------------------------------------------------------

test("login/complete rejects a missing or already-consumed challenge", async () => {
  stub("consumeWebAuthnChallenge", async () => null);
  const { POST } = await loginCompleteRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: "c1", response: { id: "cred-1", response: {} } },
    }),
  );
  assert.equal(response.status, 401);
});

test("login/complete rejects a challenge from the wrong ceremony kind", async () => {
  stub("consumeWebAuthnChallenge", async () => ({ id: 1, kind: "register" }));
  const { POST } = await loginCompleteRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: "c1", response: { id: "cred-1", response: {} } },
    }),
  );
  assert.equal(response.status, 401);
});

test("login/complete rejects an unknown credential", async () => {
  stub("consumeWebAuthnChallenge", async () => ({ id: 1, kind: "login" }));
  stub("findPasskeyByCredentialId", async () => null);
  const { POST } = await loginCompleteRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: "c1", response: { id: "ghost-cred", response: {} } },
    }),
  );
  assert.equal(response.status, 401);
});

test("login/complete rejects an invalid assertion (verification runs for real)", async () => {
  stub("consumeWebAuthnChallenge", async () => ({ id: 1, kind: "login", contributorId: 7 }));
  stub("findPasskeyByCredentialId", async () => ({
    id: 1,
    contributorId: 7,
    credentialId: "cred-1",
    publicKey: "AAAA",
    counter: 0,
    transports: null,
    createdAt: "2026-08-01T08:00:00.000Z",
  }));
  const { POST } = await loginCompleteRoute();
  const response = await POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: {
        challenge: "c1",
        response: {
          id: "cred-1",
          rawId: "cred-1",
          type: "public-key",
          response: {
            clientDataJSON: "e30=",
            authenticatorData: "AAAA",
            signature: "AAAA",
            userHandle: null,
          },
        },
      },
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(callArgs("createSession").length, 0, "no session on a failed verification");
});

// ---------------------------------------------------------------------------
// GET/DELETE /api/auth/passkey/credentials
// ---------------------------------------------------------------------------

test("credentials GET requires a session", async () => {
  stub("findSessionByToken", async () => null);
  const { GET } = await credentialsRoute();
  const response = await GET(apiRequest("/api/auth/passkey/credentials"));
  assert.equal(response.status, 401);
});

test("credentials GET lists only the public descriptors", async () => {
  stubSession();
  stub("listPasskeys", async () => [
    { id: 3, credentialId: "cred-1", transports: '["usb"]', createdAt: "2026-08-01T08:00:00.000Z" },
  ]);
  const { GET } = await credentialsRoute();
  const response = await GET(
    apiRequest("/api/auth/passkey/credentials", { headers: { cookie: "osdb_session=raw-token" } }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.credentials, [
    { id: 3, credentialId: "cred-1", transports: '["usb"]', createdAt: "2026-08-01T08:00:00.000Z" },
  ]);
  assert.deepEqual(callArgs("listPasskeys")[0], [7]);
});

test("credentials DELETE requires a session", async () => {
  stub("findSessionByToken", async () => null);
  const { DELETE } = await credentialsRoute();
  const response = await DELETE(
    apiRequest("/api/auth/passkey/credentials", { method: "DELETE", body: { credentialId: "cred-1" } }),
  );
  assert.equal(response.status, 401);
});

test("credentials DELETE requires a valid CSRF token", async () => {
  stubSession();
  const { DELETE } = await credentialsRoute();
  const response = await DELETE(
    apiRequest("/api/auth/passkey/credentials", {
      method: "DELETE",
      headers: { cookie: "osdb_session=raw-token; osdb_csrf=csrf-token-123" },
      body: { credentialId: "cred-1" },
    }),
  );
  assert.equal(response.status, 403);
});

test("credentials DELETE rejects a missing credentialId", async () => {
  stubSession();
  const { DELETE } = await credentialsRoute();
  const response = await DELETE(authedRequest("/api/auth/passkey/credentials", { method: "DELETE", body: {} }));
  assert.equal(response.status, 400);
});

test("credentials DELETE removes the contributor's own passkey", async () => {
  stubSession();
  stub("deletePasskey", async () => true);
  const { DELETE } = await credentialsRoute();
  const response = await DELETE(
    authedRequest("/api/auth/passkey/credentials", { method: "DELETE", body: { credentialId: "cred-1" } }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)), { ok: true });
  assert.deepEqual(callArgs("deletePasskey")[0], [7, "cred-1"]);
});

test("credentials DELETE answers 404 when the passkey is not the contributor's", async () => {
  stubSession();
  stub("deletePasskey", async () => false);
  const { DELETE } = await credentialsRoute();
  const response = await DELETE(
    authedRequest("/api/auth/passkey/credentials", { method: "DELETE", body: { credentialId: "cred-9" } }),
  );
  assert.equal(response.status, 404);
});

// ---------------------------------------------------------------------------
// POST /api/auth/recovery
// ---------------------------------------------------------------------------

test("recovery redeems a single-use code and opens a session", async () => {
  stub("findContributorByEmail", async () => contributor);
  stub("consumeRecoveryCode", async () => true);
  stub("getContributorById", async () => contributor);
  stub("createSession", async () => newSession);
  const { POST } = await recoveryRoute();
  const response = await POST(
    apiRequest("/api/auth/recovery", {
      method: "POST",
      body: { email: "ada@example.org", code: "abcd-efgh-ijkl-mnop" },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.contributor, contributor);
  assert.equal(body.recoveryUsed, true);
  assert.equal(body.reEnrollmentRequired, true, "a fresh passkey enrollment is required after recovery");
  assert.deepEqual(cookieNames(response).sort(), ["osdb_csrf", "osdb_session"]);
  assert.deepEqual(callArgs("consumeRecoveryCode")[0], [7, "abcd-efgh-ijkl-mnop"]);
});

test("recovery answers the same 401 for unknown email, wrong code and used code", async () => {
  const cases = [
    { name: "unknown email", stubs: { findContributorByEmail: async () => null } },
    {
      name: "wrong code",
      stubs: { findContributorByEmail: async () => contributor, consumeRecoveryCode: async () => false },
    },
  ];
  for (const { name, stubs } of cases) {
    resetMockState();
    rateLimit.resetRateLimitState();
    for (const [key, impl] of Object.entries(stubs)) stub(key, impl);
    const { POST } = await recoveryRoute();
    const response = await POST(
      apiRequest("/api/auth/recovery", {
        method: "POST",
        body: { email: "ada@example.org", code: "abcd-efgh-ijkl-mnop" },
      }),
    );
    assert.equal(response.status, 401, name);
    assert.equal((await responseBody(response)).error, "Invalid recovery code.", name);
    assert.equal(callArgs("createSession").length, 0, name);
  }
});

test("recovery rejects a malformed payload", async () => {
  const { POST } = await recoveryRoute();
  for (const body of [{}, { email: "ada@example.org" }, { email: "nope", code: "x" }, { email: "ada@example.org", code: "" }]) {
    const response = await POST(apiRequest("/api/auth/recovery", { method: "POST", body }));
    assert.equal(response.status, 401, JSON.stringify(body));
    assert.equal(callArgs("consumeRecoveryCode").length, 0, JSON.stringify(body));
  }
});

// ---------------------------------------------------------------------------
// lib/passkey pure helpers (real implementations via the harness tree)
// ---------------------------------------------------------------------------

test("webauthnRpConfig honours WEBAUTHN_* env and falls back to the production identity", async () => {
  const lib = await loadLibModule("passkey");
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  assert.deepEqual(lib.webauthnRpConfig(env), {
    rpID: "localhost",
    rpName: "OpenSurveillanceDB",
    origin: "https://osdb.test",
  });
  assert.deepEqual(lib.webauthnRpConfig({}), {
    rpID: "opensurveillancedb.org",
    rpName: "OpenSurveillanceDB",
    origin: "https://opensurveillancedb.org",
  });
  assert.deepEqual(lib.webauthnRpConfig({ WEBAUTHN_RP_ID: "example.com" }), {
    rpID: "example.com",
    rpName: "OpenSurveillanceDB",
    origin: "https://opensurveillancedb.org",
  });
});

test("toBase64Url/fromBase64Url round-trip raw bytes", async () => {
  const lib = await loadLibModule("passkey");
  const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);
  assert.deepEqual([...lib.fromBase64Url(lib.toBase64Url(bytes))], [0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);
  assert.equal(lib.toBase64Url(bytes), "3q2-7wEC");
});

test("userHandleForContributor/contributorIdFromUserHandle bind the stable numeric id", async () => {
  const lib = await loadLibModule("passkey");
  const handle = lib.userHandleForContributor(7);
  assert.equal(lib.contributorIdFromUserHandle(handle), "7");
  assert.equal(lib.contributorIdFromUserHandle(lib.userHandleForContributor(12345)), "12345");
  // Foreign or malformed handles must fail the ceremony, not crash it.
  assert.equal(lib.contributorIdFromUserHandle("!!not-base64!!"), null);
  assert.equal(lib.contributorIdFromUserHandle(""), null);
  assert.equal(lib.contributorIdFromUserHandle(lib.toBase64Url(new TextEncoder().encode("ada@example.org"))), null);
});

test("isCounterAdvancementOk tolerates 0->0 and rejects every other non-increase", async () => {
  const lib = await loadLibModule("passkey");
  assert.equal(lib.isCounterAdvancementOk(0, 0), true, "authenticators without a counter keep working");
  assert.equal(lib.isCounterAdvancementOk(1, 0), true);
  assert.equal(lib.isCounterAdvancementOk(0, 1), false);
  assert.equal(lib.isCounterAdvancementOk(5, 5), false, "cloned authenticator: counter stops advancing");
  assert.equal(lib.isCounterAdvancementOk(4, 5), false);
});

test("mock generateRecoveryCode/recoveryCodeHash keep the real shapes (db/passkeys mock)", async () => {
  const mockPasskeys = await loadTreeModule("db/passkeys.mjs");
  const code = mockPasskeys.generateRecoveryCode();
  assert.match(code, /^[A-Za-z0-9_-]{4}(?:-[A-Za-z0-9_-]{4}){3}$/, code);
  assert.equal(mockPasskeys.recoveryCodeHash(code), createHash("sha256").update(code).digest("hex"));
  assert.equal(mockPasskeys.RECOVERY_CODE_COUNT, 10);
  assert.equal(mockPasskeys.WEBAUTHN_CHALLENGE_TTL_MS, 10 * 60 * 1000);
});
