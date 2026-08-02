// E2E — email verification + password reset (multi-method auth Fase B).
//
// Like auth-flow-e2e, this suite wires the REAL route handlers to the REAL
// db modules against a fresh in-memory D1 (schema replayed from the real
// Drizzle migrations), so the verification lifecycle is exercised at runtime:
//
//   1. register → 201 + read-only session: the contributor has
//      email_verified_at NULL (me shows it), a verification token row exists
//      (hash-only), and — with no SEND_EMAIL binding — the dev link is echoed;
//   2. GET /api/auth/verify-email consumes the token once: 200, the account
//      flips to verified (me reflects it), and reusing the link answers 410;
//   3. POST /api/auth/verify-email/resend mints a fresh token (the OLD link
//      is revoked → 410) and honours the 3/h budget (4th send → 429);
//   4. reset: the request endpoint never leaks the token (anti-enumeration),
//      the confirm endpoint rotates the password, revokes every live session
//      (the pre-reset cookie dies) and verifies the address; the NEW password
//      logs in, the OLD one answers 401.
//
// No personal data: all fixtures are fictional. No network: the mailer falls
// back to its dev path (no send_email binding in the harness env).
//
// The write gate itself (401/403 on POST /api/cameras etc.) is Fase E1's
// suite; here the gate's INPUT (email_verified_at) is proven to flip.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, responseBody } from "./helpers/api-harness.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
} from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { cleanupE2ETree, e2eEnv, loadE2EModule, loadE2ERoute } from "./helpers/e2e-harness.mjs";

let env;
let registerRoute;
let verifyEmailRoute;
let resendRoute;
let resetRequestRoute;
let resetConfirmRoute;
let meRoute;
let loginRoute;

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  // This suite hammers /api/auth endpoints (register, resend, reset, login);
  // raise the per-IP auth bucket and wipe the in-memory counters so one test
  // never trips the 10/min default or leaks into the next one.
  env.AUTH_RATE_LIMIT_MAX = "1000000";
  env.AUTH_RATE_LIMIT_WINDOW_SECONDS = "60";
  const rateLimit = await loadE2EModule("app/lib/rate-limit.mjs");
  rateLimit.resetRateLimitState();
  registerRoute = await loadE2ERoute("app/api/auth/register/route.mjs");
  verifyEmailRoute = await loadE2ERoute("app/api/auth/verify-email/route.mjs");
  resendRoute = await loadE2ERoute("app/api/auth/verify-email/resend/route.mjs");
  resetRequestRoute = await loadE2ERoute("app/api/auth/reset-password/request/route.mjs");
  resetConfirmRoute = await loadE2ERoute("app/api/auth/reset-password/confirm/route.mjs");
  meRoute = await loadE2ERoute("app/api/auth/me/route.mjs");
  loginRoute = await loadE2ERoute("app/api/auth/login/route.mjs");
});

after(async () => {
  await cleanupE2ETree();
  await cleanupDbRuntime();
});

function sessionCookie(response) {
  const cookie = response.headers.getSetCookie().find((entry) => entry.startsWith("osdb_session="));
  assert.ok(cookie, "register must issue a session cookie");
  return /osdb_session=([^;]+)/.exec(cookie)[1];
}

function withSession(pathAndQuery, rawToken, init = {}) {
  return apiRequest(pathAndQuery, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie: `osdb_session=${rawToken}; osdb_csrf=csrf-token-123` },
  });
}

async function registerAndExtract(email) {
  const response = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "E2E Verifier", password: "supersecret123" },
  }));
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.verification.sent, false, "dev fallback: no binding, not delivered");
  const rawToken = new URL(body.verification.devLink).searchParams.get("token");
  assert.ok(rawToken, "dev link carries the raw verification token");
  return { response, body, rawToken, session: sessionCookie(response) };
}

test("register→verify→me: a fresh account is read-only, then flips to verified", async () => {
  const email = `verify-e2e-${crypto.randomUUID()}@example.org`;
  const { body, rawToken, session } = await registerAndExtract(email);
  assert.equal(body.contributor.emailVerifiedAt, null, "fresh accounts start unverified");

  // Read-only state is visible through /me before verification.
  const before = await meRoute.GET(withSession("/api/auth/me", session));
  assert.equal(before.status, 200);
  assert.equal((await responseBody(before)).contributor.emailVerifiedAt, null);

  // The token row exists, hash-only (privacy: the raw token is not stored).
  const tokenRows = (await env.DB.prepare("SELECT token_hash, purpose FROM email_verification_tokens").all()).results;
  assert.equal(tokenRows.length, 1);
  const dbAuth = await loadE2EModule("db/auth.mjs");
  assert.equal(tokenRows[0].token_hash, await dbAuth.sha256Hex(rawToken));
  assert.equal(tokenRows[0].purpose, "verify");

  // Consume: 200 and the account flips.
  const verify = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`));
  assert.equal(verify.status, 200);
  assert.equal((await responseBody(verify)).verified, true);

  const after = await meRoute.GET(withSession("/api/auth/me", session));
  assert.equal(after.status, 200);
  assert.ok((await responseBody(after)).contributor.emailVerifiedAt, "the same session is now verified");

  // Single-use: the second presentation of the same link is Gone.
  const reuse = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`));
  assert.equal(reuse.status, 410);
});

