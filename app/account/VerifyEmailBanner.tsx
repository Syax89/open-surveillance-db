"use client";

// Email-verification banner (P1-1 design review), extracted from
// AccountPageBody: until emailVerifiedAt is set the write gate (Fase E1)
// refuses every public write, so the account page must say so and offer
// the resend — the register→verify→write flow was a dead end. Same session
// contract as the /verify-email page: POST /api/auth/verify-email/resend.
// The resend state is local to the banner.

import { useState } from "react";
import { useDomainMessages } from "../lib/use-domain-messages";
import { authByLocale } from "../lib/i18n/auth";
import { readCsrfToken } from "../lib/csrf";

type Props = {
  /** contributor.emailVerifiedAt from the profile read (null = unverified). */
  emailVerifiedAt: string | null;
};

export function VerifyEmailBanner({ emailVerifiedAt }: Props) {
  const t = useDomainMessages(authByLocale);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  async function onResendVerification() {
    setResendingVerification(true);
    setVerificationMessage(null);
    try {
      const csrfToken = readCsrfToken();
      const response = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.ok) {
        setVerificationMessage(t.verifyBannerResent);
        return;
      }
      if (response.status === 429) {
        setVerificationMessage(t.verifyResendRateLimited);
        return;
      }
      setVerificationMessage(t.verifyResendError);
    } catch {
      setVerificationMessage(t.verifyResendError);
    } finally {
      setResendingVerification(false);
    }
  }

  if (emailVerifiedAt) {
    return <p className="verify-banner-done" role="status">{t.verifyBannerDone}</p>;
  }

  return (
    <section className="verify-banner" aria-labelledby="verify-banner-title">
      <h2 id="verify-banner-title">{t.verifyBannerTitle}</h2>
      <p className="record-detail-summary">{t.verifyBannerBody}</p>
      <p className="auth-switch">
        <button className="button detail-outline" type="button" onClick={() => void onResendVerification()} disabled={resendingVerification}>
          {resendingVerification ? t.loading : t.verifyBannerResend}
        </button>
      </p>
      {verificationMessage ? (
        <p className={verificationMessage === t.verifyBannerResent ? "verify-banner-done" : "auth-error"} role={verificationMessage === t.verifyBannerResent ? "status" : "alert"}>
          {verificationMessage}
        </p>
      ) : null}
    </section>
  );
}
