"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessages } from "../components/LocaleProvider";
import { SiteHeader } from "../components/SiteHeader";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LevelBadge } from "../components/LevelBadge";
import type { TrustLevelMeta } from "../lib/trust-levels";

/**
 * /account — extended contributor profile (COMMUNITY_PLAN §2.3, C5 + C6).
 *
 * On top of the pre-existing auth surface (profile, logout, erasure) this
 * page now renders:
 *   - the trust-level badge (LevelBadge: .card-topline label + dot, one of
 *     the three frozen badge keys, never numeric points) and the textual
 *     progress line — never a bar (design C1);
 *   - the contributor's own paginated contributions list from
 *     GET /api/auth/me/contributions (canonical F0 contract), with LOCAL
 *     status filters (useState — the private profile is never shareable,
 *     so the filter state deliberately stays out of the URL), a
 *     role="status" total counter, honest empty states, and an "Edit" link
 *     for the owner only (every row here IS the owner's; the link appears
 *     on editable camera contributions, pointing at /records/[id]/edit);
 *   - display name inline edit (C6/C8) and an accessible destructive
 *     confirmation for erasure (ConfirmDialog alertdialog — C6 replaced
 *     window.confirm).
 *
 * The old /api/auth/me/submissions endpoint stays server-side for backward
 * compatibility (deprecated); the UI now reads the paginated contributions
 * endpoint.
 */

