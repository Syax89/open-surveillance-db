// Runtime API tests for GET /api/cameras/search (locality/address/coordinate).
// The route is exercised with real Request objects against a mocked db layer
// and a mocked geocoder; every test asserts actual HTTP status codes and
// response bodies, including the truthful empty/unavailable contracts.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLib, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

const searchRoute = () => loadRoute("app/api/cameras/search/route.mjs");
const searchLib = () => loadLib("app/lib/search.mjs");

const cameraFixture = {
  id: 1,
  title: "Sample camera",
  kind: "Fixed dome",
  manufacturer: "Acme",
  observedOn: "2026-01-01",
  publishManufacturer: 1,
  publishObservedOn: 1,
  address: "Via Roma 1",
  latitude: 41.9004,
  longitude: 12.4936,
  status: "verified",
  source: "Community report",
  updated: "2026-01-01T00:00:00.000Z",
  description: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const placeFixture = {
  displayName: "Rome, Metropolitan City of Rome, Lazio, Italy",
  latitude: 41.9028,
  longitude: 12.4964,
  boundingBox: { south: 41.89, north: 41.92, west: 12.47, east: 12.53 },
};

// ---------------------------------------------------------------------------
// Coordinate queries (no geocoder involved)
// ---------------------------------------------------------------------------

test("a coordinate query searches the fixed coordinate radius without calling the geocoder", async () => {
  stub("searchPublicCamerasNearPage", async () => ({ records: [{ ...cameraFixture, distanceMeters: 120 }], total: 1, nextOffset: null }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=41.9004%2C%2012.4936"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(callArgs("searchPublicCamerasNearPage")[0], [41.9004, 12.4936, 2000, { limit: 25, offset: 0 }], "search defaults to a 25-record page (FRONTEND_PLAN § 3.2.3)");
  assert.equal(callArgs("resolvePlace").length, 0, "coordinate queries must not hit the geocoder");
  const body = await responseBody(response);
  assert.equal(body.area.kind, "coordinates");
  assert.equal(body.area.latitude, 41.9004);
  assert.equal(body.area.longitude, 12.4936);
  assert.equal(body.area.radiusMeters, 2000);
  assert.equal(body.area.radiusLabel, "2 km");
  assert.equal(body.count, 1);
  assert.equal(body.records[0].distanceMeters, 120);
});

test("coordinate queries accept comma decimal separators and semicolon separators", async () => {
  stub("searchPublicCamerasNearPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=41%2C9004%3B%2012%2C4936"));
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("searchPublicCamerasNearPage")[0], [41.9004, 12.4936, 2000, { limit: 25, offset: 0 }], "search defaults to a 25-record page (FRONTEND_PLAN § 3.2.3)");
});

test("out-of-range coordinate text falls through to place search", async () => {
  stub("resolvePlace", async () => placeFixture);
  stub("searchPublicCamerasNearPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=91%2C%2012"));
  assert.equal(response.status, 200);
  assert.equal(callArgs("resolvePlace").length, 1, "a non-coordinate query must be geocoded");
  assert.equal(callArgs("searchPublicCamerasNearPage")[0][0], placeFixture.latitude);
});

// ---------------------------------------------------------------------------
// Place (geocoded) queries
// ---------------------------------------------------------------------------

test("a place query resolves through the geocoder and searches the bounding-box radius", async () => {
  const search = await searchLib();
  stub("resolvePlace", async () => placeFixture);
  stub("searchPublicCamerasNearPage", async () => ({ records: [{ ...cameraFixture, distanceMeters: 900 }], total: 1, nextOffset: null }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=Rome"));

  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("resolvePlace")[0], ["Rome", { language: "en" }]);
  const expectedRadius = search.radiusForBoundingBox(placeFixture.boundingBox);
  assert.ok(expectedRadius >= 1000 && expectedRadius <= 25000, "radius must stay within the documented clamp");
  assert.deepEqual(callArgs("searchPublicCamerasNearPage")[0], [placeFixture.latitude, placeFixture.longitude, expectedRadius, { limit: 25, offset: 0 }]);

  const body = await responseBody(response);
  assert.equal(body.area.kind, "place");
  assert.equal(body.area.displayName, placeFixture.displayName);
  assert.equal(body.area.radiusMeters, expectedRadius);
  assert.equal(body.area.radiusLabel, search.formatDistance(expectedRadius));
  assert.equal(body.count, 1);
  assert.equal(body.records[0].distanceMeters, 900);
});

test("the place search passes the requested interface language to the geocoder", async () => {
  stub("resolvePlace", async () => placeFixture);
  stub("searchPublicCamerasNearPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=Roma&lang=it"));
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("resolvePlace")[0], ["Roma", { language: "it" }]);
});

test("an unresolvable place returns a truthful 404 and performs no record search", async () => {
  stub("resolvePlace", async () => null);
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=Xyzzy%20Not%20A%20Place"));
  assert.equal(response.status, 404);
  const body = await responseBody(response);
  assert.match(body.error, /could not find a place/i);
  assert.equal(callArgs("searchPublicCamerasNearPage").length, 0);
});

