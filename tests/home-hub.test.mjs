/**
 * Home hub QA suite (F2, kanban t_52dcb95e).
 *
 * The home is an orienteering hub (docs/FRONTEND_PLAN.md §1.2/2.4): hero +
 * static MapTeaser + four tool cards + shortened principles. Criterio di
 * review (acceptance 7.2): the home MUST work without JS and without a client data
 * dependency — SSR-pure. This suite pins that contract on the real page:
 *
 *   1. SSR render of app/page.tsx completes with NO fetch at all — the
 *      renderToString must not touch /api/cameras (usePublicCount is a
 *      client island: its fetch lives in useEffect, which never runs in
 *      SSR; the hero stat renders the neutral placeholder);
 *   2. the four tool cards link the right routes (/mappa /directory
 *      /segnala /correggi) and the teaser CTA points at /mappa;
 *   3. zero Leaflet on the hub: the SSR markup contains no map instance
 *      (no leaflet-container / marker divs) and no legacy tool sections;
 *   4. heading ladder + exactly one h1 (a11y baseline, same as the other
 *      render suites);
 *   5. client-side: usePublicCount performs exactly ONE fetch
 *      (/api/cameras?limit=1) and exposes the server total; the hub keeps
 *      working with a failed fetch (placeholder stays, no fake number).
 *
 * Same transpile-tree approach as tests/pages-render.test.mjs (mock next
 * stubs, real i18n bundles) so the assertions run on the real page source.
 *
 * Fixtures are fictitious (no personal data).
 */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToString } from "react-dom/server";
import React from "react";
import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { setupDom, loadDomModule, installFetchMock, jsonResponse, setNavState } from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HOME_PAGE = { route: "/", source: "app/page.tsx", relative: "app/page.mjs" };

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

