import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleToggle } from "./LocaleProvider";

/**
 * Shared layout for the public informational pages
 * (/manifesto, /regole, /guide, /faq, /contatti, /moderazione).
 *
 * Server Component (no "use client"): the pages render statically on the
 * server with per-route metadata (SSR/SEO, task t_c36fe96c). The only client
 * island is <LocaleToggle />, which re-renders the route via router.refresh()
 * when the user switches language.
 *
 * Encapsulates the structure those pages previously duplicated: the
 * navigation shell (nav-shell with brand + page nav links + locale
 * toggle), the intro article (eyebrow / title / summary / CTA action
 * row) and the content sections, which each page supplies as children.
 *
 * Renders exactly the markup the per-page copies produced, so adopting
 * it is behaviour-neutral by construction (see tests/rendered-html.test.mjs
 * for the structural contracts that stay pinned).
 *
 * Nav links and CTA buttons differ per page, so both are injected as
 * props; every page's copy lives in its own i18n bundle untouched.
 */
export interface InfoPageProps {
  /** aria-label for the navigation shell (page bundle, e.g. t.navigation). */
  navLabel: string;
  /** aria-label for the brand link to the homepage (e.g. t.homeAria). */
  homeLabel: string;
  /** Links rendered inside .nav-links — each page provides its own set. */
  navLinks: ReactNode;
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
  navLinks,
  eyebrow,
  title,
  intro,
  actions,
  children,
}: InfoPageProps) {
  return (
    <main id="main-content" className="record-page">
      <nav className="nav-shell" aria-label={navLabel}>
        <Link className="brand" href="/" aria-label={homeLabel}>
          <span className="brand-mark" aria-hidden="true">◉</span>
          <span>OpenSurveillanceDB</span>
        </Link>
        <div className="nav-links">{navLinks}</div>
        <LocaleToggle />
      </nav>

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
