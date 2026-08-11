// E2E — email verification + password reset (multi-method auth Fase B).
//
// Like auth-flow-e2e, this suite wires the REAL route handlers to the REAL
// db modules against a fresh in-memory D1 (schema replayed from the real
// Drizzle migrations), so the verification lifecycle is exercised at runtime:
//
//   1. register → 201 + read-only session: the contributor has
//      email_verified_at NULL (me shows it), a verification token row exists
//      (hash-only), and — with no EMAIL binding — the dev link is echoed;
//   2. GET /api/auth/verify-email consumes the token once: 200, the account
//      flips to verified (me reflects it), and reusing the link answers 410;
//   3. POST /api/auth/verify-email/resend mints a fresh token (the OLD link
//      is revoked → 410) and honours the 1-per-5-min budget atomically
//      (issue #440: a resend inside the window answers 429; concurrent
//      resends — exactly one wins and only it mints);
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

// Captured outbound messages: the canonical mailer (db/mailer.ts, ADR 0020)
// sends through the EMAIL binding, so the harness injects a capture mock and
// tests read the action link from the captured message — the raw token now
// exists ONLY in the mail channel (fail-closed, no devLink echo, P1-1).
let capturedMail = [];

function mailToken(fromIndex = -1) {
  const message = capturedMail.at(fromIndex);
  assert.ok(message, "an auth email must have been captured");
  const match = /token=([^"&<\s]+)/.exec(message.text ?? message.html);
  assert.ok(match, "captured mail carries the action link");
  return decodeURIComponent(match[1]);
}

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  // Canonical mailer wiring: a working EMAIL binding (capture mock) plus the
  // public link base, so sendAuthEmail renders → rate-limits → sends → logs.
  capturedMail = [];
  env.EMAIL = {
    send: async (message) => {
      capturedMail.push(message);
      return { messageId: `m${capturedMail.length}` };
    },
  };
  env.VERIFY_BASE_URL = "https://osdb.test";
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
    body: { email, displayName: "E2E Verifier", password: "Sup3rsecret!123" },
  }));
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  // The canonical mailer delivered through the EMAIL binding mock.
  assert.equal(body.verification.sent, true, "email delivered through the EMAIL binding");
  // Fail-closed: the raw token is never in the API response — it exists only
  // in the mail channel (P1-1: devLink echo removed).
  assert.ok(!("devLink" in body.verification), "no raw token in the API response");
  const rawToken = mailToken();
  assert.ok(rawToken, "captured mail carries the raw verification token");
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

