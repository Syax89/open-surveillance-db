"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { LocaleContext } from "../components/LocaleProvider";
import { messages } from "../lib/i18n";
import type { MessageBundle } from "../lib/i18n";

/**
 * Community action widget (ADR 0021 §3, FASE 3 UI) — the five-action
 * surface of the community-driven directory: like (useful), confirm,
 * gone, problem, privacy. One component, two mounts:
 *
 *   - full: /records/[id] — five labelled buttons with live counts;
 *   - compact: map marker popup — the redesigned toolbar (t_b7728ad0):
 *     'Utile' and 'Conferma' stay visible with icon + count, the remaining
 *     three actions ('Non c'è più', 'Problema', 'Privacy') live behind an
 *     accessible disclosure trigger ('Aggiorna o segnala'); Privacy asks
 *     for explicit confirmation before sending (the only destructive
 *     request — GDPR-friendly fast hide).
 *
 * Contract (ADR §3.2/§3.3/§10.2):
 *   - one action per (record, contributor): PUT upserts/switches, PUT with
 *     the same action answers 409, DELETE removes; the server is the
 *     authority — the widget only mirrors the response;
 *   - verified account required (write gate): anonymous callers see the
 *     counts and a log-in/register CTA, never a working button (the server
 *     would answer 401 anyway — the copy only explains);
 *   - self like/confirm answers 403 (self-action gate); problem/privacy on
 *     one's own record ARE allowed (GDPR-friendly fast hide);
 *   - counts are COUNT DISTINCT aggregates, never attribution.
 *
 * a11y (task FASE 3 + redesign t_b7728ad0): each count is a role="status"
 * live region whose sr-only text carries the label ("Useful: 12"), so a
 * count change is announced without spamming five regions on first paint;
 * buttons use aria-pressed for the active action; the disclosure trigger
 * carries aria-expanded + aria-controls, opening moves focus to the first
 * menu action, Escape closes and restores focus to the trigger; errors
 * land in role="alert".
 */

export type ActionCounts = {
  like: number;
  confirm: number;
  gone: number;
  problem: number;
  privacy: number;
};

const ACTION_ORDER = ["like", "confirm", "gone", "problem", "privacy"] as const;
export type ActionType = (typeof ACTION_ORDER)[number];

/** The two always-visible toolbar actions (redesign t_b7728ad0). */
const TOOLBAR_ACTIONS: readonly ActionType[] = ["like", "confirm"];
/** The actions behind the disclosure trigger. */
const MENU_ACTIONS: readonly ActionType[] = ["gone", "problem", "privacy"];

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("osdb_csrf="));
  return match ? decodeURIComponent(match.slice("osdb_csrf=".length)) : null;
}

/** Inline 16px icons (redesign t_b7728ad0) — no icon library (project
 * directive: ZERO new libraries). Stroke-only, currentColor, aria-hidden. */
