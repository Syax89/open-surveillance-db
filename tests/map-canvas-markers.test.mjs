/**
 * Canvas camera markers (perf, dense z>=12 views). At zoom >= GRID_MAX_ZOOM
 * the grid is off by design, so a city view can materialise 1,000+ individual
 * markers; above CANVAS_MARKER_THRESHOLD (150 = the grid's DOM budget) the
 * non-selected records draw on ONE shared L.canvas renderer as circleMarkers
 * while the selected record (and the open-popup record) stays the focusable
 * divIcon. Below the threshold every marker is still a divIcon tab stop —
 * the documented keyboard contract (docs/ACCESSIBILITY_STATEMENT.md).
 *
 * Fixtures are fictitious (illustrative coordinates).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, leafletMaps, leafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let leaflet;

const noop = () => {};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 200 records (> 150) inside a z13 city view; every 10th is a demo record.
const DENSE = Array.from({ length: 200 }, (_, i) => ({
  id: 7000 + i,
  title: `Dense ${i}`,
  kind: "bullet",
  status: i % 10 === 0 ? "demo" : "active",
  latitude: 41.85 + (i % 20) * 0.004,
  longitude: 12.45 + Math.floor(i / 20) * 0.008,
  source: "Community report",
}));
const VIEW = { getSouth: () => 41.8, getNorth: () => 42.0, getWest: () => 12.4, getEast: () => 12.6, contains: () => true };

const dotsOf = (list) => list.filter((m) => m.__isDot);
const iconsOf = (list) => list.filter((m) => typeof m.opts?.icon?.html === "string" && m.opts.icon.html.includes("osm-camera-marker"));
const idOf = (m) => Number(String(m.opts?.title ?? m.tooltipHtml ?? "").match(/Dense (\d+)/)?.[1]) + 7000;

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(async () => {
  rtl?.cleanup();
  await resetLeafletMarkers();
});

function element(props) {
  return React.createElement(SurveillanceMap, {
    selectedId: null, onSelect: noop, onPick: noop, directoryHref: "#records", onBoundsChange: noop, cameras: DENSE, ...props,
  });
}

async function renderDense(props = {}) {
  leaflet.__setBounds(VIEW);
  const view = await renderWithLocale(element(props));
  // The first render also pays the lazy leaflet import: wait for the
  // reconcile to materialise the markers instead of a fixed sleep.
  const expected = (props.cameras ?? DENSE).length;
  for (let waited = 0; waited < 3000 && (await leafletMarkers()).length < expected; waited += 20) await pause(20);
  await pause(30);
  return view;
}

test("a dense z13 view draws the individual markers as circleMarkers on ONE shared canvas renderer", async () => {
  await renderDense();
  const markers = await leafletMarkers();
  const dots = dotsOf(markers);
  assert.equal(dots.length, 200, "every record is a canvas marker");
  assert.equal(iconsOf(markers).length, 0, "no divIcon DOM marker without a selection");
  const renderer = leaflet.__renderers.at(-1);
  assert.ok(renderer?.__isCanvas, "an L.canvas renderer was created");
  assert.equal(renderer.options.padding, 0.5);
  assert.ok(dots.every((d) => d.opts.renderer === renderer), "all dots share the same renderer");
  assert.ok(dots.every((d) => d.opts.interactive === true && d.opts.bubblingMouseEvents === false), "interactive, non-bubbling");
  const map = (await leafletMaps())[0];
  const pane = map.panes[renderer.options.pane];
  assert.ok(pane, "the canvas lives in its own pane");
  assert.equal(pane.style.zIndex, "450", "between the FOV overlay (400) and the divIcon markers (600)");
  assert.equal(pane.attrs["aria-hidden"], "true", "the decorative canvas is hidden from assistive tech");
});

test("canvas markers match .osm-camera-marker per public status (whitelist applied)", async () => {
  const cameras = DENSE.map((camera, i) => (i === 1 ? { ...camera, status: "pending" } : camera));
  await renderDense({ cameras });
  const dots = dotsOf(await leafletMarkers());
  const byId = new Map(dots.map((d) => [idOf(d), d]));
  const active = byId.get(7001 + 1); // i=2 → active
  const demo = byId.get(7000); // i=0 → demo
  const pending = byId.get(7001); // i=1 → non-public
  for (const dot of [active, demo, pending]) {
    assert.equal(dot.opts.radius, 11, "25px marker: stroke centred at r=11 with a 3px ring");
    assert.equal(dot.opts.weight, 3);
    assert.equal(dot.opts.color, "#ffffff", "white ring like border:3px solid white");
    assert.equal(dot.opts.fillOpacity, 1);
  }
  assert.equal(active.opts.fillColor, "rgb(26 124 96)", "active → --marker");
  assert.equal(demo.opts.fillColor, "rgb(97 119 172)", "demo → --status-demo");
  assert.equal(pending.opts.fillColor, active.opts.fillColor, "a non-public status never picks a status colour");
});

test("the SELECTED record stays a focusable divIcon with the selected class", async () => {
  await renderDense({ selectedId: 7005 });
  const markers = await leafletMarkers();
  const icons = iconsOf(markers);
  assert.equal(icons.length, 1, "exactly one divIcon: the selection");
  assert.match(icons[0].opts.icon.html, /osm-camera-marker active selected/);
  assert.equal(icons[0].opts.title, "Dense 5");
  assert.ok(icons[0].handlers.keydown?.length, "Enter/Space handler kept");
  assert.equal(dotsOf(markers).length, 199);
  assert.ok(!dotsOf(markers).some((d) => idOf(d) === 7005), "no duplicate dot for the selection");
});

test("clicking a canvas marker selects it, promotes it to a divIcon and opens the LAZY popup", async () => {
  const selected = [];
  const built = [];
  const popupHtmlFor = (camera) => { built.push(camera.id); return `<div class="osm-popup"><h3>${camera.title}</h3><div class="osm-popup-community" data-record-id="${camera.id}"></div></div>`; };
  await renderDense({ onSelect: (id) => selected.push(id), popupHtmlFor });
  const map = (await leafletMaps())[0];
  const dot = dotsOf(await leafletMarkers()).find((d) => idOf(d) === 7012);
  assert.equal(built.length, 0, "no popup HTML built for canvas markers");
  const evt = { originalEvent: {} };
  dot.handlers.click[0](evt);
  assert.equal(evt.__stopped, true, "the click never reaches the map picker");
  assert.ok(!map.popupHtml, "no coordinate picker");
  assert.deepEqual(selected, [7012]);
  const markers = await leafletMarkers();
  assert.ok(!markers.includes(dot), "the dot was replaced");
  const icon = iconsOf(markers).find((m) => m.opts.title === "Dense 12");
  assert.ok(icon, "the clicked record is now a divIcon");
  assert.match(icon.opts.icon.html, /selected/);
  assert.equal(icon.isPopupOpen(), true, "its popup is open");
  assert.equal(typeof icon.popupContent, "function", "bound with the lazy content function");
  assert.deepEqual(built, [7012], "only the opened record's popup is built");
  assert.equal(map.events.popupopen?.length, 1, "exactly one popupopen");
});

test("selection from the list swaps dot ↔ divIcon (previous selection back to the canvas)", async () => {
  const view = await renderDense({ selectedId: 7003 });
  await view.rerender(await wrapWithLocale(element({ selectedId: 7004 })));
  await pause(30);
  const markers = await leafletMarkers();
  const icons = iconsOf(markers);
  assert.equal(icons.length, 1);
  assert.equal(icons[0].opts.title, "Dense 4");
  assert.equal(icons[0].isPopupOpen(), true, "the selection effect opens the new selection's popup");
  assert.ok(dotsOf(markers).some((d) => idOf(d) === 7003), "the previous selection is a canvas marker again");
  assert.equal(markers.length, 200, "no duplicates");
});

test("a refetch of unchanged records does not recreate or restyle canvas markers", async () => {
  const view = await renderDense();
  const before = dotsOf(await leafletMarkers());
  await view.rerender(await wrapWithLocale(element({ cameras: [...DENSE] })));
  await pause(30);
  const after = dotsOf(await leafletMarkers());
  assert.equal(after.length, 200);
  assert.ok(after.every((d, i) => d === before[i]), "same canvas marker objects (stable identity)");
  assert.ok(after.every((d) => d.styleSets === 0), "no restyle");
  // A changed status restyles only that marker, in place.
  const changed = DENSE.map((camera) => (camera.id === 7002 ? { ...camera, status: "demo" } : camera));
  await view.rerender(await wrapWithLocale(element({ cameras: changed })));
  await pause(30);
  const restyled = dotsOf(await leafletMarkers()).filter((d) => d.styleSets > 0);
  assert.equal(restyled.length, 1);
  assert.equal(restyled[0].opts.fillColor, "rgb(97 119 172)");
});

test("canvas marker tooltips escape the user-supplied title and kind", async () => {
  const hostile = DENSE.map((camera, i) => (i === 7 ? { ...camera, title: "<img src=x onerror=alert(1)>", kind: "<b>bold</b>" } : camera));
  await renderDense({ cameras: hostile });
  const dot = dotsOf(await leafletMarkers()).find((d) => String(d.tooltipHtml).includes("onerror"));
  assert.ok(dot, "the hostile record has a tooltip");
  assert.ok(!dot.tooltipHtml.includes("<img") && !dot.tooltipHtml.includes("<b>"));
  assert.match(dot.tooltipHtml, /&lt;img src=x onerror=alert\(1\)&gt;<br\/><small>&lt;b&gt;bold&lt;\/b&gt;<\/small>/);
});

test("at or below the threshold every marker stays a focusable divIcon (keyboard contract)", async () => {
  await renderDense({ cameras: DENSE.slice(0, 150) });
  const markers = await leafletMarkers();
  assert.equal(dotsOf(markers).length, 0);
  assert.equal(iconsOf(markers).length, 150);
  assert.ok(iconsOf(markers).every((m) => m.handlers.keydown?.length), "each divIcon has its Enter/Space handler");
});
