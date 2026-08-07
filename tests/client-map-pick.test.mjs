/**
 * Client-side tests for map and report-coordinate boundaries. Clicking an
 * empty map position opens the report shortcut with that coordinate, while
 * the report route keeps accepting explicit coordinate deep links.
 *
 *   1. the map click opens the coordinate-picker shortcut;
 *   2. /segnala with ?lat=&lng= pre-fills the form (SegnalaTool with
 *      initialCoordinates): coordinate readout, manual fields, and the
 *      nearby-duplicate check runs on mount;
 *   3. parseReportCoordinates: valid deep links parse, absent/out-of-range
 *      values degrade to a plain empty form (no clamped position).
 *
 * Fixtures are fictitious (illustrative coordinates in Rome, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, leafletMaps, leafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let SegnalaTool;
let parseReportCoordinates;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  const mapMod = await loadDomModule("app/components/SurveillanceMap.mjs");
  SurveillanceMap = mapMod.SurveillanceMap;
  SegnalaTool = (await loadDomModule("app/components/tools/SegnalaTool.mjs")).SegnalaTool;
  parseReportCoordinates = (await loadDomModule("app/lib/report-coordinates.mjs")).parseReportCoordinates;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
  // Default fetch mock: empty public list (prototype seed keeps rendering).
  // P1-2 (Vera design): SegnalaTool is gated by WriteGateWall, which checks
  // /api/auth/me on mount — the default mock answers a VERIFIED contributor
  // so the /segnala deep-link tests exercise the form, not the wall.
  installFetchMock((input) => {
    if (String(input) === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1,
          email: "contributor@example.test",
          displayName: "Fixture Contributor",
          emailVerifiedAt: "2026-01-15T10:00:00.000Z",
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
      });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  resetLeafletMarkers();
});

// ---------------------------------------------------------------------------
// /mappa — exploration only
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

test("map click opens a coordinate-picker shortcut with a report link", async () => {
  await renderMapWithCameras();
  const maps = await leafletMaps();
  assert.ok(maps.length >= 1, "the leaflet stub must record the created map");
  const clickHandler = maps[0].handlers.click?.[0];
  assert.ok(clickHandler, "the map registers the coordinate-picker listener");
  clickHandler({ latlng: { lat: 41.9004, lng: 12.4936 } });
  assert.equal(maps[0].popupLatLng.lat, 41.9004);
  assert.equal(maps[0].popupLatLng.lng, 12.4936);
  assert.match(maps[0].popupHtml, /New report/);
  assert.match(maps[0].popupHtml, /41\.90040, 12\.49360/);
  assert.match(maps[0].popupHtml, /href="\/segnala\?lat=41\.90040&lng=12\.49360"/);
});

// Mobile balloon (CEO 2026-08-07): on phones the popup shrinks to 260px so
// it does not swallow the map; desktop keeps 300px. Leaflet sets the width
// inline from this option, so the maxWidth is the contract to assert.
test("marker and picker popups use a 260px maxWidth on phone viewports (300px desktop)", async () => {
  const realInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const setWidth = (value) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => value });
  };
  const { after } = await import("node:test");
  after(() => {
    if (realInnerWidth?.get) Object.defineProperty(window, "innerWidth", realInnerWidth);
    else delete window.innerWidth;
  });

  // Phone viewport: marker + picker popups must both cap at 260px.
  setWidth(390);
  const CAMERAS = [
    { id: 1, title: "Via Roma corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, source: "Community report" },
    { id: 2, title: "Piazza Venezia", kind: "dome", status: "active", latitude: 41.8958, longitude: 12.4823, source: "Community report" },
  ];
  await renderMapWithCameras(CAMERAS);
  const maps = await leafletMaps();
  const clickHandler = maps[0].handlers.click?.[0];
  clickHandler({ latlng: { lat: 41.9004, lng: 12.4936 } });
  assert.equal(maps[0].popupOpts?.maxWidth, 260, "the picker popup shrinks to 260px on a 390px viewport");
  const markerList = await leafletMarkers();
  const withPopup = markerList.find((m) => m.popupOpts);
  assert.ok(withPopup, "markers carry their bindPopup options in the stub");
  assert.equal(withPopup.popupOpts.maxWidth, 260, "the marker popup shrinks to 260px on a phone");

  // Desktop viewport: unchanged 300px.
  setWidth(1440);
  await renderMapWithCameras();
  const mapsDesktop = await leafletMaps();
  const clickDesktop = mapsDesktop.at(-1).handlers.click?.[0];
  clickDesktop({ latlng: { lat: 41.9, lng: 12.49 } });
  assert.equal(mapsDesktop.at(-1).popupOpts?.maxWidth, 300, "desktop keeps the 300px popup width");
});

// ---------------------------------------------------------------------------
// /segnala — ?lat=&lng= pre-fill
// ---------------------------------------------------------------------------

test("/segnala deep link pre-fills the form and runs the nearby check on mount", async () => {
  const nearbyCalls = [];
  installFetchMock((input) => {
    // P1-2: the WriteGateWall gates the form on /api/auth/me — answer a
    // verified contributor so the deep-link prefill is exercised.
    if (String(input) === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1,
          email: "contributor@example.test",
          displayName: "Fixture Contributor",
          emailVerifiedAt: "2026-01-15T10:00:00.000Z",
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
      });
    }
    if (typeof input === "string" && input.startsWith("/api/cameras/nearby?")) {
      nearbyCalls.push(input);
      return jsonResponse({ records: [] });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });

  const { screen } = rtl;
  await renderWithLocale(React.createElement(SegnalaTool, {
    initialCoordinates: { latitude: 41.9004, longitude: 12.4936 },
  }));

  // The coordinate readout appears with the deep-linked position.
  assert.ok(await screen.findByText("Selected point"));
  assert.ok(screen.getByText("41.90040, 12.49360"));

  // The manual coordinate fields are pre-filled (same 5-decimal precision).
  const latInput = screen.getByLabelText("Latitude");
  const lngInput = screen.getByLabelText("Longitude");
  assert.equal(latInput.value, "41.90040");
  assert.equal(lngInput.value, "12.49360");

  // The nearby-duplicate check runs once on mount (URL deep link).
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(nearbyCalls.length, 1, "the nearby check must run once on mount");
  const url = new URL(nearbyCalls[0], "https://osdb.test");
  assert.equal(url.pathname, "/api/cameras/nearby");
  assert.equal(url.searchParams.get("latitude"), "41.9004");
  assert.equal(url.searchParams.get("longitude"), "12.4936");
});

test("/segnala without a deep link renders the plain empty form", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(SegnalaTool, {}));

  // P1-2: wait for the verified-session gate before asserting the form.
  await screen.findByLabelText("Latitude");
  assert.equal(screen.queryByText("Selected point"), null, "no readout without coordinates");
  const latInput = screen.getByLabelText("Latitude");
  const lngInput = screen.getByLabelText("Longitude");
  assert.equal(latInput.value, "");
  assert.equal(lngInput.value, "");
});

// ---------------------------------------------------------------------------
// parseReportCoordinates — URL validation (pure)
// ---------------------------------------------------------------------------

test("parseReportCoordinates: valid deep links parse to coordinates", () => {
  assert.deepEqual(
    parseReportCoordinates(new URLSearchParams("lat=41.9004&lng=12.4936")),
    { latitude: 41.9004, longitude: 12.4936 },
  );
  assert.deepEqual(
    parseReportCoordinates(new URLSearchParams("lat=-45.5&lng=9.1")),
    { latitude: -45.5, longitude: 9.1 },
  );
});

test("parseReportCoordinates: absent, partial or out-of-range values degrade to null", () => {
  // No deep link at all → plain form.
  assert.equal(parseReportCoordinates(new URLSearchParams("")), null);
  // Only one coordinate present → cannot place a point.
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=41.9")), null);
  assert.equal(parseReportCoordinates(new URLSearchParams("lng=12.49")), null);
  // Out of decimal-degrees range → ignored, never clamped.
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=91&lng=12.49")), null);
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=-91&lng=12.49")), null);
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=41.9&lng=181")), null);
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=41.9&lng=-181")), null);
  // Non-numeric → ignored.
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=abc&lng=12.49")), null);
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=41.9&lng=")), null);
  // NaN-producing values (e.g. empty) → ignored.
  assert.equal(parseReportCoordinates(new URLSearchParams("lat=&lng=")), null);
});
