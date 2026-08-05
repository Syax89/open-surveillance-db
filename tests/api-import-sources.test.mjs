// Runtime API tests for /api/import-sources — the client-side attribution
// lookup for the map popup and record page (import pipeline FASE C,
// t_4dbce318). The route serves the committed import batches (slug →
// readable entity + licence + links) with the same public read cache
// contract as the camera reads.
//
// The handler is exercised with real Request objects against the mocked db
// layer (tests/helpers/api-harness.mjs); fixtures are fictitious.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { resetMockState, stub } from "./helpers/mock-state.mjs";

let route;

beforeEach(() => {
  resetMockState();
  route = () => loadRoute("app/api/import-sources/route.mjs");
});

after(async () => cleanupRouteTree());

const sourcesFixture = [
  {
    slug: "fixture-zurigo-2026",
    sourceName: "Fixture City — Open Data",
    sourceUrl: "https://example.invalid/dataset/fixture-city",
    license: "CC0 1.0",
    licenseUrl: "https://example.invalid/licenses/cc0",
  },
  {
    slug: "fixture-osm-2026",
    sourceName: "OpenStreetMap contributors",
    sourceUrl: "https://example.invalid/map",
    license: "ODbL 1.0",
    licenseUrl: null,
  },
];

test("GET /api/import-sources returns the committed batches with the attribution fields", async () => {
  stub("listCommittedImportBatches", async () => sourcesFixture);
  const response = await (await route()).GET(apiRequest("/api/import-sources"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  // Same bounded edge cache as the record list (batch list changes only
  // when an import lands).
  assert.match(response.headers.get("cache-control") ?? "", /public, s-maxage=300/);

  const body = await responseBody(response);
  assert.equal(body.sources.length, 2);
  assert.equal(body.sources[0].slug, "fixture-zurigo-2026");
  assert.equal(body.sources[0].sourceName, "Fixture City — Open Data");
  assert.equal(body.sources[0].sourceUrl, "https://example.invalid/dataset/fixture-city");
  assert.equal(body.sources[0].license, "CC0 1.0");
  assert.equal(body.sources[0].licenseUrl, "https://example.invalid/licenses/cc0");
  // OSM-style row: licence without a URL stays null (the attribution text
  // carries the link on /fonti; the popup renders the licence as text).
  assert.equal(body.sources[1].licenseUrl, null);
});

test("GET /api/import-sources fails closed on a DB error (503, no internals leaked)", async () => {
  stub("listCommittedImportBatches", async () => {
    throw new Error("internal detail that must never reach the client");
  });
  const response = await (await route()).GET(apiRequest("/api/import-sources"));

  assert.equal(response.status, 503);
  const body = await responseBody(response);
  assert.equal(body.error, "Database unavailable");
});
