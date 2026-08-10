// Write gate (multi-method auth Fase E1, t_7e41c4e2) — dedicated suite.
//
// The gate itself (app/lib/write-gate.ts) plus its enforcement on every
// state-changing route:
//
//   POST   /api/cameras                      (record intake)
//   POST   /api/corrections                  (correction/removal intake)
//   PUT/DELETE /api/cameras/[id]/confirmation (community verification toggle)
//
// Contract (mirrored in Fase G QA matrix):
//   - anonymous (no session, dead session)      -> 401
//   - live session, contributor NOT verified    -> 403
//   - live session, contributor verified        -> ok
//
// Anti-enumeration: the 401 and 403 branches share ONE canonical body
// (WRITE_GATE_ERROR) on every gated route — a caller can never tell "no
// session" from "account exists but unverified" by the payload, only by the
// status code. Every denial carries Cache-Control: no-store.
//
// The db half (getContributorVerification, real SQL on the real schema) is
// covered in tests/auth-d1.test.mjs; the gate reads the same
// email_verified_at column that Fase A migration 0027 introduces.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => {
  resetMockState();
  // Default: NO session at all (anonymous). Tests that need a live session
  // override findSessionByToken; tests that need verification state override
  // getContributorVerification.
  stub("findSessionByToken", async () => null);
});
after(async () => cleanupRouteTree());

const writeGate = () => loadLibModule("write-gate");
const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");
const correctionsRoute = () => loadRoute("app/api/corrections/route.mjs");
const confirmationRoute = () => loadRoute("app/api/cameras/[id]/confirmation/route.mjs");

// Live session fixture (ADR 0013 double-submit CSRF). The write gate resolves
// it through resolveOptionalContributor -> findSessionByToken (stubbed).
const session = {
  id: 7,
  tokenHash: "hash",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
  revokedAt: null,
};
const contributor = {
  id: 7,
  email: "contributor@osdb.test",
  displayName: "Contributor",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function liveSession() {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
}

function verified(emailVerifiedAt = "2026-08-01T00:00:00.000Z", authProvider = "password") {
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt, authProvider }));
}

function unverified() {
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: null, authProvider: "password" }));
}

function erased() {
  stub("getContributorVerification", async () => null);
}

function gateRequest(path, { method = "POST", headers = {} } = {}) {
  return apiRequest(path, { method, headers });
}

function sessionRequest(path, { method = "POST", headers = {} } = {}) {
  return apiRequest(path, {
    method,
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...headers,
    },
  });
}

// ---------------------------------------------------------------------------
// The gate in isolation (app/lib/write-gate.ts)
// ---------------------------------------------------------------------------

