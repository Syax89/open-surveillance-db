/**
 * Client-side interaction tests for the auth forms (login/register) —
 * QA t_61b90f6a.
 *
 * Covers, in jsdom with @testing-library/react + user-event:
 *   1. a valid login submit POSTs to /api/auth/login with the right body and
 *      redirects to /account on success;
 *   2. server errors (401/429/403) surface the correct localized message in
 *      a role=alert element;
 *   3. the email/password fields are required (and password enforces
 *      minLength 10), and the submit button disables + shows a loading label
 *      while the request is pending;
 *   4. a valid register submit POSTs to /api/auth/register (displayName
 *      omitted when blank), and a 409 shows the "email taken" error.
 *
 * Fixtures are fictitious (example.test addresses, made-up credentials).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, getNavState, setNavState,
  renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let LoginPage;
let RegisterPage;

before(async () => {
  rtl = await setupDom();
  // QA#6 F2/F5 (t_9467ee7f): /login and /register are thin server shells;
  // the interactive body is the named-export client component.
  LoginPage = (await loadDomModule("app/login/LoginPageBody.mjs")).LoginPageBody;
  RegisterPage = (await loadDomModule("app/register/RegisterPageBody.mjs")).RegisterPageBody;
});

// Unmount between tests so queries never see stale markup (RTL auto-cleanup
// hooks into a global afterEach that node:test does not provide).
afterEach(() => rtl?.cleanup());

function makeUser() {
  return rtl.userEvent.setup();
}

function loginForm(extra = {}) {
  return renderWithLocale(React.createElement(LoginPage, extra));
}

function registerForm(extra = {}) {
  return renderWithLocale(React.createElement(RegisterPage, extra));
}

test("login: valid submit POSTs to /api/auth/login and redirects to /account", async () => {
  const { screen, waitFor } = rtl;
  const user = makeUser();
  let capturedRequest = null;
  installFetchMock((input, init) => {
    capturedRequest = { input, init };
    return jsonResponse({}, { status: 200 });
  });
  await setNavState({ pushed: [] });

  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() => assert.ok(capturedRequest, "fetch chiamato"));
  assert.equal(capturedRequest.input, "/api/auth/login");
  assert.equal(capturedRequest.init.method, "POST");
  const body = JSON.parse(capturedRequest.init.body);
  assert.deepEqual(body, { email: "contributor@example.test", password: "Correct-Horse-Battery1" });

  const nav = await getNavState();
  await waitFor(() => assert.deepEqual(nav.pushed, ["/account"]));
});

test("login: 401 surfaces the invalid-credentials error in role=alert", async () => {
  const { screen, waitFor } = rtl;
  const user = makeUser();
  installFetchMock(() => jsonResponse({ error: "invalid credentials" }, { status: 401 }));

  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "wrong-password-123");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  const alert = await screen.findByRole("alert");
  assert.equal(alert.textContent, "Invalid credentials.");
  await waitFor(() => assert.equal(screen.getByRole("button", { name: "Log in" }).disabled, false));
});

test("login: 429 and 403 map to their localized messages", async () => {
  const { screen } = rtl;
  const user = makeUser();

  installFetchMock(() => jsonResponse({ error: "rate limited" }, { status: 429 }));
  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  assert.equal((await screen.findByRole("alert")).textContent, "Something went wrong. Please try again.");
  rtl.cleanup();

  installFetchMock(() => jsonResponse({ error: "cross origin" }, { status: 403 }));
  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  assert.equal((await screen.findByRole("alert")).textContent, "Cross-site request rejected.");
});

test("login: network failure falls back to the generic error", async () => {
  const { screen } = rtl;
  const user = makeUser();
  installFetchMock(() => Promise.reject(new TypeError("Failed to fetch")));

  await loginForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  assert.equal((await screen.findByRole("alert")).textContent, "Something went wrong. Please try again.");
});

test("login: fields are required, password enforces minLength 10", async () => {
  const { screen } = rtl;
  await loginForm();
  const email = screen.getByLabelText("Email");
  const password = screen.getByLabelText(/^Password/);
  assert.equal(email.getAttribute("type"), "email");
  assert.equal(email.hasAttribute("required"), true);
  assert.equal(email.getAttribute("autocomplete"), "email");
  assert.equal(password.getAttribute("type"), "password");
  assert.equal(password.hasAttribute("required"), true);
  assert.equal(password.getAttribute("minlength"), "10");
  assert.equal(password.getAttribute("autocomplete"), "current-password");
});

test("login: submit button disables and shows loading while pending", async () => {
  const { screen, waitFor } = rtl;
  const user = makeUser();
  let resolveFetch;
  installFetchMock(() => new Promise((resolve) => { resolveFetch = resolve; }));

  await loginForm();
  const button = screen.getByRole("button", { name: "Log in" });
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(button);

  await waitFor(() => assert.equal(button.disabled, true));
  assert.equal(button.textContent, "Loading…");

  resolveFetch(jsonResponse({}, { status: 200 }));
  await waitFor(() => assert.equal(button.disabled, false));
  assert.equal(button.textContent, "Log in");
});

test("register: valid submit POSTs to /api/auth/register and redirects", async () => {
  const { screen, waitFor } = rtl;
  const user = makeUser();
  let capturedRequest = null;
  installFetchMock((input, init) => {
    capturedRequest = { input, init };
    return jsonResponse({}, { status: 200 });
  });
  await setNavState({ pushed: [] });

  await registerForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText("Display name (optional)"), "Fixture Contributor");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => assert.ok(capturedRequest));
  assert.equal(capturedRequest.input, "/api/auth/register");
  assert.equal(capturedRequest.init.method, "POST");
  const body = JSON.parse(capturedRequest.init.body);
  assert.deepEqual(body, {
    email: "contributor@example.test",
    password: "Correct-Horse-Battery1",
    displayName: "Fixture Contributor",
  });

  const nav = await getNavState();
  await waitFor(() => assert.deepEqual(nav.pushed, ["/account"]));
});

test("register: blank displayName is omitted from the payload", async () => {
  const { screen, waitFor } = rtl;
  const user = makeUser();
  let capturedRequest = null;
  installFetchMock((input, init) => {
    capturedRequest = { input, init };
    return jsonResponse({}, { status: 200 });
  });

  await registerForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => assert.ok(capturedRequest));
  const body = JSON.parse(capturedRequest.init.body);
  assert.equal("displayName" in body, false);
});

test("register: 409 shows the email-taken error", async () => {
  const { screen } = rtl;
  const user = makeUser();
  installFetchMock(() => jsonResponse({ error: "email taken" }, { status: 409 }));

  await registerForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.type(screen.getByLabelText(/^Password/), "Correct-Horse-Battery1");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  assert.equal((await screen.findByRole("alert")).textContent, "An account with this email already exists.");
});

test("register: password field carries minLength 10 and new-password autocomplete", async () => {
  const { screen } = rtl;
  await registerForm();
  const password = screen.getByLabelText(/^Password/);
  assert.equal(password.hasAttribute("required"), true);
  assert.equal(password.getAttribute("minlength"), "10");
  assert.equal(password.getAttribute("autocomplete"), "new-password");
});

test("register: the password requirements list is visible and linked to the field", async () => {
  const { screen } = rtl;
  await registerForm();
  const requirements = screen.getByText("Your password must include:");
  assert.equal(requirements.closest(".password-requirements").id, "password-requirements");
  const password = screen.getByLabelText(/^Password/);
  assert.equal(password.getAttribute("aria-describedby"), "password-requirements");
  // Every policy rule is spelled out (CEO feedback 2026-08-03).
  for (const rule of [
    "At least 10 characters",
    "An uppercase letter (A–Z)",
    "A lowercase letter (a–z)",
    "A number (0–9)",
    "A special character (e.g. ! @ # $ %)",
  ]) {
    assert.ok(screen.getByText(rule), rule);
  }
});

test("register: a password missing one class is refused client-side without a POST", async () => {
  const { screen } = rtl;
  const user = makeUser();
  let fetchCalled = false;
  // PublicNav (t_96f0d374) mounts AuthNavLinks, whose session check issues a
  // GET /api/auth/me on mount. The assertion below is about the FORM not
  // POSTing — count only POSTs, not the nav's session GET.
  installFetchMock((input, init) => {
    if (init?.method === "POST") fetchCalled = true;
    return jsonResponse({}, { status: 200 });
  });

  await registerForm();
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  // 11 chars, lowercase + digit + special — no uppercase.
  await user.type(screen.getByLabelText(/^Password/), "lowercase1!");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  assert.equal(fetchCalled, false, "no POST while the password violates the policy");
  const password = screen.getByLabelText(/^Password/);
  assert.equal(password.getAttribute("aria-invalid"), "true");
});
