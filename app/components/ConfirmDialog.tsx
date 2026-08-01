"use client";

import { useEffect, useRef } from "react";

/**
 * Accessible destructive-confirmation dialog (C6 deliverable 4).
 *
 * Replaces window.confirm, which cannot be announced, focused or styled:
 *  - role="alertdialog" + aria-modal + aria-labelledby/aria-describedby so
 *    assistive technology announces the destructive consequence;
 *  - focus moves to the dialog on open (Cancel by default, the safe
 *    action), is trapped inside while open, and returns to the trigger
 *    button on close;
 *  - Escape cancels; the overlay click also cancels (both map to onCancel,
 *    never to the destructive action);
 *  - the confirm button is a native <button> with the localized destructive
 *    label — no keyboard trap, no tabindex manipulation.
 *
 * Pure presentational component: the caller owns the state and performs the
 * destructive action in onConfirm.
 */
type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, busyLabel, busy = false, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog when it opens and restore it on close.
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      cancelRef.current?.focus();
    } else if (previousFocus.current) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [open]);

  // Focus trap: Tab cycles between the two actions (both stay visible, so
  // the trap is a simple two-element ring, no hidden focusables).
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusables = [cancelRef.current, confirmRef.current].filter((el): el is HTMLButtonElement => el !== null && !el.disabled);
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

  if (!open) return null;

  return (
    <div
      className="confirm-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        onKeyDown={onKeyDown}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-body">{body}</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" className="button detail-outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" className="button button-danger" onClick={onConfirm} disabled={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
