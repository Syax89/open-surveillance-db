// DOM interaction harness for the "use client" components (QA t_61b90f6a).
//
// The client components (LocaleProvider, SurveillanceMap, ModerationDashboard,
// SiteFooter, LegalPage, auth pages, /records/[id]) were previously tested
// only through SSR renders (react-dom/server) plus static leak checks. This
// harness runs them for real inside jsdom with @testing-library/react:
// clicks, form submits, locale toggles, client fetch, loading/error states,
// aria-live announcements.
//
// How it works, mirroring the render harness in tests/pages-render.test.mjs:
//   1. it transpiles the real app/lib + app/components + client pages to ESM
//      in a temp tree INSIDE the repo (tests/.dom-tmp-*) so react, react-dom
//      and @testing-library resolve from the repo node_modules,
//   2. it shadows `next/link` and `next/navigation` with controllable stubs
//      (the navigation mock records router.push calls and lets tests set the
//      params for /records/[id]),
//   3. it shadows `leaflet` with a recording stub so SurveillanceMap's lazy
//      import runs in jsdom and every marker's divIcon html is captured for
//      the status-class whitelist assertions,
//   4. it provides a controllable global fetch mock (jsonResponse helper)
//      so client data flows are deterministic,
//   5. it installs a jsdom window as the global DOM and exposes the
//      @testing-library/react API bound to it.
//
// ISOLATION CONTRACT (QA t_5084202a): the transpile tree is created with
// mkdtemp INSIDE this process (one dir per test FILE — node --test runs each
// file in its own process) and removed ONLY by this file's own `after()` hook
// below. No test file may ever share, reuse, glob-delete or pre-seed
// tests/.dom-tmp-*: a shared build dir is exactly the race that the t_5084202a
// investigation disproved but must stay impossible. If a future refactor makes
// a component prop required (like navLabels in PR #120), the DOM test that
// renders it fails DETERMINISTICALLY with a contract-guard message — not with
// an intermittent TypeError on an undefined prop.
//
// Tests use ONLY fictitious fixtures (example.test addresses, made-up
// titles) — never real personal data.

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { after } from "node:test";
import React from "react";

export { React };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Client pages and components the harness must be able to load. Pages are
// the default exports; components keep their named exports.
//
// F1 route group (tools) (t_03c0fa15): the four tool bodies and the shared
// tool chrome are "use client" components. They live under app/components/
// (so the recursive walk already transpiles them); they are listed here as
// the explicit isolation contract — the interaction tests load them by
// these exact paths.
const PAGES = [
  // P1-1/P1-3 (design review): the auth-ux pages are loaded as their client
  // BODY components (like /account) — the page.tsx shells import
  // getServerMessages (next/headers), which the DOM harness stubs cannot
  // resolve; the shells are covered by pages-render.test.mjs instead.
  // /login and /register follow the same split (QA#6 F2/F5, t_9467ee7f):
  // the thin server shells were introduced when the per-page metadata and
  // the localized SSR Suspense fallback moved server-side.
  { source: "app/login/LoginPageBody.tsx", relative: "app/login/LoginPageBody.mjs" },
  { source: "app/register/RegisterPageBody.tsx", relative: "app/register/RegisterPageBody.mjs" },
  { source: "app/verify-email/VerifyEmailBody.tsx", relative: "app/verify-email/VerifyEmailBody.mjs" },
  { source: "app/forgot-password/ForgotPasswordBody.tsx", relative: "app/forgot-password/ForgotPasswordBody.mjs" },
  { source: "app/reset-password/ResetPasswordBody.tsx", relative: "app/reset-password/ResetPasswordBody.mjs" },
  { source: "app/account/AccountPageBody.tsx", relative: "app/account/AccountPageBody.mjs" },
  { source: "app/records/[id]/RecordPageBody.tsx", relative: "app/records/[id]/RecordPageBody.mjs" },
  { source: "app/records/[id]/edit/page.tsx", relative: "app/records/[id]/edit/page.mjs" },
  // C5 community components: the verification toggle and the trust-level
  // badge are loaded by the client interaction tests (client-verify-toggle,
  // client-account) — listed here as the explicit isolation contract like
  // the other hand-picked components below.
  { source: "app/components/StarConfirmButton.tsx", relative: "app/components/StarConfirmButton.mjs" },
  { source: "app/components/LevelBadge.tsx", relative: "app/components/LevelBadge.mjs" },
  // F1 route group (tools): tool bodies + shared chrome.
  { source: "app/components/ToolLayout.tsx", relative: "app/components/ToolLayout.mjs" },
  { source: "app/components/LegacyAnchorRedirect.tsx", relative: "app/components/LegacyAnchorRedirect.mjs" },
  { source: "app/components/FiltersBar.tsx", relative: "app/components/FiltersBar.mjs" },
  { source: "app/components/EmptyState.tsx", relative: "app/components/EmptyState.mjs" },
  { source: "app/components/tools/MappaTool.tsx", relative: "app/components/tools/MappaTool.mjs" },
  { source: "app/components/tools/DirectoryTool.tsx", relative: "app/components/tools/DirectoryTool.mjs" },
  { source: "app/components/tools/SegnalaTool.tsx", relative: "app/components/tools/SegnalaTool.mjs" },
  { source: "app/components/tools/CorreggiTool.tsx", relative: "app/components/tools/CorreggiTool.mjs" },
  // P1-2 (design review): the write-tool login wall gates the /segnala and
  // /correggi forms behind the verified-contributor session check.
  { source: "app/components/WriteGateWall.tsx", relative: "app/components/WriteGateWall.mjs" },
];

