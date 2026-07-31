import { env } from "cloudflare:workers";

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
const TILE_USER_AGENT =
  "OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb)";
const TILE_ACCEPT = "image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5";

type TileParams = { z: string; x: string; y: string };

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

  let upstream: Response;
  try {
    const headers = new Headers({
      "User-Agent": TILE_USER_AGENT,
      Accept: TILE_ACCEPT,
    });
    const referer = request.headers.get("Referer");
    if (referer) headers.set("Referer", referer);
    upstream = await fetch(upstreamUrl(tile.z, tile.x, tile.y), { headers });
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

  const body = await upstream.arrayBuffer();
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
