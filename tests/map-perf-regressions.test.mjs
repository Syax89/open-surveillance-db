/**
 * Map performance regressions (profiling pass on a prod build, 6.3k cameras,
 * phone CPU 4x). Each test locks one measured fix:
 *
 *   (a) the INITIAL view zoom (?zoom= deep link / initialView) drives the
 *       grid-vs-individual decision and the field-of-view layer on the FIRST
 *       render — before the fix mapZoom stayed at 13 until the first
 *       moveend, so a z6 deep link drew thousands of individual divIcons and
 *       a z17 deep link showed no FOV cones until the first pan;
 *   (b) a refetch that returns UNCHANGED records keeps the record object
 *       identities (mergeRecords), so the marker reconcile skips every kept
 *       marker — no setIcon / setPopupContent / setTooltipContent churn;
 *   (c) popup HTML is built lazily: binding a marker never calls
 *       popupHtmlFor; opening the popup does (and the a11y dialog labelling
 *       still reads the built content).
 *
 * Fixtures are fictitious (illustrative coordinates).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, leafletMaps, leafletMarkers, leafletPaths, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let __setBounds;
let mergeRecords;

const noop = () => {};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 200 records (> MAX_INDIVIDUAL_MARKERS=150) spread over ~0.8° around Rome.
const DENSE = Array.from({ length: 200 }, (_, i) => ({
  id: 5000 + i,
  title: `Dense ${i}`,
  kind: "bullet",
  status: "active",
  latitude: 41.6 + (i % 20) * 0.04,
  longitude: 12.1 + Math.floor(i / 20) * 0.08,
  direction: 90,
}));
const DENSE_VIEW = { getSouth: () => 41.5, getNorth: () => 42.5, getWest: () => 12.0, getEast: () => 13.0, contains: () => true };

// A street-level view with three directional cameras.
const STREET = [
  { id: 1, title: "Via Roma corner", kind: "bullet", status: "active", latitude: 41.9028, longitude: 12.4964, direction: 45, source: "Community report", updated: "2026-01-01" },
  { id: 2, title: "Piazza Venezia", kind: "Fixed dome", status: "active", latitude: 41.9030, longitude: 12.4966, source: "Community report", updated: "2026-01-01" },
  { id: 3, title: "Via del Corso", kind: "bullet", status: "active", latitude: 41.9026, longitude: 12.4962, direction: 180, source: "Community report", updated: "2026-01-01", usefulCount: 2 },
];
const STREET_VIEW = { getSouth: () => 41.90, getNorth: () => 41.905, getWest: () => 12.49, getEast: () => 12.50, contains: () => true };

const badgesOf = (list) => list.filter((m) => m.opts?.icon?.className === "osm-grid-badge-wrap");
const individualsOf = (list) => list.filter((m) => typeof m.opts?.icon?.html === "string" && m.opts.icon.html.includes("osm-camera-marker"));

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  __setBounds = (await loadDomModule("node_modules/leaflet/index.mjs")).__setBounds;
  mergeRecords = (await loadDomModule("app/lib/use-viewport-cameras.mjs")).mergeRecords;
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(async () => {
  rtl?.cleanup();
  await resetLeafletMarkers();
});

function element(props) {
  return React.createElement(SurveillanceMap, {
    selectedId: null, onSelect: noop, onPick: noop, directoryHref: "#records", onBoundsChange: noop, ...props,
  });
}

test("(a) an initialView at zoom 6 aggregates into grid badges on the FIRST render (no moveend)", async () => {
  __setBounds(DENSE_VIEW);
  await renderWithLocale(element({ cameras: DENSE, initialView: { lat: 42, lng: 12.5, zoom: 6 } }));
  await pause(60);
  const map = (await leafletMaps())[0];
  assert.equal(map.views[0].zoom, 6, "the deep-link zoom is the first setView");
  const markers = await leafletMarkers();
  assert.ok(badgesOf(markers).length >= 1, "the z6 view is aggregated into grid badges");
  assert.equal(individualsOf(markers).length, 0, `no individual divIcon markers at z6 (got ${individualsOf(markers).length})`);
});

test("(a) an initialView at zoom 17 draws the field-of-view cones on the FIRST render (no moveend)", async () => {
  __setBounds(STREET_VIEW);
  await renderWithLocale(element({ cameras: STREET, initialView: { lat: 41.9028, lng: 12.4964, zoom: 17 } }));
  await pause(60);
  const paths = await leafletPaths();
  assert.equal(paths.length, 3, "two cones + one dome circle drawn at the initial z17");
});

test("(b) a refetch of unchanged records keeps identity and does not touch kept markers", async () => {
  __setBounds(STREET_VIEW);
  const first = mergeRecords([], STREET.map((record) => ({ ...record })));
  let builds = 0;
  const popupHtmlFor = (camera) => { builds += 1; return `<div class="osm-popup"><h3>${camera.title}</h3></div>`; };
  const view = await renderWithLocale(element({ cameras: first, popupHtmlFor }));
  await pause(60);
  const markers = individualsOf(await leafletMarkers());
  assert.equal(markers.length, 3);
  const calls = { setIcon: 0, setPopupContent: 0, setTooltipContent: 0 };
  for (const marker of markers) {
    for (const name of Object.keys(calls)) {
      const original = marker[name];
      marker[name] = (...args) => { calls[name] += 1; return original(...args); };
    }
  }
  // The refetch parses FRESH objects with identical content.
  const second = mergeRecords(first, STREET.map((record) => ({ ...record })));
  assert.equal(second, first, "nothing changed: the previous store array is returned");
  second.forEach((record, index) => assert.equal(record, first[index], "record identity kept"));
  await view.rerender(await wrapWithLocale(element({ cameras: second, popupHtmlFor })));
  await pause(30);
  assert.deepEqual(calls, { setIcon: 0, setPopupContent: 0, setTooltipContent: 0 }, "no kept marker was rebuilt");

  // A REAL change still flows: the changed record is replaced (new identity),
  // the others keep theirs, and only its marker is refreshed.
  const third = mergeRecords(second, STREET.map((record) => (record.id === 3 ? { ...record, status: "verified", usefulCount: 5 } : { ...record })));
  assert.notEqual(third, second, "a changed record produces a new store array");
  assert.equal(third[0], second[0]);
  assert.equal(third[1], second[1]);
  assert.notEqual(third[2], second[2]);
  assert.equal(third[2].usefulCount, 5);
  await view.rerender(await wrapWithLocale(element({ cameras: third, popupHtmlFor })));
  await pause(30);
  assert.equal(calls.setIcon, 1, "only the changed marker's icon is rebuilt");
  assert.equal(calls.setPopupContent, 0, "a CLOSED popup is not rebuilt (lazy content)");
  assert.equal(builds, 0, "no popup HTML was built for closed popups across refetches");
  assert.ok(!markers.some((m) => m.popupContentSets), "no closed popup content was swapped");
  // The lazy content reads the CURRENT record when the popup is finally opened.
  const changed = markers.find((m) => m.opts.title === "Via del Corso");
  assert.match(changed.popupHtml, /Via del Corso/);
  assert.equal(builds, 1);
});

test("(c) popup HTML is not built until the popup opens", async () => {
  __setBounds(STREET_VIEW);
  const built = [];
  const popupHtmlFor = (camera) => {
    built.push(camera.id);
    return `<div class="osm-popup"><h3>${camera.title}</h3><div class="osm-popup-community" data-record-id="${camera.id}"></div></div>`;
  };
  await renderWithLocale(element({ cameras: STREET, popupHtmlFor }));
  await pause(60);
  const markers = individualsOf(await leafletMarkers());
  assert.equal(markers.length, 3);
  assert.deepEqual(built, [], "binding the markers builds no popup HTML");
  assert.equal(typeof markers[0].popupContent, "function", "the popup is bound with a lazy content function");

  const map = (await leafletMaps())[0];
  let dialog = null;
  map.on("popupopen", (event) => { dialog = event.popup.getElement(); });
  const target = markers.find((m) => m.opts.title === "Via del Corso");
  target.handlers.click[0]({ originalEvent: {} });
  assert.deepEqual(built, [3], "opening builds ONLY that record's popup");
  assert.equal(dialog?.getAttribute("role"), "dialog", "the popup is still announced as a dialog");
  assert.equal(dialog?.getAttribute("aria-label"), "Via del Corso", "and labelled with the record title");
});

test("marker tooltips escape the user-supplied title and kind (no HTML injection)", async () => {
  __setBounds(STREET_VIEW);
  const hostile = STREET.map((camera, index) => index === 0
    ? { ...camera, title: "<img src=x onerror=alert(1)>", kind: "<b>bold</b>" }
    : camera);
  await renderWithLocale(element({ cameras: hostile }));
  await pause(60);
  const marker = individualsOf(await leafletMarkers()).find((m) => String(m.tooltipHtml ?? "").includes("onerror"));
  assert.ok(marker, "the hostile record has a tooltip");
  assert.ok(!marker.tooltipHtml.includes("<img"), "the title is escaped, not rendered as an element");
  assert.ok(!marker.tooltipHtml.includes("<b>"), "the kind is escaped");
  assert.match(marker.tooltipHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
