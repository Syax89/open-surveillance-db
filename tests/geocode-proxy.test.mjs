// Runtime API tests for the same-origin geocode autocomplete proxy
// (app/api/geocode/route.ts, Nominatim via docs/OSM_INTEGRATION.md §8).
//
// The proxy is exercised with real Request objects. The upstream fetch and
// the Cloudflare Cache API are injected per-test (globalThis.fetch /
// globalThis.caches) so the suite is deterministic and never touches the
// community geocoder.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule } from "./helpers/api-harness.mjs";

const originalFetch = globalThis.fetch;
const geocodeRoute = () => loadRoute("app/api/geocode/route.mjs");

// A realistic Nominatim jsonv2 result. The extra metadata fields (place_id,
// osm_type, importance, address, …) exist to pin DATA MINIMIZATION: the
// proxy must drop them and expose only the dropdown fields.
const nominatimResult = {
  place_id: 123456,
  licence: "Data © OpenStreetMap contributors, ODbL 1.0.",
  osm_type: "relation",
  osm_id: 42092,
  lat: "44.838124",
  lon: "11.619791",
  category: "boundary",
  type: "administrative",
  place_rank: 12,
  importance: 0.552,
  addresstype: "administrative",
  name: "Ferrara",
  display_name: "Ferrara, Emilia-Romagna, Italia",
  boundingbox: ["44.7198493", "44.9637886", "11.5109915", "11.8870544"],
  address: { city: "Ferrara", region: "Emilia-Romagna", country: "Italia" },
};

function stubFetch(impl) {
  globalThis.fetch = async (url, init) => impl(String(url), init);
}

function upstreamResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeCache({ cachedResponse = null } = {}) {
  const state = { matchCalls: 0, putCalls: [] };
  globalThis.caches = {
    default: {
      async match() {
        state.matchCalls += 1;
        return cachedResponse
          ? new Response(JSON.stringify(cachedResponse.body), {
              status: 200,
              headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
            })
          : null;
      },
      async put(request, response) {
        state.putCalls.push({ url: request.url, response });
      },
      async delete() {},
    },
  };
  return state;
}

beforeEach(async () => {
  delete globalThis.caches;
  const { resetRateLimitState } = await loadTreeModule("app/lib/rate-limit.mjs");
  resetRateLimitState();
});

afterEach(async () => {
  delete globalThis.caches;
  globalThis.fetch = originalFetch;
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  delete env.GEOCODER_BASE_URL;
  delete env.GEOCODE_RATE_LIMIT_MAX;
  delete env.GEOCODE_RATE_LIMIT_WINDOW_SECONDS;
  delete env.GEOCODE_UPSTREAM_TIMEOUT_MS;
  delete env.GEOCODE_MAX_BYTES;
});

after(async () => cleanupRouteTree());

async function getGeocode(query, { headers = {}, envOverrides = {} } = {}) {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  for (const [key, value] of Object.entries(envOverrides)) env[key] = value;
  const { GET } = await geocodeRoute();
  return GET(apiRequest(`/api/geocode?${query}`, { headers }));
}

// ---------------------------------------------------------------------------
// Validation (400 before any network activity)
// ---------------------------------------------------------------------------

test("rejects a missing, empty or over-long q with 400 before any upstream request", async () => {
  let upstreamCalls = 0;
  stubFetch(async () => {
    upstreamCalls += 1;
    return upstreamResponse([]);
  });
  const { GET } = await geocodeRoute();

  const missing = await GET(apiRequest("/api/geocode"));
  assert.equal(missing.status, 400, "q is required");

  const empty = await GET(apiRequest("/api/geocode?q="));
  assert.equal(empty.status, 400, "an empty q is rejected");

  const tooLong = await GET(apiRequest(`/api/geocode?q=${"a".repeat(201)}`));
  assert.equal(tooLong.status, 400, "q above 200 characters is rejected");

  const boundary = await GET(apiRequest(`/api/geocode?q=${"a".repeat(200)}`));
  assert.equal(boundary.status, 200, "q at exactly 200 characters is accepted");

  assert.equal(upstreamCalls, 1, "only the boundary query may reach the upstream");
});

