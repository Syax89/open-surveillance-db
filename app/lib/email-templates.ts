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
 * The bilingual copy is REGISTRY-DRIVEN: EMAIL_COPY is typed
 * `Record<Locale, EmailCopy>`, so adding a language to SUPPORTED_LOCALES
 * (app/lib/i18n/types.ts) forces a copy block for it here at `tsc` time,
 * and the renderers automatically ship that language's block (with its
 * BCP 47 `lang` attribute from the registry) in every message.
 *
 * This module is PURE: no Cloudflare bindings, no DB — it renders strings
 * and can run in plain Node (route tests import it via loadLibModule).
 */

import { SUPPORTED_LOCALES } from "./i18n/types";
import type { Locale } from "./i18n/types";

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

/**
 * Escape user-controlled text for safe inclusion in HTML email body.
 */
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

type Greeting = (displayName: string | null | undefined) => string;

/** One kind's localized copy block (intro/button/ignore, see EMAIL_COPY). */
type EmailBlockCopy = {
  /**
   * Intro paragraph. `{SITE}` is replaced with the (HTML-escaped) brand
   * name; the duration phrase may carry <strong> markup, which the
   * plain-text renderer strips (renderBilingualText).
   */
  intro: string;
  /** Action button / plain-text link label. */
  button: string;
  /** "You can ignore this email" closing line; `{SITE}` supported. */
  ignore: string;
};

/** Per-locale email copy. Every registered locale must have one (tsc). */
type EmailCopy = {
  greeting: Greeting;
  /** Self-name of the language shown as the block divider ("— Italiano —"). */
  divider: string;
  /** Shared "if the button does not work" fallback line. */
  buttonFallback: string;
  verify: EmailBlockCopy;
  reset: EmailBlockCopy;
};

/** Substitute the brand name placeholder in a copy string. */
function fillSiteName(copy: string, siteName: string): string {
  return copy.replaceAll("{SITE}", siteName);
}

/** Strip <strong>…</strong> markup for the plain-text body. */
function stripStrong(value: string): string {
  return value.replace(/<strong>(.*?)<\/strong>/g, "$1");
}

/**
 * Bilingual copy per registered locale (ADR 0007 — both languages ship in
 * every message). `Record<Locale, EmailCopy>` is the parity guarantee: a
 * new SUPPORTED_LOCALES entry fails `tsc` until a copy block exists here.
 */
const EMAIL_COPY: Record<Locale, EmailCopy> = {
  en: {
    greeting: (displayName) => (displayName ? `Hi ${displayName},` : "Hi,"),
    divider: "— English —",
    buttonFallback: "If the button does not work, copy and paste this link into your browser:",
    verify: {
      intro:
        "Please confirm that this email address belongs to you so you can start contributing to {SITE}. This link works for <strong>24 hours</strong> and can be used only once.",
      button: "Verify email address",
      ignore: "If you did not create an account on {SITE}, you can ignore this email.",
    },
    reset: {
      intro:
        "We received a request to reset the password for your {SITE} account. This link works for <strong>3 hours</strong> and can be used only once.",
      button: "Reset password",
      ignore: "If you did not request a password reset, you can ignore this email — your password stays unchanged.",
    },
  },
  it: {
    greeting: (displayName) => (displayName ? `Ciao ${displayName},` : "Ciao,"),
    divider: "— Italiano —",
    buttonFallback: "Se il pulsante non funziona, copia e incolla questo link nel browser:",
    verify: {
      intro:
        "Conferma che questo indirizzo email ti appartiene per iniziare a contribuire a {SITE}. Il link è valido per <strong>24 ore</strong> e può essere usato una sola volta.",
      button: "Verifica l'indirizzo email",
      ignore: "Se non hai creato un account su {SITE}, puoi ignorare questa email.",
    },
    reset: {
      intro:
        "Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account {SITE}. Il link è valido per <strong>3 ore</strong> e può essere usato una sola volta.",
      button: "Reimposta la password",
      ignore: "Se non hai richiesto la reimpostazione della password, puoi ignorare questa email — la tua password resta invariata.",
    },
  },
};

const BUTTON_STYLE = "background-color:#0b705c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;";
const TEXT_LINK_STYLE = "color:#0b705c;";
const HR_STYLE = "border:none;border-top:1px solid #e0e0e0;margin:24px 0;";
const DIVIDER_STYLE = "color:#444444;";

