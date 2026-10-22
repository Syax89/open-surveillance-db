/**
 * M05 (design review 2026-10-22, P2) — the public record page wears hero
 * typography for operational content, and repeats the import source.
 *
 * Evidence: at 390px the record title was 42px across three lines (~134px
 * tall), the mini map only started at y=1005, and an imported record showed
 * the same full source name twice ("Imported from" provenance line AND the
 * "Source" fact).
 *
 * Contract asserted here:
 *   1. the smaller mobile title is scoped to the PUBLIC RECORD caller only
 *      (`.record-page[data-surface="record"]`), never the shared
 *      `.record-detail h1` that InfoPage/SourcesPage also use; the global
 *      desktop token and the global mobile clamp stay untouched;
 *   2. "← Back to directory" is allowed to stay on ONE line from 360px up
 *      while the ≤360px layout keeps wrapping (no 320px overflow);
 *   3. an imported record keeps its provenance intact — original source URL
 *      link, licence text + licence link — but the full source name is NOT
 *      repeated in the facts (a generic "Imported data" fact takes its
 *      place); ordinary community reports and the demo seed keep their own
 *      source facts.
 *
 * The rendered-HTML contracts (record-page shell, licence attribution) stay
 * meaningful: this suite adds assertions, it does not relax any.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomPage, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

let rtl;
let RecordPage;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  RecordPage = await loadDomPage("app/records/[id]/RecordPageBody.mjs");
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
});

const SOURCE_NAME = "Fixture Open Data (test)";
const SOURCE_URL = "https://example.invalid/fixture";
const LICENSE = "ODbL 1.0";
const LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/";

const BASE = {
  id: 7,
  title: "Fixture Record Title",
  kind: "Fixed dome",
  status: "active",
  latitude: 41.9004,
  longitude: 12.4936,
  source: "Community report",
  updated: "2026-08-08T00:00:00.000Z",
  createdAt: "2026-03-01T00:00:00.000Z",
  description: "Fictitious public record used only in layout tests.",
  address: "Illustrative location, Rome",
};

const IMPORTED = {
  ...BASE,
  source: "import:fixture-source-2026",
  lastVerifiedAt: null,
  importBatch: { sourceName: SOURCE_NAME, sourceUrl: SOURCE_URL, license: LICENSE, licenseUrl: LICENSE_URL },
};

const DEMO = { ...BASE, status: "demo", source: "Development seed" };

function handler(record) {
  return (input) => {
    const single = typeof input === "string" && input.match(/^\/api\/cameras\/(\d+)$/);
    if (single) return Number(single[1]) === record.id ? jsonResponse({ record }) : jsonResponse({ error: "not found" }, { status: 404 });
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/events$/)) return jsonResponse({ events: [] });
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/actions$/)) return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

async function renderRecord(record) {
  installFetchMock(handler(record));
  await setNavState({ params: { id: String(record.id) } });
  const view = await renderWithLocale(React.createElement(RecordPage));
  await view.findByText(record.title);
  return view;
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

function declaration(block, property) {
  const match = block.match(new RegExp(`(?:^|;)\\s*${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+)`));
  assert.ok(match, `expected ${property} declaration in:\n${block}`);
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// 1) Scoped mobile title
// ---------------------------------------------------------------------------

test("the smaller mobile title is scoped to the public record caller", async () => {
  const css = await readSource("app/globals.css");

  // Global (shared) rules stay exactly as accepted: desktop token + mobile clamp.
  assert.match(css, /\.record-detail h1 \{[^}]*font-size:var\(--text-display\)/, "the shared desktop title token is untouched");
  assert.match(css, /\.record-detail h1 \{\s*font-size:clamp\(36px,12vw,42px\)/, "the shared mobile clamp is untouched");

  // The public record caller gets its own smaller title, applied inside the
  // mobile block and scoped by the shell's data-surface marker.
  const mobile = mediaBlocks(css, "max-width", "700px").join("\n");
  const scoped = ruleBlocks(mobile, '.record-page[data-surface="record"] .record-detail h1')[0];
  assert.ok(scoped, "expected a public-record-scoped mobile h1 rule");
  const size = declaration(scoped, "font-size");
  const max = Number(size.match(/,\s*(\d+(?:\.\d+)?)px\s*\)/)?.[1] ?? NaN);
  assert.ok(Number.isFinite(max) && max <= 34, `the mobile title must drop below the 36px shared floor (got ${size})`);
  assert.ok(max >= 24, `the title must stay readable (got ${size})`);

  // InfoPage still declares itself as a different surface → never matched.
  const infoPage = await readSource("app/components/InfoPage.tsx");
  assert.match(infoPage, /className="record-page" data-surface="info"/, "InfoPage keeps its own surface marker");
});

test("the public record shell carries the scoping marker and keeps its existing class", async () => {
  const source = await readSource("app/records/[id]/RecordPageBody.tsx");
  assert.match(source, /className="record-page" data-surface="record"/, "the record shell opts into the scoped mobile typography");
  assert.match(source, /<section className="record-detail" aria-live="polite">/, "the shared record-detail surface is unchanged");
});

test("back-to-list stays on one line from 360px, still wrapping below that", async () => {
  const css = await readSource("app/globals.css");
  const wide = mediaBlocks(css, "min-width", "360px").join("\n");
  const rule = ruleBlocks(wide, '.record-page[data-surface="record"] .nav-record-actions .text-button')[0];
  assert.ok(rule, "expected the scoped one-line rule");
  assert.equal(declaration(rule, "white-space"), "nowrap", "the back link does not wrap from 360px up");
  assert.equal(declaration(rule, "max-width"), "none", "the 105px cap that forced the wrap is lifted");
  // The ≤700px cap stays for the narrowest screens (320px must not overflow).
  const mobile = mediaBlocks(css, "max-width", "700px").join("\n");
  assert.match(mobile, /\.nav-record-actions \.text-button \{ max-width:105px;text-align:right \}/, "the narrow-screen cap stays for 320px");
});

// ---------------------------------------------------------------------------
// 2) Imported provenance consolidated, not duplicated
// ---------------------------------------------------------------------------

test("an imported record keeps source URL + licence but does not repeat the source name in the facts", async () => {
  const view = await renderRecord(IMPORTED);
  const html = view.container.innerHTML;

  // Provenance keeps the attribution: original dataset URL + licence text + link.
  const provenance = view.container.querySelector(".record-provenance");
  assert.ok(provenance, "the provenance line renders for imported rows");
  const sourceLink = provenance.querySelector(`a[href="${SOURCE_URL}"]`);
  const licenseLink = provenance.querySelector(`a[href="${LICENSE_URL}"]`);
  assert.ok(sourceLink, "the original source URL link is preserved");
  assert.equal(sourceLink.textContent, SOURCE_NAME, "the provenance line names the dataset");
  assert.ok(licenseLink, "the licence link is preserved");
  assert.equal(licenseLink.textContent, LICENSE, "the licence text is preserved");

  // The full source name appears ONCE (provenance), never again in the facts.
  const occurrences = html.split(SOURCE_NAME).length - 1;
  assert.equal(occurrences, 1, `the source name must not be duplicated (found ${occurrences})`);
  const facts = view.container.querySelector(".record-detail-facts");
  assert.ok(facts, "the facts grid renders");
  assert.ok(!facts.textContent.includes(SOURCE_NAME), "the facts must not repeat the source name");
  assert.match(facts.textContent, /Imported data/, "the source fact states it is imported data");
});

test("community reports and the demo seed keep their own source facts", async () => {
  const community = await renderRecord(BASE);
  const communityFacts = community.container.querySelector(".record-detail-facts")?.textContent ?? "";
  assert.match(communityFacts, /Community report/, "a community report keeps its source fact");
  assert.doesNotMatch(communityFacts, /Imported data/, "a community report is not labelled as imported");

  rtl.cleanup();
  const demo = await renderRecord(DEMO);
  const demoFacts = demo.container.querySelector(".record-detail-facts")?.textContent ?? "";
  assert.match(demoFacts, /Illustrative seed/, "the demo seed keeps its illustrative source label");
  assert.equal(demo.container.querySelector(".record-provenance"), null, "demo rows carry no import provenance");
});
