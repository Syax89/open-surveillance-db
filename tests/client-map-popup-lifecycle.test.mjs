/**
 * Map popup-lifecycle E2E contract (kanban t_33b82720 — CEO: "popup camera
 * non appare subito, appare/scompare, dopo doppio click rimane; pan/zoom fa
 * apparire popup non richiesti").
 *
 * Marker population (clearLayers on viewport/cameras/grid
 * rebuilds) must never open or close popups the user did not ask for:
 *
 *   1. marker click opens the marker popup ONCE and keeps it open;
 *   2. a second click on the SAME marker keeps it open (no toggle-close);
 *      a click on a SECOND marker transfers the popup once;
 *   3. pan (moveend → marker rebuild) opens ZERO new popups and restores
 *      only the popup that was active before the rebuild, and only while
 *      that record is still visible;
 *   4. grid-badge click zooms in WITHOUT opening any popup;
 *   5. empty-map interaction opens a coordinate picker for reporting;
 *   6. mobile touch tap on a marker behaves like (1);
 *   7. ?focus deep link opens the selected popup ONCE — later pans never
 *      reopen it out of the blue.
 *
 * Fixtures are fictitious (illustrative coordinates in Rome, example.test).
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
let __resetPublicCamerasCache;

const CAMERAS = [
  { id: 1, title: "Via Roma corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" },
  { id: 2, title: "Piazza Venezia", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report" },
  { id: 3, title: "Via del Corso", kind: "bullet", status: "active", latitude: 41.9009, longitude: 12.4761, source: "Community report" },
];

// Whole-world viewport (the stub default — contains every fixture).
const wholeWorld = {
  getSouth: () => -90, getNorth: () => 90,
  getWest: () => -180, getEast: () => 180,
  contains: () => true,
};
// A narrow viewport around camera 2 only (Piazza Venezia).
const onlyCam2 = {
  getSouth: () => 41.895, getNorth: () => 41.8965,
  getWest: () => 12.4815, getEast: () => 12.4835,
  contains: () => true,
};

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  const gridMod = await loadDomModule("node_modules/leaflet/index.mjs");
  __setBounds = gridMod.__setBounds;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  resetLeafletMarkers();
});

async function renderMap(cameras, extraProps = {}) {
  const base = { cameras: [], selectedId: 1, onSelect: () => {}, onPick: () => {}, ...extraProps };
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

/** Simulate Leaflet opening a popup: fires the map popupopen handler with a real DOM node. */
function simulatePopupOpen(map, id) {
  const div = document.createElement("div");
  div.innerHTML = `<div class="osm-popup-community" data-record-id="${id}"></div>`;
  map.handlers.popupopen?.[0]?.({ popup: { getElement: () => div } });
}

/** Fire moveend and wait for the debounced bounds→rebuild round trip. */
async function panTo(bounds) {
  __setBounds(bounds);
  const map = (await maps())[0];
  map.handlers["moveend zoomend"]?.[0]?.();
  // BOUNDS_DEBOUNCE_MS is 500 (map-viewport.ts) — wait past it + margin,
  // otherwise the assertions race the debounced bounds→rebuild update.
  await new Promise((resolve) => setTimeout(resolve, 600));
}

// ---------------------------------------------------------------------------
// 1) marker click: opens ONCE, stays open, never replaced by the picker
// ---------------------------------------------------------------------------

test("marker click opens the marker popup once and stops propagation (no generic picker)", async () => {
  await renderMap(CAMERAS);
  const m1 = markerById(await markers(), 1);
  const evt = clickMarker(m1);

  assert.equal(m1.popupOpened, true, "the marker popup must open on click");
  assert.equal(evt.__stopped, true, "the marker click must stop propagation to the map");
  const map = (await maps())[0];
  assert.ok(!map.popupHtml, "the generic coordinate picker must NOT replace the marker popup");
});

test("a second click on the same marker keeps the popup open (no toggle-close)", async () => {
  await renderMap(CAMERAS);
  const m1 = markerById(await markers(), 1);
  clickMarker(m1);
  clickMarker(m1);
  assert.equal(m1.popupOpened, true, "the popup must stay open after a second click on the same marker");
  assert.ok(!(await maps())[0].popupHtml, "still no generic picker");
});

