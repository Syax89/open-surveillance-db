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
  renderWithLocale, resetLeafletMarkers, leafletMarkers, setUrlState, React,
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

/** Select a suggestion from the dropdown by typing `query` and clicking option `index`. */
async function pickOption(screen, user, query, index) {
  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.clear(input);
  await user.type(input, query);
  const listbox = await rtl.waitFor(() => screen.getByRole("listbox", { name: "Place suggestions" }), { timeout: 5000 });
  rtl.within(listbox).getAllByRole("option")[index].click();
}

/**
 * Select a suggestion WITHOUT clearing the field first (the controller probe's
 * pattern — the geocode mock is query-agnostic). Used by the R2 repeat/rapid
 * tests so the render/flush ordering matches the probe.
 */
async function pickAppend(screen, user, query, index = 0) {
  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, query);
  const listbox = await rtl.waitFor(() => screen.getByRole("listbox", { name: "Place suggestions" }), { timeout: 5000 });
  await user.click(rtl.within(listbox).getAllByRole("option")[index]);
}

async function mapOf() {
  const leaflet = await leaves();
  await rtl.waitFor(() => assert.ok(leaflet.__maps.length > 0));
  return leaflet.__maps.at(-1);
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

// ---------------------------------------------------------------------------
// B09 — re-selecting the SAME place after a pan is an explicit new intent
// ---------------------------------------------------------------------------

test("B09: re-selecting the same place after a pan recentres the map", async () => {
  installPlaceMock();
  await resetLeafletMarkers();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  // First selection frames the city area.
  await pickOption(screen, user, "Ferrara", 0);
  const map = await mapOf();
  await rtl.waitFor(() => assert.equal(map.fitBoundsCalls.length, 1, "first selection frames the area"), { timeout: 3000 });

  // Pan away to a different viewport.
  const leaflet = await leaves();
  leaflet.__setBounds({ getSouth: () => 10, getNorth: () => 20, getWest: () => 0, getEast: () => 10, contains: () => false });
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  await new Promise((resolve) => setTimeout(resolve, 700));

  // Re-select the IDENTICAL place: the coordinates are unchanged, so only the
  // explicit intent token can make the focus effect re-run.
  await pickOption(screen, user, "Ferrara", 0);
  await rtl.waitFor(() => assert.equal(map.fitBoundsCalls.length, 2, "the repeated selection recentres the map"), { timeout: 3000 });
  const last = map.fitBoundsCalls.at(-1);
  assert.deepEqual(last.bounds, [[44.7198493, 11.5109915], [44.9637886, 11.8870544]], "it recentres on the chosen place, not the panned view");
});

// ---------------------------------------------------------------------------
// B10 — the place-search landing is consumed only after the DESTINATION response
// ---------------------------------------------------------------------------

const ROME_CAM = { id: 1, title: "Rome fixture", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936, source: "Development seed", updated: "Demo data" };
const FERRARA_CAM = { id: 2, title: "Ferrara fixture", kind: "Fixed dome", status: "demo", latitude: 44.838, longitude: 11.619, source: "Development seed", updated: "Demo data" };
// Raw Leaflet viewport over the Ferrara area (the destination).
// The destination viewport is the EXACT post-fit bounded box of the Ferrara
// suggestion (what the shared map captures right after fitBounds), not a
// rounded approximation — the landing is tied to that precise geometry.
const FERRARA_VIEW = { getSouth: () => 44.7198493, getNorth: () => 44.9637886, getWest: () => 11.5109915, getEast: () => 11.8870544, contains: () => false };

function installLandingMock({ destinationRecords, destinationDelayMs = 0 }) {
  installFetchMock((input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode")) return jsonResponse({ results: [CITY] });
    if (url.startsWith("/api/cameras")) {
      const u = new URL(url, "https://osdb.test");
      const bbox = u.searchParams.get("bbox");
      if (!bbox) return jsonResponse({ records: [], total: 0, nextOffset: null });
      const [w, s, e, n] = bbox.split(",").map(Number);
      // The Ferrara destination viewport.
      if (w >= 11 && e <= 12.1 && s >= 44.6 && n <= 45) {
        const payload = jsonResponse({ records: destinationRecords, total: destinationRecords.length, nextOffset: null });
        return destinationDelayMs > 0 ? new Promise((resolve) => setTimeout(() => resolve(payload), destinationDelayMs)) : payload;
      }
      const rows = [ROME_CAM].filter((r) => r.longitude >= w && r.longitude <= e && r.latitude >= s && r.latitude <= n);
      return jsonResponse({ records: rows, total: rows.length, nextOffset: null });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
}

test("B10: a distant place opens at most one intended popup AFTER the destination data arrives", async () => {
  installLandingMock({ destinationRecords: [FERRARA_CAM], destinationDelayMs: 250 });
  await resetLeafletMarkers();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  // Rome data is loaded and NOTHING is auto-selected (popup policy).
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Rome fixture/ })), { timeout: 3000 });
  assert.equal(screen.getByRole("button", { name: /Rome fixture/ }).getAttribute("aria-current"), null, "arriving viewport data never auto-selects");

  await pickOption(screen, user, "Ferrara", 0);
  const map = await mapOf();
  await rtl.waitFor(() => assert.equal(map.fitBoundsCalls.length, 1), { timeout: 3000 });

  // The pan lands on the Ferrara viewport: the request is still in flight.
  const leaflet = await leaves();
  leaflet.__setBounds(FERRARA_VIEW);
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  await new Promise((resolve) => setTimeout(resolve, 80));

  // BEFORE the destination data: no selection, no popup, no old-area fallback.
  assert.equal(screen.queryByRole("button", { name: /Ferrara fixture/ }), null, "no destination row before the data");
  assert.ok(!(await leafletMarkers()).some((m) => m.popupOpened), "no popup opens before the destination data settles");

  // AFTER the destination response: the first destination point is selected
  // and its popup opens — exactly one intended popup.
  await rtl.waitFor(() => {
    assert.equal(screen.getByRole("button", { name: /Ferrara fixture/ }).getAttribute("aria-current"), "true", "the destination point is selected once its data arrives");
  }, { timeout: 3000 });
  const markers = await leafletMarkers();
  assert.equal(markers.filter((m) => m.popupOpened).length, 1, "exactly one intended popup after the place-search landing");
  assert.ok(!markers.some((m) => m.opts?.title === "Rome fixture" && m.popupOpened), "the old-area record is never auto-opened");
});

