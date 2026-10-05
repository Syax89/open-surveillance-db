/**
 * B03 — a dateline-crossing viewport must render markers/badges for BOTH
 * sides of ±180 on the VISIBLE world copy. `recordsInBounds` (list/visibility)
 * is not enough: Leaflet projects longitude LINEARLY, so a camera stored at
 * -179 renders near the far-west edge of the world while the map shows the
 * copy around +180 — the marker/badge must be moved to the reference copy
 * (`longitudeInCopy`), on creation and when a pan crosses copies.
 *
 * Behavioral (real SurveillanceMap + leaflet recording stub): asserts the
 * latlng each geometry is CREATED at, and that RETAINED geometry MOVES across
 * copies. Fixtures are fictitious (dateline coordinates).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, resetLeafletMarkers, leafletMaps, leafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let __setBounds;

const CAMERAS = [
  { id: 1, title: "East of the line", kind: "bullet", status: "active", latitude: 0, longitude: 179 },
  { id: 2, title: "West of the line", kind: "bullet", status: "active", latitude: 0, longitude: -179 },
];

// Raw (unwrapped) Leaflet viewport crossing the dateline: 170°E..190°E, i.e.
// the visible world copy centred on +180.
const WRAP_EAST = { getSouth: () => -10, getNorth: () => 10, getWest: () => 170, getEast: () => 190, contains: () => true };
// The SAME copy approached from the other unwrapped side.
const WRAP_WEST = { getSouth: () => -10, getNorth: () => 10, getWest: () => -190, getEast: () => -170, contains: () => true };

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  const gridMod = await loadDomModule("node_modules/leaflet/index.mjs");
  __setBounds = gridMod.__setBounds;
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(async () => {
  rtl?.cleanup();
  await resetLeafletMarkers();
});

async function maps() { return leafletMaps(); }
async function markers() { return leafletMarkers(); }

function markerByTitle(list, title) {
  const found = list.find((m) => m.opts?.title === title);
  assert.ok(found, `marker for ${title} must exist`);
  return found;
}

async function settlePan(bounds) {
  __setBounds(bounds);
  const map = (await maps())[0];
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  // BOUNDS_DEBOUNCE_MS (500ms) + rebuild.
  await new Promise((resolve) => setTimeout(resolve, 700));
}

test("B03: markers for both dateline sides are placed on the visible world copy", async () => {
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
  await resetLeafletMarkers();
  __setBounds(WRAP_EAST);
  await renderWithLocale(React.createElement(SurveillanceMap, { cameras: CAMERAS, selectedId: null, onSelect: () => {}, onPick: () => {} }));
  // Wait for the lazy leaflet import + initial emitBounds + rebuilde.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const list = await markers();
  assert.equal(list.length, 2, "both dateline records are materialised (neither side lost)");
  // reference centre ≈ 180: 179 stays, -179 is moved to +181 (same copy).
  assert.deepEqual(markerByTitle(list, "East of the line").latlng, [0, 179]);
  assert.deepEqual(markerByTitle(list, "West of the line").latlng, [0, 181], "the -179 record is drawn on the +180 copy, not off-screen");
});

test("B03: a pan across the dateline MOVES the retained markers to the new copy", async () => {
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
  await resetLeafletMarkers();
  __setBounds(WRAP_EAST);
  await renderWithLocale(React.createElement(SurveillanceMap, { cameras: CAMERAS, selectedId: null, onSelect: () => {}, onPick: () => {} }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const before = await markers();
  assert.deepEqual(markerByTitle(before, "East of the line").latlng, [0, 179]);

  // Pan to the same copy approached from the west: centre ≈ -180, so 179 must
  // move to -181 and -179 stays. The records are UNCHANGED (same prop array),
  // so the retained markers must be repositioned by the rebuild.
  await settlePan(WRAP_WEST);
  const after = await markers();
  assert.deepEqual(markerByTitle(after, "West of the line").latlng, [0, -179]);
  assert.deepEqual(markerByTitle(after, "East of the line").latlng, [0, -181], "the retained marker moved across the copy");
});

test("B03: an aggregated badge lands on the visible copy, not mid-Pacific", async () => {
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
  await resetLeafletMarkers();
  __setBounds(WRAP_EAST);
  // > MAX_INDIVIDUAL_MARKERS (150) dense records straddling the dateline, at
  // a low zoom so the grid aggregation is active.
  const many = [];
  for (let i = 0; i < 152; i += 1) {
    many.push({ id: 1000 + i, title: `grid ${i}`, kind: "bullet", status: "active", latitude: (i % 20) * 0.4 - 4, longitude: i % 2 === 0 ? 179.2 : -179.2 });
  }
  await renderWithLocale(React.createElement(SurveillanceMap, { cameras: many, selectedId: null, onSelect: () => {}, onPick: () => {} }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const map = (await maps())[0];
  map.zoom = 8; // grid active below GRID_MAX_ZOOM (12) for the dense view
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  await new Promise((resolve) => setTimeout(resolve, 200));

  const badges = (await markers()).filter((m) => m.opts?.icon?.className === "osm-grid-badge-wrap");
  assert.ok(badges.length >= 1, "the dense dateline view aggregates into badges");
  for (const badge of badges) {
    assert.ok(badge.latlng[1] >= 170 && badge.latlng[1] <= 190, `badge drawn on the visible +180 copy, not mid-Pacific (got ${badge.latlng[1]})`);
  }
});
