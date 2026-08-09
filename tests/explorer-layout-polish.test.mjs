/**
 * Explorer layout polish — static contracts for the shared /directory and
 * /mappa workspace. These assertions intentionally test user-visible CSS
 * invariants rather than component implementation details: a non-wrapping,
 * scrollable alphabet rail; aligned desktop workspaces; a desktop-height map;
 * and continuous, motion-safe cross-document transitions.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(path.join(root, "app", "globals.css"), "utf8");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Return every balanced declaration block for an exact selector. */
function ruleBlocks(source, selector) {
  const matcher = new RegExp(`${escapeRegExp(selector)}\\s*\\{`, "g");
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

function ruleBlock(source, selector) {
  const block = ruleBlocks(source, selector)[0];
  assert.ok(block, `expected a ${selector} rule`);
  return block;
}

/** Return every balanced @media block that matches an exact feature/value. */
function mediaBlocks(source, feature, value) {
  const matcher = new RegExp(`@media\\s*\\(\\s*${escapeRegExp(feature)}\\s*:\\s*${escapeRegExp(value)}\\s*\\)\\s*\\{`, "g");
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
  const match = block.match(new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`));
  assert.ok(match, `expected ${property} declaration`);
  return match[1].trim();
}

function compact(value) {
  return value.replace(/\s+/g, "");
}

function pixelValue(value) {
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  assert.ok(match, `expected a pixel value, got ${value}`);
  return Number(match[1]);
}

test("alphabetical index is a compact non-wrapping rail with touch-safe targets", () => {
  const rail = ruleBlock(css, ".alpha-index");
  const list = ruleBlock(css, ".alpha-index ul");
  const link = ruleBlock(css, ".alpha-index-link");

  assert.match(list, /display\s*:\s*flex\b/, "letters are laid out as one flex rail");
  assert.match(list, /flex-wrap\s*:\s*nowrap\b/, "the rail must never wrap at any width");
  assert.doesNotMatch(css, /\.alpha-index ul\s*\{[^}]*flex-wrap\s*:\s*wrap\b/, "no breakpoint may restore wrapping");
  assert.match(rail, /overflow-x\s*:\s*auto\b/, "mobile and tablet overflow is intentionally scrollable");
  assert.match(rail, /overscroll-behavior-x\s*:\s*contain\b/, "rail scrolling stays contained");
  assert.equal(pixelValue(declaration(link, "width")), 36, "compact rail targets aim for 36px width");
  assert.ok(pixelValue(declaration(link, "min-width")) >= 24, "letter targets stay at least 24px wide");
  assert.ok(pixelValue(declaration(link, "min-height")) >= 24, "letter targets stay at least 24px tall");

  const desktop = mediaBlocks(css, "min-width", "1024px");
  assert.ok(desktop.some((block) => {
    const desktopRail = ruleBlocks(block, ".alpha-index")[0];
    const desktopList = ruleBlocks(block, ".alpha-index ul")[0];
    const desktopItem = ruleBlocks(block, ".alpha-index li")[0];
    return desktopRail && desktopList && desktopItem
      && /overflow-x\s*:\s*visible\b/.test(desktopRail)
      && compact(declaration(desktopList, "width")) === "100%"
      && /flex\s*:\s*1\s+1\s+0\b/.test(desktopItem)
      && pixelValue(declaration(desktopItem, "min-width")) >= 24;
  }), "desktop distributes the 26 letters across one full-width row instead of scrolling or wrapping");
});

test("alphabetical controls retain native button and muted-letter semantics", async () => {
  const catalog = await readFile(path.join(root, "app", "components", "tools", "DirectoryCatalog.tsx"), "utf8");
  assert.match(catalog, /<nav className="alpha-index" aria-label=\{t\.alphaIndexTitle\}>/, "the index remains a labelled navigation landmark");
  assert.match(catalog, /<button type="button" className=\{[^}]*alpha-index-link/, "present letters remain native keyboard-operable buttons");
  assert.match(catalog, /className="alpha-index-link is-muted" aria-hidden="true"/, "absent letters remain muted decorative text");
  assert.match(catalog, /aria-current=\{currentPageLetters\.has\(letter\)/, "current-page letters remain announced");
});

test("directory and map share the desktop workspace width without changing mobile map layout", () => {
  const mapWidth = compact(declaration(ruleBlock(css, ".map-layout"), "width"));
  assert.equal(mapWidth, "min(1440px,calc(100%-32px))", "map workspace contract is explicit");

  const desktop = mediaBlocks(css, "min-width", "769px");
  assert.ok(desktop.some((block) => {
    const directory = ruleBlocks(block, ".tool-section.directory-tool")[0];
    return directory && compact(declaration(directory, "width")) === mapWidth;
  }), "directory adopts the map workspace width only in the desktop layout");

  const mobile = mediaBlocks(css, "max-width", "768px");
  assert.ok(mobile.some((block) => {
    const map = ruleBlocks(block, ".map-layout")[0];
    const split = ruleBlocks(block, ".map-card .map-split")[0];
    return map && split
      && compact(declaration(map, "width")) === "min(100%-32px,1180px)"
      && declaration(split, "height") === "auto"
      && declaration(split, "min-height") === "0";
  }), "the established mobile map width and map-first split stay intact");
});

test("desktop map viewport has a materially taller floor while mobile overrides it", () => {
  const split = ruleBlock(css, ".map-card .map-split");
  const height = declaration(split, "height");
  const minHeight = pixelValue(declaration(split, "min-height"));

  assert.match(height, /^clamp\(700px,/, "desktop map height starts from a 700px floor");
  assert.ok(minHeight >= 700, "desktop map viewport remains at least 700px tall");

  const mobile = mediaBlocks(css, "max-width", "768px");
  assert.ok(mobile.some((block) => {
    const mobileSplit = ruleBlocks(block, ".map-card .map-split")[0];
    return mobileSplit && declaration(mobileSplit, "height") === "auto" && declaration(mobileSplit, "min-height") === "0";
  }), "mobile retains its existing viewport-driven map height and map-first layout");
});

test("cross-document explorer transitions opt in and crossfade continuously with reduced-motion safety", () => {
  const transition = ruleBlock(css, "@view-transition");
  assert.equal(declaration(transition, "navigation"), "auto", "cross-document navigation is explicitly opted in");

  const oldRoot = ruleBlock(css, "::view-transition-old(root)");
  const newRoot = ruleBlock(css, "::view-transition-new(root)");
  assert.match(oldRoot, /animation\s*:\s*osdb-vt-out\b/, "outgoing document has a short root motion");
  assert.match(newRoot, /animation\s*:\s*osdb-vt-in\b/, "incoming document starts at the same time as the outgoing document");
  assert.doesNotMatch(newRoot, /animation-delay\s*:/, "the incoming document has no blank-frame delay");

  const oldFrames = ruleBlock(css, "@keyframes osdb-vt-out");
  const newFrames = ruleBlock(css, "@keyframes osdb-vt-in");
  assert.match(oldFrames, /opacity\s*:\s*0/, "outgoing document fades away");
  assert.match(newFrames, /opacity\s*:\s*0/, "incoming document fades in");
  assert.match(`${oldFrames}${newFrames}`, /transform\s*:\s*translateY\(/, "the fade includes restrained vertical motion");

  assert.match(css, /\.explore-view-switch\s*\{[^}]*view-transition-name\s*:\s*explore-view-switch/, "the explorer switch stays a named shared element");
  const reducedMotion = mediaBlocks(css, "prefers-reduced-motion", "reduce");
  assert.ok(reducedMotion.some((block) => /::view-transition-old\(\*\)[\s\S]*animation\s*:\s*none\s*!important/.test(block)), "reduced-motion users keep transitions disabled");
});
