import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /api-docs — public API documentation (CEO 2026-08-07; write-API guide
 * t_10e3585e).
 *
 * Read side (CEO review 2026-08-07): endpoint cards with method badges,
 * curl-ready examples and per-endpoint query parameters; a limits grid;
 * a licence section. The numbers mirror the real defaults in
 * app/lib/rate-limit.ts (ROUTE_LIMIT_DEFAULTS).
 *
 * Write side (epic api-keys, ADR 0023): the API-keys section documents the
 * private write keys — Bearer authentication, the per-endpoint required
 * scope, the key lifecycle (create / reveal-once / expiry / revoke / cap),
 * the security rules (no query-string credentials — rejected 400, no
 * logging, hash-only storage) and the canonical error codes. Everything
 * mirrors the implementation in app/lib/write-gate.ts, db/api-keys.ts and
 * the gated routes (submit/confirm/edit/action).
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
  const writeRows = [
    t.writeEndpoints.cameras,
    t.writeEndpoints.corrections,
    t.writeEndpoints.confirmation,
    t.writeEndpoints.actions,
    t.writeEndpoints.edit,
  ];
  const scopeRows = [
    t.scopes.submit,
    t.scopes.confirm,
    t.scopes.edit,
    t.scopes.action,
  ];
  const lifecycleRows = [
    t.lifecycle.create,
    t.lifecycle.reveal,
    t.lifecycle.expire,
    t.lifecycle.revoke,
    t.lifecycle.cap,
  ];
  const securityRows = [
    t.security.queryString,
    t.security.logging,
    t.security.storage,
  ];
  const errorRows = Object.entries(t.errors);
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
          {t.apiNote}
        </aside>

        <section className="api-section" aria-labelledby="api-endpoints-title">
          <div className="api-section-head">
            <p className="eyebrow"><span /> {t.endpointsTitle}</p>
            <p>{t.endpointsIntro}</p>
          </div>

          <div className="api-card-grid">
            {endpointRows.map(({ item, params }) => (
              <article className="api-card api-endpoint-card" key={item.path}>
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

        <section className="api-section" aria-labelledby="api-keys-title">
          <div className="api-section-head">
            <p className="eyebrow" id="api-keys-title"><span /> {t.keysTitle}</p>
            <p>{t.keysIntro}</p>
          </div>

          <aside className="api-note" role="note">
            {t.keysNote}
          </aside>

          <div className="api-section-head">
            <p className="eyebrow" id="api-auth-title"><span /> {t.authHeaderTitle}</p>
            <p>{t.authHeaderIntro}</p>
          </div>
          <code className="api-example">{t.authHeaderExample}</code>
          <p className="api-params" style={{ marginTop: "14px" }}>
            <a href="/account">{t.keysCreateCta}</a>
          </p>

          <div className="api-section-head">
            <p className="eyebrow" id="api-write-endpoints-title"><span /> {t.writeEndpointsTitle}</p>
            <p>{t.writeEndpointsIntro}</p>
          </div>
          <div className="api-card-grid">
            {writeRows.map((item) => (
              <article className="api-card api-endpoint-card" key={item.path}>
                <div className="api-card-topline">
                  <span className="api-method" aria-label={t.endpointMethod}>{item.method}</span>
                  <code className="api-path">{item.path}</code>
                </div>
                <p className="api-desc">{item.description}</p>
                <p className="api-endpoint-detail">
                  <span>{t.scopeRequiredLabel}:</span> {t.scopes[item.scope as keyof typeof t.scopes].name}
                </p>
              </article>
            ))}
          </div>

          <div className="api-section-head">
            <p className="eyebrow" id="api-scopes-title"><span /> {t.scopesTitle}</p>
            <p>{t.scopesIntro}</p>
          </div>
          <div className="api-card-grid">
            {scopeRows.map((scope) => (
              <article className="api-card" key={scope.name}>
                <div className="api-card-topline">
                  <p className="api-path">{scope.name}</p>
                </div>
                <p className="api-desc">{scope.grants}</p>
                <p className="api-params"><span>{t.endpointPath}:</span> {scope.endpoints}</p>
              </article>
            ))}
          </div>

          <div className="api-section-head">
            <p className="eyebrow" id="api-lifecycle-title"><span /> {t.lifecycleTitle}</p>
            <p>{t.lifecycleIntro}</p>
          </div>
          <div className="api-card-grid">
            {lifecycleRows.map((item) => (
              <article className="api-card" key={item.name}>
                <div className="api-card-topline">
                  <p className="api-path">{item.name}</p>
                </div>
                <p className="api-desc">{item.body}</p>
              </article>
            ))}
          </div>

          <div className="api-section-head">
            <p className="eyebrow" id="api-security-title"><span /> {t.securityTitle}</p>
            <p>{t.securityIntro}</p>
          </div>
          <div className="api-card-grid">
            {securityRows.map((item) => (
              <article className="api-card" key={item.name}>
                <div className="api-card-topline">
                  <p className="api-path">{item.name}</p>
                </div>
                <p className="api-desc">{item.body}</p>
              </article>
            ))}
          </div>

          <div className="api-section-head">
            <p className="eyebrow" id="api-errors-title"><span /> {t.errorsTitle}</p>
            <p>{t.errorsIntro}</p>
          </div>
          <div className="api-card-grid">
            {errorRows.map(([code, text]) => (
              <article className="api-card" key={code}>
                <div className="api-card-topline">
                  <span className="api-method">{code}</span>
                </div>
                <p className="api-desc">{text}</p>
              </article>
            ))}
          </div>

          <aside className="api-note" role="note">
            <strong>{t.keysLimitsTitle}.</strong> {t.keysLimitsIntro}
          </aside>
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
