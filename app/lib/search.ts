/**
 * Pure search helpers for the locality/address/coordinate search route.
 *
 * Everything in this module is side-effect free so the route stays easy to
 * test in plain Node and easy to reason about. Geometry here is deliberately
 * simple (haversine on a sphere) — good enough to say "near this place"
 * truthfully, never a claim of precise coverage.
 */

export const maxQueryLength = 200;
/** Records within this radius of a point entered as raw coordinates. */
export const coordinateRadiusMeters = 2_000;
/** Radius used when a resolved place has no usable bounding box. */
export const placeRadiusDefaultMeters = 10_000;
export const placeRadiusMinMeters = 1_000;
export const placeRadiusMaxMeters = 25_000;

export type LatLon = { latitude: number; longitude: number };

/**
 * Interpret the query as a pair of decimal-degree coordinates when it is
 * exactly two numbers separated by a comma, semicolon, or whitespace.
 * Commas are accepted as decimal separators. Out-of-range pairs do not match
 * so that text like "91, 12" falls through to place search instead of
 * producing a nonsense point. A comma separator combined with comma decimal
 * separators is rejected too: "1,2,3" is ambiguous (1.2 / 3 vs 1 / 2.3) and
 * must never be guessed.
 */
const COORDINATE_PATTERN = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*([,;\s])\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;

export function parseCoordinateQuery(query: string): LatLon | null {
  const match = COORDINATE_PATTERN.exec(query.trim());
  if (!match) return null;
  const [, rawLatitude, separator, rawLongitude] = match;
  if (separator === "," && (rawLatitude.includes(",") || rawLongitude.includes(","))) return null;
  const latitude = Number(rawLatitude.replace(",", "."));
  const longitude = Number(rawLongitude.replace(",", "."));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/**
 * Public-boundary text filter: matches only fields that are already part of
 * the public record shape (never `notes`), case-insensitively.
 */
export function textMatches(record: {
  title: string;
  kind: string;
  manufacturer?: string | null;
  address?: string | null;
  source: string;
  description: string;
  latitude: number;
  longitude: number;
}, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return false;
  const latitude = record.latitude.toFixed(5);
  const longitude = record.longitude.toFixed(5);
  const haystack = [
    record.title,
    record.kind,
    record.manufacturer,
    record.address,
    record.source,
    record.description,
    latitude,
    longitude,
    `${latitude}, ${longitude}`,
  ].filter((value): value is string => Boolean(value)).join(" ").toLocaleLowerCase();
  return haystack.includes(needle);
}

/** Great-circle distance in metres between two points. */
export function distanceInMeters(from: LatLon, to: LatLon): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const latitudeStart = toRadians(from.latitude);
  const latitudeEnd = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeStart) * Math.cos(latitudeEnd) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export type BoundingBox = { south: number; north: number; west: number; east: number };

/**
 * Turn a geocoder bounding box into a search radius: half the box diagonal,
 * clamped to a sane range. The box tells us how big the resolved place is
 * (a street is small, a city is large), so "near this place" scales with the
 * place instead of pretending one fixed radius is truthful everywhere.
 */
export function radiusForBoundingBox(box: BoundingBox): number {
  const halfDiagonal = distanceInMeters(
    { latitude: box.south, longitude: box.west },
    { latitude: box.north, longitude: box.east },
  ) / 2;
  return Math.min(
    placeRadiusMaxMeters,
    Math.max(placeRadiusMinMeters, halfDiagonal),
  );
}

/** Human-readable radius, e.g. 2000 -> "2 km", 750 -> "750 m". */
export function formatDistance(radiusMeters: number): string {
  if (radiusMeters < 1_000) return `${Math.round(radiusMeters)} m`;
  const kilometres = radiusMeters / 1_000;
  const rounded = Math.round(kilometres * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} km`;
}
