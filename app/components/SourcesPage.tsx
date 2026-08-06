import { PublicNav } from "./PublicNav";
import { LegalTableWrap } from "./LegalTableWrap";
import { formatPublicDate } from "../lib/format-date";
import { en as sourcesEn } from "../lib/i18n/sources";
import type { Translation, Locale } from "../lib/i18n";
import type { ImportBatchPublic } from "../../db/import-sources";

/**
 * /fonti — data sources page (import pipeline FASE C, t_4dbce318).
 *
 * Server-rendered presentational component: the page shell
 * (app/fonti/page.tsx) queries the committed import batches and passes
 * them here as data, so this component stays free of Workers bindings and
 * can be rendered in DOM tests with fixtures (same contract as LegalPage).
 *
 * Information architecture (CEO route decision 2026-08-05): /fonti is a
 * DEDICATED page, NOT a section of /licenze and NOT part of the main
 * navigation — it is linked from the footer next to Licences, because it
 * is attribution machinery rather than a daily tool.
 *
 * Per-source attribution contract (licence matrix,
 * docs/data-sources/licenze-compatibilita.md): every imported dataset
 * shows the entity name linked to the original site/dataset, the licence
 * linked to its text, the import date, the record count and the exact
 * attribution text persisted by the runner (never reconstructed here).
 * Only `committed` batches are listed (db/import-sources.ts).
 *
 * The table reuses the legal-table markup + LegalTableWrap (keyboard
 * scroll for wide tables, QA#2 F1) so the visual language matches the
 * institutional pages; the nav shell is the shared PublicNav.
 */
export interface SourcesPageProps {
  /** aria-labels for the public navigation shell (home bundle). */
  navLabels: { mainNavigation: string; homeAria: string };
  /** Localized strings for this page (the /fonti bundle). */
  t: Translation<typeof sourcesEn>;
  locale: Locale;
  batches: ImportBatchPublic[];
}

export function SourcesPage({ navLabels, t, locale, batches }: SourcesPageProps) {
  return (
    <main id="main-content" className="record-page" data-surface="sources">
      <PublicNav navLabel={navLabels.mainNavigation} homeLabel={navLabels.homeAria} />

      <article className="record-detail">
        <p className="eyebrow"><span /> {t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className="record-detail-summary">{t.intro}</p>

        <section className="sources-methodology" aria-labelledby="methodology-heading">
          <h2 id="methodology-heading">{t.methodologyTitle}</h2>
          <p>{t.methodologyIntro}</p>
          <div className="sources-methodology-grid">
            <article><h3>{t.scopeTitle}</h3><p>{t.scopeBody}</p></article>
            <article><h3>{t.collectionTitle}</h3><p>{t.collectionBody}</p></article>
            <article><h3>{t.correctionTitle}</h3><p>{t.correctionBody}</p></article>
            <article><h3>{t.limitsTitle}</h3><p>{t.limitsBody}</p></article>
          </div>
        </section>

        <section className="legal-section" aria-labelledby="sources-table-heading">
          <h2 id="sources-table-heading">{t.sourcesTitle}</h2>
          <p>{t.sourcesIntro}</p>
          {batches.length === 0 ? (
            <div className="legal-note" role="note">
              <p>{t.emptyTitle}</p>
              <p>{t.emptyBody}</p>
            </div>
          ) : (
            <LegalTableWrap>
              <table className="legal-table sources-table">
                <thead>
                  <tr>
                    <th scope="col">{t.sourceColumn}</th>
                    <th scope="col">{t.licenseColumn}</th>
                    <th scope="col">{t.importedOnColumn}</th>
                    <th scope="col">{t.recordsColumn}</th>
                    <th scope="col">{t.attributionColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <a href={batch.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {batch.sourceName}
                          <span className="sr-only"> ({t.openSource})</span>
                        </a>
                      </td>
                      <td>
                        {batch.licenseUrl ? (
                          <a href={batch.licenseUrl} target="_blank" rel="noopener noreferrer">
                            {batch.license}
                            <span className="sr-only"> ({t.openLicense})</span>
                          </a>
                        ) : (
                          batch.license
                        )}
                      </td>
                      <td><time dateTime={batch.importDate}>{formatPublicDate(batch.importDate, locale)}</time></td>
                      <td>{t.recordsCount(batch.recordsInserted)}</td>
                      <td className="sources-attribution">{batch.attributionText ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </LegalTableWrap>
          )}
        </section>

        <p className="record-detail-note">{t.versionNote}</p>
      </article>
    </main>
  );
}
