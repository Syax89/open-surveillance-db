/**
 * R1 (B01) — a valid administrative area that is already present BEFORE the
 * lazy Leaflet import resolves must still be FRAMED (fitBounds) once the map
 * is ready. Previously createMap applied only the point (centroid zoom 15) and
 * the framing effect never re-ran on readiness — a reachable slow-import /
 * fast-geocode selection race degraded a real territory to its centroid.
 *
 * The fallback to the point is ONLY for an invalid/point box.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, resetLeafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
});

afterEach(async () => {
  rtl?.cleanup();
  await resetLeafletMarkers();
});

const AREA = { south: 44.7, north: 44.96, west: 11.51, east: 11.89 };

test("R1: a valid area present before map readiness frames the area (not its centroid)", async () => {
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
  await resetLeafletMarkers();

  // The area AND its point fallback are BOTH supplied before any readiness —
  // exactly the early selection. The area must win.
  await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
    focusLocation: { latitude: 44.83, longitude: 11.62 },
    focusBounds: AREA,
  }));
  const leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  await rtl.act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  const map = leaflet.__maps.at(-1);

  assert.equal(map.fitBoundsCalls.length, 1, "the valid area is framed after readiness");
  assert.deepEqual(map.fitBoundsCalls[0].bounds, [[AREA.south, AREA.west], [AREA.north, AREA.east]]);
  assert.equal(map.fitBoundsCalls[0].opts?.maxZoom, 15, "the area framing stays readable");
  assert.ok(!map.views.some((view) => view.center[0] === 44.83), "a valid area never degrades to a centroid setView");
});

test("R1: an invalid/point box still falls back to the point + zoom", async () => {
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
  await resetLeafletMarkers();
  await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
    focusLocation: { latitude: 44.83, longitude: 11.62 },
    focusBounds: null,
  }));
  const leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  await rtl.act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  const map = leaflet.__maps.at(-1);
  assert.equal(map.fitBoundsCalls.length, 0, "no area for a point focus");
  assert.ok(map.views.some((view) => view.center[0] === 44.83 && view.zoom >= 15), "the point fallback frames the point");
});
