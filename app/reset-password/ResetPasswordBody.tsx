"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMessages } from "../lib/use-messages";
import { PublicNav } from "../components/PublicNav";
import { passwordRuleFailures } from "../lib/password-policy";

/**
 * /reset-password body (P1-3 Vera design).
 *
 * Reads the single-use token from ?token= and posts the new password to
 * POST /api/auth/reset-password/confirm, mapping the one-shot outcomes:
 *   200 → success (sessions revoked, email verified — the contributor can
 *         log in with the new password);
 *   400 → malformed/unknown token or weak password (generic body);
 *   410 → token already used or past its 3h TTL — dead link, request a new
 *         one from /forgot-password.
 * The page mirrors the server's anti-enumeration: 400 and 410 share the
 * same generic "invalid or expired" copy, exactly like the API.
 */

type ResetState =
  | { kind: "form" }
  | { kind: "success" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "error" };

export function ResetPasswordBody() {
  const t = useMessages().auth;
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<ResetState>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    // Full policy (CEO feedback 2026-08-03): length + uppercase + lowercase +
    // digit + special. Same rules as the server (./lib/password-policy).
    if (passwordRuleFailures(password).length > 0) {
      setError(t.passwordWeak);
      return;
    }
    if (password !== confirm) {
      setError(t.resetMismatch);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        setState({ kind: "success" });
        return;
      }
      if (response.status === 410) {
        setState({ kind: "expired" });
        return;
      }
      if (response.status === 400) {
        setState({ kind: "invalid" });
        return;
      }
      setState({ kind: "error" });
    } catch {
      setState({ kind: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="record-page">
      <PublicNav navLabel={t.navigation} homeLabel={t.homeAria} />

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {t.resetTitle}</p>
        <h1>{t.resetTitle}</h1>

        {!token ? (
          <>
            <p className="record-detail-summary">{t.resetInvalid}</p>
            <p className="auth-switch">
              <Link href="/forgot-password">{t.resetRequestAnother}</Link>
            </p>
          </>
        ) : null}

        {token && state.kind === "form" ? (
          <>
            <p className="record-detail-summary">{t.resetIntro}</p>
            <form className="auth-form" onSubmit={onSubmit} noValidate>
              <label className="auth-field">
                <span>{t.resetNewPassword}</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  aria-describedby="password-requirements"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); if (error) setError(null); }}
                />
                <div
                  className="password-requirements"
                  id="password-requirements"
                  data-invalid={error === t.passwordWeak ? "true" : undefined}
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
              <label className="auth-field">
                <span>{t.resetConfirmPassword}</span>
                <input
                  type="password"
                  name="confirm"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={confirm}
                  onChange={(event) => { setConfirm(event.target.value); if (error) setError(null); }}
                />
              </label>
              {error ? <p className="auth-error" role="alert">{error}</p> : null}
              <button className="button button-primary" type="submit" disabled={submitting}>
                {submitting ? t.loading : t.resetSubmit}
              </button>
            </form>
          </>
        ) : null}

        {token && state.kind === "success" ? (
          <>
            <h2>{t.resetSuccessTitle}</h2>
            <p className="record-detail-summary" role="status">{t.resetSuccessBody}</p>
            <p className="auth-switch">
              <Link className="button button-primary" href="/login">{t.resetGoToLogin}</Link>
            </p>
          </>
        ) : null}

        {token && state.kind === "invalid" ? (
          <>
            <p className="record-detail-summary">{t.resetInvalid}</p>
            <p className="auth-switch">
              <Link href="/forgot-password">{t.resetRequestAnother}</Link>
            </p>
          </>
        ) : null}

        {token && state.kind === "expired" ? (
          <>
            <p className="record-detail-summary">{t.resetExpired}</p>
            <p className="auth-switch">
              <Link href="/forgot-password">{t.resetRequestAnother}</Link>
            </p>
          </>
        ) : null}

        {token && state.kind === "error" ? (
          <>
            <p className="record-detail-summary">{t.errorGeneric}</p>
            <p className="auth-switch">
              <button className="text-button" type="button" onClick={() => setState({ kind: "form" })}>{t.resetSubmit}</button>
            </p>
          </>
        ) : null}
      </article>
    </main>
  );
}
