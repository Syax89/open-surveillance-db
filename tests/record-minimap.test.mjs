/**
 * RecordMiniMap — the read-only Leaflet map on the /records/[id] page
 * (CEO 2026-08-07).
 *
 * Contracts:
 *   1. mounts a map with a marker at the record position, zoom 17;
 *   2. draws the field-of-view geometry with the SAME rules as /mappa
 *      (field-of-view.ts): domes → circle, directional kinds with a
 *      stored bearing → cone polygon, unknown direction → nothing;
 *   3. is decorative and hydration-safe: SSR emits the container div
 *      (role="img" + localized label), Leaflet mounts in an effect.
 *
 * Fixtures are fictitious (illustrative coordinates, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, leafletMaps, leafletMarkers, leafletPaths, resetLeafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let RecordMiniMap;

before(async () => {
  rtl = await setupDom();
  RecordMiniMap = (await loadDomModule("app/components/RecordMiniMap.mjs")).RecordMiniMap;
});

afterEach(async () => {
  rtl?.cleanup();
  // Async (module load) — awaiting prevents the next test racing the
  // paths/markers restore under a slow runner.
  await resetLeafletMarkers();
});

async function renderMiniMap(props) {
  const view = await renderWithLocale(React.createElement(RecordMiniMap, {
    latitude: 41.9028,
    longitude: 12.4964,
    kind: "Traffic monitoring",
    direction: 90,
    title: "Via Roma corner",
    ...props,
  }));
  // Leaflet is imported and mounted in an effect — poll until the stub
  // map exists (dynamic import + promise chain, like the map suites).
  await rtl.waitFor(async () => {
    const maps = await leafletMaps();
    assert.ok(maps.length >= 1, "a Leaflet map is created");
  }, { timeout: 3000 });
  return view;
}

test("mini map renders a read-only Leaflet map with the marker at the record position (zoom 17)", async () => {
  await renderMiniMap({});
  const maps = await leafletMaps();
  assert.ok(maps.length >= 1, "a Leaflet map is created");
  const map = maps.at(-1);
  assert.equal(map.opts.zoomControl, false, "no zoom control on the read-only mini map");
  assert.equal(map.opts.dragging, false, "no dragging on the read-only mini map");
  assert.deepEqual(map.views.at(-1)?.center, [41.9028, 12.4964], "the map centres on the record position");
  assert.equal(map.views.at(-1)?.zoom, 17, "fixed zoom 17 (above FOV_MIN_ZOOM so the cone is legible)");
  const markers = await leafletMarkers();
  assert.ok(markers.some((m) => m.latlng?.[0] === 41.9028 && m.latlng?.[1] === 12.4964), "the record marker is placed at the coordinates");
});

test("mini map is decorative: role=img with the localized label, no interactive popup wiring", async () => {
  const { screen } = rtl;
  await renderMiniMap({});
  const img = screen.getByRole("img", { name: "Position on the map" });
  assert.ok(img, "the container exposes the localized position label");
  const maps = await leafletMaps();
  assert.equal(maps.at(-1).opts.scrollWheelZoom, false, "no scroll zoom on the read-only mini map");
});

test("directional camera with a bearing draws the FOV cone polygon (same rules as /mappa)", async () => {
  await renderMiniMap({ kind: "Traffic monitoring", direction: 90 });
  const paths = await leafletPaths();
  const cones = paths.filter((p) => p.__isPath && p.latlngs && Array.isArray(p.latlngs));
  assert.equal(cones.length, 1, "exactly one FOV geometry for a directional camera");
  const cone = cones[0];
  assert.deepEqual(cone.latlngs[0], [41.9028, 12.4964], "the cone vertex sits on the camera position");
  assert.ok(cone.latlngs.length >= 3, "the cone is a closed sector (vertex + arc points)");
  assert.equal(cone.opts.interactive, false, "the FOV geometry is decorative");
});

test("dome cameras draw the 360° circle, unknown direction draws nothing", async () => {
  await renderMiniMap({ kind: "Fixed dome", direction: null });
  const pathsDome = await leafletPaths();
  // Stub shape: polygon exposes latlngs (array of rings), circle exposes
  // latlng = [lat, lng] (a 2-number array, not a ring).
  const circles = pathsDome.filter((p) => p.__isPath && Array.isArray(p.latlng) && p.latlng.length === 2 && !Array.isArray(p.latlngs));
  assert.equal(circles.length, 1, "a dome gets exactly one circle");
  assert.equal(circles[0].opts.interactive, false, "the circle is decorative");

  // Unmount the dome render before the second case, or its circle leaks
  // into the next path assertions.
  rtl.cleanup();
  await resetLeafletMarkers();
  await renderMiniMap({ kind: "Bullet", direction: null });
  const pathsNone = await leafletPaths();
  const geometry = pathsNone.filter((p) => p.__isPath && (p.latlngs || p.latlng));
  assert.equal(geometry.length, 0, "no field-of-view geometry without a bearing");
});
