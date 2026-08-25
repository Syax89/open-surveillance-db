/**
 * Pure viewport-mapping helpers for the interactive map tool (/mappa
 * redesign, kanban t_702c10af).
 *
 * Everything in this module is side-effect free so the viewport→list
 * contract is unit-testable in plain Node (tests/map-viewport.test.mjs):
 * the component layer calls `recordsInBounds` with the map's current
 * LatLngBounds converted to a plain `ViewportBounds` object, and the list
 * shows exactly the records inside those bounds.
 *
 * The bounds object mirrors the four getters of Leaflet's LatLngBounds
 * (getSouth/getNorth/getWest/getEast). Longitude containment handles the
 * antimeridian the same way Leaflet does: when `west > east` the bounds
 * wrap around ±180°, so a record matches when its longitude is >= west OR
 * <= east. Edges are inclusive.
 */

/** Milliseconds to debounce moveend/zoomend before refreshing the list (raised 200→500ms for 160k dataset). */
export const BOUNDS_DEBOUNCE_MS = 500;

/** Plain serialisable rectangle of the current map viewport. */
export type ViewportBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

/**
 * Records whose coordinates fall inside the viewport rectangle. A null
 * bounds (viewport not emitted yet) keeps every record — the list must
 * never go blank while the map is still initialising.
 */
export function recordsInBounds<T extends { latitude: number; longitude: number }>(
  records: readonly T[],
  bounds: ViewportBounds | null,
): T[] {
  if (!bounds) return [...records];
  const { south, north, west, east } = bounds;
  const crossesAntimeridian = west > east;
  return records.filter((record) => {
    if (record.latitude < south || record.latitude > north) return false;
    if (crossesAntimeridian) {
      return record.longitude >= west || record.longitude <= east;
    }
    return record.longitude >= west && record.longitude <= east;
  });
}

/**
 * HTML-escape a string for safe interpolation into marker popup markup.
 * Popup content mixes public record fields (title, kind, address,
 * description) with trusted UI strings; without escaping a record field
 * containing markup could break out of the popup DOM (the public API is
 * moderated, but popup HTML is assembled client-side and must stay inert).
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
