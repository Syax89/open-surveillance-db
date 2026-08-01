"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessages } from "../components/LocaleProvider";
import { SiteHeader } from "../components/SiteHeader";

export default function LoginPage() {
  const bundle = useMessages();
  const t = bundle.auth;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Per-field client validation state (finding QA-2026-08-01-2, closed in
  // F-QA t_7b716c97): aria-invalid tells assistive technology WHICH field
  // failed instead of relying on the browser's silent :invalid styling.
  // Server-side errors (401/429/403) keep the role="alert" announcement and
  // do not mark a specific field invalid — a rejected credential pair is a
  // combination problem, not a field-format one.
  const [fieldErrors, setFieldErrors] = useState<{ email?: boolean; password?: boolean }>({});

  function clientValidation() {
    const emailInvalid = !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const passwordInvalid = password.length < 10;
    const errors = {
      email: emailInvalid || undefined,
      password: passwordInvalid || undefined,
    };
    setFieldErrors(errors);
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
        router.push("/account");
        router.refresh();
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

  return (
    <main id="main-content" className="record-page">
      <SiteHeader navLabel={t.navigation} homeLabel={t.homeAria}>
        <div className="nav-links">
          <Link className="nav-action" href="/">{t.backHome}</Link>
        </div>
      </SiteHeader>

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {t.loginTitle}</p>
        <h1>{t.loginTitle}</h1>
        <p className="record-detail-summary">{t.anonymousNote}</p>

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
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? t.loading : t.login}
          </button>
        </form>

        <p className="auth-switch">
          {t.noAccount}{" "}
          <Link href="/register">{t.createOne}</Link>
        </p>
      </article>
    </main>
  );
}
