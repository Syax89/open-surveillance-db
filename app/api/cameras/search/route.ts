import { env } from "cloudflare:workers";
import { searchPublicCamerasNearPage, SEARCH_PAGE_DEFAULT_LIMIT, SEARCH_PAGE_MAX_LIMIT } from "../../../../db/cameras";
import { resolvePlace } from "../../../../db/geocode";
import { callerKey, checkRateLimit, searchLimits } from "../../../lib/rate-limit";
import {
  coordinateRadiusMeters,
  formatDistance,
  maxQueryLength,
  parseCoordinateQuery,
  radiusForBoundingBox,
} from "../../../lib/search";

/**
 * Public search by locality, address, or coordinates (GET /api/cameras/search).
 *
 * The route resolves the query to a point plus a search radius, then returns
 * every reviewed public record near that area. It never claims coverage: an
 * empty `records` array means only that no published record falls inside the
 * area, and every failure mode returns a truthful "unavailable" response
 * instead of fabricated results.
 *
 * Resolution order:
 *  1. A raw coordinate pair ("41.9004, 12.4936") searches a fixed radius
 *     without touching the external geocoder.
 *  2. Any other text is resolved to a place through the geocoder
 *     (db/geocode.ts, Nominatim). The place's bounding box decides the
 *     radius, so "near a street" stays small while "near a city" scales up.
 *
 * The response carries the resolved area explicitly so clients can show a
 * text description of what was searched and a truthful zero-result state,
 * and uses the same pagination contract as the directory list
 * ({ records, total, nextOffset }, FRONTEND_PLAN § 3.2.3) so the frontend
 * reuses one pagination helper.
 */

type SearchArea = {
  kind: "coordinates" | "place";
  displayName?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

function readPageNumber(value: string | null, fallback: number, max: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) return null;
  return Math.min(parsed, max);
}

async function searchArea(query: string, area: SearchArea, limit: number, offset: number) {
  try {
    const page = await searchPublicCamerasNearPage(area.latitude, area.longitude, area.radiusMeters, { limit, offset });
    return Response.json({
      query,
      area: {
        kind: area.kind,
        ...(area.displayName ? { displayName: area.displayName } : {}),
        latitude: area.latitude,
        longitude: area.longitude,
        radiusMeters: area.radiusMeters,
        radiusLabel: formatDistance(area.radiusMeters),
      },
      count: page.total,
      records: page.records,
      total: page.total,
      nextOffset: page.nextOffset,
    }, {
      // Queries are user input; do not let edge caches store them.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/cameras/search failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return Response.json({ error: "A locality, address, or coordinates are required." }, { status: 400 });
  }
  if (query.length > maxQueryLength) {
    return Response.json({ error: "That search is too long. Try a shorter locality, address, or coordinates." }, { status: 400 });
  }

  // Pagination (FRONTEND_PLAN § 3.2.3): same limit/offset contract as the
  // list, default 25, hard cap 100. Invalid values answer 400 before any
  // geocoder or database work.
  const limit = readPageNumber(url.searchParams.get("limit"), SEARCH_PAGE_DEFAULT_LIMIT, SEARCH_PAGE_MAX_LIMIT);
  const offset = readPageNumber(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER);
  if (limit === null || offset === null || limit < 1) {
    return Response.json({ error: `limit must be an integer between 1 and ${SEARCH_PAGE_MAX_LIMIT} and offset a non-negative integer.` }, { status: 400 });
  }

  const key = callerKey(request);
  const rateLimit = checkRateLimit("search", key, searchLimits(env));
  if (!rateLimit.allowed) {
    console.warn(`GET /api/cameras/search rate limited for caller ${key}`);
    return Response.json({ error: "Too many searches. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const coordinates = parseCoordinateQuery(query);
  if (coordinates) {
    return searchArea(query, {
      kind: "coordinates",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radiusMeters: coordinateRadiusMeters,
    }, limit, offset);
  }

  const language = url.searchParams.get("lang") === "it" ? "it" : "en";
  let place;
  try {
    place = await resolvePlace(query, { language });
  } catch (error) {
    console.error("GET /api/cameras/search geocoder failed", error);
    return Response.json({ error: "Search is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  if (!place) {
    return Response.json(
      { error: `We could not find a place matching "${query}". Try a different name or enter coordinates instead.` },
      { status: 404 },
    );
  }

  return searchArea(query, {
    kind: "place",
    displayName: place.displayName,
    latitude: place.latitude,
    longitude: place.longitude,
    radiusMeters: radiusForBoundingBox(place.boundingBox),
  }, limit, offset);
}
