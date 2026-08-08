"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/use-messages";
import { useLocale } from "../components/LocaleProvider";
import { formatPublicDate } from "../lib/format-date";
import { PublicNav } from "../components/PublicNav";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecoveryCodesDialog } from "../components/RecoveryCodesDialog";
import { LevelBadge } from "../components/LevelBadge";
import type { TrustLevelMeta } from "../lib/trust-levels";
import { browserSupportsWebAuthn, createCredential } from "../lib/webauthn-client";

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
  emailVerifiedAt: string | null;
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
  summary?: ContributionSummary;
};

/**
 * Global per-type/per-status counts (account rework 2026-08-08) — always
 * the caller's OWN totals, independent of the active filters, powering the
 * summary strip ("3 in moderation · 12 published …"). Present in every
 * /me/contributions response.
 */
type ContributionSummary = {
  total: number;
  byType: Record<"camera" | "correction" | "photo", number>;
  byStatus: Record<string, number>;
};

/** Public descriptor of an enrolled passkey (GET /api/auth/passkey/credentials). */
type Passkey = {
  id: number;
  credentialId: string;
  transports: string | null;
  createdAt: string;
};

const PAGE_SIZE = 25;

/** Local filter keys — deliberately NOT in the URL (private page, C6/C5). */
const STATUS_FILTERS = ["all", "pending", "active", "needs_review", "removed", "rejected"] as const;
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

// ---------------------------------------------------------------------------
// Contribution-kind icons (account rework 2026-08-08): inline SVGs, 18px,
// stroke currentColor, aria-hidden — the three kinds are told apart by
// SHAPE + the text label next to it, never by colour alone (WCAG 1.4.1;
// colour stays reserved for the status rail/dot).
// ---------------------------------------------------------------------------