test("login is blocked with the generic 401 until the email is verified, then works (CEO feedback 2026-08-03, option (a))", async () => {
  const email = `login-gate-e2e-${crypto.randomUUID()}@example.org`;
  const { rawToken, session } = await registerAndExtract(email);
  assert.equal((await responseBody(await meRoute.GET(withSession("/api/auth/me", session)))).contributor.emailVerifiedAt, null);

  // The CORRECT password BEFORE verification: no session — the same generic
  // 401 as an unknown email or a wrong password, so the response never
  // reveals the account exists (anti-enumeration, t_6dc1c96f).
  const blocked = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "Sup3rsecret!123" },
  }));
  assert.equal(blocked.status, 401);
  assert.deepEqual(await responseBody(blocked), { error: "Invalid credentials." });
  assert.equal(blocked.headers.getSetCookie().length, 0, "no session cookie is issued");

  // Verify through the emailed link, then the SAME password logs in.
  const verify = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`));
  assert.equal(verify.status, 200);

  const login = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "Sup3rsecret!123" },
  }));
  assert.equal(login.status, 200);
  const loginBody = await responseBody(login);
  assert.ok(loginBody.contributor.emailVerifiedAt, "after verification the account can log in");
  assert.ok(login.headers.getSetCookie().some((cookie) => cookie.startsWith("osdb_session=")), "a session cookie is issued");
});

test("resend revokes the old link (explicit 3-per-window override) and honours the budget", async () => {
  // Default policy (issue #440) is 1 email per 5 minutes; this test needs
  // three sequential sends to prove revocation, so it tunes the SAME
  // per-contributor window via the documented EMAIL_SEND_LIMIT_* overrides.
  // The override is restored in a finally: the shared env mock is a module
  // singleton, so a failing assertion must not leak 3/600 into the tests
  // that follow. Any PRE-EXISTING values are saved and restored exactly
  // (delete only if they were absent before) — never assume the shared env
  // began unset.
  const hadMax = "EMAIL_SEND_LIMIT_MAX" in env;
  const hadWindow = "EMAIL_SEND_LIMIT_WINDOW_SECONDS" in env;
  const prevMax = env.EMAIL_SEND_LIMIT_MAX;
  const prevWindow = env.EMAIL_SEND_LIMIT_WINDOW_SECONDS;
  env.EMAIL_SEND_LIMIT_MAX = "3";
  env.EMAIL_SEND_LIMIT_WINDOW_SECONDS = "600";
  try {
    const email = `resend-e2e-${crypto.randomUUID()}@example.org`;
    const { rawToken: firstToken, session } = await registerAndExtract(email); // send #1

    const resendOne = await resendRoute.POST(withSession("/api/auth/verify-email/resend", session, { method: "POST" }));
    assert.equal(resendOne.status, 200);
    assert.equal((await responseBody(resendOne)).sent, true);
    const secondToken = mailToken(); // send #2
    assert.ok(secondToken && secondToken !== firstToken, "resend mints a fresh token");

    const resendTwo = await resendRoute.POST(withSession("/api/auth/verify-email/resend", session, { method: "POST" }));
    assert.equal(resendTwo.status, 200); // send #3
    const thirdToken = mailToken();
    assert.ok(thirdToken && thirdToken !== secondToken, "resend mints a fresh token every time");

    // The 4th send is blocked: register + 2 resends already used the window.
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
  } finally {
    if (hadMax) env.EMAIL_SEND_LIMIT_MAX = prevMax;
    else delete env.EMAIL_SEND_LIMIT_MAX;
    if (hadWindow) env.EMAIL_SEND_LIMIT_WINDOW_SECONDS = prevWindow;
    else delete env.EMAIL_SEND_LIMIT_WINDOW_SECONDS;
  }
});

test("default policy (issue #440): a resend within 5 minutes of register answers 429 with Retry-After, and the register link still verifies", async () => {
  const email = `resend-default-${crypto.randomUUID()}@example.org`;
  const { rawToken, session } = await registerAndExtract(email); // send #1 consumes the single slot

  const blocked = await resendRoute.POST(withSession("/api/auth/verify-email/resend", session, { method: "POST" }));
  assert.equal(blocked.status, 429, "the 2nd send inside the 5-minute window is blocked");
  const retryAfter = Number(blocked.headers.get("retry-after"));
  assert.ok(retryAfter > 0 && retryAfter <= 300, `Retry-After within the 300s window, got ${retryAfter}`);

  // The blocked resend minted nothing, so the register link is untouched.
  const tokenRows = (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_verification_tokens").first()).n;
  assert.equal(tokenRows, 1, "the 429 must not mint a second token");
  const verify = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`));
  assert.equal(verify.status, 200, "the register link still verifies after the blocked resend");
});

