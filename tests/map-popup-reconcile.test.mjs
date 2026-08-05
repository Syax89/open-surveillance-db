/**
 * STRICT popup-lifecycle instrumentation (kanban t_bb310428 — P0 map UX
 * regression: popup flicker, delayed Useful/Confirm, late markers).
 *
 * The CEO-reported flicker was MEASURED on the deployed /mappa: a marker
 * click opened the popup (popupopen), then the marker-population rebuild
 * (clearLayers on viewport/bounds change) DESTROYED the popup DOM
 * (popupclose) and the restore logic re-opened it (popupopen) — two
 * popup lifecycles ~288ms/518ms after the click, with the community
 * widget's buttons resetting (a second delayed root). This suite
 * instruments the Leaflet event stream (map.events records every
 * popupopen/popupclose — see dom-harness fire()) and the popup DOM, and
 * locks the FIXED contract:
 *
 *   1. clicking an individual marker produces EXACTLY ONE popupopen and
 *      ZERO popupclose — no premature close, no re-open, no flicker;
 *   2. the community actions (Useful/Confirm…) are present at the FIRST
 *      stable popup paint — mounted synchronously by the popupopen
 *      handler, never a second delayed root;
 *   3. a rebuild that KEEPS the marker (pan/zoom within the visible set)
 *      emits ZERO popupopen/popupclose — the reconcile diffs instead of
 *      clearLayers, so the open popup's DOM survives untouched;
 *   4. pan/zoom with NO popup open opens ZERO popups;
 *   5. a marker that genuinely leaves the viewport closes its popup
 *      exactly ONCE (the rebuild path), and returning to it restores the
 *      SAME popup without a new user click (documented restore — not a
 *      flicker: the user had it open, it comes back once);
 *   6. a second click on the same marker emits no second popupopen
 *      (idempotent open — the measured double-open after a click).
 *
 * Fixtures are fictitious (illustrative coordinates, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, leafletMaps,
  leafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let __setBounds;

const CAMERAS = [
  { id: 1, title: "Via Roma corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report", usefulCount: 3, confirmCount: 1 },
  { id: 2, title: "Piazza Venezia", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report", usefulCount: 5 },
  { id: 3, title: "Via del Corso", kind: "bullet", status: "active", latitude: 41.9009, longitude: 12.4761, source: "Community report" },
];

// Whole-world viewport (the stub default — contains every fixture).
const wholeWorld = {
  getSouth: () => -90, getNorth: () => 90,
  getWest: () => -180, getEast: () => 180,
  contains: () => true,
};
/** Narrow viewport containing ONLY camera 1 (LatLngBounds accessor shape). */
function onlyCam1Bounds() {
  return {
    getSouth: () => 41.902, getNorth: () => 41.904,
    getWest: () => 12.495, getEast: () => 12.498,
    contains: (latlng) => latlng[0] >= 41.902 && latlng[0] <= 41.904 && latlng[1] >= 12.495 && latlng[1] <= 12.498,
  };
}
/** Narrow viewport containing ONLY camera 2 (LatLngBounds accessor shape). */
function onlyCam2Bounds() {
  return {
    getSouth: () => 41.895, getNorth: () => 41.897,
    getWest: () => 12.481, getEast: () => 12.484,
    contains: (latlng) => latlng[0] >= 41.895 && latlng[0] <= 41.897 && latlng[1] >= 12.481 && latlng[1] <= 12.484,
  };
}

/**
 * Popup HTML with the community mount node — the SAME contract as
 * app/lib/map-popup.ts (popupHtmlFor): the mount node's data-record-id is
 * the only contract; the counts travel via the cameras payload.
 */
function popupHtmlFor(camera) {
  return `<div class="osm-popup"><h3>${camera.title}</h3><div class="osm-popup-community" data-record-id="${camera.id}"></div></div>`;
}

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  const gridMod = await loadDomModule("node_modules/leaflet/index.mjs");
  __setBounds = gridMod.__setBounds;
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(() => {
  rtl?.cleanup();
  resetLeafletMarkers();
});

