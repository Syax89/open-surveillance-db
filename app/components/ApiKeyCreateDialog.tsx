"use client";

// Create-API-key dialog (api-keys epic T18). role="dialog" + aria-modal,
// focus in on open / back to trigger on close, Tab trapped, Escape cancels
// (nothing is destroyed here — unlike the reveal dialog). Name field with
// aria-invalid; scope PILL BUTTONS with aria-pressed, NEVER checkboxes
// (WCAG 2.5.8 issue #413). Optional expiry select (F2): 30/90/365 days or
// Never — the API accepts an ISO expiresAt (default +365d, null=never),
// so the dialog lets the user pick before minting. The caller owns the
// fetch (useApiKeys.createKey).

import { useEffect, useRef, useState } from "react";
import { useMessages } from "../lib/use-messages";
import { useModalScrollLock } from "../lib/hooks/use-modal-scroll-lock";
import { API_KEY_SCOPES, API_KEY_SCOPE_GRANTS, API_KEY_SCOPE_LABELS } from "../lib/useApiKeys";
import type { ApiKeyErrorKind, ApiKeyScope } from "../lib/useApiKeys";

type Props = {
  open: boolean;
  busy: boolean;
  error: ApiKeyErrorKind | null;
  onCreate: (name: string, scopes: ApiKeyScope[], expiresAt: string | null) => void;
  onCancel: () => void;
};

const MAX_NAME_LENGTH = 60;
const EXPIRY_DAYS: ReadonlyArray<30 | 90 | 365> = [30, 90, 365];
type ExpiryChoice = "never" | `${(typeof EXPIRY_DAYS)[number]}`;

/** Compute the ISO expiry for a chosen duration (null = never). */
function expiryIso(expiry: ExpiryChoice): string | null {
  if (expiry === "never") return null;
  return new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
}

export function ApiKeyCreateDialog({ open, busy, error, onCreate, onCancel }: Props) {
  const t = useMessages().auth;
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([...API_KEY_SCOPES]);
  const [expiry, setExpiry] = useState<ExpiryChoice>("365");
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useModalScrollLock(open);

  const trimmed = name.trim();
  const nameInvalid = touched && trimmed.length === 0;
  const nameTooLong = trimmed.length > MAX_NAME_LENGTH;
  const valid = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH && scopes.length > 0;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Reset on open (deferred — react-hooks/set-state-in-effect).
    Promise.resolve().then(() => { setName(""); setScopes([...API_KEY_SCOPES]); setExpiry("365"); setTouched(false); });
    nameRef.current?.focus();
    return () => { previousFocus.current?.focus(); previousFocus.current = null; };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusables = [cancelRef.current, createRef.current].filter((el): el is HTMLButtonElement => el !== null && !el.disabled);
    if (focusables.length < 2) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  function toggleScope(scope: ApiKeyScope) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  function submit() {
    setTouched(true);
    if (!valid) return;
    onCreate(trimmed, scopes, expiryIso(expiry));
  }

  if (!open) return null;

  return (
    <div className="confirm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div
        ref={dialogRef}
        className="confirm-dialog api-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-create-title"
        aria-describedby="api-key-create-body"
        onKeyDown={onKeyDown}
      >
        <h2 id="api-key-create-title">{t.apiKeyCreateTitle}</h2>
        <p id="api-key-create-body">{t.apiKeyCreateBody}</p>

        <div className="auth-field">
          <label htmlFor="api-key-name">{t.apiKeyNameLabel}</label>
          <input
            id="api-key-name"
            ref={nameRef}
            type="text"
            maxLength={MAX_NAME_LENGTH + 1}
            value={name}
            aria-invalid={nameInvalid || nameTooLong}
            aria-describedby="api-key-name-help"
            onChange={(event) => { setTouched(true); setName(event.target.value); }}
          />
          <small id="api-key-name-help">{t.apiKeyNameHelp}</small>
          {nameInvalid ? <p className="auth-error" role="alert">{t.apiKeyNameRequired}</p> : null}
          {!nameInvalid && nameTooLong ? <p className="auth-error" role="alert">{t.apiKeyNameTooLong}</p> : null}
        </div>

        <div className="auth-field">
          <label htmlFor="api-key-expiry">{t.apiKeyExpiryLabel}</label>
          <select
            id="api-key-expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value as ExpiryChoice)}
          >
            {EXPIRY_DAYS.map((days) => (
              <option key={days} value={days}>
                {days === 30 ? t.apiKeyExpiry30 : days === 90 ? t.apiKeyExpiry90 : t.apiKeyExpiry365}
              </option>
            ))}
            <option value="never">{t.apiKeyExpiresNever}</option>
          </select>
          <small id="api-key-expiry-help">{t.apiKeyExpiryHelp}</small>
        </div>

        <fieldset className="api-key-scope-fieldset">
          <legend>{t.apiKeyScopeLabel}</legend>
          <p className="api-key-scope-help">{t.apiKeyScopeHelp}</p>
          <div className="api-key-scope-pills">
            {API_KEY_SCOPES.map((scope) => {
              const selected = scopes.includes(scope);
              return (
                <div key={scope} className="api-key-scope-pill-wrap">
                  <button
                    type="button"
                    className={`api-key-scope-pill${selected ? " api-key-scope-pill-active" : ""}`}
                    aria-pressed={selected}
                    onClick={() => toggleScope(scope)}
                  >
                    {(t as Record<string, string>)[API_KEY_SCOPE_LABELS[scope]] ?? scope}
                  </button>
                  <small className="api-key-scope-grant">
                    {(t as Record<string, string>)[API_KEY_SCOPE_GRANTS[scope]] ?? ""}
                  </small>
                </div>
              );
            })}
          </div>
          {scopes.length === 0 ? <p className="api-key-scope-help" role="alert">{t.apiKeyScopeHelp}</p> : null}
        </fieldset>

        {error ? (
          <p className="auth-error" role="alert">
            {error === "limit" ? t.apiKeyErrorLimit
              : error === "session" ? t.apiKeyErrorSession
              : error === "csrf" ? t.apiKeyErrorCsrf
              : t.apiKeyErrorCreate}
          </p>
        ) : null}

        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" className="button detail-outline" onClick={onCancel} disabled={busy}>
            {t.apiKeyCreateCancel}
          </button>
          <button ref={createRef} type="button" className="button button-primary" onClick={submit} disabled={busy || !valid}>
            {busy ? t.apiKeyCreateBusy : t.apiKeyCreateSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