const transpile = (sourcePath) =>
  ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: sourcePath,
  }).outputText;

// Rewrite relative imports so they resolve inside the temp tree as .mjs.
function rewriteSpecifiers(code) {
  let out = code.replace(
    /(from\s*["'])(\.\.?\/[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) =>
      specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
  );
  out = out.replace(/from\s*["'](\.[^"']+)\/index\.mjs["']/g, (m, spec) => `from "${spec}/index.mjs"`);
  return out;
}

async function buildDomTree() {
  const tree = await mkdtemp(path.join(root, "tests", ".dom-tmp-"));
  const nodeModules = path.join(tree, "node_modules");
  await mkdir(path.join(nodeModules, "next"), { recursive: true });

  // --- next/link + next/navigation stubs ---------------------------------
  await writeFile(path.join(nodeModules, "next", "package.json"), JSON.stringify({
    name: "next", version: "0.0.0", type: "module",
    exports: {
      "./link": "./link.mjs", "./link.js": "./link.mjs",
      "./navigation": "./navigation.mjs", "./navigation.js": "./navigation.mjs",
      ".": "./link.mjs",
    },
  }));
  await writeFile(path.join(nodeModules, "next", "link.mjs"),
    `import React from "react";
export default function Link({ href, children, ...rest }) {
  return React.createElement("a", { href, ...rest }, children);
}
`);
  // The navigation mock keeps a mutable state so tests can set the params
  // for /records/[id] and assert router.push calls after a form submit.
  //
  // URL-state model (F-QA t_7b716c97, prereq F4): besides `params`, the mock
  // carries a real URL state — pathname + search — plus a browser-style
  // history stack, so tests can simulate deep links (initial URL from the
  // address bar), router.push/replace navigation, and back/forward. The
  // URL-contract suite (tests/url-contract.test.mjs) drives these helpers.
  //
  // Legacy aliases (F1/F3 suites keep using them unchanged):
  //   __setNavState({ search: "type=dome&freshness=7d" })  → seeds the URL
  //     shell for /mappa /correggi ?record=ID (useSearchParams reads it);
  //   __setNavState({ pathname: "/mappa" })                → feeds
  //     usePathname for the ToolLayout per-page nav sets (t_2ca69725).
  //
  // F4 URL-state contract (t_522638a5): push/replace model Next's router —
  // after a navigation the URL changes, so the stub updates the URL and
  // useSearchParams reflects it on the next render (deep-link / back-forward
  // behaviour in jsdom). `replaced` stays an array of hrefs (legacy contract,
  // client-legacy-anchor); the full call shape { href, opts } lands in
  // `replaceCalls` so tests can assert router.replace(href, { scroll: false })
  // on filter edits (R2 URL churn).
  await writeFile(path.join(nodeModules, "next", "navigation.mjs"),
    `const parseUrl = (href) => {
  if (typeof href !== "string" || href.length === 0) return { pathname: "/", search: "" };
  const qIndex = href.indexOf("?");
  return qIndex === -1
    ? { pathname: href, search: "" }
    : { pathname: href.slice(0, qIndex) || "/", search: href.slice(qIndex) };
};
const normalizeSearch = (s) => (s.length > 0 && s[0] !== "?" ? "?" + s : s);
const cloneUrl = (u) => ({ pathname: u.pathname, search: u.search });
const state = {
  params: { id: "1" },
  pushed: [],
  replaced: [],
  replaceCalls: [],
  // t_b1e192e1: when true, router.replace throws a TypeError mimicking the
  // vinext RSC navigation error ("Cannot read properties of undefined
  // (reading 'digest')") — tests use it to prove applyFilters' hardened
  // write survives a throwing navigation.
  failReplace: false,
  url: { pathname: "/", search: "" },
  history: [{ pathname: "/", search: "" }],
  historyIndex: 0,
};
const applyUrl = (next) => { state.url = cloneUrl(next); };
export const __setNavState = (patch) => {
  if (patch.url !== undefined) {
    // A URL in the patch simulates a fresh deep link: it replaces both the
    // current URL and the whole history (there is no "back" from a deep
    // link in a fresh tab).
    const next = typeof patch.url === "string" ? parseUrl(patch.url) : cloneUrl(patch.url);
    applyUrl(next);
    state.history = [cloneUrl(next)];
    state.historyIndex = 0;
    const rest = { ...patch };
    delete rest.url;
    Object.assign(state, rest);
    return;
  }
  // Legacy aliases: seed the URL shell / pathname directly (F1/F3 suites).
  const rest = { ...patch };
  if (patch.search !== undefined) {
    const next = { pathname: state.url.pathname, search: normalizeSearch(String(patch.search)) };
    applyUrl(next);
    delete rest.search;
  }
  if (patch.pathname !== undefined) {
    const next = { pathname: String(patch.pathname), search: state.url.search };
    applyUrl(next);
    delete rest.pathname;
  }
  Object.assign(state, rest);
};
export const __getNavState = () => state;
export const __goBack = () => {
  if (state.historyIndex > 0) {
    state.historyIndex -= 1;
    applyUrl(state.history[state.historyIndex]);
  }
  return state.url;
};
export const __goForward = () => {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex += 1;
    applyUrl(state.history[state.historyIndex]);
  }
  return state.url;
};
export const useParams = () => state.params;
export const useRouter = () => ({
  push: (p) => {
    state.pushed.push(p);
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(parseUrl(p));
    state.historyIndex += 1;
    applyUrl(state.history[state.historyIndex]);
  },
  replace: (p, opts) => {
    if (state.failReplace) {
      // t_b1e192e1: simulate the vinext RSC navigation error — a throwing
      // router.replace must be neutralized by applyFilters' try/catch, not
      // crash the test.
      throw new TypeError("Cannot read properties of undefined (reading 'digest')");
    }
    state.replaced.push(p);
    state.replaceCalls.push({ href: p, opts });
    state.history[state.historyIndex] = parseUrl(p);
    applyUrl(state.history[state.historyIndex]);
  },
  refresh: () => {},
  back: __goBack,
  forward: __goForward,
});
export const useSearchParams = () => new URLSearchParams(state.url.search);
export const usePathname = () => state.url.pathname;
`);

  // --- leaflet stub: records every marker + its divIcon html --------------
  await mkdir(path.join(nodeModules, "leaflet"), { recursive: true });
  await writeFile(path.join(nodeModules, "leaflet", "package.json"), JSON.stringify({
    name: "leaflet", version: "0.0.0", type: "module",
    exports: { ".": "./index.mjs", "./package.json": "./package.json" },
  }));
  await writeFile(path.join(nodeModules, "leaflet", "index.mjs"),
    `const markers = [];
const paths = [];
const maps = [];
export const __markers = markers;
export const __paths = paths;
export const __maps = maps;
// Whole-world viewport by default (t_702c10af): the stub map reports
// bounds that contain every record, so the viewport→list sync keeps the
// full list. Tests can shrink the viewport with __setBounds() and fire the
// map's moveend handler to exercise the debounced list narrowing.
// __resetMarkers ALSO restores these bounds (t_b9666d09): the geocode
// autocomplete tests shrink the viewport to assert the pan landing, and a
// stale narrow viewport leaking into the NEXT test would silently filter
// the list (a record outside the leftover bounds disappears) — every test
// must start from the whole-world viewport.
const wholeWorldBounds = {
  getSouth: () => -90,
  getNorth: () => 90,
  getWest: () => -180,
  getEast: () => 180,
  contains: () => true,
};
let currentBounds = wholeWorldBounds;
export const __setBounds = (b) => { currentBounds = b; };
export const __resetMarkers = () => { markers.length = 0; maps.length = 0; paths.length = 0; currentBounds = wholeWorldBounds; };
export function map(el, opts) {
  const m = {
    // Map options recorded (RecordMiniMap 2026-08-07): the read-only mini
    // map asserts zoomControl/dragging/scrollWheelZoom are off.
    opts: opts ?? {},
    // setView records every call (t_b9666d09 geocode pan assertions):
    // m.views accumulates { center, zoom } so tests can assert the map
    // really moved to the selected place.
    views: [],
    // Zoom is mutable (t_f8b775ec): tests set m.zoom = 17 to cross the
    // field-of-view threshold (FOV_MIN_ZOOM) and fire the moveend/zoomend
    // handler; getZoom reads it live.
    zoom: 13,
    // Field-of-view a11y (t_f8b775ec): getPane records attribute writes so
    // tests can assert the decorative overlay pane is aria-hidden.
    paneAttrs: {},
    setView: (center, zoom, opts) => { m.views.push({ center, zoom, opts }); return m; }, // chainable, like the real Leaflet map API
    on: (event, handler) => { (m.handlers[event] ??= []).push(handler); return m; },
    // P0 t_bb310428: the coordinate picker is registered ONLY while the
    // "Add here" mode is active — off() removes the handler so tests can
    // assert the map is SILENT outside the explicit mode.
    off: (event, handler) => { const list = m.handlers[event]; if (list) { const i = list.indexOf(handler); if (i !== -1) list.splice(i, 1); } return m; },
    remove: () => {},
    invalidateSize: () => {},
    getZoom: () => m.zoom,
    getBounds: () => currentBounds,
    panTo: () => m,
    handlers: {},
    // P0 t_bb310428 (strict popup lifecycle instrumentation): fire() mirrors
    // Leaflet's event dispatch — it records the event in the stub log AND
    // invokes the registered handlers, exactly like a real map.fire(). The
    // marker stub uses it to dispatch popupopen (openPopup) and popupclose
    // (removeLayer of an open-popup marker), so the strict popup-lifecycle
    // tests can assert EVENT COUNTS (one popupopen per click, zero
    // close/reopen on rebuild) instead of guessing from DOM state.
    events: {},
    fire: (event, data) => {
      (m.events[event] ??= []).push(data);
      for (const handler of m.handlers[event] ?? []) handler(data);
      return m;
    },
    getPane: () => ({ setAttribute: (key, value) => { m.paneAttrs[key] = value; } }),
    // Direct addLayer on the map (RecordMiniMap 2026-08-07): the read-only
    // mini map adds markers/geometry straight to the map, not via a
    // layerGroup — record into the same live-union arrays the groups use.
    addLayer: (item) => {
      item.__map = m;
      (item && item.__isPath ? paths : markers).push(item);
    },
    // Report mini-map (t_ebbe0ea3): the FOV shape is rebuilt via
    // map.removeLayer + re-add when position/kind/known-ness changes.
    removeLayer: (item) => {
      const list = item && item.__isPath ? paths : markers;
      const index = list.indexOf(item);
      if (index !== -1) list.splice(index, 1);
      return m;
    },
    // Map-click picker (t_6abb96ac): map.openPopup records the popup
    // content + position so tests can assert the report-picker popup
    // (coordinates + /segnala deep link) that a map click opens.
    openPopup: (html, latlng, opts) => { m.popupHtml = html; m.popupLatLng = latlng; m.popupOpts = opts; return m; },
    closePopup: () => { m.popupHtml = null; m.popupLatLng = null; return m; },
  };
  maps.push(m);
  return m;
}
export const control = { zoom: () => ({ addTo: (map) => { (map.__controls ??= []).push({ kind: "zoom" }); } }) };
// Custom controls (t_18259daa): the geolocate button is a real
// L.Control.extend subclass. The stub mirrors the real addTo contract —
// onAdd() returns a DOM node (jsdom), which is recorded on the map stub
// (map.__controls) so tests can query the button; the real Leaflet appends
// it to the corner container, the stub does not touch the document.
export const Control = {
  extend(proto) {
    const Cls = function (options) { this.options = { ...(proto.options ?? {}), ...(options ?? {}) }; };
    Cls.prototype.addTo = function (map) {
      const container = typeof proto.onAdd === "function" ? proto.onAdd.call(this) : null;
      (map.__controls ??= []).push({ kind: "geolocate", container, control: this });
      return this;
    };
    return Cls;
  },
};
export const tileLayer = (url, opts) => {
  const layer = { addTo: () => {} };
  // CSP-safe tile proxy contract (RecordMiniMap 2026-08-07): record the
  // URL so tests can assert tiles come from /api/tiles, not a direct
  // tile.openstreetmap hotlink (blocked by img-src 'self').
  if (url) {
    layer.url = url;
    const mapStub = maps[maps.length - 1];
    if (mapStub) (mapStub.tileLayers ??= []).push(url);
  }
  return layer;
};
// Each layerGroup owns its items (t_f8b775ec): the field-of-view group and
// the marker group are independent in real Leaflet, so clearing one must
// never clear the other. The exported __markers/__paths arrays stay the
// LIVE UNION of every group's items (addLayer appends, clearLayers removes
// only that group's items) — existing marker-count assertions keep working.
export const layerGroup = () => {
  const own = [];
  let groupMap = null;
  const group = {
    clearLayers: () => {
      for (const item of own) {
        const arr = item && item.__isPath ? paths : markers;
        const index = arr.indexOf(item);
        if (index !== -1) arr.splice(index, 1);
      }
      own.length = 0;
    },
    addLayer: (m) => {
      own.push(m);
      m.__map = groupMap;
      (m && m.__isPath ? paths : markers).push(m);
    },
    // P0 t_bb310428 (reconcile): removeLayer removes ONLY the given marker
    // — the marker population effect diffs the desired set instead of
    // clearLayers, so an open popup on a KEPT marker survives a rebuild.
    // Real Leaflet fires popupclose when a marker with an open popup is
    // removed — mirror that so the strict popup-lifecycle tests can assert
    // event counts (and the component's popupclose handler unmounts the
    // community widget exactly like in the browser).
    removeLayer: (m) => {
      const index = own.indexOf(m);
      if (index !== -1) own.splice(index, 1);
      const arr = m && m.__isPath ? paths : markers;
      const arrIndex = arr.indexOf(m);
      if (arrIndex !== -1) arr.splice(arrIndex, 1);
      // Real Leaflet closes the popup when its marker leaves the map and
      // resets the marker's own open state — mirror both (the component's
      // popupclose handler unmounts the community widget exactly like in
      // the browser, and isPopupOpen() reads false afterwards).
      if (m?.popupOpened && groupMap?.fire) {
        m.popupOpened = false;
        groupMap.fire("popupclose", { marker: m });
      }
      m.__map = null;
    },
  };
  return { addTo: (map) => { groupMap = map; return group; } };
};
export function marker(latlng, opts) {
  const m = {
    latlng, opts,
    bindTooltip: () => m, on: (event, handler) => { (m.handlers[event] ??= []).push(handler); return m; },
    // Popup contract (t_702c10af): the bound HTML is recorded on the
    // marker so tests can assert the popup content (links, fields), and
    // openPopup() records that the balloon was requested.
    bindPopup: (html, opts) => { m.popupHtml = html; m.popupOpts = opts; return m; },
    // P0 t_bb310428 (strict popup lifecycle instrumentation): openPopup()
    // mirrors real Leaflet — it materialises the bound HTML into a popup
    // DOM node and dispatches "popupopen" on the map (recorded in
    // map.events + invoking the registered handlers, exactly like
    // map.fire). The component's popupopen handler therefore runs through
    // the real path when a marker click opens a popup, and the strict
    // lifecycle tests can assert EVENT COUNTS (one popupopen per click,
    // zero close/reopen on a rebuild that keeps the marker).
    openPopup: () => {
      m.popupOpened = true;
      const map = m.__map;
      if (map?.fire) {
        // Test-only fixture: the div is materialised from the component's
        // own escaped popup HTML (or the fixture passed by the test), never
        // from user input — safe to parse here, exactly like the real
        // Leaflet popup constructor does in the browser.
        const div = document.createElement("div");
        if (typeof m.popupHtml === "string" && m.popupHtml.includes("osm-popup-community")) {
          div.innerHTML = m.popupHtml;
        } else {
          div.innerHTML = '<div class="osm-popup-community"></div>';
        }
        map.fire("popupopen", { popup: { getElement: () => div }, marker: m });
      }
      return m;
    },
    // Popup lifecycle (t_33b82720): the marker click handler calls
    // isPopupOpen() to open idempotently (a click on an already-open popup
    // keeps it open instead of toggling it closed).
    isPopupOpen: () => m.popupOpened === true,
    // P0 t_bb310428 (reconcile): setPopupContent / setTooltipContent update
    // a KEPT marker in place — the open popup keeps its DOM.
    setPopupContent: (html) => { m.popupHtml = html; return m; },
    setTooltipContent: () => m,
    getLatLng: () => latlng,
    // Report mini-map (t_ebbe0ea3): the rotation-handle marker is dragged —
    // setLatLng moves it (updating the recorded latlng so getLatLng reads
    // the new spot) and fire dispatches the registered handlers like the
    // map stub, so a handle "drag" event re-aims the cone in the test.
    setLatLng: (next) => { latlng = next; m.latlng = next; return m; },
    fire: (event, data) => { (m.events[event] ??= []).push(data); for (const handler of m.handlers[event] ?? []) handler(data); return m; },
    remove: () => {},
    // Grid badges set an aria-label on the real element (t_26ce96f3); the
    // stub records the attribute so the contract stays assertable. The
    // reconcile badge-count update queries the badge text node — the stub
    // exposes a querySelector that returns null (always triggers the icon
    // refresh), which is harmless for assertions.
    getElement: () => ({ setAttribute: (key, value) => { m.elementAttrs ??= {}; m.elementAttrs[key] = value; }, querySelector: () => null }),
    handlers: {},
    events: {},
    addTo: (layer) => { layer.addLayer(m); return m; },
    // Real Leaflet API: setIcon replaces the marker icon in place. The
    // recorded opts.icon must follow so tests asserting marker html read
    // the CURRENT icon (e.g. the selected-marker status class).
    setIcon: (icon) => { m.opts = { ...m.opts, icon }; return m; },
  };
  return m;
}
// Field-of-view geometry (t_f8b775ec): polygon/circle stubs record their
// latlngs + options into the shared paths array (kept separate from
// markers so existing marker-count assertions stay stable). __isPath routes
// the layerGroup's addLayer into the right array. getElement mirrors the
// real Path API (the component never calls it, but the contract stays).
export function polygon(latlngs, opts) {
  const p = { latlngs, opts, __isPath: true, getElement: () => null, addTo: (layer) => { layer.addLayer(p); return p; }, setLatLngs: (next) => { p.latlngs = next; return p; } };
  return p;
}
export function circle(latlng, opts) {
  const c = { latlng, opts, __isPath: true, getElement: () => null, addTo: (layer) => { layer.addLayer(c); return c; } };
  return c;
}
export const divIcon = (opts) => opts;
// Popup-lifecycle (t_33b82720): L.DomEvent.stopPropagation is called by the
// marker click handler so a marker click NEVER bubbles to the map click
// handler (which would open the generic coordinate picker over the marker
// popup). The stub records the stop so tests can assert the propagation
// really was halted.
export const DomEvent = {
  stopPropagation: (e) => { if (e && typeof e === "object") e.__stopped = true; },
};
`);

  // --- transpile app/lib, app/components and the client pages ------------
  const sources = [];
  for (const [baseDir, relOut] of [
    [path.join(root, "app", "lib"), "app/lib"],
    [path.join(root, "app", "components"), "app/components"],
  ]) {
    const walk = async (dir, rel) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs, path.join(rel, entry.name));
        } else if (/\.tsx?$/.test(entry.name)) {
          sources.push({ abs, out: path.join(rel, entry.name.replace(/\.tsx?$/, ".mjs")) });
        }
      }
    };
    await walk(baseDir, relOut);
  }
  for (const { source, relative } of PAGES) {
    sources.push({ abs: path.join(root, source), out: relative });
  }

  for (const { abs, out } of sources) {
    const outPath = path.join(tree, out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, rewriteSpecifiers(transpile(abs)));
  }

  // --- app/lib/navigate stub (2026-08-08) --------------------------------
  // After a successful login/register the auth pages call hardNavigate()
  // — a full reload beats router.push + refresh on vinext dev, where the
  // RSC request fires but the UI stays frozen (reproduced live on
  // the pre-prod domain). jsdom cannot navigate, so the stub records the
  // destinations in window.__locationAssigns (same contract as nav.pushed)
  // and tests assert them.
  await writeFile(
    path.join(tree, "app", "lib", "navigate.mjs"),
    `export function hardNavigate(href) {
  if (typeof window !== "undefined" && window.__locationAssigns) {
    window.__locationAssigns.push(String(href));
  }
}
`,
  );

  // Fixup: relative imports pointing at a directory index (e.g. ../lib/i18n
  // -> ../lib/i18n.mjs) must become ../lib/i18n/index.mjs when the file does
  // not exist but the directory index does.
  const fixup = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await fixup(abs);
      else if (entry.name.endsWith(".mjs")) {
        let code = await readFile(abs, "utf8");
        const original = code;
        code = code.replace(/from\s*["'](\.[^"']+)\.mjs["']/g, (match, spec) => {
          const resolved = path.resolve(path.dirname(abs), spec);
          const asFile = `${resolved}.mjs`;
          const asIndex = path.join(resolved, "index.mjs");
          if (!existsSync(asFile) && existsSync(asIndex)) return `from "${spec}/index.mjs"`;
          return match;
        });
        if (code !== original) await writeFile(abs, code);
      }
    }
  };
  await fixup(tree);

  return tree;
}

