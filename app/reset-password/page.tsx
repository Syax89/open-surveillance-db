import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordBody } from "./ResetPasswordBody";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /reset-password — consume the single-use reset token from the email
 * (P1-3 Vera design). Reads ?token= and posts the new password to
 * POST /api/auth/reset-password/confirm; renders success / invalid / expired
 * outcomes instead of raw JSON. The reset email (app/lib/mailer.ts
 * sendPasswordResetEmail) has always pointed here — the page simply did not
 * exist yet (the link was a 404, P1-3).
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  return {
    title: `${bundle.auth.resetTitle} — OpenSurveillanceDB`,
    robots: { index: false, follow: false },
  };
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="loading-note">Loading…</p>}>
      <ResetPasswordBody />
    </Suspense>
  );
}
