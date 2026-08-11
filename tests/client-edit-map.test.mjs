/**
 * EditPositionMap — the interactive Leaflet map inside /records/[id]/edit
 * (t_775c8400) that MOVES the record's camera position.
 *
 * Contracts (same family as ReportMiniMap, pre-filled position instead of
 * the national overview):
 *   1. mounts an interactive map (zoom control on) whose tiles come ONLY
 *      from the CSP-safe /api/tiles proxy (never a direct tile hotlink);
 *      the initial view centres on the record's stored position at zoom 17;
 *   2. a map click publishes the ROUNDED 5-DECIMAL position through
 *      onPositionChange and NEVER opens a popup;
 *   3. for directional kinds with a known bearing it draws the SAME FOV
 *      cone as /mappa (field-of-view.ts) plus a draggable round handle —
 *      dragging re-aims the cone and publishes the new bearing to
 *      setDirection; the handle is bubblingMouseEvents:false;
 *   4. domes draw the 360° circle, unknown directions draw nothing;
 *   5. external coordinate changes (manual entry) move the position marker
 *      and re-centre the map; bearing-only changes re-aim the cone IN PLACE
 *      (no layer rebuild, so the drag is never interrupted).
 *
 * Fixtures are fictitious (example.test coordinates).
 */
import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, leafletMaps, leafletMarkers, leafletPaths, resetLeafletMarkers, React,
} from "./helpers/dom-harness.mjs";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

let rtl;
let EditPositionMap;
const fov = await loadLib("app/lib/field-of-view.mjs");

// Example.test fixture (Ferrara): stored camera position + directional kind.
const CAM = { latitude: 44.8378, longitude: 11.6183 };

before(async () => {
  rtl = await setupDom();
  EditPositionMap = (await loadDomModule("app/components/EditPositionMap.mjs")).EditPositionMap;
});

after(async () => cleanupRouteTree());

afterEach(async () => {
  rtl?.cleanup();
  // Async (module load) — awaiting prevents the next test racing the
  // paths/markers restore under a slow runner.
  await resetLeafletMarkers();
});

function mapProps(overrides = {}) {
  return {
    latitude: CAM.latitude,
    longitude: CAM.longitude,
    onPositionChange: () => {},
    kind: "",
    direction: null,
    directionKnown: false,
    setDirection: () => {},
    ...overrides,
  };
}

async function renderEditMap(props) {
  const view = await renderWithLocale(React.createElement(EditPositionMap, mapProps(props)));
  // Leaflet is imported and mounted in an effect — poll until the stub
  // map exists (dynamic import + promise chain, like the map suites).
  await rtl.waitFor(async () => {
    const maps = await leafletMaps();
    assert.ok(maps.length >= 1, "a Leaflet map is created");
  }, { timeout: 3000 });
  return view;
}

// Host component that re-renders the SAME EditPositionMap instance with new
// props (state-driven, like production) — used for the prop-change tests.
function makeHarness(initialProps) {
  let setPropsFn;
  function Harness() {
    const [props, setProps] = React.useState(initialProps);
    setPropsFn = setProps;
    return React.createElement(EditPositionMap, mapProps(props));
  }
  return {
    Harness,
    update: (patch) => rtl.act(() => setPropsFn((p) => ({ ...p, ...patch }))),
  };
}

async function renderHarness(initialProps) {
  const harness = makeHarness(initialProps);
  const view = await renderWithLocale(React.createElement(harness.Harness));
  await rtl.waitFor(async () => {
    const maps = await leafletMaps();
    assert.ok(maps.length >= 1, "a Leaflet map is created");
  }, { timeout: 3000 });
  return { harness, view };
}

function conesFrom(paths) {
  return paths.filter((p) => p.__isPath && p.latlngs && Array.isArray(p.latlngs));
}

function circlesFrom(paths) {
  return paths.filter((p) => p.__isPath && Array.isArray(p.latlng) && p.latlng.length === 2 && !Array.isArray(p.latlngs));
}

