// Runtime API tests for /api/corrections (write-only public endpoint).
//
// C4 contract: issue_type whitelist, optional contributor attribution,
// same-origin + CSRF when a session is present, dedupe mapping (see
// corrections-dedupe.test.mjs for the DB-level enforcement).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => {
  resetMockState();
  // Write gate (Fase E1): a VERIFIED session by default — the intake
  // validation tests below focus on the payload; the gate itself has its
  // own dedicated suite (tests/write-gate.test.mjs). Tests that exercise
  // the gate (anonymous / unverified / CSRF) override these stubs.
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
});
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/corrections/route.mjs");

// A valid whitelisted issue type used by most fixtures.
const TYPE = "other";

// Session fixture (ADR 0013 double-submit CSRF): the route resolves the
// session cookie through resolveOptionalContributor -> findSessionByToken
// (stubbed), then requires same-origin + x-csrf-token.
const session = {
  id: 7,
  tokenHash: "hash",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
  revokedAt: null,
};
const contributor = { id: 11, email: "alice@example.test", displayName: "Alice", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };

function sessionPost(body, headers = {}) {
  return apiRequest("/api/corrections", {
    method: "POST",
    body,
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...headers,
    },
  });
}

test("POST /api/corrections stores a trimmed whitelisted request and returns its reference id", async () => {
  // Write gate (Fase E1): the intake requires a VERIFIED contributor — a
  // verified session is part of the fixture from now on.
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 31, ...input } }));
  const { POST } = await route();
  const response = await POST(
    sessionPost({
      cameraId: 42,
      issueType: "  inaccurate  ",
      message: "  The camera is actually on the other corner.  ",
      contact: "  reporter@example.test  ",
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await responseBody(response), { referenceId: 31 });
  const args = callArgs("createCorrectionRequest")[0][0];
  assert.equal(args.issueType, "inaccurate");
  assert.equal(args.message, "The camera is actually on the other corner.");
  assert.equal(args.contact, "reporter@example.test");
  assert.equal(args.contributorId, 11, "a verified caller is attributed");
});

test("POST /api/corrections attributes the report to the session contributor", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 36, ...input } }));
  const { POST } = await route();
  const response = await POST(
    sessionPost({ cameraId: 42, issueType: "removal", message: "Faces a private window.", contact: null }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("createCorrectionRequest")[0][0].contributorId, 11);
});

test("POST /api/corrections rejects a live session with a missing or wrong CSRF token", async (t) => {
  const { POST } = await route();
  await t.test("missing csrf header", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
    stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await POST(
      apiRequest("/api/corrections", {
        method: "POST",
        body: { cameraId: 42, issueType: "removal", message: "Faces a private window." },
        headers: { cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123" },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(callArgs("createCorrectionRequest").length, 0);
  });
  await t.test("wrong csrf token", async () => {
    stub("findSessionByToken", async () => ({ ...session, contributor }));
    stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
    const response = await POST(
      sessionPost(
        { cameraId: 42, issueType: "removal", message: "Faces a private window." },
        { "x-csrf-token": "wrong-token" },
      ),
    );
    assert.equal(response.status, 403);
    assert.equal(callArgs("createCorrectionRequest").length, 0);
  });
});

test("POST /api/corrections accepts an omitted cameraId and stores null", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "undefined", body: { issueType: TYPE, message: "Y" } },
    { name: "empty string", body: { cameraId: "", issueType: TYPE, message: "Y" } },
    { name: "null", body: { cameraId: null, issueType: TYPE, message: "Y" } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      // Stub inside the subtest: beforeEach resets state for every subtest.
      stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 32, ...input } }));
      const response = await POST(sessionPost(body));
      assert.equal(response.status, 201, name);
      assert.equal(callArgs("createCorrectionRequest").at(-1)[0].cameraId, null, name);
    });
  }
});

test("POST /api/corrections accepts a numeric-string cameraId", async () => {
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 33, ...input } }));
  const { POST } = await route();
  const response = await POST(
    sessionPost({ cameraId: "42", issueType: TYPE, message: "Y" }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("createCorrectionRequest")[0][0].cameraId, 42);
});

test("POST /api/corrections rejects invalid cameraId values", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "zero", cameraId: 0 },
    { name: "negative", cameraId: -3 },
    { name: "fractional", cameraId: 1.5 },
    { name: "text", cameraId: "abc" },
    { name: "object", cameraId: {} },
    { name: "empty array", cameraId: [] },
  ];
  for (const { name, cameraId } of cases) {
    await t.test(name, async () => {
      const response = await POST(
        sessionPost({ cameraId, issueType: TYPE, message: "Y" }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("createCorrectionRequest").length, 0, name);
    });
  }
});