test("clicking a second marker transfers the popup once (still no picker)", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const list = await markers();
  const m1 = markerById(list, 1);
  const m2 = markerById(list, 2);
  clickMarker(m1);
  const opensAfterFirst = (map.events.popupopen ?? []).length;
  clickMarker(m2);
  assert.equal(m2.popupOpened, true, "the second marker popup must open");
  // P1 (review 2026-08-07): the transfer must be exactly ONE popupopen for
  // the second marker — the selection effect is idempotent
  // (isPopupOpen guard), so no double-open fires.
  assert.equal((map.events.popupopen ?? []).length, opensAfterFirst + 1, "the transfer opens exactly one popup");
  assert.ok(!map.popupHtml, "the transfer must not open the generic picker");
});

test("keyboard Enter on a focused marker opens its popup (no picker)", async () => {
  await renderMap(CAMERAS);
  const m1 = markerById(await markers(), 1);
  const evt = { originalEvent: { key: "Enter", preventDefault: () => {} } };
  m1.handlers.keydown?.[0]?.(evt);
  assert.equal(m1.popupOpened, true, "Enter on a focused marker must open its popup");
  assert.equal(evt.__stopped, true, "the keydown must stop propagation to the map");
  assert.ok(!(await maps())[0].popupHtml, "no generic picker from the keyboard");
});

// 2026-08-12 production bug ("ogni tanto il balloon si apre senza i tasti
// della community"): the popupopen handler returned early when the record
// was momentarily absent from camerasRef (rebuild/filter transition), so
// the balloon opened with an empty mount node and the widget never
// mounted — it only appeared after a close/reopen. The widget must mount
// whenever the popup has a community mount node, seeding zero counts when
// the payload does not have the record yet.
test("popup widget mounts even when the record is momentarily absent from cameras (no empty balloon)", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  const div = document.createElement("div");
  div.innerHTML = '<div class="osm-popup-community" data-record-id="999"></div>';
  map.handlers.popupopen?.[0]?.({ popup: { getElement: () => div } });
  // The widget render is deferred to a microtask (t_0b9f5a3c): wait for it.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const mountNode = div.querySelector(".osm-popup-community");
  assert.ok(mountNode, "the popup mount node exists");
  assert.ok(
    mountNode.querySelector("button"),
    "the community widget buttons are mounted even when the record is not in the payload (seed zero)",
  );
});

// P1 (review 2026-08-07): the user CLOSING a popup then panning must stay
// closed — the rebuild restore must not re-open what the user dismissed.
test("a popup closed by the USER stays closed after a pan (no ghost reopen)", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  clickMarker(markerById(await markers(), 1));
  const opensBeforeClose = (map.events.popupopen ?? []).length;
  // The user dismisses the popup: Leaflet fires popupclose OUTSIDE a
  // rebuild — the component must clear the active id. The stub does not
  // reset the marker's own flag on close (no closePopup on the stub), so
  // reset it by hand to mirror real Leaflet's popup teardown.
  map.handlers.popupclose?.[0]?.();
  const closedMarker = markerById(await markers(), 1);
  closedMarker.popupOpened = false;
  assert.equal(opensBeforeClose, 1, "sanity: the popup opened once before the user close");

  // Pan (rebuild) while camera 1 stays visible: nothing may reopen. The
  // bounds MUST differ from the stub default (whole world) or the
  // identity guard skips the rebuild entirely (no-op test).
  const cam1View = {
    getSouth: () => 41.89, getNorth: () => 41.91,
    getWest: () => 12.47, getEast: () => 12.50,
    contains: () => true,
  };
  await panTo(cam1View);
  const list = await markers();
  assert.equal(list.length, CAMERAS.length, "sanity: the rebuild ran (markers re-reconciled)");
  assert.equal(list.filter((m) => m.popupOpened).length, 0, "the user-closed popup must NOT be restored by a pan");
  assert.equal((map.events.popupopen ?? []).length, opensBeforeClose, "no extra popupopen after a user close + pan");
});

// ---------------------------------------------------------------------------
// 2) pan / rebuild: zero NEW popups; only the active one is restored
// ---------------------------------------------------------------------------