/** Render the HTML body for `kind`: every registered locale, pilot first. */
function renderBilingualHtml(kind: AuthEmailKind, context: AuthEmailContext): string {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  const actionUrl = context.actionUrl;
  const actionUrlEscaped = escapeHtml(actionUrl);
  const name = context.displayName ?? null;

  const block = (locale: (typeof SUPPORTED_LOCALES)[number], isPilot: boolean) => {
    const copy = EMAIL_COPY[locale.code];
    const lang = isPilot ? "" : ` lang="${locale.bcp47}"`;
    const lines = [
      `<p${lang}>${escapeHtml(copy.greeting(name))}</p>`,
      // Escape the substituted brand name only: the template's own <strong>
      // markup must survive (the plain-text renderer strips it later).
      `<p${lang}>${fillSiteName(copy[kind].intro, escapeHtml(siteName))}</p>`,
      `<p${lang} style="margin:24px 0;">\n    <a href="${actionUrlEscaped}" style="${BUTTON_STYLE}">${copy[kind].button}</a>\n  </p>`,
      `<p${lang}>${copy.buttonFallback}</p>`,
      `<p${lang}><a href="${actionUrlEscaped}" style="${TEXT_LINK_STYLE}">${actionUrlEscaped}</a></p>`,
      `<p${lang}>${fillSiteName(copy[kind].ignore, escapeHtml(siteName))}</p>`,
    ];
    if (isPilot) return lines.join("\n  ");
    return `<hr style="${HR_STYLE}" />\n  <p${lang} style="${DIVIDER_STYLE}">${copy.divider}</p>\n  ${lines.join("\n  ")}`;
  };

  const body = SUPPORTED_LOCALES.map((locale, index) => block(locale, index === 0)).join("\n  ");

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;">
  ${body}
  <hr style="${HR_STYLE}" />
  <p style="color:#666666;font-size:13px;">${escapeHtml(siteName)} · ${escapeHtml(context.siteUrl)}</p>
</div>`;
}

/** Render the plain-text body for `kind`: every registered locale, pilot first. */
function renderBilingualText(kind: AuthEmailKind, context: AuthEmailContext): string {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  const actionUrl = context.actionUrl;
  const name = context.displayName ?? null;

  const block = (locale: (typeof SUPPORTED_LOCALES)[number], isPilot: boolean) => {
    const copy = EMAIL_COPY[locale.code];
    const lines = [
      copy.greeting(name),
      "",
      stripStrong(fillSiteName(copy[kind].intro, siteName)),
      "",
      `${copy[kind].button}: ${actionUrl}`,
      "",
      fillSiteName(copy[kind].ignore, siteName),
      "",
    ];
    return isPilot ? lines : [copy.divider, "", ...lines];
  };

  const parts = SUPPORTED_LOCALES.map((locale, index) => block(locale, index === 0)).flat();
  parts.push(`${siteName} · ${context.siteUrl}`);
  return parts.join("\n");
}

/**
 * Render the email-address verification message. The action link expires
 * after 24h (ADR 0020: single-use, SHA-256-hashed token) — the copy says
 * so without hard-coding a number the route layer owns.
 */
export function renderVerificationEmail(context: AuthEmailContext): RenderedAuthEmail {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  return {
    subject: `Verify your email · ${siteName}`,
    html: renderBilingualHtml("verify", context),
    text: renderBilingualText("verify", context),
  };
}

/**
 * Render the password-reset message. Same mailer, same single-use token
 * discipline as verification (ADR 0020 decision 2), but the reset link
 * dies after 3h (RESET_TOKEN_TTL_MS) — shorter window than the 24h
 * verification link, because a stolen reset link is the higher-stakes
 * path. The copy says so without hard-coding a number the route layer
 * owns.
 */
export function renderPasswordResetEmail(context: AuthEmailContext): RenderedAuthEmail {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  return {
    subject: `Reset your password · ${siteName}`,
    html: renderBilingualHtml("reset", context),
    text: renderBilingualText("reset", context),
  };
}

/** Render whichever template `kind` selects. */
export function renderAuthEmail(kind: AuthEmailKind, context: AuthEmailContext): RenderedAuthEmail {
  return kind === "verify" ? renderVerificationEmail(context) : renderPasswordResetEmail(context);
}
