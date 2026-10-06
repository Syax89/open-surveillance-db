/**
 * Shareable map view (?lat&lng&zoom) for /mappa — Batch B.
 *
 * Three contracts, one file (each jsdom render runs in its own node --test
 * process under `node --test tests/*.test.mjs`):
 *
 *   1. a ?lat&lng&zoom deep link is applied as the map's FIRST setView (no
 *      Rome/13 frame before it);
 *   2. onViewChange mirrors the map's centre + zoom into the URL on a
 *      debounced pan/zoom, via a PURE window.history.replaceState, and that
 *      write PRESERVES every other query param (q/type/freshness/sort/state/
 *      origin/focus/page) — the test name is deliberately explicit so a
 *      mutation that disables the onViewChange URL write fails HERE and not
 *      on a generic assertion;
 *   3. ?focus=ID still WINS over an initial ?lat&lng&zoom view.
 *
 * Plus the two Copy-link contracts (clipboard available → copies
 * window.location.href and confirms; clipboard absent → the button is hidden
 * entirely), mirroring RecoveryCodesDialog / ApiKeyRevealDialog.
 *
 * Fixtures are fictitious (example.test coordinates/titles) — no real data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, resetLeafletMarkers, leafletMaps, setUrlState, getNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let MappaTool;
let SurveillanceMap;
let __setBounds;
let __resetViewportCamerasCache;

before(async () => {
  rtl = await setupDom();
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  __setBounds = (await loadDomModule("node_modules/leaflet/index.mjs")).__setBounds;
  __resetViewportCamerasCache = (await loadDomModule("app/lib/use-viewport-cameras.mjs")).__resetViewportCamerasCache;
});

afterEach(async () => {
  rtl?.cleanup();
  __resetViewportCamerasCache?.();
  await resetLeafletMarkers();
});

// A deep link must be visible BOTH to useSearchParams (the next/navigation
// stub that MappaTool reads for initialView + filters) AND to
// window.location.search (what handleViewChange rewrites and preserves).
async function deepLink(url) {
  await setUrlState(url);
  rtl.window.history.replaceState({}, "", url);
}

const emptyApi = () => installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));

// ---------------------------------------------------------------------------
// 1. initial view
// ---------------------------------------------------------------------------

test("shareable view: the ?lat&lng&zoom deep link is applied as the map's FIRST setView (no Rome/13 flash first)", async () => {
  emptyApi();
  await deepLink("/mappa?lat=45.4&lng=12.3&zoom=14");
  await renderWithLocale(React.createElement(MappaTool));

  const maps = await leafletMaps();
  await rtl.waitFor(() => assert.ok(maps.length > 0), { timeout: 3000 });
  const map = maps.at(-1);
  assert.ok(map.views.length >= 1, "the map was created with an explicit view");
  assert.deepEqual(map.views[0].center, [45.4, 12.3], "the FIRST setView is the deep-linked centre — the Rome default is never painted first");
  assert.equal(map.views[0].zoom, 14, "the deep-linked zoom is applied");
});

test("shareable view: with no ?lat&lng&zoom the map keeps the Rome/13 fallback", async () => {
  emptyApi();
  await deepLink("/mappa");
  await renderWithLocale(React.createElement(MappaTool));

  const maps = await leafletMaps();
  await rtl.waitFor(() => assert.ok(maps.length > 0), { timeout: 3000 });
  const map = maps.at(-1);
  assert.deepEqual(map.views[0].center, [41.9028, 12.4964], "the Rome default centre");
  assert.equal(map.views[0].zoom, 13, "the default zoom");
});

// ---------------------------------------------------------------------------
// 2. URL write (mutation-sensitive — an explicit name)
// ---------------------------------------------------------------------------

test(
  "shareable view: a debounced pan/zoom writes lat/lng/zoom with window.history.replaceState (never router.replace) and preserves q/type/freshness/sort/state/origin/focus/page",
  async (t) => {
    emptyApi();
    const link = "/mappa?q=foo&type=dome&freshness=7d&sort=position&state=confirmed&origin=reports&focus=3&page=2&lat=45.4&lng=12.3&zoom=14";
    await deepLink(link);
    await renderWithLocale(React.createElement(MappaTool));

    const maps = await leafletMaps();
    await rtl.waitFor(() => assert.ok(maps.length > 0), { timeout: 3000 });
    const map = maps.at(-1);

    // Spy on the pure-history write (the initial createMap emission already
    // ran before this point — we assert only the pan-driven write here).
    const writes = [];
    const originalReplaceState = rtl.window.history.replaceState.bind(rtl.window.history);
    rtl.window.history.replaceState = (data, unused, url) => {
      writes.push(String(url));
      originalReplaceState(data, unused, url);
    };
    t.after(() => { rtl.window.history.replaceState = originalReplaceState; });

    // Simulate a pan + zoom: new viewport centre (44.5, 9) at zoom 11.
    __setBounds({ getSouth: () => 44, getNorth: () => 45, getWest: () => 8, getEast: () => 10, contains: () => true });
    map.zoom = 11;
    for (const handler of map.handlers["moveend zoomend"] ?? []) handler();

    await rtl.waitFor(
      () => assert.ok(writes.some((href) => href.includes("lat=44.500000")), "the debounced pan commits the new centre via window.history.replaceState"),
      { timeout: 3000 },
    );

    const committed = writes.at(-1);
    const params = new URLSearchParams(committed.split("?")[1] ?? "");
    assert.equal(params.get("lat"), "44.500000", "the map centre latitude is mirrored into the URL");
    assert.equal(params.get("lng"), "9.000000", "the map centre longitude is mirrored into the URL");
    assert.equal(params.get("zoom"), "11", "the map zoom (integer) is mirrored into the URL");

    // Every OTHER owned param survives the view write verbatim.
    assert.equal(params.get("q"), "foo");
    assert.equal(params.get("type"), "dome");
    assert.equal(params.get("freshness"), "7d");
    assert.equal(params.get("sort"), "position");
    assert.equal(params.get("state"), "confirmed");
    assert.equal(params.get("origin"), "reports");
    assert.equal(params.get("focus"), "3");
    assert.equal(params.get("page"), "2");

    // The write never touches the router (the vinext digest / remount trap).
    const nav = await getNavState();
    assert.equal(nav.replaced.length, 0, "the view write never calls router.replace");
    assert.equal(nav.pushed.length, 0, "the view write never pushes");
  },
);

// ---------------------------------------------------------------------------
// 3. focus wins
// ---------------------------------------------------------------------------

test("shareable view: ?focus=ID still pans to the record and OVERRIDES an initial ?lat&lng&zoom view", async () => {
  const record = { id: 7, title: "Focused record", kind: "Fixed dome", status: "active", latitude: 44.4949, longitude: 11.3426 };
  await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [record],
    selectedId: 7,
    onSelect: () => {},
    onPick: () => {},
    initialView: { lat: 0, lng: 0, zoom: 2 },
    focusLocation: { latitude: record.latitude, longitude: record.longitude },
    directoryHref: "#records",
    onBoundsChange: () => {},
  }));

  const maps = await leafletMaps();
  await rtl.waitFor(() => assert.ok(maps.length > 0), { timeout: 3000 });
  const map = maps.at(-1);

  await rtl.waitFor(
    () => assert.ok(map.views.some((view) => Array.isArray(view.center) && view.center[0] === record.latitude && view.center[1] === record.longitude), "the focus command pans to the record"),
    { timeout: 3000 },
  );
  assert.deepEqual(map.views[0].center, [0, 0], "the initial ?lat&lng view was applied first…");
  const focusView = map.views.find((view) => Array.isArray(view.center) && view.center[0] === record.latitude);
  assert.ok(focusView.zoom >= 15, "…then the focus overrode it (point + zoom fallback, zoom >= 15)");
});

// ---------------------------------------------------------------------------
// 4. Copy link
// ---------------------------------------------------------------------------

test("shareable view: the Copy link button copies window.location.href verbatim, confirms, then reverts after ~2s", async () => {
  emptyApi();
  await deepLink("/mappa?lat=45.4&lng=12.3&zoom=14");
  const copied = [];
  // user-event installs its OWN navigator.clipboard stub at setup() — do that
  // FIRST, then override it with the recording mock the component must call.
  const user = rtl.userEvent.setup();
  Object.defineProperty(rtl.window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => { copied.push(text); } },
  });
  try {
    const { screen } = rtl;
    await renderWithLocale(React.createElement(MappaTool));
    const button = await screen.findByRole("button", { name: "Copy link" });

    await user.click(button);
    await rtl.waitFor(() => assert.equal(copied.length, 1, "clipboard.writeText was called once"));
    assert.equal(copied[0], rtl.window.location.href, "the button copies the current URL verbatim");
    await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: "Copied!" }), "the label confirms the copy"), { timeout: 2000 });
    // The confirmation reverts (2s revert timer).
    await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: "Copy link" }), "the label reverts to Copy link"), { timeout: 4000 });
  } finally {
    Object.defineProperty(rtl.window.navigator, "clipboard", { configurable: true, value: undefined });
  }
});

test("shareable view: the Copy link button is hidden entirely when the Clipboard API is unavailable", async () => {
  emptyApi();
  await deepLink("/mappa?lat=45.4&lng=12.3&zoom=14");
  // jsdom ships no navigator.clipboard — the progressive-enhancement contract.
  // Clear it explicitly: a prior test's user-event setup() may have installed a
  // clipboard stub on the shared jsdom navigator.
  Object.defineProperty(rtl.window.navigator, "clipboard", { configurable: true, value: undefined });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));
  // Wait for the toolbar (the view switch is always present) before asserting.
  await screen.findByRole("link", { name: /Map/i });
  assert.equal(screen.queryByRole("button", { name: "Copy link" }), null, "no clipboard → the button is not rendered at all");
});
