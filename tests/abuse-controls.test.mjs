// Runtime tests for the abuse-control layer (Wave B, Operations):
//   - app/lib/rate-limit.ts    per-route sliding-window limiter
//   - app/lib/input-limits.ts  body/URL size caps
//   - app/lib/abuse-alerts.ts  hashed caller alerts + route surge alerts
// The lib modules are pure ESM with no Workers bindings; they are
// transpiled into the shared harness tree and imported directly.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule } from "./helpers/api-harness.mjs";

after(async () => cleanupRouteTree());

let rateLimit;
let abuseAlerts;
let inputLimits;

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

// Give the fire-and-forget alert delivery a chance to complete.
const flushAlerts = () => new Promise((resolve) => setTimeout(resolve, 20));

// ---------------------------------------------------------------------------
// rate-limit.ts
// ---------------------------------------------------------------------------

test("each route family gets an independent sliding window", () => {
  const readOptions = { maxRequests: 2, windowSeconds: 60 };
  const submitOptions = { maxRequests: 1, windowSeconds: 60 };
  const now = 1_000_000_000_000;

  assert.equal(rateLimit.checkRateLimit("read", "203.0.113.9", readOptions, now).allowed, true);
  assert.equal(rateLimit.checkRateLimit("read", "203.0.113.9", readOptions, now + 1).allowed, true);
  const blocked = rateLimit.checkRateLimit("read", "203.0.113.9", readOptions, now + 2);
  assert.equal(blocked.allowed, false);
  assert.ok(
    blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 61,
    `retry window must be 1..61s, got ${blocked.retryAfterSeconds}`,
  );

  // A different caller is unaffected, and so is a different bucket for the
  // same caller.
  assert.equal(rateLimit.checkRateLimit("read", "203.0.113.10", readOptions, now + 2).allowed, true);
  assert.equal(rateLimit.checkRateLimit("submit", "203.0.113.9", submitOptions, now + 2).allowed, true);

  // The window slides: old timestamps drop out.
  assert.equal(rateLimit.checkRateLimit("read", "203.0.113.9", readOptions, now + 61_000).allowed, true);
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
  assert.deepEqual(rateLimit.limitsFor("moderate", {}), { maxRequests: 30, windowSeconds: 60 });
  // Invalid or missing overrides fall back to the defaults.
  assert.deepEqual(
    rateLimit.limitsFor("read", { READ_RATE_LIMIT_MAX: "-3", READ_RATE_LIMIT_WINDOW_SECONDS: "0" }),
    { maxRequests: 60, windowSeconds: 60 },
  );
  assert.equal(rateLimit.submissionLimits({ POST_RATE_LIMIT_MAX: "4" }).maxRequests, 4);
  assert.equal(rateLimit.submissionsDisabled({ POST_SUBMISSIONS_DISABLED: "true" }), true);
  assert.equal(rateLimit.submissionsDisabled({}), false);
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