test("B10: an empty destination search stays quiet and does not arm a later pan", async () => {
  installLandingMock({ destinationRecords: [] });
  await resetLeafletMarkers();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Rome fixture/ })), { timeout: 3000 });

  await pickOption(screen, user, "Ferrara", 0);
  const map = await mapOf();
  await rtl.waitFor(() => assert.equal(map.fitBoundsCalls.length, 1), { timeout: 3000 });

  const leaflet = await leaves();
  leaflet.__setBounds(FERRARA_VIEW);
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  // Let the empty destination request settle.
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.ok(!(await leafletMarkers()).some((m) => m.popupOpened), "an empty destination opens no popup");

  // A subsequent unrelated pan must remain quiet (the intent was cleared).
  leaflet.__setBounds({ getSouth: () => 41.8, getNorth: () => 42.0, getWest: () => 12.3, getEast: () => 12.7, contains: () => false });
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(screen.getByRole("button", { name: /Rome fixture/ }).getAttribute("aria-current"), null, "a later pan does not auto-select from an armed empty search");
  assert.ok(!(await leafletMarkers()).some((m) => m.popupOpened), "no popup on the later pan");
});

// ---------------------------------------------------------------------------
// R2 — a same-place repeat must not arm a later unrelated pan; rapid A->B and
// a failed destination each keep the landing tied to the REAL focus.
// ---------------------------------------------------------------------------

const ROME_ROW = { id: 1, title: "Rome fixture", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936, source: "Development seed", updated: "Demo data" };
const FERRARA_ROW = { id: 2, title: "Ferrara fixture", kind: "Fixed dome", status: "demo", latitude: 44.838, longitude: 11.619, source: "Development seed", updated: "Demo data" };
const MODENA_ROW = { id: 3, title: "Modena fixture", kind: "Fixed dome", status: "demo", latitude: 44.647, longitude: 10.925, source: "Development seed", updated: "Demo data" };
const MODENA_CITY = { display_name: "Modena, Emilia-Romagna, Italia", lat: 44.647, lng: 10.925, type: "administrative", boundingbox: ["44.55", "44.75", "10.75", "11.10"] };
const ROME_VIEW = { getSouth: () => 41.8, getNorth: () => 42.0, getWest: () => 12.3, getEast: () => 12.7, contains: () => false };
const MODENA_VIEW = { getSouth: () => 44.55, getNorth: () => 44.75, getWest: () => 10.75, getEast: () => 11.10, contains: () => false };

