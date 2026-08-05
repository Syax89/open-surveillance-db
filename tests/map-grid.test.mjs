// Unit tests for the pure pixel-grid aggregation + viewport-first helpers in
// app/lib/map-grid.ts (kanban t_26ce96f3 — CEO 2026-08-05: /mappa is slow
// with 7.374+ points).
//
// Two contracts are tested here:
//  1. VIEWPORT-FIRST — markersForViewport(records, null, zoom) returns an
//     EMPTY layer. Before the map emits its first bounds, the marker pane
//     must never materialise the full dataset (the measured 7.378 divIcon
//     nodes that dragged pan to ~6 fps); the sidebar list keeps its
//     "never blank" contract via its own recordsInBounds(records, null)
//     call, which is text-only and cheap.
//  2. NO RECORD LOSS + density decision — at high density / low zoom the
//     visible records are bucketed into 48px screen cells (one badge
//     marker each); every visible record lands in exactly one cell or is
//     rendered individually (single-record cells), and the `visible` set
//     always contains ALL records in the viewport so the component can
//     find the deep-linked selection even when the rest of the view is a
//     grid. Individual markers win as soon as the zoom is high enough
//     (GRID_MAX_ZOOM) or the visible set is small (MAX_INDIVIDUAL_MARKERS).

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

const grid = await loadLib("app/lib/map-grid.mjs");
after(async () => cleanupRouteTree());

const {
  GRID_CELL_PX,
  GRID_MAX_ZOOM,
  MAX_INDIVIDUAL_MARKERS,
  webMercatorProject,
  webMercatorUnproject,
  shouldUseGrid,
  aggregateToGrid,
  markersForViewport,
} = grid;

// ~700 synthetic records scattered around Italy at roughly city-block
// spacing — dense enough that at z5 they all land in the viewport and
// span many 48px cells.
function makeRecords(count = 700) {
  const records = [];
  for (let i = 0; i < count; i += 1) {
    const latitude = 41.0 + (i % 35) * 0.12; // 35 rows over ~4.2°
    const longitude = 9.5 + Math.floor(i / 35) * 0.15; // 20 columns over ~3°
    records.push({ id: i + 1, latitude, longitude });
  }
  return records;
}

const ITALY = { south: 35.5, north: 47.5, west: 6.5, east: 18.5 };

// ---------------------------------------------------------------------------
// webMercatorProject / webMercatorUnproject
// ---------------------------------------------------------------------------

test("webMercator roundtrip reproduces the input coordinates", () => {
  for (const [lat, lng] of [[41.9004, 12.4936], [45.4642, 9.19], [0, 0], [-33.9, 151.2]]) {
    for (const zoom of [5, 10, 14]) {
      const { x, y } = webMercatorProject(lat, lng, zoom);
      const back = webMercatorUnproject(x, y, zoom);
      assert.ok(Math.abs(back.latitude - lat) < 1e-6, `lat ${lat} @z${zoom}`);
      assert.ok(Math.abs(back.longitude - lng) < 1e-6, `lng ${lng} @z${zoom}`);
    }
  }
});

test("webMercatorProject doubles world pixels per zoom level", () => {
  const z10 = webMercatorProject(45, 10, 10);
  const z11 = webMercatorProject(45, 10, 11);
  assert.equal(z11.x, z10.x * 2, "longitude axis scales 2x per zoom");
  assert.equal(z11.y, z10.y * 2, "latitude axis scales 2x per zoom");
});

// ---------------------------------------------------------------------------
// shouldUseGrid (density / zoom decision)
// ---------------------------------------------------------------------------

test("shouldUseGrid: individual markers at high zoom regardless of density", () => {
  assert.equal(shouldUseGrid(100_000, GRID_MAX_ZOOM), false);
  assert.equal(shouldUseGrid(100_000, GRID_MAX_ZOOM + 1), false);
});

test("shouldUseGrid: individual markers when the visible set is small", () => {
  assert.equal(shouldUseGrid(MAX_INDIVIDUAL_MARKERS, 5), false, "boundary inclusive");
  assert.equal(shouldUseGrid(MAX_INDIVIDUAL_MARKERS - 1, 5), false);
});

test("shouldUseGrid: grid aggregation only for dense, low-zoom views", () => {
  assert.equal(shouldUseGrid(MAX_INDIVIDUAL_MARKERS + 1, 5), true);
  assert.equal(shouldUseGrid(7_374, 5), true, "the real national view aggregates");
  assert.equal(shouldUseGrid(7_374, 13), true, "still too dense at z13");
});

