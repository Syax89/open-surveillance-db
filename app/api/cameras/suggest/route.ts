import { env } from "cloudflare:workers";
import { suggestPublicCameras } from "../../../../db/cameras";
import { CACHE_TAGS } from "../../../lib/cache-purge";
import { urlTooLong } from "../../../lib/input-limits";
import { withPublicCache } from "../../../lib/public-cache";
import { limitsFor } from "../../../lib/rate-limit";
import { rateLimitResponse } from "../../../lib/rate-limit-response";
import {
  maxQueryLength,
  normalizeSuggestQuery,
  SUGGEST_DEFAULT_LIMIT,
  SUGGEST_MAX_LIMIT,
  SUGGEST_MIN_QUERY_LENGTH,
} from "../../../lib/search";

/**
 * Search-as-you-type record suggestions (GET /api/cameras/suggest?q=&limit=).
 *
 * Privacy (2026-11): the suggestion dropdowns on the home hero, the map and
 * the directory ask ONLY this route while the visitor types — our own
 * public records, never a third party. The place geocoder (/api/geocode →
 * Nominatim) still runs only on an explicit submit.
 *
 * Contract:
 *   - public records only (shared public predicate in db/cameras.ts) and
 *     public fields only: { id, title, kind, address } — no coordinates,
 *     no notes;
 *   - q is normalised (trimmed, inner whitespace collapsed); fewer than
 *     SUGGEST_MIN_QUERY_LENGTH characters answers an empty list WITHOUT a
 *     database read; more than maxQueryLength answers 400;
 *   - limit defaults to SUGGEST_DEFAULT_LIMIT and is clamped to
 *     SUGGEST_MAX_LIMIT; a non-integer answers 400;
 *   - LIKE wildcards in q are escaped at the db boundary;
 *   - the same 5-minute public cache and "read" rate-limit bucket as the
 *     public list (a cache hit costs no D1 read and no bucket slot); the
 *     response is identical for every caller, so it is cacheable for
 *     anonymous requests and purged with the list tag on moderation;
 *   - the query text is NEVER logged (errors log only the failure).
 */
function readLimit(value: string | null): number | null {
  if (value === null || value.trim() === "") return SUGGEST_DEFAULT_LIMIT;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, SUGGEST_MAX_LIMIT);
}

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Cache-Tag": CACHE_TAGS.list };

export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }
  const params = new URL(request.url).searchParams;
  const query = normalizeSuggestQuery(params.get("q") ?? "");
  if (query.length > maxQueryLength) {
    return Response.json({ error: "That search is too long." }, { status: 400 });
  }
  const limit = readLimit(params.get("limit"));
  if (limit === null) {
    return Response.json({ error: `limit must be an integer between 1 and ${SUGGEST_MAX_LIMIT}.` }, { status: 400 });
  }
  if (query.length < SUGGEST_MIN_QUERY_LENGTH) {
    return Response.json({ suggestions: [] }, { headers: CACHE_HEADERS });
  }

  return withPublicCache(request, 300, async () => {
    const limited = await rateLimitResponse(request, {
      bucket: "read",
      route: "/api/cameras/suggest",
      env,
      limits: limitsFor("read", env),
      log: "GET /api/cameras/suggest rate limited (read bucket)",
    });
    if (limited) return limited;
    try {
      const suggestions = await suggestPublicCameras(query, limit);
      return Response.json({ suggestions }, { headers: CACHE_HEADERS });
    } catch (error) {
      // Never log the query text: only the failure itself.
      console.error("GET /api/cameras/suggest failed", error instanceof Error ? error.name : "error");
      return Response.json({ error: "Suggestions are temporarily unavailable." }, { status: 503 });
    }
  });
}
