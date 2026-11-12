// Search privacy helpers (2026-11): what can be answered in the browser is
// never sent anywhere, and what reaches OpenStreetMap carries only the site
// origin. Pure-function contracts, no network.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

const { parseLocalPlaceQuery, rankByViewport } = await loadLib("app/lib/local-place-query.mjs");
const { originOnlyReferer } = await loadLib("app/lib/upstream-referer.mjs");
after(async () => cleanupRouteTree());

test("coordinates are recognised locally in the usual formats", () => {
  const rome = { kind: "coordinates", latitude: 41.9068, longitude: 12.4808 };
  for (const input of ["41.9068, 12.4808", "41.9068 12.4808", "41.9068;12.4808", " 41.9068 ,  12.4808 ", "geo:41.9068,12.4808", "41,9068, 12,4808", "41,9068; 12,4808", "41.9068 N 12.4808 E"]) {
    assert.deepEqual(parseLocalPlaceQuery(input), rome, input);
  }
  assert.deepEqual(parseLocalPlaceQuery("-33.8688, 151.2093"), { kind: "coordinates", latitude: -33.8688, longitude: 151.2093 });
  assert.deepEqual(parseLocalPlaceQuery("33.8688 S 151.2093 E"), { kind: "coordinates", latitude: -33.8688, longitude: 151.2093 });
  assert.deepEqual(parseLocalPlaceQuery("40.4168 N 3.7038 W"), { kind: "coordinates", latitude: 40.4168, longitude: -3.7038 });
  assert.deepEqual(parseLocalPlaceQuery("40.4168 N 3.7038 O"), { kind: "coordinates", latitude: 40.4168, longitude: -3.7038 }, "O = ovest");
});

test("record numbers need an explicit #; plain numbers, addresses and out-of-range pairs go to the geocoder", () => {
  assert.deepEqual(parseLocalPlaceQuery("#6302"), { kind: "record", id: 6302 });
  assert.deepEqual(parseLocalPlaceQuery("# 12"), { kind: "record", id: 12 });
  for (const input of ["", "   ", "6302", "00184", "Via Roma 12", "12 3", "Roma", "95.1, 12.4", "41.9, 190.2", "#0", "#abc"]) {
    assert.equal(parseLocalPlaceQuery(input), null, JSON.stringify(input));
  }
});

test("results inside the current view are listed first, the geocoder order is kept otherwise (browser-only)", () => {
  const view = { south: 41.8, north: 42.0, west: 12.3, east: 12.6 };
  const results = [{ id: "far-1", lat: 45, lng: 9 }, { id: "near", lat: 41.9, lng: 12.5 }, { id: "far-2", lat: 40, lng: 14 }];
  assert.deepEqual(rankByViewport(results, view).map((r) => r.id), ["near", "far-1", "far-2"]);
  assert.deepEqual(rankByViewport(results, null).map((r) => r.id), ["far-1", "near", "far-2"]);
});

test("only the site origin is passed upstream as Referer", () => {
  assert.equal(originOnlyReferer("https://osdb.test/mappa?lat=41.90&lng=12.48&zoom=17"), "https://osdb.test/");
  assert.equal(originOnlyReferer("https://osdb.test/records/123/edit#x"), "https://osdb.test/");
  assert.equal(originOnlyReferer("http://localhost:4000/segnala"), "http://localhost:4000/");
  assert.equal(originOnlyReferer(null), null);
  assert.equal(originOnlyReferer("not a url"), null);
  assert.equal(originOnlyReferer("javascript:alert(1)"), null);
});
