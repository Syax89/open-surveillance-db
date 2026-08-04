import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmailBody } from "./VerifyEmailBody";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /verify-email — email-verification landing page (P1-1 Vera design).
 *
 * The verification email used to link straight to GET /api/auth/verify-email
 * (raw JSON in the browser). This page is the human landing: it reads the
 * ?token= query param and consumes the same API client-side, then renders a
 * real outcome page (success / invalid / expired) with a resend action when
 * the token is dead.
 *
 * The link in the mailer is built by app/lib/mailer.ts (sendVerificationEmail)
 * and app/lib/email-templates.ts (buildAuthActionUrl) — both now point here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  return {
    title: `${bundle.auth.verifyTitle} — OpenSurveillanceDB`,
    robots: { index: false, follow: false },
  };
}

export default async function VerifyEmailPage() {
  const t = (await getServerMessages()).auth;
  return (
    <Suspense fallback={<p className="loading-note">{t.loading}</p>}>
      <VerifyEmailBody />
    </Suspense>
  );
}