/**
 * B10/R2 network mock: geocode answers per query; the cameras bbox returns the
 * rows inside it, EXCEPT an optional destination rect that is forced to error.
 */
function installB10Mock({ regions, destinationError = false } = {}) {
  installFetchMock((input) => {
    const url = String(input);
    const u = new URL(url, "https://osdb.test");
    if (u.pathname === "/api/geocode") {
      const q = (u.searchParams.get("q") ?? "").toLowerCase();
      const results = q.includes("modena") ? [MODENA_CITY] : [CITY];
      return jsonResponse({ results });
    }
    if (u.pathname === "/api/cameras") {
      const bbox = u.searchParams.get("bbox");
      if (!bbox) return jsonResponse({ records: [], total: 0, nextOffset: null });
      const [w, s, e, n] = bbox.split(",").map(Number);
      if (destinationError && w >= 11 && e <= 12.1 && s >= 44.6 && n <= 45) {
        return jsonResponse({ error: "boom" }, { status: 500 });
      }
      const rows = regions.filter((r) => r.longitude >= w && r.longitude <= e && r.latitude >= s && r.latitude <= n);
      return jsonResponse({ records: rows, total: rows.length, nextOffset: null });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
}

async function mountMap({ regions, destinationError } = {}) {
  // Deterministic start: the URL may have been changed by a prior test (R3c),
  // so mount /mappa with no filters.
  await setUrlState("/mappa");
  installB10Mock({ regions: regions ?? [ROME_ROW, FERRARA_ROW, MODENA_ROW], destinationError });
  await resetLeafletMarkers();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Rome fixture/ })), { timeout: 3000 });
  const leaflet = await leaves();
  const map = await mapOf();
  return { screen, user, leaflet, map };
}

async function panTo(leaflet, map, rect) {
  leaflet.__setBounds(rect);
  // Mirror the controller probe's flush pattern: fire the map event inside act,
  // let the debounced bounds→fetch→settle round trip complete OUTSIDE act, then
  // flush once more — so the landing/settle ordering is the real one.
  await rtl.act(async () => { for (const handler of map.handlers["moveend zoomend"] ?? []) handler(); });
  await new Promise((resolve) => setTimeout(resolve, 750));
  await rtl.act(async () => {});
}

const ariaCurrent = (screen, name) => {
  const row = screen.queryByRole("button", { name });
  return row ? row.getAttribute("aria-current") : null;
};

test("R2: a same-place repeat cannot arm a later unrelated pan", async () => {
  const { screen, user, leaflet, map } = await mountMap();

  await pickAppend(screen, user, "Ferrara");
  await panTo(leaflet, map, FERRARA_VIEW);
  await rtl.waitFor(() => assert.equal(ariaCurrent(screen, /Ferrara fixture/), "true", "the destination point is selected once its data arrives"), { timeout: 3000 });

  // Repeat the IDENTICAL place (same destination geometry), then an ordinary
  // user navigation — which must stay quiet.
  await pickAppend(screen, user, "Ferrara");
  await panTo(leaflet, map, FERRARA_VIEW);
  await panTo(leaflet, map, ROME_VIEW);

  assert.equal(ariaCurrent(screen, /Rome fixture/), null, "an ordinary pan after a same-place repeat never auto-selects");
  assert.equal(map.fitBoundsCalls.length, 2, "both identical selections re-framed the place");
  assert.ok(!(await leafletMarkers()).some((m) => m.popupOpened), "no popup on the later ordinary pan");
});

test("R2: a rapid A->B selection lands on B (the superseded A does not hijack)", async () => {
  const { screen, user, leaflet, map } = await mountMap();

  // Two selections back to back, no data landing in between; the map fits B.
  await pickAppend(screen, user, "Ferrara");
  await pickAppend(screen, user, "Modena");
  await panTo(leaflet, map, MODENA_VIEW);

  await rtl.waitFor(() => assert.equal(ariaCurrent(screen, /Modena fixture/), "true", "the LAST selection is the landing"), { timeout: 3000 });
  assert.notEqual(ariaCurrent(screen, /Ferrara fixture/), "true", "the superseded A is not the landing");
});

test("R2: a FAILED destination request clears the intent (no selection, later pan quiet)", async () => {
  const { screen, user, leaflet, map } = await mountMap({ destinationError: true });

  await pickAppend(screen, user, "Ferrara");
  await panTo(leaflet, map, FERRARA_VIEW);
  // The destination request 500s: no record, no popup, and the intent is gone.
  assert.equal(ariaCurrent(screen, /Ferrara fixture/), null, "a failed destination selects nothing");
  assert.ok(!(await leafletMarkers()).some((m) => m.popupOpened), "a failed destination opens no popup");

  await panTo(leaflet, map, ROME_VIEW);
  assert.equal(ariaCurrent(screen, /Rome fixture/), null, "a later pan stays quiet after a failed search");
});

