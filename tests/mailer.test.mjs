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
//  2. Mailer layer (db/mailer.ts, D1-backed): the 1-email-per-5-minutes per
//     contributor rate limit (issue #440) runs the REAL email_send_log SQL
//     on the in-memory D1 (migration 0029), so the atomic reservation
//     (INSERT ... SELECT ... WHERE count < limit RETURNING id), the
//     Retry-After computation and the log rows are exercised at runtime.
//     The EMAIL binding is injected via the harness env mock; the full
//     route flow (reserve → sendAuthEmail) is asserted end-to-end, and a
//     concurrency regression proves 8 parallel callers cannot race past a
//     stale count (the issue #440 defect). Settlement semantics: a
//     DEFINITIVE pre-delivery rejection (E_BINDING_MISSING,
//     E_SENDER_NOT_VERIFIED, E_RATE_LIMIT_EXCEEDED, E_DAILY_LIMIT_EXCEEDED,
//     E_RECIPIENT_SUPPRESSED, E_VALIDATION_ERROR) releases the exact
//     reservation; an AMBIGUOUS outcome (E_UNKNOWN / unrecognised code)
//     keeps it until the window ages out (no duplicate-mail burst).
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
// Default policy (issue #440): 1 email per 5 minutes = 300 s window.
const DEFAULT_WINDOW_SECONDS = 300;

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
// Rate limit — 1 email per 5 minutes per contributor (migration 0029,
// issue #440; the atomic reservation is the authoritative gate)
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

async function logCount() {
  const row = await runtime.env.DB.prepare("SELECT COUNT(*) AS n FROM email_send_log").first();
  return row.n;
}

test("rate limit (default): 1 send is allowed, the 2nd is blocked with Retry-After = full window", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();

  const first = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.deepEqual(first, { ok: true, reservationId: first.reservationId });
  assert.ok(typeof first.reservationId === "number" && first.reservationId > 0, "RETURNING id present");

  const blocked = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "rate_limited");
  assert.equal(blocked.retryAfterSeconds, DEFAULT_WINDOW_SECONDS, "full window until the oldest send expires");
});

test("rate limit: the window is rolling — sends older than 5 min no longer count", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();

  await mailer.recordEmailSend(contributorId, "verify", "2026-08-02T11:54:59.000Z"); // 5min+1s before NOW
  await mailer.recordEmailSend(contributorId, "verify", "2026-08-02T11:58:00.000Z"); // inside window

  // 1 inside the window exhausts the single slot; Retry-After points at the
  // OLDEST inside-window row (11:58 → 3 minutes), proving the 11:54:59 row
  // did not count.
  const blocked = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 180);

  // After the window rolls (NOW + 5min + 1s) the 11:58 row no longer counts,
  // so the slot is free again.
  const later = "2026-08-02T12:03:01.000Z";
  const again = await mailer.reserveAuthEmail(contributorId, "verify", later, runtime.env);
  assert.equal(again.ok, true, "the window is rolling — the old row falls out");
});

test("rate limit: env knobs override the 1-per-5-min default (same per-contributor window)", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  const env = { ...runtime.env, EMAIL_SEND_LIMIT_MAX: "2", EMAIL_SEND_LIMIT_WINDOW_SECONDS: "600" };

  const first = await mailer.reserveAuthEmail(contributorId, "reset", NOW, env);
  assert.equal(first.ok, true);
  const second = await mailer.reserveAuthEmail(contributorId, "reset", NOW, env);
  assert.equal(second.ok, true);

  const blocked = await mailer.reserveAuthEmail(contributorId, "reset", NOW, env);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 600);
});

test("rate limit: windows are per contributor, not global", async () => {
  const { mailer } = runtime;
  const first = await seedContributor("alice@example.com");
  const second = await seedContributor("bob@example.com");

  const aliceReserved = await mailer.reserveAuthEmail(first, "verify", NOW, runtime.env);
  assert.equal(aliceReserved.ok, true);
  // Alice is exhausted, Bob still has his full budget.
  const alice = await mailer.reserveAuthEmail(first, "verify", NOW, runtime.env);
  assert.equal(alice.ok, false);
  const bob = await mailer.reserveAuthEmail(second, "verify", NOW, runtime.env);
  assert.equal(bob.ok, true);
});

