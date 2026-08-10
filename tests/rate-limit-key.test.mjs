// Per-key rate limiting for API-key-authenticated requests (EPIC api-keys,
// T12, plan §1.6, D8) — library-level contract for the additive per-key
// bucket.
//
// app/lib/rate-limit.ts gains:
//   - callerKeyFor(request, env, gate): the effective rate-limit key —
//     `key:<apiKeyId>` when the request authenticated with a write API key,
//     else the per-IP callerKey. The `key:` prefix keeps per-key counters in
//     the same namespace as per-IP counters without ever colliding with an IP
//     string;
//   - checkRateLimitForKeyAuth(env, bucket, request, options, gate, now): the
//     ADDITIVE per-key check to run AFTER the write gate (T11) resolves the
//     request. A key-authenticated request is fail-closed double-counted: it
//     must pass BOTH the per-IP bucket (checked before the gate, unchanged)
//     and its own `key:<id>` bucket; a block on either answers 429. Session /
//     anonymous callers have no per-key bucket — the pre-gate per-IP check is
//     the whole story, and re-checking the IP here would double-count every
//     session request.
//
// Contract pinned here:
//   1. callerKeyFor selects `key:<id>` only for api_key auth with a numeric
//      id; everything else falls back to callerKey (and never trusts a
//      spoofable X-Forwarded-For);
//   2. the per-key bucket is independent of the per-IP bucket: the same key
//      from different IPs shares one counter, different keys from the same IP
//      get separate counters;
//   3. additive fail-closed double-count: a key-authenticated request is
//      blocked when EITHER the per-IP bucket (pre-gate) or the per-key bucket
//      (post-gate) is exhausted;
//   4. session/anonymous requests are unaffected (allowed, no per-key bucket,
//      no extra IP consumption);
//   5. with a rate-limiter binding present, the per-key check sends the
//      namespaced binding key (`submit:key:<id>`);
//   6. a blocked key-auth request can be recorded with route + effective key
//      via recordRateLimitBlock (the abuse alert hashes the effective key,
//      never a raw IP or raw key).
//
// All fixtures are fictional; no personal data is used.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadLibModule } from "./helpers/api-harness.mjs";
import { resetMockState } from "./helpers/mock-state.mjs";

after(async () => cleanupRouteTree());

let rateLimit;
let abuseAlerts;

beforeEach(async () => {
  if (!rateLimit) {
    [rateLimit, abuseAlerts] = await Promise.all([
      loadLibModule("rate-limit"),
      loadLibModule("abuse-alerts"),
    ]);
  }
  rateLimit.resetRateLimitState();
  abuseAlerts.resetAbuseAlertState();
  resetMockState();
});

/** Run fn with console.error captured (fire-and-forget alert delivery). */
async function captureErrors(fn) {
  const original = console.error;
  const messages = [];
  console.error = (...args) => messages.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return messages;
}

const flushAlerts = () => abuseAlerts.flushAbuseAlertDeliveries();

function requestFrom(ip) {
  return new Request("https://osdb.test/api/cameras", {
    headers: { "cf-connecting-ip": ip },
  });
}

const API_KEY_GATE = { authMethod: "api_key", apiKeyId: 7 };
const SESSION_GATE = { authMethod: "session", apiKeyId: null };
const OPTIONS = { maxRequests: 2, windowSeconds: 60 };

// ---------------------------------------------------------------------------
// 1. callerKeyFor — effective key selection
// ---------------------------------------------------------------------------

test("callerKeyFor selects key:<id> for api_key auth and callerKey otherwise", () => {
  const request = requestFrom("203.0.113.9");

  assert.equal(rateLimit.callerKeyFor(request, {}, API_KEY_GATE), "key:7");
  // Session auth, absent gate, null gate: per-IP key.
  assert.equal(rateLimit.callerKeyFor(request, {}, SESSION_GATE), "203.0.113.9");
  assert.equal(rateLimit.callerKeyFor(request, {}), "203.0.113.9");
  assert.equal(rateLimit.callerKeyFor(request, {}, null), "203.0.113.9");
  // Fail-safe fallback: an api_key gate without a numeric id degrades to the
  // per-IP key instead of fabricating a `key:undefined` bucket.
  assert.equal(
    rateLimit.callerKeyFor(request, {}, { authMethod: "api_key", apiKeyId: null }),
    "203.0.113.9",
  );
  assert.equal(
    rateLimit.callerKeyFor(request, {}, { authMethod: "api_key" }),
    "203.0.113.9",
  );
});

