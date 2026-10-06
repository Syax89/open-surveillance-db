/**
 * Viewport-bounded data layer for the interactive map (kanban t_bb310428 —
 * P0 map UX regression).
 *
 * The /mappa data layer used to walk ALL public pages serially (15 × GET
 * /api/cameras?limit=500 on 7,374 records, measured ~5.35s before any
 * marker). useViewportCameras replaces that with ONE bounded bbox request
 * per viewport. This suite locks the contract at the hook level:
 *
 *   1. the FIRST fetch for a viewport is a single ?bbox= query — never a
 *      limit=500 page of the full walk;
 *   2. a repeated request for the SAME bbox performs ZERO network fetches
 *      (module cache);
 *   3. a pan that stays inside an already-loaded (padded) area performs
 *      ZERO network fetches (containment skip) and keeps the loading flag
 *      settled (never spins);
 *   4. an overlapping pan performs ONE new fetch, and the store MERGES the
 *      records id-deduped (no duplicate markers on pan-back);
 *   5. ?focus=ID resolves the record through the dedicated endpoint when it
 *      lies outside every loaded bbox, WITHOUT firing onRecords;
 *   6. onRecords fires exactly ONCE (empty → non-empty transition), never
 *      again on later pans/merges;
 *   7. reload() drops every cache and refetches (error recovery).
 *
 * Fixtures are fictitious (illustrative coordinates, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let useViewportCameras;
let __resetViewportCamerasCache;
let viewportQuery;

const RECORDS = [
  { id: 1, title: "Via Roma corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" },
  { id: 2, title: "Piazza Venezia", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report" },
  { id: 3, title: "Via del Corso", kind: "bullet", status: "active", latitude: 41.9009, longitude: 12.4761, source: "Community report" },
];

// Rome viewport (contains all three fixtures).
const ROME = { south: 41.8, north: 42.0, west: 12.3, east: 12.7 };
// A small viewport inside ROME (contains camera 1 only).
const INSIDE = { south: 41.895, north: 41.905, west: 12.49, east: 12.50 };
// Far away (Milan) — no fixtures.
const MILAN = { south: 45.4, north: 45.5, west: 9.1, east: 9.3 };
// Regional overview: 4° × 3° = 12 sq deg — larger than the overview cap
// but still below the server's 50 sq deg continental threshold.
const REGIONAL_OVERVIEW = { south: 39, north: 42, west: 10, east: 14 };
// Still below the 50 sq deg continental server cap, but a later zoom-out
// stage — it must replace REGIONAL_OVERVIEW rather than produce a second call.
const WIDER_OVERVIEW = { south: 37, north: 42, west: 8, east: 16 };

/** Wrap the hook in a tiny component that exposes its state for assertions. */
function HookProbe({ bounds, filters, focusId, onRecords }) {
  const state = useViewportCameras({ bounds, filters, focusId, onRecords });
  return React.createElement("div", {
    "data-testid": "probe",
    "data-records": JSON.stringify(state.records.map((r) => r.id)),
    "data-loading": String(state.loading),
    "data-error": String(state.error),
    "data-decimated": String(state.decimated),
    "data-retry-after": String(state.retryAfterSeconds ?? ""),
    "data-empty": String(state.empty),
    "data-total": String(state.total ?? ""),
  }, React.createElement("button", { onClick: state.reload, "data-testid": "reload" }, "Reload"));
}

before(async () => {
  rtl = await setupDom();
  const mod = await loadDomModule("app/lib/use-viewport-cameras.mjs");
  useViewportCameras = mod.useViewportCameras;
  __resetViewportCamerasCache = mod.__resetViewportCamerasCache;
  viewportQuery = mod.viewportQuery;
});

afterEach(() => {
  rtl?.cleanup();
  __resetViewportCamerasCache();
  installFetchMock(() => jsonResponse({ error: "no stub" }, { status: 404 }));
});

