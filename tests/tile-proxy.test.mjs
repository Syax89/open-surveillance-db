// Runtime API tests for the same-origin tile proxy
// (app/api/tiles/[z]/[x]/[y]/route.ts, OSMF tile usage policy compliance).
//
// The proxy is exercised with real Request objects. The upstream fetch and
// the Cloudflare Cache API are injected per-test (globalThis.fetch /
// globalThis.caches) so the suite is deterministic and never touches the
// community tile server.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule } from "./helpers/api-harness.mjs";

const originalFetch = globalThis.fetch;
const tilesRoute = () => loadRoute("app/api/tiles/[z]/[x]/[y]/route.mjs");

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stubFetch(impl) {
  globalThis.fetch = async (url, init) => impl(url, init);
}

function upstreamResponse({ status = 200, headers = {}, body = png } = {}) {
  return new Response(body, { status, headers: { "Content-Type": "image/png", ...headers } });
}

function fakeCache({ cachedResponse = null } = {}) {
  const state = { matchCalls: 0, putCalls: [] };
  globalThis.caches = {
    default: {
      async match() {
        state.matchCalls += 1;
        return cachedResponse
          ? new Response(cachedResponse.body, {
              status: 200,
              headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" },
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

beforeEach(() => {
  delete globalThis.caches;
});

afterEach(async () => {
  delete globalThis.caches;
  globalThis.fetch = originalFetch;
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  delete env.TILE_PROVIDER_URL;
  delete env.TILE_PROVIDER_KEY;
  delete env.TILE_UPSTREAM_TIMEOUT_MS;
  delete env.TILE_MAX_BYTES;
});

after(async () => cleanupRouteTree());

async function getTile(params, { headers = {}, envOverrides = {} } = {}) {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  for (const [key, value] of Object.entries(envOverrides)) env[key] = value;
  const { GET } = await tilesRoute();
  const { z, x, y } = params;
  return GET(apiRequest(`/api/tiles/${z}/${x}/${y}`, { headers }), {
    params: Promise.resolve(params),
  });
}

test("rejects invalid tile coordinates with 400 before any upstream request", async () => {
  let upstreamCalls = 0;
  stubFetch(async () => {
    upstreamCalls += 1;
    return upstreamResponse();
  });
  const { GET } = await tilesRoute();
  const invalid = [
    { z: "20", x: "0", y: "0" }, // zoom above MAX_ZOOM (19)
    { z: "-1", x: "0", y: "0" }, // negative zoom
    { z: "13.5", x: "0", y: "0" }, // non-integer zoom
    { z: "abc", x: "0", y: "0" }, // non-numeric zoom
    { z: "13", x: "-1", y: "0" }, // negative x
    { z: "13", x: "8192", y: "0" }, // x beyond 2^13 - 1
    { z: "13", x: "0", y: "8192" }, // y beyond 2^13 - 1
    { z: "13", x: "0", y: "0.pngx" }, // malformed suffix
    // Security audit 2026-11: Number() accepted these aliases of a valid tile.
    { z: "13", x: "0x1", y: "0" }, // hex
    { z: "1e1", x: "0", y: "0" }, // exponent
    { z: "13", x: "01", y: "0" }, // leading zero
    { z: "13", x: " 1", y: "0" }, // whitespace
    { z: "13", x: "1", y: "+1" }, // sign
    { z: "13", x: "", y: "0" }, // empty
    { z: "13", x: "1", y: "1.0" }, // decimal point
  ];
  for (const params of invalid) {
    const response = await GET(apiRequest("/api/tiles/13/0/0.png"), {
      params: Promise.resolve(params),
    });
    assert.equal(response.status, 400, JSON.stringify(params));
  }
  assert.equal(upstreamCalls, 0, "invalid coordinates must never reach the upstream");
});

test("fetches the canonical upstream with an identifying User-Agent, forwarded Referer, and 7-day cache fallback", async () => {
  let captured;
  stubFetch(async (url, init) => {
    captured = { url: String(url), init };
    return upstreamResponse();
  });
  const response = await getTile({ z: "13", x: "4250", y: "2900" }, {
    headers: { Referer: "https://osdb.test/records" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "public, max-age=604800");
  assert.equal(response.headers.get("x-tile-cache"), "miss");

  // Canonical URL: the OSMF policy mandates https://tile.openstreetmap.org
  // with no {s} subdomains.
  assert.equal(captured.url, "https://tile.openstreetmap.org/13/4250/2900.png");
  assert.match(captured.init.headers.get("User-Agent"), /OpenSurveillanceDB\/0\.1/);
  // Policy §3.4: never stripped or blanked — but only the site ORIGIN goes
  // upstream (privacy 2026-11): the page path/query stay with us.
  assert.equal(captured.init.headers.get("Referer"), "https://osdb.test/");
});

test("omits the Referer header upstream when the client request has none", async () => {
  let captured;
  stubFetch(async (url, init) => {
    captured = init;
    return upstreamResponse();
  });
  await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(captured.headers.get("Referer"), null);
});

test("honours upstream caching headers when present", async () => {
  stubFetch(async () =>
    upstreamResponse({ headers: { "Cache-Control": "public, max-age=3600" } }),
  );
  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
});

test("defaults the content type to image/png when the upstream sends none", async () => {
  stubFetch(async () => new Response(png, { status: 200 }));
  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.headers.get("content-type"), "image/png");
});

test("accepts the optional .png suffix on the y coordinate", async () => {
  stubFetch(async () => upstreamResponse());
  const response = await getTile({ z: "13", x: "4250", y: "2900.png" });
  assert.equal(response.status, 200);
});

test("serves cached tiles from the edge cache without hitting the upstream", async () => {
  const cacheState = fakeCache({ cachedResponse: new Response(png, { status: 200 }) });
  stubFetch(async () => {
    throw new Error("upstream must not be called on a cache hit");
  });

  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-tile-cache"), "hit");
  assert.equal(cacheState.matchCalls, 1);
});

test("stores upstream tile responses in the edge cache", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => upstreamResponse({ headers: { "Cache-Control": "public, max-age=3600" } }));

  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 200);
  assert.equal(cacheState.putCalls.length, 1);
  assert.equal(cacheState.putCalls[0].url, "https://osdb.test/api/tiles/13/4250/2900.png", "canonical cache key built from the parsed coordinates");
});

test("returns 502 with no-store when the upstream fails, without caching the error", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => {
    throw new Error("network down");
  });

  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
});

test("passes through upstream 404 without caching", async () => {
  const cacheState = fakeCache();
  stubFetch(async () => new Response("Not Found", { status: 404 }));

  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
});

test("maps upstream 5xx to 502", async () => {
  stubFetch(async () => new Response("boom", { status: 500 }));
  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 502);
});

test("switches provider via TILE_PROVIDER_URL and appends TILE_PROVIDER_KEY", async () => {
  let capturedUrl;
  stubFetch(async (url) => {
    capturedUrl = String(url);
    return upstreamResponse();
  });

  await getTile({ z: "13", x: "4250", y: "2900" }, {
    envOverrides: {
      TILE_PROVIDER_URL: "https://api.maptiler.com/maps/streets-v2",
      TILE_PROVIDER_KEY: "sekret",
    },
  });
  assert.equal(
    capturedUrl,
    "https://api.maptiler.com/maps/streets-v2/13/4250/2900.png?key=sekret",
  );
});

test("returns 502, no-store and no cache when the upstream exceeds the fetch timeout", async () => {
  const cacheState = fakeCache();
  // Simulate a hung upstream: the response never arrives on its own, but the
  // request honours the AbortSignal the route passes, exactly like a real
  // fetch. TILE_UPSTREAM_TIMEOUT_MS is lowered to 50 ms so the test runs in
  // ~50 ms instead of the production default of 5 s. The ref'd safety timer
  // keeps the event loop alive (Node's AbortSignal.timeout timer is unref'd)
  // and fails loudly if the route ever stops passing a signal.
  let rejectReason = null;
  stubFetch(async (_url, init) => {
    await new Promise((_, reject) => {
      const safety = setTimeout(() => {
        const err = new Error("tile upstream stub: AbortSignal never fired");
        rejectReason = err;
        reject(err);
      }, 5_000);
      init.signal.addEventListener("abort", () => {
        clearTimeout(safety);
        rejectReason = new DOMException("The operation was aborted.", "AbortError");
        reject(rejectReason);
      });
    });
  });

  const response = await getTile({ z: "13", x: "4250", y: "2900" }, {
    envOverrides: { TILE_UPSTREAM_TIMEOUT_MS: "50" },
  });
  assert.equal(rejectReason?.name, "AbortError", "route must abort the hung upstream fetch");
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
});

test("returns 502 and never caches when the upstream body exceeds the 2 MiB cap", async () => {
  const cacheState = fakeCache();
  let cancelled = false;
  const chunk = new Uint8Array(1024 * 1024); // 1 MiB per chunk
  stubFetch(async () => {
    const body = new ReadableStream({
      // Never closes: a misbehaving provider keeps pushing chunks. A route
      // that kept draining would never return — answering 502 at all proves
      // the read stopped at the cap.
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "image/png" } });
  });

  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
  assert.equal(cancelled, true, "over-cap stream must be cancelled, never drained");
});

