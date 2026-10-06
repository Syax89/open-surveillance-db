/**
 * B06 / B07 — aggregated grid records.
 *
 * B06: selecting a record that is aggregated into a grid badge (only
 * `selectedId` changes) must materialise that record's INDIVIDUAL marker and
 * then pan/highlight/open the popup — without clearing the whole layer (badge
 * identity must be retained). All other props are kept IDENTITY-STABLE across
 * the re-render so `selectedId` is the ONLY changed dependency.
 *
 * B07: a focusable grid badge must run the SAME zoom action on Enter/Space as
 * on click, stop propagation/default, and never open the empty-map report
 * shortcut from event bubbling.
 *
 * Fixtures are fictitious (a dense cluster near Rome).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, leafletMaps, leafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let __setBounds;

// 152 records in a ~0.05° box → at zoom 8 they land in ONE multi-record cell,
// so the whole view is a single grid badge (no individual markers).
const DENSE = Array.from({ length: 152 }, (_, i) => ({
  id: 1000 + i,
  title: `Dense ${i}`,
  kind: "bullet",
  status: "active",
  latitude: 41.9 + (i % 12) * 0.004,
  longitude: 12.5 + Math.floor(i / 12) * 0.004,
}));

const VIEW = { getSouth: () => 41.8, getNorth: () => 42.0, getWest: () => 12.4, getEast: () => 12.6, contains: () => false };
// Identity-stable callbacks: the re-render must change ONLY selectedId.
const noop = () => {};

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  __setBounds = (await loadDomModule("node_modules/leaflet/index.mjs")).__setBounds;
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(async () => {
  rtl?.cleanup();
  await resetLeafletMarkers();
});

const element = (selectedId) => React.createElement(SurveillanceMap, {
  // SAME array + SAME callbacks every time (stable identities).
  cameras: DENSE, selectedId, onSelect: noop, onPick: noop, directoryHref: "#records", onBoundsChange: noop, popupHtmlFor: undefined,
});

const badgesOf = (list) => list.filter((m) => m.opts?.icon?.className === "osm-grid-badge-wrap");

/** Render a dense aggregated view (zoom 8) and wait for the grid badges. */
async function denseView() {
  await resetLeafletMarkers();
  __setBounds(VIEW);
  const view = await renderWithLocale(element(null));
  await new Promise((r) => setTimeout(r, 120));
  const map = (await leafletMaps())[0];
  map.zoom = 8; // below GRID_MAX_ZOOM (12)
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  await new Promise((r) => setTimeout(r, 150));
  return { view, map };
}

test("B06: selecting an aggregated row materialises its marker, pans and opens the popup (no clearLayers)", async () => {
  const { view, map } = await denseView();
  const beforeMarkers = await leafletMarkers();
  const badgesBefore = badgesOf(beforeMarkers);
  assert.equal(badgesBefore.length, 1, "the dense view is one grid badge");
  assert.equal(beforeMarkers.length, 1, "no individual markers before the selection");
  const badgeRef = badgesBefore[0];

  // Select record 1000 (aggregated in the badge). ONLY `selectedId` changes.
  await view.rerender(await wrapWithLocale(element(1000)));
  await new Promise((r) => setTimeout(r, 120));

  const after = await leafletMarkers();
  const selectedMarker = after.find((m) => m.opts?.title === "Dense 0");
  assert.ok(selectedMarker, "the selected aggregated record gets an individual marker");
  assert.equal(selectedMarker.popupOpened, true, "its popup opens");
  assert.match(selectedMarker.opts.icon.html, /selected/, "the marker carries the selected class");
  assert.ok(map.panCalls.length >= 1, "the map pans to the materialised marker");
  // Identity retained: the badge was NOT rebuilt/removed (no whole-layer rebuild).
  assert.ok(after.includes(badgeRef), "the existing badge object is retained (reconcile, not clearLayers)");
});

test("B06: a selection outside the filtered set stays quiet (no marker, no crash)", async () => {
  const { view } = await denseView();
  await view.rerender(await wrapWithLocale(element(999999)));
  await new Promise((r) => setTimeout(r, 120));
  const markers = await leafletMarkers();
  assert.ok(!markers.some((m) => m.opts?.title === "Dense 0" && m.popupOpened), "no popup for a selection outside the set");
});

test("B07: badge Enter/Space run the click zoom action with stopPropagation and no report popup", async () => {
  const { map } = await denseView();
  const badge = badgesOf(await leafletMarkers())[0];
  assert.ok(badge, "a focusable badge exists");
  assert.ok(typeof badge.handlers.keydown?.[0] === "function", "the badge has a keydown handler");

  const zoomBefore = map.views.length;
  // Click still works and stops propagation.
  const clickEvt = { __stopped: false };
  badge.handlers.click[0](clickEvt);
  assert.equal(clickEvt.__stopped, true, "click stops propagation");
  assert.equal(map.views.length, zoomBefore + 1, "click zooms +2 toward the badge");

  // Enter and Space behave like the click.
  for (const key of ["Enter", " "]) {
    let prevented = false;
    const evt = { originalEvent: { key, preventDefault: () => { prevented = true; } } };
    const before = map.views.length;
    badge.handlers.keydown[0](evt);
    assert.equal(map.views.length, before + 1, `${key} zooms like the click`);
    assert.equal(map.views[map.views.length - 1].zoom, map.getZoom() + 2, `${key} uses the click's +2 zoom`);
    assert.equal(evt.__stopped, true, `${key} stops propagation`);
    assert.equal(prevented, true, `${key} prevents the default (no scroll)`);
  }

  // A non-activation key does nothing.
  const other = { originalEvent: { key: "a", preventDefault: () => {} } };
  const quiet = map.views.length;
  badge.handlers.keydown[0](other);
  assert.equal(map.views.length, quiet, "other keys are ignored");
  // The badge never opened the empty-map report shortcut.
  assert.equal(map.popupHtml ?? null, null, "no report popup opened from the badge event");
});
