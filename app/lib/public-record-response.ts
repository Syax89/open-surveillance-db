import { CACHE_TAGS } from "./cache-purge";
import { withPublicCache } from "./public-cache";

/**
 * Cached single-record read shared by GET /api/cameras/[id] and the
 * /records/[id] server shell (LCP fix): both go through ONE worker-cache
 * entry per record — same key (the canonical `/api/cameras/<id>` URL), same
 * Cache-Control and the same `camera-<id>` Cache-Tag, so a moderation purge
 * invalidates the page seed and the API answer together, and a crawler
 * walking /records/N costs no more D1 reads than one walking the API.
 *
 * The loader is injected (the route and the page pass db/cameras.ts
 * getCommunityRecordById) so this module stays free of `cloudflare:workers`
 * and runs in the plain-Node harnesses. Fail-open like withPublicCache: no
 * Cache API (workers.dev, tests) → direct read.
 */
export const PUBLIC_RECORD_TTL_SECONDS = 300;

export function publicRecordHeaders(id: number): Record<string, string> {
  return { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Cache-Tag": CACHE_TAGS.record(id) };
}

export function cachedPublicRecordResponse(
  request: Request,
  id: number,
  load: (id: number) => Promise<unknown>,
): Promise<Response> {
  // The 404 path is NOT cached (withPublicCache stores 200 only): it is
  // deliberately indistinguishable from a missing id.
  return withPublicCache(request, PUBLIC_RECORD_TTL_SECONDS, async () => {
    try {
      // Record-page resolver (ADR 0021 §6.3, FASE 3 UI): public records AND
      // hidden/removed ones (direct-link banner contract).
      const record = await load(id);
      if (!record) {
        return Response.json({ error: "Camera not found." }, { status: 404 });
      }
      // Same bounded edge cache as the list; the Cache-Tag lets the
      // moderation write path purge this exact representation immediately
      // (see app/lib/cache-purge.ts).
      return Response.json({ record }, { headers: publicRecordHeaders(id) });
    } catch (error) {
      console.error("GET /api/cameras/[id] failed", error);
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }
  });
}
