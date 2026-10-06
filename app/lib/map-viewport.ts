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

/** Longitude domain served by the API (server contract: west<east, within world). */
const WORLD_WEST = -180;
const WORLD_EAST = 180;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Normalize a RAW Leaflet viewport rectangle into one or two SERVER-VALID
 * geographic rectangles (each with west < east inside [-180, 180]).
 *
 * Leaflet can emit longitudes outside ±180 while panning around the globe
 * (a world view reported e.g. west=-224, east=249) or a rectangle that wraps
 * the antimeridian (west > east). The bbox API only accepts a plain
 * geographic rectangle (`west<east` within world bounds) and answers 400
 * otherwise — so the raw viewport is normalized HERE, once, and the SAME
 * result drives fetching, list visibility and marker aggregation (no
 * divergent per-consumer geometry).
 *
 *  - a span of 360° or more is the whole world (single [-180, 180] rect);
 *  - a narrow wrap is split into the two geographic halves, so neither side
 *    of the dateline is lost and no rectangle ever inverts west/east.
 */
export function viewportRectangles(bounds: ViewportBounds): ViewportBounds[] {
  const south = clamp(Math.min(bounds.south, bounds.north), -90, 90);
  const north = clamp(Math.max(bounds.south, bounds.north), -90, 90);
  // Raw span, tolerant of Leaflet's unwrapped (east > 180) and wrapped
  // (west > east) forms.
  let width = bounds.east - bounds.west;
  if (width < 0) width += 360;
  if (!Number.isFinite(width) || width >= 360) {
    return [{ south, north, west: WORLD_WEST, east: WORLD_EAST }];
  }
  // Fast path: already a valid geographic rectangle. Returned VERBATIM (no
  // re-projection) so boundary values stay exact and edges stay inclusive.
  if (bounds.west >= WORLD_WEST && bounds.east <= WORLD_EAST && bounds.west < bounds.east) {
    return [{ south, north, west: bounds.west, east: bounds.east }];
  }
  const normalize = (value: number) =>
    value >= WORLD_WEST && value < WORLD_EAST
      ? value
      : ((((value + 180) % 360) + 360) % 360) - 180;
  const west = normalize(bounds.west);
  const east = west + width;
  if (east <= WORLD_EAST) {
    return [{ south, north, west, east }];
  }
  // Crosses the antimeridian: two geographic rectangles, each west<east.
  return [
    { south, north, west, east: WORLD_EAST },
    { south, north, west: WORLD_WEST, east: east - 360 },
  ];
}

/**
 * Records whose coordinates fall inside the viewport rectangle. A null
 * bounds (viewport not emitted yet) keeps every record — the list must
 * never go blank while the map is still initialising.
 *
 * The raw viewport is normalized through `viewportRectangles` first, so the
 * SAME predicate tolerates Leaflet longitudes outside ±180 and the
 * antimeridian wrap that the fetch layer normalizes for the API.
 */
export function recordsInBounds<T extends { latitude: number; longitude: number }>(
  records: readonly T[],
  bounds: ViewportBounds | null,
): T[] {
  if (!bounds) return [...records];
  const rectangles = viewportRectangles(bounds);
  return records.filter((record) =>
    rectangles.some((rect) =>
      record.latitude >= rect.south &&
      record.latitude <= rect.north &&
      record.longitude >= rect.west &&
      record.longitude <= rect.east,
    ),
  );
}

/**
 * Minimum side (degrees) for a geocoder bounding box to be framed as an
 * AREA. Nominatim returns a box for every hit; a point/address box is
 * sub-100 m and would fitBounds to an unreadable street zoom, so those keep
 * the practical point + zoom fallback instead.
 */
export const MIN_GEOCODE_BBOX_SPAN_DEG = 0.02;

/**
 * Longitude of the viewport centre in Leaflet's UNWRAPPED frame (the same
 * frame `getBounds()` reports). For a dateline-crossing view (raw
 * west=170/east=190 or west=-190/east=-170) this is ≈180 / ≈-180, i.e. the
 * centre of the world COPY the map is actually showing — the reference used
 * to place geometry on the visible copy.
 */
