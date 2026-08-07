import { env } from "cloudflare:workers";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { callerKey, checkRateLimit, geocodeLimits } from "../../../lib/rate-limit";
import { reverseGeocode } from "../../../../db/reverse-geocode";

/**
 * Reverse geocoding endpoint (CEO 2026-08-07): GET /api/geocode/reverse?lat=…&lng=…
 * returns the nearest address for a position, so the /segnala form can
 * prefill its "approximate address" field when the user picks a point on
 * the map.
 *
 * Compliance posture — same as the forward geocode proxy
 * (docs/OSM_INTEGRATION.md §8):
 *   - cache-first: the persistent D1 cache (geocode_reverse_cache,
 *     migration 0041) serves repeat/nearby positions WITHOUT any network
 *     call ("salviamo il record così non dobbiamo richiederlo ogni volta");
 *   - only a cache MISS touches Nominatim, with the same identifying
 *     User-Agent as the forward geocoder (usage policy);
 *   - a per-caller rate limit (same GEOCODE_RATE_LIMIT_* knobs, default
 *     30/min) keeps any scrape far below the ~1 req/s policy ceiling;
 *   - strict input validation: lat ∈ [-90, 90], lng ∈ [-180, 180], so the
 *     endpoint cannot be used to probe the geocoder with arbitrary input.
 *
 * Privacy: only the public Nominatim display string is returned — no
 * requestor data is stored.
 */

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawLat = url.searchParams.get("lat");
  const rawLng = url.searchParams.get("lng");
  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (
    rawLat === null ||
    rawLng === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return Response.json(
      { error: "Valid lat ([-90, 90]) and lng ([-180, 180]) query parameters are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Per-caller rate limit (same bucket as the forward geocode proxy).
  const key = callerKey(request, env);
  const limitOptions = geocodeLimits(env);
  const limit = await checkRateLimit(env, "geocode", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/geocode/reverse rate limited");
    recordRateLimitBlock(env, {
      route: "/api/geocode/reverse",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json(
      { error: "Too many address lookups. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!env.DB) {
    console.error("GET /api/geocode/reverse: database binding unavailable");
    return Response.json(
      { error: "Address lookup is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await reverseGeocode(env.DB, lat, lng);
    // Cache-Control: the reply is stable (OSM addresses change rarely) and
    // the D1 cache is the source of truth — an edge cache just saves DB
    // reads for identical repeat queries.
    const headers = {
      "Cache-Control": result ? "public, max-age=86400" : "no-store",
      "X-Geocode-Reverse-Cache": result?.cached ? "hit" : "miss",
    };
    return Response.json({ address: result?.address ?? null }, { headers });
  } catch (error) {
    console.error("GET /api/geocode/reverse failed", error);
    return Response.json(
      { error: "Address lookup is temporarily unavailable. Please try again shortly." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
