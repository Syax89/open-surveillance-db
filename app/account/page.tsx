"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessages } from "../components/LocaleProvider";
import { SiteHeader } from "../components/SiteHeader";
import { ConfirmDialog } from "../components/ConfirmDialog";

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
  const community = bundle.community;
  const statuses = bundle.status;
  const router = useRouter();
  const [contributor, setContributor] = useState<Contributor | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display name inline edit (C6/C8): editing state, draft and per-field
  // error, announced/focused on submit (aria-invalid + aria-describedby).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameErrorRef = useRef<HTMLParagraphElement>(null);

  // Accessible destructive confirmation for erasure (replaces
  // window.confirm — C6 deliverable 4: focus management + alertdialog).
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  // Move focus into the name input when inline editing opens.
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // Announce + focus the name error after a failed save.
  useEffect(() => {
    if (nameError) nameErrorRef.current?.focus();
  }, [nameError]);

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

  function startEditName() {
    setNameDraft(contributor?.displayName ?? "");
    setNameError(null);
    setNameSaved(false);
    setEditingName(true);
  }

  function cancelEditName() {
    setEditingName(false);
    setNameError(null);
  }

  async function onSaveDisplayName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nameDraft.trim();
    if (trimmed.length > 0 && (trimmed.length < 2 || trimmed.length > 60)) {
      setNameError(t.errorDisplayName);
      return;
    }
    const csrfToken = readCsrfToken();
    setNameSaving(true);
    setNameError(null);
    setNameSaved(false);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ displayName: trimmed.length === 0 ? null : trimmed }),
      });
      if (response.status === 429) {
        setNameError(t.errorDisplayNameRateLimit);
        return;
      }
      if (response.status === 403) {
        setNameError(t.errorCrossOrigin);
        return;
      }
      if (!response.ok) {
        setNameError(t.errorDisplayNameGeneric);
        return;
      }
      const body = await response.json() as { contributor?: Contributor };
      if (body.contributor) setContributor(body.contributor);
      setEditingName(false);
      setNameSaved(true);
    } catch {
      setNameError(t.errorDisplayNameGeneric);
    } finally {
      setNameSaving(false);
    }
  }

  async function onDeleteAccount() {
    const csrfToken = readCsrfToken();
    setError(null);
    setDeleting(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.ok) {
        setConfirmDelete(false);
        setDeleted(true);
        setContributor(null);
        setSubmissions([]);
        router.refresh();
      } else if (response.status === 403) {
        setConfirmDelete(false);
        setError(t.errorCrossOrigin);
      } else {
        setConfirmDelete(false);
        setError(t.errorDeleteAccount);
      }
    } catch {
      setConfirmDelete(false);
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
      <SiteHeader navLabel={t.navigation} homeLabel={t.homeAria}>
        <div className="nav-links">
          <Link className="nav-action" href="/">{t.backHome}</Link>
        </div>
      </SiteHeader>

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
                <dd>
                  {editingName ? (
                    <form className="display-name-form" onSubmit={onSaveDisplayName} noValidate>
                      <label className="auth-field">
                        <span className="sr-only">{t.displayNameLabel}</span>
                        <input
                          ref={nameInputRef}
                          name="displayName"
                          maxLength={60}
                          autoComplete="nickname"
                          aria-invalid={nameError ? true : undefined}
                          aria-describedby={nameError ? "display-name-error" : "display-name-help"}
                          value={nameDraft}
                          onChange={(event) => { setNameDraft(event.target.value); if (nameError) setNameError(null); }}
                        />
                        <small id="display-name-help">{t.displayNameHelp}</small>
                      </label>
                      {nameError ? (
                        <p className="auth-error" role="alert" tabIndex={-1} ref={nameErrorRef} id="display-name-error">{nameError}</p>
                      ) : null}
                      <div className="display-name-actions">
                        <button className="button button-primary" type="submit" disabled={nameSaving}>
                          {nameSaving ? t.loading : t.displayNameSave}
                        </button>
                        <button className="button detail-outline" type="button" onClick={cancelEditName} disabled={nameSaving}>
                          {t.displayNameCancel}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {contributor.displayName ?? t.anonymous}
                      {nameSaved ? <span className="display-name-saved" role="status"> {t.displayNameSaved}</span> : null}
                      <button className="text-button display-name-edit" type="button" onClick={startEditName}>
                        {t.displayNameEdit}
                      </button>
                    </>
                  )}
                </dd>
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
                      <Link className="text-button" href={`/records/${submission.id}/edit`}>{community.edit}</Link>
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
                onClick={() => setConfirmDelete(true)}
                aria-haspopup="dialog"
              >
                {t.deleteAccount}
              </button>
            </section>
          </>
        ) : null}

        {!loading && error && !contributor ? (
          <p className="auth-error" role="alert">{error}</p>
        ) : null}
      </article>

      <ConfirmDialog
        open={confirmDelete}
        title={t.deleteAccountConfirm}
        body={t.deleteAccountConfirmBody}
        confirmLabel={t.deleteAccount}
        cancelLabel={t.deleteAccountCancel}
        busyLabel={t.deletingAccount}
        busy={deleting}
        onConfirm={() => void onDeleteAccount()}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