function handleFrom(markers) {
  // The rotation handle carries the fov-rotate-handle-wrap icon; the
  // position marker (issue #434) is also draggable but uses the
  // report-pick-marker icon — filter on the icon class, not draggable.
  return markers.find((m) => m.opts?.draggable === true && m.opts?.icon?.className === "fov-rotate-handle-wrap");
}

function positionMarkerFrom(markers) {
  return markers.find((m) => m.opts?.icon?.className === "");
}

test("renders an interactive map with CSP-safe tiles, labelled surface and the help text visible", async () => {
  const { screen } = rtl;
  const view = await renderEditMap({});
  const map = (await leafletMaps()).at(-1);
  assert.equal(map.opts.zoomControl, true, "the zoom control is available (interactive map)");
  const tiles = map.tileLayers ?? [];
  assert.ok(tiles.some((u) => String(u).includes("/api/tiles/")), "tiles come from the CSP-safe /api/tiles proxy, never a direct hotlink");

  const surface = screen.getByRole("application", { name: "Map — click to move the camera position" });
  assert.ok(surface, "the map surface carries the localized aria-label");
  assert.ok(view.container.textContent.includes("Click the map to move the camera position"), "the help text explains click-to-move and the drag handle");
});

test("the map starts at the record's stored position at the FOV legibility zoom", async () => {
  await renderEditMap({});
  const map = (await leafletMaps()).at(-1);
  const firstView = map.views[0];
  assert.deepEqual(firstView?.center, [44.8378, 11.6183], "the initial view is the stored camera position");
  assert.equal(firstView?.zoom, 17, "the initial zoom is the FOV legibility zoom");
});

test("a map click moves the position through onPositionChange (5-decimal rounding) and NEVER opens a popup", async () => {
  const picked = [];
  await renderEditMap({ onPositionChange: (lat, lng) => picked.push([lat, lng]) });
  const map = (await leafletMaps()).at(-1);
  map.fire("click", { latlng: { lat: 44.837812345, lng: 11.618312345 } });
  assert.deepEqual(picked, [[44.83781, 11.61831]], "the click lat/lng reaches onPositionChange rounded to 5 decimals");
  assert.equal(map.popupHtml, undefined, "no popup is ever opened by a map click — click means position move only");
});

test("dragging the position marker moves the camera position (5-decimal rounding, no popup)", async () => {
  const picked = [];
  await renderEditMap({ onPositionChange: (lat, lng) => picked.push([lat, lng]) });
  const marker = positionMarkerFrom(await leafletMarkers());
  assert.ok(marker, "a position marker exists");
  assert.equal(marker.opts.draggable, true, "the position marker is draggable (issue #434)");
  assert.equal(marker.opts.bubblingMouseEvents, false, "a marker drag never bubbles to the click-to-move map handler");
  const map = (await leafletMaps()).at(-1);
  marker.setLatLng([44.837812345, 11.618312345]);
  marker.fire("dragend", { target: marker });
  assert.deepEqual(picked, [[44.83781, 11.61831]], "the dragend lat/lng reaches onPositionChange rounded to 5 decimals");
  assert.equal(map.popupHtml, undefined, "a marker drag never opens a popup");
});

test("directional kind with a known bearing draws the FOV cone + a draggable rotation handle on the centre line", async () => {
  await renderEditMap({ kind: "Bullet", direction: 90, directionKnown: true });
  const paths = await leafletPaths();
  const cones = conesFrom(paths);
  assert.equal(cones.length, 1, "exactly one FOV cone for a directional kind");
  assert.deepEqual(cones[0].latlngs[0], [44.8378, 11.6183], "the cone vertex sits on the camera position");
  assert.equal(cones[0].opts.interactive, false, "the cone is decorative (clicks pass through to the map)");

  const markers = await leafletMarkers();
  const handle = handleFrom(markers);
  assert.ok(handle, "a rotation handle marker exists");
  assert.equal(handle.opts.draggable, true, "the handle is draggable");
  assert.equal(handle.opts.bubblingMouseEvents, false, "a handle click never bubbles to the click-to-move map handler");
  assert.equal(handle.opts.icon?.className, "fov-rotate-handle-wrap", "the handle uses the styled divIcon");
  const expected = fov.fovBearingPoint(44.8378, 11.6183, 90);
  assert.deepEqual(handle.latlng, expected, "the handle sits at the cone centre line, radius away");
});

