/**
 * Outbound transactional mailer (AUTH MULTI-METODO Fase A2, t_4c398006 —
 * ADR 0020 decision 2).
 *
 * Sends account verification and password-reset emails through the
 * Cloudflare Email Service `send_email` binding (`EMAIL` in
 * wrangler.jsonc), rendering the bilingual HTML+plain templates from
 * app/lib/email-templates.ts. Cloudflare is already the processor (PR1,
 * DPA v6.3 + SCC + DPF — PROCESSOR_REGISTER.md), so this adds zero new
 * third parties and zero new DPAs.
 *
 * Rate limiting (issue #440: 1 email per 5 minutes per contributor —
 * every auth email counts against the same budget, both purposes):
 * admission is an ATOMIC reservation in `email_send_log` (migration
 * 0029):
 *
 *   reserveAuthEmail() runs ONE statement —
 *     INSERT INTO email_send_log (contributor_id, kind, sent_at)
 *     SELECT ?, ?, ? WHERE (
 *       SELECT COUNT(*) FROM email_send_log
 *       WHERE contributor_id = ? AND sent_at >= ?
 *     ) < ? RETURNING id
 *   — so the count check and the row insert happen in the same atomic
 *   write. Two concurrent requests for the same contributor can NEVER
 *   both read a stale count: exactly one insert lands, the rest get zero
 *   rows back and answer rate_limited. The window is a D1 statement —
 *   durable and shared across worker isolates, unlike the per-isolate
 *   in-memory limiter in app/lib/rate-limit.ts. A blocked send answers
 *   { ok: false, reason: "rate_limited", retryAfterSeconds } so the route
 *   can return 429 with Retry-After (Fase B / Fase G test matrix #7).
 *
 * The reservation row is kept when the provider accepts the email (it IS
 * the send log — exactly one row per delivered send) and rolled back
 * (`releaseEmailReservation`, DELETE by the exact RETURNING id scoped to
 * the same contributor + kind) when the send deterministically failed
 * BEFORE delivery: token mint threw, render failed, VERIFY_BASE_URL is
 * missing, or the provider rejected the message with a DEFINITIVE
 * non-delivery code (E_BINDING_MISSING, E_SENDER_NOT_VERIFIED,
 * E_RATE_LIMIT_EXCEEDED, E_DAILY_LIMIT_EXCEEDED, E_RECIPIENT_SUPPRESSED,
 * E_VALIDATION_ERROR). A deterministic failure therefore never burns the
 * budget. An AMBIGUOUS provider outcome (E_UNKNOWN or any unrecognised
 * code — the provider may have accepted the email and the response was
 * lost) deliberately KEEPS the short reservation: the row counts against
 * the window until it ages out (5 minutes by default) and is swept by
 * retention R18 (24 h) — that bounded over-count is the price of atomicity
 * and prevents a retry from duplicating an email that may have been
 * delivered. A crash (worker killed mid-send) leaves the same short
 * reservation. Both are documented in ADR 0020 / RETENTION_SCHEDULE.
 *
 * Callers MUST reserve BEFORE minting any token: the resend and reset
 * routes reserve first, and only a request that holds a reservation mints
 * a new verification token. A losing concurrent resend answers
 * rate_limited without minting, so it cannot revoke the link that won the
 * window and was delivered.
 *
 * Privacy by design: the log row stores NO content, NO recipient address
 * and NO IP — only contributor_id, kind ('verify' | 'reset') and sent_at.
 * The templates carry zero tracking (no pixels, no remote assets, only the
 * action link). The recipient address is read by the CALLER from
 * contributors.email and passed to send(); it is never persisted here.
 */

import { env } from "cloudflare:workers";
import { getD1 } from "./cameras";
import {
  buildAuthActionUrl,
  renderAuthEmail,
  type AuthEmailKind,
  type AuthEmailContext,
} from "../app/lib/email-templates";

// ---------------------------------------------------------------------------
// Rate-limit knobs (issue #440: 1 email per 5 minutes per contributor,
// ADR 0020 decision 2). EMAIL_SEND_LIMIT_MAX / EMAIL_SEND_LIMIT_WINDOW_SECONDS
// override the default for deployments that intentionally want a different
// budget (e.g. staging or a temporarily raised ceiling); the override scope
// is the same per-contributor window the default enforces.
// ---------------------------------------------------------------------------

export const EMAIL_SEND_LIMIT_DEFAULT_MAX = 1;
export const EMAIL_SEND_LIMIT_DEFAULT_WINDOW_SECONDS = 5 * 60;

export type EmailSendLimits = {
  maxRequests: number;
  windowSeconds: number;
};

