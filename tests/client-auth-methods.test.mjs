/**
 * Client-side interaction tests for the multi-method /login (Fase E2 —
 * design review): one login tile with email + password as the primary flow
 * and passkey / configured OIDC alternatives below it, the passkey ceremony
 * flow, the OIDC provider links with the privacy disclosure, the manual merge
 * form (?merge=) and the OIDC failure marker (?oidc_error=1).
 *
 * Covers, in jsdom with @testing-library/react + user-event:
 *   1. one tile with the email + password primary section followed by
 *      passkey and OIDC alternatives (no nested method cards or selector);
 *   2. the OIDC provider links point at the /start routes and the Fase D
 *      privacy disclosure (tracking + DPF transfer) is rendered;
 *   3. a browser without WebAuthn gets an explanatory error instead of a
 *      crash;
 *   4. the passkey flow runs begin -> navigator.credentials.get ->
 *      complete with the exact JSON the backend verifies, and redirects to
 *      /account on success; the optional email narrows the begin payload;
 *   5. ?merge=<token> renders the merge form (no method blocks) and POSTs
 *      token + email + password to /api/auth/oidc/merge; a 410 drops the
 *      merge mode and announces the expired link;
 *   6. ?oidc_error=1 announces the provider failure.
 *
 * Fixtures are fictitious (example.test addresses, made-up tokens).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  getNavState, setNavState, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let LoginPage;

before(async () => {
  rtl = await setupDom();
  // QA#6 F2/F5 (t_9467ee7f): /login is a thin server shell; the interactive
  // body is the named-export client component LoginPageBody.
  LoginPage = (await loadDomModule("app/login/LoginPageBody.mjs")).LoginPageBody;
});

afterEach(() => rtl?.cleanup());

function loginForm() {
  return renderWithLocale(React.createElement(LoginPage));
}

/**
 * Render the login page with the OIDC provider-discovery route stubbed to
 * "both providers configured" (design review 2026-08-08, F1): the Google
 * card renders only when GET /api/auth/oidc/providers answers a non-empty
 * list — tests that exercise the social card must stub it.
 */
