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

test("≤700px /directory header and card actions compact onto one row without losing wrap or 44px targets", () => {
  // The mobile overrides live in the ≤700px block that also carries .hero-actions.
  const mobile = mediaBlocks(css, "max-width", "700px").find((block) => block.includes(".hero-actions"));
  assert.ok(mobile, "expected the ≤700px block carrying the hero and directory mobile overrides");

  // Hero CTAs: the map and report links fill the existing two-column row. The
  // separate external directory submit CTA is gone — the search now carries a
  // compact in-form arrow submit, so the report link no longer spans both tracks.
  const heroActions = ruleBlock(mobile, ".hero-actions");
  assert.equal(compact(declaration(heroActions, "display")), "grid");
  assert.equal(compact(declaration(heroActions, "grid-template-columns")), "repeat(2,minmax(0,1fr))");
  assert.equal(compact(declaration(ruleBlock(mobile, ".hero-actions .button"), "justify-content")), "center");
  assert.doesNotMatch(mobile, /\.hero-actions \.button-quiet\s*\{/, "the report link no longer spans both tracks");
  assert.doesNotMatch(css, /hero-directory-submit-mobile/, "the external directory submit CTA must be gone");

  // Mobile search row: the input fills the first grid track and the compact
  // in-form arrow submit occupies the fixed 48px second track; the visible
  // desktop label span is hidden on mobile while the button keeps its
  // accessible name, and the static dropdown stays as wide as input+arrow.
  const search = ruleBlock(mobile, ".hero-search");
  assert.equal(compact(declaration(search, "display")), "grid");
  assert.equal(compact(declaration(search, "grid-template-columns")), "minmax(0,1fr)48px");
  const submit = ruleBlock(mobile, '.hero-search > button[type="submit"]');
  assert.equal(compact(declaration(submit, "display")), "flex");
  assert.equal(pixelValue(declaration(submit, "width")), 48);
  assert.equal(pixelValue(declaration(submit, "min-height")), 48);
  assert.equal(compact(declaration(ruleBlock(mobile, ".hero-search-submit-label"), "display")), "none");
  const dropdown = ruleBlock(mobile, ".hero-search .geocode-dropdown");
  assert.equal(compact(declaration(dropdown, "position")), "static");
  assert.equal(compact(declaration(dropdown, "width")), "calc(100%+48px)");

  const details = ruleBlock(mobile, ".hero-copy--details");
  assert.equal(compact(declaration(details, "padding-top")), "0");
  assert.equal(compact(declaration(details, "max-width")), "none", "the mobile CTA must not stay capped at the desktop 640px");

  // Card action links sit on one 8px-gap row and wrap when 320px runs out.
  const actions = ruleBlock(mobile, ".directory-tool .record-list .record-list-card .record-list-actions");
  assert.equal(compact(declaration(actions, "flex-direction")), "row");
  assert.equal(compact(declaration(actions, "flex-wrap")), "wrap");
  assert.equal(compact(declaration(actions, "align-items")), "center");
  assert.equal(compact(declaration(actions, "justify-content")), "flex-start");
  assert.equal(compact(declaration(actions, "gap")), "var(--space-2)");

  // The heading override is scoped (2 classes) so it outranks the later base
  // rule whose align-items:flex-end split the heading from the + action.
  const heading = ruleBlock(mobile, ".directory-tool .directory-results");
  assert.equal(compact(declaration(heading, "flex-direction")), "row");
  assert.equal(compact(declaration(heading, "flex-wrap")), "nowrap");
  assert.equal(compact(declaration(heading, "align-items")), "center");
  assert.match(css, /\.directory-results\s*\{\s*display:flex;[^}]*align-items:flex-end/, "the later base .directory-results rule ends its row at flex-end — the reason the override is scoped");

  // Touch targets stay ≥44px; they now wrap instead of shrinking.
  assert.equal(pixelValue(declaration(ruleBlock(css, ".directory-tool .record-list .record-list-card .text-button"), "min-height")), 44);
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
