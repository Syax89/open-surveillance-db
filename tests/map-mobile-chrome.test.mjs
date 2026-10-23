/**
 * M02 (design review 2026-10-22, P1) — on a phone the map must start where
 * the viewport can actually show it.
 *
 * Evidence: at 390x844 the map began at y=399 (540px tall), the zoom "−"
 * button sat at y=827-871 (half below the fold) and the "Points in the
 * current view" toggle at y=952-996. At 320x568 the map began at y=449, so
 * only ~119px of map were available before scrolling.
 *
 * Contract asserted here:
 *   1. the mobile map height comes from the MEASURED offset of the map
 *      surface inside the current viewport (`--osm-map-height`, written by a
 *      dedicated hook) instead of the fixed `calc(100svh - 250px)` guess;
 *   2. the budget is bounded to a useful map/control height on tiny screens
 *      and leaves room for the points-panel entry, so it does not become
 *      unusable at either extreme;
 *   3. the chrome above the map is compacted on mobile — while the
 *      dual-purpose search caption stays VISIBLE (never hidden to save
 *      space) and no touch target is shrunk;
 *   4. the hook cleans up its listeners/observer and never feeds scroll back
 *      into itself;
 *   5. the logic lives in an extracted hook: MapPanel keeps its registered
 *      line ceiling (tests/component-smoke.test.mjs).
 *
 * Device proof is the controller's browser pass: jsdom proves the arithmetic
 * and the wiring, not the pixels.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

let rtl;
let SurveillanceMap;
let mapViewHeightFor;
let MAP_VIEW_MIN_HEIGHT;
let MAP_VIEW_RESERVE_BOTTOM;
let MAP_VIEW_CSS_VAR;

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  const hook = await loadDomModule("app/lib/hooks/use-map-view-height.mjs");
  mapViewHeightFor = hook.mapViewHeightFor;
  MAP_VIEW_MIN_HEIGHT = hook.MAP_VIEW_MIN_HEIGHT;
  MAP_VIEW_RESERVE_BOTTOM = hook.MAP_VIEW_RESERVE_BOTTOM;
  MAP_VIEW_CSS_VAR = hook.MAP_VIEW_CSS_VAR;
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(() => {
  rtl?.cleanup();
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 768 });
  }
});

/** CSS blocks for an exact selector, media-scoped or not (same parser as explorer-layout-polish). */
function ruleBlocks(source, selector) {
  const matcher = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "g");
  const blocks = [];
  let match;
  while ((match = matcher.exec(source))) {
    let depth = 1;
    let cursor = matcher.lastIndex;
    const start = cursor;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth === 0) blocks.push(source.slice(start, cursor - 1));
  }
  return blocks;
}

function mediaBlocks(source, feature, value) {
  const matcher = new RegExp(`@media\\s*\\(\\s*${feature}\\s*:\\s*${value}\\s*\\)\\s*\\{`, "g");
  const blocks = [];
  let match;
  while ((match = matcher.exec(source))) {
    let depth = 1;
    let cursor = matcher.lastIndex;
    const start = cursor;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth === 0) blocks.push(source.slice(start, cursor - 1));
  }
  return blocks;
}

