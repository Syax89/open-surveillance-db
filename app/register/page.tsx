import type { Metadata } from "next";
import { RegisterPageBody } from "./RegisterPageBody";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /register — contributor registration.
 *
 * Thin server shell (pattern /account and /forgot-password): the interactive
 * body is the client component RegisterPageBody ("use client"). The shell
 * owns the per-page metadata (F5 QA#6), resolved from the locale cookie via
 * getServerMessages — the tab title and meta description are localized and
 * no longer fall back to the generic root values.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = (await getServerMessages()).auth;
  return {
    title: `${t.registerTitle} — OpenSurveillanceDB`,
    description: t.registerMetaDescription,
    // Auth pages: never indexed, consistent with the sibling auth routes
    // (docs/FRONTEND_PLAN.md §1.3).
    robots: { index: false, follow: false },
  };
}

export default function RegisterPage() {
  return <RegisterPageBody />;
}
