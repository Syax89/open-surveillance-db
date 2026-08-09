// Database-boundary tests for the transactional mailer (AUTH MULTI-METODO
// Fase A2, t_4c398006 — ADR 0020 decision 2).
//
// Two layers, both against REAL code:
//
//  1. Template layer (app/lib/email-templates.ts, pure): every render is
//     asserted to respect the zero-tracking contract — no <img> tags, no
//     remote assets, no links beyond the single action URL — and to ship
//     both HTML and plain text with the same copy (bilingual EN/IT, ADR
//     0007). Also: HTML escaping of user-controlled display names.
//
//  2. Mailer layer (db/mailer.ts, D1-backed): the 3 emails/hour per
//     contributor rate limit runs the REAL email_send_log SQL on the
//     in-memory D1 (migration 0029), so the window, the Retry-After
//     computation and the log rows are exercised at runtime. The EMAIL
//     binding is injected via the harness env mock; sendAuthEmail is
//     asserted end-to-end (render → provider call → log row).
//
// The recipient address is fictional in every fixture; no real personal
// data is used.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

let runtime;

beforeEach(async () => {
  if (!runtime) runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  // Default mailer env: a working EMAIL binding + a VERIFY_BASE_URL.
  // Tests override these per case.
  runtime.env.EMAIL = {
    send: async () => ({ messageId: "test-message-id" }),
  };
  runtime.env.VERIFY_BASE_URL = "https://opensurveillancedb.org";
  runtime.env.MAILER_FROM = "noreply@opensurveillancedb.org";
});

after(async () => cleanupDbRuntime());

const NOW = "2026-08-02T12:00:00.000Z";

// ---------------------------------------------------------------------------
// Template layer — zero-tracking contract
// ---------------------------------------------------------------------------

const SITE = { siteName: "OpenSurveillanceDB", siteUrl: "https://opensurveillancedb.org" };

function allHrefs(html) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

test("verification template ships HTML + plain with identical copy and subject", () => {
  const { emailTemplates } = runtime;
  const rendered = emailTemplates.renderVerificationEmail({
    actionUrl: "https://opensurveillancedb.org/api/auth/verify-email?token=abc123",
    ...SITE,
  });
  assert.match(rendered.subject, /^Verify your email/);
  assert.ok(rendered.html.length > 0, "HTML body present");
  assert.ok(rendered.text.length > 0, "plain body present");
  // The plain text carries the action URL so it works without an HTML client.
  assert.ok(rendered.text.includes("https://opensurveillancedb.org/api/auth/verify-email?token=abc123"));
  // Bilingual copy (ADR 0007): both languages are present in both bodies.
  assert.ok(rendered.html.includes("Verify email address"));
  assert.ok(rendered.html.includes("Verifica l'indirizzo email"));
  assert.ok(rendered.text.includes("Verify email address:"));
  assert.ok(rendered.text.includes("Verifica l'indirizzo email:"));
});

test("reset template ships HTML + plain with identical copy and subject", () => {
  const { emailTemplates } = runtime;
  const rendered = emailTemplates.renderPasswordResetEmail({
    actionUrl: "https://opensurveillancedb.org/api/auth/reset-password?token=abc123",
    ...SITE,
  });
  assert.match(rendered.subject, /^Reset your password/);
  assert.ok(rendered.html.length > 0);
  assert.ok(rendered.text.includes("https://opensurveillancedb.org/api/auth/reset-password?token=abc123"));
  assert.ok(rendered.html.includes("Reset password"));
  assert.ok(rendered.html.includes("Reimposta la password"));
});

test("ZERO TRACKING: no img tags, no remote assets, no links beyond the action URL", () => {
  const { emailTemplates } = runtime;
  const actionUrl = "https://opensurveillancedb.org/api/auth/verify-email?token=abc123";
  for (const rendered of [
    emailTemplates.renderVerificationEmail({ actionUrl, ...SITE }),
    emailTemplates.renderPasswordResetEmail({ actionUrl, ...SITE }),
  ]) {
    // No images at all: no tracking pixels, no remote images, no beacons.
    assert.ok(!rendered.html.includes("<img"), "no <img> tags");
    assert.ok(!rendered.html.includes("src="), "no src attributes");
    // Every link in the HTML points ONLY at the action URL (button + text
    // fallback share it) — no analytics, no social, no third-party calls.
    const hrefs = allHrefs(rendered.html);
    assert.ok(hrefs.length >= 1, "the action link is present");
    for (const href of hrefs) {
      assert.equal(href, actionUrl, `unexpected link in email: ${href}`);
    }
    // No remote stylesheets/fonts/scripts.
    assert.ok(!rendered.html.includes("<link"), "no <link> tags");
    assert.ok(!rendered.html.includes("@import"), "no CSS @import");
    assert.ok(!rendered.html.includes("<script"), "no scripts");
    assert.ok(!rendered.html.includes("url("), "no CSS url() references");
  }
});

