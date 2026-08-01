// Unit tests for the bounded geocode result cache (db/geocode.ts).
//
// The route harness mocks db/geocode.mjs for the handlers, so the real
// implementation is compiled separately into db-real/geocode.mjs (see
// tests/helpers/api-harness.mjs REAL_DB_MODULES) and loaded only here. The
// module talks to Nominatim through global fetch, which every test stubs:
// no real network traffic ever happens.
//
// These tests pin the memory-hygiene contract: the per-isolate cache must
// never grow past its entry cap on a long-lived worker with varied search
// traffic, and eviction must drop the oldest entries first.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadTreeModule } from "./helpers/api-harness.mjs";

let geocode;
let fetchCalls = 0;
let originalFetch;

const placePayload = [
  {
    display_name: "Test Place, Test Region",
    lat: "41.9028",
    lon: "12.4964",
    boundingbox: ["41.89", "41.92", "12.47", "12.53"],
  },
];

function stubGeocoder(payload) {
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

beforeEach(async () => {
  if (!geocode) geocode = await loadTreeModule("db-real/geocode.mjs");
  geocode.resetGeocodeCache();
  fetchCalls = 0;
  originalFetch = globalThis.fetch;
  stubGeocoder(placePayload);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => cleanupRouteTree());

test("a resolved place is cached and a repeat query is served without a network call", async () => {
  const first = await geocode.resolvePlace("Rome");
  assert.equal(first.displayName, "Test Place, Test Region");
  assert.equal(first.latitude, 41.9028);
  assert.equal(geocode.geocodeCacheSize(), 1);
  assert.equal(fetchCalls, 1);

  const second = await geocode.resolvePlace("Rome");
  assert.deepEqual(second, first);
  assert.equal(fetchCalls, 1, "a live cache entry must be served without re-hitting the geocoder");
  assert.equal(geocode.geocodeCacheSize(), 1, "a cache hit must not grow the map");
});

test("negative results are cached too, so a typo does not hammer the endpoint", async () => {
  stubGeocoder([]);
  const result = await geocode.resolvePlace("Xyzzy Not A Place");
  assert.equal(result, null);
  assert.equal(geocode.geocodeCacheSize(), 1);
  assert.equal(fetchCalls, 1);

  const again = await geocode.resolvePlace("Xyzzy Not A Place");
  assert.equal(again, null);
  assert.equal(fetchCalls, 1, "a cached negative result must not re-hit the geocoder");
});

test("the cache never grows past its entry cap and evicts the oldest entries first", async () => {
  // Distinct queries produce distinct keys (text + language + base URL), so
  // filling past the cap inserts one entry per call.
  for (let i = 0; i < 1001; i += 1) {
    await geocode.resolvePlace(`place-${i}`);
  }
  assert.equal(geocode.geocodeCacheSize(), 1000, "the map must stay at the cap, never above");
  assert.equal(fetchCalls, 1001, "every query past the cap is still resolved before caching");

  // The oldest entry (place-0) was evicted to make room: resolving it again
  // is a cache miss and hits the geocoder again.
  const callsBeforeOldest = fetchCalls;
  await geocode.resolvePlace("place-0");
  assert.equal(fetchCalls, callsBeforeOldest + 1, "the evicted oldest entry must be re-fetched");
  assert.equal(geocode.geocodeCacheSize(), 1000, "re-inserting an evicted entry keeps the map at the cap");

  // The most recently inserted entry is still live: served from cache.
  const callsBeforeRecent = fetchCalls;
  await geocode.resolvePlace("place-1000");
  assert.equal(fetchCalls, callsBeforeRecent, "a live entry must be served from the cache");
});