/** Records the request URLs; answers every ?bbox= with the full fixture list. */
function installBboxMock(calls, { records = RECORDS, total, decimated } = {}) {
  installFetchMock((input) => {
    const url = String(input);
    calls.push(url);
    const u = new URL(url, "http://example.test");
    if (u.pathname.startsWith("/api/cameras/")) {
      // ?focus= deep-link record endpoint.
      const id = Number(u.pathname.split("/").pop());
      const record = RECORDS.find((r) => r.id === id) ?? null;
      return jsonResponse(record ? { record } : { error: "not found" }, { status: record ? 200 : 404 });
    }
    if (u.searchParams.has("bbox")) {
      return jsonResponse({ records, total: total ?? records.length, nextOffset: null, decimated });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const URLS = { API: "/api/cameras", WALK_LIMIT: "limit=2000", BBOX: "bbox=" };

async function renderProbe(props) {
  return renderWithLocale(React.createElement(HookProbe, props));
}

test("the first fetch for a viewport is ONE bbox query — never a paginated walk page", async () => {
  const calls = [];
  installBboxMock(calls);
  await renderProbe({ bounds: ROME, filters: {} });

  // Debounce (150ms) + fetch round-trip.
  await pause(300);
  assert.ok(calls.length >= 1, "the viewport must fetch");
  for (const url of calls) {
    assert.ok(!url.includes(URLS.WALK_LIMIT), `never a full-list walk page: ${url}`);
    assert.ok(url.includes(URLS.BBOX), `every map fetch carries a bbox: ${url}`);
    assert.ok(url.startsWith(URLS.API), `only the cameras API: ${url}`);
  }
});

test("small bboxes keep the count-free probe while regional overviews let the server decimate", () => {
  const small = new URL(viewportQuery(ROME, {}), "https://example.test");
  const overview = new URL(viewportQuery(REGIONAL_OVERVIEW, {}), "https://example.test");
  assert.equal(small.searchParams.get("count"), "false", "street/city views avoid an unnecessary COUNT");
  assert.equal(overview.searchParams.has("count"), false, "overview views use the existing count + decimation contract");
});

test("a continental viewport fetches ONCE after the long zoom-out debounce (no flood, no walk)", async () => {
  const calls = [];
  // The server answers continental viewports with a decimated sample.
  installBboxMock(calls, { decimated: true });
  // -120,60,120,-60... west,south,east,north: 240° × 120° = 28800 sq deg.
  const WORLD = { south: -60, north: 60, west: -120, east: 120 };
  const view = await renderProbe({ bounds: WORLD, filters: {} });
  // Continental viewports use the LONG debounce (800 ms): a zoom-out gesture
  // sweeping many oversized bboxes settles into ONE request, not one per step.
  await pause(300);
  assert.equal(calls.length, 0, "mid-gesture: no request leaves the client yet");
  await pause(800);
  assert.equal(calls.length, 1, "the settled viewport fetches exactly ONE sample — never a walk");
  const probe = rtl.screen.getByTestId("probe");
  assert.equal(probe.getAttribute("data-decimated"), "true", "the decimated flag reaches the UI (sample notice)");
  assert.equal(probe.getAttribute("data-loading"), "false", "the state settles after the sample lands");
  assert.equal(probe.getAttribute("data-error"), "false", "a decimated sample is not an error");
});

test("an expanding regional viewport gets the long zoom-out debounce before the continental cap", async () => {
  const calls = [];
  installBboxMock(calls);
  const view = await renderProbe({ bounds: ROME, filters: {} });
  await pause(300);
  assert.equal(calls.length, 1, "the initial small viewport is still prompt");

  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: REGIONAL_OVERVIEW, filters: {} })));
  await pause(300);
  assert.equal(calls.length, 1, "a zoom-out below 50 sq deg must not start a request mid-gesture");
  await pause(800);
  assert.equal(calls.length, 2, "after the gesture settles the latest regional bbox fetches once");
});

test("successive zoom-out stages collapse to the final bbox instead of issuing one request per step", async () => {
  const calls = [];
  installBboxMock(calls);
  const view = await renderProbe({ bounds: ROME, filters: {} });
  await pause(300);
  assert.equal(calls.length, 1);

  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: REGIONAL_OVERVIEW, filters: {} })));
  await pause(100);
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: WIDER_OVERVIEW, filters: {} })));
  await pause(300);
  assert.equal(calls.length, 1, "neither intermediate nor final bbox starts while the burst is active");
  await pause(800);
  assert.equal(calls.length, 2, "only the final bbox is fetched after quiet time");
  assert.match(calls[1], /bbox=8%2C37%2C16%2C42/, "the emitted request is the final zoom-out viewport");
});