test("canSendAuthEmail is only a read-only pre-check — it never admits (issue #440)", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  // The pre-check sees an empty window and says "allowed"...
  const pre = await mailer.canSendAuthEmail(contributorId, NOW, runtime.env);
  assert.deepEqual(pre, { allowed: true, retryAfterSeconds: 0 });
  // ...but the ATOMIC reservation is what actually takes the slot. Two
  // concurrent pre-checks both read allowed; only one reservation lands.
  const reserved = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(reserved.ok, true);
  const second = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(second.ok, false, "the second concurrent admission is refused");
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
// reserveAuthEmail + sendAuthEmail — end-to-end (reserve → render → provider
// → settle the reservation)
// ---------------------------------------------------------------------------

test("sendAuthEmail renders, sends through the EMAIL binding and keeps the reservation as the log row", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  const sentMessages = [];
  runtime.env.EMAIL = {
    send: async (message) => {
      sentMessages.push(message);
      return { messageId: "m1" };
    },
  };

  const reservation = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(reservation.ok, true);
  const result = await mailer.sendAuthEmail({
    reservationId: reservation.reservationId,
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "raw-token-value",
    displayName: "Test Contributor",
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

  // The reservation row IS the send log — exactly one row for the send.
  const rows = await runtime.env.DB.prepare("SELECT * FROM email_send_log").all();
  assert.equal(rows.results.length, 1);
  assert.equal(rows.results[0].contributor_id, contributorId);
  assert.equal(rows.results[0].kind, "verify");
});

test("CONCURRENCY (issue #440): 8 parallel callers under 1/300s — exactly 1 reaches the provider, 7 are rate_limited", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  let providerCalls = 0;
  // Delayed provider: every caller passes the reserve before the first
  // provider call resolves — on the old check-then-log implementation all 8
  // would read the same stale count and all 8 would send (the #440 defect).
  runtime.env.EMAIL = {
    send: async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { messageId: `m${providerCalls}` };
    },
  };

  let tokenSeq = 0;
  async function reserveAndSend() {
    const reservation = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
    if (!reservation.ok) return reservation;
    return mailer.sendAuthEmail({
      reservationId: reservation.reservationId,
      contributorId,
      to: "contributor@example.com",
      kind: "verify",
      rawToken: `raw-token-${(tokenSeq += 1)}`,
    });
  }

  const results = await Promise.all(Array.from({ length: 8 }, reserveAndSend));

  const ok = results.filter((r) => r.ok === true);
  const limited = results.filter((r) => r.ok === false && r.reason === "rate_limited");
  assert.equal(ok.length, 1, "exactly one caller wins the window");
  assert.equal(limited.length, 7, "the 7 losers answer rate_limited");
  for (const r of limited) {
    assert.ok(r.retryAfterSeconds > 0, "losers carry Retry-After");
  }
  assert.equal(providerCalls, 1, "exactly ONE message reached the provider");
  assert.equal(await logCount(), 1, "exactly one log row is retained (the winner's reservation)");
});

test("CONCURRENCY: the loser's rate_limited path releases nothing and mints no token (winner keeps its row)", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  runtime.env.EMAIL = {
    send: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { messageId: "m" };
    },
  };

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env),
    ),
  );
  const ok = results.filter((r) => r.ok === true);
  assert.equal(ok.length, 1, "only one reservation lands");
  assert.equal(await logCount(), 1, "losers inserted nothing — the count stays at 1");
});

test("sendAuthEmail blocks (via reserve) before any provider call when the budget is spent", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  let providerCalls = 0;
  runtime.env.EMAIL = {
    send: async () => {
      providerCalls += 1;
      return { messageId: "m" };
    },
  };

  const first = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(first.ok, true);
  const sent = await mailer.sendAuthEmail({
    reservationId: first.reservationId,
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "token-1",
  });
  assert.equal(sent.ok, true);

  const blocked = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "rate_limited");
  assert.equal(blocked.retryAfterSeconds, DEFAULT_WINDOW_SECONDS);
  assert.equal(providerCalls, 1, "the blocked send never reached the provider");
  // The blocked attempt consumed no budget: still exactly 1 log row.
  assert.equal(await logCount(), 1);
});