test("rejects malformed limit, countrycodes and lang with 400", async () => {
  let upstreamCalls = 0;
  stubFetch(async () => {
    upstreamCalls += 1;
    return upstreamResponse([]);
  });
  const { GET } = await geocodeRoute();
  const invalid = [
    "/api/geocode?q=ferrara&limit=0",
    "/api/geocode?q=ferrara&limit=6",
    "/api/geocode?q=ferrara&limit=abc",
    "/api/geocode?q=ferrara&limit=2.5",
    "/api/geocode?q=ferrara&countrycodes=italy",
    "/api/geocode?q=ferrara&countrycodes=it,us!",
    "/api/geocode?q=ferrara&countrycodes=it,,us",
  ];
  for (const path of invalid) {
    const response = await GET(apiRequest(path));
    assert.equal(response.status, 400, path);
  }
  assert.equal(upstreamCalls, 0, "invalid queries must never reach the upstream");
});

// ---------------------------------------------------------------------------
// Upstream forwarding (identification, Referer, query passthrough)
// ---------------------------------------------------------------------------

test("forwards to the canonical Nominatim endpoint with an identifying User-Agent and the client Referer", async () => {
  let captured;
  stubFetch(async (url, init) => {
    captured = { url, init };
    return upstreamResponse([nominatimResult]);
  });
  const response = await getGeocode("q=Ferrara&limit=5", {
    headers: { Referer: "https://osdb.test/mappa" },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.results.length, 1);

  const url = new URL(captured.url);
  assert.equal(url.origin + url.pathname, "https://nominatim.openstreetmap.org/search");
  assert.equal(url.searchParams.get("q"), "Ferrara");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("limit"), "5");
  assert.match(captured.init.headers.get("User-Agent"), /OpenSurveillanceDB\/0\.1/);
  assert.match(captured.init.headers.get("User-Agent"), /privacy@opensurveillancedb\.org/);
  assert.equal(captured.init.headers.get("Accept"), "application/json");
  // Proxy policy §3.4: the Referer is forwarded verbatim, never stripped.
  assert.equal(captured.init.headers.get("Referer"), "https://osdb.test/mappa");
});

test("omits the Referer header upstream when the client request has none", async () => {
  let captured;
  stubFetch(async (url, init) => {
    captured = init;
    return upstreamResponse([]);
  });
  await getGeocode("q=Ferrara");
  assert.equal(captured.headers.get("Referer"), null);
});

test("passes countrycodes, limit and lang through to the upstream query", async () => {
  let capturedUrl;
  stubFetch(async (url) => {
    capturedUrl = url;
    return upstreamResponse([]);
  });
  await getGeocode("q=ferrara&limit=3&countrycodes=it&lang=it");
  const url = new URL(capturedUrl);
  assert.equal(url.searchParams.get("countrycodes"), "it");
  assert.equal(url.searchParams.get("limit"), "3");
  assert.equal(url.searchParams.get("accept-language"), "it");
});

test("normalises countrycodes to lowercase and drops unknown lang values", async () => {
  let capturedUrl;
  stubFetch(async (url) => {
    capturedUrl = url;
    return upstreamResponse([]);
  });
  // "IT" passes the pattern only after lowercasing — the proxy normalizes it
  // so the upstream always receives canonical ISO 3166-1 alpha-2 codes.
  await getGeocode("q=ferrara&countrycodes=IT&lang=xx");
  const url = new URL(capturedUrl);
  assert.equal(url.searchParams.get("countrycodes"), "it");
  assert.equal(url.searchParams.get("accept-language"), null, "unknown lang must not be forwarded");
});

test("honours the GEOCODER_BASE_URL knob", async () => {
  let capturedUrl;
  stubFetch(async (url) => {
    capturedUrl = url;
    return upstreamResponse([]);
  });
  await getGeocode("q=ferrara", { envOverrides: { GEOCODER_BASE_URL: "https://nominatim.example.test/" } });
  assert.match(capturedUrl, /^https:\/\/nominatim\.example\.test\/search\?/);
});

// ---------------------------------------------------------------------------
// Response shape + data minimization
// ---------------------------------------------------------------------------