// ---------------------------------------------------------------------------
// aggregateToGrid
// ---------------------------------------------------------------------------

test("aggregateToGrid: every record lands in exactly one cell (no loss)", () => {
  const records = makeRecords(700);
  const cells = aggregateToGrid(records, 5);
  const ids = cells.flatMap((cell) => cell.ids);
  assert.equal(new Set(ids).size, records.length, "no duplicate record across cells");
  assert.deepEqual([...ids].sort((a, b) => a - b), records.map((r) => r.id), "all records present");
});

test("aggregateToGrid: cell counts match membership and cells are non-empty", () => {
  const records = makeRecords(700);
  const cells = aggregateToGrid(records, 5);
  for (const cell of cells) {
    assert.ok(cell.count >= 1, "no empty cell");
    assert.equal(cell.ids.length, cell.count, "count == member ids length");
    assert.equal(new Set(cell.ids).size, cell.count, "ids unique inside a cell");
  }
});

test("aggregateToGrid: nearby records share a cell, distant records do not", () => {
  const records = [
    { id: 1, latitude: 41.9004, longitude: 12.4936 },
    { id: 2, latitude: 41.9005, longitude: 12.4937 }, // ~15 m from #1
    { id: 3, latitude: 45.4642, longitude: 9.19 },    // Milan, far away
  ];
  const cells = aggregateToGrid(records, 10);
  const romeCell = cells.find((cell) => cell.ids.includes(1));
  assert.ok(romeCell.ids.includes(2), "nearby record shares the cell");
  assert.ok(!romeCell.ids.includes(3), "distant record has its own cell");
});

test("aggregateToGrid: centroid is the member-average (projected, then unprojected)", () => {
  // Two records ~15 m apart (clearly inside one 48px cell at z12 — the
  // previous fixture straddled a cell boundary and split into two cells,
  // which is correct grid behaviour, just a bad fixture).
  const records = [
    { id: 1, latitude: 41.9004, longitude: 12.4936 },
    { id: 2, latitude: 41.9005, longitude: 12.4937 },
  ];
  const cells = aggregateToGrid(records, 12);
  assert.equal(cells.length, 1);
  assert.ok(Math.abs(cells[0].centroidLat - (41.9004 + 41.9005) / 2) < 1e-4);
  assert.ok(Math.abs(cells[0].centroidLng - (12.4936 + 12.4937) / 2) < 1e-4);
});

test("aggregateToGrid: finer cells at higher zoom (same records, more cells)", () => {
  const records = makeRecords(700);
  const coarse = aggregateToGrid(records, 5);
  const fine = aggregateToGrid(records, 8);
  assert.ok(fine.length > coarse.length, "zoom-in splits cells");
});

test("aggregateToGrid: zooming into a cell centroid empties it (zoom-in contract)", () => {
  // The badge click zooms +2 toward the centroid: at the new zoom the
  // members must be split across MORE (smaller) cells, so the same cell
  // key no longer holds all of them.
  const records = makeRecords(700);
  const cells = aggregateToGrid(records, 5);
  const biggest = cells.reduce((a, b) => (b.count > a.count ? b : a));
  const after = aggregateToGrid(records, 7);
  const surviving = after.find((cell) => cell.x === biggest.x && cell.y === biggest.y);
  assert.ok(!surviving || surviving.count < biggest.count, "zooming splits the badge cell");
});

// ---------------------------------------------------------------------------
// markersForViewport (component-facing entry point)
// ---------------------------------------------------------------------------

test("markersForViewport: NULL bounds -> empty layer (viewport-first)", () => {
  const records = makeRecords(700);
  const result = markersForViewport(records, null, 5);
  assert.deepEqual(result, { visible: [], cells: [], individual: [] },
    "before the first emitBounds NOTHING is materialised — never the full dataset");
});

test("markersForViewport: null bounds also guards the high-density case", () => {
  const records = makeRecords(7_400); // the real national dataset size
  const result = markersForViewport(records, null, 5);
  assert.equal(result.cells.length, 0, "no grid badges before the first bounds either");
  assert.equal(result.individual.length, 0);
});

test("markersForViewport: small visible set renders individual markers (no grid)", () => {
  const records = makeRecords(100);
  const result = markersForViewport(records, ITALY, 5);
  assert.equal(result.cells.length, 0, "no badges under MAX_INDIVIDUAL_MARKERS");
  assert.equal(result.individual.length, 100);
  assert.deepEqual(result.individual.map((r) => r.id), records.map((r) => r.id));
});