test("pan (rebuild) opens ZERO new popups and restores only the active one while visible", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  // User opens camera 1's popup; Leaflet fires popupopen with its node.
  clickMarker(markerById(await markers(), 1));
  simulatePopupOpen(map, 1);

  // Pan but keep camera 1 visible (whole world) → rebuild happens.
  await panTo(wholeWorld);

  const list = await markers();
  assert.equal(list.length, CAMERAS.length, "markers are rebuilt");
  assert.equal(markerById(list, 1).popupOpened, true, "the ACTIVE popup is restored after the rebuild");
  const opened = list.filter((m) => m.popupOpened);
  assert.equal(opened.length, 1, "exactly ONE popup open — zero NEW popups from the pan");
  assert.ok(!map.popupHtml, "the rebuild must never open the generic picker");
});

test("panning the active record out of view closes its popup and opens nothing else", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  clickMarker(markerById(await markers(), 1));
  simulatePopupOpen(map, 1);

  // Pan to a viewport that does NOT contain camera 1 (only camera 2).
  await panTo(onlyCam2);

  const list = await markers();
  assert.ok(markerById(list, 2), "camera 2 marker is rebuilt");
  const opened = list.filter((m) => m.popupOpened);
  assert.equal(opened.length, 0, "the popup closes when its record leaves the view — nothing new opens");
  assert.ok(!map.popupHtml, "still no generic picker");
});

// ---------------------------------------------------------------------------
// 3) grid badge: zooms in, zero popups
// ---------------------------------------------------------------------------

test("grid-badge click zooms in toward the cell with ZERO popups", async () => {
  const many = Array.from({ length: 260 }, (_, i) => ({
    id: i + 1, title: `Fixture camera ${i}`, kind: "bullet", status: "active",
    latitude: 30 + (i % 40), longitude: -10 + (i % 50), source: "Community report",
  }));
  await renderMap(many);
  const map = (await maps())[0];
  // GRID_MAX_ZOOM is 12: at the stub default z13 every marker is individual.
  // Zoom OUT to a grid zoom and let the debounced rebuild aggregate.
  map.zoom = 11;
  map.handlers["moveend zoomend"]?.[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 600)); // BOUNDS_DEBOUNCE_MS=500 + margin
  const list = await markers();
  const badges = list.filter((m) => m.opts?.icon?.html?.includes("osm-grid-badge"));
  assert.ok(badges.length > 0, "260 visible records at a grid zoom must aggregate into grid badges");
  const zoomBefore = map.zoom;
  // P0-1 (review 2026-08-07): the badge click must stop propagation like
  // the individual marker — otherwise the map click handler opens the
  // coordinate picker over the zoom animation.
  const evt = {};
  badges[0].handlers.click?.[0]?.(evt);
  assert.equal(evt.__stopped, true, "badge click must stop propagation to the map (no picker)");

  assert.ok(map.views.length > 0, "badge click must pan/zoom the map");
  assert.equal(map.views.at(-1).zoom, zoomBefore + 2, "badge click zooms in 2 levels");
  assert.ok(!map.popupHtml, "badge click must NOT open a popup");
  assert.equal(list.filter((m) => m.popupOpened).length, 0, "badge click must NOT open any marker popup");
});

// ---------------------------------------------------------------------------
// 4) empty map click: report shortcut
// ---------------------------------------------------------------------------

test("empty map click opens the report shortcut", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  map.handlers.click?.[0]?.({ latlng: { lat: 41.9, lng: 12.49 } });

  assert.match(map.popupHtml, /New report/, "an empty-map click opens the report shortcut");
  assert.match(map.popupHtml, /41\.90000, 12\.49000/, "the shortcut retains the clicked coordinates");
});

// ---------------------------------------------------------------------------
// 5) mobile touch tap
// ---------------------------------------------------------------------------

test("mobile touch tap on a marker opens once and never the picker", async () => {
  await renderMap(CAMERAS);
  const m1 = markerById(await markers(), 1);
  const evt = { latlng: { lat: m1.latlng[0], lng: m1.latlng[1] }, originalEvent: { pointerType: "touch" } };
  m1.handlers.click?.[0]?.(evt);
  assert.equal(m1.popupOpened, true, "a touch tap opens the marker popup");
  assert.equal(evt.__stopped, true, "the tap stops propagation");
  assert.ok(!(await maps())[0].popupHtml, "no generic picker on touch");
});

