"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LocaleToggle, useMessages } from "../components/LocaleProvider";

type Contributor = {
  id: number;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

type Submission = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
};

/** Read the script-readable CSRF cookie so mutations can echo it back. */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("osdb_csrf="));
  return match ? decodeURIComponent(match.slice("osdb_csrf=".length)) : null;
}

export default function AccountPage() {
  const bundle = useMessages();
  const t = bundle.auth;
  const statuses = bundle.status;
  const router = useRouter();
  const [contributor, setContributor] = useState<Contributor | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/auth/me", { signal: controller.signal }),
      fetch("/api/auth/me/submissions", { signal: controller.signal }),
    ])
      .then(async ([profileResponse, submissionsResponse]) => {
        if (profileResponse.status === 401) {
          setContributor(null);
          setSubmissions([]);
          return;
        }
        if (!profileResponse.ok) throw new Error(t.errorGeneric);
        const profile = await profileResponse.json();
        setContributor(profile.contributor);
        if (submissionsResponse.ok) {
          const body = await submissionsResponse.json();
          setSubmissions(body.submissions);
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError(t.errorGeneric);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [t.errorGeneric]);

  useEffect(() => load(), [load]);

  async function onLogout() {
    const csrfToken = readCsrfToken();
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.ok) {
        setLoggedOut(true);
        setContributor(null);
        setSubmissions([]);
        router.refresh();
      } else if (response.status === 403) {
        setError(t.errorCrossOrigin);
      } else {
        setError(t.errorGeneric);
      }
    } catch {
      setError(t.errorGeneric);
    }
  }

  async function onDeleteAccount() {
    if (!window.confirm(`${t.deleteAccountConfirm}\n\n${t.deleteAccountConfirmBody}`)) return;
    const csrfToken = readCsrfToken();
    setError(null);
    setDeleting(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.ok) {
        setDeleted(true);
        setContributor(null);
        setSubmissions([]);
        router.refresh();
      } else if (response.status === 403) {
        setError(t.errorCrossOrigin);
      } else {
        setError(t.errorDeleteAccount);
      }
    } catch {
      setError(t.errorDeleteAccount);
    } finally {
      setDeleting(false);
    }
  }

  const memberSince = contributor
    ? new Date(contributor.createdAt).toLocaleDateString()
    : "";

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
        <p className="eyebrow"><span /> {t.accountTitle}</p>
        <h1>{t.accountTitle}</h1>

        {loading ? <p>{t.loading}</p> : null}

        {!loading && deleted ? (
          <>
            <h2>{t.accountDeletedTitle}</h2>
            <p className="record-detail-summary">{t.accountDeletedBody}</p>
          </>
        ) : null}

        {!loading && loggedOut ? (
          <>
            <h2>{t.loggedOutTitle}</h2>
            <p className="record-detail-summary">{t.loggedOutBody}</p>
            <p className="auth-switch">
              <Link href="/login">{t.login}</Link>
            </p>
          </>
        ) : null}

        {!loading && !loggedOut && !contributor ? (
          <>
            <h2>{t.notAuthenticatedTitle}</h2>
            <p className="record-detail-summary">{t.notAuthenticatedBody}</p>
            <p className="auth-switch">
              <Link className="button button-primary" href="/login">{t.login}</Link>{" "}
              <Link className="button detail-outline" href="/register">{t.register}</Link>
            </p>
          </>
        ) : null}

        {!loading && !loggedOut && contributor ? (
          <>
            <section aria-labelledby="profile-title">
              <h2 id="profile-title">{t.profileSection}</h2>
              <dl className="record-detail-list">
                <dt>{t.emailLabel}</dt>
                <dd>{contributor.email}</dd>
                <dt>{t.displayNameLabel}</dt>
                <dd>{contributor.displayName ?? t.anonymous}</dd>
                <dt>{t.memberSince}</dt>
                <dd>{memberSince}</dd>
              </dl>
            </section>

            <section aria-labelledby="submissions-title">
              <h2 id="submissions-title">{t.submissionsSection}</h2>
              {submissions.length === 0 ? (
                <p>{t.noSubmissions}</p>
              ) : (
                <ul className="auth-submissions">
                  {submissions.map((submission) => (
                    <li key={submission.id}>
                      <Link href={`/records/${submission.id}`}>{submission.title}</Link>
                      <span className={`status-dot ${submission.status}`} aria-hidden="true" />
                      <span>{statuses[submission.status as keyof typeof statuses] ?? t.submissionStatus}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="button detail-outline" type="button" onClick={() => void onLogout()}>
              {t.logout}
            </button>

            <section aria-labelledby="delete-account-title" className="auth-danger-zone">
              <h2 id="delete-account-title">{t.deleteAccountSection}</h2>
              <p className="record-detail-summary">{t.deleteAccountHint}</p>
              <button
                className="button detail-outline"
                type="button"
                onClick={() => void onDeleteAccount()}
                disabled={deleting}
              >
                {deleting ? t.deletingAccount : t.deleteAccount}
              </button>
            </section>
          </>
        ) : null}

        {!loading && error && !contributor ? (
          <p className="auth-error" role="alert">{error}</p>
        ) : null}
      </article>
    </main>
  );
}