test("resend revokes the old link and honours the 3/h budget", async () => {
  const email = `resend-e2e-${crypto.randomUUID()}@example.org`;
  const { rawToken: firstToken, session } = await registerAndExtract(email); // send #1

  const resendOne = await resendRoute.POST(withSession("/api/auth/verify-email/resend", session, { method: "POST" }));
  assert.equal(resendOne.status, 200);
  const secondToken = new URL((await responseBody(resendOne)).devLink).searchParams.get("token");
  assert.ok(secondToken && secondToken !== firstToken, "resend mints a fresh token");

  const resendTwo = await resendRoute.POST(withSession("/api/auth/verify-email/resend", session, { method: "POST" }));
  assert.equal(resendTwo.status, 200); // send #3
  const thirdToken = new URL((await responseBody(resendTwo)).devLink).searchParams.get("token");
  assert.ok(thirdToken && thirdToken !== secondToken, "resend mints a fresh token every time");

  // The 4th send is blocked: register + 2 resends already used the 3/h budget.
  const blocked = await resendRoute.POST(withSession("/api/auth/verify-email/resend", session, { method: "POST" }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);

  // Every older link is Gone — each re-send revokes ALL previous unused
  // tokens of the same purpose, so only the newest (third) link verifies.
  const stale = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(firstToken)}`));
  assert.equal(stale.status, 410, "a re-send revokes every older unused link");
  const staleTwo = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(secondToken)}`));
  assert.equal(staleTwo.status, 410, "the second link is revoked by the third send");
  const fresh = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(thirdToken)}`));
  assert.equal(fresh.status, 200, "only the newest link verifies");
});

test("resend without a session is 401", async () => {
  const response = await resendRoute.POST(apiRequest("/api/auth/verify-email/resend", { method: "POST" }));
  assert.equal(response.status, 401);
});

test("reset request never reveals whether the email exists, and never echoes the token", async () => {
  const email = `reset-e2e-${crypto.randomUUID()}@example.org`;
  await registerAndExtract(email);

  // Unknown address: 200 { sent: true } — identical to the known-address body.
  const unknown = await resetRequestRoute.POST(apiRequest("/api/auth/reset-password/request", {
    method: "POST",
    body: { email: "nobody@example.org" },
  }));
  assert.equal(unknown.status, 200);
  assert.deepEqual(await responseBody(unknown), { sent: true });

  const known = await resetRequestRoute.POST(apiRequest("/api/auth/reset-password/request", {
    method: "POST",
    body: { email },
  }));
  assert.equal(known.status, 200);
  const knownBody = await responseBody(known);
  assert.deepEqual(knownBody, { sent: true }, "response is indistinguishable from the unknown-email one");
  assert.equal(JSON.stringify(knownBody).includes("token"), false, "the raw token never leaves the mail channel");
});

test("reset confirm rotates the password, revokes every session, and verifies the address", async () => {
  const email = `reset-confirm-${crypto.randomUUID()}@example.org`;
  const { body, session } = await registerAndExtract(email);

  // The reset link is emailed by the request endpoint; the raw token only
  // exists in the mail. Mint it through the real db module (same instance
  // the routes use) so the confirm handler runs against real SQL.
  const dbAuth = await loadE2EModule("db/auth.mjs");
  const { rawToken } = await dbAuth.createVerificationToken(body.contributor.id, "reset");

  const confirm = await resetConfirmRoute.POST(apiRequest("/api/auth/reset-password/confirm", {
    method: "POST",
    body: { token: rawToken, password: "rotated-password-1" },
  }));
  assert.equal(confirm.status, 200);
  assert.equal((await responseBody(confirm)).ok, true);

  // Every pre-reset session is dead (revoked on reset).
  const meAfter = await meRoute.GET(withSession("/api/auth/me", session));
  assert.equal(meAfter.status, 401, "the pre-reset session cookie no longer resolves");

  // The NEW password logs in; the OLD one answers 401.
  const newLogin = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "rotated-password-1" },
  }));
  assert.equal(newLogin.status, 200);
  const newSessionBody = await responseBody(newLogin);
  assert.ok(newSessionBody.contributor.emailVerifiedAt, "reset proves mailbox control → email verified");

  const oldLogin = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "supersecret123" },
  }));
  assert.equal(oldLogin.status, 401);
});

test("reset confirm rejects a used reset token (410) and does not rotate anything", async () => {
  const email = `reset-reuse-${crypto.randomUUID()}@example.org`;
  const { body } = await registerAndExtract(email);
  const dbAuth = await loadE2EModule("db/auth.mjs");
  const { rawToken } = await dbAuth.createVerificationToken(body.contributor.id, "reset");

  const first = await resetConfirmRoute.POST(apiRequest("/api/auth/reset-password/confirm", {
    method: "POST",
    body: { token: rawToken, password: "rotated-password-1" },
  }));
  assert.equal(first.status, 200);

  const second = await resetConfirmRoute.POST(apiRequest("/api/auth/reset-password/confirm", {
    method: "POST",
    body: { token: rawToken, password: "another-password-2" },
  }));
  assert.equal(second.status, 410);

  // The password was rotated only once: the FIRST new password is live.
  const login = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "rotated-password-1" },
  }));
  assert.equal(login.status, 200);
});