function declaration(block, property) {
  const match = block.match(new RegExp(`(?:^|;)\\s*${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+)`));
  assert.ok(match, `expected ${property} declaration in:\n${block}`);
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// 1) The height budget arithmetic
// ---------------------------------------------------------------------------

test("map height budget = viewport - measured offset - reserve, bounded to a useful minimum", () => {
  assert.equal(MAP_VIEW_CSS_VAR, "--osm-map-height");
  assert.ok(MAP_VIEW_MIN_HEIGHT >= 320, "the map keeps a useful minimum height");
  assert.ok(MAP_VIEW_RESERVE_BOTTOM >= 48, "the points-panel entry keeps room below the map");

  // 390x844, map starting at 399 (the reviewed geometry): the map must end
  // inside the viewport with the points entry still visible.
  const reviewed = mapViewHeightFor(399, 844);
  assert.equal(reviewed, 844 - 399 - MAP_VIEW_RESERVE_BOTTOM);
  assert.ok(399 + reviewed <= 844, "the map must fit inside the viewport");

  // 320x568, map starting at 449: 568-449-64 is far too small → the useful
  // minimum wins (the page scrolls, the map stays usable).
  assert.equal(mapViewHeightFor(449, 568), MAP_VIEW_MIN_HEIGHT);

  // Unmeasurable inputs never produce 0/NaN.
  for (const [top, viewport] of [[NaN, 844], [399, 0], [undefined, undefined]]) {
    assert.equal(mapViewHeightFor(top, viewport), MAP_VIEW_MIN_HEIGHT);
  }

  // A tall viewport is capped so the map never becomes a full-page canvas.
  assert.ok(mapViewHeightFor(0, 2000) <= Math.round(2000 * 0.8));
});

// ---------------------------------------------------------------------------
// 2) CSS: measured height instead of the fixed guess, compacted chrome
// ---------------------------------------------------------------------------

test("mobile map height uses the measured variable, not calc(100svh - 250px)", async () => {
  const css = await readSource("app/globals.css");
  assert.doesNotMatch(css, /100svh\s*-\s*250px/, "the fixed offset guess must be gone");

  const mobile = mediaBlocks(css, "max-width", "768px");
  assert.ok(mobile.length > 0, "expected the ≤768px map block");
  const mapRule = mobile.flatMap((block) => ruleBlocks(block, ".map-card .map-panel .live-map"))[0];
  assert.ok(mapRule, "the mobile map height rule exists");
  const height = declaration(mapRule, "height");
  assert.match(height, /var\(--osm-map-height/, "the map height must come from the measured variable");
  assert.ok(/fallback|\d+svh|calc\(/.test(height), "a CSS fallback stays for the pre-measure/SSR frame");
});

test("mobile map chrome is compacted while the search caption stays visible", async () => {
  const css = await readSource("app/globals.css");
  const mobile = mediaBlocks(css, "max-width", "768px").join("\n");

  const toolbar = ruleBlocks(mobile, ".map-explorer-toolbar")[0];
  assert.ok(toolbar, "the mobile toolbar override exists");
  assert.ok(Number(declaration(toolbar, "padding").split(" ")[0].replace("px", "")) <= 8, "the toolbar padding is tightened");

  const search = ruleBlocks(mobile, ".map-explorer-search")[0];
  assert.ok(search, "the mobile search-block override exists");
  assert.ok(Number(declaration(search, "padding").split(" ")[0].replace("px", "")) <= 10, "the search block padding is tightened");

  const filters = ruleBlocks(mobile, ".map-card .filters-panel")[0];
  assert.ok(filters, "the mobile filters-panel override exists");
  assert.ok(Number(declaration(filters, "padding").split(" ")[0].replace("px", "")) <= 10, "the filters padding is tightened");

  // The dual-purpose caveat (typed filter cleared when a place is picked)
  // must stay visible: no rule may hide it to buy vertical space.
  const hint = ruleBlocks(mobile, ".map-explorer-search .map-list-search .map-list-search-hint")[0]
    ?? ruleBlocks(css, ".map-explorer-search .map-list-search .map-list-search-hint")[0];
  assert.ok(hint, "the search caption keeps its own rule");
  assert.doesNotMatch(css, /\.map-list-search-hint[^{]*\{[^}]*display\s*:\s*none/, "the search caption must never be hidden");

  // No touch target is shrunk to buy space: the 44px floors stay declared.
  assert.match(css, /\.map-panel \.leaflet-control-zoom a \{[^}]*width:44px;[^}]*height:44px/, "map zoom targets stay 44px");
  assert.match(css, /\.map-card \.record-filter select \{[^}]*min-height:44px/, "the filter selects stay ≥44px");
});

// ---------------------------------------------------------------------------
// 3) Behaviour: the hook measures the real offset and cleans up
// ---------------------------------------------------------------------------

function stubRect(element, top) {
  element.getBoundingClientRect = () => ({ top, bottom: top + 400, left: 0, right: 300, width: 300, height: 400, x: 0, y: top, toJSON: () => ({}) });
}

const flushFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

test("the map writes its measured height budget and follows a resize", async () => {
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 844 });
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  await flushFrame();
  const liveMap = view.container.querySelector(".live-map");
  assert.ok(liveMap, "the map element renders");
  stubRect(liveMap, 399);
  window.dispatchEvent(new window.Event("resize"));
  await flushFrame();
  assert.equal(liveMap.style.getPropertyValue("--osm-map-height"), `${844 - 399 - MAP_VIEW_RESERVE_BOTTOM}px`);

  // A smaller viewport that starts the map lower (320x568, map at 449):
  // the usable bound takes over instead of a negative/tiny height.
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 568 });
  stubRect(liveMap, 449);
  window.dispatchEvent(new window.Event("resize"));
  await flushFrame();
  assert.equal(liveMap.style.getPropertyValue("--osm-map-height"), `${MAP_VIEW_MIN_HEIGHT}px`);
});

test("the measuring hook removes its listeners on unmount (no leak, no scroll feedback)", async () => {
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 844 });
  const removed = [];
  const realRemove = window.removeEventListener.bind(window);
  window.removeEventListener = (type, handler, options) => { removed.push(type); return realRemove(type, handler, options); };

  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  await flushFrame();
  const liveMap = view.container.querySelector(".live-map");
  stubRect(liveMap, 200);
  window.dispatchEvent(new window.Event("resize"));
  await flushFrame();
  const measured = liveMap.style.getPropertyValue("--osm-map-height");
  assert.equal(measured, `${844 - 200 - MAP_VIEW_RESERVE_BOTTOM}px`);

  view.unmount();
  assert.ok(removed.includes("resize"), "the resize listener is removed on unmount");
  window.dispatchEvent(new window.Event("resize"));
  await flushFrame();
  assert.equal(liveMap.style.getPropertyValue("--osm-map-height"), measured, "an unmounted map no longer writes after a resize");
  window.removeEventListener = realRemove;
});

// ---------------------------------------------------------------------------
// 4) Extracted hook: MapPanel keeps its registered ceiling
// ---------------------------------------------------------------------------

test("the measured sizing lives in an extracted hook, not in MapPanel", async () => {
  const hook = await readSource("app/lib/hooks/use-map-view-height.ts");
  assert.match(hook, /export function useMapViewHeight/, "the hook is exported for the map component");
  assert.match(hook, /removeEventListener/, "the hook cleans up after itself");

  const map = await readSource("app/components/SurveillanceMap.tsx");
  assert.match(map, /useMapViewHeight/, "the map component uses the shared hook");

  const panel = await readSource("app/components/home/MapPanel.tsx");
  const lines = panel.split("\n").filter((line, index, all) => index < all.length - 1 || line.length > 0).length;
  assert.ok(lines <= 188, `MapPanel must keep its registered ceiling (188), got ${lines}`);
});
