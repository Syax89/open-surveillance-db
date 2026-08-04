"use client";

import { useContext, useEffect, useState } from "react";
import { LocaleContext } from "../components/LocaleProvider";
import { messages } from "../lib/i18n";
import type { MessageBundle } from "../lib/i18n";

/**
 * Community action widget (ADR 0021 §3, FASE 3 UI) — the five-action
 * surface of the community-driven directory: like (useful), confirm,
 * gone, problem, privacy. One component, two mounts:
 *
 *   - full: /records/[id] — five labelled buttons with live counts;
 *   - compact: map marker popup — same buttons, tighter spacing.
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
 * a11y (task FASE 3): each count is a role="status" live region whose
 * sr-only text carries the label ("Useful: 12"), so a count change is
 * announced without spamming five regions on first paint; buttons use
 * aria-pressed for the active action; errors land in role="alert".
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

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("osdb_csrf="));
  return match ? decodeURIComponent(match.slice("osdb_csrf=".length)) : null;
}

const zeroCounts = (): ActionCounts => ({ like: 0, confirm: 0, gone: 0, problem: 0, privacy: 0 });

export function CommunityActions({
  recordId,
  counts: initialCounts,
  compact = false,
  bundle: bundleProp,
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
          setMyAction(null);
          setCounts((current) => ({ ...current, [action]: Math.max(0, current[action] - 1) }));
        } else {
          const body = (await response.json()) as { action: ActionType; counts?: ActionCounts };
          setMyAction(body.action);
          if (body.counts) setCounts(body.counts);
        }
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

  return (
    <section className={`community-actions${compact ? " community-actions-compact" : ""}`} aria-label={actions.sectionLabel}>
      <div className="community-actions-grid">
        {ACTION_ORDER.map((action) => {
          const count = counts[action];
          const busy = busyAction === action;
          const disabled = authState !== "signed-in" || busyAction !== null;
          return (
            <button
              key={action}
              type="button"
              className={`community-action${myAction === action ? " is-active" : ""}`}
              aria-pressed={myAction === action}
              aria-label={`${helpFor[action]}${myAction === action ? ` (${actions.removeYourAction})` : ""}`}
              disabled={disabled}
              onClick={() => void toggle(action)}
            >
              <span className="community-action-label">{labelFor[action]}{busy ? ` ${actions.updating}` : ""}</span>
              <span className="community-count" aria-hidden="true">{count}</span>
              <span role="status" className="sr-only">{actions.countOf(labelFor[action], count)}</span>
            </button>
          );
        })}
      </div>
      {authState === "anonymous" && (
        <p className="community-actions-cta">
          <a href="/login">{actions.anonymousCta} <span aria-hidden="true">→</span></a>
        </p>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  );
}
