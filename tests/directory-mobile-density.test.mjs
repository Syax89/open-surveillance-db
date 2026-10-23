/**
 * M04 (design review 2026-10-22, P2) — the /directory list is ordered but
 * slow to scan on a phone.
 *
 * Evidence: at 390px the first card began at y=560 and was ~304px tall (an
 * 844px viewport does not contain it); at 320px it began at y=610 and was
 * ~376px tall. Opening the filters pushed the results heading to y=898.
 * Above the first card: explorer toolbar, search/filter controls, results
 * heading + count, the A–Z rail, then a card with six facts.
 *
 * Contract asserted here:
 *   1. the mobile (≤700px) /directory caller compacts the spacing ABOVE the
 *      first card (results heading, section padding, card gap/padding) and
 *      the card's fact density — desktop geometry untouched;
 *   2. the card still leads with title / kind / location and still exposes
 *      the two native actions (map + record link) with ≥44px targets, even
 *      when the Italian labels wrap to two rows;
 *   3. nothing becomes a whole-card link, no pagination/filter contract
 *      changes, and the source + status stay readable/announced.
 *
 * Device pixel proof is the controller's browser pass; this pins the CSS
 * deltas and the rendered card contract.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomModule, installCamerasApiMock, renderWithLocale, setUrlState, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

let rtl;
let DirectoryTool;
let __resetPublicCamerasCache;

const RECORDS = [
  {
    id: 1,
    title: "Corner shop entrance",
    kind: "Fixed dome",
    status: "active",
    latitude: 41.9004,
    longitude: 12.4936,
    source: "Community report",
    updated: "2026-07-01",
    description: "Illustrative fixture record.",
    address: "Via Roma 1",
    manufacturer: "Acme Cameras",
  },
  {
    id: 2,
    title: "Main square pillar",
    kind: "Bullet",
    status: "active",
    latitude: 41.9047,
    longitude: 12.5031,
    source: "Community report",
    updated: "2026-06-15",
    description: "Illustrative fixture record.",
    address: "Piazza Centrale 3",
  },
];

before(async () => {
  rtl = await setupDom();
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
});

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

const px = (value) => {
  const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  assert.ok(match, `expected a pixel value, got ${value}`);
  return Number(match[1]);
};

/** The mobile block that already owns the directory card overrides. */
async function mobileDirectoryBlock() {
  const css = await readSource("app/globals.css");
  const block = mediaBlocks(css, "max-width", "700px").find((item) => item.includes(".directory-tool .record-list .record-list-card"));
  assert.ok(block, "expected the ≤700px directory card overrides");
  return { css, block };
}

// ---------------------------------------------------------------------------
// 1) Mobile density contract (spacing above the first card + inside it)
// ---------------------------------------------------------------------------

test("mobile compaction reduces the vertical budget above the first card", async () => {
  const { block } = await mobileDirectoryBlock();

  // Results heading block: margin-top/padding-top were 24px/18px on desktop.
  const results = ruleBlocks(block, ".directory-tool .directory-explorer-card .directory-results")[0]
    ?? ruleBlocks(block, ".directory-tool .directory-results")[0];
  assert.ok(results, "the results header spacing is overridden on mobile");
  const marginTop = declaration(results, "margin-top");
  const paddingTop = declaration(results, "padding-top");
  assert.ok(px(marginTop) <= 16, `results margin-top must shrink (got ${marginTop})`);
  assert.ok(px(paddingTop) <= 12, `results padding-top must shrink (got ${paddingTop})`);

  // Section paddings around the list.
  const section = ruleBlocks(block, ".directory-tool .directory-explorer-card .records-section")[0];
  assert.ok(section, "the section padding is overridden on mobile");
  const sectionPadding = declaration(section, "padding").split(/\s+/);
  assert.ok(Number(sectionPadding[1]?.replace("px", "")) <= 14, `section side padding must shrink (got ${declaration(section, "padding")})`);
  assert.ok(Number(sectionPadding[2]?.replace("px", "")) <= 20, `section bottom padding must shrink (got ${declaration(section, "padding")})`);
});

