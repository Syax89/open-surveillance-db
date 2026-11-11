/**
 * Grid-snapped viewport requests (perf: edge + client cache reuse).
 *
 * useViewportCameras used to request the EXACT map.getBounds() floats, so
 * every user's bbox was unique (the public edge cache keyed on the URL never
 * hit) and the fetched box was the viewport itself (any small difference in
 * the final drag position was a client-cache miss). The hook now grows the
 * requested box outward to a zoom-dependent grid (snapViewportRectangles).
 * This suite locks:
 *
 *   (a) two slightly different viewports at the same zoom → the SAME URL;
 *   (b) a small pan inside the snapped box → no new request;
 *   (c) the snapped box contains the viewport and respects world bounds
 *       (and never changes the server's response class);
 *   (d) a zoom change picks a different grid;
 *   (e) the visible count/list still reflects the VIEWPORT, not the box.
 *
 * Fixtures are fictitious (illustrative coordinates, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let mod;
let MappaTool;

before(async () => {
  rtl = await setupDom();
  mod = await loadDomModule("app/lib/use-viewport-cameras.mjs");
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
});

afterEach(async () => {
  rtl?.cleanup();
  mod.__resetViewportCamerasCache();
  await resetLeafletMarkers();
  installFetchMock(() => jsonResponse({ error: "no stub" }, { status: 404 }));
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function HookProbe({ bounds }) {
  const state = mod.useViewportCameras({ bounds, filters: {} });
  return React.createElement("div", {
    "data-testid": "probe",
    "data-records": JSON.stringify(state.records.map((record) => record.id)),
    "data-loading": String(state.loading),
  });
}

function installRecorder(calls, records = []) {
  installFetchMock((input) => {
    const url = String(input);
    calls.push(url);
    const bbox = new URL(url, "https://example.test").searchParams.get("bbox");
    if (!bbox) return jsonResponse({ records: [], total: 0, nextOffset: null });
    const [w, s, e, n] = bbox.split(",").map(Number);
    const rows = records.filter((r) => r.longitude >= w && r.longitude <= e && r.latitude >= s && r.latitude <= n);
    return jsonResponse({ records: rows, total: rows.length, nextOffset: null });
  });
}

const contains = (outer, inner) =>
  inner.south >= outer.south && inner.north <= outer.north && inner.west >= outer.west && inner.east <= outer.east;
const area = (b) => (b.north - b.south) * (b.east - b.west);

// City-zoom viewports (~0.4° × 0.2°) that differ by a few hundred metres —
// what two users (or two drag releases) framing the same district produce.
const VIEW_A = { south: 41.8012, north: 42.0007, west: 12.3031, east: 12.7044 };
const VIEW_B = { south: 41.8104, north: 42.0099, west: 12.3149, east: 12.7162 };

test("(a) two slightly different viewports at the same zoom request the SAME URL", async () => {
  const urlsFor = async (bounds) => {
    mod.__resetViewportCamerasCache();
    const calls = [];
    installRecorder(calls);
    const view = await renderWithLocale(React.createElement(HookProbe, { bounds }));
    await pause(300);
    view.unmount();
    return calls;
  };
  const first = await urlsFor(VIEW_A);
  const second = await urlsFor(VIEW_B);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0], second[0], "nearby viewports share one (edge-cacheable) URL");
  const bbox = new URL(first[0], "https://example.test").searchParams.get("bbox");
  assert.equal(bbox, "12.25,41.75,12.75,42.0625", "the request is the grid-snapped box");
});

test("(b) a small pan inside the snapped box performs no new request", async () => {
  const calls = [];
  installRecorder(calls);
  const view = await renderWithLocale(React.createElement(HookProbe, { bounds: VIEW_A }));
  await pause(300);
  assert.equal(calls.length, 1);
  // Six slightly different drag releases, looped — all inside 12.25..12.75 × 41.75..42.0625.
  const pans = [VIEW_B,
    { south: 41.79, north: 41.99, west: 12.29, east: 12.69 },
    { south: 41.77, north: 41.97, west: 12.27, east: 12.67 },
    { south: 41.82, north: 42.02, west: 12.32, east: 12.72 },
    { south: 41.84, north: 42.04, west: 12.33, east: 12.73 },
    VIEW_A];
  for (let loop = 0; loop < 3; loop += 1) {
    for (const bounds of pans) {
      await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds })));
      await pause(180);
    }
  }
  assert.equal(calls.length, 1, "18 pans inside the fetched box reuse the cached response");
  assert.equal(rtl.screen.getByTestId("probe").getAttribute("data-loading"), "false");

  // Leaving the box still fetches (coverage is real, not virtual padding).
  await view.rerender(await wrapWithLocale(React.createElement(HookProbe, { bounds: { south: 41.9, north: 42.1, west: 12.6, east: 13.0 } })));
  await pause(300);
  assert.equal(calls.length, 2, "a pan out of the snapped box fetches once");
});

test("(c) the snapped box contains the viewport, respects world bounds and the server response class", () => {
  const { snapViewportRectangles, VIEWPORT_OVERVIEW_AREA_SQ_DEG, VIEWPORT_MAX_AREA_SQ_DEG } = mod;
  const cls = (a) => (a <= VIEWPORT_OVERVIEW_AREA_SQ_DEG ? 0 : a <= VIEWPORT_MAX_AREA_SQ_DEG ? 1 : 2);
  const cases = [
    VIEW_A,
    { south: 45.4641, north: 45.4699, west: 9.1852, east: 9.1961 }, // street zoom
    { south: 39, north: 42, west: 10, east: 14 }, // regional overview
    { south: 36.1, north: 47.3, west: 5.9, east: 18.7 }, // national, > 50 sq deg
    { south: -89.7, north: 89.9, west: -179.95, east: 179.9 }, // near the poles / world edges
    { south: -65.3668, north: 85.0511, west: -224.296875, east: 249.2578125 }, // raw unwrapped world
    { south: -1, north: 1, west: 170, east: 190 }, // antimeridian wrap
    { south: 41.4, north: 42.3, west: 12.0, east: 13.1 }, // ~0.99 sq deg: just under the count=false cap
  ];
  for (const bounds of cases) {
    const snapped = snapViewportRectangles(bounds);
    assert.ok(snapped.length >= 1);
    for (const box of snapped) {
      assert.ok(box.south >= -90 && box.north <= 90 && box.west >= -180 && box.east <= 180, `world bounds: ${JSON.stringify(box)}`);
      assert.ok(box.west < box.east && box.south < box.north, `server-valid: ${JSON.stringify(box)}`);
    }
  }
  // Containment + class preservation, per normalized viewport rectangle.
  for (const bounds of cases) {
    const snapped = snapViewportRectangles(bounds);
    const rects = snapped.length === 2
      ? [{ ...bounds, east: 180 }, { ...bounds, west: -180, east: bounds.east - 360 }]
      : null;
    snapped.forEach((box, i) => {
      const rect = rects ? rects[i] : {
        south: bounds.south, north: bounds.north,
        west: Math.max(-180, bounds.west), east: Math.min(180, bounds.east),
      };
      assert.ok(contains(box, rect), `snapped ${JSON.stringify(box)} contains ${JSON.stringify(rect)}`);
      assert.equal(cls(area(box)), cls(area(rect)), `same server response class for ${JSON.stringify(rect)}`);
    });
  }
  // The antimeridian split is kept: two halves meeting at ±180.
  const wrap = snapViewportRectangles({ south: -1, north: 1, west: 170, east: 190 });
  assert.equal(wrap.length, 2);
  assert.equal(wrap[0].east, 180);
  assert.equal(wrap[1].west, -180);
  // A detail view is fetched larger than itself (cache hits on small pans).
  const [cityBox] = snapViewportRectangles(VIEW_A);
  const ratio = area(cityBox) / area(VIEW_A);
  assert.ok(ratio >= 1.2 && ratio <= 4, `the city box is meaningfully larger than the viewport (×${ratio.toFixed(2)})`);
});

test("(d) a zoom change picks a different grid", () => {
  const { snapViewportRectangles } = mod;
  const centre = { lat: 41.9, lng: 12.5 };
  const viewAt = (zoom) => {
    // Leaflet-like spans for an 800×600 surface at `zoom`.
    const lngSpan = (800 * 360) / (256 * 2 ** zoom);
    const latSpan = lngSpan * 0.75 * Math.cos((centre.lat * Math.PI) / 180);
    return { south: centre.lat - latSpan / 2, north: centre.lat + latSpan / 2, west: centre.lng - lngSpan / 2, east: centre.lng + lngSpan / 2 };
  };
  const width = (b) => b.east - b.west;
  const z12 = snapViewportRectangles(viewAt(12))[0];
  const z13 = snapViewportRectangles(viewAt(13))[0];
  const z14 = snapViewportRectangles(viewAt(14))[0];
  assert.notDeepEqual(z12, z13);
  assert.notDeepEqual(z13, z14);
  assert.ok(width(z12) > width(z13) && width(z13) > width(z14), "each zoom-in snaps to a finer grid");
});

test("(e) the visible count and list reflect the VIEWPORT, not the larger snapped box", async () => {
  // Default stub viewport: Rome 12.3..12.7 × 41.8..42.0 → snapped box
  // 12.25..12.75 × 41.75..42. Record 9 lies in the box but OUTSIDE the view.
  const records = [
    { id: 1, title: "Inside one", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" },
    { id: 2, title: "Inside two", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report" },
    { id: 9, title: "Snapped margin only", kind: "dome", status: "active", latitude: 41.77, longitude: 12.27, source: "Community report" },
  ];
  const calls = [];
  installRecorder(calls, records);
  await renderWithLocale(React.createElement(MappaTool));
  await rtl.waitFor(() => assert.ok(calls.some((url) => url.includes("bbox=12.25%2C41.75%2C12.75%2C42"))), { timeout: 3000 });
  const count = await rtl.waitFor(() => {
    const element = document.getElementById("record-search-count");
    assert.ok(element && /^2 /.test(element.textContent ?? ""), `count text: ${element?.textContent}`);
    return element;
  }, { timeout: 3000 });
  assert.match(count.textContent, /^2 /, "the count is the records inside the viewport");
  assert.equal(rtl.screen.queryByText("Snapped margin only"), null, "a record only inside the snapped margin is not listed");
});
