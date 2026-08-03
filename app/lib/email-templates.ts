/**
 * Transactional email templates for the auth flows (AUTH MULTI-METODO
 * Fase A2, t_4c398006 — ADR 0020 decision 2).
 *
 * Two templates, each rendered in BOTH HTML and plain text:
 *   - verification   (email address verification after register)
 *   - password reset (Fase B)
 *
 * Zero-tracking contract (PRIVACY_AND_SAFETY.md, PROCESSOR_REGISTER.md PR1):
 *   - NO <img> tags: no tracking pixels, no remote images, no beacons;
 *   - NO external links beyond the single action URL — no analytics,
 *     no social, no unsubscribe-tracking endpoints;
 *   - NO remote stylesheets/fonts: all styling is inline so the mailer
 *     never phones home to render;
 *   - a plain-text alternative is ALWAYS present (accessibility + spam
 *     filters); HTML and text carry the same copy.
 * A test (tests/mailer.test.mjs) asserts all of the above on every render.
 *
 * Copy is bilingual EN/IT (ADR 0007): the site stores no per-contributor
 * locale, so both languages ship in the same message — the recipient reads
 * the one they prefer. The subject line is EN (site primary language).
 *
 * This module is PURE: no Cloudflare bindings, no DB — it renders strings
 * and can run in plain Node (route tests import it via loadLibModule).
 */

export type AuthEmailKind = "verify" | "reset";

export type AuthEmailContext = {
  /** The full action URL (verification or reset link) with the raw token. */
  actionUrl: string;
  /** Optional public display name; escaped in HTML output. */
  displayName?: string | null;
  /** Brand name shown in header/footer, e.g. "OpenSurveillanceDB". */
  siteName: string;
  /** Public site URL shown as a plain-text fallback (never a tracking link). */
  siteUrl: string;
};

export type RenderedAuthEmail = {
  subject: string;
  html: string;
  text: string;
};

const DEFAULT_SITE_NAME = "OpenSurveillanceDB";

/** Escape user-controlled text for safe inclusion in HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Build the action URL for a given kind from the VERIFY_BASE_URL env value.
 * Kept here (pure) so the route layer can render links without importing
 * the D1-backed mailer module. The token is encoded as a query parameter;
 * the links land on the client pages (P1-1/P1-3 Vera design) — /verify-email
 * and /reset-password — which consume the API client-side. (Previously the
 * verify link pointed at GET /api/auth/verify-email, i.e. raw JSON in the
 * browser, and the reset link at a route that does not exist.)
 */
export function buildAuthActionUrl(kind: AuthEmailKind, rawToken: string, verifyBaseUrl: string): string {
  const base = verifyBaseUrl.replace(/\/+$/, "");
  const path = kind === "verify" ? "/verify-email" : "/reset-password";
  return `${base}${path}?token=${encodeURIComponent(rawToken)}`;
}

function greeting(displayName: string | null | undefined): string {
  return displayName ? `Hi ${displayName},` : "Hi,";
}

function greetingIt(displayName: string | null | undefined): string {
  return displayName ? `Ciao ${displayName},` : "Ciao,";
}

/**
 * Render the email-address verification message. The action link expires
 * after 24h (ADR 0020: single-use, SHA-256-hashed token) — the copy says
 * so without hard-coding a number the route layer owns.
 */
