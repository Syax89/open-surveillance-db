import { env } from "cloudflare:workers";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { callerKey, checkRateLimit, geocodeLimits } from "../../lib/rate-limit";
import { maxQueryLength } from "../../lib/search";

/**
 * Same-origin Nominatim proxy for the /mappa sidebar autocomplete
 * (GET /api/geocode?q=…&limit=5&countrycodes=it&lang=it).
 *
 * The browser never talks to the community geocoder directly: every
 * suggestion request hits our own origin and this route forwards it to
 * Nominatim with the same compliance posture as the tile proxy
 * (docs/OSM_INTEGRATION.md §8):
 *
 *   - a stable, contactable User-Agent naming the app (Nominatim usage
 *     policy — identification is mandatory);
 *   - the end user's Referer forwarded verbatim, never stripped or blanked
 *     (proxy policy §3.4);
 *   - server-side caching (Cloudflare Cache API) with a 24 h TTL for
 *     non-empty replies and 1 h for empty ones, so repeat keystrokes never
 *     re-hit the community endpoint (policy: cache locally, keep the load
 *     proportional to unique queries);
 *   - a per-caller rate limit (default 30/min, GEOCODE_RATE_LIMIT_* knobs)
 *     far below the policy ceiling (~1 request/second/client);
 *   - a bounded upstream fetch: AbortSignal.timeout (default 5 s) so a slow
 *     upstream answers 502 instead of pinning the request, and a hard body
 *     cap (default 512 KiB) so an oversized reply is rejected without ever
 *     being cached;
 *   - strict query validation so the endpoint cannot be used to scrape
 *     arbitrary paths or drive bulk downloads.
 *
 * Privacy/safety by design: the response carries ONLY the fields the
 * dropdown needs (display_name, lat, lng, type, boundingbox) — the many
 * Nominatim metadata fields are dropped server-side. The cache stores the
 * geocoder reply keyed by the (place-text) query URL, never requestor data.
 *
 * The upstream is not hard-coded: `GEOCODER_BASE_URL` (already used by
 * db/geocode.ts for the locality search) points the route at an approved
 * instance at deploy time without a code change.
 */

const UPSTREAM_DEFAULT = "https://nominatim.openstreetmap.org";
// Nominatim usage policy: community instances must not be hammered; the
// reply cache below (24 h non-empty / 1 h empty) absorbs repeat keystrokes.
const GEOCODE_UA =
  "OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb.org)";
const GEOCODE_ACCEPT = "application/json";
// Non-empty replies are stable place data (cities/streets change rarely);
// empty replies are cached much shorter so a typo that later becomes a real
// place resolves quickly instead of pinning the negative result for a day.
const CACHE_TTL_HIT_SECONDS = 24 * 60 * 60;
const CACHE_TTL_EMPTY_SECONDS = 60 * 60;
const UPSTREAM_TIMEOUT_MS_DEFAULT = 5_000;
const MAX_BYTES_DEFAULT = 512 * 1024;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 5;
// Country-code whitelist shape (ISO 3166-1 alpha-2, comma-separated):
// validated so a caller cannot smuggle extra query parameters upstream.
const COUNTRYCODES_PATTERN = /^[a-z]{2}(,[a-z]{2}){0,20}$/;
const MAX_COUNTRYCODES_LENGTH = 40;
// Data minimization: only the fields the autocomplete dropdown renders.
export type GeocodeSuggestion = {
  display_name: string;
  lat: number;
  lng: number;
  type: string;
  boundingbox: [string, string, string, string];
};

type EnvLike = { [key: string]: unknown };

/** Effective upstream fetch timeout, honouring the GEOCODE_UPSTREAM_TIMEOUT_MS knob. */
function upstreamTimeoutMs(envValue: unknown = env): number {
  const value = Number((envValue as EnvLike).GEOCODE_UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : UPSTREAM_TIMEOUT_MS_DEFAULT;
}

/** Effective upstream body cap, honouring the GEOCODE_MAX_BYTES knob. */
function maxBytes(envValue: unknown = env): number {
  const value = Number((envValue as EnvLike).GEOCODE_MAX_BYTES);
  return Number.isFinite(value) && value > 0 ? value : MAX_BYTES_DEFAULT;
}

/** Thrown when the upstream body exceeds the configured cap. */
class GeocodeTooLargeError extends Error {}

/**
 * Read an upstream response body up to `maxBytes`, streaming with a running
 * counter (same shape as the tile proxy's readCappedUpstreamBody). When the
 * cap is exceeded the stream is cancelled immediately — the connection is
 * not drained — and GeocodeTooLargeError is thrown so the route answers 502
 * without caching.
 */
async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  cap: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new GeocodeTooLargeError(`geocode response exceeds ${cap} bytes`);
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
 * The Cloudflare Cache API (`caches.default`) is available in the Workers
 * runtime; in tests and other plain-JS hosts it may not exist, in which case
 * the route degrades to a caching-directive-only proxy (the response still
 * carries the Cache-Control TTL for downstream CDN/browser caching).
 */
function geocodeCache(): Cache | null {
  try {
    return typeof caches !== "undefined" ? caches.default : null;
  } catch {
    return null;
  }
}

function upstreamUrl(query: string, limit: number, countrycodes: string | null, language: string | null): string {
  const base = (env.GEOCODER_BASE_URL ?? UPSTREAM_DEFAULT).replace(/\/+$/, "");
  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  if (countrycodes) url.searchParams.set("countrycodes", countrycodes);
  if (language) url.searchParams.set("accept-language", language);
  return url.toString();
}

type GeocodeQuery = { query: string; limit: number; countrycodes: string | null; language: string | null };

/**
 * Validate and normalise the query string. Returns null for any malformed
 * value so the route can answer 400 before touching the network. `q` is
 * required and bounded (same limit as the locality search); `limit` is
 * clamped to [1, MAX_LIMIT]; `countrycodes` and `lang` are whitelisted.
 */
function parseQuery(url: URL): GeocodeQuery | null {
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) return null;
  if (query.length > maxQueryLength) return null;

  const limitRaw = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw.trim())) return null;
    const parsed = Number(limitRaw.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) return null;
    limit = parsed;
  }

  const countrycodesRaw = url.searchParams.get("countrycodes");
  let countrycodes: string | null = null;
  if (countrycodesRaw !== null) {
    const trimmed = countrycodesRaw.trim().toLowerCase();
    if (trimmed.length > MAX_COUNTRYCODES_LENGTH || !COUNTRYCODES_PATTERN.test(trimmed)) return null;
    countrycodes = trimmed;
  }

  const langRaw = url.searchParams.get("lang");
  const language = langRaw === "it" || langRaw === "en" ? langRaw : null;

  return { query, limit, countrycodes, language };
}

