/**
 * Mobile map declutter (owner-approved simplification, <=768px only).
 *
 * A phone balloon was unreadable ("troppa roba a schermo"): it stacked the
 * full record — id, coordinates, address, description, community toolbar —
 * inside a 286px-wide map, with Leaflet's paragraph margins applied on top
 * (`.leaflet-popup-content p { margin:1.3em 0 }`, 0,2,1, beats any
 * single-class `.osm-popup-*` rule), and the map controls painted over the
 * text. Contract asserted here:
 *
 *   1. the mobile preview hides ONLY the four extra blocks, scoped to
 *      `.osm-camera-popup` — markup, mount nodes and desktop stay intact;
 *   2. the compact margins use selectors strong enough to beat Leaflet;
 *   3. the balloon keeps ONE native record link (>=44px) and the FULL
 *      source/licence attribution, never clamped or ellipsised;
 *   4. the record page still owns every fact the phone preview drops;
 *   5. the coordinate picker (same popup class) is unaffected;
 *   6. the map search label is short in EN and IT while the two functions
 *      and the "picking a place clears the filter" hint stay.
 *
 * Fixtures are fictitious (example.test, illustrative Rome coordinates).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, resetLeafletMarkers, leafletMaps, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

let rtl;
let popupHtmlFor;
let SurveillanceMap;
let mapBundle;

before(async () => {
  rtl = await setupDom();
  popupHtmlFor = (await loadDomModule("app/lib/map-popup.mjs")).popupHtmlFor;
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  mapBundle = await loadDomModule("app/lib/i18n/map.mjs");
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(async () => {
  rtl?.cleanup();
  resetLeafletMarkers();
});

/** Declaration blocks for an exact selector (comma groups handled). */
function cssRules(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let cursor = 0;
  let start = 0;
  while (cursor < css.length) {
    if (css[cursor] !== "{") {
      cursor += 1;
      continue;
    }
    const selector = css.slice(start, cursor).trim();
    let depth = 1;
    let end = cursor + 1;
    while (end < css.length && depth > 0) {
      if (css[end] === "{") depth += 1;
      if (css[end] === "}") depth -= 1;
      end += 1;
    }
    rules.push({ selector, body: css.slice(cursor + 1, end - 1), selectors: selector.split(",").map((part) => part.trim()) });
    cursor = end;
    start = end;
  }
  return rules;
}

/** The first declaration block whose selector list contains `selector`. */
function ruleFor(source, selector) {
  return cssRules(source).find((rule) => rule.selectors.includes(selector));
}

/** The single `@media (max-width:768px)` block that owns the mobile map. */
function mobileBlock(css) {
  const matcher = /@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{/g;
  const match = matcher.exec(css);
  assert.ok(match, "expected the <=768px map block");
  let depth = 1;
  let cursor = matcher.lastIndex;
  const start = cursor;
  while (cursor < css.length && depth > 0) {
    if (css[cursor] === "{") depth += 1;
    if (css[cursor] === "}") depth -= 1;
    cursor += 1;
  }
  return css.slice(start, cursor - 1);
}

/** Everything outside every @media block: the desktop/base declarations. */
function baseScope(css) {
  let depth = 0;
  let out = "";
  let media = 0;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === "@" && css.slice(i, i + 6) === "@media") media += 1;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) media = 0;
    }
    if (media === 0) out += char;
  }
  return out;
}

const PREVIEW_HIDDEN = [
  ".osm-popup-facts",
  ".osm-popup-address",
  ".osm-popup-description",
  ".osm-popup-community",
];

// ---------------------------------------------------------------------------
// 1) CSS — mobile-only hiding, scoped to the record balloon
// ---------------------------------------------------------------------------

