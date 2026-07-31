"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LocaleToggle, useMessages } from "../components/LocaleProvider";

export default function LoginPage() {
  const bundle = useMessages();
  const t = bundle.auth;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
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
      <nav className="nav-shell" aria-label={t.navigation}>
        <Link className="brand" href="/" aria-label={t.homeAria}>
          <span className="brand-mark" aria-hidden="true">◉</span>
          <span>OpenSurveillanceDB</span>
        </Link>
        <div className="nav-links">
          <Link className="nav-action" href="/">{t.backHome}</Link>
        </div>
        <LocaleToggle />
      </nav>

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {t.loginTitle}</p>
        <h1>{t.loginTitle}</h1>
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
            <span>{t.password}</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