test("sendAuthEmail fails closed (missing_config) without VERIFY_BASE_URL — no provider call, reservation released", async () => {
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

  const reservation = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(reservation.ok, true);
  const result = await mailer.sendAuthEmail({
    reservationId: reservation.reservationId,
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "token",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_config");
  assert.equal(providerCalls, 0);
  // No budget consumed: a misconfigured deployment must not burn the budget —
  // the exact reservation is rolled back.
  assert.equal(await logCount(), 0);
  // And the budget is usable again immediately.
  const retry = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(retry.ok, true, "the released reservation frees the slot");
});

test("sendAuthEmail surfaces provider errors (code + message) and releases the exact reservation", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  runtime.env.EMAIL = {
    send: async () => {
      const error = new Error("sender domain not verified");
      error.code = "E_SENDER_NOT_VERIFIED";
      throw error;
    },
  };

  const reservation = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(reservation.ok, true);
  const result = await mailer.sendAuthEmail({
    reservationId: reservation.reservationId,
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "token",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider");
  assert.equal(result.code, "E_SENDER_NOT_VERIFIED");
  assert.match(result.message, /sender domain not verified/);
  // A DEFINITIVE rejection never consumes the budget (honest retry loop):
  // the exact reservation row is deleted...
  assert.equal(await logCount(), 0);
  // ...so the very next attempt can reserve again (deterministic failures do
  // not burn the budget — issue #440).
  const retry = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(retry.ok, true);
});

test("sendAuthEmail KEEPS the reservation on an AMBIGUOUS provider outcome (E_UNKNOWN) until the window ages out", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  // The provider throws an error WITHOUT a recognisable .code → sendMail maps
  // it to E_UNKNOWN. The email may have been accepted (response lost), so the
  // reservation must NOT be released: a retry inside the window must be
  // blocked instead of risking a duplicate send.
  runtime.env.EMAIL = {
    send: async () => {
      throw new Error("provider connection reset");
    },
  };

  const reservation = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(reservation.ok, true);
  const result = await mailer.sendAuthEmail({
    reservationId: reservation.reservationId,
    contributorId,
    to: "contributor@example.com",
    kind: "verify",
    rawToken: "token",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider");
  assert.equal(result.code, "E_UNKNOWN");
  // The ambiguous reservation row is RETAINED (bounded over-count)...
  assert.equal(await logCount(), 1, "E_UNKNOWN keeps the reservation — no duplicate-mail burst");
  // ...so an immediate retry is blocked for the full window...
  const blocked = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(blocked.ok, false, "the retained ambiguous reservation still gates the window");
  assert.equal(blocked.retryAfterSeconds, DEFAULT_WINDOW_SECONDS);
  // ...and only after the window ages out is the slot free again.
  const later = new Date(Date.parse(NOW) + (DEFAULT_WINDOW_SECONDS + 1) * 1000).toISOString();
  const again = await mailer.reserveAuthEmail(contributorId, "verify", later, runtime.env);
  assert.equal(again.ok, true, "the ambiguous reservation ages out of the window");
});

test("sendAuthEmail refuses to settle a reservation that does not belong to the caller (id + contributor + kind)", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  const attackerId = await seedContributor("attacker@example.com");
  let providerCalls = 0;
  runtime.env.EMAIL = {
    send: async () => {
      providerCalls += 1;
      return { messageId: "m" };
    },
  };

  const reservation = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(reservation.ok, true);

  // A caller presenting ANOTHER contributor's id cannot settle the row: the
  // ownership check (id AND contributor_id AND kind) fails, the row is
  // untouched, and no mail goes out under the wrong identity.
  const foreign = await mailer.sendAuthEmail({
    reservationId: reservation.reservationId,
    contributorId: attackerId,
    to: "attacker@example.com",
    kind: "verify",
    rawToken: "token",
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason, "rate_limited");
  assert.equal(providerCalls, 0, "no provider call for a foreign reservation");
  assert.equal(await logCount(), 1, "the real owner's reservation row is untouched");

  // A wrong kind for the same contributor is refused the same way.
  const wrongKind = await mailer.sendAuthEmail({
    reservationId: reservation.reservationId,
    contributorId,
    to: "contributor@example.com",
    kind: "reset",
    rawToken: "token",
  });
  assert.equal(wrongKind.ok, false);
  assert.equal(wrongKind.reason, "rate_limited");
  assert.equal(await logCount(), 1, "a mismatched kind cannot settle the row either");
});

test("sendAuthEmail fails closed (provider) when the EMAIL binding is absent — reservation released", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  delete runtime.env.EMAIL;

  const reservation = await mailer.reserveAuthEmail(contributorId, "reset", NOW, runtime.env);
  assert.equal(reservation.ok, true);
  const result = await mailer.sendAuthEmail({
    reservationId: reservation.reservationId,
    contributorId,
    to: "contributor@example.com",
    kind: "reset",
    rawToken: "token",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider");
  assert.equal(result.code, "E_BINDING_MISSING");
  assert.equal(await logCount(), 0, "no log row is retained for an undelivered send");
});

test("CRASH SEMANTICS: an abandoned reservation counts until it ages out of the window (documented over-count)", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();

  // A request reserved a slot and then died before the provider call — the
  // row stays (the worker cannot run releaseEmailReservation). It counts
  // against the window until it ages out (5 min) or retention R18 sweeps it.
  const abandoned = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(abandoned.ok, true);

  const blocked = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(blocked.ok, false, "the abandoned reservation holds the window");
  assert.equal(blocked.retryAfterSeconds, DEFAULT_WINDOW_SECONDS);

  // The row is still physically there (it is not deleted by the loser)...
  assert.equal(await logCount(), 1);
  // ...and after the window rolls it stops counting, so a retry succeeds.
  const later = new Date(Date.parse(NOW) + (DEFAULT_WINDOW_SECONDS + 1) * 1000).toISOString();
  const again = await mailer.reserveAuthEmail(contributorId, "verify", later, runtime.env);
  assert.equal(again.ok, true, "the crashed reservation ages out of the window");
});

test("releaseEmailReservation is a scoped point delete — id + contributor + kind, idempotent", async () => {
  const { mailer } = runtime;
  const contributorId = await seedContributor();
  const otherId = await seedContributor("other@example.com");
  const first = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(first.ok, true);

  // Wrong contributor / kind: the row is NOT touched (ownership scope).
  await mailer.releaseEmailReservation(first.reservationId, otherId, "verify");
  assert.equal(await logCount(), 1, "a foreign contributor cannot delete the reservation");
  await mailer.releaseEmailReservation(first.reservationId, contributorId, "reset");
  assert.equal(await logCount(), 1, "a foreign kind cannot delete the reservation");

  // Exact id + contributor + kind: the row is deleted.
  await mailer.releaseEmailReservation(first.reservationId, contributorId, "verify");
  assert.equal(await logCount(), 0);
  // Idempotent: releasing the same id again is a no-op.
  await mailer.releaseEmailReservation(first.reservationId, contributorId, "verify");
  assert.equal(await logCount(), 0);

  // The slot is free again.
  const again = await mailer.reserveAuthEmail(contributorId, "verify", NOW, runtime.env);
  assert.equal(again.ok, true);
});

test("mailerFromAddress and emailSendLimits honour env defaults", () => {
  const { mailer } = runtime;
  assert.equal(mailer.mailerFromAddress({}), "noreply@opensurveillancedb.org");
  assert.deepEqual(mailer.emailSendLimits({}), { maxRequests: 1, windowSeconds: 300 });
  assert.equal(
    mailer.mailerFromAddress({ MAILER_FROM: "verify@opensurveillancedb.org" }),
    "verify@opensurveillancedb.org",
  );
  assert.deepEqual(mailer.emailSendLimits({ EMAIL_SEND_LIMIT_MAX: "5", EMAIL_SEND_LIMIT_WINDOW_SECONDS: "7200" }), {
    maxRequests: 5,
    windowSeconds: 7200,
  });
});