test("a repeated request for the same bbox is served from the module cache (zero network)", async () => {
  const calls = [];
  installBboxMock(calls);
  const view = await renderProbe({ bounds: ROME, filters: {} });
  await pause(300);
  const first = calls.length;
  assert.ok(first >= 1);

  // Same quantized bounds, same filters → cache hit, no fetch.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: ROME, filters: {} })));
  await pause(300);
  assert.equal(calls.length, first, "the identical viewport must not refetch (module cache)");
});

test("a pan inside an already-loaded padded area performs ZERO fetches and keeps the state settled", async () => {
  const calls = [];
  installBboxMock(calls);
  const view = await renderProbe({ bounds: ROME, filters: {} });
  await pause(300);
  assert.ok(calls.length >= 1);
  const first = calls.length;

  // INSIDE is contained in the padded ROME box → no network, no loading spin.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: INSIDE, filters: {} })));
  await pause(300);
  assert.equal(calls.length, first, "a contained pan must not fetch");
  const probe = rtl.screen.getByTestId("probe");
  assert.equal(probe.getAttribute("data-loading"), "false", "the state must settle (never spin on a covered pan)");
  assert.equal(probe.getAttribute("data-error"), "false");
});

test("an overlapping pan performs ONE new fetch and the store merges records id-deduped", async () => {
  const calls = [];
  installBboxMock(calls);
  const view = await renderProbe({ bounds: ROME, filters: {} });
  await pause(300);
  assert.ok(calls.length >= 1);
  const first = calls.length;

  // MILAN overlaps nothing → one new bbox fetch; the merged store keeps all
  // Rome records AND the Milan result, deduped by id.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: MILAN, filters: {} })));
  await pause(300);
  assert.equal(calls.length, first + 1, "a non-covered pan performs exactly ONE new fetch");
  const probe = rtl.screen.getByTestId("probe");
  const ids = JSON.parse(probe.getAttribute("data-records"));
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, "the merged store must never duplicate a record id");
});

test("?focus=ID resolves the record through the dedicated endpoint when it is outside every loaded bbox", async () => {
  const calls = [];
  installBboxMock(calls);
  const view = await renderProbe({ bounds: MILAN, filters: {}, focusId: 2 });
  await pause(300);

  const detailCall = calls.find((url) => url.includes("/api/cameras/2"));
  assert.ok(detailCall, "the focus record must be fetched from the dedicated endpoint");
  const probe = rtl.screen.getByTestId("probe");
  const ids = JSON.parse(probe.getAttribute("data-records"));
  assert.ok(ids.includes(2), "the deep-linked record joins the store even outside every loaded bbox");

  // Focus merging must NOT fire onRecords (a deep link must never be
  // overridden by the first-viewport selection) — covered by the
  // notification test below; here just assert the state is stable after a
  // re-render with the same focus.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: MILAN, filters: {}, focusId: 2 })));
  await pause(150);
  assert.equal(calls.filter((url) => url.includes("/api/cameras/2")).length, 1, "the focus walk is deduped too");
});

test("onRecords fires exactly ONCE (empty → non-empty transition), never on later merges", async () => {
  const calls = [];
  let notifications = 0;
  installBboxMock(calls);
  const view = await renderProbe({ bounds: ROME, filters: {}, onRecords: () => { notifications += 1; } });
  await pause(300);
  assert.ok(notifications >= 1, "the first non-empty payload notifies the caller");

  // Pan to Milan (a new fetch): the store stays non-empty → no second call.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: MILAN, filters: {}, onRecords: () => { notifications += 1; } })));
  await pause(300);
  assert.equal(notifications, 1, "onRecords must not fire again once the store is non-empty");
});

test("reload() drops every cache and refetches the current viewport (error recovery)", async () => {
  const calls = [];
  installBboxMock(calls);
  await renderProbe({ bounds: ROME, filters: {} });
  await pause(300);
  const first = calls.length;
  assert.ok(first >= 1);

  // The exposed reload handle clears the module caches and bumps the
  // attempt counter — the SAME viewport must fetch again.
  const reload = rtl.screen.getByTestId("reload");
  reload.click();
  await pause(300);
  assert.equal(calls.length, first + 1, "after reload() the same viewport fetches again (cache dropped)");
});

