// Unit tests for the pure viewport-mapping helpers in app/lib/map-viewport.ts
// (kanban t_702c10af — /mappa redesign: viewport→list sync).
//
// The viewport→list contract lives in a pure function (recordsInBounds) so
// the bounds logic is unit-testable in plain Node without a map instance:
// the component layer converts Leaflet's LatLngBounds to a plain
// ViewportBounds object and the sidebar list shows exactly
// recordsInBounds(filteredRecords, viewportBounds).

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

const mapViewport = await loadLib("app/lib/map-viewport.mjs");
after(async () => cleanupRouteTree());

const RECORDS = [
  { id: 1, latitude: 41.9004, longitude: 12.4936 }, // Rome, inside
  { id: 2, latitude: 41.9047, longitude: 12.5031 }, // Rome, inside
  { id: 3, latitude: 45.4642, longitude: 9.19 },    // Milan, outside
];

// ---------------------------------------------------------------------------
// recordsInBounds
// ---------------------------------------------------------------------------

test("recordsInBounds with null bounds keeps every record (viewport not emitted yet)", () => {
  assert.deepEqual(
    mapViewport.recordsInBounds(RECORDS, null),
    RECORDS,
    "the list must never go blank while the map is still initialising",
  );
});

test("recordsInBounds keeps only records inside the viewport rectangle", () => {
  const bounds = { south: 41.89, north: 41.92, west: 12.48, east: 12.52 };
  assert.deepEqual(
    mapViewport.recordsInBounds(RECORDS, bounds).map((record) => record.id),
    [1, 2],
    "records outside the rectangle (Milan) must be excluded",
  );
});

test("recordsInBounds treats the edges as inclusive", () => {
  const bounds = { south: 41.9004, north: 41.9047, west: 12.4936, east: 12.5031 };
  assert.deepEqual(
    mapViewport.recordsInBounds(RECORDS, bounds).map((record) => record.id),
    [1, 2],
    "a record exactly on the boundary belongs to the viewport",
  );
});

test("recordsInBounds filters latitude and longitude independently", () => {
  const bounds = { south: 41.905, north: 41.91, west: 12.49, east: 12.51 };
  const result = mapViewport.recordsInBounds(RECORDS, bounds);
  assert.deepEqual(result, [], "no record has latitude in [41.905, 41.91]");
});

test("recordsInBounds handles the antimeridian wrap (west > east) like Leaflet", () => {
  const wrapped = [
    { id: 10, latitude: 0, longitude: 175 },   // east of 170, inside
    { id: 11, latitude: 0, longitude: -175 },  // west of -170, inside
    { id: 12, latitude: 0, longitude: 0 },     // middle of the Pacific, outside
    { id: 13, latitude: 0, longitude: 160 },   // just outside the west edge
  ];
  const bounds = { south: -10, north: 10, west: 170, east: -170 };
  assert.deepEqual(
    mapViewport.recordsInBounds(wrapped, bounds).map((record) => record.id),
    [10, 11],
    "a viewport crossing ±180° contains longitudes >= west OR <= east",
  );
});

test("recordsInBounds returns a new array and handles an empty record list", () => {
  const bounds = { south: -90, north: 90, west: -180, east: 180 };
  assert.notEqual(mapViewport.recordsInBounds(RECORDS, bounds), RECORDS, "must copy, never alias");
  assert.deepEqual(mapViewport.recordsInBounds([], bounds), []);
  assert.deepEqual(mapViewport.recordsInBounds([], null), []);
});

// ---------------------------------------------------------------------------
// escapeHtml (popup content safety)
// ---------------------------------------------------------------------------

test("escapeHtml neutralises markup and quotes in record fields", () => {
  assert.equal(
    mapViewport.escapeHtml(`<script>alert("x&y")</script>`),
    "&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;",
  );
  assert.equal(mapViewport.escapeHtml("it's"), "it&#39;s");
  assert.equal(mapViewport.escapeHtml("plain text"), "plain text");
  assert.equal(mapViewport.escapeHtml(""), "");
});

// ---------------------------------------------------------------------------
// BOUNDS_DEBOUNCE_MS
// ---------------------------------------------------------------------------

test("BOUNDS_DEBOUNCE_MS is 200ms (moveend/zoomend bursts commit one list update)", () => {
  assert.equal(mapViewport.BOUNDS_DEBOUNCE_MS, 200);
});
