import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /api-docs — public read-only API documentation (CEO 2026-08-07).
 *
 * Static page explaining the public API: the endpoints, their per-caller
 * rate limits and the ODbL licensing. The numbers mirror the real
 * defaults in app/lib/rate-limit.ts (ROUTE_LIMIT_DEFAULTS) — when those
 * change, this page's bundle must be updated with them.
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
    t.endpoints.list,
    t.endpoints.bbox,
    t.endpoints.exportGeojson,
    t.endpoints.exportCsv,
    t.endpoints.record,
    t.endpoints.search,
    t.endpoints.nearby,
    t.endpoints.revisions,
    t.endpoints.geocode,
    t.endpoints.geocodeReverse,
    t.endpoints.tiles,
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
      <p className="record-detail-summary api-readonly-note">{t.readOnlyNote}</p>

      <section aria-labelledby="api-endpoints-title" className="api-section">
        <h2 id="api-endpoints-title">{t.endpointsTitle}</h2>
        <p>{t.endpointsIntro}</p>
        <table className="api-table">
          <thead>
            <tr><th scope="col">Method</th><th scope="col">Endpoint</th><th scope="col">Description</th></tr>
          </thead>
          <tbody>
            {endpointRows.map((row) => (
              <tr key={row.path}>
                <td><code>{row.method}</code></td>
                <td><code>{row.path}</code></td>
                <td>{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="api-limits-title" className="api-section">
        <h2 id="api-limits-title">{t.limitsTitle}</h2>
        <p>{t.limitsIntro}</p>
        <table className="api-table">
          <thead>
            <tr><th scope="col">Endpoint</th><th scope="col">Limit</th></tr>
          </thead>
          <tbody>
            {limitRows.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td><code>{row.requests}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="api-license-title" className="api-section">
        <h2 id="api-license-title">{t.licenseTitle}</h2>
        <p>{t.licenseBody}</p>
        <p className="api-attribution">{t.attribution}</p>
      </section>
    </InfoPage>
  );
}
