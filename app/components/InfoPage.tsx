"use client";

import Link from "next/link";
import { LocaleToggle, useLocale, useMessages } from "./LocaleProvider";
import { legalMessages, type LegalBlock, type LegalContent, type LegalPageContent } from "../lib/legal-content";

/**
 * Shared layout for the public legal / information pages
 * (/privacy, /termini, /licenze).
 *
 * Server components (app/privacy/page.tsx etc.) render this with a `page`
 * key; the content is looked up per locale from app/lib/legal-content.ts
 * (English canonical, Italian mirror). The layout reuses the global nav and
 * footer styles and always exposes the three legal pages in the footer.
 */
export function InfoPage({ page }: { page: keyof LegalContent }) {
  const { locale } = useLocale();
  const bundle = useMessages();
  const t = bundle.legal;
  const content: LegalPageContent = legalMessages[locale][page];

  return (
    <main id="main-content" className="info-page">
      <nav className="nav-shell" aria-label={t.navigation}>
        <Link className="brand" href="/" aria-label={t.homeAria}>
          <span className="brand-mark" aria-hidden="true">◉</span>
          <span>OpenSurveillanceDB</span>
        </Link>
        <div className="nav-links">
          <Link href="/#map">{t.map}</Link>
          <Link href="/#records">{t.directory}</Link>
          <Link href="/guide">{t.guide}</Link>
          <Link className="nav-action" href="/">{t.home}</Link>
        </div>
        <LocaleToggle />
      </nav>

      <article className="record-detail">
        <p className="eyebrow"><span /> {content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="record-detail-summary">{content.intro}</p>
        <p className="legal-updated">{content.updated}</p>
      </article>

      <div className="legal-body">
        {content.sections.map((section, sectionIndex) => (
          <section
            className="legal-section"
            key={sectionIndex}
            aria-labelledby={`legal-section-${sectionIndex}`}
          >
            <h2 id={`legal-section-${sectionIndex}`}>{section.heading}</h2>
            {section.blocks.map((block, blockIndex) => (
              <LegalBlockView key={blockIndex} block={block} />
            ))}
          </section>
        ))}
      </div>

      <footer>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">◉</span>
          <span>OpenSurveillanceDB</span>
        </div>
        <p>{t.footerTagline}</p>
        <div className="footer-links">
          <Link href="/#map">{t.map}</Link>
          <Link href="/#records">{t.directory}</Link>
          <Link href="/privacy">{t.privacy}</Link>
          <Link href="/termini">{t.terms}</Link>
          <Link href="/licenze">{t.licenses}</Link>
        </div>
      </footer>
    </main>
  );
}

/** Renders one content block of a legal section. */
function LegalBlockView({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "p":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul className="legal-list">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    case "note":
      return <p className="legal-note" role="note">{block.text}</p>;
    case "table":
      return (
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index} scope="col">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