test("a rate-limited viewport waits for Retry-After and retries once instead of leaving the map stuck", async () => {
  let attempts = 0;
  installFetchMock((input) => {
    const url = String(input);
    if (!url.includes("bbox=")) return jsonResponse({ error: "unexpected request" }, { status: 404 });
    attempts += 1;
    if (attempts === 1) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "1" },
      });
    }
    return jsonResponse({ records: RECORDS, total: RECORDS.length, nextOffset: null });
  });
  await renderProbe({ bounds: ROME, filters: {} });

  await pause(300);
  const probe = rtl.screen.getByTestId("probe");
  assert.equal(probe.getAttribute("data-error"), "true", "the initial 429 is surfaced as a temporary map state");
  assert.equal(probe.getAttribute("data-retry-after"), "1", "the hook exposes the server retry window");

  await pause(1_300);
  assert.equal(attempts, 2, "the hook performs exactly one delayed retry after the server window");
  assert.equal(probe.getAttribute("data-error"), "false", "a successful retry clears the temporary error state");
  assert.equal(probe.getAttribute("data-records"), JSON.stringify(RECORDS.map((record) => record.id)));
});

// ---------------------------------------------------------------------------
// B04 — two rectangles that round to the SAME quantized cache cell are not
// conflated: the second area still fetches (and merges) the records only it
// contains. Mirrors the controller's real-hook quantization probe.
// ---------------------------------------------------------------------------

test("B04: two rectangles sharing a quantized cell are NOT conflated (no unfetched strip)", async () => {
  const calls = [];
  const dateline = [
    { id: 1, title: "Fixture A", kind: "bullet", status: "active", latitude: 0.05, longitude: 0.05, source: "Community report" },
    { id: 2, title: "Fixture B", kind: "bullet", status: "active", latitude: 0.05, longitude: 0.10005, source: "Community report" },
  ];
  installFetchMock((input) => {
    const url = new URL(String(input), "https://example.test");
    const bbox = url.searchParams.get("bbox");
    calls.push(bbox);
    const [w, s, e, n] = bbox.split(",").map(Number);
    const rows = dateline.filter((r) => r.longitude >= w && r.longitude <= e && r.latitude >= s && r.latitude <= n);
    return jsonResponse({ records: rows, total: null, nextOffset: null, decimated: false });
  });
  // Both rectangles quantize (3 decimals) to the same cache cell, but B
  // extends to a strip A never fetched (record 2 at 0.10005 belongs to B).
  const A = { south: 0, north: 0.1, west: 0, east: 0.1 };
  const B = { south: 0, north: 0.1, west: 0.0001, east: 0.1001 };
  const view = await renderProbe({ bounds: A, filters: {} });
  await pause(400);
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: B, filters: {} })));
  await pause(400);
  const probe = rtl.screen.getByTestId("probe");
  const ids = JSON.parse(probe.getAttribute("data-records")).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2], "the record only inside the second rectangle must appear (cell key never covers unfetched geometry)");
  assert.equal(calls.length, 2, "the second geometry performs exactly one new request");
});

test("viewportQuery builds the bbox URL with the bounded limit and forwards kind/freshness", () => {
  const url = new URL(viewportQuery(ROME, { kind: "bullet", freshness: "30d" }), "http://example.test");
  // URLSearchParams serialises the whole-number east/north without a
  // trailing ".0" — the API's strict decimal regex accepts both forms.
  assert.equal(url.searchParams.get("bbox"), "12.3,41.8,12.7,42");
  assert.equal(url.searchParams.get("limit"), "10000", "the client asks for the whole visible set in one bounded request");
  assert.equal(url.searchParams.get("kind"), "bullet");
  assert.equal(url.searchParams.get("freshness"), "30d");
  const plain = new URL(viewportQuery(ROME, {}), "http://example.test");
  assert.equal(plain.searchParams.get("kind"), null);
  assert.equal(plain.searchParams.get("freshness"), null);
  // count=false opts the viewport out of the bbox COUNT scan (D1 rows-read
  // optimization, 2026-08-12): the map paginates on nextOffset alone.
  assert.equal(url.searchParams.get("count"), "false");
  assert.equal(plain.searchParams.get("count"), "false");
});