/** Resolve the send-rate limits, honouring env overrides (test convention). */
export function emailSendLimits(config: unknown): EmailSendLimits {
  const values = config as { [key: string]: unknown };
  const maxRequests = Number(values.EMAIL_SEND_LIMIT_MAX);
  const windowSeconds = Number(values.EMAIL_SEND_LIMIT_WINDOW_SECONDS);
  return {
    maxRequests:
      Number.isFinite(maxRequests) && maxRequests > 0
        ? maxRequests
        : EMAIL_SEND_LIMIT_DEFAULT_MAX,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0
        ? windowSeconds
        : EMAIL_SEND_LIMIT_DEFAULT_WINDOW_SECONDS,
  };
}

/** Sender address for transactional mail (from-domain must be onboarded). */
export function mailerFromAddress(config: unknown): string {
  const values = config as { [key: string]: unknown };
  const override = values.MAILER_FROM;
  return typeof override === "string" && override.length > 0
    ? override
    : "noreply@opensurveillancedb.org";
}

/** VERIFY_BASE_URL — the public base URL used to build action links. */
export function verifyBaseUrl(config: unknown): string {
  const values = config as { [key: string]: unknown };
  const value = values.VERIFY_BASE_URL;
  return typeof value === "string" && value.length > 0 ? value : "";
}

export type EmailSendDecision =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Read-only rate-limit pre-check for a contributor. Counts `email_send_log`
 * rows newer than now - windowSeconds. NOT the admission gate: it is a
 * non-atomic SELECT, so two concurrent callers can both read "allowed" —
 * the atomic `reserveAuthEmail` is the authoritative gate and every route
 * must reserve before minting/sending. Kept for diagnostics, fast 429
 * pre-flights and tests.
 */
export async function canSendAuthEmail(
  contributorId: number,
  nowIso: string,
  config: unknown,
): Promise<EmailSendDecision> {
  const limits = emailSendLimits(config);
  const d1 = await getD1();
  const windowStartIso = new Date(Date.parse(nowIso) - limits.windowSeconds * 1000).toISOString();
  const row = await d1
    .prepare(
      `SELECT COUNT(*) AS n FROM email_send_log
       WHERE contributor_id = ? AND sent_at >= ?`,
    )
    .bind(contributorId, windowStartIso)
    .first<{ n: number }>();
  const recent = Number(row?.n ?? 0);
  if (recent < limits.maxRequests) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return { allowed: false, retryAfterSeconds: await retryAfterSeconds(contributorId, nowIso, limits) };
}

/**
 * Retry-After: time until the oldest send in the window is no longer
 * counted. Recomputed from the oldest row so the answer is exact.
 */
async function retryAfterSeconds(
  contributorId: number,
  nowIso: string,
  limits: EmailSendLimits,
): Promise<number> {
  const d1 = await getD1();
  const windowStartIso = new Date(Date.parse(nowIso) - limits.windowSeconds * 1000).toISOString();
  const oldest = await d1
    .prepare(
      `SELECT MIN(sent_at) AS oldest FROM email_send_log
       WHERE contributor_id = ? AND sent_at >= ?`,
    )
    .bind(contributorId, windowStartIso)
    .first<{ oldest: string | null }>();
  const oldestAt = oldest?.oldest ? Date.parse(oldest.oldest) : Date.parse(nowIso);
  return Math.max(
    1,
    Math.ceil((oldestAt + limits.windowSeconds * 1000 - Date.parse(nowIso)) / 1000),
  );
}

// ---------------------------------------------------------------------------
// Atomic admission (issue #440)
// ---------------------------------------------------------------------------

export type AuthEmailReservation =
  | { ok: true; reservationId: number }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

/**
 * Atomically reserve one send slot for a contributor: INSERT the send-log
 * row ONLY while the in-window count is below the limit, RETURNING the
 * reserved row id. The check and the insert are one statement, so
 * concurrent requests cannot race past a stale count (the defect in the
 * old check-then-log flow, issue #440). The reservation row doubles as the
 * permanent send-log row when the provider accepts the email; on a
 * deterministic pre-delivery failure the caller rolls it back with
 * `releaseEmailReservation` so the budget is not burned. A caller that
 * holds a reservation may safely mint its token: the loser answered
 * rate_limited without ever reaching the mint.
 */
