"use client";

import { useMessages } from "../lib/use-messages";

/**
 * Community verification toggle (COMMUNITY_PLAN §6.3 C2/C9 — Vera's design,
 * task C5).
 *
 * A single native button: inline SVG star (decorative), the aggregate
 * verification count, `aria-pressed` mirroring the caller's own state, a
 * polite live region on the counter, and an accessible name that flips
 * between "Confirm this record exists" and "Remove verification". The
 * target is at least 44×44px (WCAG 2.5.8, `.confirm-button` CSS). While a
 * toggle is in flight the button is `aria-busy` and disabled — and the
 * interaction is deliberately quiet: no count-up animation, no toast, no
 * burst, no sound (C9).
 *
 * The button ONLY renders in the record detail (/records/[id]) — never in
 * cards, the directory or the home page (C3). Gate states (anonymous,
 * level L0) disable it with explicit explanatory copy; the server is the
 * authority (401/403 fail-closed), the disabled button never pretends to
 * work.
 */
export function StarConfirmButton({
  count,
  confirmed,
  busy,
  disabled,
  disabledReason,
  onToggle,
}: {
  count: number;
  confirmed: boolean;
  busy: boolean;
  disabled: boolean;
  disabledReason?: string | null;
  onToggle: () => void;
}) {
  const bundle = useMessages();
  const t = bundle.community;
  const label = confirmed ? t.removeVerification : t.confirmExists;

  return (
    <div className="confirm-widget">
      <button
        type="button"
        className="confirm-button"
        aria-pressed={confirmed}
        aria-busy={busy}
        disabled={disabled || busy}
        aria-label={label}
        onClick={onToggle}
      >
        <svg className="confirm-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.58l-5.9 3.1 1.13-6.58L2.45 9.44l6.6-.96L12 2.5z"
            fill={confirmed ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <span className="confirm-count" aria-live="polite">
          {t.verificationCount(count)}
        </span>
      </button>
      {disabled && disabledReason ? (
        <p className="confirm-help">{disabledReason}</p>
      ) : null}
    </div>
  );
}
