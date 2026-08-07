// Runtime API tests for the reverse-geocoding endpoint
// (app/api/geocode/reverse/route.ts, CEO 2026-08-07): coordinate → nearest
// address for the /segnala form prefill.
//
// The route is exercised with real Request objects; db/reverse-geocode is
// the shared mock (stub("reverseGeocode", ...)) so no network call ever
// happens — the real cache-first/lookup behaviour is covered in
// tests/reverse-geocode.test.mjs against a real in-memory D1.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule } from "./helpers/api-harness.mjs";
import { resetMockState, stub } from "./helpers/mock-state.mjs";

const reverseRoute = () => loadRoute("app/api/geocode/reverse/route.mjs");

beforeEach(async () => {
  resetMockState();
  const { resetRateLimitState } = await loadTreeModule("app/lib/rate-limit.mjs");
  resetRateLimitState();
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  // The route refuses to look anything up without a DB binding; give the
  // tests a stub object (the real SQL behaviour lives elsewhere).
  env.DB = {};
});

afterEach(async () => {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  delete env.DB;
  delete env.GEOCODE_RATE_LIMIT_MAX;
  delete env.GEOCODE_RATE_LIMIT_WINDOW_SECONDS;
});

after(async () => cleanupRouteTree());

async function getReverse(query, { headers = {}, envOverrides = {} } = {}) {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  for (const [key, value] of Object.entries(envOverrides)) env[key] = value;
  const { GET } = await reverseRoute();
  return GET(apiRequest(`/api/geocode/reverse?${query}`, { headers }));
}

// ---------------------------------------------------------------------------
// Validation (400 before any lookup)
// ---------------------------------------------------------------------------

test("rejects missing, non-numeric or out-of-range coordinates with 400", async () => {
  let lookups = 0;
  stub("reverseGeocode", async () => {
    lookups += 1;
    return { address: "Via Roma 12", cached: false };
  });
  const { GET } = await reverseRoute();

  const missing = await GET(apiRequest("/api/geocode/reverse"));
  assert.equal(missing.status, 400, "lat/lng are required");

  const notNumeric = await GET(apiRequest("/api/geocode/reverse?lat=abc&lng=12.5"));
  assert.equal(notNumeric.status, 400, "non-numeric lat is rejected");

  const latTooBig = await GET(apiRequest("/api/geocode/reverse?lat=91&lng=0"));
  assert.equal(latTooBig.status, 400, "lat > 90 is rejected");

  const lngTooSmall = await GET(apiRequest("/api/geocode/reverse?lat=0&lng=-181"));
  assert.equal(lngTooSmall.status, 400, "lng < -180 is rejected");

  const ok = await GET(apiRequest("/api/geocode/reverse?lat=45.4642&lng=9.19"));
  assert.equal(ok.status, 200, "a valid coordinate pair is accepted");

  assert.equal(lookups, 1, "only the valid query reaches the lookup");
});

// ---------------------------------------------------------------------------
// Happy path: address found / not found
// ---------------------------------------------------------------------------

test("returns the nearest address with the cache status header", async () => {
  stub("reverseGeocode", async (db, lat, lng) => {
    assert.equal(lat, 45.4642, "the route forwards the latitude");
    assert.equal(lng, 9.19, "the route forwards the longitude");
    return { address: "Piazza del Duomo 1, Milano", cached: false };
  });
  const response = await getReverse("lat=45.4642&lng=9.19");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.address, "Piazza del Duomo 1, Milano");
  assert.equal(response.headers.get("X-Geocode-Reverse-Cache"), "miss");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=86400", "stable addresses are edge-cacheable");
});

test("returns address null with no-store when the geocoder has nothing there", async () => {
  stub("reverseGeocode", async () => null);
  const response = await getReverse("lat=45.4642&lng=9.19");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.address, null);
  assert.equal(response.headers.get("Cache-Control"), "no-store", "a negative result is not cached");
});

test("reports cache hits so the client can tell re-used lookups apart", async () => {
  stub("reverseGeocode", async () => ({ address: "Via Roma 12", cached: true }));
  const response = await getReverse("lat=45.4642&lng=9.19");
  assert.equal(response.headers.get("X-Geocode-Reverse-Cache"), "hit");
});

// ---------------------------------------------------------------------------
// Failure paths
// ---------------------------------------------------------------------------

test("a failing lookup answers 502, never a fabricated address", async () => {
  stub("reverseGeocode", async () => {
    throw new Error("upstream down");
  });
  const response = await getReverse("lat=45.4642&lng=9.19");
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "Address lookup is temporarily unavailable. Please try again shortly.");
});

test("the route answers 503 without a database binding", async () => {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  delete env.DB;
  const response = await getReverse("lat=45.4642&lng=9.19");
  assert.equal(response.status, 503);
});

test("per-caller rate limit answers 429 with Retry-After", async () => {
  stub("reverseGeocode", async () => ({ address: "Via Roma 12", cached: false }));
  // One allowed request per minute for this caller.
  const response = await getReverse("lat=45.4642&lng=9.19", {
    envOverrides: { GEOCODE_RATE_LIMIT_MAX: "1", GEOCODE_RATE_LIMIT_WINDOW_SECONDS: "60" },
  });
  assert.equal(response.status, 200, "first request passes");

  const limited = await getReverse("lat=45.4642&lng=9.19", {
    headers: { "x-forwarded-for": "203.0.113.7" },
    envOverrides: { GEOCODE_RATE_LIMIT_MAX: "1", GEOCODE_RATE_LIMIT_WINDOW_SECONDS: "60" },
  });
  // Same caller (x-forwarded-for), different coordinates: still limited.
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("Retry-After"), "Retry-After is present");
});
