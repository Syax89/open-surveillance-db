/**
 * i18n pages QA suite — Italian content of the legal / informational pages
 * (kanban t_24599610, audit t_0de37378).
 *
 * legal-pages.test.mjs pins the English SSR default (ADR 0007 — English is
 * the pilot language) but never asserts what the SAME pages serve when the
 * locale is Italian. This suite closes that gap:
 *
 *   1. Every informational page (/privacy /termini /licenze /faq /contatti
 *      /manifesto /regole /moderazione /guide) serves its Italian content
 *      when the `opensurveillancedb-locale=it` cookie is present (server
 *      components read it via app/lib/server-i18n.ts).
 *   2. No English residual markers survive in the Italian renderings — the
 *      page content (nav + article) must be clean Italian.
 *   3. The same route renders EN and IT without crashing, and the visible
 *      title flips with the cookie.
 *   4. Client-side: the locale toggle writes the cookie that drives the
 *      server switch, and LegalPage renders both languages without crashing
 *      (jsdom harness, same as client-locale-toggle.test.mjs).
 *
 * Known SSR limitations were PINNED by the original QA suite (PR #131) with a
 * comment pointing at the finding id, so a fix would have to update them
 * deliberately (same pattern as the loading-note contrast exception in
 * navigation-pages.test.mjs). The fix (PR for t_b73f4946) landed and the
 * assertions below are FLIPPED from the pinned behaviour to the fixed one:
 *   - the root layout reads the server locale (getServerLocale, ADR 0015) and
 *     renders <html lang={locale}> on first paint, so SSR emits lang="it" for
 *     Italian content (finding QA-2026-08-01-3; the client LocaleProvider
 *     effect still keeps the attribute in sync on client-side switches);
 *   - LocaleProvider seeds its useSyncExternalStore server snapshot with the
 *     layout's server locale, so the global SiteFooter (a client component)
 *     SSRs the cookie language instead of always English — Italian pages
 *     carry the Italian footer labels from first paint (finding
 *     QA-2026-08-01-1); after hydration the client snapshot (localStorage)
 *     takes over exactly as before.
 *
 * Fixtures: only interface strings and the public legal content are
 * asserted — no personal data (privacy & safety by design).
 */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before, describe } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");
const LOCALE_COOKIE = "opensurveillancedb-locale";

/** Collect every JS module of the built worker, with index.js as the entry. */
async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".js")) {
        found.push({ type: "ESModule", path: full });
      }
    }
  };
  await walk(serverDir);
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((m) => m !== entry)];
}

/** Render a route with the given locale cookie (or none → EN default). */
async function renderPath(requestPath, locale) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
  });
  try {
    const headers = { accept: "text/html" };
    if (locale) headers.cookie = `${LOCALE_COOKIE}=${locale}`;
    const response = await mf.dispatchFetch(`http://localhost${requestPath}`, { headers });
    return { response, html: await response.text() };
  } finally {
    await mf.dispose();
  }
}

/** Drop the global site-footer landmark so the "no English residue" checks
 *  target the server-rendered page content (nav + article). The footer itself
 *  is asserted separately below — it now SSRs the cookie locale (flip of
 *  QA-2026-08-01-1), but keeping the content contract focused on the page
 *  body avoids coupling the two suites. */
function stripFooter(html) {
  return html.replace(/<footer[\s\S]*?<\/footer>/, "");
}

/** Extract the <footer> element (there is exactly one per page). */
function extractFooter(html) {
  const match = html.match(/<footer[\s\S]*?<\/footer>/);
  assert.ok(match, "expected exactly one <footer> landmark");
  return match[0];
}

/**
 * Per-route markers, verified against the real rendered HTML:
 *   it     — Italian strings that MUST be present with the `it` cookie;
 *   en     — English strings that MUST be present with the `en` cookie;
 *   noEn   — English strings that MUST NOT appear in the Italian page
 *            content (footer stripped). Technical identifiers shared by both
 *            languages (GDPR, ODbL 1.0, AGPL-3.0-or-later, CC BY-SA 4.0,
 *            privacy@opensurveillancedb.org) are deliberately NOT used here.
 */