type Contributor = {
  id: number;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

type Contribution = {
  type: "camera" | "correction" | "photo";
  id: number;
  title: string | null;
  issueType: string | null;
  cameraId: number | null;
  status: string;
  createdAt: string;
};

type ContributionsPage = {
  contributions: Contribution[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

const PAGE_SIZE = 25;

/** Local filter keys — deliberately NOT in the URL (private page, C6/C5). */
const STATUS_FILTERS = ["all", "pending", "verified", "needs_review", "removed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * A camera contribution is editable by its owner when its status is not
 * terminal: pending → direct PATCH, verified/needs_review/stale → moderated
 * edit request (COMMUNITY_PLAN §2.2). removed/rejected are never editable
 * (409 server-side); corrections and photos have no edit page.
 */
function isEditable(contribution: Contribution): boolean {
  return (
    contribution.type === "camera"
    && contribution.status !== "removed"
    && contribution.status !== "rejected"
  );
}

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
  const [level, setLevel] = useState<TrustLevelMeta | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; hasMore: boolean; total: number } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [contributionsError, setContributionsError] = useState(false);
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

  const loadProfile = useCallback(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setContributor(null);
          return;
        }
        if (!response.ok) throw new Error(t.errorGeneric);
        const body = await response.json();
        setContributor(body.contributor);
        setLevel(body.level ?? null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError(t.errorGeneric);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [t.errorGeneric]);

  // Contributions list: local filter + pagination state, refetched whenever
  // the filter or the page changes. Cache-Control: no-store on the API;
  // the page never shares this URL (filters are local state, §2.3).
  // All setState calls happen in promise continuations — nothing runs
  // synchronously in the effect body (react-hooks/set-state-in-effect),
  // same pattern as VerificationWidget.
  const loadContributions = useCallback((nextFilter: StatusFilter, nextPage: number) => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
    if (nextFilter !== "all") query.set("status", nextFilter);
    Promise.resolve()
      .then(() => { setContributionsLoading(true); setContributionsError(false); })
      .then(() => fetch(`/api/auth/me/contributions?${query.toString()}`, { signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) {
          setContributor(null);
          return;
        }
        if (!response.ok) throw new Error(t.errorGeneric);
        const body = (await response.json()) as ContributionsPage;
        setContributions(body.contributions);
        setPagination({
          page: body.pagination.page,
          totalPages: body.pagination.totalPages,
          hasMore: body.pagination.hasMore,
          total: body.pagination.total,
        });
        // The list response also carries the level in its meta; using the
        // freshest value keeps the badge in sync after a moderation change.
        setLevel((body as { level?: TrustLevelMeta }).level ?? null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setContributionsError(true);
      })
      .finally(() => setContributionsLoading(false));
    return () => controller.abort();
  }, [t.errorGeneric]);

  useEffect(() => loadProfile(), [loadProfile]);

  useEffect(() => {
    if (contributor === null) return;
    const cancel = loadContributions(filter, page);
    return cancel;
  }, [contributor, filter, page, loadContributions]);

  // Move focus into the name input when inline editing opens.
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // Announce + focus the name error after a failed save.
  useEffect(() => {
    if (nameError) nameErrorRef.current?.focus();
  }, [nameError]);

  function selectFilter(next: StatusFilter) {
    setFilter(next);
    setPage(1);
  }

  function goToPage(next: number) {
    if (pagination && next >= 1 && next <= pagination.totalPages) setPage(next);
  }

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
              {level ? (
                <LevelBadge
                  level={level.level}
                  verifiedCount={level.verifiedCount}
                  nextThreshold={level.nextThreshold}
                />
              ) : null}
            </section>

            <section aria-labelledby="contributions-title">
              <h2 id="contributions-title">{community.yourContributions}</h2>

              {/* Local status filters (never in the URL — private page). */}
              <div
                className="contributions-filters"
                role="group"
                aria-label={community.contributionStatusFilter}
              >
                {STATUS_FILTERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip${filter === key ? " active" : ""}`}
                    aria-pressed={filter === key}
                    onClick={() => selectFilter(key)}
                  >
                    {community.statusFilters[key]}
                  </button>
                ))}
              </div>

              {contributionsError ? (
                <p className="auth-error" role="alert">{community.errorLoadContributions}</p>
              ) : null}

              {!contributionsError && pagination !== null && pagination.total === 0 ? (
                <>
                  <h3>{community.noContributionsYet}</h3>
                  <p className="record-detail-summary">
                    {filter === "all" ? community.noContributionsBody : community.noContributionsFiltered}
                  </p>
                </>
              ) : null}

              {!contributionsError && pagination !== null && pagination.total > 0 ? (
                <>
                  {/* Polite total counter: announced on load and after a
                      filter/page change without stealing focus. */}
                  <p className="contributions-total" role="status">
                    {community.contributionCount(pagination.total)}
                  </p>
                  <ul className="auth-submissions contributions-list" aria-label={community.yourContributions}>
                    {contributions.map((contribution) => {
                      const statusLabel = statuses[contribution.status as keyof typeof statuses]
                        ?? community.statusFilters[contribution.status as keyof typeof community.statusFilters]
                        ?? t.submissionStatus;
                      return (
                        <li key={`${contribution.type}-${contribution.id}`}>
                          {contribution.type === "camera" && contribution.title ? (
                            <Link href={`/records/${contribution.id}`}>{contribution.title}</Link>
                          ) : (
                            <span className="contributions-kind">{community.contribution}</span>
                          )}
                          <span className={`status-dot ${contribution.status}`} aria-hidden="true" />
                          <span>{statusLabel}</span>
                          {isEditable(contribution) ? (
                            <Link className="text-button contributions-edit" href={`/records/${contribution.id}/edit`}>
                              {community.editContribution}
                            </Link>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                  {/* Pagination (F0): previous/next with aria-current on the
                      current page indicator. */}
                  <nav className="contributions-pagination" aria-label={community.contributionsNavigation}>
                    <button
                      type="button"
                      className="button detail-outline"
                      disabled={page <= 1 || contributionsLoading}
                      onClick={() => goToPage(page - 1)}
                    >
                      {community.previousPage}
                    </button>
                    <span className="page-indicator" aria-current="page">
                      {community.pageOf(page, pagination.totalPages)}
                    </span>
                    <button
                      type="button"
                      className="button detail-outline"
                      disabled={!pagination.hasMore || contributionsLoading}
                      onClick={() => goToPage(page + 1)}
                    >
                      {community.nextPage}
                    </button>
                  </nav>
                </>
              ) : null}

              {contributionsLoading && !contributionsError && pagination === null ? (
                <p>{t.loading}</p>
              ) : null}
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