test("a failed geocoder returns a truthful 503 with no fabricated results", async () => {
  stub("resolvePlace", async () => {
    throw new Error("Geocoder responded with HTTP 429");
  });
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=Rome"));
  assert.equal(response.status, 503);
  const body = await responseBody(response);
  assert.match(body.error, /temporarily unavailable/i);
  assert.equal(callArgs("searchPublicCamerasNearPage").length, 0, "no area search may run when the place is unknown");
});

test("a database failure maps to 503 with a generic client-safe message", async () => {
  stub("resolvePlace", async () => placeFixture);
  stub("searchPublicCamerasNearPage", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=Rome"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database unavailable");
});

// ---------------------------------------------------------------------------
// Truthful zero-result contract
// ---------------------------------------------------------------------------

test("a zero-result search returns an empty records array with the searched area, never an absence claim", async () => {
  stub("resolvePlace", async () => placeFixture);
  stub("searchPublicCamerasNearPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=Rome"));

  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.records, []);
  assert.equal(body.count, 0);
  assert.equal(body.area.displayName, placeFixture.displayName);
  assert.ok(body.area.radiusMeters > 0);
  assert.match(body.area.radiusLabel, /\d/);
  // The payload may describe what was searched but must never assert that an
  // area is free of surveillance.
  assert.doesNotMatch(JSON.stringify(body), /no camera/i);
});

// ---------------------------------------------------------------------------
// Input validation and abuse controls
// ---------------------------------------------------------------------------

test("search rejects missing, blank, and over-long queries", async (t) => {
  const { GET } = await searchRoute();
  const cases = [
    { name: "no q parameter", path: "/api/cameras/search" },
    { name: "blank q", path: "/api/cameras/search?q=%20%20" },
    { name: "query over 200 chars", path: `/api/cameras/search?q=${"a".repeat(201)}` },
  ];
  for (const { name, path } of cases) {
    await t.test(name, async () => {
      const response = await GET(apiRequest(path));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("resolvePlace").length, 0, name);
      assert.equal(callArgs("searchPublicCamerasNearPage").length, 0, name);
    });
  }
});

test("a 200-character query is accepted and a 201-character one is rejected", async () => {
  stub("resolvePlace", async () => placeFixture);
  stub("searchPublicCamerasNearPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await searchRoute();
  const accepted = await GET(apiRequest(`/api/cameras/search?q=${"a".repeat(200)}`));
  assert.equal(accepted.status, 200);
  const rejected = await GET(apiRequest(`/api/cameras/search?q=${"a".repeat(201)}`));
  assert.equal(rejected.status, 400);
});

// ---------------------------------------------------------------------------
// Pagination (FRONTEND_PLAN § 3.2.3)
// ---------------------------------------------------------------------------

test("search pages the result set with the same { records, total, nextOffset } contract as the list", async () => {
  stub("searchPublicCamerasNearPage", async () => ({ records: [cameraFixture], total: 37, nextOffset: 25 }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=41.9004%2C%2012.4936&limit=25&offset=25"));

  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.count, 37, "count keeps reporting the full result total for the area, not the page length");
  assert.equal(body.total, 37);
  assert.equal(body.nextOffset, 25);
  assert.deepEqual(callArgs("searchPublicCamerasNearPage")[0], [41.9004, 12.4936, 2000, { limit: 25, offset: 25 }]);
});

test("search clamps an over-max limit and rejects invalid pagination values", async (t) => {
  stub("searchPublicCamerasNearPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await searchRoute();

  const clamped = await GET(apiRequest("/api/cameras/search?q=41.9004%2C%2012.4936&limit=999999"));
  assert.equal(clamped.status, 200);
  assert.deepEqual(callArgs("searchPublicCamerasNearPage")[0], [41.9004, 12.4936, 2000, { limit: 100, offset: 0 }], "an over-max limit is clamped to the hard cap");

  for (const query of ["limit=abc", "limit=-5", "limit=1.5", "limit=0", "offset=abc", "offset=-3"]) {
    await t.test(query, async () => {
      const response = await GET(apiRequest(`/api/cameras/search?q=Rome&${query}`));
      assert.equal(response.status, 400, query);
      assert.equal(callArgs("resolvePlace").length, 0, "invalid pagination must be rejected before any geocoding or query");
      assert.equal(callArgs("searchPublicCamerasNearPage").length, 0);
    });
  }
});

test("a zero-result search reports total 0 and a null nextOffset with the searched area", async () => {
  stub("resolvePlace", async () => placeFixture);
  stub("searchPublicCamerasNearPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await searchRoute();
  const response = await GET(apiRequest("/api/cameras/search?q=Rome"));

  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.records, []);
  assert.equal(body.count, 0);
  assert.equal(body.total, 0);
  assert.equal(body.nextOffset, null);
  assert.equal(body.area.displayName, placeFixture.displayName);
});