// ---------------------------------------------------------------------------
// R3b — an interrupted focus must not hand its landing to an unrelated pan
// ---------------------------------------------------------------------------

/** Pick a place AND emit the focus moveend (the controller probe's pick()). */
async function pickFocus(screen, user, map, query) {
  await pickAppend(screen, user, query);
  await rtl.act(async () => { for (const handler of map.handlers["moveend zoomend"] ?? []) handler(); });
}

test("R3b: a focus interrupted by an ordinary pan before the bounds debounce stays quiet", async () => {
  const { screen, user, leaflet, map } = await mountMap();

  await pickFocus(screen, user, map, "Ferrara"); // the focus is APPLIED (fitBounds)
  await new Promise((resolve) => setTimeout(resolve, 60));
  // The user pans away BEFORE the 500ms debounced bounds emission reports it.
  await panTo(leaflet, map, ROME_VIEW);

  assert.equal(ariaCurrent(screen, /Rome fixture/), null, "the ordinary pan must not become the destination of the interrupted focus");
  assert.ok(!(await leafletMarkers()).some((m) => m.popupOpened), "no popup from the interrupted focus");
  assert.equal(map.fitBoundsCalls.length, 1, "the focus was applied once");
});

// ---------------------------------------------------------------------------
// R3c — a same-geometry place after a FILTER change waits for the current
// filter's response; an older different-filter settlement must not consume it.
// ---------------------------------------------------------------------------

test("R3c: a same-geometry place after a filter change is selected only after the current filter's response", async () => {
  await setUrlState("/mappa?type=Fixed%20dome");
  await resetLeafletMarkers();
  const rows = [
    { id: 1, title: "Rome dome fixture", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936, source: "Development seed", updated: "Demo data" },
    { id: 2, title: "Ferrara dome fixture", kind: "Fixed dome", status: "demo", latitude: 44.838, longitude: 11.619, source: "Development seed", updated: "Demo data" },
    { id: 3, title: "Ferrara bullet fixture", kind: "Bullet", status: "demo", latitude: 44.8381, longitude: 11.6191, source: "Development seed", updated: "Demo data" },
  ];
  installFetchMock((input) => {
    const url = String(input);
    const u = new URL(url, "https://osdb.test");
    if (u.pathname === "/api/geocode") return jsonResponse({ results: [CITY] });
    if (u.searchParams.has("facets")) return jsonResponse({ records: [], facets: { kinds: [{ kind: "Bullet" }, { kind: "Fixed dome" }] } });
    if (u.pathname !== "/api/cameras") return jsonResponse({ records: [], total: 0, nextOffset: null });
    const bbox = u.searchParams.get("bbox");
    if (!bbox) return jsonResponse({ records: [], total: 0, nextOffset: null });
    const kind = u.searchParams.get("kind");
    const [w, s, e, n] = bbox.split(",").map(Number);
    const data = rows.filter((r) => (!kind || r.kind === kind) && r.longitude >= w && r.longitude <= e && r.latitude >= s && r.latitude <= n);
    const response = jsonResponse({ records: data, total: data.length, nextOffset: null });
    return kind === "Bullet" ? new Promise((resolve) => setTimeout(() => resolve(response), 1800)) : response;
  });

  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Rome dome fixture/ })), { timeout: 3000 });
  const map = await mapOf();

  await pickFocus(screen, user, map, "Ferrara");
  await rtl.waitFor(() => assert.equal(ariaCurrent(screen, /Ferrara dome fixture/), "true", "the dome destination is selected"), { timeout: 3000 });

  // Switch the server filter to Bullet and repeat the SAME place geometry.
  await rtl.act(async () => {
    const select = document.querySelector("#record-kind-filter");
    select.value = "Bullet";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pickFocus(screen, user, map, "Ferrara");

  // The Bullet row appears only when its own (delayed) response arrives, and it
  // must be selected then — never consumed early by the old dome settlement.
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Ferrara bullet fixture/ })), { timeout: 5000 });
  await rtl.act(async () => {});
  assert.equal(ariaCurrent(screen, /Ferrara bullet fixture/), "true", "selected only after the CURRENT-filter response");
});

