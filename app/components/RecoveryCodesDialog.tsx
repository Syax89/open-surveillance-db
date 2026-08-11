"use client";

import { useEffect, useRef, useState } from "react";
import { useModalScrollLock } from "../lib/hooks/use-modal-scroll-lock";

/**
 * Accessible one-time recovery-codes dialog (Fase E2 — passkey enrollment).
 *
 * The backend issues 10 single-use recovery codes in plaintext EXACTLY ONCE
 * at passkey enrollment (api/auth/passkey/register/complete). This dialog
 * is the once-only display: it shows the codes, warns that they are never
 * shown again, and requires an explicit "I saved them" acknowledgment.
 *
 * Accessibility, following the ConfirmDialog patterns (C6):
 *  - role="alertdialog" + aria-modal + aria-labelledby/aria-describedby;
 *  - focus moves into the dialog on open and returns to the trigger on
 *    close (the trigger is the "Add passkey" button — the page keeps a
 *    ref to the active element before opening);
 *  - Tab is trapped in the small action ring (Copy + I saved them);
 *  - DELIBERATE DEVIATION from ConfirmDialog: Escape and overlay clicks do
 *    NOT dismiss. Dismissal here means the codes are lost forever (the
 *    server shows them once) — closing must be an explicit, informed
 *    action. An alertdialog that requires acknowledgment is allowed by
 *    WCAG (dialog role semantics do not mandate an Escape close).
 */
type Props = {
  open: boolean;
  codes: string[];
  title: string;
  body: string;
  copyLabel: string;
  copiedLabel: string;
  savedLabel: string;
  /** Called only when the user confirms they saved the codes. */
  onClose: () => void;
};

export function RecoveryCodesDialog({
  open,
  codes,
  title,
  body,
  copyLabel,
  copiedLabel,
  savedLabel,
  onClose,
}: Props) {
  const copyRef = useRef<HTMLButtonElement>(null);
  const savedRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  useModalScrollLock(open);

  // The copy action is a progressive enhancement: hide it entirely when
  // the Clipboard API is unavailable instead of failing on click. The
  // dialog only renders client-side (the codes are client state), so this
  // is safe to evaluate during render.
  const canCopy =
    typeof navigator !== "undefined"
    && typeof navigator.clipboard?.writeText === "function";

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Defer the state write out of the synchronous effect body (repo
    // pattern — react-hooks/set-state-in-effect): the reset must not
    // cascade a render from inside the effect.
    Promise.resolve().then(() => setCopied(false));
    savedRef.current?.focus();
    return () => {
      // Restore focus to the enrollment trigger when the dialog closes.
      previousFocus.current?.focus();
      previousFocus.current = null;
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusables = [copyRef.current, savedRef.current].filter(
      (element): element is HTMLButtonElement => element !== null && !element.disabled,
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
    const text = codes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard permission denied: the codes stay selectable text.
      setCopied(false);
    }
  }

  if (!open) return null;

  return (
    <div className="confirm-dialog-backdrop">
      <div
        ref={dialogRef}
        className="confirm-dialog recovery-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recovery-dialog-title"
        aria-describedby="recovery-dialog-body"
        onKeyDown={onKeyDown}
      >
        <h2 id="recovery-dialog-title">{title}</h2>
        <p id="recovery-dialog-body">{body}</p>
        <ol className="recovery-codes" aria-label={title}>
          {codes.map((code) => (
            <li key={code} className="recovery-code">{code}</li>
          ))}
        </ol>
        <div className="confirm-dialog-actions recovery-dialog-actions">
          {canCopy ? (
            <button ref={copyRef} type="button" className="button detail-outline" onClick={() => void onCopy()}>
              {copied ? copiedLabel : copyLabel}
            </button>
          ) : null}
          <button ref={savedRef} type="button" className="button button-primary" onClick={onClose}>
            {savedLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
