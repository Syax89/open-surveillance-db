import { env } from "cloudflare:workers";
import { recordRateLimitBlock } from "../../../../../lib/abuse-alerts";
import { callerKey, checkRateLimit, limitsFor } from "../../../../../lib/rate-limit";

/**
 * Same-origin tile proxy (compliant with the OSMF tile usage policy).
 *
 * The map in the client bundle never talks to a tile server directly: every
 * tile request hits /api/tiles/{z}/{x}/{y}.png on our own origin and this
 * route fetches the upstream tile with:
 *
 *   - a stable, contactable User-Agent naming the app (policy §3.1/§3.4/§5);
 *   - the end user's Referer forwarded verbatim, never stripped or blanked
 *     (policy §3.4 — "If you proxy tile requests through your servers or a
 *     CDN, do not strip or blank the Referer");
 *   - server-side caching honouring upstream cache headers, or a 7-day
 *     minimum TTL when the upstream sends none (policy §3.2/§5);
 *   - a bounded upstream fetch: AbortSignal.timeout (TILE_UPSTREAM_TIMEOUT_MS,
 *     default 5 s) so a slow/hung provider answers 502 instead of pinning the
 *     request, and a hard body cap (TILE_MAX_BYTES, default 2 MiB) so an
 *     oversized response is rejected without ever being cached;
 *   - strict zoom/x/y validation so the endpoint cannot be used to scrape
 *     arbitrary paths or drive bulk downloads (policy §4).
 *
 * The upstream is not hard-coded: `TILE_PROVIDER_URL` (and, when the chosen
 * provider needs one, `TILE_PROVIDER_KEY`) switch provider at deploy time
 * without a code change or client rebuild (policy "should" list). Defaults to
 * the canonical community server https://tile.openstreetmap.org (note: no
 * subdomains — `{s}.tile.openstreetmap.org` is deprecated by the policy).
 *
 * See docs/OSM_INTEGRATION.md for the full provider strategy and the
 * community-vs-commercial-vs-self-hosted decision matrix.
 */

const UPSTREAM_DEFAULT = "https://tile.openstreetmap.org";
const MAX_ZOOM = 19;
// Policy §3.2/§5: "Honour server caching headers … If your cache cannot read
// them, cache each tile for at least 7 days." Applied when the upstream
// response carries no Cache-Control.
const MIN_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
// A slow or hung upstream must not pin the request until the platform
// timeout: abort after TILE_UPSTREAM_TIMEOUT_MS (default 5s) and answer 502.
// Same pattern as db/geocode.ts (requestTimeoutMs).
const UPSTREAM_TIMEOUT_MS_DEFAULT = 5_000;
// Cap on the accepted upstream body: standard raster tiles are well under
// 1 MiB, so anything past 2 MiB is an anomaly (or a compromised provider).
// Oversized bodies are rejected with 502 and never cached.
const TILE_MAX_BYTES_DEFAULT = 2 * 1024 * 1024;
const TILE_USER_AGENT =
  "OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb.org)";
const TILE_ACCEPT = "image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5";

type TileParams = { z: string; x: string; y: string };

// The `Env` interface has no string index signature, so knobs are read
// through a cast — same EnvLike pattern as lib/rate-limit.ts limitsFor().
type EnvLike = { [key: string]: unknown };

