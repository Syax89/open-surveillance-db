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
 * Known SSR limitations are PINNED, not hidden, with a comment pointing at
 * the finding id (same pattern as the loading-note contrast exception in
 * navigation-pages.test.mjs):
 *   - the root layout hardcodes <html lang="en"> (app/layout.tsx) so SSR
 *     never emits lang="it", even for Italian content (finding
 *     QA-2026-08-01-3; the client LocaleProvider fixes the attribute after
 *     hydration — pinned in client-locale-toggle.test.mjs);
 *   - the global SiteFooter is a client component whose SSR snapshot is
 *     always English, so the server-rendered HTML of Italian pages carries
 *     the English footer labels until hydration (finding QA-2026-08-01-1).
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

/** Drop the global site-footer landmark (client island, EN in SSR — pinned
 *  separately below) so the "no English residue" checks target the
 *  server-rendered page content. */
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
 *            privacy@opensurveillancedb) are deliberately NOT used here.
 */
const INFO_ROUTES = {
  "/privacy": {
    it: ["Informativa sulla privacy", "Titolare del trattamento", "Art. 6(1)(f) GDPR", "privacy@opensurveillancedb"],
    en: ["Privacy notice", "Controller"],
    noEn: ["Privacy notice", "Controller", "Terms of use", "Licences"],
  },
  "/termini": {
    it: ["Termini di utilizzo", "Titolare / gestore", "ODbL 1.0", "privacy@opensurveillancedb"],
    en: ["Terms of use", "Controller / operator", "Licences"],
    noEn: ["Terms of use", "Privacy notice", "Licences"],
  },
  "/licenze": {
    it: ["Licenze", "AGPL-3.0-or-later", "ODbL 1.0", "CC BY-SA 4.0"],
    en: ["Licences", "AGPL-3.0-or-later"],
    noEn: ["Licences", "Terms of use", "Privacy notice"],
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
    // The footer is a client island that always SSRs English (pinned in its
    // own test below); the no-English contract applies to the page content.
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
// 4. Known SSR limitations, pinned (findings QA-2026-08-01-1 / -3)
// ---------------------------------------------------------------------------

test("SSR <html lang> stays \"en\" even on Italian pages (pinned SSR limitation, QA-2026-08-01-3)", async () => {
  // app/layout.tsx hardcodes <html lang="en">: server components pick the
  // bundle from the cookie (server-i18n.ts) but never propagate the locale
  // to the document element. The client LocaleProvider fixes
  // document.documentElement.lang in an effect after hydration (pinned in
  // client-locale-toggle.test.mjs). Until the layout reads the server
  // locale, the first paint of an Italian page is announced as English —
  // e.g. screen readers may mispronounce Italian text. This assertion pins
  // the current behaviour so a fix must update it deliberately.
  for (const [requestPath] of Object.entries(INFO_ROUTES)) {
    const { html } = await renderPath(requestPath, "it");
    assert.match(html, /<html[^>]*lang="en"/, `${requestPath} (it) SSR still declares lang="en"`);
  }
});

test("SSR footer renders English labels even on Italian pages (pinned defect, QA-2026-08-01-1)", async () => {
  // SiteFooter is a "use client" component reading the LocaleProvider
  // context, whose SSR snapshot is always "en" (it cannot read the cookie).
  // The cookie-based server i18n therefore does NOT reach the global footer:
  // the server-rendered HTML of Italian pages mixes Italian content with an
  // English footer (links + tagline). After hydration the footer switches to
  // the stored locale for users with a preference; without JS, or before
  // hydration, the page is mixed-language. This pins the current behaviour;
  // a fix (reading the locale cookie in the root layout / footer SSR) must
  // flip these assertions to the Italian labels.
  const { html } = await renderPath("/privacy", "it");
  const footer = extractFooter(html);

  for (const marker of ["Rules", "Guide", "Privacy", "Terms of use", "Licenses", "FAQ", "Contact"]) {
    assert.ok(footer.includes(marker), `SSR footer on Italian /privacy still contains "${marker}"`);
  }
  assert.match(footer, /built for transparency, not tracking\./);
  // And the Italian footer labels are NOT present in the SSR HTML.
  for (const marker of ["Regole", "Termini di utilizzo", "Licenze", "Creato per la trasparenza"]) {
    assert.ok(!footer.includes(marker), `SSR footer on Italian /privacy must not contain "${marker}"`);
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
            exploreMap: homeLabels[locale].exploreMap,
            browseRecords: homeLabels[locale].browseRecords,
            howItWorks: homeLabels[locale].howItWorks,
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