export function renderVerificationEmail(context: AuthEmailContext): RenderedAuthEmail {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  const actionUrl = context.actionUrl;
  const actionUrlEscaped = escapeHtml(actionUrl);
  const name = context.displayName ?? null;

  const subject = `Verify your email · ${siteName}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;">
  <p>${escapeHtml(greeting(name))}</p>
  <p>Please confirm that this email address belongs to you so you can start contributing to ${escapeHtml(siteName)}. This link works for <strong>24 hours</strong> and can be used only once.</p>
  <p style="margin:24px 0;">
    <a href="${actionUrlEscaped}" style="background-color:#0b705c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Verify email address</a>
  </p>
  <p>If the button does not work, copy and paste this link into your browser:</p>
  <p><a href="${actionUrlEscaped}" style="color:#0b705c;">${actionUrlEscaped}</a></p>
  <p>If you did not create an account on ${escapeHtml(siteName)}, you can ignore this email.</p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
  <p lang="it" style="color:#444444;">— Italiano —</p>
  <p lang="it">${escapeHtml(greetingIt(name))}</p>
  <p lang="it">Conferma che questo indirizzo email ti appartiene per iniziare a contribuire a ${escapeHtml(siteName)}. Il link è valido per <strong>24 ore</strong> e può essere usato una sola volta.</p>
  <p lang="it" style="margin:24px 0;">
    <a href="${actionUrlEscaped}" style="background-color:#0b705c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Verifica l'indirizzo email</a>
  </p>
  <p lang="it">Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
  <p lang="it"><a href="${actionUrlEscaped}" style="color:#0b705c;">${actionUrlEscaped}</a></p>
  <p lang="it">Se non hai creato un account su ${escapeHtml(siteName)}, puoi ignorare questa email.</p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
  <p style="color:#666666;font-size:13px;">${escapeHtml(siteName)} · ${escapeHtml(context.siteUrl)}</p>
</div>`;

  const text = [
    greeting(name),
    "",
    `Please confirm that this email address belongs to you so you can start contributing to ${siteName}. This link works for 24 hours and can be used only once.`,
    "",
    `Verify email address: ${actionUrl}`,
    "",
    "If you did not create an account on " + siteName + ", you can ignore this email.",
    "",
    "— Italiano —",
    "",
    greetingIt(name),
    `Conferma che questo indirizzo email ti appartiene per iniziare a contribuire a ${siteName}. Il link è valido per 24 ore e può essere usato una sola volta.`,
    "",
    `Verifica l'indirizzo email: ${actionUrl}`,
    "",
    "Se non hai creato un account su " + siteName + ", puoi ignorare questa email.",
    "",
    `${siteName} · ${context.siteUrl}`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Render the password-reset message. Same mailer, same single-use token
 * discipline as verification (ADR 0020 decision 2), but the reset link dies
 * after 3h (RESET_TOKEN_TTL_MS) — shorter window than the 24h verification
 * link, because a stolen reset link is the higher-stakes path.
 */
export function renderPasswordResetEmail(context: AuthEmailContext): RenderedAuthEmail {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  const actionUrl = context.actionUrl;
  const actionUrlEscaped = escapeHtml(actionUrl);
  const name = context.displayName ?? null;

  const subject = `Reset your password · ${siteName}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;">
  <p>${escapeHtml(greeting(name))}</p>
  <p>We received a request to reset the password for your ${escapeHtml(siteName)} account. This link works for <strong>3 hours</strong> and can be used only once.</p>
  <p style="margin:24px 0;">
    <a href="${actionUrlEscaped}" style="background-color:#0b705c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Reset password</a>
  </p>
  <p>If the button does not work, copy and paste this link into your browser:</p>
  <p><a href="${actionUrlEscaped}" style="color:#0b705c;">${actionUrlEscaped}</a></p>
  <p>If you did not request a password reset, you can ignore this email — your password stays unchanged.</p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
  <p lang="it" style="color:#444444;">— Italiano —</p>
  <p lang="it">${escapeHtml(greetingIt(name))}</p>
  <p lang="it">Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account ${escapeHtml(siteName)}. Il link è valido per <strong>3 ore</strong> e può essere usato una sola volta.</p>
  <p lang="it" style="margin:24px 0;">
    <a href="${actionUrlEscaped}" style="background-color:#0b705c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Reimposta la password</a>
  </p>
  <p lang="it">Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
  <p lang="it"><a href="${actionUrlEscaped}" style="color:#0b705c;">${actionUrlEscaped}</a></p>
  <p lang="it">Se non hai richiesto la reimpostazione della password, puoi ignorare questa email — la tua password resta invariata.</p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
  <p style="color:#666666;font-size:13px;">${escapeHtml(siteName)} · ${escapeHtml(context.siteUrl)}</p>
</div>`;

  const text = [
    greeting(name),
    "",
    `We received a request to reset the password for your ${siteName} account. This link works for 3 hours and can be used only once.`,
    "",
    `Reset password: ${actionUrl}`,
    "",
    "If you did not request a password reset, you can ignore this email — your password stays unchanged.",
    "",
    "— Italiano —",
    "",
    greetingIt(name),
    `Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account ${siteName}. Il link è valido per 3 ore e può essere usato una sola volta.`,
    "",
    `Reimposta la password: ${actionUrl}`,
    "",
    "Se non hai richiesto la reimpostazione della password, puoi ignorare questa email — la tua password resta invariata.",
    "",
    `${siteName} · ${context.siteUrl}`,
  ].join("\n");

  return { subject, html, text };
}

/** Render whichever template `kind` selects. */
export function renderAuthEmail(kind: AuthEmailKind, context: AuthEmailContext): RenderedAuthEmail {
  return kind === "verify" ? renderVerificationEmail(context) : renderPasswordResetEmail(context);
}
