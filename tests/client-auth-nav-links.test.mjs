/**
 * Client-side DOM tests for AuthNavLinks — the header auth entry point
 * (kanban t_65b778c5, CEO request 2026-08-02; mobile placement fix
 * t_94b3726d).
 *
 * The shared public header carries login/register/account links as the
 * LAST item of the .nav-links container (PublicNav renders AuthNavLinks
 * right after PublicNavLinks): on mobile (<768px) the container collapses
 * into the hamburger menu, so the auth links travel inside it — no more
 * separate top-bar slot that wrapped the header at 320/390px (CEO live
 * feedback 2026-08-02); on desktop (≥768px) the container is the inline
 * row and the auth cluster stays visible in the header, pushed to the
 * right end. Session state comes from GET /api/auth/me (the same endpoint
 * the account page uses — server half app/lib/auth-session.ts).
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
 *   6. PublicNav integration: the auth links render INSIDE the mobile menu
 *      container (#main-links), right after the six shared nav links —
 *      never in a separate top-bar slot (the deepEqual pin below guards
 *      both the six content links and the in-menu auth placement, and the
 *      CSS viewport contract lives in header-mobile-menu-contract);
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

test("PublicNav: auth links live INSIDE the mobile menu (#main-links), after the six nav links — no top-bar slot", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(meHandler(401, { error: "Not authenticated." }));
  await setNavState({ pathname: "/login" });

  const view = await renderWithLocale(
    React.createElement(PublicNav, { navLabel: "Main navigation", homeLabel: "OpenSurveillanceDB home" }),
  );
  const container = view.container;

  // The auth entry point resolves INSIDE #main-links — the container that
  // collapses into the hamburger menu on mobile (<768px). There must be NO
  // separate top-bar auth slot (the old trailing slot wrapped the header
  // at 320/390px, CEO live feedback).
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Log in" })));

  // The six shared links stay first and untouched; the auth links follow
  // INSIDE the same container (t_94b3726d: the mobile-menu placement).
  const navLinks = [...container.querySelectorAll(".nav-links a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(
    navLinks,
    ["/mappa", "/directory", "/guide", "/regole", "/manifesto", "/segnala", "/login", "/register"],
    "the six shared public nav links must stay unchanged, with the auth links appended inside the menu container",
  );

  const mainLinks = container.querySelector("#main-links");
  assert.ok(mainLinks, "the mobile menu container #main-links must render");
  const authLinks = container.querySelector(".auth-nav-links");
  assert.ok(authLinks, "AuthNavLinks must render inside the header");
  assert.ok(mainLinks.contains(authLinks), "auth links must be INSIDE the mobile menu container");

  // aria-current travels with the auth links into the menu (WCAG 2.2 AA):
  // the current auth route is marked inside the dropdown, not on a hidden
  // desktop-only slot.
  const loginLink = authLinks.querySelector('a[href="/login"]');
  assert.equal(loginLink.getAttribute("aria-current"), "page", "the in-menu Log in link marks the current page");

  // The top bar (direct children of the nav shell) carries no auth slot:
  // brand, menu button, nav-links, locale toggle only.
  const shell = container.querySelector("nav.nav-shell");
  const classes = [...shell.children].map((el) => el.className.trim());
  assert.ok(!classes.includes("auth-nav-links"), "no auth slot in the top bar — auth lives inside the mobile menu");
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
