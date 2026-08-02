// Runtime API tests for the external OIDC login route family (Fase D,
// t_87f24b2d, ADR 0020 decision 4):
//   - GET  /api/auth/oidc/[provider]/start    begin PKCE redirect
//   - GET  /api/auth/oidc/[provider]/callback provider handshake + linking
//   - POST /api/auth/oidc/merge               manual email-conflict merge
//
// db/oidc and db/auth are mocked (tests/helpers/mocks/oidc.mjs,
// auth.mjs); pure helpers — app/lib/oidc.ts, auth-session, csrf,
// rate-limit — run for real. The provider token/userinfo calls go through
// globalThis.fetch, stubbed per test with canned responses. The real SQL
// boundary (single-use state rows, placeholder email, atomic merge) is
// covered separately by tests/oidc-d1.test.mjs.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

let rateLimit;
let env;

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadTreeModule("app/lib/rate-limit.mjs");
  rateLimit.resetRateLimitState();
  if (!env) env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  // OIDC is opt-in: every test starts without provider credentials and
  // enables exactly the provider it exercises.
  for (const key of Object.keys(env)) {
    if (key.startsWith("OIDC_")) delete env[key];
  }
});

afterEach(() => {
  if (globalThis.__oidcFetchRestore) {
    globalThis.__oidcFetchRestore();
    globalThis.__oidcFetchRestore = undefined;
  }
});

after(async () => cleanupRouteTree());

const startRoute = () => loadRoute("app/api/auth/oidc/[provider]/start/route.mjs");
const callbackRoute = () => loadRoute("app/api/auth/oidc/[provider]/callback/route.mjs");
const mergeRoute = () => loadRoute("app/api/auth/oidc/merge/route.mjs");

// ---------------------------------------------------------------------------
// Provider HTTP stub
// ---------------------------------------------------------------------------

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Stub globalThis.fetch with canned OIDC provider responses. `routes` maps a
 * URL substring to a Response factory; the GitHub /user/emails probe and the
 * Google discovery document are provided by default. Returns the list of
 * URLs fetched so tests can assert what the lib actually called.
 */
function stubProviderFetch(routes = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    calls.push(href);
    for (const [needle, factory] of Object.entries(routes)) {
      if (href.includes(needle)) return factory(init);
    }
    throw new Error(`unexpected provider fetch: ${href}`);
  };
  globalThis.__oidcFetchRestore = () => {
    globalThis.fetch = original;
  };
  return calls;
}

const GITHUB_USER = {
  id: 98765,
  email: "github-user@example.org",
  name: "GitHub User",
  login: "github-user",
};

const GITHUB_EMAILS = [{ email: "github-user@example.org", verified: true }];

const GOOGLE_DISCOVERY = {
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
};

const GOOGLE_USER = {
  sub: "google-sub-12345",
  email: "google-user@example.org",
  email_verified: true,
  name: "Google User",
};

const githubRoutes = (user = GITHUB_USER, emails = GITHUB_EMAILS) => ({
  "https://github.com/login/oauth/access_token": () => jsonResponse(200, { access_token: "at-github" }),
  "https://api.github.com/user/emails": () => jsonResponse(200, emails),
  "https://api.github.com/user": () => jsonResponse(200, user),
});

const googleRoutes = (user = GOOGLE_USER) => ({
  "https://accounts.google.com/.well-known/openid-configuration": () => jsonResponse(200, GOOGLE_DISCOVERY),
  "https://oauth2.googleapis.com/token": () => jsonResponse(200, { access_token: "at-google" }),
  "https://openidconnect.googleapis.com/v1/userinfo": () => jsonResponse(200, user),
});

const contributor = {
  id: 7,
  email: "oidc.github.98765@invalid",
  displayName: "GitHub User",
  authProvider: "github",
  externalSub: "98765",
  emailVerifiedAt: "2026-08-02T08:00:00.000Z",
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T08:00:00.000Z",
};

const session = {
  id: 1,
  contributorId: 7,
  tokenHash: "hash-of-raw-token",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T08:00:00.000Z",
  expiresAt: "2026-08-31T08:00:00.000Z",
  revokedAt: null,
};

const newSession = { rawToken: "raw-session-token-abc123", csrfToken: "csrf-token-123", session };