export function viewportCenterLongitude(bounds: ViewportBounds): number {
  let width = bounds.east - bounds.west;
  if (width < 0) width += 360;
  return bounds.west + width / 2;
}

/**
 * Shift a longitude into the world copy nearest `referenceLng` (B03). Leaflet
 * projects longitudes LINEARLY, so a camera stored at -179 renders near the
 * far-west edge of the world while a dateline-crossing view (raw 170..190)
 * shows the copy around +180: without this shift a record IS in the viewport
 * (list + visibility) but its marker/badge projects OFF the visible copy.
 * Native world-copy maths, no projection rewrite.
 */
export function longitudeInCopy(lng: number, referenceLng: number): number {
  return lng + 360 * Math.round((referenceLng - lng) / 360);
}

/**
 * Validate a Nominatim bounding box — `[south, north, west, east]` strings,
 * the geocoder proxy's minimized shape — into a usable `ViewportBounds`, or
 * null when it must NOT be trusted as an area: non-array, non-numeric,
 * inverted (south>=north or west>=east), outside world bounds, or too small
 * to be a city/province/region. The caller falls back to the point.
 */
export function geocodeBounds(boundingbox: readonly unknown[] | null | undefined): ViewportBounds | null {
  if (!Array.isArray(boundingbox) || boundingbox.length !== 4) return null;
  const [south, north, west, east] = boundingbox.map((value) => Number(value));
  if (![south, north, west, east].every((value) => Number.isFinite(value))) return null;
  if (south >= north || west >= east) return null;
  if (south < -90 || north > 90 || west < -180 || east > 180) return null;
  if (north - south < MIN_GEOCODE_BBOX_SPAN_DEG || east - west < MIN_GEOCODE_BBOX_SPAN_DEG) return null;
  return { south, north, west, east };
}

/**
 * Shareable map view (?lat&lng&zoom, t_702c10af follow-up): a plain
 * serialisable centre + integer zoom, read once from the /mappa URL on the
 * initial load and written back (debounced) on every pan/zoom so the URL is
 * always a permalink to what the map is showing.
 */
export type MapView = {
  lat: number;
  lng: number;
  zoom: number;
};

/**
 * Leaflet's largest zoom in this repo (the tile layer's maxZoom in
 * SurveillanceMap is 19), i.e. the inclusive upper bound of a valid zoom.
 */
export const MAP_MAX_ZOOM = 19;

/**
 * Lenient parse of the viewport deep link (same contract as
 * `parseCameraFilters`): reads `lat`, `lng`, `zoom` and returns the view, or
 * null when ANY of them is missing, empty, non-numeric, or out of range
 * (lat ∈ [-90, 90], lng ∈ [-180, 180], zoom ∈ [0, 19]). Never throws — a
 * malformed deep link renders the default Rome view instead of a 500.
 */
export function parseMapView(searchParams: URLSearchParams): MapView | null {
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const zoomRaw = searchParams.get("zoom");
  // Empty string is a present-but-invalid param (`?lat=`): Number("") is 0,
  // which would silently pass as a valid coordinate — reject it explicitly.
  if (!latRaw || !lngRaw || !zoomRaw) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  const zoom = Number(zoomRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  if (zoom < 0 || zoom > MAP_MAX_ZOOM) return null;
  return { lat, lng, zoom };
}

/**
 * Serialize a viewport for the URL: `lat=<6 decimals>&lng=<6 decimals>&
 * zoom=<integer>`. Six decimals keep the URL short while staying sub-metre
 * precise (≈0.11 m at the equator); zoom is always an integer in Leaflet.
 */
export function stringifyMapView(view: MapView): string {
  return `lat=${view.lat.toFixed(6)}&lng=${view.lng.toFixed(6)}&zoom=${Math.round(view.zoom)}`;
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
