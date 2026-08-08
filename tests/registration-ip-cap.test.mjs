// Per-IP registration cap (P3-4, CEO decision t_0941036b — anti account-farm).
//
// Contract pinned here, end to end (real routes + real db modules + real
// Drizzle migrations on a fresh in-memory D1):
//
//   1. max 5 registration ATTEMPTS per caller IP in a rolling 24h window;
//      the request that brings the count to the cap answers 429 with the
//      generic anti-enumeration body + Retry-After (no email/IP echo);
//   2. the reservation row of a BLOCKED attempt stays (it must keep
//      counting), so the 6th request is blocked too ("4 ok, 5a 429, 6a 429");
//   3. the cap is per-IP: a different caller IP can still register;
//   4. only the SHA-256 of the caller key is stored — never the raw IP
//      (privacy by design);
//   5. FAILED registrations (400/409/500) roll back their reservation: junk
//      attempts never consume the per-IP budget, and the malformed-body
//      "no write" contract of malformed-json-routes.test.mjs still holds;
//   6. the 24h window is rolling: attempts older than the window stop
//      counting, so the cap resets automatically ("reset dopo 24h");
//   7. REGISTER_IP_RATE_LIMIT_MAX / _WINDOW_SECONDS env knobs are honoured.
//
// The in-memory auth bucket (10/min) is deliberately NOT the thing under
// test here — that stays covered by api-auth.test.mjs / rate-limit-routes.
// The state quota must hold across worker isolates, which is why it lives in
// D1 (registrations_ip_log), not in the isolate's memory.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, responseBody } from "./helpers/api-harness.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { cleanupE2ETree, e2eEnv, loadE2EModule, loadE2ERoute } from "./helpers/e2e-harness.mjs";

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const IP_A = "203.0.113.42";
const IP_B = "198.51.100.7";
const PASSWORD = "Correct-Horse-Battery1";

let env;
let registerRoute;
let authModule;
let rateLimitModule;

// One registration attempt from `ip` with a guaranteed-unique email. The
// caller key arrives via cf-connecting-ip exactly like the real edge (the
// same header the lockout E2E uses).
function registerAttempt(ip, tag) {
  return registerRoute.POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      headers: { "cf-connecting-ip": ip },
      body: {
        email: `cap-${tag}-${crypto.randomUUID()}@example.org`,
        password: PASSWORD,
        displayName: "Cap Test",
      },
    }),
  );
}

// A syntactically invalid payload: reaches the route but must fail 400.
function malformedAttempt(ip) {
  return registerRoute.POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      headers: { "cf-connecting-ip": ip },
      body: { email: "not-an-email", password: "short" },
    }),
  );
}

// Count rows in EVERY table: the complete no-write proof (same helper as the
// malformed-JSON suite).
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

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  // Cap knobs are per-test: wipe leftovers so a previous test's overrides
  // never bleed into the next one (same pattern as the lockout knobs).
  delete env.REGISTER_IP_RATE_LIMIT_MAX;
  delete env.REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS;
  registerRoute = await loadE2ERoute("app/api/auth/register/route.mjs");
  authModule = await loadE2EModule("db/auth.mjs");
  // The in-memory `auth` bucket (10/min per caller) is NOT the thing under
  // test here, but it shares the caller key with the IP cap: without a reset
  // it would accumulate across tests and answer 429 for every later caller,
  // hiding the D1 cap entirely (same reset api-auth.test.mjs performs).
  if (!rateLimitModule) rateLimitModule = await loadE2EModule("app/lib/rate-limit.mjs");
  rateLimitModule.resetRateLimitState();
});

after(async () => {
  await cleanupE2ETree();
  await cleanupDbRuntime();
});

// ---------------------------------------------------------------------------
// 1. The cap: 4 ok, 5th 429, 6th 429 (generic body + Retry-After)
// ---------------------------------------------------------------------------

test("E2E: 4 registrations from one IP succeed; the 5th and 6th answer 429 with the generic body and Retry-After", async () => {
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    statuses.push(await registerAttempt(IP_A, `seq-${i}`));
  }

  assert.deepEqual(
    statuses.map((response) => response.status),
    [201, 201, 201, 201, 429, 429],
    "4 ok, 5a 429, 6a 429",
  );

  const blocked = statuses[4];
  const blockedBody = await responseBody(blocked);
  assert.equal(
    blockedBody.error,
    "Too many requests. Please try again shortly.",
    "the 429 body is the generic anti-enumeration one",
  );
  assert.equal(
    blocked.headers.get("Retry-After"),
    "86400",
    "Retry-After mirrors the default 24h window",
  );
  assert.ok(
    !JSON.stringify(blockedBody).includes(IP_A),
    "the 429 body must never echo the raw IP",
  );

  // The 5th's reservation row STAYS (a blocked attempt is a real attempt),
  // so the 6th is blocked too — and every attempt is logged.
  const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM registrations_ip_log").first();
  assert.equal(Number(rows.n), 6, "every attempt (allowed and blocked) is logged");
});

// ---------------------------------------------------------------------------
// 2. Per-IP scope
// ---------------------------------------------------------------------------

test("E2E: the cap is per-IP — a different caller IP can still register after the first is blocked", async () => {
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await registerAttempt(IP_A, `a-${i}`)).status, i < 4 ? 201 : 429);
  }
  assert.equal((await registerAttempt(IP_B, "b-0")).status, 201, "a second IP is untouched");
});

