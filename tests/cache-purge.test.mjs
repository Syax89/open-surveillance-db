// Unit tests for app/lib/cache-purge.ts (follow-up F0, t_ae600b90).
//
// The helper drives the Cloudflare Cache Purge API from the moderation
// write path. It must be fail-open: absent credentials make it a documented
// no-op, and any API/network failure must not propagate to the caller (the
// moderation decision itself never depends on cache invalidation).

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLibModule } from "./helpers/api-harness.mjs";

after(async () => {
  cleanupRouteTree();
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;
const captured = [];
function stubFetch(impl) {
  captured.length = 0;
  globalThis.fetch = async (input, init) => {
    captured.push({ url: String(input), init });
    return impl ? impl() : new Response(JSON.stringify({ success: true }), { status: 200 });
  };
}

const purgeModule = () => loadLibModule("cache-purge");

test("purgeCacheTags returns not-configured without credentials and never calls fetch", async () => {
  const { purgeCacheTags } = await purgeModule();
  stubFetch();
  const result = await purgeCacheTags(["cameras-list"], {});
  assert.deepEqual(result, { purged: false, reason: "not-configured" });
  assert.equal(captured.length, 0, "no network call without credentials");

  const partial = await purgeCacheTags(["cameras-list"], { CACHE_PURGE_TOKEN: "t" });
  assert.equal(partial.reason, "not-configured");
  assert.equal(captured.length, 0);
});

test("purgeCacheTags posts the tags to the zone purge endpoint with a bearer token", async () => {
  const { purgeCacheTags } = await purgeModule();
  stubFetch();
  const result = await purgeCacheTags(
    ["cameras-list", "camera-5"],
    { CACHE_PURGE_TOKEN: "token-123", CACHE_PURGE_ZONE_ID: "zone-abc" },
  );
  assert.deepEqual(result, { purged: true });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, "https://api.cloudflare.com/client/v4/zones/zone-abc/purge_cache");
  assert.equal(captured[0].init.method, "POST");
  assert.equal(captured[0].init.headers.Authorization, "Bearer token-123");
  assert.match(captured[0].init.headers["Content-Type"] ?? "", /application\/json/);
  assert.deepEqual(JSON.parse(captured[0].init.body), {
    tags: ["cameras-list", "camera-5"],
  });
});

test("purgeCacheTags returns an http failure reason without throwing", async () => {
  const { purgeCacheTags } = await purgeModule();
  stubFetch(() => new Response("zone not found", { status: 404 }));
  const result = await purgeCacheTags(
    ["cameras-list"],
    { CACHE_PURGE_TOKEN: "token-123", CACHE_PURGE_ZONE_ID: "zone-abc" },
  );
  assert.deepEqual(result, { purged: false, reason: "http-404" });
});

test("purgeCacheTags returns a network failure reason without throwing", async () => {
  const { purgeCacheTags } = await purgeModule();
  stubFetch(() => {
    throw new Error("fetch failed");
  });
  const result = await purgeCacheTags(
    ["cameras-list"],
    { CACHE_PURGE_TOKEN: "token-123", CACHE_PURGE_ZONE_ID: "zone-abc" },
  );
  assert.deepEqual(result, { purged: false, reason: "network-error" });
});

test("cameraPurgeTags covers the shared collections plus the per-id record tag", async () => {
  const { cameraPurgeTags } = await purgeModule();
  assert.deepEqual(cameraPurgeTags(7), [
    "cameras-list",
    "cameras-bbox",
    "cameras-export",
    "camera-7",
  ]);
});