const INFO_ROUTES = {
  "/privacy": {
    it: ["Informativa sulla privacy", "Titolare del trattamento", "Art. 6(1)(f) GDPR", "privacy@opensurveillancedb.org"],
    en: ["Privacy notice", "Controller"],
    noEn: ["Privacy notice", "Controller", "Terms of use", "Licences"],
  },
  "/termini": {
    it: ["Termini di utilizzo", "Titolare / gestore", "ODbL 1.0", "privacy@opensurveillancedb.org"],
    en: ["Terms of use", "Controller / operator", "Licences"],
    noEn: ["Terms of use", "Privacy notice", "Licences"],
  },
  "/licenze": {
    it: ["Licenze", "AGPL-3.0-or-later", "ODbL 1.0", "CC BY-SA 4.0"],
    en: ["Licences", "AGPL-3.0-or-later"],
    noEn: ["Licences", "Terms of use", "Privacy notice"],
  },
  "/accessibility": {
    it: ["Dichiarazione di accessibilità", "Impegno", "Stato di conformità", "Limitazioni note", "Segnalare una barriera", "privacy@opensurveillancedb.org"],
    en: ["Accessibility statement", "Partially compliant", "privacy@opensurveillancedb.org"],
    noEn: ["Accessibility statement", "Compliance status", "Known limitations", "Reporting a barrier"],
  },
  "/faq": {
    it: ["Domande frequenti", "Come si segnala una telecamera?", "Quanto è precisa la mappa?", "Come si corregge un errore?", "E per quanto riguarda la privacy?"],
    en: ["How do I report a camera?", "How accurate is the map?", "How do I correct an error?", "What about privacy?"],
    noEn: ["How do I report a camera?", "How accurate is the map?", "How do I correct an error?", "What about privacy?"],
  },
  "/contatti": {
    it: ["Contatti e responsabilità", "Chi gestisce il progetto e come contattarci."],
    en: ["Who runs this, and how to reach us."],
    noEn: ["Who runs this, and how to reach us.", "Contact"],
  },
  "/manifesto": {
    it: ["Manifesto del progetto", "Un manifesto per uno spazio pubblico leggibile."],
    en: ["A manifesto for legible public space."],
    noEn: ["A manifesto for legible public space."],
  },
  "/regole": {
    it: ["Regole di partecipazione", "Cosa pubblichiamo e come puoi aiutare."],
    en: ["What we publish, and how you can help."],
    noEn: ["What we publish, and how you can help."],
  },
  "/moderazione": {
    it: ["Come funziona la moderazione", "Revisionato da persone, non pubblicato di default."],
    en: ["Reviewed by people, not published by default."],
    noEn: ["Reviewed by people, not published by default."],
  },
  "/guide": {
    it: ["Guida al progetto", "Un database pubblico, costruito con attenzione."],
    en: ["A public database, built with care."],
    noEn: ["A public database, built with care."],
  },
  // Private auth surface (C5): /account SSRs the client shell in the cookie
  // language — the h1 and the loading note are the parity markers (the
  // data-driven profile renders client-side only, never in SSR).
  "/account": {
    it: ["Il tuo account", "Caricamento…"],
    en: ["Your account", "Loading…"],
    noEn: ["Your account", "Loading…", "Not logged in"],
  },
  // Record detail (C5): the verification widget is client-rendered; the SSR
  // shell carries the localized loading note and the back link. The back
  // label contains an apostrophe, which React SSRs HTML-escaped as
  // &#x27; — the marker matches the emitted form (verified against output).
  "/records/1": {
    it: ["Caricamento del record pubblico…", "Torna all&#x27;elenco"],
    en: ["Loading the public record…", "← Back to directory"],
    noEn: ["Loading the public record…", "← Back to directory", "Record navigation"],
  },
  // Home hub (F2 route group home, t_52dcb95e): l'hub è ora una pagina
  // SSR-pura di orientamento con hero, MapTeaser statico e 4 card tool.
  // I marker verificano la parità EN/IT delle nuove stringhe dell'hub
  // (CTA hero, teaser, card tool, link manifesto).
  "/": {
    it: ["Dati pubblici sulla sorveglianza pubblica.", "Esplora la mappa interattiva", "Apri la mappa", "Cosa puoi fare", "Segnala una telecamera", "Correggi un record", "Leggi il manifesto"],
    en: ["Public data about public surveillance.", "Explore the interactive map", "Open the map", "What you can do", "Report a camera", "Correct a record", "Read the manifesto"],
    noEn: ["Explore the interactive map", "Open the map", "What you can do", "Report a camera", "Correct a record", "Read the manifesto"],
  },
  // Route tool separate (F1 route group (tools), t_03c0fa15): /mappa e
  // /directory sono pagine pubbliche, /segnala e /correggi form privati
  // (noindex) — tutte servono contenuto EN/IT dal cookie come le pagine info.
  // /mappa (t_966254a1, t_11e38eab): nessun header visibile — il tool-heading
  // (eyebrow "Live prototype" + intro) è stato rimosso, la pagina parte
  // direttamente con la card della mappa. L'h1 (pageTitle) resta nel DOM come
  // sr-only per a11y, quindi "Interactive map"/"Mappa interattiva" restano
  // presenti; "Live prototype"/"Prototipo attivo" sono spariti col blocco.
  "/mappa": {
    it: ["Mappa interattiva"],
    en: ["Interactive map"],
    noEn: ["Interactive map"],
  },
  "/directory": {
    // F5 (P1-5): the tool page has ONE page header (.tool-heading h1 + pageIntro).
    // The duplicated records-heading (eyebrow + h2 + intro) is removed when the
    // directory is embedded in the tool page — the markers pin the remaining copy.
    it: ["Elenco pubblico", "Cerca, filtra e ordina"],
    en: ["Public directory", "Search, filter and order"],
    noEn: ["Public directory", "Search, filter and order"],
  },
  "/segnala": {
    // F5 (P1-5): same — one page header; the ReportForm eyebrow + h2 + intro is
    // removed when embedded, the report-rule ("Before submitting") stays.
    it: ["Segnala una telecamera", "Prima di inviare"],
    en: ["Report a camera", "Before submitting"],
    noEn: ["Report a camera", "Before submitting"],
  },
  "/correggi": {
    it: ["Correggi un record", "Le correzioni sono private"],
    en: ["Correct a record", "Corrections are private"],
    noEn: ["Correct a record", "Corrections are private"],
  },
};

