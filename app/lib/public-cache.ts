/**
 * Shared public-read cache (CEO 2026-08-07, DB-lightening): wraps a
 * GET handler's database work with the Cloudflare Cache API so the
 * worker itself can serve repeat requests WITHOUT hitting D1.
 *
 * Why this exists: the public routes already emit CDN Cache-Control
 * headers (s-maxage/SWR + Cache-Tag), but those only help when a CDN
 * sits in front of the worker (Cloudflare edge). On the container/dev
 * deployment there is no CDN — every request reaches the worker and
 * every request hits the database. This wrapper gives the worker a
 * bounded in-process cache with the same policy as the edge headers.
 *
 * Contract (mirrors app/api/geocode/route.ts):
 *   - cache key = the request URL (query-string sensitive: bbox/kind/
 *     freshness/sort/limit/offset are all part of the key);
 *   - only status 200 responses are stored (errors and 4xx are never
 *     cached);
 *   - the stored response keeps its original headers (Cache-Control,
 *     Cache-Tag for moderation purge) plus an X-OSDB-Cache marker;
 *   - fail-open: any cache read/write error falls back to the builder —
 *     the cache must never take the route down.
 */
export function publicCache(): Cache | null {
  return typeof caches !== "undefined" ? caches.default : null;
}

export async function withPublicCache(
  request: Request,
  ttlSeconds: number,
  build: () => Promise<Response>,
): Promise<Response> {
  const cache = publicCache();
  if (cache) {
    try {
      const cacheKey = new Request(request.url);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-OSDB-Cache", "hit");
        return new Response(cached.body, { status: cached.status, headers });
      }
    } catch (error) {
      console.error("public-cache read failed (fail-open)", error);
    }
  }

  const response = await build();

  if (cache && response.status === 200) {
    try {
      const headers = new Headers(response.headers);
      // The stored entry's TTL comes from its Cache-Control; routes that
      // already emit s-maxage/SWR (list, bbox, record) keep theirs — this
      // is only a sensible fallback so a route can never cache forever by
      // accident.
      if (!headers.has("Cache-Control")) {
        headers.set("Cache-Control", `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
      }
      headers.set("X-OSDB-Cache", "miss");
      const cacheKey = new Request(request.url);
      await cache.put(cacheKey, new Response(response.clone().body, { status: response.status, headers }));
      // Mirror the marker on the response we hand back to the caller, so
      // a miss is observable from both sides of the cache boundary.
      response.headers.set("X-OSDB-Cache", "miss");
    } catch (error) {
      console.error("public-cache write failed (fail-open)", error);
    }
  }

  return response;
}
