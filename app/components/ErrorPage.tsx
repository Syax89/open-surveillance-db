"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SiteHeader } from "./SiteHeader";
// Error boundary is part of the root graph: import only the `errors`
// domain (F5 qa#5, t_ab0d4c75) instead of the full dictionary.
import { useLocale } from "./LocaleProvider";
import { en as errorsEn, it as errorsIt } from "../lib/i18n/errors";
import type { Locale, Translation } from "../lib/i18n";

const errorsByLocale: Record<Locale, Translation<typeof errorsEn>> = {
  en: errorsEn,
  it: errorsIt,
};

/**
 * Custom error page shell shared by the 404 (app/not-found.tsx) and the
 * 500 (app/error.tsx) pages (t_7eed4601).
 *
 * Renders with the existing design system (record-page / record-detail
 * classes, SiteHeader with the locale toggle, .button CTA styles) so a
 * dead end never looks like a broken page: the header and footer stay
 * reachable, the EN/IT toggle keeps working, and the primary action links
 * back to the homepage.
 *
 * Client component on purpose: app/error.tsx is an error boundary and must
 * be a client component; app/not-found.tsx renders this same shell, so the
 * copy is always resolved through LocaleProvider (useMessages) — the
 * persisted locale cookie is honoured on the error pages too.
 *
 * Privacy by design: the page never echoes the requested path or the error
 * message. A 404/500 page must not leak internal details (ADR 0002, the
 * same fail-closed stance as the moderation gate): status code, copy, CTA.
 */
export default function ErrorPage({
  statusCode,
  onRetry,
}: {
  statusCode: 404 | 500;
  /** Optional retry handler (500 only — error.tsx receives reset()). */
  onRetry?: () => void;
}) {
  const { locale } = useLocale();
  const t = errorsByLocale[locale];
  const notFound = statusCode === 404;

  // F5 (P3-3, WCAG 2.4.2): the 500 page is a client boundary (error.tsx),
  // so it cannot export generateMetadata — set the document <title> here.
  // The 404 title is already SSR'd by not-found.tsx's generateMetadata;
  // this effect reinforces the same value on hydration.
  useEffect(() => {
    document.title = notFound ? t.notFoundMetaTitle : t.serverErrorMetaTitle;
  }, [notFound, t]);

  return (
    <main id="main-content" className="record-page">
      <SiteHeader navLabel={t.navigation} homeLabel={t.homeAria}>
        <div className="nav-links">
          <Link className="nav-action" href="/">{t.backHome}</Link>
        </div>
      </SiteHeader>

      <article className="record-detail">
        <p className="eyebrow"><span /> {notFound ? t.notFoundEyebrow : t.serverErrorEyebrow}</p>
        <h1>{notFound ? t.notFoundTitle : t.serverErrorTitle}</h1>
        <p className="record-detail-summary">
          {notFound ? t.notFoundSummary : t.serverErrorSummary}
        </p>
        <div className="record-detail-actions">
          <Link className="button button-primary" href="/">{t.backHome} <span aria-hidden="true">←</span></Link>
          {onRetry ? (
            <button type="button" className="button button-quiet detail-outline" onClick={onRetry}>{t.tryAgain}</button>
          ) : null}
        </div>
      </article>
    </main>
  );
}