function ContributionKindIcon({ kind }: { kind: Contribution["type"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "camera") {
    return (
      <svg {...common}>
        <rect x="2.5" y="7" width="13" height="10" rx="2" />
        <path d="M15.5 10.5l4-2.5v8l-4-2.5" />
        <circle cx="8.5" cy="12" r="2.2" />
      </svg>
    );
  }
  if (kind === "correction") {
    return (
      <svg {...common}>
        <path d="M4 20l1.2-4.2L16.5 4.5a2.1 2.1 0 013 3L8.2 18.8 4 20z" />
        <path d="M14.5 6.5l3 3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M4 17.5l5-5 4 4 3-3 4 4" />
    </svg>
  );
}

/** Local type filter keys — same rule as the status filters (private page). */
const TYPE_FILTERS = ["all", "camera", "correction", "photo"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

/**
 * Resolve the human label for a contribution status row: the shared record
 * vocabulary first, then the profile-filter vocabulary, then the literal
 * fallback — never the raw status key on screen (rework 2026-08-08 fixed
 * approved/reviewed/stale falling through to the literal "Status").
 */
function contributionStatusLabel(
  status: string,
  statuses: Record<string, string>,
  statusFilters: Record<string, string>,
  fallback: string,
): string {
  return statuses[status] ?? statusFilters[status] ?? fallback;
}

export default function AccountPageBody() {
  const bundle = useMessages();
  const t = bundle.auth;
  const community = bundle.community;
  const correctionLabels = bundle.correction;
  const statuses = bundle.status;
  const { locale } = useLocale();
  const router = useRouter();
  const [contributor, setContributor] = useState<Contributor | null>(null);
  const [level, setLevel] = useState<TrustLevelMeta | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; hasMore: boolean; total: number } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // Global totals (account rework 2026-08-08): loaded with the first
  // contributions response, never re-fetched per filter/page — the strip
  // answers "what do I have in the queue?" regardless of the active list.
  const [summary, setSummary] = useState<ContributionSummary | null>(null);
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

  // Passkey management (Fase E2): the enrolled list, the enrollment
  // ceremony state, the removal confirmation and the once-only recovery
  // codes issued by the /complete route (shown in RecoveryCodesDialog).
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [passkeysError, setPasskeysError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [passkeyAdded, setPasskeyAdded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Passkey | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Email-verification banner (P1-1 Vera design): the profile read exposes
  // contributor.emailVerifiedAt; when it is null the page explains the write
  // gate (Fase E1) and offers a resend. Same session contract as the
  // /verify-email page: POST /api/auth/verify-email/resend.
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  async function onResendVerification() {
    setResendingVerification(true);
    setVerificationMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      if (response.ok) {
        setVerificationMessage(t.verifyBannerResent);
        return;
      }
      if (response.status === 429) {
        setVerificationMessage(t.verifyResendRateLimited);
        return;
      }
      setVerificationMessage(t.verifyResendError);
    } catch {
      setVerificationMessage(t.verifyResendError);
    } finally {
      setResendingVerification(false);
    }
  }

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
  const loadContributions = useCallback((nextFilter: StatusFilter, nextType: TypeFilter, nextPage: number) => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
    if (nextFilter !== "all") query.set("status", nextFilter);
    if (nextType !== "all") query.set("type", nextType);
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
        // Global summary strip: captured from the first (unfiltered) page
        // load; the same response carries it on every filter/page request
        // but the totals never depend on the active list.
        if (body.summary) setSummary(body.summary);
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

  // Passkey list (Fase E2): refreshed after every enrollment/removal so the
  // section always mirrors the server. A failure renders an honest inline
  // error and keeps the rest of the page usable.
  const loadPasskeys = useCallback(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => { setPasskeysLoading(true); setPasskeysError(null); })
      .then(() => fetch("/api/auth/passkey/credentials", { signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) {
          setContributor(null);
          return;
        }
        if (!response.ok) {
          setPasskeysError(t.passkeysError);
          return;
        }
        const body = (await response.json()) as { credentials?: Passkey[] };
        setPasskeys(body.credentials ?? []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setPasskeysError(t.passkeysError);
      })
      .finally(() => setPasskeysLoading(false));
    return () => controller.abort();
  }, [t.passkeysError]);

  async function onEnrollPasskey() {
    const csrfToken = readCsrfToken();
    setEnrollError(null);
    setPasskeyAdded(false);
    if (!browserSupportsWebAuthn()) {
      setEnrollError(t.passkeyUnsupported);
      return;
    }
    setEnrolling(true);
    try {
      const beginResponse = await fetch("/api/auth/passkey/register/begin", {
        method: "POST",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (beginResponse.status === 401 || beginResponse.status === 403) {
        // Same-origin fetch: a 403 here is the expired/mismatched CSRF
        // token (backend: "Invalid CSRF token"), never a real cross-site
        // request — surface the actionable message, not errorCrossOrigin.
        setEnrollError(beginResponse.status === 403 ? t.passkeyCsrfExpired : t.passkeySessionLost);
        return;
      }
      if (!beginResponse.ok) {
        setEnrollError(t.passkeyEnrollError);
        return;
      }
      const { options } = await beginResponse.json() as { options: Parameters<typeof createCredential>[0] };

      // The ceremony itself: throws NotAllowedError when the user cancels
      // the device prompt — a silent abort, never an error message.
      const credential = await createCredential(options);

      const completeResponse = await fetch("/api/auth/passkey/register/complete", {
        method: "POST",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ challenge: options.challenge, response: credential }),
      });
      if (completeResponse.status === 409) {
        setEnrollError(t.passkeyAlreadyEnrolled);
        return;
      }
      if (completeResponse.status === 401) {
        setEnrollError(t.passkeySessionLost);
        return;
      }
      if (completeResponse.status === 403) {
        // Same-origin fetch: 403 = CSRF token expired/mismatched.
        setEnrollError(t.passkeyCsrfExpired);
        return;
      }
      if (!completeResponse.ok) {
        setEnrollError(t.passkeyEnrollError);
        return;
      }
      const body = await completeResponse.json() as { credential?: { id: string }; recoveryCodes?: string[] };
      setRecoveryCodes(body.recoveryCodes ?? []);
      setPasskeyAdded(true);
      // Reload the list (the new credential is on the server now); the
      // returned abort function is the effect-cleanup contract, not
      // something to call here.
      void loadPasskeys();
    } catch (reason) {
      if (reason instanceof Error && reason.name === "NotAllowedError") return;
      setEnrollError(t.passkeyEnrollError);
    } finally {
      setEnrolling(false);
    }
  }

  async function onRemovePasskey(passkey: Passkey) {
    const csrfToken = readCsrfToken();
    setPasskeysError(null);
    setRemovingId(passkey.id);
    try {
      const response = await fetch("/api/auth/passkey/credentials", {
        method: "DELETE",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ credentialId: passkey.credentialId }),
      });
      if (!response.ok) {
        if (response.status === 404) setPasskeysError(t.passkeyNotFound);
        else if (response.status === 403) setPasskeysError(t.passkeyCsrfExpired);
        else setPasskeysError(t.passkeyRemoveError);
        return;
      }
      setConfirmRemove(null);
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
    } catch {
      setPasskeysError(t.passkeyRemoveError);
    } finally {
      setRemovingId(null);
    }
  }

  useEffect(() => loadProfile(), [loadProfile]);

  useEffect(() => {
    if (contributor === null) return;
    const cancel = loadContributions(filter, typeFilter, page);
    return cancel;
  }, [contributor, filter, typeFilter, page, loadContributions]);

  useEffect(() => {
    if (contributor === null) return;
    const cancel = loadPasskeys();
    return cancel;
  }, [contributor, loadPasskeys]);

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

  function selectTypeFilter(next: TypeFilter) {
    setTypeFilter(next);
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
      <PublicNav navLabel={t.navigation} homeLabel={t.homeAria} />

      <article className="record-detail auth-card account-card account-dashboard">
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
            {/* Email-verification banner (P1-1 Vera design): until
                emailVerifiedAt is set the write gate (Fase E1) refuses every
                public write, so the account page must say so and offer the
                resend — the register→verify→write flow was a dead end.
                Placed FIRST (account rework 2026-08-08): it is the gate that
                blocks everything, so it is the first thing an unverified
                contributor sees, before the profile. */}
            {!contributor.emailVerifiedAt ? (
              <section className="verify-banner" aria-labelledby="verify-banner-title">
                <h2 id="verify-banner-title">{t.verifyBannerTitle}</h2>
                <p className="record-detail-summary">{t.verifyBannerBody}</p>
                <p className="auth-switch">
                  <button className="button detail-outline" type="button" onClick={() => void onResendVerification()} disabled={resendingVerification}>
                    {resendingVerification ? t.loading : t.verifyBannerResend}
                  </button>
                </p>
                {verificationMessage ? (
                  <p className={verificationMessage === t.verifyBannerResent ? "verify-banner-done" : "auth-error"} role={verificationMessage === t.verifyBannerResent ? "status" : "alert"}>
                    {verificationMessage}
                  </p>
                ) : null}
              </section>
            ) : (
              <p className="verify-banner-done" role="status">{t.verifyBannerDone}</p>
            )}

            {/* Identity grid (account rework 2026-08-08): the profile
                becomes a 2-column island — identity + logout on the left,
                trust badge + membership on the right; 1 column on mobile.
                The session action (logout) lives with the identity it
                ends, not as a stray button before the danger zone. */}
            <section aria-labelledby="profile-title" className="account-profile-grid">
              <div className="account-identity">
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
                <button className="button detail-outline account-logout" type="button" onClick={() => void onLogout()}>
                  {t.logout}
                </button>
              </div>
              <div className="account-trust">
                {level ? (
                  <LevelBadge
                    level={level.level}
                    verifiedCount={level.verifiedCount}
                    nextThreshold={level.nextThreshold}
                  />
                ) : null}
              </div>
            </section>

            <section aria-labelledby="contributions-title">
              <div className="account-section-header">
                <h2 id="contributions-title">{community.yourContributions}</h2>
                <div className="account-section-actions">
                  <Link className="button detail-outline" href="/segnala">{community.newReportCta}</Link>
                  <Link className="button detail-outline" href="/correggi">{community.newCorrectionCta}</Link>
                </div>
              </div>

              {/* Global summary strip (account rework 2026-08-08): counts
                  are independent of the active filters — they answer "what
                  do I have in the queue?" without scrolling or filtering.
                  role=status on the in-moderation card: it is the one that
                  changes after a moderation action. */}
              {summary && summary.total > 0 ? (
                <div className="account-stats" role="group" aria-label={community.statsGroupLabel}>
                  <div className="account-stat">
                    <span className="account-stat-icon"><ContributionKindIcon kind="camera" /></span>
                    <span className="account-stat-value" aria-label={`${community.stats.camera}: ${summary.byType.camera}`}>{summary.byType.camera}</span>
                    <span className="account-stat-label">{community.stats.camera}</span>
                  </div>
                  <div className="account-stat">
                    <span className="account-stat-icon"><ContributionKindIcon kind="correction" /></span>
                    <span className="account-stat-value" aria-label={`${community.stats.correction}: ${summary.byType.correction}`}>{summary.byType.correction}</span>
                    <span className="account-stat-label">{community.stats.correction}</span>
                  </div>
                  <div className="account-stat">
                    <span className="account-stat-icon"><ContributionKindIcon kind="photo" /></span>
                    <span className="account-stat-value" aria-label={`${community.stats.photo}: ${summary.byType.photo}`}>{summary.byType.photo}</span>
                    <span className="account-stat-label">{community.stats.photo}</span>
                  </div>
                  <div className="account-stat" role="status">
                    <span className="account-stat-icon account-stat-icon-clock">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </span>
                    <span className="account-stat-value" aria-label={`${community.stats.inModeration}: ${summary.byStatus.pending ?? 0}`}>{summary.byStatus.pending ?? 0}</span>
                    <span className="account-stat-label">{community.stats.inModeration}</span>
                  </div>
                </div>
              ) : null}

              {/* Type filter (account rework 2026-08-08): the API always
                  supported type=camera|correction|photo; the UI now exposes
                  it — the three kinds are filterable and never mixed
                  silently. Same local-state rule as the status filters. */}
              <div
                className="contributions-filters"
                role="group"
                aria-label={community.typeFilterLabel}
              >
                {TYPE_FILTERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip${typeFilter === key ? " active" : ""}`}
                    aria-pressed={typeFilter === key}
                    onClick={() => selectTypeFilter(key)}
                  >
                    {community.typeFilters[key]}
                  </button>
                ))}
              </div>

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
                    {summary && key !== "all" && summary.byStatus[key] !== undefined ? (
                      <span className="filter-chip-count">{summary.byStatus[key]}</span>
                    ) : null}
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
                    {filter === "all" && typeFilter === "all" ? community.noContributionsBody : community.noContributionsFiltered}
                  </p>
                  {filter === "all" && typeFilter === "all" ? (
                    <p className="auth-switch">
                      <Link className="button button-primary" href="/segnala">{community.newReportCta}</Link>
                    </p>
                  ) : null}
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
                      const statusLabel = contributionStatusLabel(
                        contribution.status,
                        statuses as unknown as Record<string, string>,
                        community.statusFilters as unknown as Record<string, string>,
                        t.submissionStatus,
                      );
                      const kindLabel = community.typeLabels[contribution.type];
                      const issueLabel = contribution.issueType
                        ? (correctionLabels[contribution.issueType as keyof typeof correctionLabels] as string | undefined)
                        : undefined;
                      // correction/photo: link the related public record
                      // when the camera still exists (cameraId set).
                      const relatedHref = contribution.cameraId != null
                        ? `/records/${contribution.cameraId}`
                        : null;
                      const title = contribution.type === "camera"
                        ? (contribution.title ?? kindLabel)
                        : (issueLabel ? `${kindLabel}: ${issueLabel}` : kindLabel);
                      return (
                        <li key={`${contribution.type}-${contribution.id}`} className="contribution-row">
                          <span className="contribution-kind-icon" aria-hidden="true">
                            <ContributionKindIcon kind={contribution.type} />
                          </span>
                          <span className="contribution-main">
                            {contribution.type === "camera" ? (
                              <Link href={`/records/${contribution.id}`}>{title}</Link>
                            ) : relatedHref ? (
                              <Link href={relatedHref}>{title}</Link>
                            ) : (
                              <span>{title}</span>
                            )}
                            <span className="contribution-meta">
                              {kindLabel}
                              {" · "}
                              <time dateTime={contribution.createdAt}>
                                {formatPublicDate(contribution.createdAt, locale)}
                              </time>
                            </span>
                          </span>
                          <span className="contribution-status">
                            <span className={`status-dot ${contribution.status}`} aria-hidden="true" />
                            <span>{statusLabel}</span>
                          </span>
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

            {/* Passkeys in a native disclosure (account rework 2026-08-08):
                the section is secondary settings; the <details>/<summary>
                pattern is already in the repo (filters-disclosure) and
                carries keyboard/focus for free. Deliberately NOT a
                controlled component — the browser owns open/close, so no
                onToggle contract is needed. */}
            <details className="passkeys-disclosure">
              <summary>
                <h2 id="passkeys-title">{t.passkeysSection}</h2>
                {!passkeysLoading && !passkeysError && passkeys.length > 0 ? (
                  <span className="passkeys-summary-count">
                    {`${passkeys.length} ${passkeys.length === 1 ? t.passkeySingular : t.passkeyPlural}`}
                  </span>
                ) : null}
              </summary>

              <p className="record-detail-summary">{t.passkeysHint}</p>

              {passkeysLoading ? <p>{t.loading}</p> : null}

              {!passkeysLoading && passkeysError ? (
                <p className="auth-error" role="alert">{passkeysError}</p>
              ) : null}

              {!passkeysLoading && !passkeysError ? (
                passkeys.length === 0 ? (
                  <p className="passkey-empty">{t.passkeysEmpty}</p>
                ) : (
                  <ul className="auth-submissions passkey-list" aria-label={t.passkeysSection}>
                    {passkeys.map((passkey) => {
                      const enrolledOn = new Date(passkey.createdAt).toLocaleDateString();
                      return (
                        <li key={passkey.id} className="passkey-row">
                          <span className="passkey-kind">
                            <span className="status-dot verified" aria-hidden="true" />
                            {t.passkeyEnrolledLabel}: {enrolledOn}
                          </span>
                          <button
                            className="text-button"
                            type="button"
                            disabled={removingId === passkey.id}
                            aria-haspopup="dialog"
                            onClick={() => setConfirmRemove(passkey)}
                          >
                            {removingId === passkey.id ? t.passkeyRemoveBusy : t.passkeyRemove}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}

              {enrollError ? <p className="auth-error" role="alert">{enrollError}</p> : null}
              {passkeyAdded ? <p className="passkey-added" role="status">{t.passkeyAdded}</p> : null}
              <div className="passkey-actions">
                <button
                  className="button detail-outline"
                  type="button"
                  onClick={() => void onEnrollPasskey()}
                  disabled={enrolling}
                >
                  {enrolling ? t.loading : t.passkeyAdd}
                </button>
                <small className="auth-method-hint">{t.passkeyAddHelp}</small>
              </div>
            </details>

            {error ? <p className="auth-error" role="alert">{error}</p> : null}

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

      <ConfirmDialog
        open={confirmRemove !== null}
        title={t.passkeyRemoveConfirm}
        body={t.passkeyRemoveConfirmBody}
        confirmLabel={t.passkeyRemove}
        cancelLabel={t.passkeyRemoveCancel}
        busyLabel={t.passkeyRemoveBusy}
        busy={removingId !== null}
        onConfirm={() => { if (confirmRemove) void onRemovePasskey(confirmRemove); }}
        onCancel={() => setConfirmRemove(null)}
      />

      <RecoveryCodesDialog
        open={recoveryCodes !== null}
        codes={recoveryCodes ?? []}
        title={t.recoveryTitle}
        body={t.recoveryBody}
        copyLabel={t.recoveryCopy}
        copiedLabel={t.recoveryCopied}
        savedLabel={t.recoverySaved}
        onClose={() => setRecoveryCodes(null)}
      />
    </main>
  );
}
