import { env } from "cloudflare:workers";
import { findNearbyPublicCamerasPage, NEARBY_PAGE_DEFAULT_LIMIT, NEARBY_PAGE_MAX_LIMIT } from "../../../../db/cameras";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { MAX_PAGE_OFFSET, urlTooLong } from "../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";

function readNumber(value: string | null) { if (value === null || value.trim() === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function readPageNumber(value: string | null, fallback: number, max: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) return null;
  return Math.min(parsed, max);
}

/**
 * GET /api/cameras/nearby — paginated proximity search (FRONTEND_PLAN
 * § 3.2.3). Returns public records around a coordinate, ordered by distance,
 * with the same pagination contract as the directory list
 * ({ records, total, nextOffset }), default page 50 (hard cap 100). The
 * pre-submit duplicate warning on the report form calls this with limit=8 to
 * keep its warning compact; the server-side duplicate check (POST
 * /api/cameras) keeps using findNearbyPublicCameras directly.
 */
export async function GET(request: Request) {
  // Input limits: reject absurdly long URLs before any query parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Rate limits: nearby search is public and cheap to hammer, so it gets its
  // own bucket independent of the plain read and export buckets.
  const key = callerKey(request);
  const limitOptions = limitsFor("nearby", env);
  const rateLimit = checkRateLimit("nearby", key, limitOptions);
  if (!rateLimit.allowed) {
    console.warn("GET /api/cameras/nearby rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/nearby",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const query = new URL(request.url).searchParams;
  const latitude = readNumber(query.get("latitude"));
  const longitude = readNumber(query.get("longitude"));
  const radius = query.has("radius") ? readNumber(query.get("radius")) : 75;
  const limit = readPageNumber(query.get("limit"), NEARBY_PAGE_DEFAULT_LIMIT, NEARBY_PAGE_MAX_LIMIT);
  const offset = readPageNumber(query.get("offset"), 0, Number.MAX_SAFE_INTEGER);

  if (latitude === null || longitude === null || radius === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || radius < 10 || radius > 500) {
    return Response.json({ error: "Valid latitude, longitude and a radius between 10 and 500 metres are required." }, { status: 400 });
  }
  if (limit === null || offset === null || limit < 1 || offset > MAX_PAGE_OFFSET) {
    return Response.json({ error: `limit must be an integer between 1 and ${NEARBY_PAGE_MAX_LIMIT} and offset a non-negative integer up to ${MAX_PAGE_OFFSET}.` }, { status: 400 });
  }

  try {
    const page = await findNearbyPublicCamerasPage(latitude, longitude, radius, { limit, offset });
    // Nearby results derive from moderation state (a decision can withdraw a
    // point), and the query embeds the caller's location: the response is
    // never stored at the edge or in browsers.
    return Response.json({ records: page.records, total: page.total, nextOffset: page.nextOffset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/cameras/nearby failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