/** Effective upstream fetch timeout, honouring the TILE_UPSTREAM_TIMEOUT_MS knob. */
function upstreamTimeoutMs(envValue: unknown = env): number {
  const value = Number((envValue as EnvLike).TILE_UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : UPSTREAM_TIMEOUT_MS_DEFAULT;
}

/** Effective upstream body cap, honouring the TILE_MAX_BYTES knob. */
function tileMaxBytes(envValue: unknown = env): number {
  const value = Number((envValue as EnvLike).TILE_MAX_BYTES);
  return Number.isFinite(value) && value > 0 ? value : TILE_MAX_BYTES_DEFAULT;
}

/** Thrown when the upstream tile body exceeds the configured cap. */
class TileTooLargeError extends Error {}

/**
 * Read an upstream response body up to `maxBytes`, streaming with a running
 * counter. When the
 * cap is exceeded the stream is cancelled immediately — the connection is not
 * drained — and TileTooLargeError is thrown so the route answers 502 without
 * caching. Returns the full body as a single Uint8Array when within the cap.
 */
async function readCappedUpstreamBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new TileTooLargeError(`tile response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Validate and normalise slippy-map tile coordinates. Returns null for any
 * non-integer, out-of-zoom, or out-of-bounds value so the route can answer
 * 400 before touching the network. The optional `.png` suffix (Leaflet keeps
 * it in the URL template) is stripped from y.
 */
function parseTile(params: TileParams): { z: number; x: number; y: number } | null {
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y.replace(/\.png$/i, ""));
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (z < 0 || z > MAX_ZOOM) return null;
  const maxCoord = 2 ** z - 1;
  if (x < 0 || x > maxCoord || y < 0 || y > maxCoord) return null;
  return { z, x, y };
}

/**
 * The Cloudflare Cache API (`caches.default`) is available in the Workers
 * runtime; in tests and other plain-JS hosts it may not exist, in which case
 * the route degrades to a caching-directive-only proxy (the response still
 * carries the 7-day Cache-Control for downstream CDN/browser caching).
 */
function tileCache(): Cache | null {
  try {
    return typeof caches !== "undefined" ? caches.default : null;
  } catch {
    return null;
  }
}

function upstreamUrl(z: number, x: number, y: number): string {
  const base = (env.TILE_PROVIDER_URL ?? UPSTREAM_DEFAULT).replace(/\/+$/, "");
  const url = `${base}/${z}/${x}/${y}.png`;
  const key = env.TILE_PROVIDER_KEY;
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}

export async function GET(request: Request, context: { params: Promise<TileParams> }) {
  const params = await context.params;
  const tile = parseTile(params);
  if (!tile) {
    return new Response("Invalid tile coordinates", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Tile request budget (QA#5 F4, t_ab0d4c75): the per-caller bucket guards
  // the UPSTREAM (OSMF community tile service), so metering happens AFTER
  // the edge-cache lookup and counts only cache MISSES — a miss is exactly
  // the request that will fetch upstream. Cache hits are served from the
  // edge and consume no upstream capacity, so they do not consume the
  // bucket: an interactive pan/zoom burst re-fetching tiles already in the
  // cache can never 429 the map into a patchwork. The dedicated threshold
  // is 240/min (wrangler.jsonc TILES_LIMITER + ROUTE_LIMIT_DEFAULTS.tiles):
  // a full viewport is ~24 tiles at z13-19, so ~10 zoom steps/min stay
  // comfortably inside, while a scraper probing fresh coordinates still
  // hits the ceiling on real upstream traffic.
  const cache = tileCache();
  // The Cache API matches on URL + method, and the incoming Request object is
  // sometimes a wrapped runtime object that workerd's cache cannot serialise
  // ("Invalid URL: [object Request]"). A plain Request built from the URL is
  // the stable, portable cache key.
  const cacheKey = new Request(request.url);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Tile-Cache", "hit");
        return new Response(cached.body, { status: cached.status, headers });
      }
    } catch (error) {
      console.error("tile cache lookup failed", error);
    }
  }

  const key = callerKey(request, env);
  const limitOptions = limitsFor("tiles", env);
  const limit = await checkRateLimit(env, "tiles", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/tiles/[z]/[x]/[y] rate limited");
    recordRateLimitBlock(env, {
      route: "/api/tiles/[z]/[x]/[y]",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return new Response("Too many tile requests. Please try again shortly.", {
      status: 429,
      headers: {
        "Retry-After": String(limit.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    });
  }

  let upstream: Response;
  try {
    const headers = new Headers({
      "User-Agent": TILE_USER_AGENT,
      Accept: TILE_ACCEPT,
    });
    const referer = request.headers.get("Referer");
    if (referer) headers.set("Referer", referer);
    // Abort a slow or hung upstream after TILE_UPSTREAM_TIMEOUT_MS (default
    // 5s) so the worker never pins a request until the platform timeout;
    // same pattern as db/geocode.ts. The signal also cuts off a trickling
    // response body mid-stream.
    upstream = await fetch(upstreamUrl(tile.z, tile.x, tile.y), {
      headers,
      signal: AbortSignal.timeout(upstreamTimeoutMs()),
    });
  } catch (error) {
    console.error("tile upstream fetch failed", error);
    return new Response("Tile upstream unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!upstream.ok) {
    // Never cache errors: a 404 pass-through (unknown tile) or a 502 when the
    // upstream fails. 404s stay 404s so the map keeps working around holes.
    const status = upstream.status === 404 ? 404 : 502;
    return new Response(upstream.statusText, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const responseHeaders = new Headers(upstream.headers);
  if (!responseHeaders.has("Content-Type")) responseHeaders.set("Content-Type", "image/png");
  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", `public, max-age=${MIN_CACHE_TTL_SECONDS}`);
  }
  responseHeaders.set("X-Tile-Cache", "miss");

  // Read the upstream body with a hard cap (default 2 MiB): a compromised or
  // broken provider must not be able to push an unbounded body through the
  // worker. Over-cap responses answer 502 and are never cached.
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readCappedUpstreamBody(upstream.body, tileMaxBytes());
  } catch (error) {
    console.error("tile upstream body rejected", error);
    return new Response("Tile upstream unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const response = new Response(body, { status: 200, headers: responseHeaders });

  if (cache) {
    try {
      await cache.put(cacheKey, response.clone());
    } catch (error) {
      console.error("tile cache store failed", error);
    }
  }
  return response;
}
