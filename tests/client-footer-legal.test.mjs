/**
 * Client-side DOM tests for SiteFooter and LegalPage — QA t_61b90f6a.
 *
 * SiteFooter (the global contentinfo landmark, rendered in the root layout):
 *   1. renders a <footer> contentinfo landmark with a localized aria-label;
 *   2. the labelled <nav> contains the institutional links and every one of
 *      them resolves — internal links are non-empty absolute paths, external
 *      links are https and carry the right rel/target attributes;
 *   3. the brand link keeps its aria-label; the OSM attribution link opens
 *      in a new tab with rel="noopener noreferrer" (target=_blank safety);
 *   4. toggling the locale re-renders the footer labels (EN -> IT) and the
 *      landmark keeps a localized aria-label.
 *
 * LegalPage (shared layout of /privacy, /termini, /licenze):
 *   5. renders title/intro/sections from a content fixture; every section
 *      links its <h2> to the section via aria-labelledby/id;
 *   6. inline markup is honoured: [label](url) -> <a href>, **bold** ->
 *      <strong>, *italic* -> <em>; note blocks carry role="note";
 *   7. the nav shell links resolve, the LocaleToggle is present, and no
 *      rendered <a> has an empty or placeholder href.
 *
 * Fixtures are fictitious (made-up legal copy with example.test links) —
 * never real personal data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SiteFooter;
let LegalPage;
let LocaleToggle;

before(async () => {
  rtl = await setupDom();
  SiteFooter = (await loadDomModule("app/components/SiteFooter.mjs")).SiteFooter;
  LegalPage = (await loadDomModule("app/components/LegalPage.mjs")).LegalPage;
  LocaleToggle = (await loadDomModule("app/components/LocaleProvider.mjs")).LocaleToggle;
});

afterEach(() => rtl?.cleanup());

// Fictitious legal content: no real names, no real URLs beyond example.test.
const fakeLegalContent = {
  eyebrow: "Fixture page",
  title: "Fixture Information Page",
  intro: "Intro line for the fixture page.",
  versionNote: "Fixture version 1.0 (not real content).",
  sections: [
    {
      heading: "First heading",
      blocks: [
        { type: "paragraph", text: "A **bold** statement with an *italic* aside and a [fixture link](https://example.test/legal)." },
        { type: "list", items: ["one", "two", "three"] },
        { type: "note", text: "A note that must be announced with role=note." },
        {
          type: "table",
          caption: "Fixture table",
          headers: ["Column A", "Column B"],
          rows: [["a1", "b1"], ["a2", "b2"]],
        },
      ],
    },
    {
      heading: "Second heading",
      blocks: [
        { type: "paragraph", text: "Plain second paragraph." },
      ],
    },
  ],
};

// LegalPage takes the nav-shell landmark labels as a separate required prop —
// the real pages pass the `home` bundle resolved from server-i18n
// (app/privacy/page.tsx et al.). These QA tests predate the
// Server-Components refactor (PR #120) that introduced navLabels; this
// fictitious fixture mirrors the contract so the tests exercise the same
// prop shape as production.
//
// Since t_a72a3106 the nav LINK SET no longer comes from navLabels: LegalPage
// renders the shared public nav (PublicNavLinks — the same six home links as
// every other public page, with the current page marked aria-current). The
// navLabels prop now carries ONLY the landmark labels (mainNavigation /
// homeAria); the link texts come from the home bundle.
//
// QA t_5084202a — root cause of the "flaky" CI red runs: PR #120 made
// navLabels a REQUIRED prop; the tests from PR #94 still rendered LegalPage
// with only `content`, crashing with `Cannot read properties of undefined
// (reading 'mainNavigation')` at LegalPage.mjs:56:149. That failure was
// DETERMINISTIC on the pre-fix SHA (reproduced locally), not a .dom-tmp race:
// dom-harness builds each test file in its own mkdtemp dir and removes only
// its own tree in `after()`. The fix landed in PR #123; the contract test
// below turns any future signature change into a clear, immediate failure.
const fakeNavLabels = {
  mainNavigation: "Fixture navigation",
  homeAria: "Fixture home",
};

// The shared public nav (PublicNavLinks, t_a72a3106) renders the same six
// home links on every public page, in this order, with the current page
// marked aria-current="page".
const PUBLIC_NAV_HREFS = ["/mappa", "/directory", "/guide", "/regole", "/manifesto", "/segnala"];

// Contract guard: if a future refactor adds/renames a navLabels key, the
// render below fails with a descriptive message instead of a cryptic
// TypeError on an undefined prop (the t_5084202a failure mode). The nav
// link set itself is pinned to the shared public nav (t_a72a3106).
test("legal: nav shell renders the landmark labels and the shared public nav (contract guard)", async () => {
  const view = await renderWithLocale(React.createElement(LegalPage, { content: fakeLegalContent, navLabels: fakeNavLabels }));
  const { container } = view;

  const nav = container.querySelector("nav.nav-shell");
  assert.ok(nav, "nav shell must render");
  assert.equal(nav.getAttribute("aria-label"), fakeNavLabels.mainNavigation, "nav aria-label must come from navLabels.mainNavigation");

  const brand = container.querySelector("nav .brand");
  assert.ok(brand, "brand link must render");
  assert.equal(brand.getAttribute("aria-label"), fakeNavLabels.homeAria, "brand aria-label must come from navLabels.homeAria");

  // The nav link set is the shared public set — no longer per-page copies.
  const linkHrefs = [...container.querySelectorAll(".nav-links a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(linkHrefs, PUBLIC_NAV_HREFS, "legal pages must render the shared six-link public nav");
  for (const href of PUBLIC_NAV_HREFS) {
    assert.ok(
      linkHrefs.includes(href),
      `the shared public nav must link ${href}`,
    );
  }
});

function collectLinks(container) {
  return [...container.querySelectorAll("a")].map((a) => ({
    href: a.getAttribute("href"),
    text: (a.textContent || "").trim(),
    rel: a.getAttribute("rel"),
    target: a.getAttribute("target"),
    ariaLabel: a.getAttribute("aria-label"),
  }));
}

// Every href must be a real destination: an absolute internal path, an
// https:// external URL, or a non-empty in-page fragment (e.g. the
// skip-link "#main-content", "#records", "#map"). The bare "#" placeholder
// and empty hrefs are broken links.
function assertNoBrokenHrefs(links) {
  for (const link of links) {
    assert.ok(link.href, `link "${link.text}" must have an href`);
    assert.notEqual(link.href, "#", `link "${link.text}" must not be a bare # placeholder`);
    assert.ok(
      link.href.startsWith("/") || link.href.startsWith("https://") || (link.href.startsWith("#") && link.href.length > 1),
      `link "${link.text}" has unexpected href "${link.href}"`,
    );
  }
}

test("footer: contentinfo landmark with localized aria-label and labelled nav", async () => {
  const view = await renderWithLocale(React.createElement(SiteFooter));
  const { container } = view;

  const footer = container.querySelector("footer.site-footer");
  assert.ok(footer, "footer.site-footer must render");
  assert.equal(footer.getAttribute("aria-label"), "Site footer");

  const nav = footer.querySelector("nav.footer-links");
  assert.ok(nav, "footer navigation <nav> must render");
  // F3 t_2ca69725: the footer nav carries the four public tool routes +
  // the institutional pages, so the label is "site navigation".
  assert.equal(nav.getAttribute("aria-label"), "Site navigation");

  const links = collectLinks(footer);
  // brand + 4 tool links + 9 institutional links + 2 external
  // licence/attribution links
  assert.equal(links.length, 16);
  const internal = links.filter((l) => l.href.startsWith("/"));
  assert.equal(internal.length, 14);
  for (const expected of [
    // Public tool routes (F3 t_2ca69725, FRONTEND_DESIGN §2.5).
    "/mappa", "/directory", "/segnala", "/correggi",
    // Institutional pages.
    "/manifesto", "/regole", "/guide", "/privacy", "/termini", "/licenze", "/accessibility", "/faq", "/contatti",
  ]) {
    assert.ok(
      internal.some((l) => l.href === expected),
      `expected internal link ${expected} in footer`,
    );
  }
});

test("footer: brand aria-label, external links carry licence/noopener attributes", async () => {
  const view = await renderWithLocale(React.createElement(SiteFooter));
  const links = collectLinks(view.container);

  const brand = links.find((l) => l.href === "/");
  assert.ok(brand, "brand link must render");
  assert.equal(brand.ariaLabel, "OpenSurveillanceDB home");

  const odbl = links.find((l) => l.href.startsWith("https://opendatacommons.org"));
  assert.ok(odbl, "ODbL licence link must render");
  assert.equal(odbl.rel, "license");

  const osm = links.find((l) => l.href.startsWith("https://www.openstreetmap.org/copyright"));
  assert.ok(osm, "OSM attribution link must render");
  assert.equal(osm.target, "_blank");
  assert.match(osm.rel, /noopener/);
  assert.match(osm.rel, /noreferrer/);

  assertNoBrokenHrefs(links);
});

test("footer: locale toggle switches the landmark label and link texts (EN -> IT)", async () => {
  const user = rtl.userEvent.setup();
  // The footer itself does not carry the LocaleToggle (it lives in the page
  // nav shells) — render both inside the provider to drive the switch.
  const view = await renderWithLocale(
    React.createElement("div", null,
      React.createElement(LocaleToggle),
      React.createElement(SiteFooter),
    ),
  );

  assert.equal(view.container.querySelector("footer.site-footer").getAttribute("aria-label"), "Site footer");
  assert.ok(view.container.textContent.includes("Terms of use"));

  await user.click(view.getByRole("button", { name: "IT" }));

  const footer = view.container.querySelector("footer.site-footer");
  assert.equal(footer.getAttribute("aria-label"), "Piè di pagina del sito");
  assert.ok(footer.textContent.includes("Termini d'uso"));
  assert.ok(footer.textContent.includes("Database ed esportazioni concessi in licenza ODbL 1.0"));

  // Back to EN restores the English labels.
  await user.click(view.getByRole("button", { name: "EN" }));
  assert.equal(view.container.querySelector("footer.site-footer").getAttribute("aria-label"), "Site footer");
});

test("legal: renders title, intro and sections wired to headings via aria-labelledby", async () => {
  const view = await renderWithLocale(React.createElement(LegalPage, { content: fakeLegalContent, navLabels: fakeNavLabels }));
  const { container } = view;

  assert.equal(container.querySelector("h1").textContent, "Fixture Information Page");
  assert.equal(container.querySelector(".record-detail-summary").textContent, "Intro line for the fixture page.");

  const sections = [...container.querySelectorAll("section.legal-section")];
  assert.equal(sections.length, 2);
  for (const [index, section] of sections.entries()) {
    const h2 = section.querySelector("h2");
    assert.ok(h2.id, `section ${index} heading must have an id`);
    assert.equal(section.getAttribute("aria-labelledby"), h2.id);
  }
});

test("legal: inline markup renders links, strong, em, notes and tables", async () => {
  const view = await renderWithLocale(React.createElement(LegalPage, { content: fakeLegalContent, navLabels: fakeNavLabels }));
  const { container } = view;

  const p = container.querySelector("section p");
  assert.ok(p.querySelector("strong"), "**bold** must render <strong>");
  assert.equal(p.querySelector("strong").textContent, "bold");
  assert.ok(p.querySelector("em"), "*italic* must render <em>");
  assert.equal(p.querySelector("em").textContent, "italic");

  const link = p.querySelector("a[href='https://example.test/legal']");
  assert.ok(link, "[label](url) must render an <a>");
  assert.equal(link.textContent, "fixture link");

  const note = container.querySelector("div.legal-note[role='note']");
  assert.ok(note, "note block must render with role=note");
  assert.ok(note.textContent.includes("announced with role=note"));

  const table = container.querySelector("table.legal-table");
  assert.ok(table, "table block must render");
  assert.equal(table.querySelector("caption").textContent, "Fixture table");
  assert.equal(table.querySelectorAll("th").length, 2);
  assert.equal(table.querySelectorAll("tbody tr").length, 2);
});

test("legal: nav shell links resolve, LocaleToggle present, no broken hrefs", async () => {
  const view = await renderWithLocale(React.createElement(LegalPage, { content: fakeLegalContent, navLabels: fakeNavLabels }));
  const { container } = view;

  const nav = container.querySelector("nav.nav-shell");
  assert.ok(nav, "nav shell must render");
  assert.ok(nav.getAttribute("aria-label"), "nav shell must be labelled");

  // LocaleToggle (EN/IT) is part of the legal page shell.
  assert.ok(container.querySelector(".locale-toggle"), "LocaleToggle must be present");
  assert.equal(view.getByRole("button", { name: "EN" }).getAttribute("aria-pressed"), "true");

  const links = collectLinks(container);
  assert.ok(links.length >= 8, "brand + six shared nav links + inline markup links must render");
  // Shared public nav (t_a72a3106): the SAME six home links on every public
  // page — the old per-page legal set (/#map, /#records, /guide) is gone.
  for (const expected of ["/", "/mappa", "/directory", "/guide", "/regole", "/manifesto", "/segnala", "https://example.test/legal"]) {
    assert.ok(links.some((l) => l.href === expected), `expected link ${expected}`);
  }
  assertNoBrokenHrefs(links);
});