// ---------------------------------------------------------------------------
// 1. Italian content when the locale cookie is `it`
// ---------------------------------------------------------------------------

test("informative pages serve their Italian content when the locale cookie is it", async () => {
  for (const [requestPath, markers] of Object.entries(INFO_ROUTES)) {
    const { response, html } = await renderPath(requestPath, "it");

    assert.equal(response.status, 200, `${requestPath} (it) should return 200`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    for (const marker of markers.it) {
      assert.ok(html.includes(marker), `${requestPath} (it) should contain "${marker}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. No English residual markers in the Italian renderings
// ---------------------------------------------------------------------------

test("Italian renderings contain no English residual markers in the page content", async () => {
  for (const [requestPath, markers] of Object.entries(INFO_ROUTES)) {
    const { html } = await renderPath(requestPath, "it");
    // The footer is asserted separately below (it now SSRs the cookie
    // locale); the no-English contract applies to the page content.
    const content = stripFooter(html);

    for (const marker of markers.noEn) {
      assert.ok(
        !content.includes(marker),
        `${requestPath} (it) must not contain English marker "${marker}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Language toggle: the same route renders EN and IT without crashing
// ---------------------------------------------------------------------------

test("every informative route renders EN and IT without crashing and flips its title", async () => {
  for (const [requestPath, markers] of Object.entries(INFO_ROUTES)) {
    const en = await renderPath(requestPath, "en");
    const it = await renderPath(requestPath, "it");

    assert.equal(en.response.status, 200, `${requestPath} (en) should render 200`);
    assert.equal(it.response.status, 200, `${requestPath} (it) should render 200`);
    assert.match(en.response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.match(it.response.headers.get("content-type") ?? "", /^text\/html\b/i);

    for (const marker of markers.en) {
      assert.ok(en.html.includes(marker), `${requestPath} (en) should contain "${marker}"`);
    }
    for (const marker of markers.it) {
      assert.ok(it.html.includes(marker), `${requestPath} (it) should contain "${marker}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Former SSR limitations, now fixed (findings QA-2026-08-01-1 / -3)
//
// The original QA suite pinned both defects (contrast-exception pattern). The
// fix (t_b73f4946) flipped these assertions deliberately: the root layout
// propagates the cookie locale to <html lang> and seeds LocaleProvider's SSR
// snapshot, so first paint matches the user's language everywhere.
// ---------------------------------------------------------------------------

test("SSR <html lang> matches the cookie locale: it on Italian pages, en by default (flipped fix, QA-2026-08-01-3)", async () => {
  // FLIPPED from the pinned behaviour (lang="en" always): the root layout
  // reads the server locale (getServerLocale, ADR 0015) and renders
  // <html lang={locale}>, so SSR emits lang="it" for Italian content —
  // screen readers announce the right language at first paint, before any
  // client JavaScript runs. Without a cookie the pilot language (en, ADR
  // 0007) is served, which is also what crawlers see.
  for (const [requestPath] of Object.entries(INFO_ROUTES)) {
    const { html } = await renderPath(requestPath, "it");
    assert.match(html, /<html[^>]*lang="it"/, `${requestPath} (it) SSR must declare lang="it"`);
  }
  // Default without a cookie stays English (pilot language).
  const { html } = await renderPath("/privacy");
  assert.match(html, /<html[^>]*lang="en"/, "/privacy (no cookie) SSR must declare lang=\"en\"");
});

test("SSR footer renders Italian labels on Italian pages (flipped fix, QA-2026-08-01-1)", async () => {
  // FLIPPED from the pinned defect (EN footer in IT SSR): the root layout
  // passes its server locale (getServerLocale, ADR 0015) into LocaleProvider,
  // which uses it as the useSyncExternalStore SSR snapshot. The global
  // SiteFooter (a "use client" component reading the context) therefore SSRs
  // the cookie language: Italian pages carry the Italian footer labels (links
  // + tagline) from first paint — no mixed-language HTML for crawlers/no-JS,
  // no EN->IT flash. After hydration the client snapshot (localStorage) takes
  // over exactly as before. Labels asserted here are the real it.ts bundle
  // values ("Privacy" and "FAQ" are identical in both languages, so the
  // discriminators are the labels that actually differ).
  const { html } = await renderPath("/privacy", "it");
  const footer = extractFooter(html);

  for (const marker of ["Regole", "Guida", "Licenze", "Contatti"]) {
    assert.ok(footer.includes(marker), `SSR footer on Italian /privacy should contain "${marker}"`);
  }
  // React SSR encodes the apostrophe in "Termini d'uso" as &#x27; in the raw
  // HTML, so match the entity-tolerant form instead of the plain string.
  assert.match(footer, /Termini d(&#x27;|')uso/, "SSR footer on Italian /privacy should contain \"Termini d'uso\"");
  assert.match(footer, /creato per la trasparenza, non per il tracciamento\./);
  assert.match(footer, /Piè di pagina del sito/, "Italian footer must keep the localized landmark aria-label");
  // And the English footer labels are NOT present in the SSR HTML.
  for (const marker of ["Rules", "Guide", "Terms of use", "Licenses", "Contact", "built for transparency, not tracking."]) {
    assert.ok(!footer.includes(marker), `SSR footer on Italian /privacy must not contain English "${marker}"`);
  }
});

// ---------------------------------------------------------------------------
// 5. Client-side: cookie write on toggle + LegalPage renders both languages
//
// NOTE: the DOM harness installs jsdom globals (AbortController/AbortSignal)
// that undici rejects, so the Miniflare SSR tests above MUST run first. That
// is why the client tests live in a describe group at the END of the file:
// node:test executes top-level tests in declaration order, and this group's
// `before` hook only fires when the group starts.
// ---------------------------------------------------------------------------

describe("client-side: locale toggle cookie + LegalPage rendering", () => {
  let rtl;
  let LocaleToggle;
  let LegalPage;
  let legalMessages;
  let homeLabels;

  before(async () => {
    rtl = await setupDom();
    const localeMod = await loadDomModule("app/components/LocaleProvider.mjs");
    LocaleToggle = localeMod.LocaleToggle;
    const legalMod = await loadDomModule("app/components/LegalPage.mjs");
    LegalPage = legalMod.LegalPage;
    const legalIndex = await loadDomModule("app/lib/legal/index.mjs");
    legalMessages = legalIndex.legalMessages;
    const i18n = await loadDomModule("app/lib/i18n/index.mjs");
    homeLabels = {
      en: i18n.messages.en.home,
      it: i18n.messages.it.home,
    };
  });

  afterEach(() => rtl?.cleanup());

  test("client: locale toggle writes the locale cookie that drives the server switch", async () => {
    const { screen } = rtl;
    const user = rtl.userEvent.setup();
    window.localStorage.clear();
    document.cookie = `${LOCALE_COOKIE}=; max-age=0; path=/`; // ensure clean start

    await renderWithLocale(
      React.createElement(React.Fragment, null, React.createElement(LocaleToggle)),
    );

    assert.ok(!document.cookie.includes(LOCALE_COOKIE), "no locale cookie before the first toggle");

    await user.click(screen.getByText("IT"));
    assert.ok(
      document.cookie.includes(`${LOCALE_COOKIE}=it`),
      `clicking IT must write ${LOCALE_COOKIE}=it so the next server render is Italian`,
    );
    // Same effect as client-locale-toggle.test.mjs: lang follows the locale.
    assert.equal(document.documentElement.getAttribute("lang"), "it");

    await user.click(screen.getByText("EN"));
    assert.ok(
      document.cookie.includes(`${LOCALE_COOKIE}=en`),
      `clicking EN must write ${LOCALE_COOKIE}=en`,
    );
    assert.equal(document.documentElement.getAttribute("lang"), "en");
  });

  test("client: LegalPage renders both English and Italian legal content without crashing", async () => {
    const renderLegal = (locale) =>
      renderWithLocale(
        React.createElement(LegalPage, {
          content: legalMessages[locale].privacy,
          navLabels: {
            mainNavigation: homeLabels[locale].mainNavigation,
            homeAria: homeLabels[locale].homeAria,
          },
        }),
      );

    window.localStorage.setItem("opensurveillancedb-locale", "en");
    const enView = await renderLegal("en");
    assert.ok(enView.container.textContent.includes("Privacy notice"), "EN legal content must render");
    assert.ok(enView.container.textContent.includes("Controller"), "EN privacy marker must render");

    window.localStorage.setItem("opensurveillancedb-locale", "it");
    const itView = await renderLegal("it");
    assert.ok(itView.container.textContent.includes("Informativa sulla privacy"), "IT legal content must render");
    assert.ok(itView.container.textContent.includes("Titolare del trattamento"), "IT controller marker must render");
    assert.ok(itView.container.textContent.includes("Art. 6(1)(f) GDPR"), "IT GDPR basis marker must render");

    enView.unmount();
    itView.unmount();
  });
});