test("R3e: an interrupted focus is cancelled and never replayed by an ordinary return pan", async () => {
  const { screen, user, leaflet, map } = await mountMap();

  // Choose the place; capture the ACTUAL focus bounds BEFORE emitting moveend
  // (the controller probe's exact sequence).
  await pickAppend(screen, user, "Ferrara");
  const box = map.getBounds();
  const targetRect = { getSouth: () => box.getSouth(), getNorth: () => box.getNorth(), getWest: () => box.getWest(), getEast: () => box.getEast(), contains: () => false };

  await rtl.act(async () => { for (const handler of map.handlers["moveend zoomend"] ?? []) handler(); });
  await new Promise((resolve) => setTimeout(resolve, 60));
  await panTo(leaflet, map, ROME_VIEW); // user cancels before the 500ms bounds emission
  await panTo(leaflet, map, targetRect); // ordinary return, NO new place choice

  assert.equal(ariaCurrent(screen, /Ferrara fixture/), null, "an interrupted focus is cancelled, never replayed by an ordinary return pan");
  assert.ok(!(await leafletMarkers()).some((m) => m.popupOpened), "no popup is replayed on the return pan");
});

// ---------------------------------------------------------------------------
// Batch C — the empty-click → report shortcut is ALWAYS visible, and a native
// Leaflet scale bar is added (zero new dependency).
// ---------------------------------------------------------------------------

test("Batch C: the empty-click hint is an always-visible paragraph OUTSIDE both the map container and the collapsed legend", async () => {
  installPlaceMock();
  await resetLeafletMarkers();
  const mapBundle = await loadDomModule("app/lib/i18n/map.mjs");
  const hint = mapBundle.en.mapClickHint;
  assert.ok(hint.trim().length > 0, "the mapClickHint key carries text");

  const { container } = await renderWithLocale(React.createElement(MappaTool));

  // 1. Real, visible DOM text rendered from the new i18n key.
  const node = rtl.screen.getByText(hint);
  assert.equal(node.tagName, "P", "the hint is a real paragraph element");
  assert.equal(node.className, "map-click-hint", "the hint uses the shared small-muted-caption class");
  assert.notEqual(window.getComputedStyle(node).display, "none", "the hint is not display:none");
  assert.equal(node.getAttribute("aria-hidden"), null, "the hint is not hidden from assistive tech");
  assert.ok(!node.classList.contains("sr-only"), "the hint is not sr-only");

  // 2. It is NOT inside the collapsed legend (today's only home for this text).
  const legend = container.querySelector(".map-legend");
  assert.ok(legend, "the legend still renders");
  assert.ok(!legend.contains(node), "the hint is NOT a descendant of .map-legend");

  // 3. It lives in normal flow OUTSIDE .live-map-workspace. That wrapper is
  //    fixed-height + overflow:hidden, so a caption inside .map-panel would
  //    be clipped; sitting next to the loading/notice paragraphs (same parent)
  //    guarantees it is never clipped, at every viewport width.
  const workspace = container.querySelector(".live-map-workspace");
  assert.ok(workspace, "the map workspace renders");
  assert.ok(!workspace.contains(node), "the hint is outside the overflow:hidden workspace");
  assert.equal(node.parentElement, workspace.parentElement, "the hint is a sibling of the workspace in the normal document flow");

  // 4. The legend is untouched: still a closed-by-default <details> keeping
  //    its own (longer) click entry.
  assert.equal(legend.tagName, "DETAILS", "the legend stays a <details>");
  assert.equal(legend.hasAttribute("open"), false, "the legend stays collapsed by default");
  assert.ok(legend.textContent.includes(mapBundle.en.mapLegendAdd), "the legend keeps its own click entry unchanged");
});

test("Batch C: createMap() adds a native Leaflet scale bar at topleft, metric only", async () => {
  installPlaceMock();
  await resetLeafletMarkers();
  await renderWithLocale(React.createElement(MappaTool));
  const map = await mapOf();

  const scale = map.__controls?.find((entry) => entry.kind === "scale");
  assert.ok(scale, "L.control.scale must be registered on the map");
  assert.equal(scale.options?.position, "topleft", "the scale bar sits in the otherwise-empty topleft corner");
  assert.equal(scale.options?.imperial, false, "metric only — no dual-unit clutter");
  assert.equal(scale.options?.maxWidth, 120, "the bar is kept compact");
  // Coexists with the existing controls (nothing replaced).
  const kinds = map.__controls.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["zoom", "geolocate", "scale"], "zoom + geolocate + scale are all registered");
});
