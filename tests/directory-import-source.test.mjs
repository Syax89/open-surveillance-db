/**
 * /directory cards — readable import provenance (ID 1, bounded mobile follow-up).
 *
 * The list API exposes an imported row's `source` as the raw internal value
 * ('import:<slug>'). On a phone the /directory card must show the READABLE
 * attribution the batch already publishes (entity name from
 * GET /api/import-sources — the same data /fonti and the map popup use),
 * never the internal slug, and never a guessed/prettified name.
 *
 * Contract asserted here:
 *   1. a known batch renders the real source name in the source fact, with the
 *      raw value kept in the markup for desktop;
 *   2. an unknown batch, a community report and the demo seed keep their
 *      truthful value at every width (raw / localized label);
 *   3. ONE request for the whole list (module-level single-flight cache) —
 *      never one request per card — and a late resolution after unmount is
 *      dropped instead of writing into a dead tree;
 *   4. a failing endpoint degrades to the raw value (no crash, no invented
 *      attribution);
 *   5. CSS: the readable name is a <=700px-only swap on this caller; the base
 *      (desktop) rule keeps the raw value, and the raw value stays visible at
 *      every width when no readable name exists.
 *
 * Fixtures are fictitious (example.test addresses, made-up batches).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, camerasApiResponse,
  renderWithLocale, setUrlState, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

let rtl;
let DirectoryTool;
let __resetImportSourcesCache;
let __resetPublicCamerasCache;

const READABLE = "Fixture City — Open Data";
const SOURCES = [
  {
    slug: "fixture-batch",
    sourceName: READABLE,
    sourceUrl: "https://example.invalid/datasets/cameras",
    license: "CC0 1.0",
    licenseUrl: "https://example.invalid/licenses/cc0",
  },
];

const RECORDS = [
  {
    id: 1, title: "Via Example corner", kind: "Fixed dome", status: "active",
    latitude: 41.9028, longitude: 12.4964, source: "import:fixture-batch",
    updated: "2026-07-01", address: "Via Example 1",
  },
  {
    id: 2, title: "Piazza Fixture", kind: "Bullet", status: "active",
    latitude: 41.8958, longitude: 12.4823, source: "import:unknown-batch",
    updated: "2026-07-01", address: "Piazza Fixture 3",
  },
  {
    id: 3, title: "Community corner", kind: "Fixed dome", status: "active",
    latitude: 41.9, longitude: 12.49, source: "Community report",
    updated: "2026-07-01", address: "Via Community 5",
  },
  {
    id: 4, title: "Seed example", kind: "Bullet", status: "demo",
    latitude: 41.91, longitude: 12.5, source: "Development seed",
    updated: "2026-07-01", address: "Via Seed 7",
  },
];

before(async () => {
  rtl = await setupDom();
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  __resetImportSourcesCache = (await loadDomModule("app/lib/import-sources.mjs")).__resetImportSourcesCache;
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetImportSourcesCache();
  __resetPublicCamerasCache();
  if (typeof window !== "undefined") window.localStorage.removeItem("opensurveillancedb-locale");
});

/** Render /directory with a controllable /api/import-sources answer. */
async function renderDirectory({ sources = SOURCES, sourcesResponse = null, onSources = null } = {}) {
  const calls = { sources: 0 };
  await setUrlState("/directory");
  installFetchMock((input) => {
    const url = new URL(String(input), "https://osdb.test");
    if (url.pathname === "/api/import-sources") {
      calls.sources += 1;
      onSources?.(calls.sources);
      if (sourcesResponse) return sourcesResponse;
      return jsonResponse({ sources });
    }
    return camerasApiResponse(input, RECORDS);
  });
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.equal(view.container.querySelectorAll("ul.record-list li").length, 4), { timeout: 5000 });
  return { view, calls };
}

/** The <dd> of the "Source" fact for the card of a record id. */
function sourceFact(view, id) {
  const cards = [...view.container.querySelectorAll("ul.record-list li .record-list-card")];
  for (const card of cards) {
    const rows = [...card.querySelectorAll("dl > div")];
    const row = rows.find((item) => item.querySelector("dt")?.textContent === "Source");
    const recordLink = card.querySelector('a[href^="/records/"]');
    if (row && recordLink?.getAttribute("href") === `/records/${id}`) {
      return { card, dd: row.querySelector("dd"), row };
    }
  }
  return null;
}

test("a known import batch renders its real source name, with the raw value kept for desktop", async () => {
  const { view, calls } = await renderDirectory();
  const fact = sourceFact(view, 1);
  assert.ok(fact, "the imported record keeps its Source fact");
  assert.equal(fact.dd.querySelector(".record-source-name")?.textContent, READABLE, "the readable attribution is rendered");
  assert.equal(fact.dd.querySelector(".record-source-raw")?.textContent, "import:fixture-batch", "the raw value stays in the markup");
  assert.ok(fact.dd.querySelector(".record-source.has-name"), "the has-name hook drives the mobile swap");
  assert.equal(calls.sources, 1, "one metadata request for the whole list");
});

