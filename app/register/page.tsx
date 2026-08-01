"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessages } from "../components/LocaleProvider";
import { SiteHeader } from "../components/SiteHeader";

export default function RegisterPage() {
  const bundle = useMessages();
  const t = bundle.auth;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
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
      <SiteHeader navLabel={t.navigation} homeLabel={t.homeAria}>
        <div className="nav-links">
          <Link className="nav-action" href="/">{t.backHome}</Link>
        </div>
      </SiteHeader>

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {t.registerTitle}</p>
        <h1>{t.registerTitle}</h1>
        <p className="record-detail-summary">{t.anonymousNote}</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>{t.email}</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <small>{t.passwordHint}</small>
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
          <p className="legal-microcopy" id="register-art13-note">{t.registerArt13} <Link href="/privacy">{t.privacyNotice}</Link>. {t.registerArt13Rights} <a href="mailto:privacy@opensurveillancedb">{t.privacyContact}</a>.</p>
        </form>

        <p className="auth-switch">
          {t.haveAccount}{" "}
          <Link href="/login">{t.signIn}</Link>
        </p>
      </article>
    </main>
  );
}
