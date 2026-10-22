/**
 * M01 (design review 2026-10-22, P1) — the map popup must fit the MAP
 * SURFACE, not the viewport.
 *
 * Evidence from the review: at a 320x568 viewport the map is 286px wide, but
 * the balloon opened at ~291px outer width with the close button outside the
 * viewport, and it was gone again ~1200ms later (the oversized autopan target
 * pushed the selected marker out of the desired viewport). Root cause: the
 * popup width came from `window.innerWidth` (260px on phones) and the autopan
 * padding was a fixed `[60, 48]` — 286 - 2*60 = 166px is less than the
 * balloon, so Leaflet could never satisfy it.
 *
 * Contract asserted here:
 *   1. `popupGeometryFor()` (app/lib/map-popup.ts) derives width, minWidth,
 *      autopan padding and the vertical height budget from the real map box,
 *      accounting for Leaflet's own popup chrome (content margins + wrapper
 *      padding + tip);
 *   2. marker popups AND the coordinate-picker popup share the same helper —
 *      no second sizing path;
 *   3. a map that resizes with a popup open re-fits the KEPT markers (fresh
 *      options + popup.update, no close/reopen, no auto-open on a closed one).
 *
 * Unit-test geometry is not proof of real browser layout (the controller
 * verifies the device), but it pins the arithmetic that was wrong.
 *
 * Fixtures are fictitious (example.test titles, illustrative Rome coordinates).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, leafletMaps, leafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let popupGeometryFor;
let POPUP_CHROME_X;

// Worst-case Leaflet chrome around the content box: the default
// `.leaflet-popup-content` margin (24+20) plus the 1px wrapper padding on
// each side. The mobile rule tightens it to 30px, so 46 is the conservative
// budget the geometry must respect.
const CHROME_X = 46;
const TIP_Y = 12;

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  const mod = await loadDomModule("app/lib/map-popup.mjs");
  popupGeometryFor = mod.popupGeometryFor;
  POPUP_CHROME_X = mod.POPUP_CHROME_X;
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(() => {
  rtl?.cleanup();
  resetLeafletMarkers();
});

// ---------------------------------------------------------------------------
// 1) Pure geometry — the arithmetic that was wrong.
// ---------------------------------------------------------------------------

test("popup geometry fits a 286px-wide 320px-phone map (balloon + padding)", () => {
  assert.equal(POPUP_CHROME_X, CHROME_X, "the exported chrome budget must cover Leaflet's content margin + wrapper padding");
  const geometry = popupGeometryFor({ x: 286, y: 340 });
  // The OUTER balloon (content + chrome) plus the autopan padding on both
  // sides must fit inside the map surface — this is exactly what failed.
  const outer = geometry.maxWidth + POPUP_CHROME_X;
  assert.ok(outer + geometry.autoPanPadding[0] * 2 <= 286, `outer ${outer} + padding ${geometry.autoPanPadding[0]} must fit the 286px map`);
  assert.ok(geometry.minWidth <= geometry.maxWidth, "minWidth may never exceed maxWidth (a 220px floor must not force overflow)");
  assert.equal(geometry.minWidth, geometry.maxWidth, "on the narrowest observed surface the balloon uses the whole width budget");
  assert.ok(geometry.autoPanPadding[1] < 48, "the fixed 48px vertical autopan padding is what made the pan impossible");
  assert.ok(geometry.maxHeight + geometry.autoPanPadding[1] * 2 + TIP_Y <= 340, "the height budget plus padding plus tip must fit the map height");
});

test("popup geometry keeps the accepted phone/desktop widths where they fit", () => {
  // 390px phone → ~358px map surface: the accepted 260px balloon still fits.
  assert.deepEqual(
    { maxWidth: popupGeometryFor({ x: 358, y: 520 }).maxWidth, minWidth: popupGeometryFor({ x: 358, y: 520 }).minWidth },
    { maxWidth: 260, minWidth: 220 },
  );
  // Desktop surface (split workspace): unchanged 300px + the generous padding.
  const desktop = popupGeometryFor({ x: 900, y: 700 });
  assert.equal(desktop.maxWidth, 300, "desktop keeps the 300px balloon");
  assert.equal(desktop.minWidth, 220, "desktop keeps the 220px floor");
  assert.deepEqual(desktop.autoPanPadding, [60, 48], "desktop keeps the accepted autopan padding");
});

test("popup geometry never trusts an unmeasured surface", () => {
  // SSR / pre-layout: getSize() can report 0x0. The fallback must be the
  // desktop balloon (never 0, never NaN) so a popup opened before the first
  // layout still renders.
  for (const size of [{ x: 0, y: 0 }, undefined, null]) {
    const geometry = popupGeometryFor(size);
    assert.equal(geometry.maxWidth, 300);
    assert.equal(geometry.minWidth, 220);
    assert.ok(Number.isFinite(geometry.maxHeight) && geometry.maxHeight > 0);
  }
});

// ---------------------------------------------------------------------------
// 2) Behaviour — both popup paths use the helper and follow the map surface.
// ---------------------------------------------------------------------------

async function renderMapWithCameras(cameras = []) {
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: 1, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras, selectedId: 1, onSelect: () => {}, onPick: () => {},
  })));
  await new Promise((resolve) => setTimeout(resolve, 10));
  return view;
}

const CAMERAS = [
  { id: 1, title: "Via Example corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" },
  { id: 2, title: "Piazza Fixture", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report" },
];

test("marker and picker popups size themselves on the actual map surface", async () => {
  await renderMapWithCameras(CAMERAS);
  const maps = await leafletMaps();
  const map = maps.at(-1);
  map.size = { x: 286, y: 340 }; // the 320x568 phone map measured in the review
  const clickHandler = map.handlers.click?.[0];
  assert.ok(clickHandler, "the map registers the coordinate-picker listener");
  clickHandler({ latlng: { lat: 41.9004, lng: 12.4936 } });

  const picker = map.popupOpts;
  assert.ok(picker, "the picker popup carries its options");
  assert.ok(picker.maxWidth + CHROME_X + picker.autoPanPadding[0] * 2 <= 286, `picker balloon ${picker.maxWidth} must fit the 286px map`);
  assert.ok(picker.minWidth <= picker.maxWidth, "the picker minWidth may never exceed maxWidth");
  assert.equal(picker.keepInView, true, "keepInView stays");

  const markerList = await leafletMarkers();
  const withPopup = markerList.find((item) => item.popupOpts);
  assert.ok(withPopup, "markers carry their bindPopup options in the stub");
  assert.deepEqual(
    { maxWidth: withPopup.popupOpts.maxWidth, minWidth: withPopup.popupOpts.minWidth, autoPanPadding: withPopup.popupOpts.autoPanPadding },
    { maxWidth: picker.maxWidth, minWidth: picker.minWidth, autoPanPadding: picker.autoPanPadding },
    "marker and picker popups must share ONE sizing path",
  );
});

test("a map resize re-fits the kept markers that already exist", async () => {
  await renderMapWithCameras(CAMERAS);
  const maps = await leafletMaps();
  const map = maps.at(-1);
  map.size = { x: 286, y: 340 };
  map.fire("resize"); // the 320px phone layout settles after the map exists
  const markers = await leafletMarkers();
  const target = markers.find((item) => item.popupOpts && item.handlers.click?.length);
  assert.ok(target, "the fixture records must be materialised as individual markers");
  const before = target.popupOpts.maxWidth;
  assert.equal(before, 220, "the narrow phone map shrinks the balloon to what fits");

  // Open one popup (user click) and keep a second one closed.
  target.handlers.click[0]({ originalEvent: {} , stopPropagation() {} });
  assert.equal(target.isPopupOpen(), true, "the click opens the popup");

  // The map grows (rotation / keyboard / desktop breakpoint) while the popup
  // is open: the kept marker must receive FRESH dimensions and be re-fitted.
  map.size = { x: 358, y: 520 };
  map.fire("resize");
  assert.ok(target.popupOpts.maxWidth > before, `the kept marker must be re-sized (was ${before}, now ${target.popupOpts.maxWidth})`);
  assert.equal(target.popupOpts.maxWidth, 260, "the re-fit uses the 390px-phone balloon width");
  assert.ok((target.popupUpdates ?? 0) >= 1, "the OPEN popup is re-fitted in place (no close/reopen)");
  assert.equal(target.isPopupOpen(), true, "the open popup stays open across the resize");

  // A popup the user never opened (or closed explicitly) must NOT be opened
  // by the resize handler — no auto-open on resize.
  const others = markers.filter((item) => item !== target && item.popupOpts);
  assert.ok(others.length > 0, "the fixture has another marker to check");
  for (const other of others) {
    assert.equal(other.isPopupOpen(), false, "resize must never auto-open a closed popup");
    assert.equal(other.popupOpts.maxWidth, 260, "kept (closed) markers still receive the fresh width");
  }
});
