"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDomainMessages } from "../lib/use-domain-messages";
import { authByLocale } from "../lib/i18n/auth";
import { readCsrfToken } from "../lib/csrf";
import { PublicNav } from "../components/PublicNav";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LevelBadge } from "../components/LevelBadge";
import type { TrustLevelMeta } from "../lib/trust-levels";
import { usePasskeys } from "../lib/usePasskeys";
import { ApiKeysSection } from "./ApiKeysSection";
import { VerifyEmailBanner } from "./VerifyEmailBanner";
import { ProfileSection } from "./ProfileSection";
import { ContributionsSection } from "./ContributionsSection";
import { PasskeysSection } from "./PasskeysSection";
import { PasskeyDialogs } from "./PasskeyDialogs";
import { DeleteAccountSection } from "./DeleteAccountSection";
import type { Contributor } from "./account-types";

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
 *
 * Structure: this body is the orchestrator — it owns the shared session
 * state (profile, level, role, logout/erasure) and composes one component
 * per section (VerifyEmailBanner, ProfileSection, ContributionsSection,
 * PasskeysSection, ApiKeysSection, DeleteAccountSection). Section-local
 * state lives in the section or its hook (useContributions, usePasskeys).
 */
export default function AccountPageBody() {
  const t = useDomainMessages(authByLocale);
  const router = useRouter();
  const [contributor, setContributor] = useState<Contributor | null>(null);
  const [level, setLevel] = useState<TrustLevelMeta | null>(null);
  // Coarse users.role (ADR 0003 2026-10 amendment), from GET /api/auth/me:
  // null for every plain contributor (no linked `users` row) — only
  // "moderator"/"admin" unlocks the dashboard shortcut below.
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accessible destructive confirmation for erasure (replaces
  // window.confirm — C6 deliverable 4: focus management + alertdialog).
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Session lost (401 from a section fetch): the page flips to the
  // logged-out state. Stable, because the section loaders depend on it.
  const onSessionLost = useCallback(() => setContributor(null), []);

  // Passkey management (Fase E2): owned here because the removal confirm
  // and the recovery codes dialog render outside the account card.
  const passkeysApi = usePasskeys(contributor, onSessionLost);

  const loadProfile = useCallback(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setContributor(null);
          setRole(null);
          return;
        }
        if (!response.ok) throw new Error(t.errorGeneric);
        const body = await response.json();
        setContributor(body.contributor);
        setLevel(body.level ?? null);
        setRole(body.role ?? null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError(t.errorGeneric);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [t.errorGeneric]);

  useEffect(() => loadProfile(), [loadProfile]);

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
        setRole(null);
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
        setRole(null);
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

  return (
    <main id="main-content" className="record-page">
      <PublicNav navLabel={t.navigation} homeLabel={t.homeAria} />

      <article className="record-detail auth-card account-card account-dashboard">
        <p className="eyebrow"><span /> {t.accountTitle}</p>
        <h1>{t.accountTitle}</h1>

        {/* Trust-level badge ABOVE the identity tile (issue #435): the
            badge + textual progress line lead the dashboard; the
            identity/membership grid follows below. */}
        {!loading && !loggedOut && contributor && level ? (
          <div className="account-trust account-trust--top">
            <LevelBadge
              level={level.level}
              verifiedCount={level.verifiedCount}
              nextThreshold={level.nextThreshold}
            />
          </div>
        ) : null}

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
            {/* Email-verification banner FIRST (account rework 2026-08-08):
                it is the gate that blocks everything, so it is the first
                thing an unverified contributor sees, before the profile. */}
            <VerifyEmailBanner emailVerifiedAt={contributor.emailVerifiedAt} />

            <ProfileSection
              contributor={contributor}
              role={role}
              onContributorUpdated={setContributor}
              onLogout={() => void onLogout()}
            />

            <ContributionsSection contributor={contributor} onSessionLost={onSessionLost} onLevel={setLevel} />

            <PasskeysSection api={passkeysApi} />

            {/* API keys (api-keys epic T18): between passkeys and the danger
                zone, per the plan §3.1. NOT a <details> — the key list
                status must be visible at a glance. The section owns its
                fetch (useApiKeys); a session loss flips the page to the
                logged-out state like the other account fetches. */}
            <ApiKeysSection onSessionLost={() => setContributor(null)} />

            {error ? <p className="auth-error" role="alert">{error}</p> : null}

            <DeleteAccountSection onRequestDelete={() => setConfirmDelete(true)} />
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

      <PasskeyDialogs api={passkeysApi} />
    </main>
  );
}