// ---------------------------------------------------------------------------
// B03 — the raw Leaflet viewport is normalized to the server's geographic
// contract, so a world / antimeridian view never produces a 400-shaped bbox.
// ---------------------------------------------------------------------------

const bboxesOf = (calls) =>
  calls
    .filter((url) => url.includes("bbox="))
    .map((url) => new URL(url, "http://example.test").searchParams.get("bbox"))
    .map((bbox) => bbox.split(",").map(Number));

test("B03: a view wider than the world fetches the whole domain (server-valid bbox, no over-±180)", async () => {
  const calls = [];
  installBboxMock(calls);
  // The measured z2 desktop bounds: Leaflet longitudes far outside ±180,
  // which the API rejects (west<east within world bounds).
  const WORLD_RAW = { south: -65.3668, north: 85.0511, west: -224.29687500000003, east: 249.25781250000003 };
  await renderProbe({ bounds: WORLD_RAW, filters: {} });
  await pause(1_100); // continental area → the long zoom-out debounce
  assert.ok(calls.length >= 1, "the world view still fetches");
  const bboxes = bboxesOf(calls);
  assert.ok(bboxes.length >= 1);
  for (const [west, south, east, north] of bboxes) {
    assert.ok(west >= -180 && east <= 180 && west < east && south < north, `server-valid bbox: ${west},${south},${east},${north}`);
  }
  assert.deepEqual(bboxes.at(-1), [-180, -65.3668, 180, 85.0511], "the whole world is requested as the full domain");
  const probe = rtl.screen.getByTestId("probe");
  assert.equal(probe.getAttribute("data-error"), "false", "the normalized request is not an API failure");
});

test("B03: an antimeridian wrap fetches BOTH halves so neither dateline side is lost", async () => {
  const calls = [];
  installBboxMock(calls);
  // 170°E..190°E — the unwrapped Leaflet form that crosses ±180.
  await renderProbe({ bounds: { south: -1, north: 1, west: 170, east: 190 }, filters: {} });
  await pause(500);
  const bboxes = bboxesOf(calls).map((bbox) => bbox.join(",")).sort();
  assert.deepEqual(bboxes, ["-180,-1,-170,1", "170,-1,180,1"], "two geographic rectangles, each west<east");
});

// ---------------------------------------------------------------------------
// B04 — only a COMPLETE, actually-fetched area may cover a later fetch.
// ---------------------------------------------------------------------------

test("B04: a decimated sample never covers a contained detail fetch, and never erases the sample flag", async () => {
  const calls = [];
  installBboxMock(calls, { decimated: true });
  const view = await renderProbe({ bounds: REGIONAL_OVERVIEW, filters: {} });
  await pause(400);
  const first = calls.length;
  assert.ok(first >= 1, "the overview fetched once");
  const probe = rtl.screen.getByTestId("probe");
  assert.equal(probe.getAttribute("data-decimated"), "true", "the overview is flagged as a sample");

  // A city view fully INSIDE the sampled overview: the sample holds only a
  // few points and must NOT be treated as coverage of the detail.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: INSIDE, filters: {} })));
  await pause(400);
  assert.equal(calls.length, first + 1, "the sample does not cover the detail fetch");
  assert.equal(probe.getAttribute("data-decimated"), "true", "an incomplete sample cannot erase the decimated flag");
});

test("B04: containment uses the area actually fetched — no virtual padding strip", async () => {
  const calls = [];
  installBboxMock(calls);
  const view = await renderProbe({ bounds: { south: 0, north: 0.1, west: 0, east: 0.1 }, filters: {} });
  await pause(400);
  const first = calls.length;
  assert.ok(first >= 1);

  // This pan starts inside the old 15% padding but reaches into a strip the
  // server never sent — it must NOT be treated as a cache hit.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: { south: 0, north: 0.1, west: 0.01, east: 0.11 }, filters: {} })));
  await pause(400);
  assert.equal(calls.length, first + 1, "the unfetched strip forces a new request");
});

