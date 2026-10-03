/**
 * Client-side locale toggle tests — QA t_61b90f6a.
 *
 * Renders the real LocaleProvider (the client components' i18n context) with
 * the real SiteFooter inside, then drives the EN/IT toggle with user-event:
 *   1. the initial locale is English (document lang=EN, English strings);
 *   2. clicking IT switches the visible texts to Italian AND sets
 *      document.documentElement.lang="it" (the provider writes the lang
 *      attribute in an effect);
 *   3. the choice is persisted to localStorage under
 *      opensurveillancedb-locale, and clicking EN switches back;
 *   4. the toggle buttons expose aria-pressed so AT users know the active
 *      locale.
 *
 * No personal data: only interface strings are asserted.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, setNavState, getNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let LocaleToggle;
let SiteFooter;

before(async () => {
  rtl = await setupDom();
  const localeMod = await loadDomModule("app/components/LocaleProvider.mjs");
  LocaleToggle = localeMod.LocaleToggle;
  const footerMod = await loadDomModule("app/components/SiteFooter.mjs");
  SiteFooter = footerMod.SiteFooter;
});

afterEach(() => rtl?.cleanup());

const EN_TAGLINE = "An open database of public surveillance cameras, built for transparency, not tracking.";
const IT_TAGLINE = "Un database aperto delle telecamere di sorveglianza pubblica, creato per la trasparenza, non per il tracciamento.";

test("locale: starts in English with lang=en and English strings", async () => {
  const { screen } = rtl;
  window.localStorage.clear();

  await renderWithLocale(
    React.createElement(React.Fragment, null,
      React.createElement(LocaleToggle),
      React.createElement(SiteFooter),
    ),
  );

  assert.equal(document.documentElement.getAttribute("lang"), "en");
  assert.ok(screen.getByText(EN_TAGLINE));
  assert.equal(screen.getByText("EN").getAttribute("aria-pressed"), "true");
  assert.equal(screen.getByText("IT").getAttribute("aria-pressed"), "false");
  // Skip link is part of the provider output.
  assert.ok(screen.getByText("Skip to main content"));
});

test("locale: clicking IT switches texts, lang attribute and persists the choice", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  window.localStorage.clear();

  await renderWithLocale(
    React.createElement(React.Fragment, null,
      React.createElement(LocaleToggle),
      React.createElement(SiteFooter),
    ),
  );

  await user.click(screen.getByText("IT"));

  // lang attribute on <html> is written by the provider effect.
  assert.equal(document.documentElement.getAttribute("lang"), "it");
  // Visible texts switched to Italian.
  assert.ok(screen.getByText(IT_TAGLINE));
  assert.equal(screen.queryByText(EN_TAGLINE), null);
  // aria-pressed moved to IT.
  assert.equal(screen.getByText("IT").getAttribute("aria-pressed"), "true");
  assert.equal(screen.getByText("EN").getAttribute("aria-pressed"), "false");
  // Persisted for the next page load.
  assert.equal(window.localStorage.getItem("opensurveillancedb-locale"), "it");
});

test("locale: switching back to EN restores English and lang=en", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  window.localStorage.setItem("opensurveillancedb-locale", "it");

  await renderWithLocale(
    React.createElement(React.Fragment, null,
      React.createElement(LocaleToggle),
      React.createElement(SiteFooter),
    ),
  );
  assert.equal(document.documentElement.getAttribute("lang"), "it");
  assert.ok(screen.getByText(IT_TAGLINE));

  await user.click(screen.getByText("EN"));
  assert.equal(document.documentElement.getAttribute("lang"), "en");
  assert.ok(screen.getByText(EN_TAGLINE));
  assert.equal(window.localStorage.getItem("opensurveillancedb-locale"), "en");
});

test("locale: an invalid stored value falls back to English", async () => {
  const { screen } = rtl;
  window.localStorage.setItem("opensurveillancedb-locale", "fr");

  await renderWithLocale(
    React.createElement(React.Fragment, null,
      React.createElement(LocaleToggle),
      React.createElement(SiteFooter),
    ),
  );

  assert.equal(document.documentElement.getAttribute("lang"), "en");
  assert.ok(screen.getByText(EN_TAGLINE));
});

test("locale: language selection group is labelled for AT", async () => {
  const { screen } = rtl;
  window.localStorage.clear();

  await renderWithLocale(
    React.createElement(React.Fragment, null,
      React.createElement(LocaleToggle),
      React.createElement(SiteFooter),
    ),
  );

  const group = screen.getByLabelText("Language selection");
  assert.equal(group.className, "locale-toggle");
});

test("locale: switching on /contribuisci refreshes its server-rendered content", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  window.localStorage.clear();
  await setNavState({ url: "/contribuisci", refreshed: 0 });

  await renderWithLocale(React.createElement(LocaleToggle));
  await user.click(screen.getByText("IT"));

  assert.equal(
    (await getNavState()).refreshed,
    1,
    "the support page is server-rendered, so its Italian content needs router.refresh()",
  );
});

/*
 * SSR-route regression matrix (t_61b90f6a follow-up). LocaleToggle needs
 * router.refresh() (to re-fetch the Server Component text after the cookie
 * write) for every route in SERVER_RENDERED_INFO_ROUTES. A GUI QA sweep
 * found 10 of them stuck in the pre-toggle language (cookie updated, visible
 * text didn't) until they were added to the allowlist. These tests pin the
 * refresh + cookie half of that contract for the WHOLE allowlist, in BOTH
 * switch directions — they drive the real LocaleToggle and the existing
 * navigation harness, and reuse the same i18n wiring (no duplicated
 * helpers). The list below is deliberately a literal mirror of the
 * allowlist: deleting a route from the source then fails that route's test
 * instead of silently dropping its coverage.
 */
