/**
 * Transactional email templates for the auth flows (AUTH MULTI-METODO
 * Fase A2, t_4c398006 — ADR 0020 decision 2).
 *
 * Three templates, each rendered in BOTH HTML and plain text:
 *   - verification   (email address verification after register)
 *   - password reset (Fase B)
 *   - account exists (registration attempted with an address that already
 *     has an account — the register endpoint answers the same for new and
 *     existing addresses, so the owner learns about it here, privately)
 *
 * Zero-tracking contract (PRIVACY_AND_SAFETY.md, PROCESSOR_REGISTER.md PR1):
 *   - NO <img> tags: no tracking pixels, no remote images, no beacons;
 *   - NO external links beyond the action URL(s) on the site itself (the
 *     account-exists notice carries two: sign in and reset password) — no
 *     analytics, no social, no unsubscribe-tracking endpoints;
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

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./i18n/types";
import type { Locale } from "./i18n/types";
import { fr as frEmail } from "./i18n/locales/fr/email";
import { de as deEmail } from "./i18n/locales/de/email";
import { es as esEmail } from "./i18n/locales/es/email";
import { pt as ptEmail } from "./i18n/locales/pt/email";

/** Emails that carry a single-use token (verification / password reset). */
export type TokenEmailKind = "verify" | "reset";

/**
 * Every auth email kind. `account_exists` carries NO token: it is the
 * notice sent to the owner of an address someone tried to register again.
 */
export type AuthEmailKind = TokenEmailKind | "account_exists";

export type AuthEmailContext = {
  /**
   * The full action URL (verification or reset link with the raw token; the
   * sign-in page for the account-exists notice).
   */
  actionUrl: string;
  /** Second action link (account-exists notice only: the forgot-password page). */
  secondaryActionUrl?: string;
  /** Optional public display name; escaped in HTML output. */
  displayName?: string | null;
  /** Brand name shown in header/footer, e.g. "OpenSurveillanceDB". */
  siteName: string;
  /** Public site URL shown as a plain-text fallback (never a tracking link). */
  siteUrl: string;
  /**
   * The requester's interface language (their locale cookie at the time of
   * the request), when they chose one. The message ships English (pilot)
   * plus this language; without it, English + Italian as before. Six
   * languages in every email would bury the action link.
   */
  locale?: Locale | null;
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
 * the links land on the client pages (P1-1/P1-3 design review) — /verify-email
 * and /reset-password — which consume the API client-side. (Previously the
 * verify link pointed at GET /api/auth/verify-email, i.e. raw JSON in the
 * browser, and the reset link at a route that does not exist.)
 */
export function buildAuthActionUrl(kind: TokenEmailKind, rawToken: string, verifyBaseUrl: string): string {
  const base = verifyBaseUrl.replace(/\/+$/, "");
  const path = kind === "verify" ? "/verify-email" : "/reset-password";
  return `${base}${path}?token=${encodeURIComponent(rawToken)}`;
}

/**
 * The two plain links of the account-exists notice: the sign-in page and
 * the forgot-password page that starts a reset (no token, no query string —
 * nothing to track; /reset-password itself needs a reset token).
 */
export function buildAccountExistsUrls(verifyBaseUrl: string): { actionUrl: string; secondaryActionUrl: string } {
  const base = verifyBaseUrl.replace(/\/+$/, "");
  return { actionUrl: `${base}/login`, secondaryActionUrl: `${base}/forgot-password` };
}

export type Greeting = (displayName: string | null | undefined) => string;

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

/** The account-exists notice: two actions (sign in, reset password). */
type EmailTwoActionCopy = EmailBlockCopy & {
  /** Second button / plain-text link label (reset password). */
  secondaryButton: string;
};

/** Per-locale email copy. Every registered locale must have one (tsc). */
export type EmailCopy = {
  greeting: Greeting;
  /** Self-name of the language shown as the block divider ("— Italiano —"). */
  divider: string;
  /** Shared "if the button does not work" fallback line. */
  buttonFallback: string;
  verify: EmailBlockCopy;
  reset: EmailBlockCopy;
  /** Notice for a registration attempt on an address that has an account. */
  accountExists: EmailTwoActionCopy;
};

/** The copy block for `kind`. */
function blockCopy(copy: EmailCopy, kind: AuthEmailKind): EmailBlockCopy & { secondaryButton?: string } {
  return kind === "account_exists" ? copy.accountExists : copy[kind];
}

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
    accountExists: {
      intro:
        "Someone tried to create an account on {SITE} with this email address. If it was you, you already have an account: sign in, or reset your password if you have forgotten it.",
      button: "Sign in",
      secondaryButton: "Reset password",
      ignore: "If it wasn't you, you can ignore this email — nothing has changed.",
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
    accountExists: {
      intro:
        "Qualcuno ha provato a creare un account su {SITE} con questo indirizzo email. Se eri tu, hai già un account: accedi, oppure reimposta la password se l'hai dimenticata.",
      button: "Accedi",
      secondaryButton: "Reimposta la password",
      ignore: "Se non eri tu, puoi ignorare questa email — non è cambiato nulla.",
    },
  },
  fr: frEmail,
  de: deEmail,
  es: esEmail,
  pt: ptEmail,
};

const BUTTON_STYLE = "background-color:#0b705c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;";
const SECONDARY_BUTTON_STYLE = "background-color:#ffffff;color:#0b705c;text-decoration:none;padding:11px 19px;border:1px solid #0b705c;border-radius:6px;font-weight:bold;margin-left:8px;";
const TEXT_LINK_STYLE = "color:#0b705c;";
const HR_STYLE = "border:none;border-top:1px solid #e0e0e0;margin:24px 0;";
const DIVIDER_STYLE = "color:#444444;";