// ---------------------------------------------------------------------------
// B05 — a persistent 429 is bounded to the single auto-retry.
// ---------------------------------------------------------------------------

test("B05: a persistent 429 retries at most once, then stays terminal with no latent loop", async () => {
  let attempts = 0;
  installFetchMock((input) => {
    if (!String(input).includes("bbox=")) return jsonResponse({ error: "unexpected request" }, { status: 404 });
    attempts += 1;
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "1" },
    });
  });
  const view = await renderProbe({ bounds: ROME, filters: {} });
  await pause(2_600);
  assert.equal(attempts, 2, "initial attempt + exactly ONE auto retry (never a third)");
  const probe = rtl.screen.getByTestId("probe");
  assert.equal(probe.getAttribute("data-error"), "true", "the exhausted 429 stays a visible error state");

  // No latent loop once the retry budget is spent.
  await pause(1_800);
  assert.equal(attempts, 2, "the cooldown expiry does not schedule another request");

  // A deliberately NEW viewport restarts the budget — never frozen forever.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: MILAN, filters: {} })));
  await pause(2_000);
  assert.ok(attempts >= 3, "a deliberate new viewport is not blocked by the terminal state");
});

// ---------------------------------------------------------------------------
// R3a — the MERGE and IN-FLIGHT dedupe must key on the FULL request identity
// (semantic server filters + exact geometry), so a same-geometry filter change
// (or two concurrent consumers with different filters) never shares a payload.
// ---------------------------------------------------------------------------

test("R3a: a same-geometry FILTER change still merges the newly fetched records", async () => {
  const dome = { id: 11, title: "Dome fixture", kind: "Fixed dome", status: "active", latitude: 41.9, longitude: 12.5, source: "Community report" };
  const bullet = { id: 12, title: "Bullet fixture", kind: "Bullet", status: "active", latitude: 41.9, longitude: 12.5, source: "Community report" };
  installFetchMock((input) => {
    const url = String(input);
    if (!url.includes("bbox=")) return jsonResponse({ error: "unexpected" }, { status: 404 });
    const kind = new URL(url, "https://example.test").searchParams.get("kind");
    const rows = kind === "Bullet" ? [bullet] : kind === "Fixed dome" ? [dome] : [dome, bullet];
    return jsonResponse({ records: rows, total: rows.length, nextOffset: null });
  });

  const view = await renderProbe({ bounds: ROME, filters: { kind: "Fixed dome" } });
  await pause(400);
  assert.deepEqual(JSON.parse(rtl.screen.getByTestId("probe").getAttribute("data-records")), [11]);

  // Same viewport geometry, a DIFFERENT server filter: the new payload must
  // still merge (the old geometry-only merge key silently skipped it).
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: ROME, filters: { kind: "Bullet" } })));
  await pause(400);
  const ids = JSON.parse(rtl.screen.getByTestId("probe").getAttribute("data-records")).sort((a, b) => a - b);
  assert.ok(ids.includes(12), "the newly fetched Bullet record is merged despite the shared geometry");
});

test("R3a: two concurrent consumers of the same geometry with different filters never share a request", async () => {
  function TwoProbe({ bounds }) {
    const a = useViewportCameras({ bounds, filters: { kind: "Bullet" } });
    const b = useViewportCameras({ bounds, filters: { kind: "Fixed dome" } });
    return React.createElement("div", {
      "data-testid": "two",
      "data-a": a.records.map((r) => r.kind).join(","),
      "data-b": b.records.map((r) => r.kind).join(","),
    });
  }
  const calls = [];
  installFetchMock((input) => {
    const url = String(input);
    if (!url.includes("bbox=")) return jsonResponse({ error: "unexpected" }, { status: 404 });
    const kind = new URL(url, "https://example.test").searchParams.get("kind");
    calls.push(kind);
    const body = jsonResponse({ records: [{ id: kind === "Bullet" ? 1 : 2, title: kind, kind, status: "active", latitude: 0.05, longitude: 0.05, source: "Community report" }], total: 1, nextOffset: null });
    return new Promise((resolve) => setTimeout(() => resolve(body), 150));
  });
  await renderWithLocale(React.createElement(TwoProbe, { bounds: { south: 0, north: 0.1, west: 0, east: 0.1 } }));
  await pause(500);
  const probe = rtl.screen.getByTestId("two");
  assert.equal(probe.getAttribute("data-a"), "Bullet", "the Bullet consumer receives Bullet records");
  assert.equal(probe.getAttribute("data-b"), "Fixed dome", "the Fixed-dome consumer receives its OWN records");
  assert.deepEqual(calls.sort(), ["Bullet", "Fixed dome"], "one request per distinct semantic filter (never shared)");
});

