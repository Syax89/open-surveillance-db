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
/** Default surface for maps created next (stub-scoped, see dom-harness). */
async function setDefaultMapSize(size) {
  const stub = await loadDomModule("node_modules/leaflet/index.mjs");
  stub.__setDefaultMapSize(size);
}
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

afterEach(async () => {
  rtl?.cleanup();
  resetLeafletMarkers();
  await setDefaultMapSize(null);
});

// ---------------------------------------------------------------------------
// 1) Pure geometry — the arithmetic that was wrong.
// ---------------------------------------------------------------------------

test("popup geometry fits a 286px-wide 320px-phone map (balloon + padding)", () => {
  assert.equal(POPUP_CHROME_X, CHROME_X, "the exported chrome budget must cover Leaflet's content margin + wrapper padding");
  const geometry = popupGeometryFor({ x: 286, y: 340 });
  // The OUTER balloon plus the left padding AND the reserved right control
  // lane must fit inside the map surface — this is exactly what failed.
  const outer = geometry.maxWidth + POPUP_CHROME_X;
  const [right, bottom] = geometry.autoPanPaddingBottomRight;
  assert.ok(outer + geometry.autoPanPadding[0] + right <= 286, `outer ${outer} + left ${geometry.autoPanPadding[0]} + right ${right} must fit the 286px map`);
  assert.equal(right, 60, "the right control lane (44px target + margin + gap) is reserved on a narrow map");
  assert.equal(bottom, 60, "the bottom help overlay lane is reserved on a narrow map");
  assert.ok(bottom > geometry.autoPanPadding[1], "the bottom lane is the asymmetric part of the vertical padding");
  assert.ok(geometry.minWidth <= geometry.maxWidth, "minWidth may never exceed maxWidth (a 220px floor must not force overflow)");
  assert.equal(geometry.minWidth, geometry.maxWidth, "on the narrowest observed surface the balloon uses the whole width budget");
  assert.ok(geometry.autoPanPadding[1] < 48, "the fixed 48px vertical autopan padding is what made the pan impossible");
  assert.ok(geometry.maxHeight + geometry.autoPanPadding[1] + bottom + TIP_Y <= 340, "the height budget plus both paddings plus the tip must fit the map height");
});

test("popup geometry keeps the accepted phone/desktop widths where they fit", () => {
  // 390px phone → ~358px map surface (real browser budget): the balloon and
  // the reserved right lane still fit side by side.
  const phone = popupGeometryFor({ x: 358, y: 520 });
  assert.equal(phone.maxWidth, 358 - phone.autoPanPadding[0] - 60 - POPUP_CHROME_X, "the balloon shrinks by the reserved right lane");
  assert.equal(phone.minWidth, 220, "the accepted floor still fits");
  // Desktop surface (split workspace): unchanged 300px + the generous,
  // still SYMMETRIC padding — no lane is reserved when there is room.
  const desktop = popupGeometryFor({ x: 900, y: 700 });
  assert.equal(desktop.maxWidth, 300, "desktop keeps the 300px balloon");
  assert.equal(desktop.minWidth, 220, "desktop keeps the 220px floor");
  assert.deepEqual(desktop.autoPanPadding, [60, 48], "desktop keeps the accepted autopan padding");
  assert.deepEqual(desktop.autoPanPaddingBottomRight, desktop.autoPanPadding, "desktop stays symmetric");
});

test("an extra-small map keeps the floor and never produces a negative budget", () => {
  // Below ~240px the reserved lane cannot fit next to the 120px content
  // floor: the floor wins (the fit is unsatisfiable, as it was before this
  // change) but every number must stay a usable positive pixel value.
  for (const size of [{ x: 200, y: 200 }, { x: 160, y: 340 }, { x: 241, y: 300 }]) {
    const geometry = popupGeometryFor(size);
    assert.ok(geometry.maxWidth >= 120, "the 120px content floor survives");
    assert.ok(geometry.maxHeight >= 160, "the height floor survives");
    for (const value of [geometry.maxWidth, geometry.minWidth, geometry.maxHeight, ...geometry.autoPanPadding, ...geometry.autoPanPaddingBottomRight]) {
      assert.ok(Number.isFinite(value) && value >= 0, `every geometry value is a real pixel value (${value})`);
    }
  }
});