test("dragging the rotation handle re-aims the cone and publishes the new bearing to setDirection", async () => {
  const bearings = [];
  await renderEditMap({ kind: "Bullet", direction: 90, directionKnown: true, setDirection: (b) => bearings.push(b) });
  const handle = handleFrom(await leafletMarkers());
  const cones = conesFrom(await leafletPaths());
  const before = cones[0].latlngs;
  // Drag the handle to the point at bearing 45 — the cone must follow.
  const target = fov.fovBearingPoint(44.8378, 11.6183, 45);
  handle.setLatLng(target);
  handle.fire("drag", { target: handle });
  assert.equal(bearings.at(-1), 45, "the dragged bearing is published to the form state");
  assert.notDeepEqual(cones[0].latlngs, before, "the cone was re-aimed in place during the drag");
  assert.deepEqual(handle.latlng, target, "the handle follows the drag position");
});

test("domes draw the 360° circle — no cone, no rotation handle", async () => {
  await renderEditMap({ kind: "Fixed dome", direction: null, directionKnown: false });
  const paths = await leafletPaths();
  assert.equal(circlesFrom(paths).length, 1, "a dome gets exactly one circle");
  assert.equal(conesFrom(paths).length, 0, "no cone for a dome");
  assert.equal(handleFrom(await leafletMarkers()), undefined, "no rotation handle for a dome");
  assert.equal(circlesFrom(paths)[0].opts.interactive, false, "the dome circle is decorative");
});

test("unknown direction draws no FOV geometry and no handle", async () => {
  await renderEditMap({ kind: "Bullet", direction: null, directionKnown: false });
  const paths = await leafletPaths();
  assert.equal(conesFrom(paths).length, 0, "no cone without a known bearing");
  assert.equal(circlesFrom(paths).length, 0, "no circle for a directional kind");
  assert.equal(handleFrom(await leafletMarkers()), undefined, "no rotation handle without a bearing");
});

test("an external coordinate change moves the position marker and re-centres the map (manual entry)", async () => {
  const { harness } = await renderHarness({});
  const map = (await leafletMaps()).at(-1);
  // Manual coordinate entry: a new position arrives from OUTSIDE the map.
  await harness.update({ latitude: 45.4642, longitude: 9.19, kind: "Bullet", direction: null, directionKnown: false });
  const markers = await leafletMarkers();
  const position = positionMarkerFrom(markers);
  assert.deepEqual(position.latlng, [45.4642, 9.19], "the position marker moved to the new coordinates");
  assert.deepEqual(map.views.at(-1)?.center, [45.4642, 9.19], "the map re-centred on the externally supplied position");
  assert.ok(map.views.at(-1)?.zoom >= 17, "the map zoomed in to the pick zoom (above FOV_MIN_ZOOM)");
});

test("a bearing change re-aims the SAME cone in place — no layer rebuild, so a drag is never interrupted", async () => {
  const { harness } = await renderHarness({ kind: "Bullet", direction: 90, directionKnown: true });
  const cone = conesFrom(await leafletPaths())[0];
  const handleBefore = handleFrom(await leafletMarkers());
  const latlngsBefore = cone.latlngs;
  // Slider input / external bearing change: 90° → 180°.
  await harness.update({ direction: 180 });
  const conesAfter = conesFrom(await leafletPaths());
  assert.equal(conesAfter.length, 1, "still exactly one cone");
  assert.equal(conesAfter[0], cone, "the SAME polygon object was re-aimed in place (no rebuild)");
  assert.deepEqual(cone.latlngs[0], [44.8378, 11.6183], "the vertex stays on the camera");
  assert.notDeepEqual(cone.latlngs, latlngsBefore, "the arc moved to the new bearing");
  const handleAfter = handleFrom(await leafletMarkers());
  assert.equal(handleAfter, handleBefore, "the handle marker is preserved across the bearing change");
  assert.deepEqual(handleAfter.latlng, fov.fovBearingPoint(44.8378, 11.6183, 180), "the handle moved to the new centre line");
});