export async function reserveAuthEmail(
  contributorId: number,
  kind: AuthEmailKind,
  nowIso: string,
  config: unknown,
): Promise<AuthEmailReservation> {
  const limits = emailSendLimits(config);
  const d1 = await getD1();
  const windowStartIso = new Date(Date.parse(nowIso) - limits.windowSeconds * 1000).toISOString();
  const row = await d1
    .prepare(
      `INSERT INTO email_send_log (contributor_id, kind, sent_at)
       SELECT ?, ?, ?
       WHERE (
         SELECT COUNT(*) FROM email_send_log
         WHERE contributor_id = ? AND sent_at >= ?
       ) < ?
       RETURNING id`,
    )
    .bind(contributorId, kind, nowIso, contributorId, windowStartIso, limits.maxRequests)
    .first<{ id: number }>();
  if (row) {
    return { ok: true, reservationId: Number(row.id) };
  }
  return {
    ok: false,
    reason: "rate_limited",
    retryAfterSeconds: await retryAfterSeconds(contributorId, nowIso, limits),
  };
}

/**
 * Roll back a reserved send slot (see `reserveAuthEmail`). Called when the
 * send deterministically failed BEFORE delivery (token mint threw, render
 * failed, missing config, provider rejection). The id is the exact row the
 * reservation's RETURNING returned AND the delete is scoped to the same
 * contributor + kind, so a misrouted or buggy caller can never settle
 * another account's send row (defence in depth — the routes always pass
 * the values they reserved with). Deleting an already-gone row is a no-op
 * (idempotent).
 */
export async function releaseEmailReservation(
  reservationId: number,
  contributorId: number,
  kind: AuthEmailKind,
): Promise<void> {
  const d1 = await getD1();
  await d1
    .prepare("DELETE FROM email_send_log WHERE id = ? AND contributor_id = ? AND kind = ?")
    .bind(reservationId, contributorId, kind)
    .run();
}

/** Append a send-log row directly (low-level; tests seed budget state). */
export async function recordEmailSend(
  contributorId: number,
  kind: AuthEmailKind,
  sentAtIso: string,
): Promise<void> {
  const d1 = await getD1();
  await d1
    .prepare("INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (?, ?, ?)")
    .bind(contributorId, kind, sentAtIso)
    .run();
}

// ---------------------------------------------------------------------------
// Provider send + error mapping
// ---------------------------------------------------------------------------

export type MailerSendResult =
  | { ok: true; messageId: string }
  | { ok: false; code: string; message: string };

/**
 * Call the Cloudflare Email Service binding. The `EMAIL` binding is the
 * structured builder API: `send({ to, from, subject, html, text })`.
 * Provider errors carry a `.code` (E_SENDER_NOT_VERIFIED, E_RATE_LIMIT_EXCEEDED,
 * E_DAILY_LIMIT_EXCEEDED, E_RECIPIENT_SUPPRESSED, E_VALIDATION_ERROR, ...)
 * which the caller maps to an HTTP status.
 */
export async function sendMail(
  message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  },
): Promise<MailerSendResult> {
  const binding = (env as { EMAIL?: { send(message: unknown): Promise<{ messageId: string }> } }).EMAIL;
  if (!binding) {
    return { ok: false, code: "E_BINDING_MISSING", message: "EMAIL binding is not configured" };
  }
  try {
    const result = await binding.send({
      to: message.to,
      from: message.from,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    const code =
      error instanceof Error && typeof (error as unknown as { code?: unknown }).code === "string"
        ? (error as unknown as { code: string }).code
        : "E_UNKNOWN";
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, code, message: detail };
  }
}

// ---------------------------------------------------------------------------
// High-level: render + send + log a PRE-RESERVED slot (single call for the
// routes; the reservation is created first by reserveAuthEmail)
// ---------------------------------------------------------------------------

export type SendAuthEmailInput = {
  /** The reservation returned by `reserveAuthEmail` for this send. */
  reservationId: number;
  contributorId: number;
  /** Recipient address (caller reads it from contributors.email). */
  to: string;
  kind: AuthEmailKind;
  /** Raw single-use token (already hashed before storage by the caller). */
  rawToken: string;
  displayName?: string | null;
  siteName?: string;
  siteUrl?: string;
};

export type SendAuthEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "missing_config"; message: string }
  | { ok: false; reason: "provider"; code: string; message: string };

