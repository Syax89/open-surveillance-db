// GET /api/cameras/suggest — search-as-you-type record suggestions (2026-11).
//
// Two layers, like db-public-contracts:
//  1. route contract against the mocked db boundary: bounded q, min length
//     without a db read, limit validation/clamp, public cache headers,
//     read-bucket rate limit (429 never reaches the db), worker cache hit,
//     and the query text never appears in logs;
//  2. the REAL db/cameras.ts SQL against an in-memory D1: public statuses
//     only, public fields only, LIKE wildcards escaped (also in the shared
//     directory list filter).
//
// Fixtures are fictitious (illustrative titles, example addresses).

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let workersEnv;
beforeEach(async () => {
  resetMockState();
  ({ env: workersEnv } = await loadTreeModule("cloudflare-workers.mjs"));
  (await loadLibModule("rate-limit")).resetRateLimitState();
});
afterEach(() => {
  workersEnv.READ_RATE_LIMIT_MAX = "1000000";
  delete globalThis.caches;
});
after(async () => cleanupRouteTree());

const suggestRoute = () => loadRoute("app/api/cameras/suggest/route.mjs");
const SAMPLE = [{ id: 7, title: "Example camera", kind: "Fixed dome", address: "Via Esempio 1" }];

// ---------------------------------------------------------------------------
// Route contract (mocked db)
// ---------------------------------------------------------------------------

test("answers { suggestions } from the db helper with the normalised query and the default limit", async () => {
  stub("suggestPublicCameras", async () => SAMPLE);
  const { GET } = await suggestRoute();
  const response = await GET(apiRequest(`/api/cameras/suggest?q=${encodeURIComponent("  via   esempio ")}`));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { suggestions: SAMPLE });
  assert.deepEqual(callArgs("suggestPublicCameras")[0], ["via esempio", 5]);
  assert.match(response.headers.get("cache-control") ?? "", /^public, s-maxage=300/, "cacheable for anonymous requests");
  assert.equal(response.headers.get("cache-tag"), "cameras-list", "purged with the list on moderation");
});

test("fewer than 2 characters answers an empty list without touching the database", async () => {
  const { GET } = await suggestRoute();
  for (const q of ["", "a", "  b  "]) {
    const response = await GET(apiRequest(`/api/cameras/suggest?q=${encodeURIComponent(q)}`));
    assert.equal(response.status, 200, JSON.stringify(q));
    assert.deepEqual(await responseBody(response), { suggestions: [] });
  }
  assert.equal(callArgs("suggestPublicCameras").length, 0);
});

test("q is bounded by the shared maxQueryLength; limit is validated and clamped", async () => {
  stub("suggestPublicCameras", async () => []);
  const { GET } = await suggestRoute();
  const tooLong = await GET(apiRequest(`/api/cameras/suggest?q=${"x".repeat(201)}`));
  assert.equal(tooLong.status, 400);
  const atLimit = await GET(apiRequest(`/api/cameras/suggest?q=${"x".repeat(200)}`));
  assert.equal(atLimit.status, 200);
  for (const limit of ["0", "-1", "abc", "2.5"]) {
    const response = await GET(apiRequest(`/api/cameras/suggest?q=ab&limit=${limit}`));
    assert.equal(response.status, 400, `limit=${limit}`);
  }
  await GET(apiRequest("/api/cameras/suggest?q=ab&limit=999"));
  assert.equal(callArgs("suggestPublicCameras").at(-1)[1], 10, "an over-max limit is clamped to SUGGEST_MAX_LIMIT");
  const longUrl = await GET(apiRequest(`/api/cameras/suggest?q=ab&pad=${"y".repeat(9000)}`));
  assert.equal(longUrl.status, 414);
});

