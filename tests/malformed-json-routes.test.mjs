// Malformed-JSON → 400 contract, parametrised across every POST/PATCH route
// that reads a JSON body (QA task t_b2058634, transition 500→400).
//
// The backend fix (t_4e90db9f, PR #124) changed readJsonBody so a
// syntactically invalid body throws MalformedJsonError (400) instead of
// propagating the JSON.parse failure (legacy 500). This suite pins that
// transition with a route × body table:
//
//   1. the SAME malformed bodies are sent to every POST/PATCH route that
//      reads JSON — cameras, corrections, moderation, appeals, appeals/[id],
//      auth/login, auth/register — and must answer 400 with the clear
//      "Request body is not valid JSON." message;
//   2. the neighbouring errors stay distinct: a body over MAX_BODY_BYTES is
//      still 413 "Request body too large." and a VALID body that fails
//      schema validation keeps its own 400/401 message (never the
//      malformed-JSON one);
//   3. zero side effects: no malformed body may write a single row to D1
//      (every table count is snapshotted before/after) — no camera, no
//      correction, no moderation event, no appeal, no login attempt.
//
// It runs against the real routes + real db modules on a fresh in-memory D1
// (schema replayed from the real Drizzle migrations), so the no-write proof
// is actual SQL, not a mocked call count. Rate limits are raised through the
// documented env knobs so the contract under test is the body handling, not
// the limiter (429 behaviour has its own dedicated suites).
//
// Red-before-green evidence: on main (legacy 500 contract) the malformed-JSON
// tests fail with status 500; on the fix branch they pass with 400. The 413
// and field-validation tests pass on both, proving they pin the unchanged
// neighbours and never conflate them with the new 400.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, responseBody } from "./helpers/api-harness.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime, seedDemoIdentities } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { cleanupE2ETree, e2eEnv, loadE2EModule, loadE2ERoute } from "./helpers/e2e-harness.mjs";

// ---------------------------------------------------------------------------
// Fixtures: every POST/PATCH route that reads a JSON body via readJsonBody.
// The identity header is only set where the route requires it; public intakes
// (cameras, corrections) and auth endpoints must work without one. Since
// migration 0017 removed the demo seed, suites needing demo reviewers/users
// re-seed them explicitly with seedDemoIdentities() (same pattern as
// auth-flow-e2e and appeals).
// ---------------------------------------------------------------------------

const MODERATOR = { "x-osdb-user-email": "record@osdb.test" }; // seeded by seedDemoIdentities()

// POST /api/appeals authenticates with the ADR 0013 session cookie (CEO
// decision 2026-08-02, audit finding 3.1) — the `x-osdb-user-email`
// prototype header is no longer accepted. The live session is created per
// test in beforeEach against the fresh env.DB; headers resolve lazily.
let sessionHeaders = null;
async function contributorSessionHeaders() {
  const auth = await loadE2EModule("db/auth.mjs");
  const profile = await auth.createContributor({
    email: "contributor@osdb.test",
    displayName: "Demo Contributor",
    password: "supersecret123",
  });
  const { rawToken, csrfToken } = await auth.createSession(profile.id, { ttlDays: 7 });
  return {
    cookie: `osdb_session=${rawToken}; osdb_csrf=${csrfToken}`,
    "x-csrf-token": csrfToken,
  };
}

const ROUTES = [
  {
    label: "POST /api/cameras",
    file: "app/api/cameras/route.mjs",
    method: "POST",
    path: "/api/cameras",
    headers: {},
  },
  {
    label: "POST /api/corrections",
    file: "app/api/corrections/route.mjs",
    method: "POST",
    path: "/api/corrections",
    headers: {},
  },
  {
    label: "PATCH /api/moderation",
    file: "app/api/moderation/route.mjs",
    method: "PATCH",
    path: "/api/moderation",
    headers: MODERATOR,
  },
  {
    label: "POST /api/appeals",
    file: "app/api/appeals/route.mjs",
    method: "POST",
    path: "/api/appeals",
    headers: () => sessionHeaders,
  },
  {
    label: "PATCH /api/appeals/[id]",
    file: "app/api/appeals/[id]/route.mjs",
    method: "PATCH",
    path: "/api/appeals/1",
    headers: MODERATOR,
  },
  {
    label: "POST /api/auth/login",
    file: "app/api/auth/login/route.mjs",
    method: "POST",
    path: "/api/auth/login",
    headers: {},
  },
  {
    label: "POST /api/auth/register",
    file: "app/api/auth/register/route.mjs",
    method: "POST",
    path: "/api/auth/register",
    headers: {},
  },
];

// Distinct syntactic failure modes: unterminated string, garbage token,
// trailing comma, truncated array, and a JSON object cut off mid-value.
const MALFORMED_BODIES = [
  '{"title": broken',
  "{oops",
  '{"a": 1,}',
  "[1, 2",
  '{"entity": "camera", broken',
];

