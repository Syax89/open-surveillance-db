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
 * Rate limiting (the 3 emails/hour per contributor cap): every send is
 * recorded in `email_send_log` (migration 0029) BEFORE the provider call,
 * and the check counts rows newer than now - 1h for the contributor. The
 * window is a D1 COUNT — durable and shared across worker isolates, unlike
 * the per-isolate in-memory limiter in app/lib/rate-limit.ts. A blocked
 * send answers { allowed: false, retryAfterSeconds } so the route can
 * return 429 with Retry-After (Fase B / Fase G test matrix #7).
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
// Rate-limit knobs (3 emails/hour per contributor, ADR 0020 decision 2)
// ---------------------------------------------------------------------------

export const EMAIL_SEND_LIMIT_DEFAULT_MAX = 3;
export const EMAIL_SEND_LIMIT_DEFAULT_WINDOW_SECONDS = 60 * 60;

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
 * Rate-limit check for a contributor. Counts `email_send_log` rows newer
 * than now - windowSeconds. When the window is exhausted, retryAfterSeconds
 * is the time until the oldest row in the window falls out.
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
  // Retry-After: time until the oldest send in the window is no longer
  // counted. We recompute it from the oldest row so the answer is exact.
  const oldest = await d1
    .prepare(
      `SELECT MIN(sent_at) AS oldest FROM email_send_log
       WHERE contributor_id = ? AND sent_at >= ?`,
    )
    .bind(contributorId, windowStartIso)
    .first<{ oldest: string | null }>();
  const oldestAt = oldest?.oldest ? Date.parse(oldest.oldest) : Date.parse(nowIso);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((oldestAt + limits.windowSeconds * 1000 - Date.parse(nowIso)) / 1000),
  );
  return { allowed: false, retryAfterSeconds };
}

/** Append a send-log row (call AFTER the provider accepted the email). */
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
// High-level: render + rate limit + send + log (single call for the routes)
// ---------------------------------------------------------------------------

export type SendAuthEmailInput = {
  contributorId: number;
  /** Recipient address (caller reads it from contributors.email). */
  to: string;
  kind: AuthEmailKind;
  /** Raw single-use token (already hashed before storage by the caller). */
  rawToken: string;
  displayName?: string | null;
  siteName?: string;
  siteUrl?: string;
  nowIso?: string;
};

export type SendAuthEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "missing_config"; message: string }
  | { ok: false; reason: "provider"; code: string; message: string };

/**
 * Render, rate-limit, send and log one auth email. This is the single entry
 * point the Fase B routes call (register → verification, password reset).
 *
 * Order matters: the rate-limit check runs FIRST (before any provider call),
 * then the send, then the log row. The log row is written only after the
 * provider accepted the email, so a failed send never consumes the 3/h
 * budget and the retry loop is honest.
 */
export async function sendAuthEmail(input: SendAuthEmailInput): Promise<SendAuthEmailResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const config = env;

  const decision = await canSendAuthEmail(input.contributorId, nowIso, config);
  if (!decision.allowed) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };
  }

  const baseUrl = verifyBaseUrl(config);
  if (!baseUrl) {
    return {
      ok: false,
      reason: "missing_config",
      message: "VERIFY_BASE_URL is not configured — cannot build the action link",
    };
  }

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
    return { ok: false, reason: "provider", code: sent.code, message: sent.message };
  }

  await recordEmailSend(input.contributorId, input.kind, nowIso);
  return { ok: true, messageId: sent.messageId };
}