test("mobile hides the extra record blocks inside .osm-camera-popup only", async () => {
  const css = await readSource("app/globals.css");
  const mobile = mobileBlock(css);
  const base = baseScope(css);
  const mobileRules = cssRules(mobile);
  const baseRules = cssRules(base);

  /** Every mobile selector that hides this class must carry the balloon scope. */
  const hideSelectorsFor = (className) => mobileRules
    .filter((rule) => /display\s*:\s*none/.test(rule.body))
    .flatMap((rule) => rule.selectors)
    .filter((selector) => new RegExp(`${className.replace(/\./g, "\\.")}$`).test(selector));

  for (const selector of PREVIEW_HIDDEN) {
    const hiders = hideSelectorsFor(selector);
    assert.ok(hiders.length > 0, `${selector} must be hidden from the mobile balloon`);
    for (const hider of hiders) {
      assert.ok(hider.startsWith(".osm-camera-popup "), `${selector} is hidden only through the .osm-camera-popup scope (got "${hider}")`);
    }
    const baseHider = baseRules.filter((rule) => /display\s*:\s*none/.test(rule.body) && rule.selectors.some((s) => s.endsWith(selector)));
    assert.equal(baseHider.length, 0, `${selector} keeps no base/desktop hide`);
  }

  // The detail link and the attribution are what REMAIN: never hidden, never
  // clamped/ellipsised, and the anchor keeps a 44px touch box.
  for (const className of [".osm-popup-footer", ".osm-popup-provenance"]) {
    for (const rule of cssRules(css)) {
      if (!rule.selectors.some((selector) => selector.endsWith(className))) continue;
      assert.doesNotMatch(rule.body, /display\s*:\s*none/, `${className} must stay visible on mobile`);
      assert.doesNotMatch(rule.body, /line-clamp|text-overflow\s*:\s*ellipsis/, `${className} must stay fully readable (licence attribution)`);
    }
  }
  const footerLink = ruleFor(mobile, ".osm-camera-popup .osm-popup .osm-popup-footer a");
  assert.ok(footerLink, "the mobile detail link has its own rule");
  assert.match(footerLink.body, /min-height\s*:\s*44px/, "the detail link keeps a >=44px touch target");
  assert.match(footerLink.body, /display\s*:\s*inline-flex/, "the whole 44px box is the target");

  // Long-content handling and the 44px close button survive the declutter.
  assert.match(mobile, /\.osm-camera-popup \.leaflet-popup-content \{[^}]*overflow-y:auto/, "the balloon still scrolls for long content");
  assert.match(mobile, /\.leaflet-container \.osm-camera-popup a\.leaflet-popup-close-button \{[^}]*width:44px/, "the close button stays 44px");
  // No z-index trick replaces the approved geometry fix.
  assert.doesNotMatch(css, /leaflet-popup-pane\s*\{[^}]*z-index/, "the balloon is kept clear of the controls by geometry, not by stacking");
});

test("the mobile popup margins beat Leaflet's own paragraph rule", async () => {
  const css = await readSource("app/globals.css");
  const leaflet = await readSource("node_modules/leaflet/dist/leaflet.css");
  // The rule that silently won before this change: 2 classes + 1 element.
  assert.match(leaflet, /\.leaflet-popup-content p \{[^}]*margin:\s*1\.3em 0/, "Leaflet's paragraph margin is still in play");

  const mobile = mobileBlock(css);
  for (const className of [".osm-popup-kind", ".osm-popup-status", ".osm-popup-footer", ".osm-popup-provenance"]) {
    const selector = `.osm-camera-popup .osm-popup ${className}`;
    const rule = ruleFor(mobile, selector);
    assert.ok(rule, `${className} has a scoped mobile rule`);
    assert.match(rule.body, /margin\s*:/, `${className} declares its own margin`);
    // 3 classes > (0,2,1): the ONLY reason these margins apply at all.
    const classCount = (selector.match(/\.[\w-]+/g) ?? []).length;
    assert.ok(classCount >= 3, `${className} needs >=3 classes to outrank .leaflet-popup-content p (0,2,1), got ${classCount}`);
  }
});

// ---------------------------------------------------------------------------
// 2) Real markup — desktop keeps everything, mobile hides by CSS only
// ---------------------------------------------------------------------------

const importedRecord = {
  id: 10, title: "Imported camera", kind: "Bullet", status: "active",
  latitude: 41.9, longitude: 12.49, source: "import:fixture-zurigo-2026",
  address: "Via Example 1, example.test", description: "Fictitious fixture record.",
  createdAt: "2026-08-05T08:51:38.000Z",
};
const LABELS = {
  recordId: "Record ID", location: "Location", popupDetail: "Open record",
  unknown: "Unknown", fovDirection: "Field of view", popupAdded: "Added",
  popupCommunityReport: "Community report", source: "Source",
};
const OPTIONS = {
  provenance: { sourceName: "Fixture City — Open Data", license: "CC0 1.0", licenseUrl: "https://example.invalid/licenses/cc0" },
  locale: "en",
};

