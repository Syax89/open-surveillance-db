"use client";

import { useEffect, useState } from "react";
import { StarConfirmButton } from "./StarConfirmButton";
import { useMessages } from "../lib/use-messages";
import type { TrustLevelMeta } from "../lib/trust-levels";

/**
 * Community verification widget for the record detail (C5, ADR 0018 §2).
 *
 * Owns the personal toggle state and the trust-level gate. Mounted with
 * `key={recordId}` by the record page, so navigating between records
 * remounts it and every state resets naturally (no setState-synchronously-
 * in-effect, react-hooks rule) while the aggregate count always comes from
 * the public record payload.
 *
 * Gate order (fail-closed): while the personal-state checks are pending the
 * toggle is disabled; an anonymous caller or an L0 contributor sees the
 * disabled button with explicit explanatory copy — the server is the
 * authority (401/403), the button never pretends to work.
 */
export function VerificationWidget({
  recordId,
  aggregateCount,
}: {
  recordId: number;
  aggregateCount: number;
}) {
  const bundle = useMessages();
  const community = bundle.community;
  const [confirmed, setConfirmed] = useState(false);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [verificationGate, setVerificationGate] = useState<"checking" | "anonymous" | "level" | "error">("checking");
  const [level, setLevel] = useState<TrustLevelMeta | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Personal verification state + trust level (both no-store personal
  // data). All setState calls happen in async continuations — nothing
  // synchronous in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/cameras/${recordId}/confirmation`).then((response) =>
        response.ok ? response.json() as Promise<{ confirmed: boolean }> : Promise.reject(new Error())),
      fetch("/api/auth/me").then((response) =>
        response.status === 401
          ? Promise.resolve(null)
          : response.ok ? response.json() as Promise<{ level?: TrustLevelMeta }> : Promise.reject(new Error())),
    ])
      .then(([confirmation, profile]) => {
        if (cancelled) return;
        setConfirmed(confirmation.confirmed);
        if (profile === null) {
          setVerificationGate("anonymous");
        } else {
          setLevel(profile.level ?? null);
          setVerificationGate("level");
        }
      })
      .catch(() => { if (!cancelled) setVerificationGate("error"); });
    return () => { cancelled = true; };
  }, [recordId]);

  async function onToggleVerification() {
    if (verificationGate !== "level" || level === null || level.level < 1) return;
    // CSRF double-submit: echo the script-readable cookie (same pattern as
    // /account mutations). The server also enforces same-origin + bucket.
    let csrfToken: string | null = null;
    if (typeof document !== "undefined") {
      const match = document.cookie.split(";").map((part) => part.trim())
        .find((part) => part.startsWith("osdb_csrf="));
      csrfToken = match ? decodeURIComponent(match.slice("osdb_csrf=".length)) : null;
    }
    setToggleBusy(true);
    setConfirmError(null);
    const method = confirmed ? "DELETE" : "PUT";
    try {
      const response = await fetch(`/api/cameras/${recordId}/confirmation`, {
        method,
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.ok) {
        const body = (await response.json()) as { confirmed: boolean; count: number };
        setConfirmed(body.confirmed);
        setConfirmCount(body.count);
      } else if (response.status === 403) {
        // Server fail-closed gate (self-verify or level): surface the exact
        // reason; the toggle stays disabled for this session.
        setConfirmError(community.errorSelfVerify);
        setVerificationGate("error");
      } else if (response.status === 409) {
        setConfirmError(community.errorAlreadyVerified);
        setConfirmed(true);
      } else {
        setConfirmError(confirmed ? community.errorRemoveVerification : community.errorAddVerification);
      }
    } catch {
      setConfirmError(confirmed ? community.errorRemoveVerification : community.errorAddVerification);
    } finally {
      setToggleBusy(false);
    }
  }

  // Fail-closed gate copy: anonymous → log in; level L0 → first published
  // contribution needed; error → no copy, disabled only. The server answers
  // 401/403 regardless — the copy only explains.
  const gateDisabled = verificationGate !== "level" || level === null || level.level < 1;
  const gateReason = verificationGate === "anonymous"
    ? community.loginToVerify
    : level !== null && level.level < 1
      ? community.gateL1Help
      : null;
  const count = confirmCount ?? aggregateCount;

  return (
    <section className="confirm-widget-wrap" aria-label={community.verifications}>
      <StarConfirmButton
        count={count}
        confirmed={confirmed}
        busy={toggleBusy}
        disabled={gateDisabled}
        disabledReason={gateReason}
        onToggle={() => void onToggleVerification()}
      />
      {confirmError ? <p className="auth-error" role="alert">{confirmError}</p> : null}
    </section>
  );
}