function loginFormWithSocial() {
  installFetchMock((input) => {
    if (String(input) === "/api/auth/oidc/providers") {
      return jsonResponse({ providers: ["github", "google"] });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  return renderWithLocale(React.createElement(LoginPage));
}

/** Fake the WebAuthn browser surface with a scriptable get() ceremony. */
function installWebAuthnGet(assertionImpl) {
  globalThis.PublicKeyCredential = class FakePublicKeyCredential {};
  Object.defineProperty(globalThis.navigator, "credentials", {
    configurable: true,
    value: {
      create: async () => { throw new Error("unused"); },
      get: async () => assertionImpl(),
    },
  });
}

function clearWebAuthnGlobals() {
  delete globalThis.PublicKeyCredential;
  try {
    delete globalThis.navigator.credentials;
  } catch {
    /* keep the jsdom navigator as-is */
  }
}

/** A PublicKeyCredential-shaped object for the authentication ceremony. */
function fakeAssertionCredential() {
  return {
    id: "assertion-id-b64",
    rawId: new Uint8Array([9, 8, 7]).buffer,
    type: "public-key",
    response: {
      clientDataJSON: new Uint8Array([1, 2]).buffer,
      authenticatorData: new Uint8Array([3, 4]).buffer,
      signature: new Uint8Array([5, 6]).buffer,
      userHandle: new Uint8Array([7, 8]).buffer,
    },
    getClientExtensionResults: () => ({}),
  };
}

test("login: one tile makes email+password primary, then passkey and OIDC alternatives", async () => {
  const { screen, waitFor } = rtl;
  await loginFormWithSocial();

  // One visual login tile, no radio selector or nested coherent-box cards.
  assert.equal(screen.queryByRole("radio"), null);
  const tiles = document.querySelectorAll("article.auth-card");
  assert.equal(tiles.length, 1, "the existing auth card is the one login tile");
  const tile = tiles[0];
  assert.equal(tile.querySelectorAll(".auth-method-card").length, 0, "no nested method cards");

  // Email + password is the first, clear primary section. The localized "or"
  // divider and alternatives group follow it in keyboard/DOM order.
  const primary = tile.querySelector(".auth-primary");
  const divider = tile.querySelector(".auth-divider");
  const alternatives = tile.querySelector(".auth-alternatives");
  assert.ok(primary, "the password form has a primary section");
  assert.ok(divider, "a visible alternative-method divider is rendered");
  assert.ok(alternatives, "passkey and OIDC share an alternatives group");
  assert.equal(divider.textContent?.trim(), "or");

  const sections = Array.from(tile.children);
  assert.ok(sections.indexOf(primary) < sections.indexOf(divider));
  assert.ok(sections.indexOf(divider) < sections.indexOf(alternatives));

  assert.ok(screen.getByRole("heading", { name: "Email + password", level: 2 }));
  assert.ok(primary.querySelector('input[name="email"]'));
  assert.ok(primary.querySelector('input[name="password"]'));
  assert.ok(screen.getByRole("button", { name: "Log in" }));

  assert.ok(screen.getByRole("heading", { name: "Other ways to sign in", level: 2 }));
  const passkeyHeading = screen.getByRole("heading", { name: "Passkey", level: 3 });
  assert.ok(alternatives.contains(passkeyHeading));
  assert.ok(screen.getByRole("button", { name: "Sign in with passkey" }));
  assert.ok(screen.getByLabelText(/Account email \(optional\)/));

  // The configured OIDC alternative appears only after provider discovery.
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Continue with GitHub" })));
  const socialHeading = screen.getByRole("heading", { name: "Google", level: 3 });
  assert.ok(alternatives.contains(socialHeading));
  assert.ok(screen.getByRole("link", { name: "Continue with Google" }));
});

test("login: OIDC providers link to the /start routes and declare the privacy risk", async () => {
  const { screen, waitFor } = rtl;
  await loginFormWithSocial();
  // The configured OIDC alternative appears only after provider discovery resolves.
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Continue with Google" })));

  const github = screen.getByRole("link", { name: "Continue with GitHub" });
  // P1-2: the redirect target is built with encodeURIComponent (returnTo or
  // the /account default); the /start route decodes it via searchParams.
  assert.equal(github.getAttribute("href"), "/api/auth/oidc/github/start?redirect_to=%2Faccount");
  const google = screen.getByRole("link", { name: "Continue with Google" });
  assert.equal(google.getAttribute("href"), "/api/auth/oidc/google/start?redirect_to=%2Faccount");

  // Fase D disclosure (AUTH_OPTIONS.md §4a): the provider tracking surface
  // and the EU-US transfer are declared here, with a link to the notice.
  // The social panel's disclosure is the oidc-disclosure box that is NOT a
  // per-method auth-method-disclosure (the password/passkey cards also
  // carry the oidc-disclosure class, so filter on the content).
  const oidcDisclosures = screen.getAllByText((_, element) => element?.classList?.contains("oidc-disclosure") ?? false);
  const socialDisclosure = oidcDisclosures.find((d) => /never imported or stored/i.test(d.textContent ?? ""));
  assert.ok(socialDisclosure, "the social panel carries the provider tracking disclosure");
  assert.ok(screen.getByRole("link", { name: "Privacy notice" }));
});

test("login: a browser without WebAuthn gets an explanatory error", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  clearWebAuthnGlobals();
  installFetchMock(() => jsonResponse({ error: "unexpected" }, { status: 404 }));

  await loginForm();
  await user.click(screen.getByRole("button", { name: "Sign in with passkey" }));

  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /does not support passkeys/i);
  assert.equal(screen.getByRole("button", { name: "Sign in with passkey" }).disabled, false);
});

test("login: passkey sign-in runs begin -> getCredential -> complete and redirects", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/passkey/login/begin") {
      return jsonResponse({
        options: {
          challenge: "login-challenge-b64",
          timeout: 60000,
          rpId: "osdb.test",
          userVerification: "preferred",
        },
      });
    }
    if (input === "/api/auth/passkey/login/complete") {
      return jsonResponse({ contributor: { id: 1 } });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  installWebAuthnGet(() => fakeAssertionCredential());
  await setNavState({ pushed: [] });

  await loginForm();
  await user.click(screen.getByRole("button", { name: "Sign in with passkey" }));

  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/auth/passkey/login/begin")));
  const beginRequest = requests.find((r) => r.input === "/api/auth/passkey/login/begin");
  assert.equal(beginRequest.init.method, "POST");
  // No email -> discoverable flow (empty allowCredentials server-side).
  assert.deepEqual(JSON.parse(beginRequest.init.body), {});

  const completeRequest = await waitFor(() => {
    const found = requests.find((r) => r.input === "/api/auth/passkey/login/complete");
    assert.ok(found, "complete must be called");
    return found;
  });
  const body = JSON.parse(completeRequest.init.body);
  assert.equal(body.challenge, "login-challenge-b64");
  assert.equal(body.response.id, "assertion-id-b64");
  const client = await loadDomModule("app/lib/webauthn-client.mjs");
  assert.equal(body.response.rawId, client.bytesToBase64Url(new Uint8Array([9, 8, 7])));
  assert.equal(body.response.response.signature, client.bytesToBase64Url(new Uint8Array([5, 6])));
  assert.equal(body.response.response.userHandle, client.bytesToBase64Url(new Uint8Array([7, 8])));
  assert.equal(body.response.response.authenticatorData, client.bytesToBase64Url(new Uint8Array([3, 4])));

  const nav = await getNavState();
  await waitFor(() => assert.deepEqual(window.__locationAssigns, ["/account"]));
});

