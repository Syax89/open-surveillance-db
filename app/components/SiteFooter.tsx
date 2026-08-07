"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./LocaleProvider";
// Root-layout graph: import ONLY the footer domain (F5 qa#5, t_ab0d4c75)
// so the ~150 KB two-locale dictionary never lands in the initial JS
// chunk — the footer is rendered on every page, so it must stay cheap.
import { en as footerEn, it as footerIt } from "../lib/i18n/footer";
import type { Locale, Translation } from "../lib/i18n";

const footerByLocale: Record<Locale, Translation<typeof footerEn>> = {
  en: footerEn,
  it: footerIt,
};

/**
 * Global site footer (landmark: contentinfo).
 *
 * Rendered once in the root layout so every page — public, guide, record,
 * moderation and auth — shares the same navigation and the required data
 * attribution:
 *  - a grouped route directory: explore, contribute, project and legal.
 *    This keeps the tools prominent without turning the footer into a flat
 *    wall of links; every public surface remains reachable from every page;
 *  - the ODbL 1.0 data licence notice for the database and exports
 *    (ADR 0008, docs/OPEN_SOURCE.md);
 *  - the OpenStreetMap attribution required for the map base layer
 *    (docs/OSM_INTEGRATION.md).
 *
 * The links live in a labelled <nav> so assistive technology can treat the
 * footer as a contentinfo landmark with a distinct navigation landmark.
 * Strings come from the shared EN/IT bundles (English pilot language, Italian
 * type-checked for parity), so the footer is fully localised like the rest of
 * the interface.
 *
 * Note: the local moderation queue (/moderation) is deliberately NOT linked
 * from the public footer. The page itself states it is a local-only tool
 * ("not linked from the public experience"), and the publication-boundaries
 * suite asserts that no public page exposes a moderation/admin endpoint.
 */
export function SiteFooter() {
  const { locale } = useLocale();
  const t = footerByLocale[locale];
  // Mark the current page in the institutional navigation (finding
  // QA-2026-08-01-3, closed in F-QA t_7b716c97): WCAG 2.4.2 / ARIA require
  // the active page to be exposed to assistive technology. The brand link
  // is the "home" entry, so it is marked on the root path.
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;
  const pageCurrent = (href: string) => (isActive(href) ? "page" : undefined);
  return (
    <footer className="site-footer" aria-label={t.landmarkLabel}>
      <div className="footer-brand">
        <Link className="brand" href="/" aria-label={t.homeAria} aria-current={pageCurrent("/")}>
          <span className="brand-mark" aria-hidden="true">◉</span>
          <span>OpenSurveillanceDB</span>
        </Link>
        <p>{t.tagline}</p>
      </div>
      <nav className="footer-links" aria-label={t.navigation}>
        <div className="footer-link-group">
          <p className="footer-link-group-title">{t.exploreGroup}</p>
          <Link href="/mappa" aria-current={pageCurrent("/mappa")}>{t.toolMap}</Link>
          <Link href="/directory" aria-current={pageCurrent("/directory")}>{t.toolDirectory}</Link>
        </div>
        <div className="footer-link-group">
          <p className="footer-link-group-title">{t.contributeGroup}</p>
          <Link href="/segnala" aria-current={pageCurrent("/segnala")}>{t.toolReport}</Link>
          <Link href="/correggi" aria-current={pageCurrent("/correggi")}>{t.toolCorrection}</Link>
          <Link href="/regole" aria-current={pageCurrent("/regole")}>{t.rules}</Link>
        </div>
        <div className="footer-link-group">
          <p className="footer-link-group-title">{t.projectGroup}</p>
          <Link href="/guide" aria-current={pageCurrent("/guide")}>{t.guide}</Link>
          <Link href="/manifesto" aria-current={pageCurrent("/manifesto")}>{t.manifesto}</Link>
          <Link href="/fonti" aria-current={pageCurrent("/fonti")}>{t.sources}</Link>
          <Link href="/faq" aria-current={pageCurrent("/faq")}>{t.faq}</Link>
          <Link href="/contatti" aria-current={pageCurrent("/contatti")}>{t.contact}</Link>
        </div>
        <details className="footer-link-group footer-policy-group">
          <summary>{t.legalGroup}</summary>
          <div className="footer-policy-links">
            <Link href="/privacy" aria-current={pageCurrent("/privacy")}>{t.privacy}</Link>
            <Link href="/termini" aria-current={pageCurrent("/termini")}>{t.terms}</Link>
            <Link href="/licenze" aria-current={pageCurrent("/licenze")}>{t.licenses}</Link>
            <Link href="/accessibility" aria-current={pageCurrent("/accessibility")}>{t.accessibility}</Link>
          </div>
        </details>
      </nav>
      <p className="footer-legal">
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="license">{t.dataLicense}</a>
        <span aria-hidden="true"> · </span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t.osmAttribution}</a>
      </p>
    </footer>
  );
}
