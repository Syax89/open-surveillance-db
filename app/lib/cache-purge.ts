/**
 * Best-effort Cloudflare edge-cache purge for the public camera API.
 *
 * Follow-up F0 (t_ae600b90): the read routes answer with a bounded edge
 * cache (`public, s-maxage=300, stale-while-revalidate=600`) so a privacy
 * takedown decided in moderation could otherwise stay served for up to the
 * revalidation window. Cache tags on those responses let the moderation
 * write path invalidate exactly the affected representations through the
 * Cloudflare Cache Purge API.
 *
 * Deliberately fail-open: the purge must never break a moderation decision.
 * When the credentials are absent (local prototype, tests, or a deployment
 * that chose not to configure it) this is a documented no-op and the
 * bounded cache window remains the guarantee — see
 * docs/PRIVACY_AND_SAFETY.md § "Edge caching and moderation".
 */

export interface CachePurgeResult {
  purged: boolean;
  reason?: string;
}

/** Cache tags emitted on the public camera read routes. */
export const CACHE_TAGS = {
  /** Default JSON list (paged, with facets). */
  list: "cameras-list",
  /** bbox map-marker GeoJSON layer. */
  bbox: "cameras-bbox",
  /** Full CSV/GeoJSON exports. */
  export: "cameras-export",
  /** Single record detail, per record id. */
  record: (id: number) => `camera-${id}`,
  /** Approved photo bytes (served immutable for 1 h), per photo id. */
  photo: (id: number) => `photo-${id}`,
} as const;

const PURGE_API = "https://api.cloudflare.com/client/v4/zones";

/**
 * Purge every cached representation that can contain a moderated record.
 *
 * The list, bbox layer and exports are shared representations: one tag each.
 * The record detail is per-id, so a single camera decision invalidates only
 * that record's page plus the shared collections that may include it.
 */
export function cameraPurgeTags(cameraId: number): readonly string[] {
  return [CACHE_TAGS.list, CACHE_TAGS.bbox, CACHE_TAGS.export, CACHE_TAGS.record(cameraId)];
}

/**
 * Fire the Cloudflare Cache Purge API for a set of tags.
 *
 * - No credentials configured -> returns `{ purged: false, reason:
 *   "not-configured" }` without any network call (documented tradeoff).
 * - API error -> logged, `{ purged: false, reason: <status> }`. Never throws:
 *   callers use this on the write path where the moderation response must
 *   not depend on cache invalidation succeeding.
 */
export async function purgeCacheTags(
  tags: readonly string[],
  env: unknown,
): Promise<CachePurgeResult> {
  // The runtime env is the whole `cloudflare:workers` binding object; only
  // the two purge knobs are read here (same pattern as submissionsDisabled
  // in app/lib/rate-limit.ts, which also takes `env: unknown`).
  const record = (env ?? {}) as Record<string, unknown>;
  const token = typeof record.CACHE_PURGE_TOKEN === "string" ? record.CACHE_PURGE_TOKEN : undefined;
  const zoneId = typeof record.CACHE_PURGE_ZONE_ID === "string" ? record.CACHE_PURGE_ZONE_ID : undefined;
  if (!token || !zoneId) {
    return { purged: false, reason: "not-configured" };
  }
  if (tags.length === 0) return { purged: false, reason: "no-tags" };

  try {
    const response = await fetch(`${PURGE_API}/${encodeURIComponent(zoneId)}/purge_cache`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tags: [...tags] }),
    });
    if (!response.ok) {
      console.warn(
        `Cache purge failed (HTTP ${response.status}): ${await response.text().catch(() => "")}`,
      );
      return { purged: false, reason: `http-${response.status}` };
    }
    return { purged: true };
  } catch (error) {
    console.warn("Cache purge failed (network):", error);
    return { purged: false, reason: "network-error" };
  }
}
