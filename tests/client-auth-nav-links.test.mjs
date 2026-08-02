/**
 * Client-side DOM tests for AuthNavLinks — the header auth entry point
 * (kanban t_65b778c5, CEO request 2026-08-02).
 *
 * The shared public header now carries login/register/account links in the
 * TOP-RIGHT corner (SiteHeader `trailing` slot, to the right of the
 * LocaleToggle). Session state comes from GET /api/auth/me (the same
 * endpoint the account page uses — server half app/lib/auth-session.ts).
 *
 * Covers:
 *   1. anonymous (401): renders "Log in" (/login) + "Create account"
 *      (/register) with the localized auth-bundle labels;
 *   2. signed in (200): renders the account link (/account) with the
 *      display name when present, else the localized account title, and
 *      always the account aria-label;
 *   3. aria-current="page" on /login and /register when that route is the
 *      current page (same pattern as the six public nav links);
 *   4. fail-closed: a 5xx response, a network error, or no fetch at all
 *      renders NO links (never claim "anonymous" on an error we cannot
 *      interpret — privacy by design);
 *   5. no session leak into SSR HTML: the initial state renders nothing
 *      (the links appear only after the endpoint resolves);
 *   6. PublicNav integration: the header renders AuthNavLinks in the
 *      top-right slot AFTER the LocaleToggle, while the six shared nav
 *      links (.nav-links) stay untouched (contract guard: the deepEqual
 *      pin in client-tools/a11y-interactive keeps passing);
 *   7. locale: Italian labels ("Accedi", "Crea account") when the stored
 *      locale is IT (labels from i18n/auth.ts:90/91).
 *
 * Fixtures are fictitious (example.test address, made-up display name).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let AuthNavLinks;
let PublicNav;

before(async () => {
  rtl = await setupDom();
  AuthNavLinks = (await loadDomModule("app/components/AuthNavLinks.mjs")).AuthNavLinks;
  PublicNav = (await loadDomModule("app/components/PublicNav.mjs")).PublicNav;
});

afterEach(() => rtl?.cleanup());

const signedInFixture = {
  contributor: {
    id: 1,
    email: "contributor@example.test",
    displayName: "Fixture Contributor",
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T10:00:00.000Z",
  },
};

function meHandler(status, body) {
  return (input) => {
    assert.equal(input, "/api/auth/me", "AuthNavLinks must read the session from /api/auth/me");
    return jsonResponse(body, { status });
  };
}

test("auth header: anonymous visitor gets Log in (/login) + Create account (/register)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(meHandler(401, { error: "Not authenticated." }));

  await renderWithLocale(React.createElement(AuthNavLinks));
  // Initial state renders nothing (no session leak), then the 401 resolves
  // to the anonymous links.
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Log in" })));

  const login = screen.getByRole("link", { name: "Log in" });
  assert.equal(login.getAttribute("href"), "/login");
  const register = screen.getByRole("link", { name: "Create account" });
  assert.equal(register.getAttribute("href"), "/register");
  // No account link for an anonymous visitor.
  assert.equal(screen.queryByRole("link", { name: "Your account" }), null);
});

test("auth header: signed-in visitor gets the account link with the display name", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(meHandler(200, signedInFixture));

  const view = await renderWithLocale(React.createElement(AuthNavLinks));
  // The accessible name is the aria-label ("Your account"); the display
  // name is the visible text inside the link.
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Your account" })));

  const account = screen.getByRole("link", { name: "Your account" });
  assert.equal(account.getAttribute("href"), "/account");
  assert.equal(account.getAttribute("aria-label"), "Your account");
  assert.ok(account.textContent.includes("Fixture Contributor"), "the visible link text must be the display name");
  assert.equal(view.container.querySelector(".auth-nav-links a").textContent, "Fixture Contributor");
  // No login/register links for a signed-in visitor.
  assert.equal(screen.queryByRole("link", { name: "Log in" }), null);
  assert.equal(screen.queryByRole("link", { name: "Create account" }), null);
});

test("auth header: signed-in visitor without a display name gets the localized account title", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(meHandler(200, {
    contributor: { ...signedInFixture.contributor, displayName: null },
  }));

  await renderWithLocale(React.createElement(AuthNavLinks));
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Your account" })));

  const account = screen.getByRole("link", { name: "Your account" });
  assert.equal(account.getAttribute("href"), "/account");
  assert.equal(account.getAttribute("aria-label"), "Your account");
});

test("auth header: aria-current marks the current auth page (same pattern as the public nav)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(meHandler(401, { error: "Not authenticated." }));

  await setNavState({ pathname: "/login" });
  await renderWithLocale(React.createElement(AuthNavLinks));
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Log in" })));
  assert.equal(screen.getByRole("link", { name: "Log in" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Create account" }).getAttribute("aria-current"), null);
  rtl.cleanup();

  await setNavState({ pathname: "/register" });
  installFetchMock(meHandler(401, { error: "Not authenticated." }));
  await renderWithLocale(React.createElement(AuthNavLinks));
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Create account" })));
  assert.equal(screen.getByRole("link", { name: "Create account" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Log in" }).getAttribute("aria-current"), null);
});

test("auth header: fail-closed on a 5xx — no login/register/account links at all", async () => {
  const { screen } = rtl;
  installFetchMock(meHandler(503, { error: "Unable to read the session" }));

  const view = await renderWithLocale(React.createElement(AuthNavLinks));
  // Give the rejected promise a chance to settle, then assert nothing.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(view.container.querySelectorAll(".auth-nav-links a").length, 0);
  assert.equal(screen.queryByRole("link", { name: "Log in" }), null);
  assert.equal(screen.queryByRole("link", { name: "Your account" }), null);
});

test("auth header: fail-closed on a network error — no links", async () => {
  const { screen } = rtl;
  installFetchMock(() => Promise.reject(new TypeError("network down")));

  const view = await renderWithLocale(React.createElement(AuthNavLinks));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(view.container.querySelectorAll(".auth-nav-links a").length, 0);
  assert.equal(screen.queryByRole("link", { name: "Log in" }), null);
});

test("auth header: fail-closed when fetch is unavailable — no links", async () => {
  // No installFetchMock in this test: globalThis.fetch is not installed by
  // the harness, so the component's try/catch lands on the fail-closed path
  // instead of crashing the render.
  const { screen } = rtl;
  globalThis.fetch = undefined;

  const view = await renderWithLocale(React.createElement(AuthNavLinks));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(view.container.querySelectorAll(".auth-nav-links a").length, 0);
  assert.equal(screen.queryByRole("link", { name: "Log in" }), null);
});

test("auth header: renders NOTHING before the endpoint resolves (no session leak in SSR HTML)", async () => {
  const { screen } = rtl;
  let resolveMe;
  installFetchMock(() => new Promise((resolve) => { resolveMe = resolve; }));

  const view = await renderWithLocale(React.createElement(AuthNavLinks));
  // The promise is still pending: the header must be empty.
  assert.equal(view.container.querySelectorAll(".auth-nav-links a").length, 0);
  assert.equal(view.container.querySelectorAll(".auth-nav-links").length, 0, "no auth-nav-links wrapper before resolution");

  // Resolve as anonymous → the links appear.
  resolveMe(jsonResponse({ error: "Not authenticated." }, { status: 401 }));
  await rtl.waitFor(() => assert.ok(screen.getByRole("link", { name: "Log in" })));
});

test("PublicNav: AuthNavLinks renders in the top-right slot, after the LocaleToggle, without touching the six nav links", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(meHandler(401, { error: "Not authenticated." }));
  await setNavState({ pathname: "/mappa" });

  const view = await renderWithLocale(
    React.createElement(PublicNav, { navLabel: "Main navigation", homeLabel: "OpenSurveillanceDB home" }),
  );
  const container = view.container;

  // The six shared links are untouched (contract guard for the deepEqual
  // pins in client-tools / a11y-interactive).
  const navLinks = [...container.querySelectorAll(".nav-links a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(
    navLinks,
    ["/mappa", "/directory", "/guide", "/regole", "/manifesto", "/segnala"],
    "the six shared public nav links must stay unchanged",
  );

  // The auth entry point resolves into the top-right slot, after the toggle.
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Log in" })));
  const toggle = container.querySelector(".locale-toggle");
  const authLinks = container.querySelector(".auth-nav-links");
  assert.ok(toggle, "LocaleToggle must render");
  assert.ok(authLinks, "AuthNavLinks must render inside the header");
  // Order contract: brand → nav-links → LocaleToggle → auth-nav-links.
  const shell = container.querySelector("nav.nav-shell");
  const children = [...shell.children].filter((el) => el.classList.contains("nav-links") || el.classList.contains("locale-toggle") || el.classList.contains("auth-nav-links"));
  const classes = children.map((el) => el.className.trim());
  assert.deepEqual(classes, ["nav-links", "locale-toggle", "auth-nav-links"], "auth links must sit to the RIGHT of the LocaleToggle");
});

test("auth header: Italian labels from the auth bundle (i18n/auth.ts:90/91)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(meHandler(401, { error: "Not authenticated." }));
  window.localStorage.setItem("opensurveillancedb-locale", "it");

  await renderWithLocale(React.createElement(AuthNavLinks));
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Accedi" })));

  const login = screen.getByRole("link", { name: "Accedi" });
  assert.equal(login.getAttribute("href"), "/login");
  const register = screen.getByRole("link", { name: "Crea account" });
  assert.equal(register.getAttribute("href"), "/register");
});
