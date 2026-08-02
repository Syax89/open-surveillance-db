// Route-level tests for the contributor appeals API (ADR 0014):
//   POST   /api/appeals        contributor contests a moderation decision
//   GET    /api/appeals        moderator lists filed appeals
//   PATCH  /api/appeals/[id]   senior moderator / admin decides
//
// The db layer (fileAppeal, listAppeals, decideAppeal) is mocked; these tests
// pin the HTTP contract: status codes, error bodies, payload validation, the
// role gates, the input limits (414/413), and the rate-limit bucket (429).
// The real db-layer invariants are covered in tests/appeals.test.mjs and the
// end-to-end flow in tests/auth-flow-e2e.test.mjs.
//
// All identities are fictional demo accounts — no personal data.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  rateLimit.resetRateLimitState();
});
after(async () => cleanupRouteTree());

const appealsRoute = () => loadRoute("app/api/appeals/route.mjs");
const appealItemRoute = () => loadRoute("app/api/appeals/[id]/route.mjs");

// Demo identities (migration 0010 seed equivalents).
const contributorUser = {
  id: 6,
  email: "contributor@osdb.test",
  displayName: "Demo Contributor",
  role: "contributor",
  active: 1,
  mfaEnabled: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const moderatorUser = {
  id: 2,
  email: "record@osdb.test",
  displayName: "Demo Record Reviewer",
  role: "moderator",
  active: 1,
  mfaEnabled: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const seniorReviewer = { id: 3, displayName: "Demo Senior Moderator", role: "senior_moderator", active: 1 };

const as = (user) => (path, opts = {}) =>
  apiRequest(path, { ...opts, headers: { "x-osdb-user-email": user.email, ...(opts.headers ?? {}) } });
const asContributor = as(contributorUser);
const asModerator = as(moderatorUser);
const anonymous = (path, opts = {}) => apiRequest(path, opts);

const stubIdentity = (user) => stub("getUserByEmail", async (email) => (email === user.email ? user : null));

// Session auth (CEO decision 2026-08-02): POST /api/appeals authenticates
// with the ADR 0013 session cookie, so the route resolves the contributor
// session first, then bridges to the `users` row by email for the role gate.
const contributorPublic = {
  id: 7,
  email: "contributor@osdb.test",
  displayName: "Demo Contributor",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const contributorSession = {
  id: 1,
  contributorId: 7,
  tokenHash: "hash-of-raw-token",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-08-31T00:00:00.000Z",
  revokedAt: null,
};
const sessionRequest = (pathAndQuery, { headers = {}, ...rest } = {}) =>
  apiRequest(pathAndQuery, {
    ...rest,
    headers: {
      cookie: "osdb_session=raw-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...headers,
    },
  });
const stubContributorSession = (user = contributorUser) => {
  stub("findSessionByToken", async () => ({ ...contributorSession, contributor: contributorPublic }));
  stub("getUserByEmail", async (email) => (email === user.email ? user : null));
};

const appealFixture = {
  id: 1,
  entity: "camera",
  entityId: 5,
  decisionEventId: 7,
  appellantId: 6,
  reason: "The camera is on a public street.",
  status: "pending",
  appellantName: "Demo Contributor",
  decisionAction: "reject",
  deciderName: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  decidedAt: null,
};

const eventFixture = {
  id: 8,
  entity: "appeal",
  entityId: 1,
  previousStatus: null,
  newStatus: "pending",
  action: "appeal-filed",
  reasonCode: null,
  note: null,
  actor: "Demo Contributor",
  reviewerId: 6,
  actorRole: null,
  recused: 0,
  escalated: 0,
  secondReviewerId: null,
  createdAt: "2026-08-01T10:00:00.000Z",
};

const validPayload = {
  entity: "camera",
  entityId: 5,
  decisionEventId: 7,
  reason: "The camera is on a public street.",
};

// ---------------------------------------------------------------------------
// POST /api/appeals
// ---------------------------------------------------------------------------

test("POST files an appeal and returns 201 with the appeal and audit event", async () => {
  stubContributorSession();
  stub("fileAppeal", async () => ({ kind: "ok", appeal: appealFixture, event: eventFixture }));
  const { POST } = await appealsRoute();
  const response = await POST(sessionRequest("/api/appeals", { method: "POST", body: validPayload }));

  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.deepEqual(body.appeal, appealFixture);
  assert.deepEqual(body.event, eventFixture);

  const [args] = callArgs("fileAppeal");
  assert.deepEqual(args, [{
    entity: "camera",
    entityId: 5,
    decisionEventId: 7,
    appellantId: contributorUser.id,
    reason: "The camera is on a public street.",
  }]);
});

test("POST rejects anonymous callers with 401", async () => {
  const { POST } = await appealsRoute();
  const response = await POST(anonymous("/api/appeals", { method: "POST", body: validPayload }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("fileAppeal").length, 0);
});

test("POST rejects inactive accounts with 401", async () => {
  stubContributorSession({ ...contributorUser, active: 0 });
  const { POST } = await appealsRoute();
  const response = await POST(sessionRequest("/api/appeals", { method: "POST", body: validPayload }));
  assert.equal(response.status, 401, "an inactive identity is treated as unauthenticated");
  assert.equal(callArgs("fileAppeal").length, 0);
});

test("POST rejects a session whose contributor has no matching users row", async () => {
  stub("findSessionByToken", async () => ({ ...contributorSession, contributor: contributorPublic }));
  stub("getUserByEmail", async () => null);
  const { POST } = await appealsRoute();
  const response = await POST(sessionRequest("/api/appeals", { method: "POST", body: validPayload }));
  assert.equal(response.status, 401, "no users row means no role identity to attribute the appeal to");
  assert.equal(callArgs("fileAppeal").length, 0);
});

test("POST rejects a session with a wrong or missing CSRF token", async () => {
  stubContributorSession();
  const { POST } = await appealsRoute();
  for (const headers of [{ "x-csrf-token": "wrong-token" }, {}]) {
    const response = await POST(
      apiRequest("/api/appeals", {
        method: "POST",
        headers: { cookie: "osdb_session=raw-token-abc123; osdb_csrf=csrf-token-123", ...headers },
        body: validPayload,
      }),
    );
    assert.equal(response.status, 403, `headers=${JSON.stringify(headers)}`);
    assert.equal(callArgs("fileAppeal").length, 0);
  }
});

test("POST rejects malformed payloads with 400 and never touches the db layer", async () => {
  stubContributorSession();
  const { POST } = await appealsRoute();
  const cases = [
    { name: "entity missing", body: { ...validPayload, entity: undefined } },
    { name: "entity unknown", body: { ...validPayload, entity: "banana" } },
    { name: "entityId zero", body: { ...validPayload, entityId: 0 } },
    { name: "entityId negative", body: { ...validPayload, entityId: -3 } },
    { name: "entityId fractional", body: { ...validPayload, entityId: 1.5 } },
    { name: "entityId string", body: { ...validPayload, entityId: "5" } },
    { name: "decisionEventId zero", body: { ...validPayload, decisionEventId: 0 } },
    { name: "decisionEventId missing", body: { ...validPayload, decisionEventId: undefined } },
    { name: "reason empty", body: { ...validPayload, reason: "   " } },
    { name: "reason too long", body: { ...validPayload, reason: "x".repeat(1501) } },
    { name: "payload not an object", body: [1, 2, 3] },
  ];
  for (const { name, body } of cases) {
    const response = await POST(sessionRequest("/api/appeals", { method: "POST", body }));
    assert.equal(response.status, 400, name);
    assert.equal(callArgs("fileAppeal").length, 0, name);
  }
});

test("POST maps the db-layer failure results to stable status codes", async () => {
  stubContributorSession();
  const { POST } = await appealsRoute();
  const cases = [
    { result: { kind: "decision_not_found" }, status: 404 },
    { result: { kind: "decision_not_final" }, status: 400 },
    { result: { kind: "appellant_not_found" }, status: 404 },
    { result: { kind: "duplicate_pending" }, status: 409 },
  ];
  for (const { result, status } of cases) {
    stub("fileAppeal", async () => result);
    const response = await POST(sessionRequest("/api/appeals", { method: "POST", body: validPayload }));
    assert.equal(response.status, status, result.kind);
    assert.match((await responseBody(response)).error, /.+/);
  }
});

test("POST answers 413 when the body exceeds the byte cap", async () => {
  stubContributorSession();
  const { POST } = await appealsRoute();
  const oversized = { ...validPayload, reason: "x".repeat(40_000) };
  const response = await POST(sessionRequest("/api/appeals", { method: "POST", body: oversized }));
  assert.equal(response.status, 413);
  assert.equal(callArgs("fileAppeal").length, 0);
});

test("POST answers 414 when the URI is too long", async () => {
  stubContributorSession();
  const { POST } = await appealsRoute();
  const response = await POST(sessionRequest(`/api/appeals?${"a".repeat(5000)}`, { method: "POST", body: validPayload }));
  assert.equal(response.status, 414);
  assert.equal(callArgs("fileAppeal").length, 0);
});

test("POST answers 429 past the appeal bucket and records the block", async () => {
  stubContributorSession();
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.APPEAL_RATE_LIMIT_MAX;
  envModule.env.APPEAL_RATE_LIMIT_MAX = "1";
  try {
    stub("fileAppeal", async () => ({ kind: "ok", appeal: appealFixture, event: eventFixture }));
    const { POST } = await appealsRoute();
    const allowed = await POST(sessionRequest("/api/appeals", { method: "POST", body: validPayload }));
    assert.equal(allowed.status, 201, "the first call fits the 1/min cap");
    assert.equal(callArgs("fileAppeal").length, 1);

    const blocked = await POST(sessionRequest("/api/appeals", { method: "POST", body: validPayload }));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(callArgs("fileAppeal").length, 1, "the throttled call never reaches the db layer");
  } finally {
    envModule.env.APPEAL_RATE_LIMIT_MAX = previous;
  }
});

test("POST answers 500 when the db layer throws unexpectedly", async () => {
  stubContributorSession();
  stub("fileAppeal", async () => {
    throw new Error("D1 binding unavailable");
  });
  const { POST } = await appealsRoute();
  const response = await POST(sessionRequest("/api/appeals", { method: "POST", body: validPayload }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to record the appeal");
});

// ---------------------------------------------------------------------------
// GET /api/appeals
// ---------------------------------------------------------------------------

test("GET lists appeals for a moderator with 200", async () => {
  stubIdentity(moderatorUser);
  stub("listAppeals", async () => [appealFixture]);
  const { GET } = await appealsRoute();
  const response = await GET(asModerator("/api/appeals"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { appeals: [appealFixture] });
});

test("GET rejects anonymous callers and contributors with 401/403", async () => {
  const { GET } = await appealsRoute();
  const anonymousResponse = await GET(anonymous("/api/appeals"));
  assert.equal(anonymousResponse.status, 401);

  stubIdentity(contributorUser);
  const contributorResponse = await GET(asContributor("/api/appeals"));
  assert.equal(contributorResponse.status, 403, "a contributor may not list appeals");
  assert.equal(callArgs("listAppeals").length, 0);
});

test("GET answers 503 when the db layer fails", async () => {
  stubIdentity(moderatorUser);
  stub("listAppeals", async () => {
    throw new Error("D1 binding unavailable");
  });
  const { GET } = await appealsRoute();
  const response = await GET(asModerator("/api/appeals"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Appeals unavailable");
});

// ---------------------------------------------------------------------------
// PATCH /api/appeals/[id]
// ---------------------------------------------------------------------------

test("PATCH decides a pending appeal as a senior moderator", async () => {
  stubIdentity(moderatorUser);
  stub("getReviewerByUserId", async () => seniorReviewer);
  const decided = { ...appealFixture, status: "upheld", deciderName: "Demo Senior Moderator" };
  stub("decideAppeal", async () => ({ kind: "ok", appeal: decided, event: eventFixture }));
  const { PATCH } = await appealItemRoute();
  const response = await PATCH(asModerator("/api/appeals/1", {
    method: "PATCH",
    body: { decision: "uphold", note: "Evidence supports a public street" },
  }));

  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.appeal, decided);
  assert.deepEqual(callArgs("decideAppeal")[0], [{
    id: 1,
    decision: "uphold",
    reviewer: { id: 3, displayName: "Demo Senior Moderator", role: "senior_moderator", active: 1 },
    note: "Evidence supports a public street",
  }]);
});

test("PATCH rejects malformed appeal ids with 400", async () => {
  stubIdentity(moderatorUser);
  const { PATCH } = await appealItemRoute();
  for (const id of ["abc", "0", "-1", "1.5"]) {
    const response = await PATCH(asModerator(`/api/appeals/${id}`, { method: "PATCH", body: { decision: "dismiss" } }));
    assert.equal(response.status, 400, `id=${id}`);
    assert.equal(callArgs("decideAppeal").length, 0, `id=${id}`);
  }
});

test("PATCH rejects invalid decision payloads with 400", async () => {
  stubIdentity(moderatorUser);
  const { PATCH } = await appealItemRoute();
  const cases = [
    { name: "decision missing", body: { note: "x" } },
    { name: "decision unknown", body: { decision: "banana" } },
    { name: "note not a string", body: { decision: "dismiss", note: 42 } },
    { name: "note too long", body: { decision: "dismiss", note: "x".repeat(501) } },
  ];
  for (const { name, body } of cases) {
    const response = await PATCH(asModerator("/api/appeals/1", { method: "PATCH", body }));
    assert.equal(response.status, 400, name);
    assert.equal(callArgs("decideAppeal").length, 0, name);
  }
});

test("PATCH returns 403 when the account has no reviewer profile", async () => {
  stubIdentity(moderatorUser);
  stub("getReviewerByUserId", async () => null);
  const { PATCH } = await appealItemRoute();
  const response = await PATCH(asModerator("/api/appeals/1", { method: "PATCH", body: { decision: "dismiss" } }));
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Your account has no reviewer profile to act with.");
  assert.equal(callArgs("decideAppeal").length, 0);
});

test("PATCH maps decideAppeal results to stable status codes", async () => {
  stubIdentity(moderatorUser);
  stub("getReviewerByUserId", async () => seniorReviewer);
  const { PATCH } = await appealItemRoute();
  const cases = [
    { result: { kind: "not_found" }, status: 404 },
    { result: { kind: "not_pending" }, status: 409 },
    { result: { kind: "reviewer_not_found" }, status: 403 },
    { result: { kind: "reviewer_inactive" }, status: 403 },
    { result: { kind: "forbidden" }, status: 403 },
    { result: { kind: "original_reviewer" }, status: 409 },
    { result: { kind: "escalation_requires_note" }, status: 400 },
  ];
  for (const { result, status } of cases) {
    stub("decideAppeal", async () => result);
    const response = await PATCH(asModerator("/api/appeals/1", { method: "PATCH", body: { decision: "dismiss" } }));
    assert.equal(response.status, status, result.kind);
    assert.match((await responseBody(response)).error, /.+/);
  }
});

test("PATCH rejects anonymous callers with 401", async () => {
  const { PATCH } = await appealItemRoute();
  const response = await PATCH(anonymous("/api/appeals/1", { method: "PATCH", body: { decision: "dismiss" } }));
  assert.equal(response.status, 401);
});

test("PATCH answers 413 for oversized bodies and 414 for long URIs", async () => {
  stubIdentity(moderatorUser);
  const { PATCH } = await appealItemRoute();
  const oversized = await PATCH(asModerator("/api/appeals/1", {
    method: "PATCH",
    body: { decision: "dismiss", note: "x".repeat(40_000) },
  }));
  assert.equal(oversized.status, 413);

  const longUri = await PATCH(asModerator(`/api/appeals/1?${"a".repeat(5000)}`, {
    method: "PATCH",
    body: { decision: "dismiss" },
  }));
  assert.equal(longUri.status, 414);
  assert.equal(callArgs("decideAppeal").length, 0);
});

test("PATCH answers 429 past the moderation bucket", async () => {
  stubIdentity(moderatorUser);
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.MODERATION_RATE_LIMIT_MAX;
  envModule.env.MODERATION_RATE_LIMIT_MAX = "1";
  try {
    stub("getReviewerByUserId", async () => seniorReviewer);
    stub("decideAppeal", async () => ({ kind: "ok", appeal: appealFixture, event: eventFixture }));
    const { PATCH } = await appealItemRoute();
    const allowed = await PATCH(asModerator("/api/appeals/1", { method: "PATCH", body: { decision: "dismiss" } }));
    assert.equal(allowed.status, 200, "the first call fits the 1/min cap");

    const response = await PATCH(asModerator("/api/appeals/1", { method: "PATCH", body: { decision: "dismiss" } }));
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) >= 1);
    assert.equal(callArgs("decideAppeal").length, 1, "the throttled call never reaches the db layer");
  } finally {
    envModule.env.MODERATION_RATE_LIMIT_MAX = previous;
  }
});

test("PATCH answers 500 when the db layer throws unexpectedly", async () => {
  stubIdentity(moderatorUser);
  stub("getReviewerByUserId", async () => seniorReviewer);
  stub("decideAppeal", async () => {
    throw new Error("D1 binding unavailable");
  });
  const { PATCH } = await appealItemRoute();
  const response = await PATCH(asModerator("/api/appeals/1", { method: "PATCH", body: { decision: "dismiss" } }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to record the appeal decision");
});
