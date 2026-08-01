import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalPageContent, LegalBlock } from "../lib/legal";
import { SiteHeader } from "./SiteHeader";

/**
 * Shared layout for the public legal / information pages
 * (/privacy, /termini, /licenze).
 *
 * Server Component (no "use client"): pages render statically with per-route
 * metadata (SSR/SEO, task t_c36fe96c). The only client island is the
 * navigation shell <SiteHeader />, which renders the <LocaleToggle />. The
 * nav labels come from the page as props (the page is a Server Component and
 * cannot call useMessages()); content is passed as data by the same page.
 *
 * Renders the same navigation shell, reading column and footer used by
 * the rest of the site (see app/guide/page.tsx), with a common
 * "info page" document layout for the legal content.
 *
 * Inline markup supported inside block text (see app/lib/legal/types.ts):
 *   **bold**  → <strong>
 *   *italic*  → <em>
 *   [label](url) → <a href="url">
 */
const inlineMarkup = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(inlineMarkup);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={key} href={link[2]}>
          {link[1]}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function renderBlock(block: LegalBlock, keyPrefix: string): ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={keyPrefix}>{renderInline(block.text, keyPrefix)}</p>;
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={`${keyPrefix}-item-${index}`}>{renderInline(item, `${keyPrefix}-item-${index}`)}</li>
      ));
      return block.ordered ? (
        <ol key={keyPrefix}>{items}</ol>
      ) : (
        <ul key={keyPrefix}>{items}</ul>
      );
    }
    case "note":
      return (
        <div className="legal-note" key={keyPrefix} role="note">
          {renderInline(block.text, keyPrefix)}
        </div>
      );
    case "table":
      return (
        <div className="legal-table-wrap" key={keyPrefix}>
          <table className="legal-table">
            {block.caption ? <caption>{block.caption}</caption> : null}
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th key={`${keyPrefix}-th-${index}`} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${keyPrefix}-tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${keyPrefix}-td-${rowIndex}-${cellIndex}`}>
                      {renderInline(cell, `${keyPrefix}-td-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export interface LegalNavLabels {
  mainNavigation: string;
  homeAria: string;
  exploreMap: string;
  browseRecords: string;
  howItWorks: string;
}

export function LegalPage({ content, navLabels }: { content: LegalPageContent; navLabels: LegalNavLabels }) {
  return (
    <main id="main-content" className="record-page">
      <SiteHeader navLabel={navLabels.mainNavigation} homeLabel={navLabels.homeAria}>
        <div className="nav-links">
          <Link href="/#map">{navLabels.exploreMap}</Link>
          <Link href="/#records">{navLabels.browseRecords}</Link>
          <Link href="/guide">{navLabels.howItWorks}</Link>
        </div>
      </SiteHeader>

      <article className="record-detail">
        <p className="eyebrow"><span /> {content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="record-detail-summary">{content.intro}</p>

        {content.sections.map((section, sectionIndex) => (
          <section
            className="legal-section"
            aria-labelledby={`legal-section-${sectionIndex}`}
            key={`section-${sectionIndex}`}
          >
            <h2 id={`legal-section-${sectionIndex}`}>{section.heading}</h2>
            {section.blocks.map((block, blockIndex) =>
              renderBlock(block, `section-${sectionIndex}-block-${blockIndex}`),
            )}
          </section>
        ))}

        <p className="record-detail-note">{content.versionNote}</p>
      </article>
    </main>
  );
}
