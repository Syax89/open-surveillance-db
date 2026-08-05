/**
 * Native pixel-grid aggregation for the interactive map (kanban t_26ce96f3 —
 * CEO 2026-08-05: "visualizzazione lenta" with 7.374+ points).
 *
 * The problem, measured on the real dataset (scripts/benchmark-map.mjs):
 * at national zoom (z5) the viewport contains ALL public records, so the
 * previous marker layer materialised 7.378 L.divIcon DOM nodes — pan fell
 * to ~6-14 fps and a 2-level zoom-in took ~1s. The fix is two-fold and
 * uses ZERO new libraries:
 *
 *  1. Viewport-first: markers are ONLY created once the map has emitted its
 *     first bounds (viewportBounds). Before that the pane stays empty —
 *     never materialise the full dataset on first paint. The sidebar list
 *     keeps its "never blank" contract via recordsInBounds(records, null)
 *     (text, cheap); the map waits one frame for the first emitBounds.
 *
 *  2. Pixel-grid aggregation: above a density threshold (or below a zoom
 *     threshold) the visible records are bucketed into screen-pixel cells
 *     (Web Mercator world pixels at the current zoom, cellSizePx cells).
 *     Each NON-EMPTY cell renders ONE divIcon badge showing the count;
 *     clicking a badge zooms in 2 levels toward the cell centroid, and the
 *     rebuild then shows either smaller cells or individual markers. Cells
 *     with a single record render as a normal individual marker instead of
 *     a "1" badge (no pointless indirection). Individual markers (with
 *     popup/tooltip) are used only when visible count <= threshold or
 *     zoom >= GRID_MAX_ZOOM.
 *
 * Everything in this module is pure and unit-testable in plain Node
 * (tests/map-grid.test.mjs): the component layer calls `markersForViewport`
 * and renders whatever comes back.
 */

import { recordsInBounds, type ViewportBounds } from "./map-viewport";

/** Screen-pixel size of one aggregation cell (Web Mercator world px). */
export const GRID_CELL_PX = 48;
/** Zoom at or above which markers are ALWAYS individual (street level). */
export const GRID_MAX_ZOOM = 14;
/** Visible-record count at or below which markers are individual even at low zoom. */
export const MAX_INDIVIDUAL_MARKERS = 250;

export type GridCell = {
  /** Cell coordinates in world-pixel units (floor of projected px / cellPx). */
  x: number;
  y: number;
  count: number;
  /** Centroid of the members, projected back to geographic coords. */
  centroidLat: number;
  centroidLng: number;
  /** Ids of the records aggregated into this cell. */
  ids: number[];
};

/**
 * Web Mercator projection (EPSG:3857) to world pixels at a zoom level —
 * the same maths Leaflet uses internally (worldSize = 256 * 2^zoom).
 * Pure so the grid logic is testable without a map instance.
 */
export function webMercatorProject(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const worldSize = 256 * 2 ** zoom;
  const x = ((longitude + 180) / 360) * worldSize;
  const latRad = (latitude * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * worldSize;
  return { x, y };
}

/** Inverse Web Mercator: world pixel -> geographic coordinates (EPSG:3857). */
export function webMercatorUnproject(x: number, y: number, zoom: number): { latitude: number; longitude: number } {
  const worldSize = 256 * 2 ** zoom;
  const longitude = (x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude, longitude };
}

/**
 * Decision rule: should the CURRENT view render grid badges instead of
 * individual markers? Individual markers win when the user is close enough
 * to read them (zoom >= GRID_MAX_ZOOM) or when the visible set is small
 * enough to be cheap (<= MAX_INDIVIDUAL_MARKERS). Everything else — the
 * 7.374-point national view — aggregates.
 */
export function shouldUseGrid(visibleCount: number, zoom: number): boolean {
  if (zoom >= GRID_MAX_ZOOM) return false;
  return visibleCount > MAX_INDIVIDUAL_MARKERS;
}

/**
 * Bucket records into screen-pixel cells at the given zoom. Cells are keyed
 * by (floor(worldPx.x / cellPx), floor(worldPx.y / cellPx)) — a record in
 * the same 48px screen box as another lands in the same cell regardless of
 * its exact position, which is exactly the "native pixel grid" the CEO
 * asked for. Returns only NON-EMPTY cells, each with count + member ids and
 * the member-averaged centroid (projected average, then unprojected — more
 * stable than averaging raw lat/lng across the antimeridian for our data).
 */
export function aggregateToGrid<T extends { id: number; latitude: number; longitude: number }>(
  records: readonly T[],
  zoom: number,
  cellPx: number = GRID_CELL_PX,
): GridCell[] {
  const cells = new Map<string, { x: number; y: number; count: number; sumX: number; sumY: number; ids: number[] }>();
  for (const record of records) {
    const { x, y } = webMercatorProject(record.latitude, record.longitude, zoom);
    const cx = Math.floor(x / cellPx);
    const cy = Math.floor(y / cellPx);
    const key = `${cx}:${cy}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { x: cx, y: cy, count: 0, sumX: 0, sumY: 0, ids: [] };
      cells.set(key, cell);
    }
    cell.count += 1;
    cell.sumX += x;
    cell.sumY += y;
    cell.ids.push(record.id);
  }
  return [...cells.values()].map((cell) => {
    const { latitude, longitude } = webMercatorUnproject(cell.sumX / cell.count, cell.sumY / cell.count, zoom);
    return {
      x: cell.x,
      y: cell.y,
      count: cell.count,
      centroidLat: latitude,
      centroidLng: longitude,
      ids: cell.ids,
    };
  });
}

/**
 * Single entry point for the marker layer (kanban t_26ce96f3): given the
 * full filtered camera list, the current viewport and the current zoom,
 * decide what to render — NOTHING before the first bounds, grid badges
 * at high density, individual markers otherwise.
 *
 * Contracts:
 *  - viewport-first: bounds === null -> empty (never materialise all
 *    records on first paint; the first emitBounds arrives right after the
 *    map is created, so the wait is one frame, not a blank screen);
 *  - no record loss: `visible` is the full recordsInBounds set (the same
 *    predicate the sidebar list uses), `cells` covers every visible record
 *    (each record lands in exactly one cell), `individual` covers the
 *    records in single-record cells;
 *  - deep link: `selectedId` is returned by the caller and rendered as an
 *    individual marker even when the rest of the view is aggregated (the
 *    component adds it on top of the grid — see SurveillanceMap).
 */
export function markersForViewport<T extends { id: number; latitude: number; longitude: number }>(
  records: readonly T[],
  bounds: ViewportBounds | null,
  zoom: number,
): { visible: T[]; cells: GridCell[]; individual: T[] } {
  if (!bounds) return { visible: [], cells: [], individual: [] };
  const visible = recordsInBounds(records, bounds);
  if (!shouldUseGrid(visible.length, zoom)) {
    return { visible, cells: [], individual: visible };
  }
  const cells = aggregateToGrid(visible, zoom);
  // Cells with a single member render as an individual marker (no "1"
  // badge): the click must open the record popup, not zoom into one point.
  const multiCells = cells.filter((cell) => cell.count > 1);
  const singleIds = new Set(cells.filter((cell) => cell.count === 1).flatMap((cell) => cell.ids));
  const individual = visible.filter((record) => singleIds.has(record.id));
  return { visible, cells: multiCells, individual };
}