test("maps Nominatim results to the minimized dropdown shape (lat/lon → lat/lng, extra fields dropped)", async () => {
  stubFetch(async () => upstreamResponse([nominatimResult, { display_name: "Second place", lat: "1.5", lon: "2.5", type: "city", boundingbox: ["1", "2", "3", "4"] }]));
  const response = await getGeocode("q=Ferrara");
  const body = await response.json();

  assert.deepEqual(body.results[0], {
    display_name: "Ferrara, Emilia-Romagna, Italia",
    lat: 44.838124,
    lng: 11.619791,
    type: "administrative",
    boundingbox: ["44.7198493", "44.9637886", "11.5109915", "11.8870544"],
  });
  // Data minimization: no Nominatim metadata may leak to the client.
  assert.deepEqual(Object.keys(body.results[0]).sort(), ["boundingbox", "display_name", "lat", "lng", "type"]);
  assert.deepEqual(body.results[1].lat, 1.5, "lat is coerced to a number");
  assert.deepEqual(body.results[1].lng, 2.5, "lon is coerced to lng as a number");
});

test("drops entries with unusable coordinates or a malformed bounding box, keeping the valid ones", async () => {
  stubFetch(async () => upstreamResponse([
    nominatimResult,
    { display_name: "Bad lat", lat: "not-a-number", lon: "12.4", type: "city", boundingbox: ["1", "2", "3", "4"] },
    { display_name: "Bad box", lat: "1.5", lon: "2.5", type: "city", boundingbox: ["1", "2"] },
    { display_name: "", lat: "1.5", lon: "2.5", type: "city", boundingbox: ["1", "2", "3", "4"] },
    "not-an-object",
  ]));
  const response = await getGeocode("q=test");
  const body = await response.json();
  assert.equal(body.results.length, 1, "only the valid entry survives");
  assert.equal(body.results[0].display_name, "Ferrara, Emilia-Romagna, Italia");
});

// ---------------------------------------------------------------------------
// Caching (Cloudflare Cache API + Cache-Control TTLs)
// ---------------------------------------------------------------------------

test("serves cached replies from the edge cache without hitting the upstream", async () => {
  const cacheState = fakeCache({ cachedResponse: { body: { results: [nominatimResult] } } });
  stubFetch(async () => {
    throw new Error("upstream must not be called on a cache hit");
  });
  const response = await getGeocode("q=Ferrara");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-geocode-cache"), "hit");
  assert.equal(cacheState.matchCalls, 1);
  const body = await response.json();
  assert.equal(body.results[0].display_name, "Ferrara, Emilia-Romagna, Italia");
});

test("caches non-empty replies for 24 hours and stores them in the edge cache", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => upstreamResponse([nominatimResult]));
  const response = await getGeocode("q=Ferrara");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(response.headers.get("x-geocode-cache"), "miss");
  assert.equal(cacheState.putCalls.length, 1);
  assert.equal(cacheState.putCalls[0].url, "https://osdb.test/api/geocode?q=Ferrara");
});

test("caches empty replies for only 1 hour so a typo that becomes a real place resolves quickly", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => upstreamResponse([]));
  const response = await getGeocode("q=Xyzzy%20Not%20A%20Place");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { results: [] });
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(cacheState.putCalls.length, 1);
});

test("cache keys are per query URL: two different queries never share an entry", async () => {
  const store = new Map();
  const state = { putUrls: [], hitFor: [], missFor: [] };
  globalThis.caches = {
    default: {
      async match(request) {
        const url = String(request.url);
        const cached = store.get(url);
        if (cached) {
          state.hitFor.push(url);
          return new Response(JSON.stringify(cached), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });
        }
        state.missFor.push(url);
        return null;
      },
      async put(request, response) {
        const url = String(request.url);
        state.putUrls.push(url);
        store.set(url, (await response.clone().json()));
      },
      async delete() {},
    },
  };
  let upstreamCalls = 0;
  stubFetch(async (url) => {
    upstreamCalls += 1;
    return upstreamResponse(url.includes("ferrara") ? [nominatimResult] : []);
  });

  const { GET } = await geocodeRoute();
  const dispatch = async (q) => GET(apiRequest(`/api/geocode?q=${q}`));

  assert.equal((await dispatch("ferrara")).headers.get("x-geocode-cache"), "miss");
  assert.equal((await dispatch("roma")).headers.get("x-geocode-cache"), "miss");
  assert.equal((await dispatch("ferrara")).headers.get("x-geocode-cache"), "hit");
  assert.equal((await dispatch("roma")).headers.get("x-geocode-cache"), "hit");

  assert.equal(upstreamCalls, 2, "each distinct query fetches the upstream exactly once");
  assert.deepEqual(state.missFor.sort(), ["https://osdb.test/api/geocode?q=ferrara", "https://osdb.test/api/geocode?q=roma"]);
  assert.deepEqual(state.hitFor.sort(), ["https://osdb.test/api/geocode?q=ferrara", "https://osdb.test/api/geocode?q=roma"]);
});