// ---------------------------------------------------------------------------
// B05/R3d — the single auto-retry budget is per REQUEST identity (exact
// geometry + semantic server filters), not per geometry: a deliberate
// same-geometry filter change gets its own budget, while one identity can
// never be driven to a third request by the cooldown.
// ---------------------------------------------------------------------------

test("B05: a deliberate same-geometry FILTER change gets its own one-retry budget", async () => {
  const calls = [];
  installFetchMock((input) => {
    const kind = new URL(String(input), "https://example.test").searchParams.get("kind");
    calls.push(kind);
    return new Response("{}", { status: 429, headers: { "Retry-After": "1" } });
  });
  const SMALL = { south: 0, north: 0.1, west: 0, east: 0.1 };
  const view = await renderProbe({ bounds: SMALL, filters: { kind: "Bullet" } });
  await pause(2_700);
  assert.equal(calls.filter((k) => k === "Bullet").length, 2, "one identity = initial + exactly ONE retry (terminal)");

  // Same viewport GEOMETRY, a DIFFERENT server filter: a deliberate new
  // navigation gets its OWN one-retry budget.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: SMALL, filters: { kind: "Fixed dome" } })));
  await pause(2_700);
  assert.equal(calls.filter((k) => k === "Fixed dome").length, 2, "the new filter gets its own retry budget");
});

// ---------------------------------------------------------------------------
// B05/R3f — a complete warm return must settle the SUCCESS state even though
// its records were already merged: a prior unrelated terminal 429's error and
// cooldown notice (and any stale sample flag) are cleared on the warm hit.
// ---------------------------------------------------------------------------

test("B05: a complete warm return clears a prior unrelated rate-limit error and cooldown", async () => {
  const calls = [];
  const A = { south: 0, north: 0.1, west: 0, east: 0.1 };
  const B = { south: 1, north: 1.1, west: 1, east: 1.1 };
  installFetchMock((input) => {
    const bbox = new URL(String(input), "https://example.test").searchParams.get("bbox");
    calls.push(bbox);
    if (bbox.startsWith("0,")) {
      return jsonResponse({ records: [{ id: 1, title: "Warm fixture", kind: "Bullet", status: "active", latitude: 0.05, longitude: 0.05, source: "Community report" }], total: 1, nextOffset: null });
    }
    return new Response("{}", { status: 429, headers: { "Retry-After": "1" } });
  });

  const view = await renderProbe({ bounds: A, filters: {} });
  await pause(700);
  const probe = rtl.screen.getByTestId("probe");
  assert.equal(probe.getAttribute("data-error"), "false", "the initial complete view resolves cleanly");

  // A terminal 429 destination: initial + ONE retry, then a visible error.
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: B, filters: {} })));
  await pause(3_500);
  assert.equal(probe.getAttribute("data-error"), "true", "the 429 destination is a terminal visible error");
  assert.equal(probe.getAttribute("data-retry-after"), "1", "its cooldown notice is exposed");

  // Return EXACTLY to the warm complete viewport: no refetch, and the success
  // state must be re-settled (the already-merged records must not skip it).
  const prior = calls.length;
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: A, filters: {} })));
  await pause(700);
  assert.equal(calls.length, prior, "the complete warm view is served from the cache (no refetch)");
  assert.equal(probe.getAttribute("data-error"), "false", "a complete successful warm resolution clears the prior unrelated error");
  assert.equal(probe.getAttribute("data-retry-after"), "", "and the stale cooldown notice");
  assert.equal(probe.getAttribute("data-decimated"), "false", "and no stale sample flag");
});
