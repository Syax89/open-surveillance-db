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
 *      (role="region" + localized label), Leaflet mounts in an effect.
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

test("mini map renders an interactive Leaflet map with the marker at the record position (zoom 17)", async () => {
  await renderMiniMap({});
  const maps = await leafletMaps();
  assert.ok(maps.length >= 1, "a Leaflet map is created");
  const map = maps.at(-1);
  assert.equal(map.opts.zoomControl, true, "the zoom control is available on the mini map");
  assert.deepEqual(map.views.at(-1)?.center, [41.9028, 12.4964], "the map centres on the record position");
  assert.equal(map.views.at(-1)?.zoom, 17, "initial zoom 17 (above FOV_MIN_ZOOM so the cone is legible)");
  const markers = await leafletMarkers();
  assert.ok(markers.some((m) => m.latlng?.[0] === 41.9028 && m.latlng?.[1] === 12.4964), "the record marker is placed at the coordinates");
});

test("the marker uses the custom divIcon (osm-camera-marker), never Leaflet's unshipped default PNG", async () => {
  await renderMiniMap({ status: "active" });
  const markers = await leafletMarkers();
  const m = markers.find((mk) => mk.latlng?.[0] === 41.9028 && mk.latlng?.[1] === 12.4964);
  assert.ok(m, "the record marker exists");
  const icon = m.opts?.icon;
  assert.ok(icon, "the marker carries an explicit icon option");
  const html = String(icon.html ?? "");
  assert.match(html, /osm-camera-marker/, "the icon is the custom divIcon, not the default PNG (404 in the Workers build)");
  assert.match(html, /active/, "the public status class is applied to the marker (same colouring as /mappa)");
  assert.ok(!html.includes("marker-icon.png"), "never references Leaflet's default PNG icon");
});

test("mini map is interactive: pan/zoom enabled, tiles served by the CSP-safe /api/tiles proxy", async () => {
  const { screen } = rtl;
  await renderMiniMap({});
  const img = screen.getByRole("region", { name: "Position on the map" });
  assert.ok(img, "the container exposes the localized position label");
  const maps = await leafletMaps();
  const map = maps.at(-1);
  // CEO follow-up (2026-08-07): the user wants to pan/zoom the mini map —
  // dragging must be enabled (option absent → Leaflet default true) and
  // the zoom control present.
  assert.equal(map.opts.zoomControl, true, "zoom control is enabled on the interactive mini map");
  assert.equal(map.opts.dragging, undefined, "dragging stays on the Leaflet default (user can pan)");
  assert.equal(map.opts.scrollWheelZoom, undefined, "scroll zoom stays on the Leaflet default");
  // Tiles MUST come from the /api/tiles proxy: the record page CSP is
  // img-src 'self', a direct tile.openstreetmap hotlink renders an empty
  // grey map (reproduced live 2026-08-07).
  const tiles = map.tileLayers ?? [];
  assert.ok(tiles.some((u) => String(u).includes("/api/tiles/")), "the mini map uses the CSP-safe tile proxy, not a direct hotlink");
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

// ── Lazy Leaflet (perf): the mini map sits below the facts list, so Leaflet
// is imported only once the container nears the viewport. jsdom has no
// IntersectionObserver, so the tests above exercise the immediate-load
// fallback; the tests below install this minimal controllable stub.
class StubIntersectionObserver {
  static instances = [];
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = [];
    this.disconnected = false;
    StubIntersectionObserver.instances.push(this);
  }
  observe(target) { this.targets.push(target); }
  unobserve(target) { this.targets = this.targets.filter((t) => t !== target); }
  disconnect() { this.disconnected = true; this.targets = []; }
  takeRecords() { return []; }
  trigger(isIntersecting = true) {
    const entries = this.targets.map((target) => ({ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }));
    rtl.act(() => { this.callback(entries, this); });
  }
}

function withIntersectionObserver(fn) {
  return async () => {
    StubIntersectionObserver.instances = [];
    globalThis.IntersectionObserver = StubIntersectionObserver;
    window.IntersectionObserver = StubIntersectionObserver;
    try {
      await fn();
    } finally {
      delete globalThis.IntersectionObserver;
      delete window.IntersectionObserver;
    }
  };
}

const baseProps = {
  latitude: 41.9028, longitude: 12.4964, kind: "Traffic monitoring", direction: 90, title: "Via Roma corner",
};

// Give a (wrongly) eager dynamic import time to resolve before asserting absence.
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test("lazy: no Leaflet map is created before the container nears the viewport", withIntersectionObserver(async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(RecordMiniMap, baseProps));
  await settle();
  assert.equal((await leafletMaps()).length, 0, "Leaflet is not mounted before intersection");
  const io = StubIntersectionObserver.instances.at(-1);
  assert.ok(io, "an IntersectionObserver watches the container");
  assert.equal(io.options?.rootMargin, "200px", "a generous rootMargin starts loading before the map is visible");
  const region = screen.getByRole("region", { name: "Position on the map" });
  assert.ok(io.targets.includes(region), "the observed element is the labelled map region");
}));

test("lazy: after intersection the map mounts at zoom 17 with the marker, and the observer disconnects", withIntersectionObserver(async () => {
  await renderWithLocale(React.createElement(RecordMiniMap, baseProps));
  const io = StubIntersectionObserver.instances.at(-1);
  io.trigger(false);
  await settle();
  assert.equal((await leafletMaps()).length, 0, "a non-intersecting entry does not load Leaflet");
  io.trigger(true);
  await rtl.waitFor(async () => {
    assert.ok((await leafletMaps()).length >= 1, "a Leaflet map is created after intersection");
  }, { timeout: 3000 });
  const map = (await leafletMaps()).at(-1);
  assert.equal(map.views.at(-1)?.zoom, 17, "initial zoom 17");
  assert.deepEqual(map.views.at(-1)?.center, [41.9028, 12.4964], "centred on the record position");
  const markers = await leafletMarkers();
  assert.ok(markers.some((m) => m.latlng?.[0] === 41.9028 && m.latlng?.[1] === 12.4964), "the record marker is placed");
  assert.equal(io.disconnected, true, "the observer is disconnected after the first intersection");
}));

test("lazy: without IntersectionObserver the map loads immediately", async () => {
  assert.equal(typeof globalThis.IntersectionObserver, "undefined", "precondition: jsdom has no IntersectionObserver");
  await renderWithLocale(React.createElement(RecordMiniMap, baseProps));
  await rtl.waitFor(async () => {
    assert.ok((await leafletMaps()).length >= 1, "the map mounts without waiting for intersection");
  }, { timeout: 3000 });
});

test("lazy: unmount before intersection disconnects the observer and never creates a map", withIntersectionObserver(async () => {
  const view = await renderWithLocale(React.createElement(RecordMiniMap, baseProps));
  const io = StubIntersectionObserver.instances.at(-1);
  assert.ok(io, "an IntersectionObserver watches the container");
  view.unmount();
  assert.equal(io.disconnected, true, "the observer is disconnected on unmount");
  await settle();
  assert.equal((await leafletMaps()).length, 0, "no Leaflet map is created after unmount");
}));