test("callerKeyFor never trusts a spoofable X-Forwarded-For (QA F7)", () => {
  // Without the edge IP the forwarded hop is NOT used, even when the request
  // carries an API key — the per-IP fallback shares callerKey's fail-closed
  // doctrine: a client-controlled header must never reset a per-key counter
  // by rotating XFF on every request.
  const spoofed = new Request("https://osdb.test/api/cameras", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
  assert.equal(rateLimit.callerKeyFor(spoofed, {}, API_KEY_GATE), "key:7");
  assert.equal(rateLimit.callerKeyFor(spoofed, {}), "unknown");
  assert.equal(rateLimit.callerKeyFor(spoofed, {}, SESSION_GATE), "unknown");
});

// ---------------------------------------------------------------------------
// 2. Per-key bucket independence
// ---------------------------------------------------------------------------

test("the per-key bucket follows the key, not the IP", async () => {
  // One-request window so the second call with the same key is blocked.
  const single = { maxRequests: 1, windowSeconds: 60 };
  // Key 7 from IP A, twice: second call blocked (per-key bucket exhausted).
  const ipA = requestFrom("203.0.113.1");
  assert.equal(
    (await rateLimit.checkRateLimitForKeyAuth({}, "submit", ipA, single, API_KEY_GATE, 1_000_000_000_000)).allowed,
    true,
  );
  const blocked = await rateLimit.checkRateLimitForKeyAuth({}, "submit", ipA, single, API_KEY_GATE, 1_000_000_000_001);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.key, "key:7");
  assert.ok(blocked.retryAfterSeconds >= 1);

  // The SAME key from a DIFFERENT IP shares the exhausted counter — rotating
  // IPs cannot reset the per-key bucket.
  const ipB = requestFrom("203.0.113.2");
  const fromB = await rateLimit.checkRateLimitForKeyAuth({}, "submit", ipB, single, API_KEY_GATE, 1_000_000_000_002);
  assert.equal(fromB.allowed, false);
  assert.equal(fromB.key, "key:7");
});

test("different keys get independent per-key buckets", async () => {
  const ip = requestFrom("203.0.113.1");
  const key8 = { authMethod: "api_key", apiKeyId: 8 };
  const now = 1_000_000_000_000;

  assert.equal((await rateLimit.checkRateLimitForKeyAuth({}, "submit", ip, OPTIONS, API_KEY_GATE, now)).allowed, true);
  assert.equal((await rateLimit.checkRateLimitForKeyAuth({}, "submit", ip, OPTIONS, API_KEY_GATE, now + 1)).allowed, true);
  // Key 7 exhausted...
  assert.equal((await rateLimit.checkRateLimitForKeyAuth({}, "submit", ip, OPTIONS, API_KEY_GATE, now + 2)).allowed, false);
  // ...but key 8 from the same IP still has its own budget.
  assert.equal((await rateLimit.checkRateLimitForKeyAuth({}, "submit", ip, OPTIONS, key8, now + 3)).allowed, true);
});

// ---------------------------------------------------------------------------
// 3. Additive fail-closed double-count with the per-IP bucket
// ---------------------------------------------------------------------------

test("key auth does not consume the per-IP bucket in the additive check", async () => {
  // The route checks the per-IP bucket BEFORE the gate; checkRateLimitForKeyAuth
  // runs after the gate and must NOT spend the IP bucket again (that would
  // halve the effective per-IP budget for key-authenticated callers).
  const ip = requestFrom("203.0.113.1");
  const env = {};
  const now = 1_000_000_000_000;

  assert.equal((await rateLimit.checkRateLimitForKeyAuth(env, "submit", ip, OPTIONS, API_KEY_GATE, now)).allowed, true);
  // The per-IP bucket is untouched by the additive call: a fresh key from the
  // same IP still passes.
  const key9 = { authMethod: "api_key", apiKeyId: 9 };
  assert.equal((await rateLimit.checkRateLimitForKeyAuth(env, "submit", ip, OPTIONS, key9, now + 1)).allowed, true);
  // And the IP bucket itself still has its full budget for the route's own
  // pre-gate check.
  assert.equal((await rateLimit.checkRateLimit(env, "submit", "203.0.113.1", OPTIONS, now + 2)).allowed, true);
});

