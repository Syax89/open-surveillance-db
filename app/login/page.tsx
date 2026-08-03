"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMessages } from "../components/LocaleProvider";
import { SiteHeader } from "../components/SiteHeader";
import { browserSupportsWebAuthn, getCredential } from "../lib/webauthn-client";

/**
 * /login — multi-method sign-in (Fase E2, design Vera).
 *
 * Three methods, selected with a radio group (the panels render one at a
 * time — only the visible controls are in the tab order):
 *  1. Email + password — the original form, unchanged behaviour.
 *  2. Passkey — WebAuthn ceremony client-side: POST /login/begin (optional
 *     email narrows the ceremony to that account, anti-enumeration server
 *     side), navigator.credentials.get(), POST /login/complete. A cancelled
 *     ceremony (NotAllowedError) is a silent abort, not an error.
 *  3. Social sign-in (OIDC, Fase D / ADR 0020 decision 4) — GitHub and
 *     Google are plain GET navigations to the /start routes (302 to the
 *     provider). The disclosure note below the buttons IS the privacy
 *     requirement: the provider tracking surface and the EU-US DPF
 *     transfer are declared on the login page (AUTH_OPTIONS.md §4a).
 *
 * The OIDC callback can land back here with two query markers:
 *  - ?merge=<token>  — the provider's VERIFIED email collides with an
 *    existing password account; the user proves ownership with its email +
 *    password (POST /api/auth/oidc/merge, single-use token, lockout-
 *    protected). 410 (expired/used token) clears the merge mode.
 *  - ?oidc_error=1   — provider exchange failed or the user cancelled.
 *
 * useSearchParams requires a Suspense boundary (same pattern as the tool
 * routes); the page is fully client-rendered so the fallback is the SSR
 * loading note.
 */

type Method = "password" | "passkey" | "social";

