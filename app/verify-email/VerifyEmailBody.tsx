"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMessages } from "../lib/use-messages";
import { PublicNav } from "../components/PublicNav";

/**
 * /verify-email body (P1-1 design review) — consumes the single-use token from
 * the emailed link against GET /api/auth/verify-email and renders a real
 * outcome page instead of raw JSON:
 *
 *   - verifying        → initial state, the API call is in flight;
 *   - verified         → 200: the account is write-capable now;
 *   - invalid (400)    → malformed/unknown token (generic, anti-enumeration);
 *   - expired (410)    → used or past TTL: offer a resend;
 *   - error            → 5xx/network: honest failure, no fake success.
 *
 * Resend (POST /api/auth/verify-email/resend) requires a live session; when
 * the caller is anonymous the wall explains that logging in unlocks the
 * resend (same session contract as the /account banner).
 */

type VerifyState =
  | { kind: "verifying" }
  | { kind: "verified" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "error" };

export function VerifyEmailBody() {
  const bundle = useMessages();
  const t = bundle.auth;
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<VerifyState>({ kind: "verifying" });
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const consume = useCallback(() => {
    const controller = new AbortController();
    // All setState calls happen in promise continuations, never synchronously
    // in the effect body (react-hooks/set-state-in-effect) — the same pattern
    // as AccountPageBody's loaders. The first continuation resets the UI to
    // the verifying state.
    Promise.resolve()
      .then(() => { setState({ kind: "verifying" }); setResendMessage(null); })
      .then(() => fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { signal: controller.signal }))
      .then(async (response) => {
        if (response.ok) {
          setState({ kind: "verified" });
          return;
        }
        if (response.status === 410) {
          setState({ kind: "expired" });
          return;
        }
        if (response.status === 400) {
          setState({ kind: "invalid" });
          return;
        }
        setState({ kind: "error" });
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    // A missing/empty token is structurally invalid: no fetch, honest state.
    // Deferred in a microtask — same pattern as the other auth pages
    // (react-hooks/set-state-in-effect: no sync setState in the effect body).
    if (!token) {
      void Promise.resolve().then(() => setState({ kind: "invalid" }));
      return;
    }
    return consume();
  }, [token, consume]);

  async function onResend() {
    setResendBusy(true);
    setResendMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      if (response.ok) {
        setResendMessage(t.verifyResent);
        return;
      }
      if (response.status === 401) {
        setResendMessage(t.verifyLoginToResend);
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

  return (
    <main id="main-content" className="record-page">
      <PublicNav navLabel={t.navigation} homeLabel={t.homeAria} />

      <article className="record-detail auth-card">
        <p className="eyebrow"><span /> {t.verifyTitle}</p>
        {/* Stable page heading (WCAG 2.4.2/1.3.1): the outcome below may be
            success/invalid/expired/error, but the h1 never disappears — the
            SSR shell and the verifying state always have a heading. */}
        <h1>{t.verifyTitle}</h1>

        {state.kind === "verifying" ? (
          <p className="record-detail-summary">{t.verifyChecking}</p>
        ) : null}

        {state.kind === "verified" ? (
          <>
            <h2>{t.verifySuccessTitle}</h2>
            <p className="record-detail-summary">{t.verifySuccessBody}</p>
            <p className="auth-switch">
              <Link className="button button-primary" href="/account">{t.verifyGoToAccount}</Link>
            </p>
          </>
        ) : null}

        {state.kind === "invalid" ? (
          <>
            <h2>{t.verifyInvalidTitle}</h2>
            <p className="record-detail-summary">{t.verifyInvalidBody}</p>
            <p className="auth-switch">
              <Link href="/account">{t.verifyLoginToResend}</Link>
            </p>
          </>
        ) : null}

        {state.kind === "expired" ? (
          <>
            <h2>{t.verifyExpiredTitle}</h2>
            <p className="record-detail-summary">{t.verifyExpiredBody}</p>
            <div className="verify-actions">
              <button className="button button-primary" type="button" onClick={() => void onResend()} disabled={resendBusy}>
                {resendBusy ? t.loading : t.verifyResend}
              </button>
              {resendMessage ? <p className="auth-error" role="alert">{resendMessage}</p> : null}
            </div>
            <p className="auth-switch">
              <Link href="/account">{t.verifyGoToAccount}</Link>
            </p>
          </>
        ) : null}

        {state.kind === "error" ? (
          <>
            <h2>{t.verifyTitle}</h2>
            <p className="record-detail-summary">{t.verifyError}</p>
            <p className="auth-switch">
              <button className="text-button" type="button" onClick={() => void consume()}>{t.verifyResend}</button>
            </p>
          </>
        ) : null}
      </article>
    </main>
  );
}