test("login: an optional passkey email narrows the begin payload", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/passkey/login/begin") {
      return jsonResponse({ options: { challenge: "login-challenge-b64" } });
    }
    if (input === "/api/auth/passkey/login/complete") {
      return jsonResponse({ contributor: { id: 1 } });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  installWebAuthnGet(() => fakeAssertionCredential());
  await setNavState({ pushed: [] });

  await loginForm();
  await user.type(screen.getByLabelText(/Account email \(optional\)/), "contributor@example.test");
  await user.click(screen.getByRole("button", { name: "Sign in with passkey" }));

  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/auth/passkey/login/begin")));
  const beginRequest = requests.find((r) => r.input === "/api/auth/passkey/login/begin");
  assert.deepEqual(JSON.parse(beginRequest.init.body), { email: "contributor@example.test" });
});

test("login: ?merge= shows the merge form and POSTs token + email + password", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/oidc/merge") return jsonResponse({ contributor: { id: 1 } });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/login?merge=merge-token-123", pushed: [] });

  await loginForm();
  // Merge mode replaces the method blocks entirely.
  assert.ok(screen.getByRole("heading", { name: "Link your social account" }));
  assert.equal(screen.queryByRole("heading", { name: "Passkey" }), null);

  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Link accounts" }));

  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/auth/oidc/merge")));
  const mergeRequest = requests.find((r) => r.input === "/api/auth/oidc/merge");
  assert.deepEqual(JSON.parse(mergeRequest.init.body), {
    token: "merge-token-123",
    email: "contributor@example.test",
    password: "correct-horse-battery",
  });

  const nav = await getNavState();
  await waitFor(() => assert.deepEqual(window.__locationAssigns, ["/account"]));
});

test("login: a 410 from the merge route drops merge mode and announces the expired link", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input) => {
    if (input === "/api/auth/oidc/merge") return jsonResponse({ error: "expired" }, { status: 410 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/login?merge=stale-token" });

  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Link accounts" }));

  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /no longer valid/i);
  // The normal single-tile login (primary password form + alternatives) is back.
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Email + password" })));
  assert.ok(screen.getByRole("button", { name: "Log in" }));
  // The stale ?merge= token is stripped from the address bar via
  // router.replace (no scroll jump) so it is not re-submittable/shared.
  const nav = await getNavState();
  assert.deepEqual(nav.replaced, ["/login"]);
  assert.equal(nav.url.pathname, "/login");
  assert.equal(nav.url.search, "");
});

test("login: ?oidc_error=1 announces the provider failure", async () => {
  const { screen } = rtl;
  installFetchMock(() => jsonResponse({ error: "unexpected" }, { status: 404 }));
  await setNavState({ url: "/login?oidc_error=1" });

  await loginForm();
  assert.match(screen.getByRole("alert").textContent ?? "", /Social sign-in failed or was cancelled/i);
});

// ---------------------------------------------------------------------------
// P1-3 + P1-4 (design review): forgot-password entry + per-method risk matrix
// ---------------------------------------------------------------------------

test("login: the password panel links 'Forgot password?' to /forgot-password", async () => {
  const { screen } = rtl;
  await loginForm();
  const forgot = screen.getByRole("link", { name: "Forgot password?" });
  assert.equal(forgot.getAttribute("href"), "/forgot-password");
});

test("login: every method declares its own risk disclosure (P1-4 risk matrix)", async () => {
  const { screen, waitFor } = rtl;
  await loginFormWithSocial();

  // All three disclosures are visible at once (no selector to switch).
  const disclosures = screen.getAllByText((_, element) => element?.classList?.contains("auth-method-disclosure") ?? false);
  assert.equal(disclosures.length, 2, "password + passkey disclosures both render");
  const passkeyDisclosure = disclosures.find((d) => /synced/i.test(d.textContent ?? ""));
  // The old hint claimed "Nothing leaves your device" — false for synced
  // passkeys; the disclosure must name the sync vendor surface honestly.
  assert.ok(passkeyDisclosure, "the passkey disclosure must name the sync vendor surface");
  assert.match(passkeyDisclosure.textContent ?? "", /vendor/i);
  assert.doesNotMatch(passkeyDisclosure.textContent ?? "", /Nothing leaves your device/i);

  // OIDC keeps its own (pre-existing) disclosure; the risk matrix now has
  // all three methods covered.
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Continue with Google" })));
  assert.ok(screen.getAllByText((_, element) => element?.classList?.contains("oidc-disclosure") ?? false).length >= 3);
});

test("login: ?returnTo= redirects back to the tool after a successful password login", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input) => {
    if (String(input) === "/api/auth/login") return jsonResponse({ contributor: { id: 1 } });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/login?returnTo=%2Fsegnala", pushed: [] });

  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  const nav = await getNavState();
  await waitFor(() => assert.deepEqual(window.__locationAssigns, ["/segnala"]));
});

test("login: ?returnTo= is ignored for off-site targets (same-site only)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input) => {
    if (String(input) === "/api/auth/login") return jsonResponse({ contributor: { id: 1 } });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/login?returnTo=https%3A%2F%2Fevil.example%2Fsteal", pushed: [] });

  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  const nav = await getNavState();
  await waitFor(() => assert.deepEqual(window.__locationAssigns, ["/account"]), "off-site returnTo must fall back to /account");
});
