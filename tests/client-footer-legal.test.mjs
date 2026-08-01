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

// The Server Components refactor (PR #120) moved the nav-shell labels into a
// required `navLabels` prop — the pages now pass the localized i18n labels.
// The DOM tests must mirror that contract: fictional labels only.
const fakeNavLabels = {
  mainNavigation: "Main navigation",
  homeAria: "OpenSurveillanceDB home",
  exploreMap: "Explore the map",
  browseRecords: "Browse records",
  howItWorks: "How it works",
};

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
  assert.equal(nav.getAttribute("aria-label"), "Institutional pages");

  const links = collectLinks(footer);
  // brand + 8 institutional links + 2 external licence/attribution links
  assert.equal(links.length, 11);
  const internal = links.filter((l) => l.href.startsWith("/"));
  assert.equal(internal.length, 9);
  for (const expected of ["/manifesto", "/regole", "/guide", "/privacy", "/termini", "/licenze", "/faq", "/contatti"]) {
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
  assert.ok(links.length >= 5, "nav + inline markup links must render");
  for (const expected of ["/", "/#map", "/#records", "/guide", "https://example.test/legal"]) {
    assert.ok(links.some((l) => l.href === expected), `expected link ${expected}`);
  }
  assertNoBrokenHrefs(links);
});