test("requireVerifiedContributor answers 401 for an anonymous request (no session cookie)", async () => {
  const { requireVerifiedContributor, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireVerifiedContributor(gateRequest("/api/cameras"));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
  assert.equal(result.response.headers.get("cache-control"), "no-store");
});

test("requireVerifiedContributor answers 401 for a dead/revoked/expired session", async () => {
  // findSessionByToken returns null = revoked/expired/unknown token.
  const { requireVerifiedContributor, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireVerifiedContributor(sessionRequest("/api/cameras"));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
});

test("requireVerifiedContributor answers 403 for a live session whose account is NOT verified", async () => {
  liveSession();
  unverified();
  const { requireVerifiedContributor, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireVerifiedContributor(sessionRequest("/api/cameras"));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
  assert.equal(result.response.headers.get("cache-control"), "no-store");
});

test("anti-enumeration: the 401 and 403 denials share one canonical body", async () => {
  const { requireVerifiedContributor } = await writeGate();

  // 401: no session at all.
  const anonymous = await requireVerifiedContributor(gateRequest("/api/cameras"));
  // 403: live session, unverified account.
  liveSession();
  unverified();
  const unverifiedResult = await requireVerifiedContributor(sessionRequest("/api/cameras"));

  assert.equal(anonymous.response.status, 401);
  assert.equal(unverifiedResult.response.status, 403);
  const anonymousBody = await responseBody(anonymous.response);
  const unverifiedBody = await responseBody(unverifiedResult.response);
  assert.deepEqual(anonymousBody, unverifiedBody, "a caller cannot distinguish the two cases by payload");
});

test("requireVerifiedContributor treats an erased account like an anonymous request (401, same body)", async () => {
  // Session resolved, but the account vanished between the session read and
  // the verification read: same 401, same body — never reveal the account
  // ever existed.
  liveSession();
  erased();
  const { requireVerifiedContributor, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireVerifiedContributor(sessionRequest("/api/cameras"));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
});

test("requireVerifiedContributor resolves a verified contributor to the gate payload", async () => {
  liveSession();
  verified();
  const { requireVerifiedContributor } = await writeGate();
  const result = await requireVerifiedContributor(sessionRequest("/api/cameras"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contributor.id, 7);
  assert.equal(result.contributor.email, "contributor@osdb.test");
  assert.equal(result.contributor.emailVerifiedAt, "2026-08-01T00:00:00.000Z");
  assert.equal(result.contributor.authProvider, "password");
  assert.equal(result.session.csrfToken, "csrf-token-123");
});

test("requireVerifiedContributor accepts the injectable clock", async () => {
  liveSession();
  verified();
  const { requireVerifiedContributor } = await writeGate();
  const result = await requireVerifiedContributor(sessionRequest("/api/cameras"), "2026-08-02T00:00:00.000Z");
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// requireWriteAuth (EPIC api-keys T11, plan §1.4) — dual-path gate:
//   Authorization header present → API-key path (Bearer, uniform 401 on
//   invalid/revoked/expired, 403 on scope mismatch, no CSRF, session null);
//   no header → EXACT existing session path (authMethod "session").
// The bearer chain (parseBearerToken → sha256Hex → findApiKeyByHash →
// touchApiKeyLastUsed) is exercised through the real app/lib/api-key-auth.ts
// with the db boundary mocked, so the gate's branching is tested end-to-end
// while the db hash/liveness SQL stays covered by api-key-auth.test.mjs.
// ---------------------------------------------------------------------------

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

function bearerRequest(path, { method = "POST", headers = {} } = {}) {
  return apiRequest(path, { method, headers: { authorization: "Bearer osdb_test-key-123", ...headers } });
}

test("requireWriteAuth resolves a valid Bearer key with the required scope (api_key path, session null)", async () => {
  liveKey();
  const { requireWriteAuth } = await writeGate();
  const result = await requireWriteAuth(bearerRequest("/api/cameras"), "submit");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.authMethod, "api_key");
  assert.equal(result.session, null);
  assert.equal(result.apiKeyId, 41);
  assert.equal(result.contributor.id, 7);
  assert.equal(result.contributor.emailVerifiedAt, keyContributor.emailVerifiedAt);
  assert.equal(callArgs("findSessionByToken").length, 0, "the session store must never be consulted on the key path");
  assert.equal(callArgs("touchApiKeyLastUsed").length, 1, "a successful key resolution touches last_used (throttled in the db layer)");
});

test("requireWriteAuth answers 401 (canonical WRITE_GATE_ERROR, no-store) for an invalid/revoked/expired key", async () => {
  // findApiKeyByHash -> null collapses unknown/revoked/expired (D6/D9): the
  // gate must not distinguish them, and must not fall through to a session.
  stub("sha256Hex", async () => "hash");
  stub("findApiKeyByHash", async () => null);
  const { requireWriteAuth, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireWriteAuth(bearerRequest("/api/cameras"), "submit");
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("findSessionByToken").length, 0, "fail-closed: a dead key must never fall through to the session");
});

test("requireWriteAuth answers 403 (canonical WRITE_GATE_ERROR, no-store) when the key lacks the required scope", async () => {
  liveKey({ scopes: ["confirm", "action"] });
  const { requireWriteAuth, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireWriteAuth(bearerRequest("/api/cameras"), "submit");
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
  assert.equal(result.response.headers.get("cache-control"), "no-store");
});

test("requireWriteAuth fails closed: a malformed Authorization header never falls through to a live verified session (401)", async () => {
  // QA matrix / T10 contract: a request carrying ANY Authorization header is
  // committed to the key path — a Basic credential (or a broken Bearer) is a
  // client bug and must be answered 401 even when a valid session cookie is
  // also present, never silently downgraded to the session.
  liveSession();
  verified();
  const { requireWriteAuth, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireWriteAuth(
    apiRequest("/api/cameras", { method: "POST", headers: { authorization: "Basic dXNlcjpwYXNz" } }),
    "submit",
  );
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
  assert.equal(callArgs("findSessionByToken").length, 0, "fail-closed: the session must not be consulted when an Authorization header is present");
  assert.equal(callArgs("sha256Hex").length, 0, "the parser rejects a non-Bearer scheme before any hashing");
});

test("requireWriteAuth refuses a live key whose owner is NOT email-verified (403, D10 gate decision)", async () => {
  liveKey({ emailVerifiedAt: null });
  const { requireWriteAuth, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireWriteAuth(bearerRequest("/api/cameras"), "submit");
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
});

test("requireWriteAuth treats a corrupt scopes column as NO granted scopes (403 fail-closed)", async () => {
  stub("sha256Hex", async () => "hash");
  stub("findApiKeyByHash", async () => ({
    key: { ...apiKey, scopes: "not-json" },
    contributor: { ...keyContributor },
  }));
  stub("touchApiKeyLastUsed", async () => true);
  const { requireWriteAuth, WRITE_GATE_ERROR } = await writeGate();
  const result = await requireWriteAuth(bearerRequest("/api/cameras"), "submit");
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
  assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
});

test("requireWriteAuth without an Authorization header keeps the exact session path (authMethod session)", async () => {
  liveSession();
  verified();
  const { requireWriteAuth } = await writeGate();
  const result = await requireWriteAuth(sessionRequest("/api/cameras"), "submit");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.authMethod, "session");
  assert.equal(result.apiKeyId, null);
  assert.equal(result.session.csrfToken, "csrf-token-123", "handlers keep the double-submit CSRF on the session branch");
  assert.equal(result.contributor.id, 7);
});

test("requireWriteAuth without an Authorization header answers the same denials as requireVerifiedContributor (401 anonymous, 403 unverified, 400 malformed cookie)", async (t) => {
  const { requireWriteAuth, WRITE_GATE_ERROR } = await writeGate();
  await t.test("anonymous -> 401", async () => {
    const result = await requireWriteAuth(gateRequest("/api/cameras"), "submit");
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 401);
    assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
  });
  await t.test("live session, unverified -> 403", async () => {
    liveSession();
    unverified();
    const result = await requireWriteAuth(sessionRequest("/api/cameras"), "submit");
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 403);
    assert.deepEqual(await responseBody(result.response), { error: WRITE_GATE_ERROR });
  });
  await t.test("erased account -> 401 (same body)", async () => {
    liveSession();
    erased();
    const result = await requireWriteAuth(sessionRequest("/api/cameras"), "submit");
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 401);
  });
  await t.test("malformed session cookie -> 400", async () => {
    const result = await requireWriteAuth(
      apiRequest("/api/cameras", { method: "POST", headers: { cookie: "osdb_session=%E0%A4%A" } }),
      "submit",
    );
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 400);
  });
});

test("anti-enumeration across auth methods: key-path 401/403 share the ONE canonical body with session-path 401/403", async () => {
  const { requireWriteAuth } = await writeGate();

  // 401: anonymous session path.
  const anonymous401 = await requireWriteAuth(gateRequest("/api/cameras"), "submit");
  // 401: dead key path.
  stub("sha256Hex", async () => "hash");
  stub("findApiKeyByHash", async () => null);
  const deadKey401 = await requireWriteAuth(bearerRequest("/api/cameras"), "submit");

  // 403: unverified session path.
  liveSession();
  unverified();
  const unverified403 = await requireWriteAuth(sessionRequest("/api/cameras"), "submit");
  // 403: live key without the scope.
  stub("sha256Hex", async () => "hash");
  stub("findApiKeyByHash", async () => ({
    key: { ...apiKey, scopes: JSON.stringify(["confirm"]) },
    contributor: { ...keyContributor },
  }));
  stub("touchApiKeyLastUsed", async () => true);
  const scopeMismatch403 = await requireWriteAuth(bearerRequest("/api/cameras"), "submit");

  assert.deepEqual(await responseBody(deadKey401.response), await responseBody(anonymous401.response));
  assert.deepEqual(await responseBody(scopeMismatch403.response), await responseBody(unverified403.response));
  assert.notEqual(anonymous401.response.status, unverified403.response.status, "status codes stay the only distinguisher");
});

// ---------------------------------------------------------------------------
// Enforcement per route — 401 anonymous, 403 unverified, single uniform body
// ---------------------------------------------------------------------------

test("POST /api/cameras: 401 anonymous, 403 unverified, no db write either way", async (t) => {
  const { POST } = await camerasRoute();
  await t.test("anonymous -> 401", async () => {
    stub("createCamera", async () => ({ id: 1 }));
    const response = await POST(gateRequest("/api/cameras"));
    assert.equal(response.status, 401);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(callArgs("createCamera").length, 0);
  });
  await t.test("unverified -> 403", async () => {
    liveSession();
    unverified();
    stub("createCamera", async () => ({ id: 1 }));
    const response = await POST(sessionRequest("/api/cameras"));
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(callArgs("createCamera").length, 0);
  });
});

test("POST /api/corrections: 401 anonymous, 403 unverified, no db write either way", async (t) => {
  const { POST } = await correctionsRoute();
  const body = { cameraId: 42, issueType: "inaccurate", message: "Moved.", contact: "r@example.test" };
  await t.test("anonymous -> 401", async () => {
    stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 1, ...input } }));
    const response = await POST(gateRequest("/api/corrections", { method: "POST", body }));
    assert.equal(response.status, 401);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(callArgs("createCorrectionRequest").length, 0);
  });
  await t.test("unverified -> 403", async () => {
    liveSession();
    unverified();
    stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 1, ...input } }));
    const response = await POST(sessionRequest("/api/corrections", { method: "POST", body }));
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(callArgs("createCorrectionRequest").length, 0);
  });
});

