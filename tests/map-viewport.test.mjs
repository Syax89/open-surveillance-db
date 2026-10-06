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
// viewportRectangles (B03 — server-valid geometry from raw Leaflet bounds)
// ---------------------------------------------------------------------------

const serverValid = (rect) =>
  rect.west < rect.east &&
  rect.west >= -180 && rect.east <= 180 &&
  rect.south >= -90 && rect.north <= 90 &&
  rect.south < rect.north;

test("viewportRectangles: a view wider than the world collapses to the whole domain", () => {
  // The measured z2 desktop view: west=-224.2968…, east=249.2578… (span > 360°)
  // used to be sent verbatim and rejected with a 400.
  const rects = mapViewport.viewportRectangles({ south: -65.3668, north: 85.0511, west: -224.29687500000003, east: 249.25781250000003 });
  assert.deepEqual(rects, [{ south: -65.3668, north: 85.0511, west: -180, east: 180 }]);
  assert.ok(rects.every(serverValid), "the world rectangle satisfies the server contract (west<east, in world bounds)");
});

test("viewportRectangles: a narrow antimeridian wrap splits into two valid geographic rectangles", () => {
  // Leaflet's wrapped form (west > east)…
  assert.deepEqual(
    mapViewport.viewportRectangles({ south: -10, north: 10, west: 170, east: -170 }),
    [{ south: -10, north: 10, west: 170, east: 180 }, { south: -10, north: 10, west: -180, east: -170 }],
  );
  // …and the unwrapped form (east > 180) yield the SAME two rectangles — the
  // other side of the dateline is never dropped.
  assert.deepEqual(
    mapViewport.viewportRectangles({ south: -10, north: 10, west: 170, east: 190 }),
    [{ south: -10, north: 10, west: 170, east: 180 }, { south: -10, north: 10, west: -180, east: -170 }],
  );
  for (const rect of mapViewport.viewportRectangles({ south: -10, north: 10, west: 170, east: 190 })) {
    assert.ok(serverValid(rect), "every split rectangle stays west<east inside the world");
  }
});

test("viewportRectangles: an in-range rectangle is returned verbatim (inclusive edges stay exact)", () => {
  const rects = mapViewport.viewportRectangles({ south: 41.8, north: 42.0, west: 12.3, east: 12.7 });
  assert.deepEqual(rects, [{ south: 41.8, north: 42.0, west: 12.3, east: 12.7 }]);
});

test("recordsInBounds tolerates longitudes outside ±180 for list/marker visibility (B03 consistency)", () => {
  const dateline = [
    { id: 1, latitude: 0, longitude: -175 }, // 185°E — inside the 170..190 view
    { id: 2, latitude: 0, longitude: 175 },  // 175°E — inside
    { id: 3, latitude: 0, longitude: 0 },    // outside
  ];
  assert.deepEqual(
    mapViewport.recordsInBounds(dateline, { south: -10, north: 10, west: 170, east: 190 }).map((record) => record.id),
    [1, 2],
    "a record on the far side of the dateline stays in the current view",
  );
});

// ---------------------------------------------------------------------------
// geocodeBounds (B01 — area framing gate)
// ---------------------------------------------------------------------------

test("geocodeBounds accepts a city/province/region box ([south,north,west,east])", () => {
  assert.deepEqual(
    mapViewport.geocodeBounds(["44.7198493", "44.9637886", "11.5109915", "11.8870544"]),
    { south: 44.7198493, north: 44.9637886, west: 11.5109915, east: 11.8870544 },
  );
});

test("geocodeBounds rejects inverted, non-numeric, out-of-world and tiny boxes", () => {
  assert.equal(mapViewport.geocodeBounds(["45", "44", "11", "12"]), null, "inverted latitudes");
  assert.equal(mapViewport.geocodeBounds(["44", "45", "12", "11"]), null, "inverted longitudes");
  assert.equal(mapViewport.geocodeBounds(["44", "45", "11", "NaN"]), null, "non-numeric segment");
  assert.equal(mapViewport.geocodeBounds(["44", "45", "11", "181"]), null, "longitude beyond the world");
  assert.equal(mapViewport.geocodeBounds(["44", "45", "-181", "11"]), null, "longitude below the world");
  assert.equal(mapViewport.geocodeBounds(["44.83", "44.84", "11.61", "11.63"]), null, "a sub-100 m point/road box falls back to the point");
  assert.equal(mapViewport.geocodeBounds(["44", "45"]), null, "wrong arity");
  assert.equal(mapViewport.geocodeBounds(null), null, "absent box");
});



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

test("BOUNDS_DEBOUNCE_MS is 500ms (moveend/zoomend bursts commit one list update)", () => {
  assert.equal(mapViewport.BOUNDS_DEBOUNCE_MS, 500);
});
