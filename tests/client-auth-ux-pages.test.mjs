/**
 * Client-side interaction tests for the P1-1/P1-3 auth UX pages (Vera design):
 *
 *   /verify-email  — consumes the single-use token from the emailed link
 *                    against GET /api/auth/verify-email and renders a real
 *                    outcome (verified / invalid / expired-with-resend /
 *                    error) instead of raw JSON;
 *   /forgot-password — requests a reset link; mirrors the anti-enumeration
 *                    contract (generic confirmation for every well-formed
 *                    email, 429 → generic error);
 *   /reset-password — consumes ?token= against POST
 *                    /api/auth/reset-password/confirm; renders
 *                    success / invalid / expired / error states.
 *
 * Fixtures are fictitious (example.test addresses, made-up tokens).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let VerifyEmailBody;
let ForgotPasswordBody;
let ResetPasswordBody;

before(async () => {
  rtl = await setupDom();
  // The page.tsx shells import getServerMessages (next/headers), which the
  // DOM harness stubs cannot resolve — the shells are covered by
  // pages-render.test.mjs; here we test the client BODY components directly
  // (named exports, like the tool bodies).
  VerifyEmailBody = (await loadDomModule("app/verify-email/VerifyEmailBody.mjs")).VerifyEmailBody;
  ForgotPasswordBody = (await loadDomModule("app/forgot-password/ForgotPasswordBody.mjs")).ForgotPasswordBody;
  ResetPasswordBody = (await loadDomModule("app/reset-password/ResetPasswordBody.mjs")).ResetPasswordBody;
});

afterEach(() => rtl?.cleanup());

// ---------------------------------------------------------------------------
// /verify-email
// ---------------------------------------------------------------------------

test("verify-email: a live token renders the verified outcome and links to /account", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input) => {
    requests.push(String(input));
    if (String(input).startsWith("/api/auth/verify-email?token=")) {
      return jsonResponse({ verified: true, contributor: { id: 1 } });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/verify-email?token=live-token-123" });

  await renderWithLocale(React.createElement(VerifyEmailBody));

  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Email verified" })));
  assert.match(screen.getByText(/can now log in and start contributing/).textContent, /start contributing/);
  const account = screen.getByRole("link", { name: "Go to your account" });
  assert.equal(account.getAttribute("href"), "/account");
  assert.ok(requests.some((url) => url.startsWith("/api/auth/verify-email?token=live-token-123")), "the API must be consumed");
});

test("verify-email: an expired/used token (410) offers a resend and explains the dead link", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.startsWith("/api/auth/verify-email?token=")) {
      return jsonResponse({ error: "used or expired" }, { status: 410 });
    }
    if (url === "/api/auth/verify-email/resend" && init?.method === "POST") {
      return jsonResponse({ sent: true });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/verify-email?token=dead-token-456" });

  await renderWithLocale(React.createElement(VerifyEmailBody));

  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "This link is no longer valid" })));
  await user.click(screen.getByRole("button", { name: "Resend verification email" }));
  await waitFor(() => assert.ok(requests.some((r) => r.url === "/api/auth/verify-email/resend" && r.method === "POST")));
  assert.ok(screen.getByText("Verification email sent."));
});

test("verify-email: a 401 on resend explains that login unlocks the resend", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/auth/verify-email?token=")) {
      return jsonResponse({ error: "used or expired" }, { status: 410 });
    }
    if (url === "/api/auth/verify-email/resend" && init?.method === "POST") {
      return jsonResponse({ error: "Not authenticated." }, { status: 401 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/verify-email?token=dead-token-789" });

  await renderWithLocale(React.createElement(VerifyEmailBody));

  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "This link is no longer valid" })));
  await user.click(screen.getByRole("button", { name: "Resend verification email" }));
  await waitFor(() => assert.ok(screen.getByText("Log in to request a new link.")));
});

test("verify-email: an invalid token (400) and a missing token render the invalid state", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input) => {
    if (String(input).startsWith("/api/auth/verify-email?token=")) {
      return jsonResponse({ error: "invalid" }, { status: 400 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/verify-email?token=malformed" });
  await renderWithLocale(React.createElement(VerifyEmailBody));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Invalid or expired link" })));

  rtl.cleanup();
  installFetchMock(() => jsonResponse({ error: "unexpected route" }, { status: 404 }));
  await setNavState({ url: "/verify-email" });
  await renderWithLocale(React.createElement(VerifyEmailBody));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Invalid or expired link" })));
});

// ---------------------------------------------------------------------------
// /forgot-password
// ---------------------------------------------------------------------------

test("forgot-password: a valid submit POSTs the email and shows the generic confirmation", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input: String(input), method: init?.method ?? "GET" });
    if (String(input) === "/api/auth/reset-password/request") return jsonResponse({ sent: true });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(ForgotPasswordBody));
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/auth/reset-password/request" && r.method === "POST")));
  assert.match(screen.getByRole("status").textContent, /If an account exists for this email/);
});

test("forgot-password: a 429 maps to the generic error, never a rate-limit hint", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input) => {
    if (String(input) === "/api/auth/reset-password/request") {
      return jsonResponse({ error: "too many" }, { status: 429 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(ForgotPasswordBody));
  await user.type(screen.getByLabelText("Email"), "contributor@example.test");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.equal(screen.queryByRole("status"), null, "no fake success on rate limit");
});

// ---------------------------------------------------------------------------
// /reset-password
// ---------------------------------------------------------------------------

test("reset-password: posts token + new password and renders the success state", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input: String(input), method: init?.method ?? "GET" });
    if (String(input) === "/api/auth/reset-password/confirm") return jsonResponse({ ok: true });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/reset-password?token=reset-token-abc" });

  await renderWithLocale(React.createElement(ResetPasswordBody));
  await user.type(screen.getByLabelText(/^New password/), "fresh-horse-battery");
  await user.type(screen.getByLabelText(/^Repeat the new password/), "fresh-horse-battery");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Password changed" })));
  const confirm = requests.find((r) => r.input === "/api/auth/reset-password/confirm");
  assert.ok(confirm, "the confirm endpoint must be called");
  const login = screen.getByRole("link", { name: "Log in" });
  assert.equal(login.getAttribute("href"), "/login");
});

test("reset-password: mismatched passwords are refused client-side", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock(() => jsonResponse({ error: "unexpected route" }, { status: 404 }));
  await setNavState({ url: "/reset-password?token=reset-token-abc" });

  await renderWithLocale(React.createElement(ResetPasswordBody));
  await user.type(screen.getByLabelText(/^New password/), "fresh-horse-battery");
  await user.type(screen.getByLabelText(/^Repeat the new password/), "different-password");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  assert.ok(screen.getByRole("alert"));
  assert.match(screen.getByRole("alert").textContent, /do not match/);
});

test("reset-password: a dead token (410) offers a new request link", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input) => {
    if (String(input) === "/api/auth/reset-password/confirm") {
      return jsonResponse({ error: "expired" }, { status: 410 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ url: "/reset-password?token=dead-reset-token" });

  await renderWithLocale(React.createElement(ResetPasswordBody));
  await user.type(screen.getByLabelText(/^New password/), "fresh-horse-battery");
  await user.type(screen.getByLabelText(/^Repeat the new password/), "fresh-horse-battery");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  await waitFor(() => assert.match(screen.getByText(/has already been used or has expired/).textContent, /already been used/));
  const requestNew = screen.getByRole("link", { name: "Request a new link" });
  assert.equal(requestNew.getAttribute("href"), "/forgot-password");
});
