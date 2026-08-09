// Wave B (Data & Trust) + C4 — route-level contract for the private
// correction/removal intake (POST /api/corrections).
//
// These tests exercise the real route handler with the mocked db boundary
// (see helpers/api-harness.mjs): whitelist validation (A1/A2), trimming,
// HTTP status codes, dedupe mapping (A5), rate limiting (A4) and the
// submissions-disabled gate. Together with tests/intake-urgent-hide-workflow
// and tests/corrections-dedupe.test.mjs (real database layer) they pin the
// documented intake contract:
//
//   - C4 BREAKING CHANGE: `issueType` is a whitelist
//     (inaccurate|missing|removal|abuse|other) — the historical free-text
//     categories are rejected with 400, and removal/abuse NEVER accept free
//     text, even when the message body contains the word (A2);
//   - every whitelisted category is accepted and stored trimmed, and the
//     intake acknowledges with a case reference and never echoes
//     requester-supplied content back;
//   - removal-style requests may arrive without a precise record id;
//   - write gate (Fase E1): anonymous reports are refused with 401 and
//     unverified accounts with 403 (single uniform body); every stored
//     request is attributed to the verified contributor;
//   - duplicate open reports and re-reports on an already-removed target map
//     to 409 (A5; the DB-level enforcement lives in corrections-dedupe);
//   - the endpoint fails closed (503) when submissions are disabled;
//   - hostile input (script tags, CRLF, control characters, oversized
//     bodies) is bounded and cannot crash the handler (A7).
//
// All fixtures are fictional; no personal data is used.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  apiRequest,
  buildRouteTree,
  cleanupRouteTree,
  loadRoute,
  responseBody,
} from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => {
  resetMockState();
  // Write gate (Fase E1): a VERIFIED session by default — the contract
  // tests below focus on the intake payload; the gate itself has its own
  // dedicated suite (tests/write-gate.test.mjs). Tests that exercise the
  // gate (anonymous / unverified) override these stubs.
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
});
afterEach(async () => {
  // Restore the shared env mock mutated by the fail-closed / rate-limit tests.
  const env = await correctionsEnv();
  env.POST_SUBMISSIONS_DISABLED = "false";
  env.POST_RATE_LIMIT_MAX = "1000000";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
});
after(async () => cleanupRouteTree());

async function correctionsEnv() {
  const tree = await buildRouteTree();
  return import(pathToFileURL(path.join(tree, "cloudflare-workers.mjs"))).then((m) => m.env);
}

const route = () => loadRoute("app/api/corrections/route.mjs");

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

// The C4 whitelist (COMMUNITY_PLAN §2.4, A1). MUST match db/corrections.ts
// CORRECTION_ISSUE_TYPES — the route rejects anything outside this list.
const WHITELIST = ["inaccurate", "missing", "removal", "abuse", "other"];

// Historical free-text categories (pre-C4). Their rejection is the breaking
// change this suite pins: they were accepted before, now they answer 400.
const LEGACY_FREE_TEXT_CATEGORIES = [
  "Inaccurate location/details",
  "No longer present",
  "Private/non-public",
  "Privacy concern",
  "Safety concern",
  "Rights/ownership concern",
  "Wrong location",
  "outdated",
  "privacy-safety",
  "duplicate",
  "privacy-concern",
];

function intakePost(body, headers = {}) {
  // Verified-session request by default (write gate Fase E1): cookie pair +
  // CSRF header, plus any per-test override (e.g. cf-connecting-ip).
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

test("A1: the intake accepts every whitelisted issue type, stored trimmed", async () => {
  const { POST } = await route();
  for (const [index, issueType] of WHITELIST.entries()) {
    stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 100 + index, ...input } }));
    const response = await POST(
      intakePost(
        {
          cameraId: 42,
          issueType: `  ${issueType}  `,
          message: "Please review this record.",
          contact: null,
        },
        { "cf-connecting-ip": `203.0.113.${10 + index}` },
      ),
    );
    assert.equal(response.status, 201, issueType);
    const input = callArgs("createCorrectionRequest").at(-1)[0];
    assert.equal(input.issueType, issueType, "the category must be stored trimmed");
  }
});

