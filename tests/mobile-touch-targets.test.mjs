/**
 * M06 (design review 2026-10-22, P2) — touch comfort is uneven between the
 * mobile menu / mini map and the rest of the UI.
 *
 * Evidence: in the open menu at 320px the links "Esplora la mappa",
 * "Sfoglia i record" and "Contribuisci" measured ~254x18px and "Accedi"
 * ~45x21px, while Menu/locale were 44px; on the record page the mini-map
 * zoom buttons measured 30x30 against the 44x44 of the main map.
 *
 * Contract asserted here:
 *   1. inside the hamburger dropdown every row (primary links, the boxed CTA
 *      and the login/register links) carries a ≥44px activation box with a
 *      focus affordance — the links stay native anchors (no new design);
 *   2. the whole dropdown still fits 320x568: the arithmetic from the
 *      declared row height / gap / padding is checked explicitly;
 *   3. the mini-map zoom controls reach 44x44 on mobile while the mini-map
 *      CARD keeps its 280px height (only the controls grow);
 *   4. the shared footer is NOT enlarged — its links keep their compact
 *      styling (the review explicitly asked not to grow it).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

let rtl;
let PublicNav;

before(async () => {
  rtl = await setupDom();
  PublicNav = (await loadDomModule("app/components/PublicNav.mjs")).PublicNav;
});

afterEach(() => {
  rtl?.cleanup();
  if (typeof window !== "undefined") window.localStorage.removeItem("opensurveillancedb-locale");
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
  // Selectors here contain `:has(...)` and `:not(...)`; only the literal
  // characters that are regex-significant outside those are escaped.
  const pattern = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\(/g, "\\(");
  const matcher = new RegExp(`${pattern}\\s*\\{`, "g");
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

const DROPDOWN = ".nav-shell:has(.menu-button) .nav-links";

// ---------------------------------------------------------------------------
// 1) Dropdown rows
// ---------------------------------------------------------------------------

test("mobile menu rows carry a 44px activation box with a focus affordance", async () => {
  const css = await readSource("app/globals.css");
  const dropdown = mediaBlocks(css, "max-width", "1080px").join("\n");
  assert.match(dropdown, /\.nav-shell:has\(\.menu-button\) \.nav-links \{/, "the dropdown block still exists");

  const rows = ruleBlocks(dropdown, `${DROPDOWN} > a:not(.nav-action)`)[0];
  assert.ok(rows, "primary rows get their own rule");
  assert.equal(declaration(rows, "display"), "flex", "a row is a real box, not inline text");
  assert.equal(declaration(rows, "align-items"), "center");
  assert.ok(px(declaration(rows, "min-height")) >= 44, "primary rows are ≥44px tall");

  const cta = ruleBlocks(dropdown, `${DROPDOWN} .nav-action`)[0];
  assert.ok(cta, "the boxed CTA keeps its own rule");
  assert.ok(px(declaration(cta, "min-height")) >= 44, "the CTA is ≥44px tall");
  assert.equal(declaration(cta, "display"), "flex");

  const auth = ruleBlocks(dropdown, `${DROPDOWN} .auth-nav-links a`)[0];
  assert.ok(auth, "login/register links get a rule");
  assert.ok(px(declaration(auth, "min-height")) >= 44, "login/register are ≥44px tall");
  assert.match(declaration(auth, "display"), /inline-flex|flex/);

  const focus = ruleBlocks(dropdown, `${DROPDOWN} a:focus-visible`)[0];
  assert.ok(focus, "menu links need a visible focus affordance");
  assert.match(declaration(focus, "outline"), /3px solid var\(--focus\)/, "the shared focus ring token is used");
});

test("the open dropdown still fits 320x568", async () => {
  const css = await readSource("app/globals.css");
  const dropdown = mediaBlocks(css, "max-width", "1080px").join("\n");

  const container = ruleBlocks(dropdown, DROPDOWN)[0];
  assert.ok(container, "the dropdown container rule exists");
  // Resolve the token instead of asserting the literal string: --space-4 is
  // the accepted 16px panel padding, and the height budget below depends on
  // the RESOLVED value.
  const padding = declaration(container, "padding");
  const space4 = await readSource("app/globals.css").then((source) => {
    const match = source.match(/--space-4:\s*(\d+)px/);
    assert.ok(match, "--space-4 must be a pixel token");
    return Number(match[1]);
  });
  assert.equal(padding, "var(--space-4)", "the panel padding stays the accepted token");
  assert.equal(space4, 16, "--space-4 resolves to 16px (the budget below uses it)");
  const gap = px(declaration(container, "gap"));
  assert.ok(gap <= 14, `the row gap stays modest (got ${gap}px)`);

  // Rows: 4 primary links + the auth row (login + create account side by side).
  const rows = 5;
  const total = rows * 44 + (rows - 1) * gap + space4 * 2 /* padding */ + 2 /* borders */;
  const dropdownTop = 62; // the panel is anchored at top:62px under the header row
  assert.ok(dropdownTop + total <= 568, `the open dropdown must fit 320x568 (needs ${dropdownTop + total}px)`);
});

