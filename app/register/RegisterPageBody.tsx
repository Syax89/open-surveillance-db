"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/use-messages";
import { PublicNav } from "../components/PublicNav";
import { passwordRuleFailures } from "../lib/password-policy";

export function RegisterPageBody() {
  const bundle = useMessages();
  const t = bundle.auth;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Per-field client validation state (finding QA-2026-08-01-2, closed in
  // F-QA t_7b716c97): aria-invalid marks the exact failing field. Server
  // errors keep the role="alert" announcement without blaming one field.
  const [fieldErrors, setFieldErrors] = useState<{
    email?: boolean;
    displayName?: boolean;
    password?: boolean;
  }>({});

  function clientValidation() {
    const emailInvalid = !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const displayNameInvalid = displayName.trim().length > 0 && displayName.trim().length < 2;
    // Full policy (CEO feedback 2026-08-03): length + uppercase + lowercase +
    // digit + special. Same rules as the server (./lib/password-policy).
    const passwordInvalid = passwordRuleFailures(password).length > 0;
    const errors = {
      email: emailInvalid || undefined,
      displayName: displayNameInvalid || undefined,
      password: passwordInvalid || undefined,
    };
    setFieldErrors(errors);
    return !emailInvalid && !displayNameInvalid && !passwordInvalid;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!clientValidation()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName.trim() || undefined,
        }),
      });
      if (response.ok) {
        router.push("/account");
        router.refresh();
        return;
      }
      if (response.status === 409) setError(t.errorEmailTaken);
      else if (response.status === 429) setError(t.errorGeneric);
      else if (response.status === 403) setError(t.errorCrossOrigin);
      else setError(t.errorGeneric);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="record-page">
      <PublicNav navLabel={t.navigation} homeLabel={t.homeAria} />

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {t.registerTitle}</p>
        <h1>{t.registerTitle}</h1>
        <p className="record-detail-summary">{t.anonymousNote}</p>

        {/*
          Social sign-up (CEO 2026-08-07): same OIDC panel as the login
          page (same routes, same disclosure, same classes). When the
          provider returns a verified email that matches NO existing
          account, the OIDC callback creates the contributor on the spot
          (createOidcContributor) — this IS the Google/GitHub sign-up
          path. Email conflicts still redirect to /login?merge=… for the
          password proof (shared backend, unchanged).
        */}
        <div className="oidc-panel">
          <div className="oidc-buttons">
            <a className="button detail-outline oidc-button" href={`/api/auth/oidc/github/start?redirect_to=${encodeURIComponent("/account")}`}>
              {t.oidcGithub}
            </a>
            <a className="button detail-outline oidc-button" href={`/api/auth/oidc/google/start?redirect_to=${encodeURIComponent("/account")}`}>
              {t.oidcGoogle}
            </a>
          </div>
          <p className="oidc-disclosure">
            {t.oidcDisclosure}{" "}
            <Link href="/privacy">{t.privacyNotice}</Link>.
          </p>
        </div>

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
            <span>{t.displayName}</span>
            <input
              type="text"
              name="displayName"
              autoComplete="nickname"
              minLength={2}
              maxLength={60}
              aria-invalid={fieldErrors.displayName || undefined}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (fieldErrors.displayName) setFieldErrors((f) => ({ ...f, displayName: undefined }));
              }}
            />
          </label>
          <label className="auth-field">
            <span>{t.password}</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={10}
              aria-invalid={fieldErrors.password || undefined}
              aria-describedby="password-requirements"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
              }}
            />
            <div
              className="password-requirements"
              id="password-requirements"
              data-invalid={fieldErrors.password || undefined}
            >
              <span className="password-requirements-label">{t.passwordRequirements}</span>
              <ul className="password-requirements-list">
                <li>{t.passwordRuleLength}</li>
                <li>{t.passwordRuleUppercase}</li>
                <li>{t.passwordRuleLowercase}</li>
                <li>{t.passwordRuleDigit}</li>
                <li>{t.passwordRuleSpecial}</li>
              </ul>
            </div>
          </label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? t.loading : t.register}
          </button>
          <p className="auth-legal-links">
            <Link href="/privacy">{t.privacyNotice}</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/termini">{t.termsOfUse}</Link>
          </p>
          <p className="legal-microcopy" id="register-art13-note">{t.registerArt13} <Link href="/privacy">{t.privacyNotice}</Link>. {t.registerArt13Rights} <a href="mailto:privacy@opensurveillancedb.org">{t.privacyContact}</a>.</p>
        </form>

        <p className="auth-switch">
          {t.haveAccount}{" "}
          <Link href="/login">{t.signIn}</Link>
        </p>
      </article>
    </main>
  );
}
