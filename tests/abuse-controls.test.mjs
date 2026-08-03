// Runtime tests for the abuse-control layer (Wave B, Operations):
//   - app/lib/rate-limit.ts    per-route sliding-window limiter
//   - app/lib/input-limits.ts  body/URL size caps
//   - app/lib/abuse-alerts.ts  hashed caller alerts + route surge alerts
// The lib modules are pure ESM with no Workers bindings; they are
// transpiled into the shared harness tree and imported directly.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, loadTreeModule } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

after(async () => cleanupRouteTree());

let rateLimit;
let abuseAlerts;
let inputLimits;
let originalFetch;

beforeEach(async () => {
  if (!rateLimit) {
    [rateLimit, abuseAlerts, inputLimits] = await Promise.all([
      loadLibModule("rate-limit"),
      loadLibModule("abuse-alerts"),
      loadLibModule("input-limits"),
    ]);
  }
  rateLimit.resetRateLimitState();
  abuseAlerts.resetAbuseAlertState();
  resetMockState();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Run fn with console.error captured so fire-and-forget alert delivery can be
// asserted without a real webhook.
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

// Give the fire-and-forget alert delivery a chance to complete. Deterministic:
// awaits every in-flight delivery instead of an arbitrary sleep, so alert-count
// assertions cannot race with SHA-256 hashing + console.error on a loaded CI
// runner.
const flushAlerts = () => abuseAlerts.flushAbuseAlertDeliveries();

// ---------------------------------------------------------------------------
// rate-limit.ts
// ---------------------------------------------------------------------------

test("each route family gets an independent sliding window", async () => {
  const readOptions = { maxRequests: 2, windowSeconds: 60 };
  const submitOptions = { maxRequests: 1, windowSeconds: 60 };
  const now = 1_000_000_000_000;
  // No rate-limiter bindings in the env: the in-memory fallback runs.
  const noBindings = {};

  assert.equal((await rateLimit.checkRateLimit(noBindings, "read", "203.0.113.9", readOptions, now)).allowed, true);
  assert.equal((await rateLimit.checkRateLimit(noBindings, "read", "203.0.113.9", readOptions, now + 1)).allowed, true);
  const blocked = await rateLimit.checkRateLimit(noBindings, "read", "203.0.113.9", readOptions, now + 2);
  assert.equal(blocked.allowed, false);
  assert.ok(
    blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 61,
    `retry window must be 1..61s, got ${blocked.retryAfterSeconds}`,
  );

  // A different caller is unaffected, and so is a different bucket for the
  // same caller.
  assert.equal((await rateLimit.checkRateLimit(noBindings, "read", "203.0.113.10", readOptions, now + 2)).allowed, true);
  assert.equal((await rateLimit.checkRateLimit(noBindings, "submit", "203.0.113.9", submitOptions, now + 2)).allowed, true);

  // The window slides: old timestamps drop out.
  assert.equal((await rateLimit.checkRateLimit(noBindings, "read", "203.0.113.9", readOptions, now + 61_000)).allowed, true);
});

test("environment overrides tune the per-route limits", () => {
  assert.deepEqual(
    rateLimit.limitsFor("read", { READ_RATE_LIMIT_MAX: "7", READ_RATE_LIMIT_WINDOW_SECONDS: "30" }),
    { maxRequests: 7, windowSeconds: 30 },
  );
  assert.deepEqual(rateLimit.limitsFor("submit", { POST_RATE_LIMIT_MAX: "3" }), {
    maxRequests: 3,
    windowSeconds: 60,
  });
  assert.deepEqual(rateLimit.limitsFor("export", {}), { maxRequests: 10, windowSeconds: 60 });
  assert.deepEqual(rateLimit.limitsFor("nearby", {}), { maxRequests: 30, windowSeconds: 60 });
  assert.deepEqual(rateLimit.limitsFor("revisions", {}), { maxRequests: 30, windowSeconds: 60 });
  assert.deepEqual(rateLimit.limitsFor("moderate", {}), { maxRequests: 30, windowSeconds: 60 });
  // Appeals get their own conservative default and env knobs, independent of
  // the moderation bucket (filing/review is a distinct caller population).
  assert.deepEqual(rateLimit.limitsFor("appeal", {}), { maxRequests: 20, windowSeconds: 60 });
  assert.deepEqual(
    rateLimit.limitsFor("appeal", { APPEAL_RATE_LIMIT_MAX: "7", APPEAL_RATE_LIMIT_WINDOW_SECONDS: "30" }),
    { maxRequests: 7, windowSeconds: 30 },
  );
  // The tile proxy gets its own conservative default and env knobs.
  assert.deepEqual(rateLimit.limitsFor("tiles", {}), { maxRequests: 60, windowSeconds: 60 });
  assert.deepEqual(
    rateLimit.limitsFor("tiles", { TILES_RATE_LIMIT_MAX: "120", TILES_RATE_LIMIT_WINDOW_SECONDS: "30" }),
    { maxRequests: 120, windowSeconds: 30 },
  );
  // Invalid or missing overrides fall back to the defaults.
  assert.deepEqual(
    rateLimit.limitsFor("read", { READ_RATE_LIMIT_MAX: "-3", READ_RATE_LIMIT_WINDOW_SECONDS: "0" }),
    { maxRequests: 60, windowSeconds: 60 },
  );
  assert.equal(rateLimit.submissionLimits({ POST_RATE_LIMIT_MAX: "4" }).maxRequests, 4);
  assert.equal(rateLimit.submissionsDisabled({ POST_SUBMISSIONS_DISABLED: "true" }), true);
  assert.equal(rateLimit.submissionsDisabled({}), false);
  // The per-appellant appeal threshold (P3 appeal-ownership) defaults to
  // 5 appeals / 24h and honours its own env knobs.
  assert.deepEqual(rateLimit.appealAppellantLimits({}), { maxRequests: 5, windowSeconds: 86400 });
  assert.deepEqual(
    rateLimit.appealAppellantLimits({ APPEAL_APPELLANT_RATE_LIMIT_MAX: "2", APPEAL_APPELLANT_RATE_LIMIT_WINDOW_SECONDS: "3600" }),
    { maxRequests: 2, windowSeconds: 3600 },
  );
  assert.deepEqual(
    rateLimit.appealAppellantLimits({ APPEAL_APPELLANT_RATE_LIMIT_MAX: "-1", APPEAL_APPELLANT_RATE_LIMIT_WINDOW_SECONDS: "0" }),
    { maxRequests: 5, windowSeconds: 86400 },
  );
});

test("the caller key prefers the edge IP over forwarded hops", () => {
  const request = new Request("https://osdb.test/api/cameras", {
    headers: { "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
  assert.equal(rateLimit.callerKey(request), "198.51.100.4");
  const forwardedOnly = new Request("https://osdb.test/api/cameras", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
  assert.equal(rateLimit.callerKey(forwardedOnly), "203.0.113.9");
  assert.equal(rateLimit.callerKey(new Request("https://osdb.test/api/cameras")), "unknown");
});

// ---------------------------------------------------------------------------
// input-limits.ts
// ---------------------------------------------------------------------------

test("readJsonBody enforces the byte cap and urlTooLong guards the URI", async () => {
  // Content-Length over the cap → 413 before any read.
  const byLength = apiRequest("/api/cameras", {
    method: "POST",
    headers: { "content-length": "50000" },
    body: "{}",
  });
  await assert.rejects(
    () => inputLimits.readJsonBody(byLength, {}),
    (error) => {
      assert.ok(error instanceof inputLimits.PayloadTooLargeError);
      assert.equal(error.status, 413);
      return true;
    },
  );

  // Measured size over the default 32 KiB cap → 413.
  const bySize = apiRequest("/api/cameras", { method: "POST", body: "x".repeat(40 * 1024) });
  await assert.rejects(() => inputLimits.readJsonBody(bySize, {}), inputLimits.PayloadTooLargeError);

  // A configured cap is honoured.
  const smallEnv = { MAX_BODY_BYTES: "10" };
  const tooBigForEnv = apiRequest("/api/cameras", { method: "POST", body: "12345678901" });
  await assert.rejects(
    () => inputLimits.readJsonBody(tooBigForEnv, smallEnv),
    inputLimits.PayloadTooLargeError,
  );

  // Valid JSON passes through and is parsed.
  const ok = apiRequest("/api/cameras", { method: "POST", body: { title: "Cam" } });
  assert.deepEqual(await inputLimits.readJsonBody(ok, {}), { title: "Cam" });

  // URL length guards.
  assert.equal(inputLimits.urlTooLong(apiRequest("/api/cameras")), false);
  assert.equal(inputLimits.urlTooLong(new Request(`https://osdb.test/${"a".repeat(5000)}`)), true);
});

// ---------------------------------------------------------------------------
// abuse-alerts.ts
// ---------------------------------------------------------------------------

test("rate-limit blocks raise hashed, cooldown-bounded alerts", async () => {
  const env = { ABUSE_ALERT_THRESHOLD: "2", ABUSE_ALERT_SURGE_THRESHOLD: "1000" };
  const key = "203.0.113.7";
  const route = "/api/cameras";

  const messages = await captureErrors(async () => {
    abuseAlerts.recordRateLimitBlock(env, { route, key, windowSeconds: 60 });
    abuseAlerts.recordRateLimitBlock(env, { route, key, windowSeconds: 60 });
    await flushAlerts();
  });
  assert.equal(messages.length, 1, "exactly one alert fires when the per-caller threshold is crossed");
  const [label, serialized] = messages[0];
  assert.equal(label, "[abuse-alert]");
  const payload = JSON.parse(serialized);
  assert.equal(payload.source, "open-surveillance-db");
  assert.equal(payload.event, "rate_limited");
  assert.equal(payload.route, route);
  assert.match(payload.callerHash, /^[0-9a-f]{64}$/, "the caller must be identified only by a SHA-256 hash");
  assert.ok(!serialized.includes(key), "the alert must never carry the raw caller key");
  assert.ok(!serialized.includes("203.0.113"), "no part of the raw IP may leak into an alert");
  assert.equal(payload.count, 2);
  assert.equal(payload.windowSeconds, 60);

  // The default 300s cooldown suppresses further alerts for the same caller.
  const later = await captureErrors(async () => {
    abuseAlerts.recordRateLimitBlock(env, { route, key, windowSeconds: 60 });
    abuseAlerts.recordRateLimitBlock(env, { route, key, windowSeconds: 60 });
    await flushAlerts();
  });
  assert.equal(later.length, 0, "no alert within the cooldown window");
});

test("payload-too-large events and route surges alert separately", async () => {
  const env = { ABUSE_ALERT_THRESHOLD: "100", ABUSE_ALERT_SURGE_THRESHOLD: "3" };
  const messages = await captureErrors(async () => {
    for (const caller of ["203.0.113.1", "203.0.113.2", "203.0.113.3"]) {
      abuseAlerts.recordAbuseEvent(env, {
        event: "payload_too_large",
        route: "/api/corrections",
        key: caller,
        windowSeconds: 60,
      });
    }
    await flushAlerts();
  });

  const alerts = messages.map(([, serialized]) => JSON.parse(serialized));
  assert.equal(alerts.length, 1, "only the route surge crosses its threshold here");
  assert.equal(alerts[0].event, "payload_too_large");
  assert.equal(alerts[0].route, "/api/corrections");
  assert.equal(alerts[0].count, 3);
  assert.match(alerts[0].detail, /across all callers/);
  // The aggregate alert is keyed on a stable hash of the sentinel, not on any
  // single caller's identity.
  assert.equal(alerts[0].callerHash, await abuseAlerts.sha256Hex("aggregate"));
});

test("abuse-alert state is observable and resettable", async () => {
  const env = { ABUSE_ALERT_THRESHOLD: "50", ABUSE_ALERT_SURGE_THRESHOLD: "50" };
  abuseAlerts.recordRateLimitBlock(env, { route: "/api/cameras", key: "198.51.100.1", windowSeconds: 60 });
  const state = abuseAlerts.getAbuseAlertState();
  assert.equal(state.trackedCallers, 1);
  assert.equal(state.trackedRoutes, 1);
  abuseAlerts.resetAbuseAlertState();
  assert.equal(abuseAlerts.getAbuseAlertState().trackedCallers, 0);
});

// ---------------------------------------------------------------------------
// Route-level 429 enforcement (Wave B follow-up: public binary routes)
// ---------------------------------------------------------------------------
// GET /api/photos/[id] and GET /api/tiles/* previously had no rate limit at
// all; both are public routes whose cost is dominated by egress/upstream
// bytes. These tests run the real handlers through the shared harness and
// assert the sliding window produces a 429 with Retry-After past the cap.

const envMock = async () => (await loadTreeModule("cloudflare-workers.mjs")).env;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("GET /api/photos/[id] answers 429 past the read threshold and blocks before storage", async () => {
  const env = await envMock();
  env.READ_RATE_LIMIT_MAX = "2";
  try {
    stub("readPublicPhotoBytes", async () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }));
    const { GET } = await loadRoute("app/api/photos/[id]/route.mjs");

    const first = await GET(apiRequest("/api/photos/11"));
    assert.equal(first.status, 200);
    const second = await GET(apiRequest("/api/photos/11"));
    assert.equal(second.status, 200);

    const blocked = await GET(apiRequest("/api/photos/11"));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(await blocked.json().then((body) => body.error), "Too many requests. Please try again shortly.");

    // The blocked call must never reach the storage boundary.
    assert.equal(callArgs("readPublicPhotoBytes").length, 2, "the third request is throttled before touching storage");

    // A different caller is unaffected by the same bucket.
    const other = await GET(
      new Request("https://osdb.test/api/photos/11", { headers: { "cf-connecting-ip": "203.0.113.99" } }),
    );
    assert.equal(other.status, 200);
  } finally {
    delete env.READ_RATE_LIMIT_MAX;
  }
});

test("GET /api/tiles/* answers 429 past the tiles threshold, independently of the read bucket", async () => {
  const env = await envMock();
  env.TILES_RATE_LIMIT_MAX = "2";
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response(png, { status: 200, headers: { "Content-Type": "image/png" } });
  };
  try {
    const { GET } = await loadRoute("app/api/tiles/[z]/[x]/[y]/route.mjs");
    const request = (headers = {}) =>
      GET(apiRequest("/api/tiles/13/4250/2900", { headers }), {
        params: Promise.resolve({ z: "13", x: "4250", y: "2900" }),
      });

    assert.equal((await request()).status, 200);
    assert.equal((await request()).status, 200);
    const blocked = await request();
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(blocked.headers.get("cache-control"), "no-store");
    assert.equal(upstreamCalls, 2, "the throttled request never reaches the upstream");

    // The tile bucket is independent: the same caller still has fresh read
    // budget (photos route shares the read bucket, not the tiles one).
    const { GET: photoGet } = await loadRoute("app/api/photos/[id]/route.mjs");
    stub("readPublicPhotoBytes", async () => ({ bytes: png, mimeType: "image/png" }));
    assert.equal((await photoGet(apiRequest("/api/photos/11"))).status, 200);
  } finally {
    delete env.TILES_RATE_LIMIT_MAX;
  }
});