test("popup geometry never trusts an unmeasured surface", () => {
  // SSR / pre-layout: getSize() can report 0x0. The fallback must be the
  // desktop balloon (never 0, never NaN) so a popup opened before the first
  // layout still renders — with the SAME symmetric padding as before.
  for (const size of [{ x: 0, y: 0 }, undefined, null]) {
    const geometry = popupGeometryFor(size);
    assert.equal(geometry.maxWidth, 300);
    assert.equal(geometry.minWidth, 220);
    assert.deepEqual(geometry.autoPanPaddingBottomRight, geometry.autoPanPadding, "an unmeasured surface reserves no lane");
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
  const pickerGeometry = popupGeometryFor({ x: 286, y: 340 });
  assert.ok(
    picker.maxWidth + CHROME_X + picker.autoPanPadding[0] + picker.autoPanPaddingBottomRight[0] <= 286,
    `picker balloon ${picker.maxWidth} + left ${picker.autoPanPadding[0]} + reserved right ${picker.autoPanPaddingBottomRight[0]} must fit the 286px map`,
  );
  assert.deepEqual(picker.autoPanPaddingBottomRight, pickerGeometry.autoPanPaddingBottomRight, "the picker receives the reserved right/bottom lanes");
  assert.ok(picker.minWidth <= picker.maxWidth, "the picker minWidth may never exceed maxWidth");
  assert.equal(picker.keepInView, true, "keepInView stays");

  const markerList = await leafletMarkers();
  const withPopup = markerList.find((item) => item.popupOpts);
  assert.ok(withPopup, "markers carry their bindPopup options in the stub");
  assert.deepEqual(
    {
      maxWidth: withPopup.popupOpts.maxWidth,
      minWidth: withPopup.popupOpts.minWidth,
      autoPanPadding: withPopup.popupOpts.autoPanPadding,
      autoPanPaddingBottomRight: withPopup.popupOpts.autoPanPaddingBottomRight,
    },
    {
      maxWidth: picker.maxWidth,
      minWidth: picker.minWidth,
      autoPanPadding: picker.autoPanPadding,
      autoPanPaddingBottomRight: picker.autoPanPaddingBottomRight,
    },
    "marker and picker popups must share ONE sizing path (both padding tuples included)",
  );
});

test("newly bound markers receive the reserved lanes before any resize", async () => {
  await setDefaultMapSize({ x: 286, y: 340 });
  await renderMapWithCameras(CAMERAS);
  const markers = (await leafletMarkers()).filter((marker) => marker.popupOpts);
  assert.ok(markers.length > 0, "the fixture creates camera markers");
  for (const marker of markers) {
    assert.deepEqual(marker.popupOpts.autoPanPaddingBottomRight, [60, 60], "bindPopup reserves the lanes without a later resize repairing it");
  }
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
  const narrowGeometry = popupGeometryFor({ x: 286, y: 340 });
  assert.equal(before, narrowGeometry.maxWidth, "the narrow phone map shrinks the balloon to what fits beside the control lane");
  assert.ok(before < 220, `the reserved right lane makes the balloon (${before}px) narrower than the old symmetric 220px`);
  assert.deepEqual(target.popupOpts.autoPanPaddingBottomRight, narrowGeometry.autoPanPaddingBottomRight, "the narrow surface reserves the right/bottom lanes");

  // Open one popup (user click) and keep a second one closed.
  target.handlers.click[0]({ originalEvent: {} , stopPropagation() {} });
  assert.equal(target.isPopupOpen(), true, "the click opens the popup");

  // The map grows (rotation / keyboard / desktop breakpoint) while the popup
  // is open: the kept marker must receive FRESH dimensions and be re-fitted.
  map.size = { x: 358, y: 520 };
  map.fire("resize");
  const wideGeometry = popupGeometryFor({ x: 358, y: 520 });
  assert.ok(target.popupOpts.maxWidth > before, `the kept marker must be re-sized (was ${before}, now ${target.popupOpts.maxWidth})`);
  assert.equal(target.popupOpts.maxWidth, wideGeometry.maxWidth, "the re-fit uses the fresh geometry for the new surface");
  assert.deepEqual(target.popupOpts.autoPanPadding, wideGeometry.autoPanPadding, "the re-fit updates the top-left padding too");
  assert.deepEqual(target.popupOpts.autoPanPaddingBottomRight, wideGeometry.autoPanPaddingBottomRight, "the re-fit updates the right/bottom lanes too");
  assert.ok((target.popupUpdates ?? 0) >= 1, "the OPEN popup is re-fitted in place (no close/reopen)");
  assert.equal(target.isPopupOpen(), true, "the open popup stays open across the resize");

  // A popup the user never opened (or closed explicitly) must NOT be opened
  // by the resize handler — no auto-open on resize.
  const others = markers.filter((item) => item !== target && item.popupOpts);
  assert.ok(others.length > 0, "the fixture has another marker to check");
  for (const other of others) {
    assert.equal(other.isPopupOpen(), false, "resize must never auto-open a closed popup");
    assert.equal(other.popupOpts.maxWidth, wideGeometry.maxWidth, "kept (closed) markers still receive the fresh width");
    assert.deepEqual(other.popupOpts.autoPanPaddingBottomRight, wideGeometry.autoPanPaddingBottomRight, "kept (closed) markers receive the fresh lanes");
  }
});

// ---------------------------------------------------------------------------
// 3) R1 (controller browser pass): the FIRST fit must happen at creation.
// ---------------------------------------------------------------------------

test("the map container receives the measured height budget at creation, without any resize", async () => {
  // R1: the initial applyPopupFit() ran BEFORE mapRef.current = map, so it
  // no-oped and --osm-popup-max-height stayed unset until some later resize;
  // in a real browser that left the first balloon clipped above the map
  // (top=70.48 vs map top=104.08, close button unreachable).
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const liveMap = view.container.querySelector(".live-map");
  assert.ok(liveMap, "the map element renders");
  // No resize was fired: this must come from the creation-time fit.
  // The stub surface is 800x600 → 0.6 * 600 = 360px (popupGeometryFor).
  assert.equal(
    liveMap.style.getPropertyValue("--osm-popup-max-height"),
    "360px",
    "the creation-time fit must publish the measured height budget",
  );
});

test("an unmeasurable surface does not publish a budget that could exceed the real map", async () => {
  // Before layout Leaflet can report 0x0. Writing the desktop FALLBACK
  // (360px) as if it were measured could exceed a phone map's height and
  // clip the balloon, so the variable must stay unset and let the CSS
  // fallback (min(60svh, 100svh - 140px)) apply until a real size exists.
  await setDefaultMapSize({ x: 0, y: 0 });
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const liveMap = view.container.querySelector(".live-map");
  assert.equal(
    liveMap.style.getPropertyValue("--osm-popup-max-height"),
    "",
    "no budget is published from an unmeasurable surface",
  );
});

// ---------------------------------------------------------------------------
// 4) R4: the map-owned coordinate picker is re-fitted on a REAL map resize.
// ---------------------------------------------------------------------------

/** Open the coordinate picker on the current surface (empty-map click). */
async function openPicker(map, latlng = { lat: 41.9004, lng: 12.4936 }) {
  const clickHandler = map.handlers.click?.[0];
  assert.ok(clickHandler, "the map registers the coordinate-picker listener");
  clickHandler({ latlng });
}

function pickerOptions(map) {
  return {
    maxWidth: map.popup.options.maxWidth,
    minWidth: map.popup.options.minWidth,
    autoPan: map.popup.options.autoPan,
    autoPanPadding: map.popup.options.autoPanPadding,
    autoPanPaddingBottomRight: map.popup.options.autoPanPaddingBottomRight,
    keepInView: map.popup.options.keepInView,
  };
}

test("the resize callback (a Leaflet event, not a Map) re-fits the OPEN picker", async () => {
  await renderMapWithCameras(CAMERAS);
  const map = (await leafletMaps()).at(-1);
  map.size = { x: 286, y: 340 }; // the 320px phone map measured in the review
  map.fire("resize");
  await openPicker(map);

  const narrow = popupGeometryFor({ x: 286, y: 340 });
  assert.deepEqual(pickerOptions(map), {
    maxWidth: narrow.maxWidth,
    minWidth: narrow.minWidth,
    autoPan: true,
    autoPanPadding: narrow.autoPanPadding,
    autoPanPaddingBottomRight: narrow.autoPanPaddingBottomRight,
    keepInView: true,
  }, "the freshly opened picker starts from the creation-time fit");
  const updatesBefore = map.popup.updates;
  const opensBefore = (map.events.popupopen ?? []).length;

  // The map grows (rotation / keyboard / desktop breakpoint) while the picker
  // is open. Leaflet calls the listener with a RESIZE EVENT — passing it
  // through as if it were a map would fall back to the unmeasured geometry.
  map.size = { x: 900, y: 700 };
  map.fire("resize", { type: "resize", target: map, oldSize: { x: 286, y: 340 }, newSize: { x: 900, y: 700 } });

  const wide = popupGeometryFor({ x: 900, y: 700 });
  assert.equal(wide.maxWidth, 300, "the fixture really changed surface (desktop balloon)");
  assert.deepEqual(pickerOptions(map), {
    maxWidth: wide.maxWidth,
    minWidth: wide.minWidth,
    autoPan: true,
    autoPanPadding: wide.autoPanPadding,
    autoPanPaddingBottomRight: wide.autoPanPaddingBottomRight,
    keepInView: true,
  }, "every picker option (width, minWidth, autoPan + both paddings) is refreshed from the new surface");
  assert.equal(map.popup.options.maxWidth, 300, "the balloon actually grew with the map");
  assert.equal(map.popup.updates, updatesBefore + 1, "the open picker is re-laid out in place (one update)");
  assert.equal(map.popup.isOpen(), true, "the picker stays open across the resize");
  assert.equal((map.events.popupopen ?? []).length, opensBefore, "no reopen: the resize never opens a popup");
  assert.deepEqual(map.popupLatLng, { lat: 41.9004, lng: 12.4936 }, "the picked position is untouched");

  // The kept markers receive the SAME refreshed option set: one geometry path.
  const markers = (await leafletMarkers()).filter((marker) => marker.popupOpts);
  assert.ok(markers.length > 0, "the fixture creates camera markers");
  for (const marker of markers) {
    assert.deepEqual(
      {
        maxWidth: marker.popupOpts.maxWidth,
        minWidth: marker.popupOpts.minWidth,
        autoPanPadding: marker.popupOpts.autoPanPadding,
        autoPanPaddingBottomRight: marker.popupOpts.autoPanPaddingBottomRight,
      },
      {
        maxWidth: wide.maxWidth,
        minWidth: wide.minWidth,
        autoPanPadding: wide.autoPanPadding,
        autoPanPaddingBottomRight: wide.autoPanPaddingBottomRight,
      },
      "the picker and the retained markers share the refreshed geometry",
    );
  }
});

test("a picker the user closed is never reopened or updated by a resize", async () => {
  await renderMapWithCameras(CAMERAS);
  const map = (await leafletMaps()).at(-1);
  map.size = { x: 286, y: 340 };
  map.fire("resize");
  await openPicker(map);
  const updatesBefore = map.popup.updates;
  const opensBefore = (map.events.popupopen ?? []).length;

  map.closePopup();
  assert.equal(map.popup.isOpen(), false, "the picker is closed (× / outside click)");

  map.size = { x: 900, y: 700 };
  map.fire("resize", { type: "resize", target: map });

  assert.equal(map.popup.isOpen(), false, "a closed picker stays closed");
  assert.equal(map.popup.updates, updatesBefore, "a closed picker is never re-laid out");
  assert.equal((map.events.popupopen ?? []).length, opensBefore, "no popup is opened by the resize");
});

test("a resize with no picker at all does nothing (never opens one)", async () => {
  await renderMapWithCameras(CAMERAS);
  const map = (await leafletMaps()).at(-1);
  map.size = { x: 286, y: 340 };
  assert.equal(map.popup, undefined, "no picker has been opened yet");

  map.size = { x: 900, y: 700 };
  map.fire("resize", { type: "resize", target: map });

  assert.equal(map.popup, undefined, "a resize never creates a picker");
  assert.equal(map.popupHtml, undefined, "no balloon is requested");
  assert.equal((map.events.popupopen ?? []).length, 0, "zero popupopen events");
});

test("a marker popup opening later takes over: the picker is no longer tracked", async () => {
  await renderMapWithCameras(CAMERAS);
  const map = (await leafletMaps()).at(-1);
  map.size = { x: 286, y: 340 };
  map.fire("resize");
  await openPicker(map);
  const picker = map.popup;
  const pickerUpdates = picker.updates;

  // A marker tap opens the record balloon (the map keeps one popup at a time).
  const marker = (await leafletMarkers()).find((item) => item.popupOpts && item.handlers.click?.length);
  assert.ok(marker, "the fixture records are materialised as individual markers");
  marker.handlers.click[0]({ originalEvent: {}, stopPropagation() {} });
  assert.equal(marker.isPopupOpen(), true, "the marker popup opens");

  map.size = { x: 900, y: 700 };
  map.fire("resize", { type: "resize", target: map });

  assert.equal(picker.updates, pickerUpdates, "the superseded picker is not updated any more");
  assert.equal(marker.popupOpts.maxWidth, popupGeometryFor({ x: 900, y: 700 }).maxWidth, "the marker popup is the one that gets re-fitted");
});

// ---------------------------------------------------------------------------
// 5) D1 (review A): a popup the user JUST opened survives the initial settle.
// ---------------------------------------------------------------------------

test("a just-opened popup survives a rebuild that aggregates the view (data arrival / resize settle)", async () => {
  // D1 path (named in .audit/author-report.md): a marker tap calls
  // onSelect(id) (parent state, committed later) + openPopup() (synchronous).
  // A reconcile that runs in between — the initial viewport/data settle, or
  // the debounced emitBounds after the popup's own autopan — reads a
  // selectedIdRef that has NOT caught up yet, aggregates the view into grid
  // cells, removes the tapped marker and drops the restore intent, so the
  // balloon vanishes with no user action.
  const FEW = [
    { id: 1, title: "Via Example corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" },
    { id: 2, title: "Piazza Fixture", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report" },
  ];
  // 200 records spread over the Rome view: over MAX_INDIVIDUAL_MARKERS (150)
  // at zoom < GRID_MAX_ZOOM (12) → markersForViewport aggregates them.
  // The tapped record stays IN THE STORE (id 1 is included): D1 is not about a
  // record leaving the data, only about the view being aggregated while the
  // selection has not been committed yet. NEIGHBOUR shares id 1's 48px cell,
  // so at the aggregation zoom the tapped record is bucketed into a multi-
  // record cell instead of staying individual — that is the removal path.
  const NEIGHBOUR = { id: 3, title: "Same-cell neighbour", kind: "dome", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" };
  const MANY = [...FEW, NEIGHBOUR, ...Array.from({ length: 200 }, (_, i) => ({
    id: 100 + i,
    title: `Fixture record ${i}`,
    kind: "bullet",
    status: "active",
    latitude: 41.80 + (i % 20) * 0.01,
    longitude: 12.40 + Math.floor(i / 20) * 0.01,
    source: "Community report",
  }))];

  // selectedId stays null on purpose: it models the pre-commit lag window.
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: FEW, selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const maps = await leafletMaps();
  const map = maps.at(-1);
  const markers = await leafletMarkers();
  const target = markers.find((item) => item.popupOpts && item.handlers.click?.length);
  assert.ok(target, "the fixture records are materialised as individual markers");
  target.handlers.click[0]({ originalEvent: {}, stopPropagation() {} });
  assert.equal(target.isPopupOpen(), true, "the tap opens the popup");

  // Data arrival + a zoom out that aggregates the view, with NO selection
  // committed yet (the race window).
  map.zoom = 10;
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras: MANY, selectedId: null, onSelect: () => {}, onPick: () => {},
  })));
  // The component registers `on("moveend zoomend")`; the stub keys handlers by
  // the literal event string, so invoke it the way the other map suites do.
  map.handlers["moveend zoomend"]?.[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const live = await leafletMarkers();
  const stillThere = live.find((item) => item.popupOpts && item.isPopupOpen?.());
  assert.ok(stillThere, "the popup the user just opened must survive the settle (no ghost close)");
  assert.equal(stillThere.popupOpened, true, "the balloon stays open");
});

