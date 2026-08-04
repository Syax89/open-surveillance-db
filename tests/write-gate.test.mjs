// Write gate (multi-method auth Fase E1, t_7e41c4e2) — dedicated suite.
//
// The gate itself (app/lib/write-gate.ts) plus its enforcement on every
// state-changing route:
//
//   POST   /api/cameras                      (record intake)
//   POST   /api/corrections                  (correction/removal intake)
//   POST   /api/photos                       (photo evidence upload)
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
const photosRoute = () => loadRoute("app/api/photos/route.mjs");
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
  email: "linus@osdb.test",
  displayName: "Linus",
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
  assert.equal(result.contributor.email, "linus@osdb.test");
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

test("POST /api/photos: 401 anonymous, 403 unverified, no db write either way", async (t) => {
  const { POST } = await photosRoute();
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const photoRequest = (request) => apiRequest("/api/photos", {
    method: "POST",
    headers: { "content-type": "image/jpeg" },
    body: jpeg,
    ...request,
  });
  await t.test("anonymous -> 401", async () => {
    stub("createPendingPhoto", async () => ({ id: 1 }));
    const response = await POST(photoRequest({}));
    assert.equal(response.status, 401);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(callArgs("createPendingPhoto").length, 0);
  });
  await t.test("unverified -> 403", async () => {
    liveSession();
    unverified();
    stub("createPendingPhoto", async () => ({ id: 1 }));
    const response = await POST(photoRequest({
      headers: {
        cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
        "x-csrf-token": "csrf-token-123",
      },
    }));
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).error, "Authentication required.");
    assert.equal(callArgs("createPendingPhoto").length, 0);
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
