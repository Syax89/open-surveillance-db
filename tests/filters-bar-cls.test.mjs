/**
 * Perf regression (Lighthouse mobile CLS 0.151 on /mappa, 0.232 on
 * /directory): the shared FiltersBar disclosure used to render
 * `<details open>` on the server and close it in a post-hydration
 * matchMedia effect on phones, so the panel shrank (265→42px on /mappa,
 * .directory-controls 653→196px on /directory) and the content below jumped.
 *
 * Contract pinned here:
 *   1. SSR markup is collapsed (no `open`, aria-expanded="false").
 *   2. The hydrated DOM after every effect has run equals the SSR html on a
 *      mobile AND a desktop viewport — no post-hydration open/close change,
 *      hence no layout shift and no hydration mismatch.
 *   3. The breakpoint is pure CSS: ≤820px shows the toggle and hides the
 *      collapsed controls; wider layouts hide the toggle and never gate the
 *      controls on the open state (desktop always shows them, B02).
 *   4. The mobile toggle keeps disclosure semantics: a native button with
 *      aria-expanded + aria-controls, toggled by click/keyboard.
 *
 * Plus the prefetch budget (14 RSC prefetches on /segnala): footer and
 * secondary nav links render with prefetch disabled; at most 3 primary
 * header CTAs keep the default viewport prefetch.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import {
  setupDom, loadDomModule, renderWithLocale, wrapWithLocale, installFetchMock, jsonResponse, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

let rtl;
let FiltersBar;
let SiteFooter;
let PublicNavLinks;
let AuthNavLinks;
let restoreMatchMedia = null;

before(async () => {
  rtl = await setupDom();
  FiltersBar = (await loadDomModule("app/components/FiltersBar.mjs")).FiltersBar;
  SiteFooter = (await loadDomModule("app/components/SiteFooter.mjs")).SiteFooter;
  PublicNavLinks = (await loadDomModule("app/components/PublicNavLinks.mjs")).PublicNavLinks;
  AuthNavLinks = (await loadDomModule("app/components/AuthNavLinks.mjs")).AuthNavLinks;
});

afterEach(() => {
  rtl?.cleanup();
  restoreMatchMedia?.();
  restoreMatchMedia = null;
});

/** matchMedia stub: every max-width query up to 820px matches on mobile. */
function installViewport(mobile) {
  const previous = window.matchMedia;
  const stub = (query) => ({
    matches: mobile && /max-width:\s*(\d+)px/.test(query) && Number(query.match(/max-width:\s*(\d+)px/)[1]) >= 390,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  window.matchMedia = stub;
  globalThis.matchMedia = stub;
  restoreMatchMedia = () => {
    window.matchMedia = previous;
    globalThis.matchMedia = previous;
  };
}

const barProps = {
  variant: "panel",
  cameraKinds: ["Dome", "Bullet"],
  search: "",
  setSearch: () => {},
  kindFilter: "all",
  setKindFilter: () => {},
  freshnessFilter: "all",
  setFreshnessFilter: () => {},
  sortOrder: "alphabetical",
  setSortOrder: () => {},
  resultCount: 3,
  onReset: () => {},
};

test("CLS: FiltersBar SSR markup is collapsed — no <details open>", async () => {
  const html = renderToString(await wrapWithLocale(React.createElement(FiltersBar, barProps)));
  assert.doesNotMatch(html, /<details[^>]*\sopen/, "the server must not render an open <details>");
  const group = html.match(/<div[^>]*class="filters-disclosure"[^>]*>/)?.[0];
  assert.ok(group, "the filter disclosure group renders");
  assert.match(group, /data-open="false"/, "SSR renders the disclosure collapsed");
  const toggle = html.match(/<button[^>]*class="filters-disclosure-toggle"[^>]*>/)?.[0];
  assert.ok(toggle, "SSR renders the mobile disclosure toggle");
  assert.match(toggle, /aria-expanded="false"/);
});

for (const [label, mobile] of [["mobile 390px", true], ["desktop 1440px", false]]) {
  test(`CLS: hydrated FiltersBar DOM equals the SSR html after effects (${label})`, async () => {
    installViewport(mobile);
    const wrapped = await wrapWithLocale(React.createElement(FiltersBar, barProps));
    const ssrHtml = renderToString(wrapped);
    const container = document.createElement("div");
    container.innerHTML = ssrHtml;
    // Compare DOM serializations (the server emits `<input/>`, the DOM `<input>`).
    const ssrDom = container.innerHTML;
    document.body.appendChild(container);
    const errors = [];
    let hydrated;
    await rtl.act(async () => {
      hydrated = hydrateRoot(container, wrapped, { onRecoverableError: (error) => errors.push(error) });
    });
    // Let any post-hydration effect / native toggle event settle.
    await rtl.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    try {
      assert.deepEqual(errors, [], "no hydration mismatch");
      assert.equal(container.innerHTML, ssrDom, `no post-hydration open/close change on ${label}`);
    } finally {
      hydrated.unmount();
      container.remove();
    }
  });
}

/** Return the bodies of every `@media (<query>) { … }` block. */
function mediaBlocks(css, query) {
  const blocks = [];
  const re = new RegExp(`@media\\s*\\(${query.replace(/[()]/g, "\\$&")}\\)\\s*\\{`, "g");
  while (re.exec(css) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
    }
    blocks.push(css.slice(re.lastIndex, i - 1));
  }
  return blocks;
}

test("CLS: the disclosure breakpoint is CSS-only (≤820px) and desktop always shows the controls", async () => {
  const css = await readSource("app/globals.css");
  const mobile = mediaBlocks(css, "max-width:820px").join("\n");
  assert.match(mobile, /\.filters-disclosure:not\(\[data-open="true"\]\)\s*>\s*\.filter-controls-row\s*\{\s*display:none/,
    "≤820px hides the collapsed controls");
  assert.match(mobile, /\.filters-disclosure\s*>\s*\.filters-disclosure-toggle\s*\{[^}]*display:flex/,
    "≤820px shows the toggle");
  // Outside every media block: the toggle is hidden and NO rule hides the
  // controls based on the open state (desktop ignores it).
  let outside = css;
  for (const query of ["max-width:820px", "max-width:700px", "max-width:980px"]) {
    for (const block of mediaBlocks(css, query)) outside = outside.replace(block, "");
  }
  assert.match(outside, /\.filters-disclosure\s*>\s*\.filters-disclosure-toggle\s*\{\s*display:none/,
    "desktop hides the mobile-only toggle");
  assert.doesNotMatch(outside, /\.filters-disclosure[^{]*data-open[^{]*\{[^}]*display:none/,
    "desktop never hides the controls based on the open state");

  const source = (await readSource("app/components/FiltersBar.tsx"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(source, /matchMedia/, "no JS breakpoint: nothing changes the layout after hydration");
  assert.doesNotMatch(source, /<details/, "no native <details> (closed content cannot be revealed by CSS everywhere)");
});

test("a11y: the mobile filter toggle is a button with aria-expanded/aria-controls", async () => {
  const { container } = await renderWithLocale(React.createElement(FiltersBar, barProps));
  const group = container.querySelector(".filters-disclosure");
  const toggle = group.querySelector(".filters-disclosure-toggle");
  assert.equal(toggle.tagName, "BUTTON");
  assert.equal(toggle.getAttribute("type"), "button", "never submits a surrounding form");
  assert.equal(group.getAttribute("role"), "group");
  assert.equal(group.getAttribute("aria-labelledby"), toggle.id, "the group is named by its toggle");
  const controls = document.getElementById(toggle.getAttribute("aria-controls"));
  assert.ok(controls?.classList.contains("filter-controls-row"), "aria-controls points at the controls");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  await rtl.userEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(group.getAttribute("data-open"), "true");

  toggle.focus();
  await rtl.userEvent.keyboard("{Enter}");
  assert.equal(toggle.getAttribute("aria-expanded"), "false", "keyboard Enter toggles it closed");
  await rtl.userEvent.keyboard(" ");
  assert.equal(toggle.getAttribute("aria-expanded"), "true", "keyboard Space toggles it open");
  assert.ok(container.querySelector("#record-kind-filter"), "controls stay in the DOM in both states");
});

// ---------------------------------------------------------------------------
// Prefetch budget
// ---------------------------------------------------------------------------

test("prefetch: every footer link opts out of next/link prefetch", async () => {
  const { container } = await renderWithLocale(React.createElement(SiteFooter));
  const links = [...container.querySelectorAll('footer a[href^="/"]')];
  assert.ok(links.length >= 15, `the footer renders its internal links (${links.length})`);
  for (const link of links) {
    assert.equal(link.getAttribute("data-prefetch"), "false", `${link.getAttribute("href")} must set prefetch={false}`);
  }
});

test("prefetch: at most 3 primary header CTAs keep prefetch; secondary and auth links opt out", async () => {
  const { container } = await renderWithLocale(React.createElement(PublicNavLinks));
  const links = [...container.querySelectorAll('a[href^="/"]')];
  const prefetching = links.filter((link) => link.getAttribute("data-prefetch") !== "false").map((link) => link.getAttribute("href"));
  assert.deepEqual(prefetching, ["/mappa", "/directory", "/segnala"], "only the primary task CTAs prefetch");
  assert.equal(container.querySelector('a[href="/contribuisci"]').getAttribute("data-prefetch"), "false");
  rtl.cleanup();

  installFetchMock(() => jsonResponse({ error: "Not authenticated." }, { status: 401 }));
  const auth = await renderWithLocale(React.createElement(AuthNavLinks));
  await rtl.waitFor(() => assert.ok(auth.container.querySelector('a[href="/login"]')));
  for (const link of auth.container.querySelectorAll('a[href^="/"]')) {
    assert.equal(link.getAttribute("data-prefetch"), "false", `${link.getAttribute("href")} must set prefetch={false}`);
  }
});