let treePromise = null;
function getTree() {
  if (!treePromise) treePromise = buildDomTree();
  return treePromise;
}

// Load any transpiled module from the shared tree (e.g. app/components/...).
export async function loadDomModule(relative) {
  const tree = await getTree();
  return import(pathToFileURL(path.join(tree, relative)).href);
}

export async function loadDomPage(relative) {
  return (await loadDomModule(relative)).default;
}

let localeProviderPromise = null;
export function loadLocaleProvider() {
  if (!localeProviderPromise) {
    localeProviderPromise = loadDomModule("app/components/LocaleProvider.mjs")
      .then((mod) => mod.LocaleProvider);
  }
  return localeProviderPromise;
}

// Render an element (created with React.createElement) wrapped in the real
// LocaleProvider, the way the root layout wraps every page. Returns the
// @testing-library render result.
export async function renderWithLocale(element) {
  const rtl = await setupDom();
  if (window.__locationAssigns) window.__locationAssigns.length = 0;
  return rtl.render(await wrapWithLocale(element));
}

// Wrap an element in the real LocaleProvider without rendering yet — usable
// for both the initial render and testing-library's rerender(), which
// replaces the whole tree and therefore needs the provider again.
export async function wrapWithLocale(element) {
  const LocaleProvider = await loadLocaleProvider();
  return React.createElement(LocaleProvider, null, element);
}

