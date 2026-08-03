"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMessages } from "./LocaleProvider";

/**
 * WriteGateWall (P1-2 Vera design) — the login wall for the public write
 * tools (/segnala, /correggi). The write gate (Fase E1, ADR 0020 d.1)
 * requires a VERIFIED contributor session for every public write; this
 * component gates the form itself instead of letting an anonymous visitor
 * fill it and hit a raw 401/403 at submit time:
 *
 *   - anonymous (401 from /api/auth/me) → bilingual wall "log in to
 *     contribute" with returnTo (back to the tool after login);
 *   - authenticated but NOT verified (emailVerifiedAt null) → "verify your
 *     email to contribute" wall with a resend action;
 *   - verified → renders the children (the form).
 *
 * Session state comes from GET /api/auth/me — the same no-store personal
 * endpoint the header and /account use. Failures render the honest wall
 * error, never the raw server write-gate string.
 */

type WallState =
  | { kind: "checking" }
  | { kind: "anonymous" }
  | { kind: "unverified" }
  | { kind: "error" }
  | { kind: "verified" };

export function WriteGateWall({ returnTo, children }: { returnTo: string; children: ReactNode }) {
  const t = useMessages().auth;
  const [state, setState] = useState<WallState>({ kind: "checking" });
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const check = useCallback(() => {
    const controller = new AbortController();
    // All setState calls happen in promise continuations, never synchronously
    // in the effect body (react-hooks/set-state-in-effect) — same pattern as
    // AccountPageBody's loaders and the /verify-email page.
    Promise.resolve()
      .then(() => { setState({ kind: "checking" }); setResendMessage(null); })
      .then(() => fetch("/api/auth/me", { signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) {
          setState({ kind: "anonymous" });
          return;
        }
        if (!response.ok) {
          setState({ kind: "error" });
          return;
        }
        const body = await response.json() as { contributor?: { emailVerifiedAt?: string | null } };
        if (body.contributor?.emailVerifiedAt) {
          setState({ kind: "verified" });
        } else {
          setState({ kind: "unverified" });
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setState({ kind: "error" });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => check(), [check]);

  async function onResend() {
    setResendBusy(true);
    setResendMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      if (response.ok) {
        setResendMessage(t.wallResent);
        return;
      }
      if (response.status === 429) {
        setResendMessage(t.verifyResendRateLimited);
        return;
      }
      setResendMessage(t.verifyResendError);
    } catch {
      setResendMessage(t.verifyResendError);
    } finally {
      setResendBusy(false);
    }
  }

  if (state.kind === "verified") return <>{children}</>;

  return (
    <div className="write-gate-wall" aria-live="polite">
      {state.kind === "checking" ? <p className="loading-note">{t.wallChecking}</p> : null}

      {state.kind === "anonymous" ? (
        <>
          <h2>{t.wallLoginTitle}</h2>
          <p className="record-detail-summary">{t.wallLoginBody}</p>
          <p className="auth-switch">
            <Link className="button button-primary" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              {t.wallLogIn}
            </Link>{" "}
            <Link className="button detail-outline" href={`/register?returnTo=${encodeURIComponent(returnTo)}`}>
              {t.wallCreateAccount}
            </Link>
          </p>
        </>
      ) : null}

      {state.kind === "unverified" ? (
        <>
          <h2>{t.wallVerifyTitle}</h2>
          <p className="record-detail-summary">{t.wallVerifyBody}</p>
          <p className="auth-switch">
            <button className="button button-primary" type="button" onClick={() => void onResend()} disabled={resendBusy}>
              {resendBusy ? t.loading : t.wallResend}
            </button>
          </p>
          {resendMessage ? <p className="auth-error" role="alert">{resendMessage}</p> : null}
          <p className="auth-switch">
            <Link href="/account">{t.wallGoToAccount}</Link>
          </p>
        </>
      ) : null}

      {state.kind === "error" ? (
        <>
          <h2>{t.wallLoginTitle}</h2>
          <p className="record-detail-summary">{t.wallError}</p>
          <p className="auth-switch">
            <button className="text-button" type="button" onClick={() => check()}>{t.loading ? t.verifyTitle : t.wallLogIn}</button>
          </p>
        </>
      ) : null}
    </div>
  );
}