test("a popup closed by the user is never reopened by the settle", async () => {
  const FEW = [
    { id: 1, title: "Via Example corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" },
    { id: 2, title: "Piazza Fixture", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report" },
  ];
  const NEIGHBOUR = { id: 3, title: "Same-cell neighbour", kind: "dome", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" };
  const MANY = [...FEW, NEIGHBOUR, ...Array.from({ length: 200 }, (_, i) => ({
    id: 100 + i, title: `Fixture record ${i}`, kind: "bullet", status: "active",
    latitude: 41.80 + (i % 20) * 0.01, longitude: 12.40 + Math.floor(i / 20) * 0.01, source: "Community report",
  }))];
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: FEW, selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const maps = await leafletMaps();
  const map = maps.at(-1);
  const markers = await leafletMarkers();
  const target = markers.find((item) => item.popupOpts && item.handlers.click?.length);
  target.handlers.click[0]({ originalEvent: {}, stopPropagation() {} });
  assert.equal(target.isPopupOpen(), true);

  // Explicit user close: popupclose with rebuildingRef false clears the intent.
  target.popupOpened = false;
  map.fire("popupclose", { marker: target });

  map.zoom = 10;
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras: MANY, selectedId: null, onSelect: () => {}, onPick: () => {},
  })));
  // The component registers `on("moveend zoomend")`; the stub keys handlers by
  // the literal event string, so invoke it the way the other map suites do.
  map.handlers["moveend zoomend"]?.[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const live = await leafletMarkers();
  assert.equal(live.filter((item) => item.isPopupOpen?.()).length, 0, "an explicit close is never undone by a rebuild");
});
