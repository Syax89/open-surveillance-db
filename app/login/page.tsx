import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginPageBody } from "./LoginPageBody";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /login — multi-method sign-in (Fase E2, design review).
 *
 * Thin server shell (pattern /account and /forgot-password): the interactive
 * body is the client component LoginPageBody ("use client", same file family
 * as the tool routes). The shell owns the per-page metadata (F5 QA#6) and
 * the localized SSR Suspense fallback (F2 QA#6), both resolved from the
 * locale cookie via getServerMessages — so an Italian user never sees the
 * English "Loading…" or the generic root title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = (await getServerMessages()).auth;
  return {
    title: `${t.loginTitle} — OpenSurveillanceDB`,
    description: t.loginMetaDescription,
    // Auth pages: never indexed, consistent with the sibling auth routes
    // (docs/FRONTEND_PLAN.md §1.3).
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage() {
  const t = (await getServerMessages()).auth;
  return (
    <Suspense fallback={<p className="loading-note">{t.loading}</p>}>
      <LoginPageBody />
    </Suspense>
  );
}
