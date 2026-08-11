"use client";

// Reveal-once API-key dialog (api-keys epic T18, model RecoveryCodesDialog).
//
// The raw key exists ONLY in the POST /api/auth/keys 201 response (D2/D3:
// hash-only storage, show-once discipline P1-2). This dialog is the once-only
// display:
//  - role="alertdialog" + aria-modal + labelledby/describedby;
//  - focus moves in on open, returns to the trigger on close;
//  - Tab trapped in the action ring;
//  - F2: the reveal states the key's expiry (date or "Never"/"Mai") —
//    the moment the raw key exists is the one time the user can note
//    when it stops working;
//  - DELIBERATE DEVIATION from ConfirmDialog: Escape and overlay clicks do
//    NOT dismiss. Closing here means the key is lost forever — the only
//    close is the explicit "I saved it" acknowledgment (same rule as the
//    recovery-codes dialog; WCAG dialog semantics do not mandate Escape).
//  - "Copy key" uses the Clipboard API (progressive enhancement: the button
//    is hidden entirely when the API is unavailable, the key stays
//    selectable text); a role="status" node announces "Copied.".

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./LocaleProvider";
import { useMessages } from "../lib/use-messages";
import { formatPublicDate } from "../lib/format-date";

type Props = {
  open: boolean;
  keyValue: string;
  expiresAt: string | null;
  onClose: () => void;
};

export function ApiKeyRevealDialog({ open, keyValue, expiresAt, onClose }: Props) {
  const t = useMessages().auth;
  const { locale } = useLocale();
  const copyRef = useRef<HTMLButtonElement>(null);
  const savedRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  const canCopy =
    typeof navigator !== "undefined"
    && typeof navigator.clipboard?.writeText === "function";

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Defer the state write out of the synchronous effect body (repo
    // pattern — react-hooks/set-state-in-effect).
    Promise.resolve().then(() => setCopied(false));
    savedRef.current?.focus();
    return () => {
      previousFocus.current?.focus();
      previousFocus.current = null;
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    // No Escape handler: closing = key lost. Only Tab is intercepted for
    // the focus trap (same as RecoveryCodesDialog).
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusables = [copyRef.current, savedRef.current].filter(
      (el): el is HTMLButtonElement => el !== null && !el.disabled,
    );
    if (focusables.length < 2) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(keyValue);
      setCopied(true);
    } catch {
      // Clipboard permission denied: the key stays selectable text.
      setCopied(false);
    }
  }

  if (!open) return null;

  return (
    <div className="confirm-dialog-backdrop">
      <div
        ref={dialogRef}
        className="confirm-dialog recovery-dialog api-key-reveal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="api-key-reveal-title"
        aria-describedby="api-key-reveal-body"
        onKeyDown={onKeyDown}
      >
        <h2 id="api-key-reveal-title">{t.apiKeyRevealTitle}</h2>
        <p id="api-key-reveal-body">{t.apiKeyRevealBody}</p>
        <code className="api-key-raw" aria-label={t.apiKeyRevealTitle}>
          {keyValue}
        </code>
        <p className="api-key-reveal-expiry">
          {t.apiKeyExpiresLabel}:{" "}
          <strong>{expiresAt ? formatPublicDate(expiresAt, locale) : t.apiKeyExpiresNever}</strong>
        </p>
        <div className="confirm-dialog-actions recovery-dialog-actions">
          {canCopy ? (
            <button ref={copyRef} type="button" className="button detail-outline" onClick={() => void onCopy()}>
              {t.apiKeyRevealCopy}
            </button>
          ) : null}
          <button ref={savedRef} type="button" className="button button-primary" onClick={onClose}>
            {t.apiKeyRevealSaved}
          </button>
        </div>
        {copied ? <p className="api-key-copied" role="status">{t.apiKeyRevealCopied}</p> : null}
      </div>
    </div>
  );
}