test("the shared footer is not enlarged (explicit review constraint)", async () => {
  const css = await readSource("app/globals.css");
  for (const selector of [".site-footer .footer-links a", ".footer-links"]) {
    const block = ruleBlocks(css, selector)[0];
    assert.ok(block, `expected the ${selector} rule`);
    assert.doesNotMatch(block, /min-height/, `${selector} must stay compact`);
    assert.doesNotMatch(block, /padding:\s*(?:1[0-9]|[2-9][0-9])px/, `${selector} must not gain row padding`);
  }
});

// ---------------------------------------------------------------------------
// 2) Mini-map zoom controls
// ---------------------------------------------------------------------------

test("mini-map zoom reaches 44px on mobile without growing the card", async () => {
  const css = await readSource("app/globals.css");
  const mobile = mediaBlocks(css, "max-width", "768px").join("\n");
  const zoom = ruleBlocks(mobile, ".record-minimap .leaflet-control-zoom a")[0];
  assert.ok(zoom, "mobile gives the mini-map zoom its own target size");
  assert.equal(px(declaration(zoom, "width")), 44);
  assert.equal(px(declaration(zoom, "height")), 44);
  assert.equal(px(declaration(zoom, "line-height")), 44);

  // The CARD keeps its accepted height — only the controls grow.
  const card = ruleBlocks(css, ".record-minimap")[0];
  assert.equal(px(declaration(card, "height")), 280, "the mini-map card height is untouched");
  assert.doesNotMatch(mobile, /\.record-minimap \{[^}]*height/, "no mobile override resizes the mini-map card");
});

// ---------------------------------------------------------------------------
// 3) Markup stays native
// ---------------------------------------------------------------------------

test("the dropdown keeps native anchors for every primary and auth row", async () => {
  installFetchMock((input) => {
    if (String(input) === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await setNavState({ pathname: "/mappa" });
  const view = await renderWithLocale(React.createElement(PublicNav, { navLabel: "Main navigation", homeLabel: "OpenSurveillanceDB home" }));

  const mainLinks = view.container.querySelector("#main-links");
  assert.ok(mainLinks, "the mobile menu container renders");
  // The auth entry point resolves through GET /api/auth/me (anonymous here),
  // so wait for the in-menu login/register links before counting rows.
  await rtl.waitFor(() => assert.equal(mainLinks.querySelectorAll("a").length, 6), { timeout: 5000 });
  const anchors = [...mainLinks.querySelectorAll("a")];
  assert.equal(anchors.length, 6, "4 primary links + login + create account render as anchors");
  for (const anchor of anchors) {
    assert.equal(anchor.tagName, "A", "each row stays a native link (no button/label rewrite)");
    assert.ok(anchor.getAttribute("href"), "each row keeps its destination");
    assert.equal(anchor.querySelector("button"), null, "no nested interactive element");
  }
  // The CTA keeps its .nav-action class (the boxed look) — the new 44px box
  // is additive, not a redesign of the row.
  assert.ok(mainLinks.querySelector('a.nav-action[href="/segnala"]'), "the CTA keeps its class and target");
});
