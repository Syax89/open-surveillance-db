"use client";

import Link from "next/link";
import { useMessages } from "./LocaleProvider";

/**
 * Global site footer (landmark: contentinfo).
 *
 * Rendered once in the root layout so every page — public, guide, record,
 * moderation and auth — shares the same institutional navigation and the
 * required data attribution:
 *  - links to the public institutional pages (manifesto, rules, guide,
 *    privacy, terms, licenses, FAQ, contact);
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
  const t = useMessages().footer;
  return (
    <footer className="site-footer" aria-label={t.landmarkLabel}>
      <div className="footer-brand">
        <Link className="brand" href="/" aria-label={t.homeAria}>
          <span className="brand-mark" aria-hidden="true">◉</span>
          <span>OpenSurveillanceDB</span>
        </Link>
        <p>{t.tagline}</p>
      </div>
      <nav className="footer-links" aria-label={t.navigation}>
        <Link href="/manifesto">{t.manifesto}</Link>
        <Link href="/regole">{t.rules}</Link>
        <Link href="/guide">{t.guide}</Link>
        <Link href="/privacy">{t.privacy}</Link>
        <Link href="/termini">{t.terms}</Link>
        <Link href="/licenze">{t.licenses}</Link>
        <Link href="/accessibility">{t.accessibility}</Link>
        <Link href="/faq">{t.faq}</Link>
        <Link href="/contatti">{t.contact}</Link>
      </nav>
      <p className="footer-legal">
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="license">{t.dataLicense}</a>
        <span aria-hidden="true"> · </span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t.osmAttribution}</a>
      </p>
    </footer>
  );
}
