/**
 * Reverse geocoding (CEO 2026-08-07): coordinate → nearest address via
 * Nominatim (OpenStreetMap), with a persistent D1 cache so the same
 * position is never requested twice ("salviamo il record così non dobbiamo
 * richiederlo ogni volta").
 *
 * Caching strategy (migration 0041):
 *   - the cache table `geocode_reverse_cache` stores lat/lng → address
 *     with a PRIMARY KEY on the ROUNDED coordinates (~4 decimals ≈ 11 m),
 *     so nearby records (e.g. two cameras on the same corner) hit the
 *     same row instead of re-asking Nominatim;
 *   - the backfill script (scripts/reverse-geocode-backfill.mjs) fills the
 *     cache + the cameras.address column for records that lack one, at
 *     ~1 request/second (Nominatim usage policy), never re-processing a
 *     record that already has an address;
 *   - the live lookup below is cache-first: a hit never touches the
 *     network. On a miss it asks Nominatim with the SAME identifying
 *     User-Agent as the forward geocoder (usage policy) and stores the
 *     reply under the rounded key.
 *
 * Safety: the reply is stored verbatim as a display string (no
 * requestor data); a failed/overloaded geocoder throws and the caller
 * turns that into a truthful "unavailable" — never a fabricated address.
 */

import { env } from "cloudflare:workers";
import { getD1 } from "./cameras";

export type ReverseGeocodeResult = {
  /** Nominatim display_name of the nearest addressable place (street/building). */
  address: string;
  /** True when the reply came from the persistent cache, false after a live lookup. */
  cached: boolean;
};

const UPSTREAM_DEFAULT = "https://nominatim.openstreetmap.org";
const REVERSE_UA =
  "OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb.org)";
const REVERSE_ACCEPT = "application/json";
const REVERSE_TIMEOUT_MS = 5_000;
/** Rounded-key precision: ~11 m at the equator (4 decimals). */
export const CACHE_ROUND_DECIMALS = 4;

/** Round coordinates to the cache key precision (~11 m). */
export function cacheKey(latitude: number, longitude: number): [number, number] {
  const factor = 10 ** CACHE_ROUND_DECIMALS;
  return [Math.round(latitude * factor) / factor, Math.round(longitude * factor) / factor];
}

/**
 * Reverse geocode a position, cache-first. Returns the nearest address or
 * null when Nominatim has nothing addressable there.
 */
export async function reverseGeocode(
  db: Awaited<ReturnType<typeof getD1>>,
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> {
  const [latKey, lngKey] = cacheKey(latitude, longitude);
  const cached = await db
    .prepare("SELECT address FROM geocode_reverse_cache WHERE lat = ? AND lng = ?")
    .bind(latKey, lngKey)
    .first<{ address: string }>();
  if (cached?.address) {
    return { address: cached.address, cached: true };
  }

  // Privacy boundary: use the same rounded key for the upstream request, not
  // merely for the cache. Browser/device coordinates can be sub-metre; an
  // approximate public-infrastructure address needs ~11m precision and the
  // published privacy notice promises Nominatim never sees more than that.
  const address = await fetchReverseAddress(latKey, lngKey);
  if (!address) return null;

  await db
    .prepare(
      "INSERT INTO geocode_reverse_cache (lat, lng, address, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(lat, lng) DO UPDATE SET address = excluded.address, updated_at = excluded.updated_at",
    )
    .bind(latKey, lngKey, address, new Date().toISOString())
    .run();
  return { address, cached: false };
}

async function fetchReverseAddress(latitude: number, longitude: number): Promise<string | null> {
  const base = String(env.GEOCODER_BASE_URL ?? UPSTREAM_DEFAULT);
  const url = `${base}/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&zoom=18`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": REVERSE_UA, Accept: REVERSE_ACCEPT },
      signal: AbortSignal.timeout(REVERSE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { display_name?: string; error?: string };
    if (body.error || typeof body.display_name !== "string" || body.display_name.length === 0) return null;
    return body.display_name;
  } catch {
    return null;
  }
}