/** The locales a message ships, pilot first (see AuthEmailContext.locale). */
function messageLocales(context: AuthEmailContext): (typeof SUPPORTED_LOCALES)[number][] {
  const wanted: Locale[] = context.locale
    ? [DEFAULT_LOCALE, context.locale]
    : [DEFAULT_LOCALE, "it"];
  return SUPPORTED_LOCALES.filter(({ code }) => wanted.includes(code));
}

/** Render the HTML body for `kind`: pilot first, then the requester's language. */
function renderBilingualHtml(kind: AuthEmailKind, context: AuthEmailContext): string {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  const actionUrl = context.actionUrl;
  const actionUrlEscaped = escapeHtml(actionUrl);
  const secondaryUrlEscaped = context.secondaryActionUrl ? escapeHtml(context.secondaryActionUrl) : null;
  const name = context.displayName ?? null;

  const block = (locale: (typeof SUPPORTED_LOCALES)[number], isPilot: boolean) => {
    const copy = EMAIL_COPY[locale.code];
    const kindCopy = blockCopy(copy, kind);
    const lang = isPilot ? "" : ` lang="${locale.bcp47}"`;
    const secondary = secondaryUrlEscaped && kindCopy.secondaryButton ? secondaryUrlEscaped : null;
    const secondaryButton = secondary
      ? `\n    <a href="${secondary}" style="${SECONDARY_BUTTON_STYLE}">${kindCopy.secondaryButton}</a>`
      : "";
    const secondaryFallback = secondary
      ? [`<p${lang}><a href="${secondary}" style="${TEXT_LINK_STYLE}">${secondary}</a></p>`]
      : [];
    const lines = [
      `<p${lang}>${escapeHtml(copy.greeting(name))}</p>`,
      // Escape the substituted brand name only: the template's own <strong>
      // markup must survive (the plain-text renderer strips it later).
      `<p${lang}>${fillSiteName(kindCopy.intro, escapeHtml(siteName))}</p>`,
      `<p${lang} style="margin:24px 0;">\n    <a href="${actionUrlEscaped}" style="${BUTTON_STYLE}">${kindCopy.button}</a>${secondaryButton}\n  </p>`,
      `<p${lang}>${copy.buttonFallback}</p>`,
      `<p${lang}><a href="${actionUrlEscaped}" style="${TEXT_LINK_STYLE}">${actionUrlEscaped}</a></p>`,
      ...secondaryFallback,
      `<p${lang}>${fillSiteName(kindCopy.ignore, escapeHtml(siteName))}</p>`,
    ];
    if (isPilot) return lines.join("\n  ");
    return `<hr style="${HR_STYLE}" />\n  <p${lang} style="${DIVIDER_STYLE}">${copy.divider}</p>\n  ${lines.join("\n  ")}`;
  };

  const body = messageLocales(context).map((locale, index) => block(locale, index === 0)).join("\n  ");

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;">
  ${body}
  <hr style="${HR_STYLE}" />
  <p style="color:#666666;font-size:13px;">${escapeHtml(siteName)} · ${escapeHtml(context.siteUrl)}</p>
</div>`;
}

/** Render the plain-text body for `kind`: pilot first, then the requester's language. */
function renderBilingualText(kind: AuthEmailKind, context: AuthEmailContext): string {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  const actionUrl = context.actionUrl;
  const name = context.displayName ?? null;

  const block = (locale: (typeof SUPPORTED_LOCALES)[number], isPilot: boolean) => {
    const copy = EMAIL_COPY[locale.code];
    const kindCopy = blockCopy(copy, kind);
    const secondary =
      context.secondaryActionUrl && kindCopy.secondaryButton
        ? [`${kindCopy.secondaryButton}: ${context.secondaryActionUrl}`]
        : [];
    const lines = [
      copy.greeting(name),
      "",
      stripStrong(fillSiteName(kindCopy.intro, siteName)),
      "",
      `${kindCopy.button}: ${actionUrl}`,
      ...secondary,
      "",
      fillSiteName(kindCopy.ignore, siteName),
      "",
    ];
    return isPilot ? lines : [copy.divider, "", ...lines];
  };

  const parts = messageLocales(context).map((locale, index) => block(locale, index === 0)).flat();
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

/**
 * Render the account-exists notice: someone submitted the registration form
 * with an address that already has an account. The register endpoint
 * answers exactly the same for new and existing addresses (no account
 * enumeration), so this private message is the only place the outcome is
 * told — and only to the mailbox owner. Two plain links (sign in, reset
 * password: `buildAccountExistsUrls`), no token.
 */
export function renderAccountExistsEmail(context: AuthEmailContext): RenderedAuthEmail {
  const siteName = context.siteName || DEFAULT_SITE_NAME;
  return {
    subject: `Sign-up attempt with your email · ${siteName}`,
    html: renderBilingualHtml("account_exists", context),
    text: renderBilingualText("account_exists", context),
  };
}

/** Render whichever template `kind` selects. */
export function renderAuthEmail(kind: AuthEmailKind, context: AuthEmailContext): RenderedAuthEmail {
  if (kind === "account_exists") return renderAccountExistsEmail(context);
  return kind === "verify" ? renderVerificationEmail(context) : renderPasswordResetEmail(context);
}