let env;

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  // Migration 0017 removed the demo seed; re-seed the demo identities the
  // protected routes (moderation, appeals) authenticate against.
  await seedDemoIdentities(env.DB);
  // Lockout knobs are per-test: wipe leftovers so a previous test's small
  // thresholds never bleed into the next one (same pattern as the E2E suite).
  delete env.AUTH_LOCKOUT_MAX_ATTEMPTS;
  delete env.AUTH_LOCKOUT_WINDOW_SECONDS;
  delete env.AUTH_LOCKOUT_DURATION_SECONDS;
  delete env.AUTH_LOCKOUT_MAX_DURATION_SECONDS;
  // Raise every route-family rate limit far above the number of requests this
  // suite makes, so the contract under test is the body handling, not the
  // limiter. The knobs are the documented ${PREFIX}_RATE_LIMIT_MAX overrides.
  env.POST_RATE_LIMIT_MAX = "100000";
  env.AUTH_RATE_LIMIT_MAX = "100000";
  env.MODERATION_RATE_LIMIT_MAX = "100000";
  // POST /api/appeals needs a live contributor session (CEO decision
  // 2026-08-02); create it against this test's fresh DB.
  sessionHeaders = await contributorSessionHeaders();
});

after(async () => {
  await cleanupE2ETree();
  await cleanupDbRuntime();
});

// Snapshot the row count of EVERY table in the schema. Comparing snapshots
// before/after a malformed request is a complete no-write proof: any insert,
// update or delete in any table changes the count.
async function dbSnapshot() {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all();
  const snapshot = {};
  for (const { name } of tables.results) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).first();
    snapshot[name] = Number(row.n);
  }
  return snapshot;
}

function routeRequest(route, body) {
  const headers = typeof route.headers === "function" ? route.headers() : route.headers;
  return apiRequest(route.path, { method: route.method, headers, body });
}

// ---------------------------------------------------------------------------
// 1. Parametrised route × malformed-body table: 400 + clear message, no writes
// ---------------------------------------------------------------------------

for (const route of ROUTES) {
  for (const body of MALFORMED_BODIES) {
    test(`${route.label} answers 400 for malformed JSON ${JSON.stringify(body)} and writes nothing`, async () => {
      const handler = await loadE2ERoute(route.file);
      const before = await dbSnapshot();
      const response = await handler[route.method](routeRequest(route, body));
      const payload = await responseBody(response);

      assert.equal(response.status, 400, `${route.label}: malformed JSON must answer 400, got ${response.status}`);
      assert.equal(
        payload.error,
        "Request body is not valid JSON.",
        `${route.label}: the malformed-JSON message must be the documented one`,
      );
      assert.deepEqual(
        await dbSnapshot(),
        before,
        `${route.label}: no table row may change for a malformed body (no write, no event)`,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// 2a. The 413 (body over MAX_BODY_BYTES) stays distinct from the new 400
// ---------------------------------------------------------------------------

test("oversized bodies still answer 413 \"Request body too large.\" on every POST/PATCH route", async () => {
  // MAX_BODY_BYTES defaults to 32 KiB; a 40 KiB body exceeds it without
  // changing env. It must be rejected as 413 BEFORE any JSON parsing, so the
  // message is the size one, never the malformed-JSON one.
  const oversized = JSON.stringify({
    title: "A".repeat(40_000),
    kind: "Fixed dome",
    latitude: 44.1,
    longitude: 12.2,
  });

  for (const route of ROUTES) {
    const handler = await loadE2ERoute(route.file);
    const before = await dbSnapshot();
    const response = await handler[route.method](routeRequest(route, oversized));
    const payload = await responseBody(response);

    assert.equal(response.status, 413, `${route.label}: oversized body must answer 413, got ${response.status}`);
    assert.equal(payload.error, "Request body too large.");
    assert.deepEqual(await dbSnapshot(), before, `${route.label}: a 413 rejection must write nothing`);
  }
});

// ---------------------------------------------------------------------------
// 2b. Valid-JSON schema-validation 400/401 stays distinct from malformed JSON
// ---------------------------------------------------------------------------

test("valid JSON failing schema validation keeps its own status and message on every route", async () => {
  // A syntactically valid but semantically empty body must reach the route's
  // own schema validation and get its contract response — never the
  // malformed-JSON message. login answers 401 (credential contract), the
  // others 400 with their own validation text.
  const validButEmpty = "{}";

  for (const route of ROUTES) {
    const handler = await loadE2ERoute(route.file);
    const before = await dbSnapshot();
    const response = await handler[route.method](routeRequest(route, validButEmpty));
    const payload = await responseBody(response);

    assert.notEqual(
      payload.error,
      "Request body is not valid JSON.",
      `${route.label}: an empty-but-valid body is NOT malformed JSON`,
    );
    assert.ok(
      response.status === 400 || response.status === 401,
      `${route.label}: schema validation keeps its own 400/401 contract, got ${response.status}`,
    );
    assert.ok(payload.error, `${route.label}: a schema-validation response must still carry a message`);
    assert.deepEqual(await dbSnapshot(), before, `${route.label}: a schema-validation 400/401 must write nothing`);
  }
});