test("displayName is HTML-escaped in the rendered body (no markup injection)", () => {
  const { emailTemplates } = runtime;
  const rendered = emailTemplates.renderVerificationEmail({
    actionUrl: "https://opensurveillancedb.org/api/auth/verify-email?token=abc123",
    displayName: '<script>alert("x")</script> & Co',
    ...SITE,
  });
  assert.ok(!rendered.html.includes("<script>"), "script tag must be escaped");
  assert.ok(rendered.html.includes("&lt;script&gt;"));
  // The plain body keeps the raw name (no HTML context there).
  assert.ok(rendered.text.includes("<script>alert(\"x\")</script> & Co"));
});

test("buildAuthActionUrl encodes the token and strips trailing slashes from the base", () => {
  const { emailTemplates } = runtime;
  // P1-1/P1-3 (design review): the links land on the /verify-email and
  // /reset-password UI pages — never on a raw JSON API route.
  assert.equal(
    emailTemplates.buildAuthActionUrl("verify", "abc/def+", "https://opensurveillancedb.org/"),
    "https://opensurveillancedb.org/verify-email?token=abc%2Fdef%2B",
  );
  assert.equal(
    emailTemplates.buildAuthActionUrl("reset", "xyz", "https://osdb.example"),
    "https://osdb.example/reset-password?token=xyz",
  );
});

// ---------------------------------------------------------------------------
// Rate limit — 3 emails/hour per contributor (migration 0029, real SQL)
// ---------------------------------------------------------------------------

async function seedContributor(email = "contributor@example.com") {
  const { auth } = runtime;
  const created = await auth.createContributor({
    email,
    displayName: "Test Contributor",
    password: "correct horse battery staple",
  });
  return created.id;
}

test("rate limit: 3 sends are allowed, the 4th is blocked with Retry-After", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();

  for (let i = 0; i < 3; i += 1) {
    const decision = await mailer.canSendAuthEmail(contributorId, NOW, runtime.env);
    assert.deepEqual(decision, { allowed: true, retryAfterSeconds: 0 });
    await mailer.recordEmailSend(contributorId, "verify", NOW);
  }

  const blocked = await mailer.canSendAuthEmail(contributorId, NOW, runtime.env);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0, "Retry-After is positive");
  assert.equal(blocked.retryAfterSeconds, 3600, "full window until the oldest send expires");
});

test("rate limit: the window is rolling — sends older than 1h no longer count", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();

  await mailer.recordEmailSend(contributorId, "verify", "2026-08-02T10:59:59.000Z"); // 1h+1s before NOW
  await mailer.recordEmailSend(contributorId, "verify", "2026-08-02T11:30:00.000Z"); // inside window
  await mailer.recordEmailSend(contributorId, "verify", "2026-08-02T11:45:00.000Z"); // inside window

  // 2 inside the window → allowed (3rd send ok), then the 3rd inside-window
  // send exhausts the budget.
  const first = await mailer.canSendAuthEmail(contributorId, NOW, runtime.env);
  assert.deepEqual(first, { allowed: true, retryAfterSeconds: 0 });
  await mailer.recordEmailSend(contributorId, "verify", NOW);

  const blocked = await mailer.canSendAuthEmail(contributorId, NOW, runtime.env);
  assert.equal(blocked.allowed, false);
  // Oldest inside-window send is 11:30 → Retry-After = 30 minutes.
  assert.equal(blocked.retryAfterSeconds, 1800);
});

test("rate limit: env knobs override the 3/h default", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  const env = { ...runtime.env, EMAIL_SEND_LIMIT_MAX: "1", EMAIL_SEND_LIMIT_WINDOW_SECONDS: "600" };

  const first = await mailer.canSendAuthEmail(contributorId, NOW, env);
  assert.deepEqual(first, { allowed: true, retryAfterSeconds: 0 });
  await mailer.recordEmailSend(contributorId, "reset", NOW);

  const blocked = await mailer.canSendAuthEmail(contributorId, NOW, env);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 600);
});

test("rate limit: windows are per contributor, not global", async () => {
  const { mailer } = runtime;
  const first = await seedContributor("alice@example.com");
  const second = await seedContributor("bob@example.com");

  for (let i = 0; i < 3; i += 1) {
    await mailer.recordEmailSend(first, "verify", NOW);
  }
  // Alice is exhausted, Bob still has his full budget.
  const alice = await mailer.canSendAuthEmail(first, NOW, runtime.env);
  assert.equal(alice.allowed, false);
  const bob = await mailer.canSendAuthEmail(second, NOW, runtime.env);
  assert.deepEqual(bob, { allowed: true, retryAfterSeconds: 0 });
});

test("recordEmailSend writes a row with only contributor_id, kind, sent_at", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  await mailer.recordEmailSend(contributorId, "verify", NOW);
  const rows = await runtime.env.DB.prepare("SELECT * FROM email_send_log").all();
  assert.equal(rows.results.length, 1);
  const row = rows.results[0];
  // Privacy by design: NO recipient address, NO content, NO IP.
  assert.equal(row.contributor_id, contributorId);
  assert.equal(row.kind, "verify");
  assert.equal(row.sent_at, NOW);
  assert.deepEqual(Object.keys(row).sort(), ["contributor_id", "id", "kind", "sent_at"]);
});