// ---------------------------------------------------------------------------
// Failure modes (truthful 502, never a fabricated "no places")
// ---------------------------------------------------------------------------

test("returns 502 with no-store when the upstream fails, without caching the error", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => {
    throw new Error("network down");
  });
  const response = await getGeocode("q=Ferrara");
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
});

test("maps any non-OK upstream status to 502 without caching", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => new Response("boom", { status: 500 }));
  const response = await getGeocode("q=Ferrara");
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
});

test("returns 502 for an invalid JSON or non-array upstream body", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => new Response("<html>not json</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
  let response = await getGeocode("q=Ferrara");
  assert.equal(response.status, 502);
  assert.equal(cacheState.putCalls.length, 0);

  stubFetch(async () => new Response('{"results":[]}', { status: 200, headers: { "Content-Type": "application/json" } }));
  response = await getGeocode("q=Ferrara");
  assert.equal(response.status, 502, "an object payload is not the expected array");
});

test("returns 502 and never caches when the upstream body exceeds the 512 KiB cap", async () => {
  const cacheState = fakeCache();
  let cancelled = false;
  const chunk = new Uint8Array(1024 * 1024); // 1 MiB per chunk
  stubFetch(async () => {
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const response = await getGeocode("q=Ferrara");
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
  assert.equal(cancelled, true, "over-cap stream must be cancelled, never drained");
});

test("returns 502, no-store and no cache when the upstream exceeds the fetch timeout", async () => {
  const cacheState = fakeCache();
  let rejectReason = null;
  stubFetch(async (_url, init) => {
    await new Promise((_, reject) => {
      const safety = setTimeout(() => {
        rejectReason = new Error("geocode stub: AbortSignal never fired");
        reject(rejectReason);
      }, 5_000);
      init.signal.addEventListener("abort", () => {
        clearTimeout(safety);
        rejectReason = new DOMException("The operation was aborted.", "AbortError");
        reject(rejectReason);
      });
    });
  });

  const response = await getGeocode("q=Ferrara", { envOverrides: { GEOCODE_UPSTREAM_TIMEOUT_MS: "50" } });
  assert.equal(rejectReason?.name, "AbortError", "route must abort the hung upstream fetch");
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Rate limiting (per-caller bucket, before the cache — same as the tile proxy)
// ---------------------------------------------------------------------------

test("answers 429 with Retry-After when the per-caller geocode bucket is exhausted", async () => {
  let upstreamCalls = 0;
  stubFetch(async () => {
    upstreamCalls += 1;
    return upstreamResponse([]);
  });
  const { GET } = await geocodeRoute();
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  env.GEOCODE_RATE_LIMIT_MAX = "1";
  env.GEOCODE_RATE_LIMIT_WINDOW_SECONDS = "60";

  const first = await GET(apiRequest("/api/geocode?q=Ferrara"));
  assert.equal(first.status, 200, "the first call inside the window is allowed");

  const second = await GET(apiRequest("/api/geocode?q=Ferrara"));
  assert.equal(second.status, 429, "the second call exceeds the bucket");
  assert.ok(Number(second.headers.get("Retry-After")) > 0, "Retry-After must be positive");
  assert.equal(second.headers.get("cache-control"), "no-store");

  assert.equal(upstreamCalls, 1, "the blocked call must never reach the upstream");
});

test("rate limits are per-caller: a different caller key gets its own bucket", async () => {
  stubFetch(async () => upstreamResponse([]));
  const { GET } = await geocodeRoute();
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  env.GEOCODE_RATE_LIMIT_MAX = "1";
  env.GEOCODE_RATE_LIMIT_WINDOW_SECONDS = "60";

  const requestA = () => GET(apiRequest("/api/geocode?q=Ferrara", { headers: { "cf-connecting-ip": "203.0.113.10" } }));
  const requestB = () => GET(apiRequest("/api/geocode?q=Ferrara", { headers: { "cf-connecting-ip": "203.0.113.20" } }));

  assert.equal((await requestA()).status, 200);
  assert.equal((await requestB()).status, 200, "a second caller must not inherit caller A's exhaustion");
  assert.equal((await requestA()).status, 429, "caller A is now over its own bucket");
  assert.equal((await requestB()).status, 429, "caller B is also over its own bucket");
});
