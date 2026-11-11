import type { Camera } from "./records";
import { isRecordPageStatus } from "./public-status";

/**
 * Server-resolved seed for the /records/[id] body (perf/SEO, LCP).
 *
 * The record page used to ship an empty "Loading the public record…" shell
 * and resolve the record only after hydration (usePublicCamera →
 * GET /api/cameras/[id]). The server shell now resolves the SAME record
 * through the SAME data-access function the API route uses
 * (db/cameras.ts getCommunityRecordById: public predicate + the ADR 0021
 * §6.3 hidden/removed tombstone fallback), so the first HTML already holds
 * the h1, the facts and the community status.
 *
 * Contract (kept pure — the loader is injected — so it is unit-testable
 * without a D1 binding and stays out of any client bundle's db imports):
 *  - found with a record-page status (active/demo/hidden/removed) →
 *    `{ record }`, a plain-JSON copy of exactly what the API serializes
 *    (no extra fields reach the RSC payload);
 *  - not found, or any other status (defence in depth, mirrors the client
 *    gate in ensureRecord) → `{ record: null }`: the same "not found" state
 *    the client would settle on, rendered earlier;
 *  - the loader throws (D1 binding missing, transient DB error) →
 *    `undefined`: no seed, the client keeps today's loading/fetch/retry
 *    path — a transient DB error never becomes a 500.
 */
export type InitialRecordSeed = { record: Camera | null };

export async function resolveInitialRecord(
  id: number,
  load: (id: number) => Promise<unknown>,
): Promise<InitialRecordSeed | undefined> {
  let found: unknown;
  try {
    found = await load(id);
  } catch (error) {
    console.error("records/[id]: server record read failed, falling back to the client path", error);
    return undefined;
  }
  if (!found || typeof found !== "object") return { record: null };
  const status = (found as { status?: unknown }).status;
  if (typeof status !== "string" || !isRecordPageStatus(status)) return { record: null };
  // JSON round-trip: the RSC payload carries byte-for-byte the API's JSON
  // shape (Response.json(record)), never a non-serializable value.
  return { record: JSON.parse(JSON.stringify(found)) as Camera };
}

/**
 * The canonical API Request for one record, as the browser would send it:
 * `<origin>/api/cameras/<id>` (the worker-cache key) carrying the incoming
 * page request's headers (the caller key for the read rate limit).
 */
export function canonicalRecordApiRequest(origin: string, id: number, incoming: Headers): Request {
  return new Request(new URL(`/api/cameras/${id}`, origin).toString(), { headers: incoming });
}

/**
 * Public origin of the incoming page request from its headers: Host plus
 * X-Forwarded-Proto (set by the Cloudflare edge), https by default and
 * http for local hosts — the same scheme/host the API sees in request.url.
 */
export function requestOrigin(incoming: Headers): string | null {
  const host = incoming.get("host");
  if (!host) return null;
  const forwarded = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const scheme = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${scheme}://${host}`;
}

export type CachedInitialRecordDeps = {
  /** The read-bucket rate limit (the API route's rateLimitResponse call). */
  rateLimit: (request: Request) => Promise<Response | null>;
  /** The shared cached lookup (cachedPublicRecordResponse with the db read). */
  cachedResponse: (request: Request, id: number) => Promise<Response>;
};

/**
 * Server seed through the SAME gates as GET /api/cameras/[id]: the
 * read-bucket rate limit on the caller, then the shared worker-cache entry
 * (same key/headers/Cache-Tag, so moderation purges apply). Rate-limited,
 * a 503, an unexpected status or any thrown error → `undefined`: no seed,
 * the page falls back to the client path (the HTML is never a 429/500).
 */
export async function resolveCachedInitialRecord(
  request: Request,
  id: number,
  deps: CachedInitialRecordDeps,
): Promise<InitialRecordSeed | undefined> {
  try {
    const limited = await deps.rateLimit(request);
    if (limited) return undefined;
    const response = await deps.cachedResponse(request, id);
    if (response.status === 404) return { record: null };
    if (response.status !== 200) return undefined;
    const body = (await response.json()) as { record?: unknown };
    return resolveInitialRecord(id, async () => body.record ?? null);
  } catch (error) {
    console.error("records/[id]: cached server record read failed, falling back to the client path", error);
    return undefined;
  }
}