// ---------------------------------------------------------------------------
// sendAuthEmail — end-to-end (render → rate limit → provider → log)
// ---------------------------------------------------------------------------

test("sendAuthEmail renders, sends through the EMAIL binding and logs the send", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  const sentMessages = [];
  runtime.env.EMAIL = {
    send: async (message) => {
      sentMessages.push(message);
      return { messageId: "m1" };
    },
  };

  const result = await mailer.sendAuthEmail({
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "raw-token-value",
    displayName: "Test Contributor",
    nowIso: NOW,
  });
  assert.deepEqual(result, { ok: true, messageId: "m1" });

  assert.equal(sentMessages.length, 1);
  const message = sentMessages[0];
  assert.equal(message.to, "contributor@example.com");
  assert.equal(message.from, "noreply@opensurveillancedb.org");
  assert.match(message.subject, /^Verify your email/);
  assert.ok(message.html.includes("Test Contributor"), "display name in the greeting");
  assert.ok(
    message.html.includes("https://opensurveillancedb.org/verify-email?token=raw-token-value"),
    "action link uses VERIFY_BASE_URL + encoded token, landing on the /verify-email UI page (P1-1)",
  );
  assert.ok(message.text.length > 0, "plain text sent too");

  // One log row for the send.
  const rows = await runtime.env.DB.prepare("SELECT * FROM email_send_log").all();
  assert.equal(rows.results.length, 1);
  assert.equal(rows.results[0].contributor_id, contributorId);
  assert.equal(rows.results[0].kind, "verify");
});

test("sendAuthEmail blocks before the provider call when the 3/h budget is spent", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  let providerCalls = 0;
  runtime.env.EMAIL = {
    send: async () => {
      providerCalls += 1;
      return { messageId: "m" };
    },
  };

  for (let i = 0; i < 3; i += 1) {
    const ok = await mailer.sendAuthEmail({
      contributorId,
      to: "contributor@example.com",
      kind: "verify",
      rawToken: `token-${i}`,
      nowIso: NOW,
    });
    assert.equal(ok.ok, true);
  }

  const blocked = await mailer.sendAuthEmail({
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "token-4",
    nowIso: NOW,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "rate_limited");
  assert.equal(blocked.retryAfterSeconds, 3600);
  assert.equal(providerCalls, 3, "the 4th send never reached the provider");
  // The blocked attempt consumed no budget: still exactly 3 log rows.
  const rows = await runtime.env.DB.prepare("SELECT COUNT(*) AS n FROM email_send_log").first();
  assert.equal(rows.n, 3);
});

test("sendAuthEmail fails closed (missing_config) without VERIFY_BASE_URL — no provider call", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  let providerCalls = 0;
  runtime.env.EMAIL = {
    send: async () => {
      providerCalls += 1;
      return { messageId: "m" };
    },
  };
  delete runtime.env.VERIFY_BASE_URL;

  const result = await mailer.sendAuthEmail({
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "token",
    nowIso: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_config");
  assert.equal(providerCalls, 0);
  // No budget consumed: a misconfigured deployment must not burn the 3/h.
  const rows = await runtime.env.DB.prepare("SELECT COUNT(*) AS n FROM email_send_log").first();
  assert.equal(rows.n, 0);
});

test("sendAuthEmail surfaces provider errors (code + message) and logs nothing", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  runtime.env.EMAIL = {
    send: async () => {
      const error = new Error("sender domain not verified");
      error.code = "E_SENDER_NOT_VERIFIED";
      throw error;
    },
  };

  const result = await mailer.sendAuthEmail({
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "token",
    nowIso: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider");
  assert.equal(result.code, "E_SENDER_NOT_VERIFIED");
  assert.match(result.message, /sender domain not verified/);
  // A failed send never consumes the 3/h budget (honest retry loop).
  const rows = await runtime.env.DB.prepare("SELECT COUNT(*) AS n FROM email_send_log").first();
  assert.equal(rows.n, 0);
});

test("sendAuthEmail fails closed (missing_config) when the EMAIL binding is absent", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  delete runtime.env.EMAIL;

  const result = await mailer.sendAuthEmail({
    contributorId,
    to: "contributor@example.com",
    kind: "reset",
    rawToken: "token",
    nowIso: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider");
  assert.equal(result.code, "E_BINDING_MISSING");
});

test("mailerFromAddress and emailSendLimits honour env defaults", () => {
  const { mailer } = runtime;
  assert.equal(mailer.mailerFromAddress({}), "noreply@opensurveillancedb.org");
  assert.deepEqual(mailer.emailSendLimits({}), { maxRequests: 3, windowSeconds: 3600 });
  assert.equal(
    mailer.mailerFromAddress({ MAILER_FROM: "verify@opensurveillancedb.org" }),
    "verify@opensurveillancedb.org",
  );
  assert.deepEqual(mailer.emailSendLimits({ EMAIL_SEND_LIMIT_MAX: "5", EMAIL_SEND_LIMIT_WINDOW_SECONDS: "7200" }), {
    maxRequests: 5,
    windowSeconds: 7200,
  });
});