test("unknown batch, community report and demo seed keep their truthful values", async () => {
  const { view } = await renderDirectory();
  const unknown = sourceFact(view, 2);
  assert.equal(unknown.dd.querySelector(".record-source-name"), null, "an unknown slug is never prettified into a name");
  assert.equal(unknown.dd.textContent, "import:unknown-batch", "the raw value is the truthful fallback");

  const community = sourceFact(view, 3);
  assert.equal(community.dd.querySelector(".record-source-name"), null, "non-import sources have no batch to resolve");
  assert.equal(community.dd.textContent, "Community report");

  const demo = sourceFact(view, 4);
  assert.equal(demo.dd.querySelector(".record-source-name"), null, "the demo seed never resolves through import metadata");
  assert.equal(demo.dd.textContent, "Illustrative seed", "the localized demo label is unchanged");
});

test("the list never requests the metadata per card, and a remount reuses the cache", async () => {
  const { view, calls } = await renderDirectory();
  assert.equal(calls.sources, 1, "four cards, one request");
  assert.equal(view.container.querySelectorAll(".record-source-name").length, 1, "only the resolved record shows a name");

  // A second mount (route revisit) reuses the module-level cache.
  view.unmount();
  let second;
  await rtl.act(async () => {
    second = await renderWithLocale(React.createElement(DirectoryTool));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await rtl.waitFor(() => assert.equal(second.container.querySelectorAll("ul.record-list li").length, 4), { timeout: 5000 });
  assert.equal(calls.sources, 1, "the shared cache answers the second list — no new request");
});

test("a failing metadata endpoint degrades to the raw value without crashing", async () => {
  const { view } = await renderDirectory({ sourcesResponse: jsonResponse({ error: "unavailable" }, { status: 500 }) });
  const fact = sourceFact(view, 1);
  assert.ok(fact, "the list still renders");
  assert.equal(fact.dd.querySelector(".record-source-name"), null, "no attribution is invented when the endpoint fails");
  assert.equal(fact.dd.textContent, "import:fixture-batch", "the raw value stays truthful");
});

test("a resolution that lands after unmount never writes into the removed list", async () => {
  let resolveSources;
  const calls = { sources: 0 };
  await setUrlState("/directory");
  installFetchMock((input) => {
    const url = new URL(String(input), "https://osdb.test");
    if (url.pathname === "/api/import-sources") {
      calls.sources += 1;
      return new Promise((resolve) => { resolveSources = resolve; });
    }
    return camerasApiResponse(input, RECORDS);
  });
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.equal(view.container.querySelectorAll("ul.record-list li").length, 4), { timeout: 5000 });
  assert.equal(calls.sources, 1, "the metadata request is in flight");
  assert.equal(view.container.querySelectorAll(".record-source-name").length, 0, "the raw value renders while resolving");

  view.unmount();
  resolveSources(jsonResponse({ sources: SOURCES }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(view.container.querySelectorAll(".record-source-name").length, 0, "the late answer is dropped (no stale/unmounted update)");
});

/** Every `@media (max-width:700px)` block body (same parser as directory-mobile-density). */
function media700(css) {
  const matcher = /@media\s*\(\s*max-width\s*:\s*700px\s*\)\s*\{/g;
  const blocks = [];
  while (matcher.exec(css)) {
    let depth = 1;
    let cursor = matcher.lastIndex;
    const bodyStart = cursor;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth === 0) blocks.push(css.slice(bodyStart, cursor - 1));
  }
  return blocks;
}

/** The CSS with every @media block removed: the base/desktop declarations. */
function baseScope(css) {
  let out = "";
  let index = 0;
  while (index < css.length) {
    const at = css.indexOf("@media", index);
    if (at === -1) { out += css.slice(index); break; }
    out += css.slice(index, at);
    let cursor = css.indexOf("{", at);
    if (cursor === -1) break;
    let depth = 1;
    cursor += 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    index = cursor;
  }
  return out;
}

test("CSS: the readable name is a mobile-only swap on /directory cards", async () => {
  const css = await readSource("app/globals.css");
  const base = baseScope(css);
  const mobile = media700(css).join("\n");

  assert.match(
    base,
    /\.directory-tool \.record-list \.record-list-card \.record-source-name\s*\{\s*display\s*:\s*none;?\s*\}/,
    "desktop keeps rendering the raw source value (the readable name is not painted)",
  );
  assert.match(
    mobile,
    /\.directory-tool \.record-list \.record-list-card \.record-source-name\s*\{\s*display\s*:\s*inline;?\s*\}/,
    "the <=700px card shows the readable name",
  );
  assert.match(
    mobile,
    /\.directory-tool \.record-list \.record-list-card \.record-source\.has-name \.record-source-raw\s*\{\s*display\s*:\s*none;?\s*\}/,
    "the raw value is hidden only when a readable name exists (truthful fallback otherwise)",
  );
});