test("the popup markup keeps every block and the ONE native record link", () => {
  const html = popupHtmlFor(importedRecord, { active: "Active", demo: "Demo" }, LABELS, OPTIONS);

  // The blocks the phone hides stay in the markup: CSS does the hiding, so
  // the desktop balloon and any resize need no JS, no lifecycle, no markup
  // change — and the mobile preview cannot drift from the desktop one.
  for (const selector of PREVIEW_HIDDEN) {
    assert.ok(html.includes(selector.slice(1)), `${selector} is still rendered in the popup markup`);
  }
  assert.match(html, /data-record-id="10"/, "the community action mount node is untouched");

  // The one action the phone keeps: a real anchor to the public record.
  assert.match(html, /<a href="\/records\/10">Open record/, "the detail link is a native anchor to the record page");

  // Full required attribution: readable source, licence link, added date.
  assert.match(html, /Source: Fixture City — Open Data/, "the source name stays");
  assert.match(html, /<a href="https:\/\/example\.invalid\/licenses\/cc0"[^>]*>CC0 1\.0<\/a>/, "the licence stays linked");
  assert.match(html, /data-license-url="https:\/\/example\.invalid\/licenses\/cc0"/, "the licence data contract stays");
  assert.match(html, /Added: 5 August 2026/, "the added date stays");
});

test("the record page still owns the facts the phone preview drops", async () => {
  const record = await readSource("app/records/[id]/RecordPageBody.tsx");
  assert.match(record, /formatLocation\(record\.address, record\.latitude as number, record\.longitude as number\)/, "coordinates + address live on the record page");
  assert.match(record, /record\.description/, "the description lives on the record page");
  assert.match(record, /<CommunityActions key=\{recordId\}/, "the FULL community widget lives on the record page");
  assert.match(record, /record\.importBatch/, "import provenance lives on the record page");
});

test("the coordinate picker keeps its own balloon (none of the hidden blocks)", async () => {
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: null, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const map = (await leafletMaps()).at(-1);
  map.handlers.click?.[0]?.({ latlng: { lat: 41.9004, lng: 12.4936 } });
  const picker = map.popupHtml;
  assert.ok(picker, "the empty-map click still opens the coordinate picker");
  for (const selector of PREVIEW_HIDDEN) {
    assert.ok(!picker.includes(selector.slice(1)), `the picker never rendered ${selector}`);
  }
  assert.match(picker, /osm-popup-actions/, "the picker's own action stays");
  view.unmount();
});

// ---------------------------------------------------------------------------
// 3) Search label — short in both languages, both functions kept
// ---------------------------------------------------------------------------

test("the map search label is short in EN and IT and nothing else changed", async () => {
  const { en, it } = mapBundle;
  assert.equal(en.listSearchLabel, "Filter points or find a place");
  assert.equal(it.listSearchLabel, "Filtra punti o cerca un luogo");
  assert.ok(en.listSearchLabel.length < 40 && it.listSearchLabel.length < 40, "the label fits one line on a phone");

  // Both functions are still named, and the caveat that picking a place
  // clears the typed filter is still carried by the help + visible caption.
  assert.match(en.listSearchHelp, /filters those points/);
  assert.match(en.listSearchHelp, /suggests matching places/);
  assert.match(en.listSearchCaption, /clears the filter/);
  assert.match(it.listSearchHelp, /filtra quei punti/);
  assert.match(it.listSearchHelp, /suggerisce luoghi/);
  assert.match(it.listSearchCaption, /azzera il filtro/);

  // The shortened key is map-only: exactly one consumer, no other widget.
  const geocode = await readSource("app/components/home/GeocodeSearch.tsx");
  assert.match(geocode, /\{t\.listSearchLabel\}/, "the map search consumes the shortened label");
  const directory = await readSource("app/components/home/PublicDirectory.tsx");
  assert.ok(!directory.includes("listSearchLabel"), "the directory search widget is untouched");
});
