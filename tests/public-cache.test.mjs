// Worker cache for public reads (app/lib/public-cache.ts, CEO 2026-08-07):
// the map/directory/record GET routes cache their database responses in
// the worker's Cache API so repeat views never re-query D1 (on the
// container there is no CDN in front of the worker, so the edge
// Cache-Control headers alone never spared the database).
//
// Contract under test:
//   1. cache hit → the stored body+headers come back with X-OSDB-Cache: hit
//      and the builder is NOT invoked;
//   2. cache miss → the builder runs, the response is stored with
//      X-OSDB-Cache: miss and the original Cache-Control is preserved;
//   3. routes without their own Cache-Control get a bounded fallback TTL;
//   4. only 200 responses are stored (errors/4xx are never cached);
//   5. fail-open: a cache read or write error still returns the built
//      response — the cache must never take the route down.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const modulePath = "../app/lib/public-cache.ts";

async function loadModule() {
  const { pathToFileURL } = await import("node:url");
  const { readFile } = await import("node:fs/promises");
  const ts = (await import("typescript")).default;
  const source = await readFile(new URL(modulePath, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  }).outputText;
  const tmp = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp("/tmp/public-cache-"));
  // The module imports `vinext/shims/request-context` (ctx.waitUntil for the
  // streamed-export cache write): link the repo's node_modules so the bare
  // specifier resolves from the temp dir.
  await (await import("node:fs/promises")).symlink(new URL("../node_modules", import.meta.url), `${tmp}/node_modules`, "dir");
  const file = `${tmp}/public-cache.mjs`;
  await (await import("node:fs/promises")).writeFile(file, js);
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`);
}

function installFakeCache() {
  const state = { store: new Map(), matchCalls: 0, putCalls: 0, matchError: null, putError: null };
  globalThis.caches = {
    default: {
      async match(key) {
        state.matchCalls += 1;
        if (state.matchError) throw state.matchError;
        return state.store.get(key.url) ?? null;
      },
      async put(key, response) {
        state.putCalls += 1;
        if (state.putError) throw state.putError;
        state.store.set(key.url, response);
      },
    },
  };
  return state;
}

afterEach(() => {
  delete globalThis.caches;
});

test("cache hit serves the stored response without invoking the builder", async () => {
  const { withPublicCache } = await loadModule();
  const state = installFakeCache();
  state.store.set("https://osdb.test/api/cameras?bbox=1,2,3,4", new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=300", "Cache-Tag": "list" },
  }));

  let builds = 0;
  const response = await withPublicCache(new Request("https://osdb.test/api/cameras?bbox=1,2,3,4"), 300, async () => {
    builds += 1;
    return new Response(JSON.stringify({ records: [{ id: 999 }] }), { status: 200 });
  });

  assert.equal(builds, 0, "a cache hit must not invoke the database builder");
  assert.equal(response.headers.get("X-OSDB-Cache"), "hit");
  const body = await response.json();
  assert.deepEqual(body, { records: [] }, "the stored body is returned");
  assert.equal(response.headers.get("Cache-Tag"), "list", "stored headers are preserved");
});

test("cache miss runs the builder and stores the response with X-OSDB-Cache: miss", async () => {
  const { withPublicCache } = await loadModule();
  const state = installFakeCache();

  let builds = 0;
  const response = await withPublicCache(new Request("https://osdb.test/api/cameras?limit=10"), 300, async () => {
    builds += 1;
    return Response.json({ records: [{ id: 1 }], total: 1 }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Cache-Tag": "list" },
    });
  });

  assert.equal(builds, 1, "a miss must run the builder once");
  assert.equal(response.headers.get("X-OSDB-Cache"), "miss");
  assert.equal(state.putCalls, 1, "the response is stored for the next request");
  assert.equal(state.store.size, 1);

  // Second request now hits.
  const second = await withPublicCache(new Request("https://osdb.test/api/cameras?limit=10"), 300, async () => {
    builds += 1;
    throw new Error("the builder must not run on a hit");
  });
  assert.equal(second.headers.get("X-OSDB-Cache"), "hit");
  assert.equal(builds, 1, "the second request is served from the cache");
});

test("responses without Cache-Control get a bounded fallback TTL", async () => {
  const { withPublicCache } = await loadModule();
  const state = installFakeCache();

  await withPublicCache(new Request("https://osdb.test/api/cameras/42"), 120, async () =>
    Response.json({ record: { id: 42 } }),
  );

  const stored = state.store.get("https://osdb.test/api/cameras/42");
  assert.ok(stored, "the response was stored");
  assert.equal(stored.headers.get("Cache-Control"), "public, max-age=120, s-maxage=120", "fallback TTL is bounded");
});

test("non-200 responses are never stored", async () => {
  const { withPublicCache } = await loadModule();
  const state = installFakeCache();

  const notFound = await withPublicCache(new Request("https://osdb.test/api/cameras/999"), 300, async () =>
    Response.json({ error: "Camera not found." }, { status: 404 }),
  );
  assert.equal(notFound.status, 404);
  assert.equal(state.putCalls, 0, "404 must not be cached");

  const serverError = await withPublicCache(new Request("https://osdb.test/api/cameras?x=1"), 300, async () =>
    Response.json({ error: "Database unavailable" }, { status: 503 }),
  );
  assert.equal(serverError.status, 503);
  assert.equal(state.putCalls, 0, "503 must not be cached");
});

test("fail-open: a cache read error still returns the built response", async () => {
  const { withPublicCache } = await loadModule();
  const state = installFakeCache();
  state.matchError = new Error("cache read failed");

  let builds = 0;
  const response = await withPublicCache(new Request("https://osdb.test/api/cameras"), 300, async () => {
    builds += 1;
    return Response.json({ records: [{ id: 7 }] });
  });

  assert.equal(builds, 1, "the builder runs despite the cache read error");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { records: [{ id: 7 }] }, "the real response is returned");
});

test("fail-open: a cache write error still returns the built response", async () => {
  const { withPublicCache } = await loadModule();
  const state = installFakeCache();
  state.putError = new Error("cache write failed");

  let builds = 0;
  const response = await withPublicCache(new Request("https://osdb.test/api/cameras?kind=dome"), 300, async () => {
    builds += 1;
    return Response.json({ records: [] });
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { records: [] }, "the response is returned even when the store fails");
});

test("cache keys are query-string sensitive (different bbox = different entry)", async () => {
  const { withPublicCache } = await loadModule();
  const state = installFakeCache();

  await withPublicCache(new Request("https://osdb.test/api/cameras?bbox=1,2,3,4"), 300, async () =>
    Response.json({ records: [1] }),
  );
  await withPublicCache(new Request("https://osdb.test/api/cameras?bbox=5,6,7,8"), 300, async () =>
    Response.json({ records: [2] }),
  );

  assert.equal(state.store.size, 2, "different viewports are cached separately");
  assert.equal(state.matchCalls, 2, "each distinct query is checked independently");
});

// ---------------------------------------------------------------------------
// Streamed bodies (Workers OOM, 2026-11): the full CSV/GeoJSON exports are a
// ReadableStream paged from D1. `await cache.put(response.clone())` would
// drain the cache branch of the clone's tee before the client branch is
// read, i.e. hold the WHOLE export in memory. A response flagged with
// markStreamedResponse is instead split with a lockstep tee (bounded) and
// the cache write runs in ctx.waitUntil, concurrently with the download.
// ---------------------------------------------------------------------------

const { runWithExecutionContext } = await import("vinext/shims/request-context");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function countedSource(chunks) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (state.pulled === chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[state.pulled]));
        state.pulled += 1;
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

async function readAll(stream, onChunk = () => {}) {
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
    await onChunk();
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// A cache whose put() consumes the body chunk by chunk, like the Workers
// Cache API, optionally slowly.
function installStreamingCache({ putDelayMs = 0, putError = null } = {}) {
  const state = { store: new Map(), putCalls: 0, consumed: 0 };
  globalThis.caches = {
    default: {
      async match(key) {
        return state.store.get(key.url) ?? null;
      },
      async put(key, response) {
        state.putCalls += 1;
        if (putError) throw putError;
        const text = await readAll(response.body, async () => {
          state.consumed += 1;
          if (putDelayMs) await new Promise((resolve) => setTimeout(resolve, putDelayMs));
        });
        state.store.set(key.url, new Response(text, { status: response.status, headers: response.headers }));
      },
    },
  };
  return state;
}

function streamedBuilder(markStreamedResponse, chunks) {
  const source = countedSource(chunks);
  const build = async () =>
    markStreamedResponse(new Response(source.stream, { headers: { "Content-Type": "text/csv", "Cache-Control": "public, s-maxage=86400", "Cache-Tag": "cameras-export" } }));
  return { source, build };
}

const CHUNKS = Array.from({ length: 20 }, (_, index) => `row-${index}\n`);

test("streamed miss: the client and the cache both get the full body, the put runs in waitUntil", async () => {
  const { withPublicCache, markStreamedResponse } = await loadModule();
  const cache = installStreamingCache({ putDelayMs: 1 });
  const { source, build } = streamedBuilder(markStreamedResponse, CHUNKS);
  const background = [];
  const ctx = { waitUntil: (promise) => background.push(promise) };

  const response = await runWithExecutionContext(ctx, () =>
    withPublicCache(new Request("https://osdb.test/api/cameras?format=csv"), 300, build),
  );
  assert.equal(background.length, 1, "the cache write is handed to waitUntil, not awaited before the response");
  assert.equal(response.headers.get("X-OSDB-Cache"), "miss");
  assert.equal(response.headers.get("Cache-Tag"), "cameras-export");

  let maxLead = 0;
  let clientChunks = 0;
  const body = await readAll(response.body, () => {
    clientChunks += 1;
    // Lockstep: the source never runs ahead of the slower reader by more
    // than the chunk in flight.
    maxLead = Math.max(maxLead, source.state.pulled - Math.min(clientChunks, cache.consumed));
  });
  await Promise.all(background);

  assert.equal(body, CHUNKS.join(""));
  assert.ok(maxLead <= 2, `the source ran ${maxLead} chunks ahead of the slower branch`);
  const stored = cache.store.get("https://osdb.test/api/cameras?format=csv");
  assert.ok(stored, "the export is cached for the next request");
  assert.equal(await stored.text(), CHUNKS.join(""));
  assert.equal(stored.headers.get("Cache-Control"), "public, s-maxage=86400", "the export TTL is preserved");
  assert.equal(stored.headers.get("X-OSDB-Cache"), "miss");
});

test("streamed miss without an ExecutionContext deliberately bypasses the cache", async () => {
  const { withPublicCache, markStreamedResponse } = await loadModule();
  const cache = installStreamingCache();
  const { build } = streamedBuilder(markStreamedResponse, CHUNKS);
  const response = await withPublicCache(new Request("https://osdb.test/api/cameras?format=csv"), 300, build);
  assert.equal(await response.text(), CHUNKS.join(""));
  assert.equal(cache.putCalls, 0, "no waitUntil -> no cache write (awaiting it would buffer the whole body)");
});

test("streamed miss: a failing cache write is detached and the download carries on", async () => {
  const { withPublicCache, markStreamedResponse } = await loadModule();
  installStreamingCache({ putError: new Error("cache write failed") });
  const { build } = streamedBuilder(markStreamedResponse, CHUNKS);
  const background = [];
  const response = await runWithExecutionContext({ waitUntil: (promise) => background.push(promise) }, () =>
    withPublicCache(new Request("https://osdb.test/api/cameras?format=geojson"), 300, build),
  );
  assert.equal(await response.text(), CHUNKS.join(""));
  await Promise.all(background);
});

test("streamed miss: a client that disconnects cancels the source and stores nothing", async () => {
  const { withPublicCache, markStreamedResponse } = await loadModule();
  const cache = installStreamingCache();
  const { source, build } = streamedBuilder(markStreamedResponse, CHUNKS);
  const background = [];
  const response = await runWithExecutionContext({ waitUntil: (promise) => background.push(promise) }, () =>
    withPublicCache(new Request("https://osdb.test/api/cameras?format=csv"), 300, build),
  );
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel("client went away");
  await Promise.all(background);
  assert.equal(source.state.cancelled, true, "the D1 walk stops with the client");
  assert.ok(source.state.pulled < CHUNKS.length);
  assert.equal(cache.store.size, 0, "a partial export is never cached");
});

test("lockstepTee reads the source only when both branches want a chunk", async () => {
  const { lockstepTee } = await loadModule();
  const source = countedSource(["a", "b", "c"]);
  const tee = lockstepTee(source.stream);
  const primary = tee.primary.getReader();
  const secondary = tee.secondary.getReader();

  const firstPrimary = primary.read();
  await tick();
  assert.equal(source.state.pulled, 0, "the primary alone cannot pull the source");
  const firstSecondary = secondary.read();
  assert.equal(decoder.decode((await firstPrimary).value), "a");
  assert.equal(decoder.decode((await firstSecondary).value), "a");

  const secondPrimary = primary.read();
  await tick();
  assert.equal(source.state.pulled, 1, "the primary cannot run ahead of a stalled secondary");
  tee.detachSecondary(new Error("cache gave up"));
  assert.equal(decoder.decode((await secondPrimary).value), "b", "once detached, the primary continues alone");
  assert.equal(decoder.decode((await primary.read()).value), "c");
  assert.equal((await primary.read()).done, true);
  await assert.rejects(secondary.read(), /cache gave up/);
});
