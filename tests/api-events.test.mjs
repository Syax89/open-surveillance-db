// Runtime API tests for GET /api/cameras/[id]/events — the public lifecycle
// event timeline (ADR 0021 §7, kanban t_a9f23581 FASE 2).
//
// Existence-oracle gate (kanban t_c8c10689, P1): the timeline must be served
// ONLY for record-page statuses (RECORD_PAGE_STATUSES: active/demo/hidden/
// removed, ADR 0021 §6.3) and demo records stay fail-closed (ADR 0008). A
// pending/needs_review/stale/rejected record must answer 404
// indistinguishable from a missing id — same rule as /revisions and
// GET /api/cameras/[id] — and its timeline must never be read.
//
// The route reads the camera row through getD1() (raw D1 statement), so
// these tests stub getD1 with a fake statement chain.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  rateLimit.resetRateLimitState();
});
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/cameras/[id]/events/route.mjs");

// Events fixture in the exact shape the route's SELECT returns (detail is a
// JSON string; the route parses it before answering).
const eventsFixture = [
  { id: 1, eventType: "created", detail: '{"by":"contributor"}', createdAt: "2026-07-01T08:00:00.000Z" },
  { id: 2, eventType: "approved", detail: null, createdAt: "2026-07-02T09:00:00.000Z" },
];

// Fake D1 binding: the camera existence query answers `first()`, the events
// query answers `all()`. Tracks whether the timeline was actually read so a
// 404 test can prove the gate closed BEFORE the events query.
function fakeD1({ camera, events = eventsFixture }) {
  const state = { eventsQueried: 0 };
  const d1 = {
    state,
    prepare(sql) {
      const isCameraQuery = sql.includes("FROM cameras");
      return {
        bind() {
          return {
            async first() {
              if (!isCameraQuery) throw new Error("first() used on the events query");
              return camera;
            },
            async all() {
              if (isCameraQuery) throw new Error("all() used on the camera query");
              state.eventsQueried += 1;
              return { results: events };
            },
          };
        },
      };
    },
  };
  return d1;
}

function cameraRow(status) {
  return { id: 3, status };
}

test("GET returns the parsed public timeline for an active record", async () => {
  const d1 = fakeD1({ camera: cameraRow("active") });
  stub("getD1", async () => d1);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/3/events"));
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("cache-control"),
    "public, s-maxage=300, stale-while-revalidate=600",
    "the timeline is cached for a bounded window and revalidated after moderation decisions",
  );
  assert.equal(response.headers.get("cache-tag"), "camera-3", "the timeline carries the per-record cache-tag");
  const body = await responseBody(response);
  assert.deepEqual(body.events, [
    { id: 1, eventType: "created", detail: { by: "contributor" }, createdAt: "2026-07-01T08:00:00.000Z" },
    { id: 2, eventType: "approved", detail: null, createdAt: "2026-07-02T09:00:00.000Z" },
  ]);
  assert.equal(d1.state.eventsQueried, 1);
});

test("GET returns an empty timeline for an active record without lifecycle events", async () => {
  const d1 = fakeD1({ camera: cameraRow("active"), events: [] });
  stub("getD1", async () => d1);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/3/events"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.events, []);
});

// ---------------------------------------------------------------------------
// Existence-oracle gate (kanban t_c8c10689, P1): non-public statuses 404 and
// the timeline is never read for them.
// ---------------------------------------------------------------------------

test("GET returns 404 for a pending record and never reads its timeline", async () => {
  const d1 = fakeD1({ camera: cameraRow("pending") });
  stub("getD1", async () => d1);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/3/events"));
  assert.equal(response.status, 404);
  assert.equal((await responseBody(response)).error, "Camera not found.");
  assert.equal(d1.state.eventsQueried, 0, "the timeline must not be read for a pending record");
});

test("GET returns 404 for needs_review, stale and rejected records", async () => {
  for (const status of ["needs_review", "stale", "rejected"]) {
    const d1 = fakeD1({ camera: cameraRow(status) });
    stub("getD1", async () => d1);
    const { GET } = await route();
    const response = await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(response.status, 404, `${status} must be indistinguishable from a missing id`);
    assert.equal(d1.state.eventsQueried, 0, `the timeline must not be read for ${status}`);
  }
});

test("GET returns 404 for a missing id", async () => {
  const d1 = fakeD1({ camera: null });
  stub("getD1", async () => d1);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/3/events"));
  assert.equal(response.status, 404);
  assert.equal(d1.state.eventsQueried, 0, "a missing camera must not trigger the events query");
});

// ---------------------------------------------------------------------------
// ADR §6.3 banner contract: hidden/removed records keep their timeline.
// ---------------------------------------------------------------------------

test("GET returns 200 for hidden and removed records (ADR §6.3 banner contract)", async () => {
  for (const status of ["hidden", "removed"]) {
    const d1 = fakeD1({ camera: cameraRow(status) });
    stub("getD1", async () => d1);
    const { GET } = await route();
    const response = await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(response.status, 200, `${status} must keep the history link (ADR §6.3)`);
    assert.equal(d1.state.eventsQueried, 1);
  }
});

// ---------------------------------------------------------------------------
// ADR 0008 demo gate: demo records never answer on a public surface.
// ---------------------------------------------------------------------------

