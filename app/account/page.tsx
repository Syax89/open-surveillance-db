import type { Metadata } from "next";
import AccountPageBody from "./AccountPageBody";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /account — contributor profile (F3 a11y H2, t_793479ed).
 *
 * Server shell: static per-page <title> (2.4.2 Page Titled), localized from
 * the locale cookie like the informational pages (ADR 0015). The body
 * (AccountPageBody) keeps the full client auth/profile surface.
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  return {
    title: `${bundle.auth.accountTitle} — OpenSurveillanceDB`,
  };
}

export default function AccountPage() {
  return <AccountPageBody />;
}
