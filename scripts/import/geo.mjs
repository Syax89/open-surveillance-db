// Geo primitives for the import pipeline (FONTI PUBBLICHE FASE A, kanban
// t_6030d390; docs/data-sources/normalizzazione-pipeline.md §4/§7).
// Pure functions — no Cloudflare/DB binding — so the test suite can
// exercise them directly in plain Node.
//
// Distances are measured with the same haversine used by db/cameras.ts
// (6 371 km earth radius) so import dedup and the public nearby checks
// agree. Coordinates are WGS84 (EPSG:4326) decimal degrees.

/** Earth radius in meters, matching db/cameras.ts distanceInMeters. */
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function haversineMeters(fromLat, fromLon, toLat, toLon) {
  const latDelta = toRadians(toLat - fromLat);
  const lonDelta = toRadians(toLon - fromLon);
  const latStart = toRadians(fromLat);
  const latEnd = toRadians(toLat);
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latStart) * Math.cos(latEnd) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Approximate lat/lon bounding box around a point for the D1 pre-filter
 * (same pattern as db/cameras.ts listPublicCamerasNear: ~1° latitude ≈
 * 111 320 m; longitude degrees shrink with cos(latitude)). The box is a
 * selective pre-filter, never the exact answer — the caller still runs
 * haversine over the box's rows.
 */
export function bboxAround(latitude, longitude, radiusMeters) {
  const latDelta = radiusMeters / 111_320;
  const lonDelta =
    radiusMeters / (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLon: longitude - lonDelta,
    maxLon: longitude + lonDelta,
  };
}

/** Round a coordinate to 4 decimals (~11 m snap cell, ADR 0008 public rounding). */
export function snapCoordinate(value) {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Parse a source direction value into an integer bearing 0-359 (design §3.5):
 *   - numeric string / number `0..359` (360 → 0);
 *   - compass word (EN `N, NNE, NE, …` and IT `nord, nord-est, …`): the
 *     centre of the sector, 16-wind rose → 22.5° steps rounded to integer;
 *   - anything else / missing → null.
 */
const COMPASS = {
  // 8-wind rose, EN + IT.
  n: 0, north: 0, nord: 0,
  ne: 45, "north-east": 45, "nord-est": 45,
  e: 90, east: 90, est: 90,
  se: 135, "south-east": 135, "sud-est": 135,
  s: 180, south: 180, sud: 180,
  sw: 225, "south-west": 225, "sud-ovest": 225,
  w: 270, west: 270, ovest: 270,
  nw: 315, "north-west": 315, "nord-ovest": 315,
  // 16-wind rose: 22.5° half-steps (EN only — IT compass cards rarely go
  // finer than the 8-wind; the generic parser still accepts them).
  nne: 22, "north-north-east": 22,
  ene: 67, "east-north-east": 67,
  ese: 112, "east-south-east": 112,
  sse: 157, "south-south-east": 157,
  ssw: 202, "south-south-west": 202,
  wsw: 247, "west-south-west": 247,
  wnw: 292, "west-north-west": 292,
  nnw: 337, "north-north-west": 337,
};

/**
 * Normalise a direction value (design §3.5): strips diacritics, lowercases,
 * collapses separators before the compass lookup so `nord-est`, `Nord Est`
 * and `NORD-EST` all resolve.
 */
export function parseDirection(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return normalizeBearing(value);
  }
  const text = String(value).trim();
  if (text === "") return null;
  const numeric = Number(text);
  if (!Number.isNaN(numeric) && text !== "") {
    return normalizeBearing(numeric);
  }
  const key = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const bearing = COMPASS[key];
  return bearing === undefined ? null : bearing;
}

/** Normalise any bearing to [0, 359]: 360 → 0, negative → wrap. */
export function normalizeBearing(value) {
  const v = Math.round(value) % 360;
  return v < 0 ? v + 360 : v;
}
