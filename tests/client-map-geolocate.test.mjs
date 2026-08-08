/**
 * Client-side tests for the map geolocation button (t_18259daa, CEO: "sulla
 * /mappa vorrei un piccolo tasto flottante sopra i tasti aumenta/diminuisci
 * zoom per attivare la geolocalizzazione e mostrare sulla mappa la posizione
 * dell'utente").
 *
 * Contracts under test:
 *   1. a custom Leaflet control is added BEFORE the zoom control, so it
 *      stacks ABOVE the zoom buttons (same bottomright corner);
 *   2. click → navigator.geolocation.getCurrentPosition → pan/zoom (zoom
 *      ≥15) + a precision dot + accuracy circle, aria-pressed=true;
 *      click again → layer removed (toggle), aria-pressed=false;
 *   3. permission denied / error → discreet inline toast (role=status), no
 *      crash, button stays off;
 *   4. geolocation unsupported → the button is hidden (fallback);
 *   5. the button click NEVER reaches the map handler (stopPropagation).
 *
 * Fixtures are fictitious (illustrative coordinates in Rome, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale,
  resetLeafletMarkers, leafletMaps, leafletPaths, leafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
// Geolocation stub control (mirrors the browser API surface the component
// uses): each test registers its own success/error callback.
let geoCallbacks;

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  // jsdom has no geolocation by default — define the stub BEFORE rendering
  // so the button is created visible ("geolocation" in navigator → true).
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success, error, options) => {
        geoCallbacks = { success, error, options };
      },
    },
  });
});

afterEach(() => {
  rtl?.cleanup();
  resetLeafletMarkers();
  geoCallbacks = undefined;
});

async function renderMap() {
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  // The leaflet module is imported lazily inside createMap; wait for the
  // stub map + controls to exist.
  await new Promise((resolve) => setTimeout(resolve, 30));
  return view;
}

function geolocateButton(maps) {
  const mapStub = maps[0];
  const control = mapStub.__controls?.find((entry) => entry.kind === "geolocate");
  assert.ok(control, "the geolocate custom control must be registered on the map");
  const button = control.container?.querySelector(".osm-geolocate-btn");
  assert.ok(button, "the control container must hold the geolocate button");
  return { mapStub, control, button };
}

test("geolocate button stacks ABOVE the zoom control (added last, same corner)", async () => {
  await renderMap();
  const maps = await leafletMaps();
  const kinds = maps[0].__controls?.map((entry) => entry.kind) ?? [];
  // Leaflet renders bottom-corner controls with `flex-direction:
  // column-reverse`, so the LAST control added appears on TOP. The zoom
  // control is added first, then the geolocate control — the geolocate
  // button therefore renders ABOVE the zoom buttons.
  assert.deepEqual(kinds, ["zoom", "geolocate"]);
  const { button } = geolocateButton(maps);
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(button.getAttribute("aria-label"), "Show my location");
  assert.ok(button.querySelector("svg"), "the button carries a decorative icon");
});

test("click asks geolocation, pans/zooms to the position and draws dot + accuracy circle", async () => {
  const view = await renderMap();
  const maps = await leafletMaps();
  const { button } = geolocateButton(maps);

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(geoCallbacks, "click must call navigator.geolocation.getCurrentPosition");
  assert.equal(geoCallbacks.options.enableHighAccuracy, true);

  geoCallbacks.success({ coords: { latitude: 41.9028, longitude: 12.4964, accuracy: 25 } });
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Pan/zoom: setView to the position at zoom >= 15.
  const lastView = maps[0].views.at(-1);
  assert.ok(lastView, "the map must pan to the user position");
  assert.deepEqual(lastView.center, [41.9028, 12.4964]);
  assert.ok(lastView.zoom >= 15, `zoom must be >= 15 (got ${lastView.zoom})`);

  // Precision dot (marker) + accuracy circle (path with the accuracy radius).
  const paths = await leafletPaths();
  const circle = paths.find((item) => item.__isPath && item.opts?.radius !== undefined);
  assert.ok(circle, "an accuracy circle must be drawn");
  assert.equal(circle.opts.radius, 25);
  assert.deepEqual(circle.latlng, [41.9028, 12.4964]);
  const markers = await leafletMarkers();
  const dot = markers.find((item) => item.opts?.icon?.html?.includes("osm-user-dot"));
  assert.ok(dot, "the user-location dot marker must be drawn");

  // Active state.
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(view.container.querySelector(".map-geo-notice"), null, "no error toast on success");
});

test("second click toggles OFF: layer cleared, aria-pressed=false, no new geolocation call", async () => {
  await renderMap();
  const maps = await leafletMaps();
  const { button } = geolocateButton(maps);

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const firstCallbacks = geoCallbacks;
  assert.ok(firstCallbacks, "first click requests the position");
  firstCallbacks.success({ coords: { latitude: 41.9028, longitude: 12.4964, accuracy: 25 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(button.getAttribute("aria-pressed"), "true");

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(geoCallbacks, firstCallbacks, "toggling OFF must not ask geolocation again");
  const paths = await leafletPaths();
  const markers = await leafletMarkers();
  assert.equal(paths.filter((item) => item.opts?.radius !== undefined).length, 0, "accuracy circle removed");
  assert.equal(markers.filter((item) => item.opts?.icon?.html?.includes("osm-user-dot")).length, 0, "dot marker removed");
});

test("permission denied shows a discreet toast, no crash, button stays off", async () => {
  const view = await renderMap();
  const maps = await leafletMaps();
  const { button } = geolocateButton(maps);

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  geoCallbacks.error({ code: 1, PERMISSION_DENIED: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const notice = view.container.querySelector(".map-geo-notice");
  assert.ok(notice, "an inline toast must appear");
  assert.equal(notice.getAttribute("role"), "status");
  assert.match(notice.textContent, /Location access was denied/i);
  assert.equal(button.getAttribute("aria-pressed"), "false");
  const paths = await leafletPaths();
  const markers = await leafletMarkers();
  assert.equal(paths.length, 0, "no accuracy circle on error");
  assert.equal(markers.length, 0, "no dot marker on error");
});

test("generic geolocation error (timeout/unavailable) shows the generic toast", async () => {
  const view = await renderMap();
  const maps = await leafletMaps();
  const { button } = geolocateButton(maps);

  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  geoCallbacks.error({ code: 3, PERMISSION_DENIED: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const notice = view.container.querySelector(".map-geo-notice");
  assert.ok(notice);
  assert.match(notice.textContent, /Unable to determine your location/i);
});

test("geolocation unsupported → the button is hidden (fallback, no crash)", async () => {
  // Remove the stub so `"geolocation" in navigator` is false at creation.
  delete navigator.geolocation;
  try {
    await renderMap();
    const maps = await leafletMaps();
    const { button } = geolocateButton(maps);
    assert.equal(button.hidden, true, "the button must be hidden when geolocation is unavailable");
  } finally {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success, error, options) => {
          geoCallbacks = { success, error, options };
        },
      },
    });
  }
});

test("button click never reaches the map handler (no coordinate picker)", async () => {
  await renderMap();
  const maps = await leafletMaps();
  const { mapStub, button } = geolocateButton(maps);

  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  button.dispatchEvent(click);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // stopPropagation was called (stub records __stopped) and the map-level
  // click handler (coordinate picker) never fired.
  assert.equal(click.__stopped, true, "the button click must stop propagation");
  assert.equal(mapStub.popupHtml, undefined, "no coordinate-picker popup from a button click");
});
