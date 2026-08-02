"use client";

import Link from "next/link";
import { SiteHeader } from "./SiteHeader";
import { useMessages } from "./LocaleProvider";

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
  const t = useMessages().errors;
  const notFound = statusCode === 404;

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
