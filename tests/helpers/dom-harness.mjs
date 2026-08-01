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
const PAGES = [
  { source: "app/login/page.tsx", relative: "app/login/page.mjs" },
  { source: "app/register/page.tsx", relative: "app/register/page.mjs" },
  { source: "app/account/page.tsx", relative: "app/account/page.mjs" },
  { source: "app/records/[id]/page.tsx", relative: "app/records/[id]/page.mjs" },
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
  await writeFile(path.join(nodeModules, "next", "navigation.mjs"),
    `const state = { params: { id: "1" }, pushed: [] };
export const __setNavState = (patch) => { Object.assign(state, patch); };
export const __getNavState = () => state;
export const useParams = () => state.params;
export const useRouter = () => ({ push: (p) => { state.pushed.push(p); }, refresh: () => {} });
export const useSearchParams = () => new URLSearchParams();
export const usePathname = () => "/";
`);

  // --- leaflet stub: records every marker + its divIcon html --------------
  await mkdir(path.join(nodeModules, "leaflet"), { recursive: true });
  await writeFile(path.join(nodeModules, "leaflet", "package.json"), JSON.stringify({
    name: "leaflet", version: "0.0.0", type: "module",
    exports: { ".": "./index.mjs", "./package.json": "./package.json" },
  }));
  await writeFile(path.join(nodeModules, "leaflet", "index.mjs"),
    `const markers = [];
export const __markers = markers;
export const __resetMarkers = () => { markers.length = 0; };
export function map(el, opts) {
  const m = {
    setView: () => m, // chainable, like the real Leaflet map API
    on: () => {},
    remove: () => {},
    invalidateSize: () => {},
    getZoom: () => 13,
  };
  return m;
}
export const control = { zoom: () => ({ addTo: () => {} }) };
export const tileLayer = () => ({ addTo: () => {} });
export const layerGroup = () => ({ addTo: () => ({ clearLayers: () => { markers.length = 0; }, addLayer: (m) => markers.push(m) }) });
export function marker(latlng, opts) {
  const m = {
    latlng, opts,
    bindTooltip: () => m, on: () => m,
    addTo: (layer) => { layer.addLayer(m); return m; },
    // Real Leaflet API: setIcon replaces the marker icon in place. The
    // recorded opts.icon must follow so tests asserting marker html read
    // the CURRENT icon (e.g. the selected-marker status class).
    setIcon: (icon) => { m.opts = { ...m.opts, icon }; return m; },
  };
  return m;
}
export const divIcon = (opts) => opts;
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

// Access to the leaflet recording stub.
export async function leafletMarkers() {
  const mod = await loadDomModule("node_modules/leaflet/index.mjs");
  return mod.__markers;
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
    const keys = [
      "window", "document", "navigator", "HTMLElement", "HTMLAnchorElement",
      "HTMLButtonElement", "HTMLInputElement", "HTMLFormElement", "HTMLSelectElement",
      "HTMLTextAreaElement", "HTMLDivElement", "HTMLUListElement", "HTMLLIElement",
      "HTMLHeadingElement", "HTMLParagraphElement", "HTMLSpanElement", "HTMLImageElement",
      "HTMLTableElement", "HTMLTimeElement", "Node", "Element", "Event", "MouseEvent",
      "KeyboardEvent", "FocusEvent", "CustomEvent", "AbortController", "AbortSignal",
      "FormData", "File", "Blob", "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
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
export function jsonResponse(body, { status = 200, ok } = {}) {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    statusText: isOk ? "OK" : "Error",
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