test("PUT/DELETE /api/cameras/[id]/confirmation: 401 anonymous, 403 unverified, no db write either way", async (t) => {
  const { PUT, DELETE } = await confirmationRoute();
  for (const [method, handler] of [["PUT", PUT], ["DELETE", DELETE]]) {
    await t.test(`${method} anonymous -> 401`, async () => {
      stub("setConfirmation", async () => ({ kind: "ok" }));
      stub("removeConfirmation", async () => ({ kind: "ok" }));
      const response = await handler(gateRequest(`/api/cameras/5/confirmation`, { method }));
      assert.equal(response.status, 401, method);
      assert.equal((await responseBody(response)).error, "Authentication required.");
      assert.equal(callArgs("setConfirmation").length + callArgs("removeConfirmation").length, 0);
    });
    await t.test(`${method} unverified -> 403`, async () => {
      liveSession();
      unverified();
      stub("setConfirmation", async () => ({ kind: "ok" }));
      stub("removeConfirmation", async () => ({ kind: "ok" }));
      const response = await handler(sessionRequest(`/api/cameras/5/confirmation`, { method }));
      assert.equal(response.status, 403, method);
      assert.equal((await responseBody(response)).error, "Authentication required.");
      assert.equal(callArgs("setConfirmation").length + callArgs("removeConfirmation").length, 0);
    });
  }
});

test("the verified path passes the gate and reaches the db layer (smoke)", async () => {
  liveSession();
  verified();
  stub("setConfirmation", async () => ({ kind: "ok" }));
  const { PUT } = await confirmationRoute();
  const response = await PUT(sessionRequest("/api/cameras/5/confirmation", { method: "PUT" }));
  assert.notEqual(response.status, 401, "a verified contributor must never be denied by the gate");
  assert.notEqual(response.status, 403);
  assert.equal(callArgs("setConfirmation").length, 1);
});