test("CONCURRENCY (issue #440): 8 parallel resends — exactly one wins the window, mints a usable token, and the losers do not invalidate it", async () => {
  const email = `resend-race-${crypto.randomUUID()}@example.org`;
  // Register with the EMAIL binding failing: registration still succeeds
  // (verification.sent=false) and the send reservation is RELEASED, so the
  // window is EMPTY when the 8 resends race (fresh account, zero rows).
  // The binding swap is restored in a finally: the shared env mock is a
  // module singleton, so a failing assertion must not leave the broken
  // binding installed for the tests that follow.
  const workingBinding = env.EMAIL;
  env.EMAIL = {
    send: async () => {
      const error = new Error("binding down");
      error.code = "E_SENDER_NOT_VERIFIED";
      throw error;
    },
  };
  try {
    const reg = await registerRoute.POST(apiRequest("/api/auth/register", {
      method: "POST",
      body: { email, displayName: "QA Race", password: "Sup3rsecret!123" },
    }));
    assert.equal(reg.status, 201);
    assert.equal((await responseBody(reg)).verification.sent, false, "mail failure released the reservation");
    // Restore the working binding BEFORE the resends: the winner must be
    // able to deliver mail (mailToken() below reads the capture).
    env.EMAIL = workingBinding;
    const session = sessionCookie(reg);

    // 8 simultaneous resends against an EMPTY window: the ATOMIC reservation
    // (INSERT ... SELECT ... WHERE count < limit RETURNING id) admits exactly
    // ONE of them; the other 7 must answer 429 WITHOUT minting a token (which
    // would revoke the winner's link).
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        resendRoute.POST(withSession("/api/auth/verify-email/resend", session, { method: "POST" })),
      ),
    );
    const statuses = results.map((r) => r.status);
    const okCount = statuses.filter((s) => s === 200).length;
    const blockedCount = statuses.filter((s) => s === 429).length;
    assert.equal(okCount, 1, `exactly one resend wins the window (got ${okCount})`);
    assert.equal(blockedCount, 7, "the 7 losers answer 429");

    // Only the winning resend minted: the register token was revoked (used_at
    // set, row kept) and exactly ONE new token exists — the winner's. The
    // losers never got to mint, so they could not invalidate the delivered
    // link: had they minted, there would be 2+N token rows.
    const contributorRow = await env.DB.prepare("SELECT id FROM contributors WHERE email = ?").bind(email).first();
    const tokenRows = (
      await env.DB.prepare("SELECT COUNT(*) AS n FROM email_verification_tokens WHERE contributor_id = ?")
        .bind(contributorRow.id)
        .first()
    ).n;
    assert.equal(tokenRows, 2, "register token (revoked) + exactly ONE winner token — the 7 losers minted nothing");

    const winnerToken = mailToken(-1); // last captured message is the winner's
    assert.ok(winnerToken, "the winning resend delivered a mail");
    const verify = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(winnerToken)}`));
    assert.equal(verify.status, 200, "the winning link verifies — losers did not invalidate it");

    // Exactly one send-log row for the window (the winner's reservation).
    const logRows = (
      await env.DB.prepare("SELECT COUNT(*) AS n FROM email_send_log WHERE contributor_id = ?")
        .bind(contributorRow.id)
        .first()
    ).n;
    assert.equal(logRows, 1, "exactly one reservation/send row is retained");
  } finally {
    env.EMAIL = workingBinding;
  }
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
    body: { token: rawToken, password: "Rotated-Password-1" },
  }));
  assert.equal(confirm.status, 200);
  assert.equal((await responseBody(confirm)).ok, true);

  // Every pre-reset session is dead (revoked on reset).
  const meAfter = await meRoute.GET(withSession("/api/auth/me", session));
  assert.equal(meAfter.status, 401, "the pre-reset session cookie no longer resolves");

  // The NEW password logs in; the OLD one answers 401.
  const newLogin = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "Rotated-Password-1" },
  }));
  assert.equal(newLogin.status, 200);
  const newSessionBody = await responseBody(newLogin);
  assert.ok(newSessionBody.contributor.emailVerifiedAt, "reset proves mailbox control → email verified");

  const oldLogin = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "Sup3rsecret!123" },
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
    body: { token: rawToken, password: "Rotated-Password-1" },
  }));
  assert.equal(first.status, 200);

  const second = await resetConfirmRoute.POST(apiRequest("/api/auth/reset-password/confirm", {
    method: "POST",
    body: { token: rawToken, password: "Another-Password-2" },
  }));
  assert.equal(second.status, 410);

  // The password was rotated only once: the FIRST new password is live.
  const login = await loginRoute.POST(apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password: "Rotated-Password-1" },
  }));
  assert.equal(login.status, 200);
});
