import type { ReactNode } from "react";
import { PublicNav } from "./PublicNav";

/**
 * Shared layout for the public informational pages
 * (/manifesto, /regole, /guide, /faq and /contatti).
 *
 * Server Component (no "use client"): the pages render statically on the
 * server with per-route metadata (SSR/SEO, task t_c36fe96c). The only client
 * islands are <PublicNav /> (shared header: brand + primary public nav links +
 * mobile menu + locale toggle) and the toggle's router.refresh() when the
 * user switches language.
 *
 * Encapsulates the structure those pages previously duplicated: the shared
 * public header (PublicNav — the same primary links of the home hub
 * on EVERY public page, with the current page marked aria-current), the
 * intro article (eyebrow / title / summary / CTA action row) and the content
 * sections, which each page supplies as children.
 *
 * CTA buttons differ per page, so they are injected as props; every page's
 * copy lives in its own i18n bundle untouched.
 */
export interface InfoPageProps {
  /** aria-label for the navigation shell (page bundle, e.g. t.navigation). */
  navLabel: string;
  /** aria-label for the brand link to the homepage (e.g. t.homeAria). */
  homeLabel: string;
  /** Eyebrow text above the page title (e.g. t.eyebrow). */
  eyebrow: ReactNode;
  /** Page title (h1). */
  title: ReactNode;
  /** Intro paragraph below the title (.record-detail-summary). */
  intro: ReactNode;
  /** CTA buttons rendered in .record-detail-actions (optional). */
  actions?: ReactNode;
  /** Content sections rendered below the intro article. */
  children: ReactNode;
}

export function InfoPage({
  navLabel,
  homeLabel,
  eyebrow,
  title,
  intro,
  actions,
  children,
}: InfoPageProps) {
  return (
    <main id="main-content" className="record-page" data-surface="info">
      <PublicNav navLabel={navLabel} homeLabel={homeLabel} />

      <article className="record-detail">
        <p className="eyebrow"><span /> {eyebrow}</p>
        <h1>{title}</h1>
        <p className="record-detail-summary">{intro}</p>
        {actions ? <div className="record-detail-actions">{actions}</div> : null}
      </article>

      {children}
    </main>
  );
}