test("POST /api/corrections coerces truthy non-numeric cameraIds to numbers", async () => {
  // Documented edge case: Number(true) === 1 and Number([5]) === 5 pass the
  // integer check. Flagged for review.
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 35, ...input } }));
  const { POST } = await route();
  for (const [cameraId, expected] of [[true, 1], [[5], 5]]) {
    const response = await POST(
      sessionPost({ cameraId, issueType: TYPE, message: "Y" }),
    );
    assert.equal(response.status, 201, `cameraId=${JSON.stringify(cameraId)}`);
    assert.equal(
      callArgs("createCorrectionRequest").at(-1)[0].cameraId,
      expected,
      `cameraId=${JSON.stringify(cameraId)}`,
    );
  }
});

test("POST /api/corrections rejects missing or blank issue type and message", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "missing issueType", body: { message: "Y" } },
    { name: "missing message", body: { issueType: TYPE } },
    { name: "blank issueType", body: { issueType: "  ", message: "Y" } },
    { name: "blank message", body: { issueType: TYPE, message: "\n" } },
    { name: "empty body", body: {} },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await POST(sessionPost(body));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("createCorrectionRequest").length, 0, name);
    });
  }
});

test("A7: long free-text fields are truncated to their documented limits", async () => {
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 34, ...input } }));
  const { POST } = await route();
  const response = await POST(
    sessionPost({
        issueType: TYPE,
        message: "M".repeat(3000),
        contact: "C".repeat(300),
      }),
  );
  assert.equal(response.status, 201);
  const input = callArgs("createCorrectionRequest")[0][0];
  assert.equal(input.message.length, 1500);
  assert.equal(input.contact.length, 180);
});

test("A1: a long issue type is not truncated — it is outside the whitelist and answers 400", async () => {
  const { POST } = await route();
  const response = await POST(
    sessionPost({ issueType: "I".repeat(100), message: "Y" }),
  );
  assert.equal(response.status, 400);
  assert.equal(callArgs("createCorrectionRequest").length, 0);
});

test("POST /api/corrections rejects non-object JSON bodies", async () => {
  const { POST } = await route();
  for (const body of ["[]", "7", '"x"']) {
    const response = await POST(sessionPost(body));
    assert.equal(response.status, 400, body);
    assert.equal(callArgs("createCorrectionRequest").length, 0, body);
  }
});

test("POST /api/corrections rejects a JSON null body with 400 (OSDB-QA-001)", async () => {
  const { POST } = await route();
  const response = await POST(sessionPost("null"));
  assert.equal(response.status, 400);
  assert.equal(callArgs("createCorrectionRequest").length, 0);
});

test("POST /api/corrections maps malformed JSON to 400", async () => {
  const { POST } = await route();
  const response = await POST(sessionPost("{oops"));
  assert.equal(response.status, 400);
  assert.equal(callArgs("createCorrectionRequest").length, 0, "no db write for malformed JSON");
});

test("POST /api/corrections maps database failures to 500", async () => {
  stub("createCorrectionRequest", async () => {
    throw new Error("Correction request could not be saved");
  });
  const { POST } = await route();
  const response = await POST(
    sessionPost({ issueType: TYPE, message: "Y" }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to save correction request");
});

// ---------------------------------------------------------------------------
// POST /api/corrections — write API keys (EPIC api-keys T14)
// ---------------------------------------------------------------------------
// The route gates on requireWriteAuth(request, "submit"), so a machine
// client authenticates with `Authorization: Bearer *** (D4 `submit`
// scope) instead of a session cookie — no CSRF, no same-origin (T14: the
// double-submit check is conditional on authMethod === "session"), and the
// key-authenticated request is fail-closed double-counted against its own
// `key:<id>` rate-limit bucket (D8/T12). The bearer chain (sha256Hex →
// findApiKeyByHash → touchApiKeyLastUsed) is exercised with the db
// boundary mocked, exactly as in tests/write-gate.test.mjs.

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

/** POST /api/corrections authenticating with a Bearer API key (no session). */
function bearerPost(body, headers = {}) {
  return apiRequest("/api/corrections", {
    method: "POST",
    body,
    headers: { authorization: "Bearer osdb_test-key-123", ...headers },
  });
}

const keyPayload = { cameraId: 42, issueType: "removal", message: "Faces a private window." };

test("POST /api/corrections with a valid Bearer key (submit scope) stores the report under the key owner (T14)", async () => {
  liveKey();
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 37, ...input } }));
  const { POST } = await route();
  // No session cookie, no CSRF headers: the key alone authenticates.
  const response = await POST(bearerPost(keyPayload));

  assert.equal(response.status, 201);
  assert.equal(callArgs("createCorrectionRequest")[0][0].contributorId, 7, "attribution is the key owner, never anonymous");
  assert.equal(callArgs("findSessionByToken").length, 0, "the session store must never be consulted on the key path");
  assert.equal(callArgs("touchApiKeyLastUsed").length, 1, "a successful key resolution touches last_used (throttled in the db layer)");
});