function rewriteSpecifiers(code) {
  let out = code.replace(
    /(from\s*["'])(\.\.?\/[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) =>
      specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
  );
  out = out.replace(/from\s*["'](\.[^"']+)\/index\.mjs["']/g, (m, spec) => `from "${spec}/index.mjs"`);
  return out;
}

async function buildRenderTree() {
  const tree = await mkdtemp(path.join(root, "tests", ".hub-render-tmp-"));
  const nodeModules = path.join(tree, "node_modules");
  await mkdir(path.join(nodeModules, "next"), { recursive: true });
  await writeFile(path.join(nodeModules, "next", "package.json"), JSON.stringify({
    name: "next", version: "0.0.0", type: "module",
    exports: {
      "./link": "./link.mjs", "./link.js": "./link.mjs",
      "./navigation": "./navigation.mjs", "./navigation.js": "./navigation.mjs",
      "./headers": "./headers.mjs", "./headers.js": "./headers.mjs",
      ".": "./link.mjs",
    },
  }));
  await writeFile(path.join(nodeModules, "next", "link.mjs"),
    `import React from "react";
export default function Link({ href, children, ...rest }) {
  return React.createElement("a", { href, ...rest }, children);
}
`);
  await writeFile(path.join(nodeModules, "next", "navigation.mjs"),
    `export const useParams = () => ({ id: "1" });
export const useRouter = () => ({ push: () => {}, refresh: () => {} });
export const useSearchParams = () => new URLSearchParams();
export const usePathname = () => "/";
`);
  await writeFile(path.join(nodeModules, "next", "headers.mjs"),
    `export const cookies = async () => ({ get: () => undefined, getAll: () => [], has: () => false });
export const headers = async () => new Headers();
`);
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
  sources.push({ abs: path.join(root, HOME_PAGE.source), out: HOME_PAGE.relative });
  for (const { abs, out } of sources) {
    const outPath = path.join(tree, out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, rewriteSpecifiers(transpile(abs)));
  }
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
  if (!treePromise) treePromise = buildRenderTree();
  return treePromise;
}

function extractHeadings(html) {
  const out = [];
  const re = /<h([1-6])[^>]*>(.*?)<\/h\1>/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ level: Number(m[1]), text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. SSR-pure: the hub renders without ANY client data dependency
// ---------------------------------------------------------------------------

test("SSR render of the home hub completes without any fetch (no client data dependency)", async () => {
  const tree = await getTree();
  const mod = await import(pathToFileURL(path.join(tree, HOME_PAGE.relative)).href);
  const Page = mod.default;
  const localeMod = await import(pathToFileURL(path.join(tree, "app/components/LocaleProvider.mjs")).href);
  const LocaleProvider = localeMod.LocaleProvider;

  // Any fetch during the SSR render is a contract violation: the hub must
  // render completely from the server bundle (review criterion).
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("the SSR render of the home hub must not fetch");
  };
  try {
    const element = Page.constructor.name === "AsyncFunction" ? await Page() : React.createElement(Page);
    const html = renderToString(React.createElement(LocaleProvider, null, element));
    assert.ok(html.length > 0, "HTML prodotto");
    assert.ok(!fetchCalled, "SSR render must not call fetch (usePublicCount runs client-side only)");
    return html;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the hub SSR markup carries hero, the four tool cards and NO map teaser (removed as redundant, CEO 2026-08-07)", async () => {
  const html = await runSsrHome();
  // Hero headline + CTA row.
  assert.match(html, /<h1>Public data about public surveillance\.<\/h1>/, "hero h1");
  assert.match(html, /<form(?=[^>]*class="hero-search")(?=[^>]*action="\/directory")(?=[^>]*role="search")[^>]*>/, "hero directory search");
  assert.match(html, /name="q"/, "hero search sends the directory query parameter");
  assert.match(html, /href="\/mappa">Explore the map/, "hero CTA → /mappa");
  assert.match(html, /href="\/segnala">Report a camera/, "hero CTA → /segnala");
  assert.match(html, /href="\/fonti">See sources and methodology/, "hero links to sources and methodology");
  // The static MapTeaser was removed (CEO 2026-08-07): the /mappa tool card
  // is the map entry point — the teaser text+image was redundant.
  assert.doesNotMatch(html, /class="map-teaser"/, "no static map teaser on the hub");
  assert.doesNotMatch(html, /Explore the interactive map/, "no teaser headline");
  // The hero stat renders the neutral SSR placeholder (no invented number).
  // role="status" lives on a separate sr-only live region (mounted only when
  // the count resolves), NOT on the <dt> — axe forbids role="status" on
  // <dt> (aria-allowed-role) and it breaks the <dl> model (definition-list).
  assert.match(html, /<dt>—<\/dt>/, "SSR stat must be the neutral placeholder");
  assert.doesNotMatch(html, /<dt role="status">/, "the live region must not be on the dt");
  // Four tool cards.
  const cards = [...html.matchAll(/class="tool-card"/g)];
  assert.equal(cards.length, 4, "expected exactly four tool cards");
  // Shortened principles + manifesto link.
  assert.match(html, /class="principles"/, "principles block kept");
  assert.match(html, /href="\/manifesto">Read the manifesto/, "principles link → /manifesto");
});

test("the four tool cards link the correct tool routes", async () => {
  const html = await runSsrHome();
  for (const href of ["/mappa", "/directory", "/segnala", "/correggi"]) {
    assert.ok(html.includes(`href="${href}"`), `expected a tool-card link to ${href}`);
  }
  // Card titles come from the home bundle (EN pilot).
  assert.match(html, />Map<\/span>/, "map card title");
  assert.match(html, />Directory<\/span>/, "directory card title");
  assert.match(html, />Report a camera<\/span>/, "report card title");
  assert.match(html, />Correct a record<\/span>/, "correction card title");
});

test("zero Leaflet on the hub: no map instance, no legacy tool sections", async () => {
  const html = await runSsrHome();
  // No interactive map artifacts in the markup (the map lives on /mappa).
  assert.doesNotMatch(html, /leaflet-container|leaflet-marker|_leaflet/, "no Leaflet instance on the hub");
  assert.doesNotMatch(html, /id="map-region"/, "no map region on the hub");
  assert.doesNotMatch(html, /id="record-search"/, "no directory search on the hub");
  assert.doesNotMatch(html, /id="report-form"|id="correction-form"/, "no forms on the hub");
  // The page source must not import the map/directory/form components
  // (check only the import statements — the doc comment may mention them).
  const source = readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const imports = source.split("\n").filter((line) => line.trim().startsWith("import ")).join("\n");
  assert.doesNotMatch(imports, /SurveillanceMap|MapPanel|PublicDirectory|ReportForm|CorrectionForm/, "the hub page must not import the tool components");
});

test("the hub SSR markup keeps the a11y baseline (one h1, no skipped levels)", async () => {
  const html = await runSsrHome();
  const headings = extractHeadings(html);
  const h1 = headings.filter((h) => h.level === 1);
  assert.equal(h1.length, 1, `atteso esattamente 1 h1, trovati ${h1.length}`);
  let prev = headings[0].level;
  for (let i = 1; i < headings.length; i++) {
    assert.ok(headings[i].level <= prev + 1, `salto h${prev} -> h${headings[i].level}`);
    prev = headings[i].level;
  }
  // main#main-content + locale toggle (same contracts as pages-render).
  assert.match(html, /id="main-content"/, "main#main-content presente");
  assert.match(html, /class="locale-toggle"/, "toggle EN/IT presente");
});

// SSR smoke shared helper (runs the no-fetch render once per call).
let ssrHtmlCache = null;
async function runSsrHome() {
  if (ssrHtmlCache) return ssrHtmlCache;
  const tree = await getTree();
  const mod = await import(pathToFileURL(path.join(tree, HOME_PAGE.relative)).href);
  const Page = mod.default;
  const localeMod = await import(pathToFileURL(path.join(tree, "app/components/LocaleProvider.mjs")).href);
  const LocaleProvider = localeMod.LocaleProvider;
  const element = Page.constructor.name === "AsyncFunction" ? await Page() : React.createElement(Page);
  ssrHtmlCache = renderToString(React.createElement(LocaleProvider, null, element));
  return ssrHtmlCache;
}

test("cleanup albero temporaneo hub", async () => {
  if (treePromise) {
    const tree = await treePromise;
    await rm(tree, { recursive: true, force: true });
    treePromise = null;
  }
  assert.ok(true);
});

// ---------------------------------------------------------------------------
// 2. Client: usePublicCount = exactly ONE fetch → server total
// ---------------------------------------------------------------------------

let rtl;
let usePublicCountMod;

before(async () => {
  rtl = await setupDom();
  usePublicCountMod = await loadDomModule("app/lib/use-public-count.mjs");
});

afterEach(() => {
  rtl?.cleanup();
  setNavState({ pushed: [], search: "" });
});

test("usePublicCount performs exactly one fetch (/api/cameras?limit=1) and exposes the server total", async () => {
  const { renderHook, waitFor } = rtl;
  const calls = [];
  installFetchMock(async (input) => {
    calls.push(String(input));
    return jsonResponse({ records: [{ id: 1 }], total: 42, nextOffset: null });
  });
  const { result } = renderHook(() => usePublicCountMod.usePublicCount());
  await waitFor(() => assert.equal(result.current.total, 42));
  assert.deepEqual(calls, ["/api/cameras?limit=1"], "usePublicCount must make exactly one lightweight fetch");
});

test("usePublicCount keeps the neutral placeholder on a failed fetch (no fake number)", async () => {
  const { renderHook, waitFor } = rtl;
  installFetchMock(async () => {
    throw new Error("network down");
  });
  const { result } = renderHook(() => usePublicCountMod.usePublicCount());
  await waitFor(() => assert.equal(result.current.loading, false));
  assert.equal(result.current.total, null, "a failed fetch must keep total null (placeholder)");
});
