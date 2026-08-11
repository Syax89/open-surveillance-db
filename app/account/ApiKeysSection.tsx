"use client";

// API-keys account section (api-keys epic T18, plan §3.1). Sits between
// the passkeys disclosure and the danger zone on /account.
//
// NOT a <details> (unlike passkeys): the key list's status must be visible
// at a glance. Structure:
//  - <section aria-labelledby="api-keys-title"> with the shared
//    .account-section-header + the "Create API key" action;
//  - useApiKeys owns list/create/revoke + CSRF echo (model
//    useModerationQueue);
//  - create opens ApiKeyCreateDialog (scope pill buttons, aria-pressed +
//    optional expiry select — the POST carries an ISO expiresAt);
//  - a successful mint hands the RAW key + its expiry to
//    ApiKeyRevealDialog — the once-only display (P1-2) states when the key
//    stops working (F2); the list refetches when it closes;
//  - revoke reuses the shared ConfirmDialog (DELETE + CSRF, row flips to
//    Revoked; 404 = already revoked).

import { useState } from "react";
import { useMessages } from "../lib/use-messages";
import { useApiKeys } from "../lib/useApiKeys";
import type { ApiKey, ApiKeyErrorKind, ApiKeyScope } from "../lib/useApiKeys";
import { ApiKeyList } from "./ApiKeyList";
import { ApiKeyCreateDialog } from "../components/ApiKeyCreateDialog";
import { ApiKeyRevealDialog } from "../components/ApiKeyRevealDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";

type Props = {
  /** Session lost (401 from a key endpoint): the page flips to logged-out. */
  onSessionLost: () => void;
};

export function ApiKeysSection({ onSessionLost }: Props) {
  const t = useMessages().auth;
  const { keys, loading, error, refresh, createKey, revokeKey, revokingId } = useApiKeys(onSessionLost);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiKeyErrorKind | null>(null);
  const [revealKey, setRevealKey] = useState<{ key: string; expiresAt: string | null } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);

  async function onCreate(name: string, scopes: ApiKeyScope[], expiresAt: string | null) {
    setCreating(true);
    setCreateError(null);
    const result = await createKey(name, scopes, expiresAt);
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    // Raw key exists only here: hand it to the once-only reveal dialog.
    setCreateOpen(false);
    setRevealKey({ key: result.key, expiresAt: result.expiresAt });
  }

  async function onRevokeConfirmed() {
    if (!confirmRevoke) return;
    const ok = await revokeKey(confirmRevoke.id);
    if (ok) setConfirmRevoke(null);
  }

  return (
    <section aria-labelledby="api-keys-title" className="api-key-section">
      <div className="account-section-header">
        <h2 id="api-keys-title">{t.apiKeysSection}</h2>
        <div className="account-section-actions">
          {keys.length > 0 ? (
            <button
              type="button"
              className="button detail-outline"
              onClick={() => { setCreateOpen(true); setCreateError(null); }}
            >
              {t.apiKeyCreate}
            </button>
          ) : null}
        </div>
      </div>

      <p className="record-detail-summary">{t.apiKeysHint}</p>

      {loading ? <p>{t.loading}</p> : null}

      {!loading && error === "list" ? (
        <p className="auth-error" role="alert">{t.apiKeyErrorList}</p>
      ) : null}

      {!loading && error !== "list" ? (
        <ApiKeyList
          keys={keys}
          revokingId={revokingId}
          onRevoke={setConfirmRevoke}
          onRequestCreate={() => { setCreateOpen(true); setCreateError(null); }}
        />
      ) : null}

      {!loading && error === "revoke" ? (
        <p className="auth-error" role="alert">{t.apiKeyErrorRevoke}</p>
      ) : null}

      <ApiKeyCreateDialog
        open={createOpen}
        busy={creating}
        error={createError}
        onCreate={(name, scopes, expiresAt) => void onCreate(name, scopes, expiresAt)}
        onCancel={() => setCreateOpen(false)}
      />

      <ApiKeyRevealDialog
        open={revealKey !== null}
        keyValue={revealKey?.key ?? ""}
        expiresAt={revealKey?.expiresAt ?? null}
        onClose={() => {
          setRevealKey(null);
          // The server holds the new key now: refetch so the list shows it.
          void refresh();
        }}
      />

      <ConfirmDialog
        open={confirmRevoke !== null}
        title={t.apiKeyRevokeConfirm}
        body={t.apiKeyRevokeConfirmBody}
        confirmLabel={t.apiKeyRevoke}
        cancelLabel={t.apiKeyRevokeCancel}
        busyLabel={t.apiKeyRevokeBusy}
        busy={revokingId !== null}
        onConfirm={() => void onRevokeConfirmed()}
        onCancel={() => setConfirmRevoke(null)}
      />
    </section>
  );
}