/** Map a Nominatim result to the minimized dropdown shape (lat/lon → lat/lng). */
function toSuggestion(raw: {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  type?: unknown;
  boundingbox?: unknown;
}): GeocodeSuggestion | null {
  if (typeof raw.display_name !== "string" || raw.display_name.length === 0) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!Array.isArray(raw.boundingbox) || raw.boundingbox.length !== 4) return null;
  const box = raw.boundingbox.map((value) => String(value));
  if (!box.every((value) => value.length > 0 && value.length <= 32)) return null;
  return {
    display_name: raw.display_name,
    lat,
    lng,
    type: typeof raw.type === "string" ? raw.type : "",
    boundingbox: box as [string, string, string, string],
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseQuery(url);
  if (!parsed) {
    return Response.json(
      { error: `A search term (q) is required (max ${maxQueryLength} characters); limit must be 1-${MAX_LIMIT}; countrycodes must be ISO 3166-1 alpha-2 codes.` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Per-caller geocode bucket (default 30/min, GEOCODE_RATE_LIMIT_* knobs).
  // Metering happens before the cache lookup so a caller cannot use cache
  // hits to dodge the throttle: bulk scraping of fresh queries would
  // otherwise hammer the community geocoder past its usage policy.
  const key = callerKey(request);
  const limitOptions = geocodeLimits(env);
  const limit = checkRateLimit("geocode", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/geocode rate limited");
    recordRateLimitBlock(env, {
      route: "/api/geocode",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json(
      { error: "Too many place searches. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const cache = geocodeCache();
  // Cache key = the exact request URL (same pattern as the tile proxy); a
  // plain Request built from the URL is the stable, portable cache key.
  const cacheKey = new Request(request.url);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Geocode-Cache", "hit");
        return new Response(cached.body, { status: cached.status, headers });
      }
    } catch (error) {
      console.error("geocode cache lookup failed", error);
    }
  }

  let upstream: Response;
  try {
    const headers = new Headers({
      "User-Agent": GEOCODE_UA,
      Accept: GEOCODE_ACCEPT,
    });
    const referer = request.headers.get("Referer");
    if (referer) headers.set("Referer", referer);
    upstream = await fetch(
      upstreamUrl(parsed.query, parsed.limit, parsed.countrycodes, parsed.language),
      { headers, signal: AbortSignal.timeout(upstreamTimeoutMs()) },
    );
  } catch (error) {
    console.error("geocode upstream fetch failed", error);
    return Response.json(
      { error: "Place search is temporarily unavailable. Please try again shortly." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!upstream.ok) {
    // Never cache errors: a geocoder failure must not pin a stale "no
    // places" state. Any non-OK upstream maps to 502 (a truthful
    // "unavailable" — the geocoder itself reports "no results" as a 200
    // with an empty array).
    console.error(`geocode upstream responded with HTTP ${upstream.status}`);
    return Response.json(
      { error: "Place search is temporarily unavailable. Please try again shortly." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readCappedBody(upstream.body, maxBytes());
  } catch (error) {
    console.error("geocode upstream body rejected", error);
    return Response.json(
      { error: "Place search is temporarily unavailable. Please try again shortly." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    console.error("geocode upstream returned invalid JSON", error);
    return Response.json(
      { error: "Place search is temporarily unavailable. Please try again shortly." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!Array.isArray(raw)) {
    console.error("geocode upstream returned a non-array payload");
    return Response.json(
      { error: "Place search is temporarily unavailable. Please try again shortly." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Data minimization: map only the dropdown fields; entries with unusable
  // coordinates are dropped (a bad row must not blank the whole suggestion
  // list).
  const results: GeocodeSuggestion[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const suggestion = toSuggestion(entry as Record<string, unknown>);
    if (suggestion) results.push(suggestion);
  }

  const ttlSeconds = results.length === 0 ? CACHE_TTL_EMPTY_SECONDS : CACHE_TTL_HIT_SECONDS;
  const response = Response.json(
    { results },
    { headers: { "Cache-Control": `public, max-age=${ttlSeconds}`, "X-Geocode-Cache": "miss" } },
  );

  if (cache) {
    try {
      await cache.put(cacheKey, response.clone());
    } catch (error) {
      console.error("geocode cache store failed", error);
    }
  }
  return response;
}