function findCookie(response, name) {
  const cookie = response.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`));
  return cookie ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/auth/oidc/[provider]/start
// ---------------------------------------------------------------------------

test("start: unknown provider answers 404", async () => {
  const { GET } = await startRoute();
  const response = await GET(apiRequest("/api/auth/oidc/gitlab/start"));
  assert.equal(response.status, 404);
  assert.deepEqual(await responseBody(response), { error: "Unknown OIDC provider." });
});

test("start: fails closed with 503 when the provider is not activated", async () => {
  const { GET } = await startRoute();
  const response = await GET(apiRequest("/api/auth/oidc/github/start"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await responseBody(response), {
    error: "This sign-in method is not available yet.",
  });
});

test("start: redirects to GitHub with PKCE params and persists a state row", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("createOidcState", async () => ({ rawState: "raw-state-abc", codeVerifier: "verifier-xyz" }));
  const { GET } = await startRoute();
  const response = await GET(apiRequest("/api/auth/oidc/github/start"));

  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location.startsWith("https://github.com/login/oauth/authorize?"), location);
  const params = new URLSearchParams(location.split("?")[1]);
  assert.equal(params.get("client_id"), "gh-client");
  assert.equal(params.get("redirect_uri"), "https://osdb.test/api/auth/oidc/github/callback");
  assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("scope"), "read:user user:email");
  assert.equal(params.get("state"), "raw-state-abc");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.ok(params.get("code_challenge"), "code_challenge must be present");

  const [stateArgs] = callArgs("createOidcState");
  assert.deepEqual(stateArgs, [{ provider: "github", redirectTo: "/account" }]);
});

test("start: google flow reads the discovery document at /start time", async () => {
  env.OIDC_GOOGLE_CLIENT_ID = "g-client";
  env.OIDC_GOOGLE_CLIENT_SECRET = "g-secret";
  stub("createOidcState", async () => ({ rawState: "raw-state-abc", codeVerifier: "verifier-xyz" }));
  const calls = stubProviderFetch({ ...googleRoutes() });

  const { GET } = await startRoute();
  const response = await GET(apiRequest("/api/auth/oidc/google/start"));

  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"), location);
  const params = new URLSearchParams(location.split("?")[1]);
  assert.equal(params.get("client_id"), "g-client");
  assert.equal(params.get("scope"), "openid email profile");
  assert.ok(calls.some((href) => href.includes(".well-known/openid-configuration")));
});

test("start: redirect_to is sanitised to a relative same-origin path", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("createOidcState", async () => ({ rawState: "raw-state-abc", codeVerifier: "verifier-xyz" }));
  const { GET } = await startRoute();

  await GET(apiRequest("/api/auth/oidc/github/start?redirect_to=//evil.example"));
  assert.deepEqual(callArgs("createOidcState")[0], [{ provider: "github", redirectTo: "/account" }]);

  await GET(apiRequest("/api/auth/oidc/github/start?redirect_to=/report/42"));
  assert.deepEqual(callArgs("createOidcState")[1], [{ provider: "github", redirectTo: "/report/42" }]);
});

// ---------------------------------------------------------------------------
// GET /api/auth/oidc/[provider]/callback
// ---------------------------------------------------------------------------

test("callback: unknown provider answers 404", async () => {
  const { GET } = await callbackRoute();
  const response = await GET(apiRequest("/api/auth/oidc/gitlab/callback?code=c&state=s"));
  assert.equal(response.status, 404);
});

test("callback: provider not activated answers 503 before touching the state row", async () => {
  const { GET } = await callbackRoute();
  const response = await GET(apiRequest("/api/auth/oidc/github/callback?code=c&state=s"));
  assert.equal(response.status, 503);
  assert.equal(callArgs("consumeOidcState").length, 0);
});

test("callback: provider-side denial redirects back to /login", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  const { GET } = await callbackRoute();
  const response = await GET(apiRequest("/api/auth/oidc/github/callback?error=access_denied"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://osdb.test/login");
  assert.equal(callArgs("consumeOidcState").length, 0);
});

test("callback: missing code or state answers 400", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  const { GET } = await callbackRoute();
  const response = await GET(apiRequest("/api/auth/oidc/github/callback"));
  assert.equal(response.status, 400);
  assert.deepEqual(await responseBody(response), { error: "Missing OIDC authorization code." });
});

test("callback: unknown/expired/replayed state answers 400 (single-use enforced in db layer)", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("consumeOidcState", async () => null);
  const { GET } = await callbackRoute();
  const response = await GET(apiRequest("/api/auth/oidc/github/callback?code=c&state=stale-state"));
  assert.equal(response.status, 400);
  assert.deepEqual(await responseBody(response), { error: "Invalid or expired OIDC state." });
});

test("callback: returning external user is linked and gets a session", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("consumeOidcState", async () => ({ codeVerifier: "verifier-xyz", redirectTo: "/account" }));
  stub("findContributorByExternalIdentity", async () => contributor);
  stub("createSession", async () => newSession);
  const calls = stubProviderFetch({ ...githubRoutes() });

  const { GET } = await callbackRoute();
  const response = await GET(
    apiRequest("/api/auth/oidc/github/callback?code=the-code&state=raw-state"),
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://osdb.test/account");
  assert.ok(findCookie(response, "osdb_session"));
  assert.ok(findCookie(response, "osdb_csrf"));
  // Fast path: no new account, no merge request.
  assert.equal(callArgs("createOidcContributor").length, 0);
  assert.equal(callArgs("createOidcMergeRequest").length, 0);
  // The token exchange really ran against the stubbed provider.
  assert.ok(calls.some((href) => href.includes("login/oauth/access_token")));
  assert.ok(calls.some((href) => href.includes("api.github.com/user")));
});

test("callback: google returning user works through discovery + sub identity", async () => {
  env.OIDC_GOOGLE_CLIENT_ID = "g-client";
  env.OIDC_GOOGLE_CLIENT_SECRET = "g-secret";
  stub("consumeOidcState", async () => ({ codeVerifier: "verifier-xyz", redirectTo: "/account" }));
  stub("findContributorByExternalIdentity", async () => ({ ...contributor, id: 8, authProvider: "google", externalSub: "google-sub-12345" }));
  stub("createSession", async () => newSession);
  stubProviderFetch({ ...googleRoutes() });

  const { GET } = await callbackRoute();
  const response = await GET(
    apiRequest("/api/auth/oidc/google/callback?code=the-code&state=raw-state"),
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://osdb.test/account");
  // The lookup used the provider subject, not an email.
  assert.deepEqual(callArgs("findContributorByExternalIdentity")[0], ["google", "google-sub-12345"]);
});

test("callback: verified email conflict issues a merge token and never auto-links", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("consumeOidcState", async () => ({ codeVerifier: "verifier-xyz", redirectTo: "/account" }));
  stub("findContributorByExternalIdentity", async () => null);
  stub("findContributorByEmail", async () => ({ id: 42, email: "github-user@example.org" }));
  stub("createOidcMergeRequest", async () => ({ rawToken: "merge-token-abc" }));
  stubProviderFetch({ ...githubRoutes() });

  const { GET } = await callbackRoute();
  const response = await GET(
    apiRequest("/api/auth/oidc/github/callback?code=the-code&state=raw-state"),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://osdb.test/login?merge=merge-token-abc",
  );
  // The merge request pins the existing account; the provider email is
  // compared in memory but never passed to the db layer.
  assert.deepEqual(callArgs("createOidcMergeRequest")[0], [
    { provider: "github", externalSub: "98765", contributorId: 42, emailVerified: true },
  ]);
  assert.equal(callArgs("createOidcContributor").length, 0);
  assert.equal(callArgs("createSession").length, 0);
});

test("callback: unverified email conflict does NOT trigger a merge (no match attempted)", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("consumeOidcState", async () => ({ codeVerifier: "verifier-xyz", redirectTo: "/account" }));
  stub("findContributorByExternalIdentity", async () => null);
  stub("createOidcContributor", async () => contributor);
  stub("createSession", async () => newSession);
  stubProviderFetch({ ...githubRoutes(GITHUB_USER, [{ email: "github-user@example.org", verified: false }]) });

  const { GET } = await callbackRoute();
  const response = await GET(
    apiRequest("/api/auth/oidc/github/callback?code=the-code&state=raw-state"),
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://osdb.test/account");
  assert.equal(callArgs("findContributorByEmail").length, 0);
  assert.equal(callArgs("createOidcMergeRequest").length, 0);
});

test("callback: private-email GitHub account falls back to /user/emails primary (N1)", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("consumeOidcState", async () => ({ codeVerifier: "verifier-xyz", redirectTo: "/account" }));
  stub("findContributorByExternalIdentity", async () => null);
  stub("findContributorByEmail", async () => ({ id: 42, email: "private-owner@example.org" }));
  stub("createOidcMergeRequest", async () => ({ rawToken: "merge-token-abc" }));
  // /user returns NO email (private address — the GitHub default); only
  // /user/emails (user:email scope) carries the verified primary address.
  const calls = stubProviderFetch({
    ...githubRoutes(
      { ...GITHUB_USER, email: null },
      [
        { email: "private-owner@example.org", verified: true, primary: true },
        { email: "noreply@github.com", verified: true, primary: false },
      ],
    ),
  });

  const { GET } = await callbackRoute();
  const response = await GET(
    apiRequest("/api/auth/oidc/github/callback?code=the-code&state=raw-state"),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://osdb.test/login?merge=merge-token-abc",
  );
  // The primary email from /user/emails is used for the conflict match even
  // though /user did not expose it, so private-email accounts can merge.
  assert.deepEqual(callArgs("findContributorByEmail")[0], ["private-owner@example.org"]);
  assert.deepEqual(callArgs("createOidcMergeRequest")[0], [
    { provider: "github", externalSub: "98765", contributorId: 42, emailVerified: true },
  ]);
  assert.ok(calls.some((href) => href.includes("api.github.com/user/emails")));
});

test("callback: new external account is created WITHOUT storing the provider email", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("consumeOidcState", async () => ({ codeVerifier: "verifier-xyz", redirectTo: "/report/3" }));
  stub("findContributorByExternalIdentity", async () => null);
  stub("findContributorByEmail", async () => null);
  stub("createOidcContributor", async () => contributor);
  stub("createSession", async () => newSession);
  stubProviderFetch({ ...githubRoutes() });

  const { GET } = await callbackRoute();
  const response = await GET(
    apiRequest("/api/auth/oidc/github/callback?code=the-code&state=raw-state"),
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://osdb.test/report/3");
  const [createArgs] = callArgs("createOidcContributor");
  // Fase D constraint: only sub + verified flag reach the db layer, never
  // the provider email address.
  assert.deepEqual(createArgs, [
    { provider: "github", externalSub: "98765", emailVerified: true, displayName: "GitHub User" },
  ]);
  assert.equal("email" in createArgs[0], false);
});

test("callback: provider exchange failure redirects to /login?oidc_error=1 (no details leaked)", async () => {
  env.OIDC_GITHUB_CLIENT_ID = "gh-client";
  env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret";
  stub("consumeOidcState", async () => ({ codeVerifier: "verifier-xyz", redirectTo: "/account" }));
  stubProviderFetch({
    "https://github.com/login/oauth/access_token": () =>
      jsonResponse(400, { error: "bad_verification_code" }),
  });

  const { GET } = await callbackRoute();
  const response = await GET(
    apiRequest("/api/auth/oidc/github/callback?code=bad-code&state=raw-state"),
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://osdb.test/login?oidc_error=1");
});

// ---------------------------------------------------------------------------
// POST /api/auth/oidc/merge
// ---------------------------------------------------------------------------

const mergeRequest = {
  id: 1,
  tokenHash: "hash-of-merge-token",
  provider: "github",
  externalSub: "98765",
  contributorId: 7,
  emailVerified: true,
  createdAt: "2026-08-02T08:00:00.000Z",
  expiresAt: "2026-08-02T08:15:00.000Z",
  usedAt: null,
};

function mergeBody(overrides = {}) {
  return {
    token: "merge-token-abc",
    email: "existing@example.org",
    password: "supersecret123",
    ...overrides,
  };
}

/** Unlocked-default lockout machinery (ADR 0016) for merge tests. */
function stubLockoutDefaults() {
  stub("loginLockoutKey", async (email) => `emailKey:${email}`);
  stub("getLoginLockout", async () => ({ locked: false, retryAfterSeconds: 0 }));
  stub("recordFailedLogin", async () => ({ locked: false, retryAfterSeconds: 0 }));
  stub("clearLoginAttempts", async () => {});
}

test("merge: missing or malformed token answers 400", async () => {
  const { POST } = await mergeRoute();
  for (const body of [
    {},
    { email: "existing@example.org", password: "supersecret123" },
    { token: "", email: "existing@example.org", password: "supersecret123" },
    { token: "x".repeat(201), email: "existing@example.org", password: "supersecret123" },
  ]) {
    const response = await POST(apiRequest("/api/auth/oidc/merge", { method: "POST", body }));
    assert.equal(response.status, 400);
    assert.deepEqual(await responseBody(response), { error: "Invalid merge request." });
  }
  assert.equal(callArgs("getOidcMergeRequest").length, 0);
});

test("merge: invalid email or password format answers 401 before any lookup", async () => {
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", {
      method: "POST",
      body: mergeBody({ email: "not-an-email", password: "supersecret123" }),
    }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await responseBody(response), { error: "Invalid credentials." });
  assert.equal(callArgs("getOidcMergeRequest").length, 0);
});

test("merge: unknown/expired/used token answers 410", async () => {
  stub("getOidcMergeRequest", async () => null);
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", { method: "POST", body: mergeBody() }),
  );
  assert.equal(response.status, 410);
  assert.deepEqual(await responseBody(response), {
    error: "This merge link is no longer valid.",
  });
  assert.equal(callArgs("authenticateContributor").length, 0);
});

test("merge: wrong password answers 401 and records the failed attempt", async () => {
  stubLockoutDefaults();
  stub("getOidcMergeRequest", async () => mergeRequest);
  stub("authenticateContributor", async () => null);
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", { method: "POST", body: mergeBody() }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await responseBody(response), { error: "Invalid credentials." });
  assert.equal(callArgs("recordFailedLogin").length, 1);
  assert.equal(callArgs("linkExternalIdentity").length, 0);
});

test("merge: valid pair for a DIFFERENT account answers the same 401 (no enumeration)", async () => {
  stubLockoutDefaults();
  stub("getOidcMergeRequest", async () => mergeRequest);
  stub("authenticateContributor", async () => ({
    id: 99,
    email: "someone-else@example.org",
    displayName: "Other",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }));
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", { method: "POST", body: mergeBody() }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await responseBody(response), { error: "Invalid credentials." });
  assert.equal(callArgs("linkExternalIdentity").length, 0);
});

test("merge: success links the identity, opens a session and clears the counter", async () => {
  stubLockoutDefaults();
  stub("getOidcMergeRequest", async () => mergeRequest);
  stub("authenticateContributor", async () => ({
    id: 7,
    email: "existing@example.org",
    displayName: "Existing",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }));
  stub("linkExternalIdentity", async () => contributor);
  stub("createSession", async () => newSession);
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", { method: "POST", body: mergeBody() }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)).contributor, contributor);
  assert.ok(findCookie(response, "osdb_session"));
  assert.ok(findCookie(response, "osdb_csrf"));
  // The merge consumed the single-use token with the request's pinned
  // provider + subject — an attacker cannot re-target the merge.
  assert.deepEqual(callArgs("linkExternalIdentity")[0], [
    "merge-token-abc",
    "github",
    "98765",
  ]);
  assert.equal(callArgs("clearLoginAttempts").length, 1);
});

test("merge: concurrent consumption race answers 410 (single-use)", async () => {
  stubLockoutDefaults();
  stub("getOidcMergeRequest", async () => mergeRequest);
  stub("authenticateContributor", async () => ({
    id: 7,
    email: "existing@example.org",
    displayName: "Existing",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }));
  stub("linkExternalIdentity", async () => null);
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", { method: "POST", body: mergeBody() }),
  );
  assert.equal(response.status, 410);
});

test("merge: locked account answers 429 before any credential work", async () => {
  stubLockoutDefaults();
  stub("getOidcMergeRequest", async () => mergeRequest);
  stub("getLoginLockout", async () => ({ locked: true, retryAfterSeconds: 900 }));
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", { method: "POST", body: mergeBody() }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "900");
  assert.equal(callArgs("authenticateContributor").length, 0);
});

test("merge: failed attempt that trips the lockout answers 429", async () => {
  stubLockoutDefaults();
  stub("getOidcMergeRequest", async () => mergeRequest);
  stub("authenticateContributor", async () => null);
  stub("recordFailedLogin", async () => ({ locked: true, retryAfterSeconds: 900 }));
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", { method: "POST", body: mergeBody() }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "900");
});

test("merge: cross-origin request is rejected with 403", async () => {
  const { POST } = await mergeRoute();
  const response = await POST(
    apiRequest("/api/auth/oidc/merge", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: mergeBody(),
    }),
  );
  assert.equal(response.status, 403);
});