test("markersForViewport: high zoom renders individual markers (no grid)", () => {
  const records = makeRecords(700);
  const result = markersForViewport(records, ITALY, GRID_MAX_ZOOM);
  assert.equal(result.cells.length, 0);
  assert.equal(result.individual.length, 700);
});

test("markersForViewport: dense low-zoom view aggregates into badges", () => {
  const records = makeRecords(700);
  const result = markersForViewport(records, ITALY, 5);
  assert.ok(result.cells.length > 0, "badges rendered");
  assert.ok(result.cells.length < 700, "far fewer DOM nodes than records");
  assert.ok(result.cells.every((cell) => cell.count > 1), "multi-record cells only in `cells`");
});

test("markersForViewport: NO RECORD LOSS — cells + individual cover every visible record", () => {
  const records = makeRecords(700);
  const result = markersForViewport(records, ITALY, 5);
  const inCells = result.cells.flatMap((cell) => cell.ids);
  const ids = new Set([...inCells, ...result.individual.map((r) => r.id)]);
  assert.equal(ids.size, result.visible.length, "no record dropped by aggregation");
  assert.equal(result.visible.length, 700, "visible = full viewport set (same as sidebar list)");
});

test("markersForViewport: single-record cells render as individual markers (no '1' badge)", () => {
  // A tight Rome cluster (all inside one 48px cell at z5 — ~235 km) plus two
  // genuinely isolated records (Milan, Sicily): the isolated records are
  // alone in their cells and must render as normal individual markers, not
  // as '1' badges (clicking a '1' badge would zoom instead of opening the
  // popup). NOTE: at z5 a 48px cell spans ~235 km, so the isolation has to
  // be hundreds of km, not tens — the previous fixture put Milan ~50 km
  // from the cluster edge and they legitimately shared a cell.
  const cluster = [];
  for (let i = 0; i < 300; i += 1) {
    cluster.push({ id: i + 1, latitude: 41.89 + (i % 20) * 0.001, longitude: 12.48 + Math.floor(i / 20) * 0.001 });
  }
  const records = [
    ...cluster,
    { id: 1001, latitude: 45.4642, longitude: 9.19 },  // Milan, isolated
    { id: 1002, latitude: 37.5, longitude: 14.0 },     // Sicily, isolated
  ];
  const result = markersForViewport(records, ITALY, 5);
  assert.ok(result.cells.every((cell) => cell.count > 1), "no single-record badge cells");
  assert.ok(result.individual.some((r) => r.id === 1001), "Milan renders individually");
  assert.ok(result.individual.some((r) => r.id === 1002), "Sicily renders individually");
  assert.ok(!result.individual.some((r) => r.id <= 300), "dense cluster stays aggregated");
});

test("markersForViewport: the deep-linked record stays in `visible` even when aggregated", () => {
  // Component contract: ?focus=ID is looked up in `visible` and rendered as
  // an individual marker ON TOP of the grid — so the record must always be
  // present in `visible` regardless of aggregation.
  const records = makeRecords(700);
  const result = markersForViewport(records, ITALY, 5);
  const deepLinked = records[42];
  assert.ok(result.visible.some((r) => r.id === deepLinked.id),
    "selected record is part of the viewport set even when the view is a grid");
});

test("markersForViewport: culling respects the viewport (records outside bounds excluded)", () => {
  const records = makeRecords(700);
  const romeOnly = { south: 41.8, north: 42.0, west: 12.4, east: 12.6 };
  const result = markersForViewport(records, romeOnly, 5);
  assert.ok(result.visible.length < records.length, "view outside the viewport is culled");
  assert.ok(result.visible.every((r) => r.latitude >= 41.8 && r.latitude <= 42.0));
});

// ---------------------------------------------------------------------------
// Constants (documented thresholds — keep the component/tests in lockstep)
// ---------------------------------------------------------------------------

test("grid constants: 48px cells, individual above z14 or under 250 visible", () => {
  assert.equal(GRID_CELL_PX, 48, "one badge per 48px screen box");
  assert.equal(GRID_MAX_ZOOM, 14, "street-level zoom renders individuals");
  assert.equal(MAX_INDIVIDUAL_MARKERS, 250, "cheap views skip aggregation");
});