test("A1/A2: any issue type outside the whitelist answers 400 — including every legacy free-text category", async () => {
  const { POST } = await route();
  const cases = [
    ...LEGACY_FREE_TEXT_CATEGORIES.map((issueType) => ({ name: `legacy free text "${issueType}"`, issueType })),
    { name: "random string", issueType: "please fix this camera" },
    { name: "empty", issueType: "  " },
    { name: "numeric", issueType: "123" },
  ];
  for (const [index, { name, issueType }] of cases.entries()) {
    stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 500 + index, ...input } }));
    const response = await POST(
      intakePost(
        { cameraId: 42, issueType, message: "Please investigate." },
        { "cf-connecting-ip": `203.0.113.${100 + index}` },
      ),
    );
    assert.equal(response.status, 400, name);
    assert.equal(
      callArgs("createCorrectionRequest").length,
      0,
      `${name}: no request may be stored for an out-of-whitelist issue type`,
    );
  }
});

test("A2: free text is never accepted for removal/abuse, even when the message contains the word", async () => {
  const { POST } = await route();
  const cases = [
    { issueType: "Please remove this camera", message: "It violates my privacy, please remove it now." },
    { issueType: "abuse report", message: "This is an abuse of surveillance powers." },
    { issueType: "I want to report removal", message: "removal" },
    { issueType: "remove", message: "removal abuse" },
  ];
  for (const [index, body] of cases.entries()) {
    stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 600 + index, ...input } }));
    const response = await POST(
      intakePost(body, { "cf-connecting-ip": `203.0.113.${140 + index}` }),
    );
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(callArgs("createCorrectionRequest").length, 0, "free-text removal/abuse must never be stored");
  }
});

test("A1/A2: the whitelisted removal and abuse types are accepted and routed to the same private intake", async () => {
  const { POST } = await route();
  for (const issueType of ["removal", "abuse"]) {
    stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 700, ...input } }));
    const response = await POST(
      intakePost(
        { cameraId: 42, issueType, message: "A camera on Via Roma faces a private courtyard." },
        { "cf-connecting-ip": "203.0.113.150" },
      ),
    );
    assert.equal(response.status, 201, issueType);
  }
});

test("the intake response never echoes requester-supplied content", async () => {
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 77, ...input } }));
  const { POST } = await route();
  const response = await POST(
    intakePost(
      {
        cameraId: 42,
        issueType: "removal",
        message: "This camera faces a private window.",
        contact: "requester@example.test",
      },
      { "cf-connecting-ip": "203.0.113.20" },
    ),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(
    await responseBody(response),
    { referenceId: 77 },
    "the acknowledgment must be only the case reference — no message, category, contact or cameraId echo",
  );
});

test("removal-style requests are accepted without a precise camera id", async () => {
  const { POST } = await route();
  const cases = [
    { name: "removal without id", issueType: "removal", cameraId: undefined },
    { name: "abuse with null id", issueType: "abuse", cameraId: null },
    { name: "missing with empty id", issueType: "missing", cameraId: "" },
  ];
  for (const [index, { name, issueType, cameraId }] of cases.entries()) {
    stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 200 + index, ...input } }));
    const body = { issueType, message: "Please investigate." };
    if (cameraId !== undefined) body.cameraId = cameraId;
    const response = await POST(
      intakePost(body, { "cf-connecting-ip": `203.0.113.${30 + index}` }),
    );
    assert.equal(response.status, 201, name);
    assert.equal(callArgs("createCorrectionRequest").at(-1)[0].cameraId, null, name);
  }
});

test("E1 write gate: anonymous reports are refused with 401, nothing is stored", async () => {
  // No session at all — the write gate answers 401 before the payload is
  // read (Fase E1: anonymous intake no longer exists).
  stub("findSessionByToken", async () => null);
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 800, ...input } }));
  const { POST } = await route();
  const response = await POST(
    intakePost(
      { cameraId: 42, issueType: "inaccurate", message: "Coordinates look off.", contact: null },
      { "cf-connecting-ip": "203.0.113.160", cookie: "", "x-csrf-token": "" },
    ),
  );
  assert.equal(response.status, 401, "anonymous reporters are refused by the write gate");
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(callArgs("createCorrectionRequest").length, 0, "no anonymous request may be stored");
});

test("E1 write gate: an unverified session is refused with 403, nothing is stored", async () => {
  // Live session, but the account has no email_verified_at (Fase B/C/D set
  // it on verification) — the gate answers 403 with the same uniform body.
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: null, authProvider: "password" }));
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 801, ...input } }));
  const { POST } = await route();
  const response = await POST(
    intakePost(
      { cameraId: 42, issueType: "inaccurate", message: "Coordinates look off.", contact: null },
      { "cf-connecting-ip": "203.0.113.161" },
    ),
  );
  assert.equal(response.status, 403, "an unverified account cannot write");
  assert.equal((await responseBody(response)).error, "Authentication required.");
  assert.equal(callArgs("createCorrectionRequest").length, 0, "nothing may be stored by an unverified account");
});