/** Same-site redirect target from ?returnTo= (login wall return, P1-2). */
function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function LoginPageBody() {
  const bundle = useMessages();
  const t = bundle.auth;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mergeToken, setMergeToken] = useState<string | null>(() => searchParams.get("merge"));
  const [oidcError] = useState<boolean>(() => searchParams.get("oidc_error") === "1");
  const [method, setMethod] = useState<Method>("password");
  // Login-wall return (P1-2 Vera design): /login?returnTo=/segnala (or
  // /correggi) lands the contributor back on the tool after a successful
  // sign-in instead of always dumping them on /account.
  const [returnTo] = useState<string | null>(() => safeReturnTo(searchParams.get("returnTo")));

  function afterLogin() {
    router.push(returnTo ?? "/account");
    router.refresh();
  }

  // Email + password panel state.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: boolean; password?: boolean }>({});

  // Passkey panel state.
  const [passkeyEmail, setPasskeyEmail] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // Manual OIDC merge (email-conflict proof) state.
  const [mergeEmail, setMergeEmail] = useState("");
  const [mergePassword, setMergePassword] = useState("");
  const [mergeFieldErrors, setMergeFieldErrors] = useState<{ email?: boolean; password?: boolean }>({});

  const mergeMode = mergeToken !== null;

  function validateCredentials(emailValue: string, passwordValue: string) {
    const emailInvalid = !emailValue.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim());
    const passwordInvalid = passwordValue.length < 10;
    return { emailInvalid, passwordInvalid };
  }

  function clientValidation() {
    const { emailInvalid, passwordInvalid } = validateCredentials(email, password);
    setFieldErrors({ email: emailInvalid || undefined, password: passwordInvalid || undefined });
    return !emailInvalid && !passwordInvalid;
  }

  function mergeClientValidation() {
    const { emailInvalid, passwordInvalid } = validateCredentials(mergeEmail, mergePassword);
    setMergeFieldErrors({ email: emailInvalid || undefined, password: passwordInvalid || undefined });
    return !emailInvalid && !passwordInvalid;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!clientValidation()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        afterLogin();
        return;
      }
      if (response.status === 429) setError(t.errorGeneric);
      else if (response.status === 403) setError(t.errorCrossOrigin);
      else setError(t.errorInvalidCredentials);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasskeyLogin(event: FormEvent) {
    event.preventDefault();
    setPasskeyError(null);
    if (!browserSupportsWebAuthn()) {
      setPasskeyError(t.passkeyUnsupported);
      return;
    }
    setPasskeyBusy(true);
    try {
      const trimmedEmail = passkeyEmail.trim();
      const beginResponse = await fetch("/api/auth/passkey/login/begin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trimmedEmail ? { email: trimmedEmail } : {}),
      });
      if (beginResponse.status === 429) {
        setPasskeyError(t.errorGeneric);
        return;
      }
      if (beginResponse.status === 403) {
        setPasskeyError(t.errorCrossOrigin);
        return;
      }
      if (!beginResponse.ok) {
        setPasskeyError(t.passkeyErrorBegin);
        return;
      }
      const { options } = await beginResponse.json() as { options: Parameters<typeof getCredential>[0] };

      // The ceremony itself: throws NotAllowedError when the user cancels
      // the device prompt — a silent abort, never an error message.
      const credential = await getCredential(options);

      const completeResponse = await fetch("/api/auth/passkey/login/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge: options.challenge, response: credential }),
      });
      if (completeResponse.ok) {
        afterLogin();
        return;
      }
      if (completeResponse.status === 401) setPasskeyError(t.passkeyErrorFailed);
      else if (completeResponse.status === 429) setPasskeyError(t.errorGeneric);
      else if (completeResponse.status === 403) setPasskeyError(t.errorCrossOrigin);
      else setPasskeyError(t.errorGeneric);
    } catch (reason) {
      if (reason instanceof Error && reason.name === "NotAllowedError") return;
      setPasskeyError(t.errorGeneric);
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function onSubmitMerge(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!mergeToken || !mergeClientValidation()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/oidc/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: mergeToken, email: mergeEmail, password: mergePassword }),
      });
      if (response.ok) {
        afterLogin();
        return;
      }
      if (response.status === 410) {
        // The single-use token expired or was already consumed: drop the
        // merge mode and fall back to the normal login, announcing why.
        // Also strip ?merge= from the address bar (router.replace, no
        // scroll jump) so the stale token stops being re-submittable or
        // shareable in the URL — ada review PR #242.
        setMergeToken(null);
        setError(t.mergeErrorExpired);
        const cleanParams = new URLSearchParams(searchParams.toString());
        cleanParams.delete("merge");
        const cleanQuery = cleanParams.toString();
        router.replace(cleanQuery ? `/login?${cleanQuery}` : "/login", { scroll: false });
      } else if (response.status === 401) {
        setError(t.errorInvalidCredentials);
      } else if (response.status === 429) {
        setError(t.errorGeneric);
      } else if (response.status === 403) {
        setError(t.errorCrossOrigin);
      } else {
        setError(t.mergeErrorGeneric);
      }
    } catch {
      setError(t.mergeErrorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  const methods: { key: Method; label: string }[] = [
    { key: "password", label: t.methodPassword },
    { key: "passkey", label: t.methodPasskey },
    { key: "social", label: t.methodSocial },
  ];

  return (
    <main id="main-content" className="record-page">
      <SiteHeader navLabel={t.navigation} homeLabel={t.homeAria}>
        <div className="nav-links">
          <Link className="nav-action" href="/">{t.backHome}</Link>
        </div>
      </SiteHeader>

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {mergeMode ? t.mergeTitle : t.loginTitle}</p>
        <h1>{mergeMode ? t.mergeTitle : t.loginTitle}</h1>

        {oidcError ? <p className="auth-error" role="alert">{t.oidcErrorGeneric}</p> : null}

        {mergeMode ? (
          <>
            <p className="record-detail-summary">{t.mergeIntro}</p>
            <form className="auth-form" onSubmit={onSubmitMerge} noValidate>
              <label className="auth-field">
                <span>{t.email}</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  aria-invalid={mergeFieldErrors.email || undefined}
                  value={mergeEmail}
                  onChange={(event) => {
                    setMergeEmail(event.target.value);
                    if (mergeFieldErrors.email) setMergeFieldErrors((f) => ({ ...f, email: undefined }));
                  }}
                />
              </label>
              <label className="auth-field">
                <span>{t.password}</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  minLength={10}
                  aria-invalid={mergeFieldErrors.password || undefined}
                  value={mergePassword}
                  onChange={(event) => {
                    setMergePassword(event.target.value);
                    if (mergeFieldErrors.password) setMergeFieldErrors((f) => ({ ...f, password: undefined }));
                  }}
                />
              </label>
              {error ? <p className="auth-error" role="alert">{error}</p> : null}
              <button className="button button-primary" type="submit" disabled={submitting}>
                {submitting ? t.loading : t.mergeSubmit}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="record-detail-summary">{t.anonymousNote}</p>

            <div className="auth-methods" role="radiogroup" aria-label={t.methodSelectorLabel}>
              {methods.map((item) => (
                <div className="auth-method-option" key={item.key}>
                  <input
                    type="radio"
                    id={`auth-method-${item.key}`}
                    name="auth-method"
                    value={item.key}
                    checked={method === item.key}
                    onChange={() => setMethod(item.key)}
                  />
                  <label htmlFor={`auth-method-${item.key}`}>{item.label}</label>
                </div>
              ))}
            </div>

            {method === "password" ? (
              <form className="auth-form" onSubmit={onSubmit} noValidate>
                <label className="auth-field">
                  <span>{t.email}</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    aria-invalid={fieldErrors.email || undefined}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                    }}
                  />
                </label>
                <label className="auth-field">
                  <span>{t.password}</span>
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    minLength={10}
                    aria-invalid={fieldErrors.password || undefined}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                    }}
                  />
                </label>
                <p className="auth-forgot">
                  <Link href="/forgot-password">{t.forgotPassword}</Link>
                </p>
                {/* Static verification note (t_6dc1c96f, CEO feedback
                    2026-08-03): login is blocked until the email is verified
                    and the API answers the same generic 401 for every
                    failure (anti-enumeration). This copy is shown to
                    everyone, so it explains in advance why a correct
                    password can be rejected right after registering —
                    without ever revealing account existence. */}
                <p className="record-detail-summary">{t.loginVerifyHint}</p>
                {error ? <p className="auth-error" role="alert">{error}</p> : null}
                <button className="button button-primary" type="submit" disabled={submitting}>
                  {submitting ? t.loading : t.login}
                </button>
                {/* Per-method risk disclosure (P1-4 Vera design — the risk
                    matrix is per-method, ADR 0020 d.6): the password method
                    declares its PII + phishing surface, exactly like the
                    passkey and OIDC panels below. */}
                <p className="oidc-disclosure auth-method-disclosure">
                  <span className="sr-only">{t.methodDisclosureLabel}: </span>
                  {t.passwordDisclosure}
                </p>
              </form>
            ) : null}

            {method === "passkey" ? (
              <form className="auth-form" onSubmit={onPasskeyLogin} noValidate>
                <label className="auth-field">
                  <span>{t.passkeyEmailOptional}</span>
                  <input
                    type="email"
                    name="passkeyEmail"
                    autoComplete="email webauthn"
                    value={passkeyEmail}
                    onChange={(event) => setPasskeyEmail(event.target.value)}
                  />
                  <small>{t.passkeyEmailHint}</small>
                </label>
                {passkeyError ? <p className="auth-error" role="alert">{passkeyError}</p> : null}
                <button className="button button-primary" type="submit" disabled={passkeyBusy}>
                  {passkeyBusy ? t.loading : t.passkeyLogin}
                </button>
                {/* P1-4: honest per-method disclosure. The old hint claimed
                    "Nothing leaves your device" — false for synced passkeys
                    (vendor cloud sees usage); the disclosure below replaces
                    that claim. */}
                <p className="oidc-disclosure auth-method-disclosure">
                  <span className="sr-only">{t.methodDisclosureLabel}: </span>
                  {t.passkeyDisclosure}
                </p>
              </form>
            ) : null}

            {method === "social" ? (
              <div className="oidc-panel">
                <div className="oidc-buttons">
                  <a className="button detail-outline oidc-button" href={`/api/auth/oidc/github/start?redirect_to=${encodeURIComponent(returnTo ?? "/account")}`}>
                    {t.oidcGithub}
                  </a>
                  <a className="button detail-outline oidc-button" href={`/api/auth/oidc/google/start?redirect_to=${encodeURIComponent(returnTo ?? "/account")}`}>
                    {t.oidcGoogle}
                  </a>
                </div>
                <p className="oidc-disclosure">
                  {t.oidcDisclosure}{" "}
                  <Link href="/privacy">{t.privacyNotice}</Link>.
                </p>
              </div>
            ) : null}

            <p className="auth-switch">
              {t.noAccount}{" "}
              <Link href="/register">{t.createOne}</Link>
            </p>
          </>
        )}
      </article>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="loading-note">Loading…</p>}>
      <LoginPageBody />
    </Suspense>
  );
}
