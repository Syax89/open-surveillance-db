"use client";

// Passkeys in a native disclosure (account rework 2026-08-08), extracted
// from AccountPageBody: the section is secondary settings; the
// <details>/<summary> pattern is already in the repo (filters-disclosure)
// and carries keyboard/focus for free. Deliberately NOT a controlled
// component — the browser owns open/close, so no onToggle contract is
// needed. State comes from usePasskeys (owned by the page, which also
// renders the removal/recovery dialogs via PasskeyDialogs).

import { useDomainMessages } from "../lib/use-domain-messages";
import { formatPublicDate } from "../lib/format-date";
import { useLocale } from "../components/LocaleProvider";
import { authByLocale } from "../lib/i18n/auth";
import type { PasskeysApi } from "../lib/usePasskeys";

export function PasskeysSection({ api }: { api: PasskeysApi }) {
  const t = useDomainMessages(authByLocale);
  const { locale } = useLocale();
  const { passkeys, passkeysLoading, passkeysError, enrolling, enrollError, passkeyAdded, removingId, setConfirmRemove, onEnrollPasskey } = api;

  return (
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
              const enrolledOn = formatPublicDate(passkey.createdAt, locale);
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
  );
}