test("fail-closed double-count: per-IP exhaustion blocks a fresh key", async () => {
  // Simulate the route: pre-gate per-IP check consumes the IP bucket, then a
  // key-authenticated request arrives. The additive per-key check alone would
  // allow it (fresh key), but the pre-gate per-IP check already answered 429
  // — the request is blocked by the IP bucket, never reaching the key check.
  const env = {};
  const now = 1_000_000_000_000;
  const ipKey = "203.0.113.7";

  // Exhaust the per-IP bucket for this caller.
  assert.equal((await rateLimit.checkRateLimit(env, "submit", ipKey, OPTIONS, now)).allowed, true);
  assert.equal((await rateLimit.checkRateLimit(env, "submit", ipKey, OPTIONS, now + 1)).allowed, true);
  const ipBlocked = await rateLimit.checkRateLimit(env, "submit", ipKey, OPTIONS, now + 2);
  assert.equal(ipBlocked.allowed, false);

  // A key-authenticated request from the same IP with a fresh key is still
  // blocked on the per-IP bucket (the additive key check never runs).
  const keyRequest = requestFrom(ipKey);
  assert.equal(
    (await rateLimit.checkRateLimitForKeyAuth(env, "submit", keyRequest, OPTIONS, { authMethod: "api_key", apiKeyId: 99 }, now + 3)).allowed,
    true,
    "the key bucket itself is fresh",
  );
});

test("fail-closed double-count: per-key exhaustion blocks even on a fresh IP", async () => {
  // The mirror case: the key bucket is exhausted, so a request from a brand
  // new IP with the same key is blocked by the additive check.
  const env = {};
  const now = 1_000_000_000_000;
  const single = { maxRequests: 1, windowSeconds: 60 };

  assert.equal((await rateLimit.checkRateLimitForKeyAuth(env, "submit", requestFrom("203.0.113.1"), single, API_KEY_GATE, now)).allowed, true);
  const blocked = await rateLimit.checkRateLimitForKeyAuth(env, "submit", requestFrom("203.0.113.99"), single, API_KEY_GATE, now + 1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.key, "key:7");
});

// ---------------------------------------------------------------------------
// 4. Session/anonymous callers are unaffected
// ---------------------------------------------------------------------------

test("session and anonymous callers get allowed from the additive check", async () => {
  const env = {};
  const now = 1_000_000_000_000;
  const ip = requestFrom("203.0.113.1");

  for (const gate of [SESSION_GATE, null, undefined]) {
    const decision = await rateLimit.checkRateLimitForKeyAuth(env, "submit", ip, OPTIONS, gate, now);
    assert.equal(decision.allowed, true);
    assert.equal(decision.key, "203.0.113.1", "the effective key is the per-IP key");
  }
});

// ---------------------------------------------------------------------------
// 5. Binding backend: namespaced per-key key
// ---------------------------------------------------------------------------

test("the per-key check sends the namespaced binding key when a binding exists", async () => {
  const calls = [];
  const env = {
    WRITE_LIMITER: {
      limit: async ({ key }) => {
        calls.push(key);
        return { success: true };
      },
    },
  };
  const decision = await rateLimit.checkRateLimitForKeyAuth(env, "submit", requestFrom("203.0.113.1"), OPTIONS, API_KEY_GATE, 1_000_000_000_000);
  assert.equal(decision.allowed, true);
  assert.deepEqual(calls, ["submit:key:7"], "the binding key is namespaced per family and per key");
});

// ---------------------------------------------------------------------------
// 6. recordRateLimitBlock with route + effective key
// ---------------------------------------------------------------------------

test("a key-auth block records route + effective key via recordRateLimitBlock", async () => {
  const env = { ABUSE_ALERT_THRESHOLD: "1", ABUSE_ALERT_SURGE_THRESHOLD: "1000" };
  const now = 1_000_000_000_000;
  const single = { maxRequests: 1, windowSeconds: 60 };

  // Exhaust the per-key bucket, then trip it.
  assert.equal((await rateLimit.checkRateLimitForKeyAuth(env, "submit", requestFrom("203.0.113.1"), single, API_KEY_GATE, now)).allowed, true);
  const blocked = await rateLimit.checkRateLimitForKeyAuth(env, "submit", requestFrom("203.0.113.1"), single, API_KEY_GATE, now + 1);
  assert.equal(blocked.allowed, false);

  // Record the block with route + the effective key the helper returned.
  const messages = await captureErrors(async () => {
    abuseAlerts.recordRateLimitBlock(env, {
      route: "/api/cameras",
      key: blocked.key,
      windowSeconds: single.windowSeconds,
    });
    await flushAlerts();
  });
  assert.equal(messages.length, 1);
  const payload = JSON.parse(messages[0][1]);
  assert.equal(payload.event, "rate_limited");
  assert.equal(payload.route, "/api/cameras");
  // The alert carries a SHA-256 of the EFFECTIVE key (key:7), never the raw
  // key string or the caller IP.
  assert.equal(payload.callerHash, await abuseAlerts.sha256Hex("key:7"));
  assert.ok(!JSON.stringify(payload).includes("key:7"), "no raw effective key in the alert");
  assert.ok(!JSON.stringify(payload).includes("203.0.113"), "no raw IP in the alert");
});
