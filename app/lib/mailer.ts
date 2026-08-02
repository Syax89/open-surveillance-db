/**
 * Outbound transactional mail for the auth flows (multi-method auth Fase B;
 * Cloudflare Email Routing + templates hardening is Fase A2, t_4c398006).
 *
 * Two senders, one channel:
 *   - `sendVerificationEmail` — the link emailed at registration / re-send;
 *   - `sendPasswordResetEmail` — the link emailed by reset-request.
 *
 * Transport is the Cloudflare `send_email` Worker binding (Email Workers),
 * optional by design:
 *   - binding present  -> the email is composed (HTML + plain, zero tracking:
 *     no pixels, no remote resources, no analytics links — the only URL in
 *     the message is the action link) and sent; failures are logged and
 *     swallowed so REGISTRATION AND RESET NEVER FAIL BECAUSE OF MAIL.
 *   - binding absent   -> dev/test fallback: the composed message is logged
 *     and the action link is returned in `devLink`. The register route only
 *     echoes `devLink` in this case, so a real deployment (binding present)
 *     never exposes the token in an API response.
 *
 * Privacy by design: no personal data beyond the recipient address, no
 * tracking of opens/clicks, no third-party processor — Cloudflare is already
 * the infrastructure provider (A2 task note: zero new DPA).
 *
 * The module is deliberately dependency-free of `cloudflare:workers` (env is
 * passed in, like rate-limit.ts / input-limits.ts) so the test harness can
 * transpile and import it in plain Node.
 */

type EnvLike = { [key: string]: unknown };

const DEFAULT_FROM = "no-reply@opensurveillancedb.org";

export type MailSendResult = {
  /** Whether the email was handed to the Cloudflare binding. */
  delivered: boolean;
  /** Present ONLY in the dev/test fallback: the full action link. */
  devLink?: string;
};

function sender(env: unknown): string {
  const value = (env as EnvLike).MAIL_FROM;
  return typeof value === "string" && value.length > 0 ? value : DEFAULT_FROM;
}

/** The link base: VERIFY_BASE_URL env wins, otherwise the request origin. */
function linkBase(env: unknown, requestOrigin: string): string {
  const value = (env as EnvLike).VERIFY_BASE_URL;
  return typeof value === "string" && value.length > 0 ? value : requestOrigin;
}

/** One shared envelope composer; the subject/body pairs differ per purpose. */
async function deliver(
  env: unknown,
  options: {
    to: string;
    subject: string;
    plain: string;
    html: string;
    actionUrl: string;
  },
): Promise<MailSendResult> {
  // The Cloudflare `send_email` binding is named EMAIL in wrangler.jsonc
  // (AUTH MULTI-METODO Fase A2 / #234, ADR 0020). The binding surface is the
  // structured builder API: send({ to, from, subject, html, text }) →
  // { messageId } — see db/mailer.ts sendMail(), which is the A2 canonical
  // implementation this module mirrors for the Fase B routes.
  const binding = (env as { EMAIL?: { send(message: unknown): Promise<{ messageId: string }> } }).EMAIL;
  if (!binding) {
    // Dev/test fallback: surface the action link so local flows and the E2E
    // harness can complete the verification without a real mail backend.
    console.info(`[mailer:dev] ${options.subject} -> ${options.to}\n  ${options.actionUrl}`);
    return { delivered: false, devLink: options.actionUrl };
  }
  try {
    const from = sender(env);
    await binding.send({
      to: options.to,
      from,
      subject: options.subject,
      html: options.html,
      text: options.plain,
    });
    return { delivered: true };
  } catch (error) {
    // Mail must never break auth: log and continue (the user can re-send).
    console.error("[mailer] send failed", error);
    return { delivered: false };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Send the email-verification link (register / re-send). `requestOrigin` is
 * the fallback link base when VERIFY_BASE_URL is unset. `rawToken` is the
 * single-use token from createVerificationToken — never stored, never logged
 * beyond the dev fallback link.
 */
export async function sendVerificationEmail(
  env: unknown,
  options: { to: string; rawToken: string; requestOrigin: string },
): Promise<MailSendResult> {
  const base = linkBase(env, options.requestOrigin);
  const actionUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(options.rawToken)}`;
  const plain = [
    "Confirm your email address",
    "",
    "You registered on OpenSurveillanceDB. Confirm your email to start contributing:",
    actionUrl,
    "",
    "This link is valid for 24 hours and can be used once. If you did not register, you can ignore this email — no action is needed.",
  ].join("\n");
  const html = [
    "<!doctype html><html><body style=\"font-family:sans-serif;line-height:1.5\">",
    "<h2>Confirm your email address</h2>",
    "<p>You registered on OpenSurveillanceDB. Confirm your email to start contributing:</p>",
    `<p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>`,
    "<p>This link is valid for 24 hours and can be used once. If you did not register, you can ignore this email — no action is needed.</p>",
    "</body></html>",
  ].join("");
  return deliver(env, { to: options.to, subject: "OpenSurveillanceDB — confirm your email", plain, html, actionUrl });
}

/**
 * Send the password-reset link (reset-request). The link points at the
 * client-side reset page (Fase E2 UI), which calls
 * POST /api/auth/reset-password/confirm with the token and a new password.
 */
export async function sendPasswordResetEmail(
  env: unknown,
  options: { to: string; rawToken: string; requestOrigin: string },
): Promise<MailSendResult> {
  const base = linkBase(env, options.requestOrigin);
  const actionUrl = `${base}/reset-password?token=${encodeURIComponent(options.rawToken)}`;
  const plain = [
    "Reset your password",
    "",
    "Someone asked to reset the password for this OpenSurveillanceDB account. If it was you:",
    actionUrl,
    "",
    "This link is valid for 24 hours and can be used once. If you did not ask for a reset, you can ignore this email — your password is unchanged.",
  ].join("\n");
  const html = [
    "<!doctype html><html><body style=\"font-family:sans-serif;line-height:1.5\">",
    "<h2>Reset your password</h2>",
    "<p>Someone asked to reset the password for this OpenSurveillanceDB account. If it was you:</p>",
    `<p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>`,
    "<p>This link is valid for 24 hours and can be used once. If you did not ask for a reset, you can ignore this email — your password is unchanged.</p>",
    "</body></html>",
  ].join("");
  return deliver(env, { to: options.to, subject: "OpenSurveillanceDB — reset your password", plain, html, actionUrl });
}