function ToolbarIcon({ name }: { name: "useful" | "confirm" | "more" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "useful") {
    // Thumbs-up (feather glyph): mark the record as useful.
    return (
      <svg {...common}>
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    );
  }
  if (name === "confirm") {
    // Check-circle (feather glyph): confirm the record is still present.
    return (
      <svg {...common}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  }
  // Chevron-down: the disclosure trigger affordance; CSS rotates it when
  // the panel is open (aria-expanded on the button drives the class).
  return (
    <svg {...common}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function CommunityActions({
  recordId,
  counts: initialCounts,
  compact = false,
  bundle: bundleProp,
  onCountsChange,
}: {
  recordId: number;
  counts?: Partial<ActionCounts>;
  compact?: boolean;
  /**
   * Optional pre-resolved bundle for STANDALONE mounts (map popup): the
   * Leaflet popup is a separate React root outside the Next tree, where
   * LocaleProvider context is unavailable. The popup helper resolves the
   * locale itself and passes the bundle; the record page keeps the default
   * context read. One widget, both mounts (D4).
   */
  bundle?: MessageBundle;
  /**
   * Server-confirmed counts reporter (BUG t_5bc23d61): called after every
   * successful toggle with the authoritative counts (the PUT response, or
   * the locally-decremented set after a DELETE). The map popup helper uses
   * it to keep its per-record store so a remount from a stale payload
   * never reverts a vote. Optional — the record page mount does not need
   * it (its React tree keeps the widget alive).
   */
  onCountsChange?: (counts: ActionCounts) => void;
}) {
  /**
   * Bundle resolution — two mounts, one widget:
   *   - inside the Next tree (record page): LocaleProvider context exists;
   *     `useMessages()` reads it and `bundleProp` is undefined;
   *   - standalone root (map popup): NO LocaleProvider — useMessages() would
   *     throw. The popup helper resolves the locale itself and passes the
   *     bundle; the context read falls back to the EN bundle which is then
   *     discarded (bundleProp wins). Reading the context directly (instead
   *     of useMessages) is what keeps the standalone mount alive.
   */
  const context = useContext(LocaleContext);
  const contextBundle = context ? messages[context.locale] : messages.en;
  const bundle = bundleProp ?? contextBundle;
  const actions = bundle.community.actions;
  const [counts, setCounts] = useState<ActionCounts>({
    like: initialCounts?.like ?? 0,
    confirm: initialCounts?.confirm ?? 0,
    gone: initialCounts?.gone ?? 0,
    problem: initialCounts?.problem ?? 0,
    privacy: initialCounts?.privacy ?? 0,
  });
  const [myAction, setMyAction] = useState<ActionType | null>(null);
  const [authState, setAuthState] = useState<"checking" | "anonymous" | "signed-in">("checking");
  const [busyAction, setBusyAction] = useState<ActionType | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Redesign t_b7728ad0 (compact only): the disclosure state — whether the
  // "Aggiorna o segnala" panel is open, and whether the Privacy action is
  // awaiting its explicit confirmation step inside the panel.
  const [menuOpen, setMenuOpen] = useState(false);
  const [privacyConfirming, setPrivacyConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  // Personal state + session state, both no-store reads. All setState calls
  // happen in async continuations (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/cameras/${recordId}/actions`).then((response) =>
        response.ok ? response.json() as Promise<{ action: ActionType | null }> : Promise.reject(new Error())),
      fetch("/api/auth/me").then((response) =>
        response.status === 401 ? Promise.resolve(null) : response.ok ? Promise.resolve(true) : Promise.reject(new Error())),
    ])
      .then(([personal, signedIn]) => {
        if (cancelled) return;
        setMyAction(personal.action);
        setAuthState(signedIn === null ? "anonymous" : "signed-in");
      })
      .catch(() => {
        if (!cancelled) setAuthState("signed-in"); // never block actions on a failed probe
      });
    return () => { cancelled = true; };
  }, [recordId]);

  // Disclosure focus management (t_b7728ad0): opening moves focus to the
  // first menu action (or the privacy confirm button when the confirm step
  // is showing); Escape closes and returns focus to the trigger. The
  // trigger is a disclosure, not a menu — the panel keeps normal tab order.
  useEffect(() => {
    if (!compact || !menuOpen) return;
    const first = menuRef.current?.querySelector<HTMLElement>("button, a");
    first?.focus();
  }, [compact, menuOpen, privacyConfirming]);

  useEffect(() => {
    if (!compact || !menuOpen) return;
    // Escape closes the disclosure wherever focus sits inside the widget —
    // the panel itself is not focusable, so a keydown on body (or a menu
    // action) must still reach the handler. Listened on document: the
    // Leaflet popup is the only surface that can host this root.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setPrivacyConfirming(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [compact, menuOpen]);

  async function toggle(action: ActionType) {
    if (authState !== "signed-in" || busyAction !== null) return;
    setBusyAction(action);
    setError(null);
    const token = csrfToken();
    const isActive = myAction === action;
    try {
      const response = await fetch(`/api/cameras/${recordId}/actions`, {
        method: isActive ? "DELETE" : "PUT",
        headers: token ? { "x-csrf-token": token } : {},
        body: isActive ? undefined : JSON.stringify({ action }),
      });
      if (response.ok) {
        if (isActive) {
          // DELETE answers { action: null } without counts; removing MY
          // action reduces the distinct count of that action by exactly 1.
          const nextCounts = { ...counts, [action]: Math.max(0, counts[action] - 1) };
          setMyAction(null);
          setCounts(nextCounts);
          // BUG t_5bc23d61: report the server-confirmed (decremented)
          // counts to the popup mount helper so a remount from the stale
          // map payload cannot revert the visible count.
          onCountsChange?.(nextCounts);
        } else {
          const body = (await response.json()) as { action: ActionType; counts?: ActionCounts };
          setMyAction(body.action);
          if (body.counts) {
            setCounts(body.counts);
            // BUG t_5bc23d61: the PUT response is the ONLY authority for
            // the aggregate counts — persist them across popup remounts.
            onCountsChange?.(body.counts);
          }
        }
        // A completed action closes the disclosure panel (the record state
        // is now visible on the toolbar / menu counts).
        setMenuOpen(false);
        setPrivacyConfirming(false);
        return;
      }
      if (response.status === 401) {
        setAuthState("anonymous");
        setError(actions.errorSessionEnded);
      } else if (response.status === 403) {
        setError(actions.errorSelfAction);
      } else if (response.status === 409) {
        setMyAction(action);
        setError(actions.errorDuplicate);
      } else if (response.status === 429) {
        setError(actions.errorGeneric);
      } else {
        setError(actions.errorGeneric);
      }
    } catch {
      setError(actions.errorGeneric);
    } finally {
      setBusyAction(null);
    }
  }

  const labelFor: Record<ActionType, string> = {
    like: actions.like,
    confirm: actions.confirm,
    gone: actions.gone,
    problem: actions.problem,
    privacy: actions.privacy,
  };
  const helpFor: Record<ActionType, string> = {
    like: actions.likeHelp,
    confirm: actions.confirmHelp,
    gone: actions.goneHelp,
    problem: actions.problemHelp,
    privacy: actions.privacyHelp,
  };

  const renderActionButton = (action: ActionType, variant: "toolbar" | "menu" | "full") => {
    const count = counts[action];
    const busy = busyAction === action;
    const disabled = authState !== "signed-in" || busyAction !== null;
    return (
      <button
        key={action}
        type="button"
        className={`community-action${myAction === action ? " is-active" : ""}${variant === "menu" ? " community-action-menu" : ""}`}
        aria-pressed={myAction === action}
        aria-label={`${helpFor[action]}${myAction === action ? ` (${actions.removeYourAction})` : ""}`}
        disabled={disabled}
        onClick={() => {
          // Privacy always goes through the explicit confirm step first
          // (redesign t_b7728ad0): the panel swaps to the confirmation.
          if (compact && action === "privacy") {
            setPrivacyConfirming(true);
            return;
          }
          void toggle(action);
        }}
      >
        {variant === "toolbar" && <ToolbarIcon name={action === "like" ? "useful" : "confirm"} />}
        <span className="community-action-label">{labelFor[action]}{busy ? ` ${actions.updating}` : ""}</span>
        <span className="community-count" aria-hidden="true">{count}</span>
        <span role="status" className="sr-only">{actions.countOf(labelFor[action], count)}</span>
      </button>
    );
  };

  // Compact (map popup): toolbar = the two visible actions + the disclosure
  // trigger; the remaining actions live in the accessible panel. Full
  // (record page): the classic five-action grid, unchanged.
  const body = compact ? (
    <>
      <div className="community-toolbar">
        {TOOLBAR_ACTIONS.map((action) => renderActionButton(action, "toolbar"))}
        <button
          ref={triggerRef}
          type="button"
          className={`community-more-trigger${menuOpen ? " is-open" : ""}`}
          aria-expanded={menuOpen}
          aria-controls={panelId}
          aria-label={actions.moreActionsHelp}
          onClick={() => {
            setMenuOpen((open) => !open);
            setPrivacyConfirming(false);
          }}
        >
          <ToolbarIcon name="more" />
          <span className="community-action-label">{actions.moreActions}</span>
        </button>
      </div>
      <div
        ref={menuRef}
        id={panelId}
        className={`community-toolbar-panel${menuOpen ? " is-open" : ""}`}
        role="group"
        aria-label={actions.moreMenuLabel}
        hidden={!menuOpen}
      >
        {privacyConfirming ? (
          <div className="community-privacy-confirm" role="alertdialog" aria-label={actions.privacyConfirmTitle}>
            <p className="community-privacy-confirm-title">{actions.privacyConfirmTitle}</p>
            <p className="community-privacy-confirm-body">{actions.privacyConfirmBody}</p>
            <div className="community-privacy-confirm-actions">
              <button
                type="button"
                className="community-action community-action-menu community-action-danger"
                disabled={authState !== "signed-in" || busyAction !== null}
                onClick={() => void toggle("privacy")}
              >
                <span className="community-action-label">{actions.privacyConfirmAction}</span>
                <span role="status" className="sr-only">{actions.countOf(labelFor.privacy, counts.privacy)}</span>
              </button>
              <button
                type="button"
                className="community-action community-action-menu"
                disabled={busyAction !== null}
                onClick={() => setPrivacyConfirming(false)}
              >
                <span className="community-action-label">{actions.cancel}</span>
              </button>
            </div>
          </div>
        ) : (
          MENU_ACTIONS.map((action) => renderActionButton(action, "menu"))
        )}
      </div>
    </>
  ) : (
    <div className="community-actions-grid">
      {ACTION_ORDER.map((action) => renderActionButton(action, "full"))}
    </div>
  );

  return (
    <section className={`community-actions${compact ? " community-actions-compact" : ""}`} aria-label={actions.sectionLabel}>
      {body}
      {authState === "anonymous" && (
        <p className="community-actions-cta">
          <a href="/login">{actions.anonymousCta} <span aria-hidden="true">→</span></a>
        </p>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  );
}