async function renderMap(cameras, extraProps = {}) {
  const base = { cameras: [], selectedId: 1, onSelect: () => {}, onPick: () => {}, popupHtmlFor, ...extraProps };
  const view = await renderWithLocale(React.createElement(SurveillanceMap, base));
  await new Promise((resolve) => setTimeout(resolve, 30));
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, { ...base, cameras })));
  await new Promise((resolve) => setTimeout(resolve, 10));
  return view;
}

async function maps() { return leafletMaps(); }
async function markers() { return leafletMarkers(); }

function markerById(list, id) {
  const found = list.find((m) => m.latlng && Math.abs(m.latlng[0] - CAMERAS[id - 1].latitude) < 1e-9);
  assert.ok(found, `marker for camera ${id} must exist`);
  return found;
}

/** Click a marker exactly like Leaflet does on tap/click (target handler). */
function clickMarker(marker) {
  const evt = { latlng: { lat: marker.latlng[0], lng: marker.latlng[1] }, originalEvent: {} };
  marker.handlers.click?.[0]?.(evt);
  return evt;
}

/** Capture the popup DOM node Leaflet hands to the popupopen handlers. */
function capturePopupNode(map) {
  let node = null;
  map.on("popupopen", (event) => { node = event.popup.getElement(); });
  return { read: () => node };
}

/** Event counters from the instrumented stub (dom-harness map.events). */
function eventCounts(map) {
  return {
    popupopen: map.events.popupopen?.length ?? 0,
    popupclose: map.events.popupclose?.length ?? 0,
  };
}

/** The community widget mount inside a popup node (or null). */
function communityNode(popupNode) {
  return popupNode?.querySelector(".osm-popup-community") ?? null;
}

/** Fire moveend and wait for the debounced bounds→rebuild round trip. */
async function panTo(bounds) {
  __setBounds(bounds);
  const map = (await maps())[0];
  map.handlers["moveend zoomend"]?.[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 260)); // BOUNDS_DEBOUNCE_MS=200 + margin
}

// ---------------------------------------------------------------------------
// 1) marker click: EXACTLY one popupopen, zero close/reopen, widget at once
// ---------------------------------------------------------------------------

test("clicking an individual marker: exactly ONE popupopen, zero popupclose, community actions at first paint", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const captured = capturePopupNode(map);
  const m1 = markerById(await markers(), 1);

  // The click (inside act: the popupopen handler mounts the widget
  // synchronously — exactly like the first stable paint in the browser).
  await rtl.act(async () => { clickMarker(m1); });

  const counts = eventCounts(map);
  assert.equal(counts.popupopen, 1, "a marker click must produce exactly ONE popupopen");
  assert.equal(counts.popupclose, 0, "a marker click must produce ZERO popupclose (no premature close/flicker)");
  assert.equal(m1.popupOpened, true, "the marker popup must be open");

  // Community actions present at the FIRST paint: the same synchronous
  // popupopen mounted the widget — no second delayed root, no empty paint.
  const node = captured.read();
  assert.ok(node, "Leaflet must hand a popup DOM node to popupopen");
  const widget = communityNode(node);
  assert.ok(widget, "the popup carries the community mount node");
  assert.ok(widget.querySelector("button"), "the community actions (Useful/Confirm…) are rendered at first paint");
  assert.ok(widget.textContent.includes("3") || widget.textContent.includes("Useful"), "the seeded counts render with the actions");
});

test("a SECOND click on the same marker produces no second popupopen (idempotent open)", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const m1 = markerById(await markers(), 1);

  await rtl.act(async () => { clickMarker(m1); });
  await rtl.act(async () => { clickMarker(m1); });

  const counts = eventCounts(map);
  assert.equal(counts.popupopen, 1, "the second click must NOT re-open (the measured double popupopen after a click)");
  assert.equal(counts.popupclose, 0, "and it must not close either");
  assert.equal(m1.popupOpened, true, "the popup stays open");
});

// ---------------------------------------------------------------------------
// 2) rebuild that KEEPS the marker: zero close/reopen — the popup DOM lives
// ---------------------------------------------------------------------------