test("mobile touch tap on empty map opens the report shortcut", async () => {
  await renderMap(CAMERAS);
  const map = (await maps())[0];
  map.handlers.click?.[0]?.({ latlng: { lat: 41.9, lng: 12.49 }, originalEvent: { pointerType: "touch" } });
  assert.match(map.popupHtml, /New report/, "an empty-map touch tap opens the report shortcut");
});

// ---------------------------------------------------------------------------
// 6) ?focus deep link: opens once, never reopens out of the blue
// ---------------------------------------------------------------------------

test("?focus deep link opens the selected popup once; a pan does not reopen it", async () => {
  await renderMap(CAMERAS, {
    selectedId: 2,
    focusLocation: { latitude: 41.8958, longitude: 12.4823 },
  });
  const map = (await maps())[0];
  // The map pans to the focus (createMap setView) and the first rebuild
  // opens the popup once — simulate Leaflet's popupopen so the active id
  // is tracked.
  const list0 = await markers();
  assert.equal(markerById(list0, 2).popupOpened, true, "the deep-linked popup opens once on arrival");
  const opensOnArrival = (map.events.popupopen ?? []).length;
  simulatePopupOpen(map, 2);

  // DISCRIMINATING PHASE (P1, review 2026-08-07): a rebuild that KEEPS
  // camera 2 visible (different bounds, same viewport content) must NOT
  // re-fire the focus open. The pre-fix code opened the focus popup on
  // EVERY rebuild where the record was present — this phase catches it.
  const keepCam2 = {
    getSouth: () => 41.89, getNorth: () => 41.90,
    getWest: () => 12.47, getEast: () => 12.49,
    contains: () => true,
  };
  await panTo(keepCam2);
  const listKeep = await markers();
  assert.equal(markerById(listKeep, 2).popupOpened, true, "the kept popup stays open during the rebuild");
  assert.equal((map.events.popupopen ?? []).length, opensOnArrival, "a rebuild that keeps the record visible must NOT reopen the focus popup");

  // Pan AWAY from the focus (viewport excludes camera 2).
  const away = {
    getSouth: () => 41.9, getNorth: () => 41.91,
    getWest: () => 12.49, getEast: () => 12.50,
    contains: () => true,
  };
  await panTo(away);

  const list1 = await markers();
  assert.equal(list1.filter((m) => m.popupOpened).length, 0, "panning away must NOT reopen the focus popup");
  assert.ok(!map.popupHtml, "and must not open the picker either");

  // Pan back so the focus IS visible again — the popup that was open is
  // restored (keeps only the selected one), nothing else opens.
  await panTo(wholeWorld);
  const list2 = await markers();
  const opened = list2.filter((m) => m.popupOpened);
  assert.equal(opened.length, 1, "only the previously-open popup is restored");
  assert.equal(markerById(list2, 2).popupOpened, true, "the deep-linked popup is restored while visible");
});

// P1-5 (review 2026-08-07): a filter that removes the open record must
// DROP the popup-restore intent — resetting the filter must not re-open
// the popup out of the blue (data-driven removal ≠ pan).
test("filter that removes the open record: popup closes and NEVER auto-reopens on reset", async () => {
  const view = await renderMap(CAMERAS);
  const map = (await maps())[0];
  clickMarker(markerById(await markers(), 1));
  simulatePopupOpen(map, 1);
  const opensBefore = (map.events.popupopen ?? []).length;

  // Filter removes camera 1 (rerender with a cameras list without it).
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras: CAMERAS.slice(1), selectedId: 1, onSelect: () => {}, onPick: () => {},
  })));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await markers()).filter((m) => m.popupOpened).length, 0, "the popup closes when its record is filtered out");

  // Reset the filter: camera 1 is back — but NO popup may auto-open.
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras: CAMERAS, selectedId: 1, onSelect: () => {}, onPick: () => {},
  })));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await markers()).filter((m) => m.popupOpened).length, 0, "the filtered-out popup must NOT auto-reopen on filter reset");
  assert.equal((map.events.popupopen ?? []).length, opensBefore, "no extra popupopen across the filter round trip");
});