const DEFINITIVE_NON_DELIVERY_CODES = new Set([
  // No provider call happened — the binding is absent.
  "E_BINDING_MISSING",
  // Provider rejected the message BEFORE delivery (documented in the
  // send_email binding contract, see the sendMail doc): misconfigured
  // sender or destination, quota exceeded, suppressed recipient, malformed
  // payload or headers, unavailable sending domain, undeliverable message.
  // Empirically confirmed 2026-08-12 on the production binding:
  // E_RECIPIENT_NOT_ALLOWED ("destination address is not a verified
  // address") fires when the account has not onboarded the sending domain
  // (Workers Free: arbitrary recipients are rejected; only verified
  // destination addresses are allowed).
  "E_SENDER_NOT_VERIFIED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE",
  "E_RECIPIENT_NOT_ALLOWED",
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
  "E_RECIPIENT_SUPPRESSED",
  "E_VALIDATION_ERROR",
  "E_DELIVERY_FAILED",
  "E_FIELD_MISSING",
  "E_TOO_MANY_RECIPIENTS",
  "E_TOO_MANY_ATTACHMENTS",
  "E_CONTENT_TOO_LARGE",
  "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD",
  "E_HEADER_VALUE_INVALID",
  "E_HEADER_VALUE_TOO_LONG",
  "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE",
  "E_HEADERS_TOO_MANY",
  "E_INTERNAL_SERVER_ERROR",
]);

/**
 * Render, send and settle one PRE-RESERVED auth email. This is the second
 * half of the route flow: `reserveAuthEmail` admitted the send atomically,
 * the route minted the token, then calls this with the reservation id.
 *
 * The reservation row already exists (it is the admission). Settling:
 *   - success → the row stays — it IS the send-log row;
 *  - deterministic pre-delivery failure (missing VERIFY_BASE_URL, render
 *    error, provider rejection with a DEFINITIVE non-delivery code — see
 *    DEFINITIVE_NON_DELIVERY_CODES, or the reservation row vanished) → the
 *    exact reservation is rolled back, so a failed send never consumes the
 *    budget and the retry loop is honest;
 *   - AMBIGUOUS provider outcome (E_UNKNOWN or any unrecognised code) →
 *     the reservation is KEPT: the provider may have accepted the email
 *     (response lost), and releasing it would let a retry duplicate mail.
 *     The short over-count ages out of the window (5 minutes by default,
 *     swept by retention R18) — see the module doc.
 *
 * `rate_limited` can only surface if the reservation row vanished between
 * reserve and send (defensive; the atomic gate already ran).
 */
export async function sendAuthEmail(input: SendAuthEmailInput): Promise<SendAuthEmailResult> {
  const config = env;

  // Defensive: the reservation must exist AND belong to this exact
  // contributor + kind. A caller that cannot prove ownership of the row
  // cannot settle it (no external input may settle another account's send).
  const reservation = await findReservation(input.reservationId, input.contributorId, input.kind);
  if (!reservation) {
    const limits = emailSendLimits(config);
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: await retryAfterSeconds(input.contributorId, new Date().toISOString(), limits),
    };
  }

  const baseUrl = verifyBaseUrl(config);
  if (!baseUrl) {
    await releaseEmailReservation(input.reservationId, input.contributorId, input.kind);
    return {
      ok: false,
      reason: "missing_config",
      message: "VERIFY_BASE_URL is not configured — cannot build the action link",
    };
  }

  try {
    const context: AuthEmailContext = {
      actionUrl: buildAuthActionUrl(input.kind, input.rawToken, baseUrl),
      displayName: input.displayName,
      siteName: input.siteName ?? "OpenSurveillanceDB",
      siteUrl: input.siteUrl ?? "https://opensurveillancedb.org",
    };
    const rendered = renderAuthEmail(input.kind, context);

    const sent = await sendMail({
      to: input.to,
      from: mailerFromAddress(config),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (!sent.ok) {
      // Release ONLY on a DEFINITIVE pre-delivery rejection; an ambiguous
      // outcome (E_UNKNOWN / unrecognised code) keeps the reservation so a
      // retry cannot duplicate an email that may have been delivered.
      if (DEFINITIVE_NON_DELIVERY_CODES.has(sent.code)) {
        await releaseEmailReservation(input.reservationId, input.contributorId, input.kind);
      }
      return { ok: false, reason: "provider", code: sent.code, message: sent.message };
    }
    return { ok: true, messageId: sent.messageId };
  } catch (error) {
    // Render failure or any unexpected error before delivery: roll the
    // reservation back and rethrow so the route's catch maps it to 503.
    // No provider call happened yet, so this is a deterministic
    // pre-delivery failure.
    await releaseEmailReservation(input.reservationId, input.contributorId, input.kind);
    throw error;
  }
}

async function findReservation(
  reservationId: number,
  contributorId: number,
  kind: AuthEmailKind,
): Promise<{ id: number } | null> {
  const d1 = await getD1();
  return d1
    .prepare("SELECT id FROM email_send_log WHERE id = ? AND contributor_id = ? AND kind = ?")
    .bind(reservationId, contributorId, kind)
    .first<{ id: number }>();
}
