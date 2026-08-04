import type { ReactNode } from "react";
import type { LegalPageContent, LegalBlock } from "../lib/legal";
import { PublicNav } from "./PublicNav";
import { LegalTableWrap } from "./LegalTableWrap";

/**
 * Shared layout for the public legal / information pages
 * (/privacy, /termini, /licenze, /accessibility).
 *
 * Server Component (no "use client"): pages render statically with per-route
 * metadata (SSR/SEO, task t_c36fe96c). The only client island is the shared
 * public header <PublicNav /> (brand + six public nav links + mobile menu +
 * LocaleToggle). The nav landmark labels come from the page as props (the
 * page is a Server Component and cannot call useMessages()); the nav LINK
 * SET is the shared public set (PublicNavLinks via PublicNav, t_a72a3106) —
 * the same six links of the home hub on EVERY public page, with the current
 * page marked aria-current (CEO check 2026-08-02). Content is passed as
 * data by the same page.
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
      // Recursive (QA#2 F2): the greedy bold token can swallow an inner
      // link — `**[ODbL 1.0](url)**` matches as ONE bold token, so the
      // link must be re-rendered from the inner text. Recurse only when
      // the inner text carries markup (a link; `[^*]` inside the token
      // means no `**` can be nested), keeping plain bold as plain text.
      const inner = part.slice(2, -2);
      return (
        <strong key={key}>
          {/\[[^\]]+\]\([^)]+\)/.test(inner) ? renderInline(inner, key) : inner}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const inner = part.slice(1, -1);
      return (
        <em key={key}>
          {/\[[^\]]+\]\([^)]+\)/.test(inner) ? renderInline(inner, key) : inner}
        </em>
      );
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
        // QA#2 F1: the wrapper is scrollable (overflow-x: auto in
        // globals.css) — LegalTableWrap makes it a keyboard-focusable
        // region (tabIndex=0 + role=region + aria-label) only when the
        // table actually overflows, so keyboard users can reach and
        // scroll it (WCAG 2.1.1, axe scrollable-region-focusable).
        <LegalTableWrap key={keyPrefix}>
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
        </LegalTableWrap>
      );
  }
}

export interface LegalNavLabels {
  mainNavigation: string;
  homeAria: string;
}

export function LegalPage({ content, navLabels }: { content: LegalPageContent; navLabels: LegalNavLabels }) {
  return (
    <main id="main-content" className="record-page">
      <PublicNav navLabel={navLabels.mainNavigation} homeLabel={navLabels.homeAria} />

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