test("accepts and caches a tile body within the cap", async () => {
  const cacheState = fakeCache();
  const big = new Uint8Array(1024 * 1024); // 1 MiB < 2 MiB cap
  stubFetch(async () => new Response(big, { status: 200, headers: { "Content-Type": "image/png" } }));

  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(cacheState.putCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Edge cases (kanban t_ee01cf79): extreme coordinates, query string, header
// injection, upstream content-type, cache key collisions.
// ---------------------------------------------------------------------------

test("boundary coordinates are valid (z=0 at 0/0, z=19 at maxCoord) and overflow is rejected without upstream fetch", async () => {
  let upstreamCalls = 0;
  const upstreamUrls = [];
  stubFetch(async (url) => {
    upstreamCalls += 1;
    upstreamUrls.push(String(url));
    return upstreamResponse();
  });
  const { GET } = await tilesRoute();

  // Exact boundaries: z=0 has only the 0/0 tile; z=19 tops out at 2^19-1.
  for (const params of [
    { z: "0", x: "0", y: "0" },
    { z: "19", x: "524287", y: "524287" },
  ]) {
    const response = await GET(apiRequest("/api/tiles/0/0/0"), { params: Promise.resolve(params) });
    assert.equal(response.status, 200, JSON.stringify(params));
  }
  assert.deepEqual(upstreamUrls, [
    "https://tile.openstreetmap.org/0/0/0.png",
    "https://tile.openstreetmap.org/19/524287/524287.png",
  ]);

  // Just past a boundary or numerically overflowing — all 400, never fetched.
  const callsBefore = upstreamCalls;
  const invalid = [
    { z: "0", x: "1", y: "0" }, // z=0 has no x=1 tile (maxCoord is 0)
    { z: "19", x: "524288", y: "0" }, // one past maxCoord at z=19
    { z: "19", x: "0", y: "524288" },
    { z: "999999999999999999999999", x: "0", y: "0" }, // Number → 1e24, integer but > MAX_ZOOM
    { z: "1e30", x: "0", y: "0" }, // exponent notation, way past MAX_ZOOM
    { z: "13", x: "9999999999999999999999", y: "0" }, // 1e22, past 2^13-1
    { z: "13", x: "0", y: "1e30" }, // past maxCoord at z=13
  ];
  for (const params of invalid) {
    const response = await GET(apiRequest("/api/tiles/13/0/0"), { params: Promise.resolve(params) });
    assert.equal(response.status, 400, JSON.stringify(params));
  }
  assert.equal(upstreamCalls, callsBefore, "overflowing/out-of-range coordinates must never reach the upstream");
});

test("extra query string parameters are ignored upstream (cache key only)", async () => {
  let capturedUrl;
  stubFetch(async (url) => {
    capturedUrl = String(url);
    return upstreamResponse();
  });
  const { GET } = await tilesRoute();
  const response = await GET(
    apiRequest("/api/tiles/13/4250/2900?foo=bar&format=csv&x-injected=1", { headers: {} }),
    { params: Promise.resolve({ z: "13", x: "4250", y: "2900" }) },
  );

  assert.equal(response.status, 200);
  // The upstream URL is the canonical tile URL — no query leakage at all.
  assert.equal(capturedUrl, "https://tile.openstreetmap.org/13/4250/2900.png");
});

test("CR/LF header injection via Referer is rejected (WHATWG guard) and fails closed at the route", async () => {
  // 1. The Request boundary refuses CR/LF in header values outright, so a
  //    hostile Referer can never even reach the proxy code.
  assert.throws(
    () => apiRequest("/api/tiles/13/4250/2900", { headers: { Referer: "https://evil.test/\r\nX-Injected: 1" } }),
    TypeError,
    "a CR/LF in a header value must be rejected at Request construction",
  );

  // 2. Fault-injection at route level: a hostile Referer value that somehow
  //    reached Headers#set (a literal CR/LF cannot be carried by a WHATWG
  //    Request, so we simulate the failure) must make the route fail closed
  //    with 502 — the try/catch around the upstream build — and must not
  //    forward anything upstream.
  let upstreamCalls = 0;
  stubFetch(async () => {
    upstreamCalls += 1;
    return upstreamResponse();
  });
  const RealHeaders = globalThis.Headers;
  globalThis.Headers = class GuardedHeaders extends RealHeaders {
    set(name, value) {
      if (String(name).toLowerCase() === "referer") {
        throw new TypeError("Invalid character in header content");
      }
      return super.set(name, value);
    }
  };
  try {
    const response = await getTile({ z: "13", x: "4250", y: "2900" }, {
      headers: { Referer: "https://evil.test/%0d%0aX-Injected: 1" },
    });
    assert.equal(response.status, 502, "an unforwardable Referer must fail closed with 502");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(upstreamCalls, 0, "no upstream request may be issued with a hostile Referer");
  } finally {
    globalThis.Headers = RealHeaders;
  }
});

test("reduces a benign Referer to its origin (no page path/query, no CR/LF injection upstream)", async () => {
  let capturedReferer;
  stubFetch(async (url, init) => {
    capturedReferer = init.headers.get("Referer");
    return upstreamResponse();
  });
  const weirdReferer = "https://osdb.test/records?from=tile%2F13%0d%0a";
  const response = await getTile({ z: "13", x: "4250", y: "2900" }, { headers: { Referer: weirdReferer } });
  assert.equal(response.status, 200);
  assert.equal(capturedReferer, "https://osdb.test/", "only the origin is forwarded — never the page path or query");
});

test("rejects a non-image upstream Content-Type with 502 and never caches it (security audit 2026-11)", async () => {
  // A provider answering 200 with an HTML page must not be served from our
  // origin as a "tile" (it would be same-origin HTML under the tile path).
  const cacheState = fakeCache();
  stubFetch(async () =>
    new Response("<html>not a tile</html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  );
  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(cacheState.putCalls.length, 0);
});

test("forwards only allow-listed upstream headers (security audit 2026-11)", async () => {
  stubFetch(async () =>
    upstreamResponse({
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600",
        ETag: "\"tile-1\"",
        "Last-Modified": "Wed, 01 Jan 2026 00:00:00 GMT",
        Expires: "Thu, 01 Jan 2026 01:00:00 GMT",
        "Set-Cookie": "tracker=1; path=/",
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy": "default-src *",
        Server: "upstream/1.0",
        "X-Debug-Backend": "render-07",
      },
    }),
  );
  const response = await getTile({ z: "13", x: "4250", y: "2900" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(response.headers.get("etag"), "\"tile-1\"");
  assert.equal(response.headers.get("last-modified"), "Wed, 01 Jan 2026 00:00:00 GMT");
  assert.equal(response.headers.get("expires"), "Thu, 01 Jan 2026 01:00:00 GMT");
  for (const name of ["set-cookie", "access-control-allow-origin", "content-security-policy", "server", "x-debug-backend"]) {
    assert.equal(response.headers.get(name), null, `${name} must not be forwarded from the upstream`);
  }
});

test("cache key is canonical: query strings and the .png suffix share one entry (security audit 2026-11)", async () => {
  const store = new Map();
  const state = { matchUrls: [], putUrls: [] };
  globalThis.caches = {
    default: {
      async match(request) {
        const url = String(request.url);
        state.matchUrls.push(url);
        const cached = store.get(url);
        return cached
          ? new Response(cached, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" } })
          : null;
      },
      async put(request, response) {
        const url = String(request.url);
        state.putUrls.push(url);
        store.set(url, await response.clone().arrayBuffer());
      },
      async delete() {},
    },
  };
  let upstreamCalls = 0;
  stubFetch(async () => {
    upstreamCalls += 1;
    return upstreamResponse();
  });

  const { GET } = await tilesRoute();
  const dispatch = async (requestPath, y) => {
    const response = await GET(apiRequest(requestPath), {
      params: Promise.resolve({ z: "13", x: "1", y }),
    });
    return response.headers.get("x-tile-cache");
  };

  assert.equal(await dispatch("/api/tiles/13/1/2900.png", "2900.png"), "miss");
  assert.equal(await dispatch("/api/tiles/13/1/2900.png?cachebust=1", "2900.png"), "hit");
  assert.equal(await dispatch("/api/tiles/13/1/2900?a=b", "2900"), "hit");
  assert.equal(upstreamCalls, 1, "one physical tile, one upstream fetch");
  assert.deepEqual(state.putUrls, ["https://osdb.test/api/tiles/13/1/2900.png"]);
  assert.ok(state.matchUrls.every((url) => url === "https://osdb.test/api/tiles/13/1/2900.png"));
});
