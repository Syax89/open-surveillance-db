// Unit tests for app/lib/rate-limit-response.ts: the shared
// "caller key -> checkRateLimit -> log -> recordRateLimitBlock -> 429" block
// every rate-limited route (and auth-route-helpers' bucketLimit) delegates to.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadLibModule } from "./helpers/api-harness.mjs";

after(async () => cleanupRouteTree());

let rateLimit;
let abuseAlerts;
let helper;

beforeEach(async () => {
  if (!helper) {
    [rateLimit, abuseAlerts, helper] = await Promise.all([
      loadLibModule("rate-limit"),
      loadLibModule("abuse-alerts"),
      loadLibModule("rate-limit-response"),
    ]);
  }
  rateLimit.resetRateLimitState();
  abuseAlerts.resetAbuseAlertState();
});

const ONE_PER_MINUTE = { maxRequests: 1, windowSeconds: 60 };

function request(headers = {}) {
  return new Request("https://osdb.test/api/x", { headers });
}

async function withWarnings(fn) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => lines.push(args.join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    console.warn = original;
  }
}

test("allows under the limit, then answers the default JSON 429 with Retry-After, log and abuse record", async () => {
  const options = { bucket: "read", route: "/api/x", env: {}, limits: ONE_PER_MINUTE, log: "GET /api/x rate limited" };
  const req = request({ "cf-connecting-ip": "198.51.100.1" });
  assert.equal(await helper.rateLimitResponse(req, options), null);

  const { result: blocked, lines } = await withWarnings(() => helper.rateLimitResponse(req, options));
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: "Too many requests. Please try again shortly." });
  assert.equal(blocked.headers.get("Retry-After"), "60");
  assert.equal(blocked.headers.get("Cache-Control"), null);
  assert.deepEqual(lines, ["GET /api/x rate limited"]);
  assert.equal(abuseAlerts.getAbuseAlertState().trackedRoutes, 1, "the block is reported to the abuse-alert layer");
});

test("per-route body text, plain-text format, extra headers, keyed log and recordBlock:false are honoured", async () => {
  const options = {
    bucket: "tiles",
    route: "/api/t",
    env: {},
    limits: ONE_PER_MINUTE,
    log: (key) => `blocked ${key}`,
    error: "Too many tile requests. Please try again shortly.",
    plainText: true,
    headers: { "Cache-Control": "no-store" },
    recordBlock: false,
  };
  const req = request({ "cf-connecting-ip": "198.51.100.2" });
  await helper.rateLimitResponse(req, options);
  const { result: blocked, lines } = await withWarnings(() => helper.rateLimitResponse(req, options));
  assert.equal(blocked.status, 429);
  assert.equal(await blocked.text(), "Too many tile requests. Please try again shortly.");
  assert.match(blocked.headers.get("Content-Type"), /^text\/plain/);
  assert.equal(blocked.headers.get("Cache-Control"), "no-store");
  assert.equal(blocked.headers.get("Retry-After"), "60");
  assert.deepEqual(lines, ["blocked 198.51.100.2"]);
  assert.equal(abuseAlerts.getAbuseAlertState().trackedRoutes, 0, "recordBlock:false skips the abuse-alert layer");
});

test("the caller key honours env (TRUST_XFF): distinct forwarded clients get distinct buckets", async () => {
  const options = { bucket: "read", route: "/api/x", env: { TRUST_XFF: "true" }, limits: ONE_PER_MINUTE, log: "x" };
  assert.equal(await helper.rateLimitResponse(request({ "x-forwarded-for": "203.0.113.1" }), options), null);
  assert.equal(
    await helper.rateLimitResponse(request({ "x-forwarded-for": "203.0.113.2" }), options),
    null,
    "with env passed, the second forwarded client is not lumped into the first's bucket",
  );
  // Without the knob both share the fail-closed "unknown" bucket.
  const noTrust = { ...options, env: {}, bucket: "nearby" };
  assert.equal(await helper.rateLimitResponse(request({ "x-forwarded-for": "203.0.113.1" }), noTrust), null);
  const { result } = await withWarnings(() => helper.rateLimitResponse(request({ "x-forwarded-for": "203.0.113.2" }), noTrust));
  assert.equal(result.status, 429);
});

test("apiKey mode: session callers pass, API-key callers use their own key:<id> bucket", async () => {
  const req = request({ "cf-connecting-ip": "198.51.100.3" });
  const base = { bucket: "submit", route: "/api/k", env: {}, limits: ONE_PER_MINUTE, log: "per-key blocked" };
  const session = { ...base, apiKey: { gate: { authMethod: "session" } } };
  assert.equal(await helper.rateLimitResponse(req, session), null);
  assert.equal(await helper.rateLimitResponse(req, session), null, "no per-key bucket for session callers");

  const keyed = { ...base, apiKey: { gate: { authMethod: "api_key", apiKeyId: 7 } } };
  assert.equal(await helper.rateLimitResponse(req, keyed), null);
  const { result: blocked, lines } = await withWarnings(() => helper.rateLimitResponse(req, keyed));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "60");
  assert.deepEqual(lines, ["per-key blocked"]);
  // The per-key bucket is separate from the caller's per-IP bucket.
  assert.equal(
    (await rateLimit.checkRateLimit({}, "submit", "198.51.100.3", ONE_PER_MINUTE)).allowed,
    true,
    "the per-key block did not consume the per-IP bucket",
  );
});