test("mobile card density: tighter card box and a two-column fact grid", async () => {
  const { block } = await mobileDirectoryBlock();
  const card = ruleBlocks(block, ".directory-tool .record-list .record-list-card")[0];
  assert.ok(card, "the card override exists on mobile");

  // Padding shrunk from the desktop var(--space-5)/var(--space-6) (20/28px).
  const padding = declaration(card, "padding").split(/\s+/);
  assert.ok(Number(padding[0].replace("px", "")) <= 12, `card padding-top must shrink (got ${declaration(card, "padding")})`);
  const gap = declaration(card, "gap");
  assert.ok(px(gap) <= 10, `card gap must shrink (got ${gap})`);

  // Facts become a compact two-column grid instead of a long wrapping row
  // (six facts stacked made the card ~304-376px tall on a phone).
  const facts = ruleBlocks(block, ".directory-tool .record-list .record-list-card dl")[0];
  assert.ok(facts, "the fact list gets a mobile rule");
  assert.equal(declaration(facts, "display"), "grid");
  assert.match(declaration(facts, "grid-template-columns"), /repeat\(2/, "two fact columns on a phone");
  assert.ok(px(declaration(facts, "gap").split(/\s+/)[0]) <= 6, "fact rows are tightly spaced");

  // The title stays the leading element and the kind keeps its line.
  const title = ruleBlocks(block, ".directory-tool .record-list .record-list-card h3")[0];
  assert.ok(title, "the card title is scoped on mobile");
  assert.match(declaration(title, "font-size"), /var\(--text-/, "the title uses a token, not a magic number");
});

test("mobile card keeps both native actions with 44px targets and no whole-card link", async () => {
  const { css, block } = await mobileDirectoryBlock();
  const actions = ruleBlocks(block, ".directory-tool .record-list .record-list-card .record-list-actions")[0];
  assert.ok(actions, "the action row keeps its mobile rule");
  assert.equal(declaration(actions, "flex-wrap"), "wrap", "action links may wrap to two rows (IT labels)");
  assert.equal(declaration(actions, "flex-direction"), "row", "the actions stay one wrap-capable row");
  // 44px target floor is declared in the base (desktop) rule and never undone.
  assert.match(css, /\.directory-tool \.record-list \.record-list-card \.text-button \{\s*min-height:44px/, "action links stay ≥44px");
  assert.doesNotMatch(block, /\.record-list-actions[^{]*\{[^}]*min-height/, "mobile must not shrink the action targets");
});

// ---------------------------------------------------------------------------
// 2) Rendered card contract (EN + IT)
// ---------------------------------------------------------------------------

async function renderDirectory(locale = "en") {
  await setUrlState("/directory");
  installCamerasApiMock(RECORDS);
  if (locale !== "en") window.localStorage.setItem("opensurveillancedb-locale", locale);
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.equal(view.container.querySelectorAll("ul.record-list li").length, 2), { timeout: 5000 });
  return view;
}

test("the card leads with title, kind and location and keeps the two action links", async () => {
  const view = await renderDirectory("en");
  const card = view.container.querySelector("ul.record-list li .record-list-card");
  assert.ok(card, "the card is the shared RecordCard article (never an <a> wrapping it)");
  assert.equal(card.tagName, "ARTICLE", "no whole-card clickable element");

  // Reading order inside the card: title, then kind, then the facts.
  const title = card.querySelector("h3");
  const kind = card.querySelector(".record-kind");
  const facts = card.querySelector("dl");
  assert.ok(title && kind && facts, "title, kind and facts all render");
  assert.equal(title.textContent, "Corner shop entrance");
  assert.equal(kind.textContent, "Fixed dome");
  assert.ok(facts.textContent.includes("Via Roma 1"), "the location stays on the card");
  assert.ok(facts.textContent.includes("Community report"), "the source stays readable on the card");
  assert.ok(card.textContent.includes("Active"), "the status stays readable on the card");
  assert.ok(card.textContent.includes("Last update"), "the update date keeps its own label (M03)");

  // Two NATIVE actions: a button (show on map) and a real link (open record).
  const actions = card.querySelector(".record-list-actions");
  const mapButton = actions.querySelector("button.text-button");
  const recordLink = actions.querySelector("a.text-button");
  assert.ok(mapButton, "the map action stays a native button");
  assert.equal(recordLink?.getAttribute("href"), "/records/1", "the record action stays a real link");
  assert.equal(actions.querySelectorAll("a, button").length, 2, "exactly the two accepted actions");
  assert.equal(card.querySelectorAll("a").length, 1, "the card itself is not a link");
});

test("the Italian card keeps both labelled actions readable when they wrap", async () => {
  // IT labels are longer ("Mostra sulla mappa", "Apri record") — they may
  // wrap to two rows, but never lose their text or their native semantics.
  const view = await renderDirectory("it");
  const card = view.container.querySelector("ul.record-list li .record-list-card");
  const actions = card.querySelector(".record-list-actions");
  assert.match(actions.textContent, /Mostra sulla mappa/, "the map action label survives");
  assert.match(actions.textContent, /Apri record/, "the record action label survives");
  assert.ok(actions.querySelector("button"), "still a button");
  assert.ok(actions.querySelector('a[href="/records/1"]'), "still a link");
  assert.ok(card.textContent.includes("Ultimo aggiornamento"), "the update label is localized (M03)");
});