// ---------------------------------------------------------------------------
// 3. Privacy by design: hash-only storage
// ---------------------------------------------------------------------------

test("E2E: only a non-invertible hash of the caller IP is stored — never the raw address", async () => {
  await registerAttempt(IP_A, "p-0");
  await registerAttempt(IP_A, "p-1");

  const rows = await env.DB.prepare(
    "SELECT ip_hash AS ipHash, created_at AS createdAt FROM registrations_ip_log",
  ).all();
  assert.equal(rows.results.length, 2);

  const serialized = JSON.stringify(rows.results);
  assert.ok(!serialized.includes(IP_A), "no raw IP in the table");

  // QA#3 F4: the stored key is `registrationIpHash` — with no
  // REGISTRATION_IP_HMAC_KEY in the test env this is the truncated
  // SHA-256 fallback (128 bits = 32 hex chars), never a raw IP and never
  // an invertible full digest. Production sets the HMAC key (deploy
  // checklist), which makes the value uncomputable offline.
  const hashA = (await authModule.sha256Hex(IP_A)).slice(0, 32);
  const hashB = (await authModule.sha256Hex(IP_B)).slice(0, 32);
  for (const row of rows.results) {
    assert.match(row.ipHash, /^[0-9a-f]{32}$/, "the stored key is a 128-bit (32 hex) non-invertible digest");
    assert.equal(row.ipHash, hashA, "both attempts from the same IP share one key");
  }
  assert.notEqual(hashA, hashB, "a different IP hashes to a different key");
});

// ---------------------------------------------------------------------------
// 4. Failed attempts roll back — junk never consumes the budget
// ---------------------------------------------------------------------------

test("E2E: failed registrations roll back their reservation — junk attempts never consume the per-IP budget", async () => {
  // Four invalid payloads: 400 each and zero rows left behind.
  for (let i = 0; i < 4; i += 1) {
    assert.equal((await malformedAttempt(IP_A)).status, 400);
  }
  const afterJunk = await env.DB.prepare("SELECT COUNT(*) AS n FROM registrations_ip_log").first();
  assert.equal(Number(afterJunk.n), 0, "failed attempts must roll back their reservation row");

  // The budget is intact: four valid registrations still succeed, the 5th is
  // blocked — exactly as if the junk had never happened.
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await registerAttempt(IP_A, `post-${i}`)).status, i < 4 ? 201 : 429);
  }
});

// ---------------------------------------------------------------------------
// 5. The malformed-body no-write contract is preserved
// ---------------------------------------------------------------------------

test("E2E: a malformed JSON body answers 400 and writes nothing to any table", async () => {
  const before = await dbSnapshot();
  const response = await registerRoute.POST(
    apiRequest("/api/auth/register", {
      method: "POST",
      headers: { "cf-connecting-ip": IP_A },
      body: '{"email": broken',
    }),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error, "Request body is not valid JSON.");
  assert.deepEqual(await dbSnapshot(), before, "no table row may change for a malformed body");
});

// ---------------------------------------------------------------------------
// 6. Rolling window: reset after 24h
// ---------------------------------------------------------------------------

test("E2E: the 24h window is rolling — attempts older than the window stop counting", async () => {
  // Default cap: 4 ok, 5th blocked.
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await registerAttempt(IP_A, `w-${i}`)).status, i < 4 ? 201 : 429);
  }

  // Backdate every reservation row beyond the window: the COUNT must drop to
  // zero, so the cap resets (deterministic, no sleeping).
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE registrations_ip_log SET created_at = ?").bind(stale).run();

  assert.equal(
    (await registerAttempt(IP_A, "reset-0")).status,
    201,
    "after the window rolls, registration is allowed again",
  );

  // The new attempt anchors a fresh window: 3 more succeed, then the cap
  // trips again on the 5th in-window attempt.
  for (let i = 1; i < 4; i += 1) {
    assert.equal((await registerAttempt(IP_A, `reset-${i}`)).status, 201);
  }
  assert.equal((await registerAttempt(IP_A, "reset-4")).status, 429);
});

// ---------------------------------------------------------------------------
// 7. Env knobs
// ---------------------------------------------------------------------------

test("E2E: the cap honours the REGISTER_IP_RATE_LIMIT_MAX override", async () => {
  // maxRequests = 2 → the 1st attempt is allowed (count 1 < 2), the 2nd and
  // 3rd are blocked (count 2 >= 2, count 3 >= 2) — same "N-th request that
  // reaches the cap is blocked" semantics as the default (5th of 5).
  env.REGISTER_IP_RATE_LIMIT_MAX = "2";
  assert.equal((await registerAttempt(IP_A, "o-0")).status, 201);
  assert.equal((await registerAttempt(IP_A, "o-1")).status, 429);
  assert.equal((await registerAttempt(IP_A, "o-2")).status, 429);
});

test("E2E: the cap honours the REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS override", async () => {
  // 5 requests allowed, but with a 1-hour window; a row backdated 2 hours is
  // already out of the window, so it must not count against a fresh request.
  env.REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS = "3600";
  await registerAttempt(IP_A, "tw-0");
  const stale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE registrations_ip_log SET created_at = ?").bind(stale).run();
  assert.equal(
    (await registerAttempt(IP_A, "tw-1")).status,
    201,
    "a row older than the overridden window does not count",
  );
});