const SERVER_RENDERED_ROUTES = [
  // newly covered by the 10-route fix (were stuck in the stale language)
  "/", "/accessibility", "/account", "/api-docs", "/fonti",
  "/forgot-password", "/login", "/register", "/reset-password",
  "/verify-email", "/moderation",
  // pre-existing allowlist entries (regression guard for the same contract)
  "/guide", "/manifesto", "/regole", "/faq", "/contatti",
  "/contribuisci", "/privacy", "/termini", "/licenze",
];

async function expectRefreshAndCookieOn(route) {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  // localStorage wins over the (persisted) cookie in readStoredLocale, so
  // seed the locale explicitly to make every route test start in English.
  window.localStorage.setItem("opensurveillancedb-locale", "en");
  await setNavState({ url: route, refreshed: 0 });

  await renderWithLocale(React.createElement(LocaleToggle));
  assert.equal(screen.getByText("EN").getAttribute("aria-pressed"), "true");

  // EN → IT: refresh the server-rendered route and persist the cookie.
  await user.click(screen.getByText("IT"));
  assert.equal(
    (await getNavState()).refreshed,
    1,
    `${route}: switching to IT must router.refresh() the server-rendered route`,
  );
  assert.match(
    document.cookie,
    /(?:^|;\s*)opensurveillancedb-locale=it(?:;|$)/,
    `${route}: the locale cookie must persist IT for the next server request`,
  );

  // IT → EN: both directions refresh and persist.
  await user.click(screen.getByText("EN"));
  assert.equal(
    (await getNavState()).refreshed,
    2,
    `${route}: switching back to EN must router.refresh() again`,
  );
  assert.match(
    document.cookie,
    /(?:^|;\s*)opensurveillancedb-locale=en(?:;|$)/,
    `${route}: the locale cookie must persist EN for the next server request`,
  );
}

for (const route of SERVER_RENDERED_ROUTES) {
  test(`locale: toggling on ${route} refreshes the SSR route and persists the cookie (both directions)`, async () => {
    await expectRefreshAndCookieOn(route);
  });
}
