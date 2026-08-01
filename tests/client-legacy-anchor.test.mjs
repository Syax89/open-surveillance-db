/**
 * LegacyAnchorRedirect (F3, t_2ca69725) — client-side redirect of the legacy
 * home-page tool anchors (#map #records #report #correction) to the new tool
 * routes.
 *
 * A URL fragment NEVER reaches the server, so a 302 cannot work (CTO
 * correction to Vera's D8, t_f24c3227, FRONTEND_PLAN.md §1.2); this client
 * component is the progressive enhancement that keeps old bookmarks and
 * shared links working. The SSR side of the contract (the server serves the
 * page 200 and never redirects for a fragment) is pinned in
 * navigation-pages.test.mjs.
 *
 * Tested here (jsdom, via the dom-harness navigation stub):
 *   - target per legacy anchor (map→/mappa, records→/directory,
 *     report→/segnala, correction→/correggi);
 *   - the current query string survives the redirect (future deep-link
 *     params such as ?focus= or ?freshness=);
 *   - language preservation: the locale is a cookie (ADR 0015), not a URL
 *     param — the redirect target is a clean internal path and the cookie is
 *     left untouched;
 *   - router.replace, never push: the redirect creates no history entry;
 *   - unknown / absent hashes are ignored, so in-page anchors that still
 *     exist on the home (#top, #how-it-works) keep working.
 *
 * Fixtures: no personal data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, setNavState,
  getNavState, React,
} from "./helpers/dom-harness.mjs";

const LOCALE_COOKIE = "opensurveillancedb-locale";

let rtl;
let LegacyAnchorRedirect;

before(async () => {
  rtl = await setupDom();
  LegacyAnchorRedirect = (await loadDomModule("app/components/LegacyAnchorRedirect.mjs")).LegacyAnchorRedirect;
});

// The redirect runs on mount; each render is a fresh mount, so per-test
// state is just the jsdom URL (via history.replaceState) and the nav stub.
function renderRedirect() {
  return renderWithLocale(React.createElement(LegacyAnchorRedirect));
}

// Reset the router.replace log between tests (the DOM auto-cleanup unmounts
// the previous render but the stub state is module-level).
afterEach(() => {
  rtl?.cleanup();
  setNavState({ pushed: [], replaced: [] });
});

test("each legacy anchor replaces to its tool route", async () => {
  const cases = {
    "#map": "/mappa",
    "#records": "/directory",
    "#report": "/segnala",
    "#correction": "/correggi",
  };
  for (const [hash, target] of Object.entries(cases)) {
    rtl.window.history.replaceState({}, "", `/${hash}`);
    await renderRedirect();
    const navState = await getNavState();
    assert.deepEqual(navState.replaced, [target], `${hash} must replace to ${target}`);
    rtl.cleanup();
    setNavState({ replaced: [] });
  }
});

test("the redirect preserves the current query string (deep-link params survive)", async () => {
  // URL shell: /?freshness=7d&type=Traffic%20monitoring#map — the query
  // params must ride along to the tool route, the fragment must not.
  rtl.window.history.replaceState({}, "", "/?freshness=7d&type=Traffic%20monitoring#map");
  await renderRedirect();
  const navState = await getNavState();
  assert.deepEqual(
    navState.replaced,
    ["/mappa?freshness=7d&type=Traffic%20monitoring"],
    "query params must be preserved, fragment dropped",
  );
});

test("language (locale cookie, ADR 0015) is untouched by the redirect", async () => {
  // The interface language lives in the opensurveillancedb-locale cookie
  // (ADR 0015), not in the URL: the redirect must neither read it nor add
  // locale params to the target — client-side navigation keeps the locale.
  rtl.window.document.cookie = `${LOCALE_COOKIE}=it; path=/`;
  rtl.window.history.replaceState({}, "", "/#map");
  await renderRedirect();
  const navState = await getNavState();
  assert.deepEqual(navState.replaced, ["/mappa"], "the target must not carry locale params");
  assert.ok(
    rtl.window.document.cookie.includes(`${LOCALE_COOKIE}=it`),
    "the locale cookie must be left untouched by the redirect",
  );
});

test("the redirect uses router.replace, never push (no history entry)", async () => {
  rtl.window.history.replaceState({}, "", "/#records");
  await renderRedirect();
  const navState = await getNavState();
  assert.deepEqual(navState.pushed, [], "the redirect must not push a history entry");
  assert.deepEqual(navState.replaced, ["/directory"], "the redirect must use replace");
});

test("unknown and absent hashes are ignored (in-page anchors keep working)", async () => {
  // #how-it-works (and #top) are still real in-page anchors on the home —
  // they must never redirect.
  rtl.window.history.replaceState({}, "", "/#how-it-works");
  await renderRedirect();
  assert.deepEqual((await getNavState()).replaced, [], "unknown anchor must not redirect");
  rtl.cleanup();

  rtl.window.history.replaceState({}, "", "/");
  await renderRedirect();
  assert.deepEqual((await getNavState()).replaced, [], "no hash must not redirect");
});
