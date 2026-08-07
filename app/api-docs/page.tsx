import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /api-docs — public read-only API documentation (CEO 2026-08-07).
 *
 * Redesigned (CEO review 2026-08-07): endpoint cards with method badges,
 * curl-ready examples and per-endpoint query parameters; a limits grid;
 * a licence section. The numbers mirror the real defaults in
 * app/lib/rate-limit.ts (ROUTE_LIMIT_DEFAULTS).
 *
 * Deliberately NOT in the main navigation (same route decision as
 * /fonti): the footer links it next to Licences and Method & sources.
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const content = bundle.api;
  return {
    title: content.title,
    description: content.intro,
    openGraph: { title: content.title, description: content.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: content.title, description: content.intro, images: ["/og.png"] },
  };
}

export default async function ApiDocsPage() {
  const bundle = await getServerMessages();
  const t = bundle.api;

  const endpointRows = [
    { item: t.endpoints.list, params: t.endpointParamsList },
    { item: t.endpoints.bbox, params: t.endpointParamsBbox },
    { item: t.endpoints.exportGeojson, params: t.endpointParamsExport },
    { item: t.endpoints.exportCsv, params: t.endpointParamsExport },
    { item: t.endpoints.record, params: t.endpointParamsRecord },
    { item: t.endpoints.search, params: t.endpointParamsSearch },
    { item: t.endpoints.nearby, params: t.endpointParamsNearby },
    { item: t.endpoints.revisions, params: t.endpointParamsRevisions },
    { item: t.endpoints.geocode, params: t.endpointParamsGeocode },
    { item: t.endpoints.geocodeReverse, params: t.endpointParamsReverse },
    { item: t.endpoints.tiles, params: t.endpointParamsTiles },
  ];
  const limitRows = [
    t.limits.read,
    t.limits.export,
    t.limits.nearby,
    t.limits.revisions,
    t.limits.geocode,
    t.limits.tiles,
  ];

  return (
    <InfoPage
      navLabel={t.navigation}
      homeLabel={t.homeAria}
      eyebrow={t.title}
      title={t.title}
      intro={t.intro}
    >
      <div className="api-page">
        <aside className="api-note" role="note">
          {t.readOnlyNote}
        </aside>

        <section className="api-section" aria-labelledby="api-endpoints-title">
          <div className="api-section-head">
            <p className="eyebrow"><span /> {t.endpointsTitle}</p>
            <p>{t.endpointsIntro}</p>
          </div>

          <div className="api-card-grid">
            {endpointRows.map(({ item, params }) => (
              <article className="api-card" key={item.path}>
                <div className="api-card-topline">
                  <span className="api-method" aria-label={t.endpointMethod}>{item.method}</span>
                  <code className="api-path">{item.path}</code>
                </div>
                <p className="api-desc">{item.description}</p>
                <p className="api-params"><span>{t.queryParams}:</span> {params}</p>
                <code className="api-example" aria-label={t.endpointExample}>{item.example}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="api-section" aria-labelledby="api-limits-title">
          <div className="api-section-head">
            <p className="eyebrow"><span /> {t.limitsTitle}</p>
            <p>{t.limitsIntro}</p>
          </div>

          <div className="api-limit-grid">
            {limitRows.map((row) => (
              <article className="api-limit-card" key={row.name}>
                <p className="api-limit-name">{row.name}</p>
                <p className="api-limit-value"><code>{row.requests}</code></p>
              </article>
            ))}
          </div>
        </section>

        <section className="api-section" aria-labelledby="api-license-title">
          <div className="api-section-head">
            <p className="eyebrow"><span /> {t.licenseTitle}</p>
            <p>{t.licenseBody}</p>
          </div>
          <p className="api-attribution">{t.attribution}</p>
        </section>
      </div>
    </InfoPage>
  );
}