// Access to the next/navigation stub state (params + router.push log).
export async function setNavState(patch) {
  const mod = await loadDomModule("node_modules/next/navigation.mjs");
  mod.__setNavState(patch);
  return mod.__getNavState();
}

export async function getNavState() {
  const mod = await loadDomModule("node_modules/next/navigation.mjs");
  return mod.__getNavState();
}

// URL-state helpers (F-QA t_7b716c97, prereq F4): drive the navigation stub
// like a browser address bar — set a deep-link URL, navigate via the router,
// and walk the history with back/forward. Used by the URL-contract suite and
// by any interaction test that needs a specific initial URL (e.g. the F4
// useCameraFilters tests will deep-link into /directory?type=...).
export async function setUrlState(url) {
  const mod = await loadDomModule("node_modules/next/navigation.mjs");
  mod.__setNavState({ url });
  return mod.__getNavState();
}

export async function getUrlState() {
  const mod = await loadDomModule("node_modules/next/navigation.mjs");
  return mod.__getNavState().url;
}

export async function goBack() {
  const mod = await loadDomModule("node_modules/next/navigation.mjs");
  return mod.__goBack();
}

export async function goForward() {
  const mod = await loadDomModule("node_modules/next/navigation.mjs");
  return mod.__goForward();
}

// Access to the leaflet recording stub.
export async function leafletMarkers() {
  const mod = await loadDomModule("node_modules/leaflet/index.mjs");
  return mod.__markers;
}