test("rate-limited in the read bucket: the blocked request never reaches the database", async () => {
  workersEnv.READ_RATE_LIMIT_MAX = "1";
  stub("suggestPublicCameras", async () => SAMPLE);
  const { GET } = await suggestRoute();
  const headers = { "cf-connecting-ip": "203.0.113.150" };
  const first = await GET(apiRequest("/api/cameras/suggest?q=example", { headers }));
  assert.equal(first.status, 200);
  const blocked = await GET(apiRequest("/api/cameras/suggest?q=exampl", { headers }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
  assert.equal(callArgs("suggestPublicCameras").length, 1);
});

test("a worker cache hit is served without a database read or a rate-limit slot", async () => {
  const store = new Map();
  globalThis.caches = { default: { match: async (key) => store.get(key.url)?.clone() ?? null, put: async (key, response) => { store.set(key.url, response); } } };
  workersEnv.READ_RATE_LIMIT_MAX = "1";
  stub("suggestPublicCameras", async () => SAMPLE);
  const { GET } = await suggestRoute();
  const headers = { "cf-connecting-ip": "203.0.113.151" };
  const miss = await GET(apiRequest("/api/cameras/suggest?q=example", { headers }));
  assert.equal(miss.headers.get("x-osdb-cache"), "miss");
  const hit = await GET(apiRequest("/api/cameras/suggest?q=example", { headers }));
  assert.equal(hit.status, 200, "the cache hit bypasses the (exhausted) read bucket");
  assert.equal(hit.headers.get("x-osdb-cache"), "hit");
  assert.deepEqual(await responseBody(hit), { suggestions: SAMPLE });
  assert.equal(callArgs("suggestPublicCameras").length, 1);
});

test("a database failure answers 503 and never logs the query text", async () => {
  stub("suggestPublicCameras", async () => { throw new Error("db down while matching secret-street-name"); });
  const { GET } = await suggestRoute();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  try {
    const response = await GET(apiRequest("/api/cameras/suggest?q=secret-street-name"));
    assert.equal(response.status, 503);
  } finally {
    console.error = original;
  }
  assert.ok(logged.length > 0);
  assert.ok(logged.every((line) => !line.includes("secret-street-name")), `query text leaked into logs: ${logged.join(" | ")}`);
});

// ---------------------------------------------------------------------------
// Real db layer (in-memory D1)
// ---------------------------------------------------------------------------

async function realCameras() {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  const cameras = await loadTreeModule("db-real/cameras.mjs");
  env.DB = new D1();
  await applyDrizzleMigrations(env.DB);
  await env.DB.prepare("DELETE FROM cameras").run();
  return { env, cameras };
}

async function insert(env, { title, kind = "Fixed dome", address = null, status = "active", notes = "private note" }) {
  await env.DB.prepare(
    "INSERT INTO cameras (title, title_sort_key, kind, address, notes, latitude, longitude, status, source, updated, description, created_at) VALUES (?, lower(?), ?, ?, ?, 44.1, 12.2, ?, 'Community report', '2026-01-01T00:00:00.000Z', '', '2026-01-01T00:00:00.000Z')",
  ).bind(title, title, kind, address, notes, status).run();
}

test("suggestPublicCameras: public statuses only, public fields only, matches title/address/kind", async () => {
  const { env, cameras } = await realCameras();
  await insert(env, { title: "Alpha example", address: "Via Esempio 1" });
  await insert(env, { title: "Pending example", status: "pending" });
  await insert(env, { title: "Removed example", status: "removed" });
  await insert(env, { title: "Hidden example", status: "hidden" });
  await insert(env, { title: "Beta", address: "Piazza Example 2" });
  await insert(env, { title: "Gamma", kind: "Example kind" });
  const rows = await cameras.suggestPublicCameras("example", 10);
  assert.deepEqual(rows.map((r) => r.title), ["Alpha example", "Beta", "Gamma"]);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ["address", "id", "kind", "title"], "only public suggestion fields");
  }
  assert.equal(rows.find((r) => r.title === "Gamma").address, null);
  assert.equal((await cameras.suggestPublicCameras("example", 2)).length, 2, "limit applies");
  assert.equal((await cameras.suggestPublicCameras("example", 999)).length, 3, "limit is clamped, never unbounded");
  assert.deepEqual(await cameras.suggestPublicCameras("private note", 10), [], "notes are never searched");
});

test("LIKE wildcards in the query are escaped (suggestions and the directory list filter)", async () => {
  const { env, cameras } = await realCameras();
  await insert(env, { title: "Camera 100% coverage" });
  await insert(env, { title: "Camera 1000 coverage" });
  await insert(env, { title: "Gate_A entrance" });
  await insert(env, { title: "GateBA entrance" });
  await insert(env, { title: "Path\\name" });
  assert.deepEqual((await cameras.suggestPublicCameras("100%", 10)).map((r) => r.title), ["Camera 100% coverage"], "% matches itself");
  assert.deepEqual((await cameras.suggestPublicCameras("_A", 10)).map((r) => r.title), ["Gate_A entrance"], "_ matches itself");
  assert.deepEqual((await cameras.suggestPublicCameras("%%", 10)), [], "a bare wildcard matches nothing");
  assert.deepEqual((await cameras.suggestPublicCameras("h\\n", 10)).map((r) => r.title), ["Path\\name"], "the escape character itself is literal");
  const page = await cameras.listPublicCamerasPage({ q: "_A" }, { limit: 50, offset: 0 });
  assert.deepEqual(page.records.map((r) => r.title), ["Gate_A entrance"], "the shared directory filter escapes too");
  const pct = await cameras.listPublicCamerasPage({ q: "%" }, { limit: 50, offset: 0 });
  assert.deepEqual(pct.records.map((r) => r.title), ["Camera 100% coverage"]);
});

test("escapeLikePattern escapes %, _ and the backslash", async () => {
  const { escapeLikePattern, likeContainsPattern } = await loadLibModule("search");
  assert.equal(escapeLikePattern("50%_off\\x"), "50\\%\\_off\\\\x");
  assert.equal(likeContainsPattern("a_b"), "%a\\_b%");
});