test("a pan/zoom rebuild that keeps the marker emits ZERO popupopen/popupclose (no clearLayers of the open popup)", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const captured = capturePopupNode(map);
  const m1 = markerById(await markers(), 1);

  await rtl.act(async () => { clickMarker(m1); });
  assert.equal(eventCounts(map).popupopen, 1, "sanity: the click opened once");

  const widgetBefore = communityNode(captured.read());
  const widgetHtmlBefore = widgetBefore?.innerHTML ?? "";
  assert.ok(widgetHtmlBefore.length > 0, "the widget is painted before the pan");

  // Pan to a viewport that still contains camera 1 (but not 2/3): the
  // rebuild runs, marker 1 is KEPT — the old clearLayers would have
  // destroyed its popup DOM here (measured flicker).
  await panTo(onlyCam1Bounds());

  const counts = eventCounts(map);
  assert.equal(counts.popupopen, 1, "a rebuild that keeps the marker must NOT re-open the popup");
  assert.equal(counts.popupclose, 0, "a rebuild that keeps the marker must NOT close the popup (zero premature close/reopen)");
  assert.equal(m1.popupOpened, true, "the popup is still open");

  const widgetAfter = communityNode(captured.read());
  assert.equal(widgetAfter, widgetBefore, "the popup DOM node survives the rebuild untouched (reconcile, not clearLayers)");
  assert.equal(widgetAfter?.innerHTML, widgetHtmlBefore, "the widget DOM is byte-identical — no button reset, no flicker");
});

test("pan/zoom with NO popup open opens ZERO popups (navigation stays silent)", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const list = await markers();
  assert.equal(list.filter((m) => m.popupOpened).length, 0, "sanity: nothing open at mount");

  // Two rebuilds (zoom in to onlyCam1, then back to the whole world) with
  // zero user clicks: the map must stay completely silent.
  await panTo(onlyCam1Bounds());
  await panTo(wholeWorld);

  const counts = eventCounts(map);
  assert.equal(counts.popupopen, 0, "pan/zoom must never open a popup");
  assert.equal(counts.popupclose, 0, "pan/zoom must never close a popup either");
  assert.equal((await markers()).filter((m) => m.popupOpened).length, 0, "no marker reports an open popup");
});

// ---------------------------------------------------------------------------
// 3) marker leaving/returning: exactly one close (rebuild path), one restore
// ---------------------------------------------------------------------------

test("a marker that leaves the viewport closes its popup exactly ONCE; returning restores it without a new click", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const m1 = markerById(await markers(), 1);

  await rtl.act(async () => { clickMarker(m1); });
  assert.equal(eventCounts(map).popupopen, 1);

  // Pan to onlyCam2: marker 1 leaves the desired set → removed → its
  // popup closes (the ONE legitimate close, on the rebuild path).
  await panTo(onlyCam2Bounds());
  let counts = eventCounts(map);
  assert.equal(counts.popupopen, 1, "leaving the view opens nothing");
  assert.equal(counts.popupclose, 1, "the removal closes the open popup exactly once");
  assert.equal(m1.popupOpened, false, "the removed marker is gone");

  // Pan back to the whole world: marker 1 is recreated and the ACTIVE
  // popup is restored (the user had it open; it comes back once — the
  // documented restore, never a flicker loop).
  await panTo(wholeWorld);
  counts = eventCounts(map);
  assert.equal(counts.popupopen, 2, "returning to the record restores its popup exactly once");
  assert.equal(counts.popupclose, 1, "no extra close");
  const m1Again = markerById(await markers(), 1);
  assert.equal(m1Again.popupOpened, true, "the restored marker popup is open again");
});

// ---------------------------------------------------------------------------
// 4) generic map clicks never open a popup (add mode is the only exception)
// ---------------------------------------------------------------------------

test("a generic empty-map click emits ZERO popup events (navigation-silent by construction)", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const list = await markers();

  // A plain click on empty map space (exploration): the handler must not
  // even be registered outside the explicit "Add here" mode — zero popups,
  // zero picker content.
  map.handlers.click?.[0]?.({ latlng: { lat: 41.9, lng: 12.49 } });

  const counts = eventCounts(map);
  assert.equal(counts.popupopen, 0, "an exploration click must not open any popup");
  assert.equal(counts.popupclose, 0);
  assert.ok(!map.popupHtml, "the coordinate picker must not open outside add mode");
  assert.equal(list.filter((m) => m.popupOpened).length, 0, "no marker popup opens from a map click");
});