test("POST /api/corrections key path skips same-origin and CSRF (T14 conditional gate)", async () => {
  // The CSRF/same-origin check is conditional on authMethod === "session":
  // a machine client holding a secret bearer credential carries no ambient
  // browser authority, so a cross-site Origin/Referer and a missing
  // X-CSRF-Token must NOT reject the request — the session-branch 403 must
  // never surface on the key path.
  liveKey();
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 38, ...input } }));
  const { POST } = await route();
  const response = await POST(
    bearerPost(keyPayload, {
      origin: "https://evil.example",
      referer: "https://evil.example/phish",
    }),
  );

  assert.equal(response.status, 201);
  assert.equal(callArgs("createCorrectionRequest").length, 1);
  assert.notEqual((await responseBody(response)).error, "Cross-site request rejected. Refresh the page and try again.");
});

test("POST /api/corrections rejects a key without the submit scope (403 canonical, no write)", async () => {
  liveKey({ scopes: ["confirm", "action"] });
  stub("createCorrectionRequest", async () => ({ kind: "created", correction: { id: 1 } }));
  const { POST } = await route();
  const response = await POST(bearerPost(keyPayload));

  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createCorrectionRequest").length, 0, "no write on scope mismatch");
});

test("POST /api/corrections rejects an invalid/revoked/expired key (401 canonical, no session fallback)", async () => {
  // findApiKeyByHash -> null collapses unknown/revoked/expired (D6/D9): the
  // route must answer the uniform 401 even when a verified session cookie
  // is ALSO present — fail-closed, never a silent downgrade to the session.
  stub("sha256Hex", async () => "hash");
  stub("findApiKeyByHash", async () => null);
  stub("createCorrectionRequest", async () => ({ kind: "created", correction: { id: 1 } }));
  const { POST } = await route();
  const response = await POST(
    bearerPost(keyPayload, {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
    }),
  );

  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(callArgs("findSessionByToken").length, 0, "fail-closed: a dead key must never fall through to the session");
  assert.equal(callArgs("createCorrectionRequest").length, 0);
});

test("POST /api/corrections key-authenticated requests are double-counted against their key:<id> bucket (D8/T14)", async () => {
  // The additive per-key check runs AFTER the gate on top of the per-IP
  // check: a key caller must pass BOTH buckets. With the WRITE_LIMITER
  // binding present, the route meters the per-IP key "submit:unknown" AND
  // the effective key "submit:key:41"; once the key's own budget is spent
  // the next request answers 429 with Retry-After even though the per-IP
  // bucket still has room.
  liveKey();
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 39, ...input } }));
  const { env: workerEnv } = await loadTreeModule("cloudflare-workers.mjs");
  const keyBucketCalls = [];
  workerEnv.WRITE_LIMITER = {
    async limit({ key }) {
      if (key.startsWith("submit:key:")) {
        keyBucketCalls.push(key);
        return { success: keyBucketCalls.length <= 1 };
      }
      return { success: true }; // the per-IP bucket always passes here
    },
  };
  try {
    const { POST } = await route();
    const first = await POST(bearerPost(keyPayload));
    assert.equal(first.status, 201, "first request passes both buckets");
    assert.equal(callArgs("createCorrectionRequest").length, 1);

    const second = await POST(bearerPost(keyPayload));
    assert.equal(second.status, 429, "the key's own budget is spent -> 429");
    assert.ok(Number(second.headers.get("retry-after")) > 0, "Retry-After is present");
    assert.equal((await responseBody(second)).error, "Too many requests. Please try again shortly.");
    assert.equal(callArgs("createCorrectionRequest").length, 1, "no write on the blocked request");
    assert.deepEqual(keyBucketCalls, ["submit:key:41", "submit:key:41"], "the per-key bucket is keyed on the effective key:<id>");
  } finally {
    delete workerEnv.WRITE_LIMITER;
  }
});

test("POST /api/corrections session requests consume ONLY the per-IP bucket (no per-key double-count, D8)", async () => {
  // Session/anonymous callers have no additive per-key bucket: the pre-gate
  // per-IP check is the whole story. The binding must therefore see exactly
  // one call per request, keyed "submit:unknown" (no cf-connecting-ip in
  // the harness), and never a "submit:key:*" key.
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 40, ...input } }));
  const { env: workerEnv } = await loadTreeModule("cloudflare-workers.mjs");
  const bindingCalls = [];
  workerEnv.WRITE_LIMITER = {
    async limit({ key }) {
      bindingCalls.push(key);
      return { success: true };
    },
  };
  try {
    const { POST } = await route();
    const response = await POST(sessionPost(keyPayload));
    assert.equal(response.status, 201);
    assert.deepEqual(bindingCalls, ["submit:unknown"], "only the per-IP bucket is consumed on the session branch");
  } finally {
    delete workerEnv.WRITE_LIMITER;
  }
});

test("the corrections route exposes no GET handler", async () => {
  const routeModule = await route();
  assert.equal(typeof routeModule.GET, "undefined");
});