test("A5 (route mapping): an open duplicate report answers 409", async () => {
  stub("createCorrectionRequest", async () => ({ kind: "duplicate_open" }));
  const { POST } = await route();
  const response = await POST(
    intakePost(
      { cameraId: 42, issueType: "inaccurate", message: "Again.", contact: null },
      { "cf-connecting-ip": "203.0.113.170" },
    ),
  );
  assert.equal(response.status, 409);
  assert.match((await responseBody(response)).error, /already under review/);
});

test("A5 (route mapping): a repeat report on an already-removed record answers 409", async () => {
  stub("createCorrectionRequest", async () => ({ kind: "already_removed" }));
  const { POST } = await route();
  const response = await POST(
    intakePost(
      { cameraId: 42, issueType: "removal", message: "Still there?", contact: null },
      { "cf-connecting-ip": "203.0.113.171" },
    ),
  );
  assert.equal(response.status, 409);
  assert.match((await responseBody(response)).error, /already been removed/);
});

test("A4: the intake fails closed with 503 when submissions are disabled", async () => {
  const env = await correctionsEnv();
  env.POST_SUBMISSIONS_DISABLED = "true";
  const { POST } = await route();
  const response = await POST(
    intakePost(
      { issueType: "other", message: "Hello", contact: null },
      { "cf-connecting-ip": "203.0.113.40" },
    ),
  );
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Correction requests are temporarily disabled.");
  assert.equal(callArgs("createCorrectionRequest").length, 0, "no request may be stored while disabled");
});

test("A4: the intake rate-limits abusive callers with 429 and a Retry-After window", async () => {
  const env = await correctionsEnv();
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { POST } = await route();
  const request = () =>
    POST(
      intakePost(
        { issueType: "other", message: "Hello", contact: null },
        { "cf-connecting-ip": "203.0.113.50" },
      ),
    );

  // The first request must reach the database layer, so the db boundary is
  // stubbed like in the other intake tests; the second is rate-limited
  // before any db call happens.
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 400, ...input } }));
  const first = await request();
  assert.equal(first.status, 201, "the first request within the window must pass");
  const second = await request();
  assert.equal(second.status, 429, "the second request within the window must be rate-limited");
  assert.ok(
    Number.parseInt(second.headers.get("Retry-After") ?? "", 10) >= 1,
    "the 429 must carry a positive Retry-After",
  );
  assert.equal(
    callArgs("createCorrectionRequest").length,
    1,
    "only the allowed request may reach the database layer",
  );
});

test("A7: hostile input is bounded and cannot crash the intake or inject headers", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "script tag in message", message: "<script>alert(1)</script>", contact: null },
    { name: "CRLF header injection in contact", message: "Hello", contact: "x@example.test\r\nX-Injected: 1" },
    { name: "control characters", message: "Line1\u0000\u001fLine2", contact: null },
    { name: "zero-width and unicode", message: "café \u200b 日本語 🎥", contact: "r@example.test" },
  ];
  for (const [index, { name, message, contact }] of cases.entries()) {
    await t.test(name, async () => {
      stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 300 + index, ...input } }));
      const response = await POST(
        intakePost(
          { cameraId: 42, issueType: "other", message, contact },
          { "cf-connecting-ip": `203.0.113.${60 + index}` },
        ),
      );
      assert.equal(response.status, 201, "hostile input must not crash the handler");
      assert.equal(response.headers.get("x-injected"), null, "requester content must never reach response headers");
      assert.match(
        response.headers.get("content-type") ?? "",
        /application\/json/,
        "the response must stay a well-formed JSON document",
      );
      const stored = callArgs("createCorrectionRequest").at(-1)[0];
      assert.equal(typeof stored.message, "string");
      assert.ok(stored.message.length <= 1500, "message must stay within the documented bound");
      assert.ok(stored.contact === null || stored.contact.length <= 180, "contact must stay within the documented bound");
    });
  }
});

test("A7: an oversized body answers 413 before any database write", async () => {
  const env = await correctionsEnv();
  env.MAX_BODY_BYTES = "1024";
  const { POST } = await route();
  const response = await POST(
    intakePost(
      { cameraId: 42, issueType: "other", message: "M".repeat(4096), contact: null },
      { "cf-connecting-ip": "203.0.113.61" },
    ),
  );
  assert.equal(response.status, 413);
  assert.equal(callArgs("createCorrectionRequest").length, 0, "an oversized payload must never reach the db layer");
});

test("the intake contract is write-only: no GET handler exposes stored requests", async () => {
  const routeModule = await route();
  assert.equal(typeof routeModule.GET, "undefined");
});
