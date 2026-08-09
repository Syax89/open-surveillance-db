import type { Metadata } from "next";
import { ForgotPasswordBody } from "./ForgotPasswordBody";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /forgot-password — password-reset request page (P1-3 design review).
 *
 * Purely client-side (like /login): the form posts the email to
 * POST /api/auth/reset-password/request, which answers a GENERIC success
 * whether or not the account exists (anti-enumeration). The page mirrors
 * that contract: every submit shows the same "if an account exists…"
 * confirmation, never revealing whether the address is registered.
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  return {
    title: `${bundle.auth.forgotTitle} — OpenSurveillanceDB`,
    robots: { index: false, follow: false },
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordBody />;
}