// Field-of-view geometry (t_f8b775ec): the recorded polygon/circle stubs.
export async function leafletPaths() {
  const mod = await loadDomModule("node_modules/leaflet/index.mjs");
  return mod.__paths;
}

export async function leafletMaps() {
  const mod = await loadDomModule("node_modules/leaflet/index.mjs");
  return mod.__maps;
}

export async function resetLeafletMarkers() {
  const mod = await loadDomModule("node_modules/leaflet/index.mjs");
  mod.__resetMarkers();
}

// ---------------------------------------------------------------------------
// jsdom environment
// ---------------------------------------------------------------------------

let domPromise = null;

// Install a jsdom window as the global DOM and return the testing-library
// API bound to it. Safe to call once per test file (each test file runs in
// its own process under `node --test`).
export async function setupDom({ url = "https://osdb.test/" } = {}) {
  if (!domPromise) {
    const dom = new JSDOM("<!doctype html><html lang=\"en\"><head></head><body></body></html>", {
      url,
      pretendToBeVisual: true,
    });
    const { window } = dom;

    // Copy the jsdom window surface onto the Node global scope so react-dom
    // and the transpiled components see a real DOM. Some Node globals
    // (navigator, etc.) are getter-only, so those are redefined explicitly.
    //
    // AbortController/AbortSignal are deliberately NOT copied: jsdom ships
    // its own instances, and undici (used by Miniflare in the SSR/e2e halves
    // of the same test file) rejects a cross-realm signal with
    // "Expected signal to be an instance of AbortSignal". The Node native
    // AbortController is API-identical and satisfies both jsdom components
    // and undici — keep the native one on the global scope (F-QA t_7b716c97).
    const keys = [
      "window", "document", "navigator", "HTMLElement", "HTMLAnchorElement",
      "HTMLButtonElement", "HTMLInputElement", "HTMLFormElement", "HTMLSelectElement",
      "HTMLTextAreaElement", "HTMLDivElement", "HTMLUListElement", "HTMLLIElement",
      "HTMLHeadingElement", "HTMLParagraphElement", "HTMLSpanElement", "HTMLImageElement",
      "HTMLTableElement", "HTMLTimeElement", "Node", "Element", "Event", "MouseEvent",
      "KeyboardEvent", "FocusEvent", "CustomEvent", "FormData", "File", "Blob",
      "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
      "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
      "localStorage", "sessionStorage", "MutationObserver", "DOMParser", "CSS", "Comment",
    ];
    for (const key of keys) {
      if (!(key in window)) continue;
      try {
        globalThis[key] = window[key];
      } catch {
        // Getter-only / non-configurable Node global (e.g. navigator): try a
        // redefinition, and if even that fails keep the Node builtin.
        try {
          Object.defineProperty(globalThis, key, {
            value: window[key],
            writable: true,
            configurable: true,
          });
        } catch {
          /* keep the Node global as-is */
        }
      }
    }
    globalThis.window = window;
    globalThis.document = window.document;

    // Hard-navigation stub (2026-08-08): after a successful login/register
    // the auth pages call hardNavigate() from app/lib/navigate — a full
    // reload beats router.push + refresh on vinext dev, where the RSC
    // request fires but the UI stays frozen on the login page (reproduced
    // live on the pre-prod domain). jsdom cannot navigate, so the module
    // stub records the destinations in window.__locationAssigns (same
    // contract as nav.pushed) and tests assert them. The stub is written
    // into the DOM tree like the next/navigation mock (see writeTree).
    window.__locationAssigns = [];

    // jsdom does not implement matchMedia / scrollIntoView; the home page
    // uses both, but keep the polyfills here so any client module that
    // touches them does not crash the harness.
    window.matchMedia = window.matchMedia || (() => ({
      matches: false, media: "", onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    globalThis.matchMedia = window.matchMedia;
    if (!window.HTMLElement.prototype.scrollIntoView) {
      window.HTMLElement.prototype.scrollIntoView = () => {};
    }

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    domPromise = { dom, window };
  }
  const { dom, window } = domPromise;

  // @testing-library/react auto-cleanup hooks into a global afterEach.
  globalThis.afterEach = globalThis.afterEach || (await import("node:test")).afterEach;

  // t_b1e192e1: GeocodeSearch keeps its debounce timer + AbortController at
  // MODULE level on purpose (a remount must not cancel the pending geocode
  // query). That module state survives rtl.cleanup(), so a leftover 250ms
  // timer from one test must not fire into the NEXT test's fetch mock —
  // reset it after every test, in every file that uses the harness.
  globalThis.afterEach(async () => {
    try {
      const mod = await loadDomModule("app/components/home/GeocodeSearch.mjs");
      mod.__resetGeocodePending?.();
    } catch {
      // GeocodeSearch was never loaded in this file — nothing to reset.
    }
  });

  const RTL = await import("@testing-library/react");
  // user-event is imported lazily HERE (after jsdom globals are installed):
  // importing it at module top-level would load @testing-library/dom before
  // document exists, permanently binding screen to a null body.
  const userEvent = (await import("@testing-library/user-event")).default;
  return { dom, window, ...RTL, userEvent };
}

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

// Build a Response-like object the client components can consume
// (response.ok, response.status, response.json()).
export function jsonResponse(body, { status = 200, ok, headers = {} } = {}) {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    statusText: isOk ? "OK" : "Error",
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

let fetchHandler = null;

// Install the fetch mock. handler receives (input, init) and returns a
// Response-like object or a Promise thereof. The default handler answers
// every request with a 404 so a test that forgets to stub fails loudly.
export function installFetchMock(handler) {
  fetchHandler = handler;
  globalThis.fetch = async (input, init) => {
    if (!fetchHandler) return jsonResponse({ error: "no fetch stub installed" }, { status: 404 });
    return fetchHandler(input, init);
  };
}

export function clearFetchMock() {
  fetchHandler = null;
  delete globalThis.fetch;
}

// Deterministic fake of the GET /api/cameras payload: public whitelisted
// records only (verified/demo), never internal states.
export function fakeCamerasPayload(cameras) {
  return { records: cameras };
}

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------

// Remove the temp tree once the file's tests are done (node:test after hook).
after(async () => {
  if (treePromise) {
    const tree = await treePromise;
    await rm(tree, { recursive: true, force: true });
    treePromise = null;
  }
  if (domPromise) {
    domPromise.window.close();
    domPromise = null;
  }
  clearFetchMock();
});
