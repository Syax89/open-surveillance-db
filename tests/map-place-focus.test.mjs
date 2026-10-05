/**
 * Place-search focus contract for /mappa (batch A — B01; batch B adds
 * B09 reselection and B10 pending-intent here).
 *
 * B01: the geocoder suggestion carries a `boundingbox`; a city/province/
 * region selection must frame the AREA with the real map's fitBounds (capped
 * so it stays readable) instead of dropping a single centroid point — while a
 * point/address (small or invalid box) and a record ?focus=ID deep link keep
 * the practical point + zoom fallback.
 *
 * Fixtures are fictitious Nominatim-shaped data (the two Ferrara boxes match
 * the values the geocode fixtures already use elsewhere).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, resetLeafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let MappaTool;
let __resetViewportCamerasCache;

// A city/province box (administrative area) and a road/point box.
const CITY = {
  display_name: "Ferrara, Emilia-Romagna, Italia",
  lat: 44.838124, lng: 11.619791, type: "administrative",
  boundingbox: ["44.7198493", "44.9637886", "11.5109915", "11.8870544"],
};
const ROAD = {
  display_name: "Via del Duomo, Ferrara, Italia",
  lat: 44.8355, lng: 11.619, type: "road",
  boundingbox: ["44.83", "44.84", "11.61", "11.63"],
};

before(async () => {
  rtl = await setupDom();
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
  const mod = await loadDomModule("app/lib/use-viewport-cameras.mjs");
  __resetViewportCamerasCache = mod.__resetViewportCamerasCache;
});

afterEach(async () => {
  rtl?.cleanup();
  __resetViewportCamerasCache();
  await resetLeafletMarkers();
});

const installPlaceMock = () => installFetchMock((input) => {
  const url = String(input);
  if (url.startsWith("/api/geocode")) return jsonResponse({ results: [CITY, ROAD] });
  return jsonResponse({ records: [], total: 0, nextOffset: null });
});

async function leaves() {
  return loadDomModule("node_modules/leaflet/index.mjs");
}

test("B01: selecting a city suggestion frames the administrative AREA with fitBounds (max zoom 15)", async () => {
  installPlaceMock();
  await resetLeafletMarkers();
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, "Ferrara");
  const listbox = await waitFor(() => screen.getByRole("listbox", { name: "Place suggestions" }), { timeout: 5000 });

  rtl.within(listbox).getAllByRole("option")[0].click();

  const leaflet = await leaves();
  await waitFor(() => assert.ok(leaflet.__maps.length > 0));
  const map = leaflet.__maps.at(-1);
  await waitFor(() => assert.equal(map.fitBoundsCalls.length, 1, "the city selection frames the area"), { timeout: 3000 });
  const call = map.fitBoundsCalls[0];
  assert.deepEqual(call.bounds, [[44.7198493, 11.5109915], [44.9637886, 11.8870544]], "fitBounds receives the geocoder box");
  assert.equal(call.opts?.maxZoom, 15, "the area framing stays readable");
  // The initial Rome setView is the only setView — the selection did NOT
  // drop a centroid point for the area.
  assert.ok(!map.views.some((view) => view.center[0] === CITY.lat), "no centroid setView for an area selection");
});

test("B01: a point/address suggestion (small box) keeps the point + zoom fallback", async () => {
  installPlaceMock();
  await resetLeafletMarkers();
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, "Via");
  const listbox = await waitFor(() => screen.getByRole("listbox", { name: "Place suggestions" }), { timeout: 5000 });

  // The road entry is option 1 (the small box).
  rtl.within(listbox).getAllByRole("option")[1].click();

  const leaflet = await leaves();
  await waitFor(() => assert.ok(leaflet.__maps.length > 0));
  const map = leaflet.__maps.at(-1);
  await waitFor(() => assert.ok(map.views.some((view) => view.center[0] === ROAD.lat), "the point fallback pans to the suggestion"), { timeout: 3000 });
  const last = map.views.at(-1);
  assert.deepEqual(last.center, [ROAD.lat, ROAD.lng]);
  assert.ok(last.zoom >= 15, "the point fallback zooms to at least 15");
  assert.equal(map.fitBoundsCalls.length, 0, "a small/point box never frames an area");
});
