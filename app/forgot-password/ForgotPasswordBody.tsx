"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMessages } from "../lib/use-messages";
import { PublicNav } from "../components/PublicNav";

/**
 * /forgot-password body (P1-3 Vera design).
 *
 * The request endpoint is anti-enumeration by design (POST
 * /api/auth/reset-password/request always answers 200 {sent:true} for a
 * well-formed email, whether or not an account exists). The page mirrors
 * that contract exactly: after a valid submit it shows the SAME generic
 * confirmation, and rate-limit (429) maps to the generic error — the UI
 * never reveals whether the address is registered.
 */
export function ForgotPasswordBody() {
  const t = useMessages().auth;
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.errorInvalidCredentials);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.status === 429) {
        setError(t.errorGeneric);
        return;
      }
      // 200 {sent:true} for EVERY well-formed address (anti-enumeration):
      // the page shows the same confirmation regardless.
      setSent(true);
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
        <p className="eyebrow"><span /> {t.forgotTitle}</p>
        <h1>{t.forgotTitle}</h1>
        <p className="record-detail-summary">{t.forgotIntro}</p>

        {sent ? (
          <>
            <p className="record-detail-summary" role="status">{t.forgotSent}</p>
            <p className="auth-switch">
              <Link href="/login">{t.forgotBackToLogin}</Link>
            </p>
          </>
        ) : (
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <label className="auth-field">
              <span>{t.email}</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => { setEmail(event.target.value); if (error) setError(null); }}
              />
            </label>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="button button-primary" type="submit" disabled={submitting}>
              {submitting ? t.loading : t.forgotSubmit}
            </button>
          </form>
        )}

        <p className="auth-switch">
          <Link href="/login">{t.forgotBackToLogin}</Link>
        </p>
      </article>
    </main>
  );
}