test("GET returns 404 for a demo record (ADR 0008 fail-closed)", async () => {
  const d1 = fakeD1({ camera: cameraRow("demo") });
  stub("getD1", async () => d1);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/3/events"));
  assert.equal(response.status, 404);
  assert.equal(d1.state.eventsQueried, 0, "the timeline must not be read for a demo record");
});

// ---------------------------------------------------------------------------
// Id parsing, URI guard, rate limit and db failure
// ---------------------------------------------------------------------------

test("GET rejects malformed ids without touching the database", async (t) => {
  const { GET } = await route();
  const cases = [
    { name: "missing", path: "/api/cameras//events" },
    { name: "zero", path: "/api/cameras/0/events" },
    { name: "negative", path: "/api/cameras/-1/events" },
    { name: "fractional", path: "/api/cameras/2.5/events" },
    { name: "non-numeric", path: "/api/cameras/abc/events" },
    { name: "scientific", path: "/api/cameras/1e3/events" },
  ];
  for (const { name, path } of cases) {
    await t.test(name, async () => {
      const response = await GET(apiRequest(path));
      assert.equal(response.status, 404, name);
      assert.equal(callArgs("getD1").length, 0, name);
    });
  }
});

test("GET answers 414 for absurdly long URIs before any work", async () => {
  const { GET } = await route();
  const response = await GET(apiRequest(`/api/cameras/3/events?${"a".repeat(5000)}`));
  assert.equal(response.status, 414);
  assert.equal(callArgs("getD1").length, 0);
});

test("GET answers 429 past the read bucket, without touching the database", async () => {
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.READ_RATE_LIMIT_MAX;
  envModule.env.READ_RATE_LIMIT_MAX = "1";
  try {
    stub("getD1", async () => fakeD1({ camera: cameraRow("active") }));
    const { GET } = await route();
    const allowed = await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(allowed.status, 200, "the first call fits the 1/min cap");

    const blocked = await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(callArgs("getD1").length, 1, "the throttled call never reaches the db layer");
  } finally {
    envModule.env.READ_RATE_LIMIT_MAX = previous;
  }
});

test("GET returns 503 when the database is unavailable", async () => {
  stub("getD1", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await route();
  const response = await GET(apiRequest("/api/cameras/3/events"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database unavailable");
});

// ---------------------------------------------------------------------------
// Worker public cache (app/lib/public-cache.ts, perf 2026-11): the timeline
// is fetched on every record view, so it is wrapped in withPublicCache like
// GET /api/cameras/[id]. The stored entry keeps the per-record Cache-Tag so
// the moderation and community-action write paths purge it (no stale
// timeline after an action). No browser max-age: a browser copy cannot be
// purged and the record page refetches the timeline right after an action.
// ---------------------------------------------------------------------------

async function withPurgeConfigured(fn) {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  env.CACHE_PURGE_TOKEN = "test-token";
  env.CACHE_PURGE_ZONE_ID = "test-zone";
  try {
    await fn();
  } finally {
    delete env.CACHE_PURGE_TOKEN;
    delete env.CACHE_PURGE_ZONE_ID;
  }
}

function installFakeCache() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(request) {
        return store.get(request.url)?.clone() ?? null;
      },
      async put(request, response) {
        store.set(request.url, response.clone());
      },
    },
  };
  return store;
}

test("GET serves repeat views from the worker public cache with the per-record Cache-Tag", async () => {
  const store = installFakeCache();
  try { await withPurgeConfigured(async () => {
    const d1 = fakeD1({ camera: cameraRow("active") });
    stub("getD1", async () => d1);
    const { GET } = await route();

    const first = await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("x-osdb-cache"), "miss");
    assert.equal(store.size, 1, "the 200 timeline is stored");
    const stored = [...store.values()][0];
    assert.equal(stored.headers.get("cache-tag"), "camera-3", "the stored entry stays purgeable by the record tag");
    assert.doesNotMatch(stored.headers.get("cache-control") ?? "", /(^|[ ,])max-age=/, "no unpurgeable browser max-age");

    const second = await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("x-osdb-cache"), "hit");
    assert.equal(d1.state.eventsQueried, 1, "a cache hit must not re-query D1");
    assert.equal(callArgs("getD1").length, 1);
    assert.equal((await responseBody(second)).events.length, 2);
  }); } finally {
    delete globalThis.caches;
  }
});

test("GET does not use the worker cache when tag purge is not configured (no stale timeline after an action)", async () => {
  const store = installFakeCache();
  try {
    const d1 = fakeD1({ camera: cameraRow("active") });
    stub("getD1", async () => d1);
    const { GET } = await route();
    await GET(apiRequest("/api/cameras/3/events"));
    await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(store.size, 0, "nothing is stored without purge credentials");
    assert.equal(d1.state.eventsQueried, 2, "every view reads the fresh timeline");
  } finally {
    delete globalThis.caches;
  }
});

test("GET never caches a 404 timeline (existence oracle stays fresh)", async () => {
  const store = installFakeCache();
  try { await withPurgeConfigured(async () => {
    stub("getD1", async () => fakeD1({ camera: cameraRow("pending") }));
    const { GET } = await route();
    const response = await GET(apiRequest("/api/cameras/3/events"));
    assert.equal(response.status, 404);
    assert.equal(store.size, 0);
  }); } finally {
    delete globalThis.caches;
  }
});
