/**
 * Rendered-HTML smoke test for OpenSurveillanceDB.
 *
 * History / decision (kanban t_7632afa1): the original version of this file
 * was copied from the vinext starter template and asserted the template's
 * "loading skeleton" preview — app/_sites-preview/SkeletonPreview.tsx,
 * react-loading-skeleton and <meta name="codex-preview" content="development">
 * on the rendered HTML ("Your site is taking shape"). That artifact was
 * deliberately removed when the real prototype UI replaced the starter: the
 * app/_sites-preview/ directory never existed in this repository's git
 * history, package.json never depended on react-loading-skeleton, and
 * app/page.tsx + app/layout.tsx no longer reference the preview. The old
 * harness (plain `node --test` importing dist/server/index.js) also cannot
 * work in this stack: the production bundle imports `cloudflare:workers`,
 * which only the Cloudflare Workers runtime can resolve.
 *
 * The test is rewritten instead of deleted so the coverage class survives:
 *   1. a real rendered-HTML smoke test of the production artifact, executed
 *      with Miniflare (the same runtime the app deploys to). It verifies the
 *      public homepage serves the app's real metadata and that no
 *      starter-template preview leaks into the served HTML;
 *   2. a static guard asserting the starter preview artifacts stay removed
 *      (fail-fast, no build needed).
 *
 * Requires `npm run build` first (npm test already builds before running).
 */
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");

/** Collect every JS module of the built worker, with index.js as the entry. */
async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".js")) {
        found.push({ type: "ESModule", path: full });
      }
    }
  };
  await walk(serverDir);
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((m) => m !== entry)];
}

/** Render a route exactly like the deployed worker would. */
async function renderRoute(route = "/", { headers = {} } = {}) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
  });
  try {
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      headers: { accept: "text/html", ...headers },
    });
    return { response, html: await response.text() };
  } finally {
    await mf.dispose();
  }
}

/** Render the homepage exactly like the deployed worker would. */
async function renderHomepage() {
  return renderRoute("/");
}

test("server-rendered homepage carries the public app metadata", async () => {
  const { response, html } = await renderHomepage();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // The real app metadata (app/layout.tsx), not the starter's placeholder.
  assert.match(html, /<title>OpenSurveillanceDB[^<]*Public data about public surveillance<\/title>/i);
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /OpenSurveillanceDB/);
  assert.match(html, /Public data about public surveillance\./);
  // A11y live region for the hero record-count stat (progressive enhancement):
  // an sr-only role="status" region mounts client-side when the public count
  // resolves. On SSR the stat is a plain <dt> placeholder — axe forbids
  // role="status" on <dt> (aria-allowed-role) and it breaks the <dl> model
  // (see app/components/home/Hero.tsx, t_2d2bf33f).
  assert.doesNotMatch(html, /<dt[^>]*role="status"/, "SSR stat placeholder must be a plain <dt>");

  // F2 home hub: the home is an orienteering page. It renders the static
  // MapTeaser (CTA → /mappa) and the four tool cards (FRONTEND_DESIGN §2.4),
  // and must NOT embed the interactive map or the directory (they live on
  // /mappa and /directory — the SSR render of those routes is asserted in
  // the map/directory test below and in i18n-pages.test.mjs).
  assert.match(html, /class="map-teaser"/, "the hub must render the static map teaser");
  assert.match(html, /href="\/mappa"[^>]*>Open the map/, "the teaser CTA must point at /mappa");
  const toolCards = (html.match(/class="tool-card"/g) ?? []).length;
  assert.equal(toolCards, 4, `expected the four tool cards, found ${toolCards}`);
  for (const href of ["/mappa", "/directory", "/segnala", "/correggi"]) {
    assert.ok(html.includes(`href="${href}"`), `expected a tool-card link to ${href}`);
  }
  // The hub must not render the old all-in-one sections (no map instance,
  // no searchable directory, no forms on the home).
  assert.doesNotMatch(html, /id="map-region"/, "no interactive map on the hub");
  assert.doesNotMatch(html, /id="record-search"/, "no directory search on the hub");

  // No starter-template preview may leak into the public page.
  assert.doesNotMatch(html, /codex-preview|sites-skeleton|react-loading-skeleton/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("server-rendered homepage honours the persisted locale cookie (SSR lang + metadata)", async () => {
  // A returning Italian user carries the preference cookie (ADR 0015): the
  // first paint must already be Italian — correct <html lang> and localized
  // root-layout fallback metadata — with no EN->IT flash.
  const { response, html } = await renderRoute("/", {
    headers: { cookie: "opensurveillancedb-locale=it" },
  });

  assert.equal(response.status, 200);
  assert.match(html, /<html[^>]*lang="it"/);
  assert.match(html, /<title>OpenSurveillanceDB[^<]*Dati pubblici sulla sorveglianza pubblica<\/title>/i);
  assert.match(html, /Un database aperto e mantenuto dalla/);
});

test("server-rendered informational pages honour the locale cookie (html lang + per-route metadata)", async () => {
  const { response, html } = await renderRoute("/guide", {
    headers: { cookie: "opensurveillancedb-locale=it" },
  });

  assert.equal(response.status, 200);
  assert.match(html, /<html[^>]*lang="it"/);
  // guide.generateMetadata picks the Italian bundle for title/description.
  assert.match(html, /<title>[^<]*Un database pubblico, costruito con attenzione\.<\/title>/);
  // The h1 comes from the same server-side bundle, so content and metadata
  // agree on the language.
  assert.match(html, /<h1[^>]*>Un database pubblico, costruito con attenzione\.<\/h1>/);
});

test("server-rendered /mappa provides the map region and /directory the text-list alternative", async () => {
  // F2 home hub: the interactive map and the accessible directory moved to
  // their own routes (F1 route group (tools)). The home hub renders only the
  // static MapTeaser (asserted above); the map task contract (labelled
  // landmark + text-list equivalent) is now verified on the tool routes.
  const map = await renderRoute("/mappa");
  assert.equal(map.response.status, 200);

  // The map is a labelled landmark whose description points to the directory
  // (the text-list equivalent required by PRODUCT_UX.md for every map task).
  assert.match(map.html, /id="map-region"[^>]*role="region" aria-label="Interactive OpenStreetMap map"/);
  assert.match(map.html, /Go to the accessible directory/);

  // The text-list alternative itself is server-rendered on /directory: a
  // searchable directory with a result count and a per-record "Show on map"
  // keyboard path.
  const directory = await renderRoute("/directory");
  assert.equal(directory.response.status, 200);
  assert.match(directory.html, /Browse public records without the map/);
  assert.match(directory.html, /id="record-search"/);
  assert.match(directory.html, /id="record-search-count"[^>]*role="status"/);
  assert.match(directory.html, /Show on map/);
  assert.match(directory.html, /record-list/);
  // The directory is the map's text equivalent: every SSR'd record card
  // exposes the public record ID (Browse acceptance, PRODUCT_UX.md).
  const recordIdFields = (directory.html.match(/<dt>Record ID<\/dt>/g) ?? []).length;
  assert.ok(recordIdFields >= 2, `expected the record ID in each list card, found ${recordIdFields}`);
  assert.match(directory.html, /<dt>Record ID<\/dt><dd>1<\/dd>/);
});

test("global footer exposes every institutional page, the ODbL data licence and OSM attribution", async () => {
  const { response, html } = await renderHomepage();

  assert.equal(response.status, 200);

  // The footer is a labelled contentinfo landmark (rendered once by the root
  // layout) containing a distinct labelled navigation landmark. F3
  // (t_2ca69725) added the four public tool routes to the footer nav, so the
  // label is "site navigation".
  assert.match(html, /<footer class="site-footer" aria-label="Site footer">/);
  assert.match(html, /<nav class="footer-links" aria-label="Site navigation">/);

  // Every public route is linked from the footer: the four tool routes (F3,
  // FRONTEND_DESIGN §2.5 — the tools are never dead ends) plus every
  // institutional page. The local moderation queue (/moderation) is
  // intentionally absent: it is a local-only tool that must not be exposed
  // from the public interface (see the publication-boundaries suite).
  const publicLinks = [
    "/mappa",
    "/directory",
    "/segnala",
    "/correggi",
    "/manifesto",
    "/regole",
    "/guide",
    "/privacy",
    "/termini",
    "/licenze",
    "/accessibility",
    "/faq",
    "/contatti",
  ];
  for (const href of publicLinks) {
    assert.ok(html.includes(`href="${href}"`), `expected footer link to ${href}`);
  }

  // Data attribution required by the legal and OSM decisions (ADR 0008,
  // docs/OSM_INTEGRATION.md).
  assert.match(html, /opendatacommons\.org\/licenses\/odbl\/1-0\//);
  assert.match(html, /www\.openstreetmap\.org\/copyright/);
  assert.match(html, /OpenStreetMap contributors/);

  // No per-page duplicate footer remains: the homepage must contain exactly
  // one contentinfo landmark.
  const footerCount = (html.match(/<footer\b/g) ?? []).length;
  assert.equal(footerCount, 1, `expected a single footer landmark, found ${footerCount}`);
});

test("collection points link to the privacy notice and terms (GDPR art. 13 short notice)", async () => {
  // F2 home hub: the report and correction forms moved to their own routes
  // (/segnala, /correggi). The art. 13(1) GDPR collection-point contract is
  // asserted on the routes that actually collect the data.
  const report = await renderRoute("/segnala");
  assert.equal(report.response.status, 200);

  // Report form: the consent checkbox must be followed by explicit links to
  // /privacy and /termini at the point of collection (footer alone is not
  // enough — art. 13(1) GDPR requires the short notice at collection time).
  // React SSR inserts <!-- --> markers between text and elements.
  assert.match(report.html, /I confirm this observation was made from public space and contains no personal data\.[\s\S]{0,80}<a href="\/privacy">Privacy notice<\/a>\s*·\s*<a href="\/termini">Terms of use<\/a>/);

  // Photo upload: the help line mentions EXIF stripping and points to the
  // privacy notice.
  assert.match(report.html, /EXIF metadata is stripped on upload[\s\S]{0,120}href="\/privacy"/);

  const correction = await renderRoute("/correggi");
  assert.equal(correction.response.status, 200);

  // Correction form: same requirement for the private correction request.
  assert.match(correction.html, /I understand that this request is private[\s\S]{0,200}href="\/privacy"/);
  assert.match(correction.html, /I understand that this request is private[\s\S]{0,200}href="\/termini"/);

  // Count check: footer (1) + report form (1) + photo help (1) = 3 explicit
  // /privacy links on /segnala; footer (1) + correction form (1) = 2 on
  // /correggi (terms: footer + form in both).
  const reportPrivacy = (report.html.match(/href="\/privacy"/g) ?? []).length;
  const reportTerms = (report.html.match(/href="\/termini"/g) ?? []).length;
  const correctionPrivacy = (correction.html.match(/href="\/privacy"/g) ?? []).length;
  const correctionTerms = (correction.html.match(/href="\/termini"/g) ?? []).length;
  assert.ok(reportPrivacy >= 3, `expected >= 3 /privacy links on /segnala, found ${reportPrivacy}`);
  assert.ok(reportTerms >= 2, `expected >= 2 /termini links on /segnala, found ${reportTerms}`);
  assert.ok(correctionPrivacy >= 2, `expected >= 2 /privacy links on /correggi, found ${correctionPrivacy}`);
  assert.ok(correctionTerms >= 2, `expected >= 2 /termini links on /correggi, found ${correctionTerms}`);
});

test("/segnala SSR without photos never renders the photo-redaction confirmation (G3 negative)", async () => {
  // G3 (legal): the redaction confirmation checkbox is CONDITIONAL on
  // photos.length > 0. The server-rendered /segnala (the report form's own
  // route since F1) has no photos attached, so the checkbox and its
  // attestation text must not appear — a report without photos must never be
  // blocked by it. The positive case (checkbox present with photos) is
  // covered by tests/client-report-legal.test.mjs.
  const { response, html } = await renderRoute("/segnala");

  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /I confirm that I have redacted/);
  assert.doesNotMatch(html, /check-redaction/);
});

test("register page links to the privacy notice and terms next to the submit button", async () => {
  const { response, html } = await renderRoute("/register");

  assert.equal(response.status, 200);
  assert.match(html, /<p class="auth-legal-links">/);
  assert.match(html, /href="\/privacy">Privacy notice<\/a>/);
  assert.match(html, /href="\/termini">Terms of use<\/a>/);
  // The links sit inside the auth form, right after the submit button.
  assert.match(html, /Create account<\/button>[\s\S]{0,200}href="\/privacy"/);
});

test("server-rendered /manifesto is accessible and carries the mission, principles, non-goals and publish boundaries", async () => {
  const { response, html } = await renderRoute("/manifesto");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // Main landmark, one h1 with the manifesto title.
  assert.match(html, /<main[^>]*id="main-content"/);
  assert.match(html, /<h1>A manifesto for legible public space\.<\/h1>/);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);

  // The four content blocks are labelled landmarks (a11y navigation).
  assert.match(html, /aria-labelledby="mission-title"/);
  assert.match(html, /aria-labelledby="principles-title"/);
  assert.match(html, /aria-labelledby="non-goals-title"/);
  assert.match(html, /aria-labelledby="publish-title"/);
  assert.match(html, /<h2[^>]*id="mission-title">Help people understand the systems around them\.<\/h2>/);
  assert.match(html, /<h2[^>]*id="non-goals-title">What we deliberately do not do\.<\/h2>/);

  // Mission, the five principles, and the four non-goals all render.
  assert.match(html, /What we document/);
  assert.match(html, /Free to use/);
  assert.match(html, /Open source/);
  assert.match(html, /Open data with provenance/);
  assert.match(html, /Privacy and safety by design/);
  assert.match(html, /Human moderation first/);
  assert.match(html, /No camera feeds/);
  assert.match(html, /No tracking tools/);
  assert.match(html, /No evasion advice/);
  assert.match(html, /No private property/);

  // Publish boundary: what is published and what is never published.
  assert.match(html, /<h2[^>]*id="publish-title">Open where it is safe to be open\.<\/h2>/);
  assert.match(html, /<ul class="manifesto-list">/);
  assert.match(html, /Never published/);
  assert.match(html, /Submissions and corrections before — or without — human review/);

  // Shared info-page layout. The only footer on the page is the global
  // SiteFooter rendered by the root layout (SITEMAP: "footer mai copiato
  // per pagina"); its tagline is the institutional one.
  assert.match(html, /class="record-page"/);
  assert.match(html, /class="nav-shell"/);
  assert.match(html, /An open database of public surveillance cameras, built for transparency, not tracking\./);
  const footerCount = (html.match(/<footer\b/g) ?? []).length;
  assert.equal(footerCount, 1, `expected a single footer landmark, found ${footerCount}`);
  assert.match(html, /<footer class="site-footer" aria-label="Site footer">/);
});

test("rules page carries the shared layout, the fixed never-report heading and a single footer", async () => {
  const { response, html } = await renderRoute("/regole");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // Shared info-page layout markers.
  assert.match(html, /class="record-page"/);
  assert.match(html, /class="nav-shell"/);
  assert.match(html, /<h1>What we publish, and how you can help\.<\/h1>/);

  // a11y fix from review #67: the "never report" heading carries the title,
  // and the body text renders as a paragraph (title/body were swapped).
  assert.match(html, /<h2[^>]*id="never-title">Never report<\/h2>/);
  assert.match(html, /<p>Reports containing any of the following are screened out and are never published\.<\/p>/);
  assert.doesNotMatch(html, /<h2[^>]*id="never-title">Reports containing/);

  // Single footer: only the global SiteFooter from the root layout
  // (SITEMAP: "footer mai copiato per pagina"), which links /regole.
  const footerCount = (html.match(/<footer\b/g) ?? []).length;
  assert.equal(footerCount, 1, `expected a single footer landmark, found ${footerCount}`);
  assert.match(html, /<footer class="site-footer" aria-label="Site footer">/);
  assert.match(html, /href="\/regole"/);
});

test("homepage and guide link to /manifesto from the nav and the footer", async () => {
  const pages = await Promise.all([renderRoute("/"), renderRoute("/guide")]);
  for (const { response, html } of pages) {
    assert.equal(response.status, 200);
    assert.match(html, /href="\/manifesto"/);
  }
  assert.match(pages[0].html, /<a href="\/manifesto">Manifesto<\/a>/);
  assert.match(pages[1].html, /<a href="\/manifesto">Manifesto<\/a>/);
});

test("info pages reuse the shared layout styles (approved contrast palette)", async () => {
  const [infoPage, siteHeader, manifestoPage, css] = await Promise.all([
    readFile(path.join(root, "app", "components", "InfoPage.tsx"), "utf8"),
    readFile(path.join(root, "app", "components", "SiteHeader.tsx"), "utf8"),
    readFile(path.join(root, "app", "manifesto", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);

  // The shared InfoPage component carries the intro article classes used by
  // every informational page, and the navigation shell now lives in the
  // shared SiteHeader (brand + nav-shell + LocaleToggle), while the manifesto
  // page keeps its own section shells. No new colour decisions, so the
  // already-reviewed contrast palette applies unchanged. The only new rule
  // is the manifesto list, which reuses the correction-form card colours
  // (#435963 on #fbfbf7, WCAG AA).
  assert.match(manifestoPage, /InfoPage/, "manifesto page must use the shared InfoPage layout");
  for (const cls of ["record-page", "record-detail"]) {
    assert.match(infoPage, new RegExp(`className="[^"]*${cls}`), `expected shared layout to reuse ${cls}`);
  }
  assert.match(siteHeader, /className="nav-shell"/, "expected shared SiteHeader to carry the nav-shell");
  assert.match(siteHeader, /LocaleToggle/, "expected shared SiteHeader to render the LocaleToggle");
  for (const cls of ["principles", "records-section", "correction-section"]) {
    assert.match(manifestoPage, new RegExp(`className="[^"]*${cls}`), `expected manifesto page to reuse ${cls}`);
  }
  assert.match(css, /\.manifesto-list\s*\{/);

});

test("moderation info page explains review flow, appeals and safeguards", async () => {
  const { response, html } = await renderRoute("/moderazione");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // The public "How moderation works" page covers the three required
  // sections (SITEMAP: review flow, appeals and corrections, safeguards).
  assert.match(html, /How moderation works/);
  assert.match(html, /The review flow/);
  assert.match(html, /Appeals and corrections/);
  assert.match(html, /Moderator safeguards/);

  // Review flow steps from docs/MODERATION.md (receive → maintain).
  assert.match(html, />Receive</);
  assert.match(html, />Screen</);
  assert.match(html, />Verify</);
  assert.match(html, />Minimise</);
  assert.match(html, />Decide</);
  assert.match(html, />Maintain</);

  // Coordinate minimisation promise from the 2026-07-31 decision.
  assert.match(html, /rounded to about 4 decimal places/);

  // Appeal outcomes from ADR 0014: upheld / dismissed / escalated.
  assert.match(html, />Upheld</);
  assert.match(html, />Dismissed</);
  assert.match(html, />Escalated</);

  // This is the PUBLIC page: it must not link the private moderation
  // dashboard or any moderation/admin endpoint (publication-boundaries).
  assert.doesNotMatch(html, /href="\/moderation"/);
  assert.doesNotMatch(html, /href="\/api\/moderation/);
});

test("moderation info page carries the shared layout without a duplicate footer", async () => {
  const { response, html } = await renderRoute("/moderazione");

  assert.equal(response.status, 200);

  // The global footer is rendered once by the root layout; the page itself
  // must not add its own footer (SITEMAP: "footer mai copiato per pagina").
  const footerCount = (html.match(/<footer\b/g) ?? []).length;
  assert.equal(footerCount, 1, `expected a single footer landmark, found ${footerCount}`);
  assert.match(html, /<footer class="site-footer" aria-label="Site footer">/);

  // The page starts with the skip link and uses the shared nav shell.
  assert.match(html, /Skip to main content/);
  assert.match(html, /<nav class="nav-shell"/);
  assert.match(html, /id="main-content"/);
});

test("starter preview skeleton stays removed from the template", async () => {
  const [page, layout, packageJson, publicFiles, commonBundle] = await Promise.all([
    readFile(path.join(root, "app", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readdir(path.join(root, "public")),
    readFile(path.join(root, "app", "lib", "i18n", "common.ts"), "utf8"),
  ]);

  // The preview source directory and its static copy must not exist.
  await assert.rejects(access(path.join(root, "app", "_sites-preview")));
  assert.ok(!publicFiles.includes("_sites-preview"), "public/_sites-preview must not exist");

  // The template dependency was never adopted.
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  // The real app must not reference the preview or its meta tag.
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/i);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview|codex-preview/i);

  // The real app metadata is defined server-side and localized (ADR 0015):
  // the root layout renders it via generateMetadata from the i18n bundle,
  // whose pilot `common` domain carries the canonical <title> wording.
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /getServerMessages/);
  assert.match(commonBundle, /metaTitle:\s*"OpenSurveillanceDB/);
});

test("FAQ page serves bilingual FAQ content", async () => {
  const { response, html } = await renderRoute("/faq");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // The four FAQ topics required by the task: reporting, map accuracy,
  // corrections and privacy.
  assert.match(html, /How do I report a camera\?/);
  assert.match(html, /How accurate is the map\?/);
  assert.match(html, /How do I correct an error\?/);
  assert.match(html, /What about privacy\?/);

  // FAQ items use accessible native disclosure widgets (details/summary).
  assert.match(html, /<details class="faq-item"/);
  assert.match(html, /<summary>/);

  // The page links to the correction form and the contact page.
  assert.match(html, /href="\/#correction"/);
  assert.match(html, /href="\/contatti"/);

  // Single footer: only the global SiteFooter from the root layout
  // (SITEMAP: "footer mai copiato per pagina"), which links /faq.
  const footerCount = (html.match(/<footer\b/g) ?? []).length;
  assert.equal(footerCount, 1, `expected a single footer landmark, found ${footerCount}`);
  assert.match(html, /<footer class="site-footer" aria-label="Site footer">/);
  assert.match(html, /href="\/faq"/);
});

test("contact page serves owners, privacy and security routes", async () => {
  const { response, html } = await renderRoute("/contatti");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // Who we are + named owners (GOVERNANCE.md / README "Roles and contacts").
  assert.match(html, /Who we are/);
  assert.match(html, /Simone \(syax89\) and Ada \(CTO\)/);

  // Correction / removal contact (privacy contact + in-app form).
  assert.match(html, /Corrections and removal/);
  assert.match(html, /privacy@opensurveillancedb.org/);
  assert.match(html, /href="\/#correction"/);

  // Security route per SECURITY.md: private GitHub advisory, no public issue.
  assert.match(html, /Reporting a security vulnerability/);
  assert.match(html, /security\/advisories\/new/);
  assert.match(html, /Do not open a public issue for a vulnerability/);

  // Single footer: only the global SiteFooter from the root layout
  // (SITEMAP: "footer mai copiato per pagina"), which links /contatti.
  const footerCount = (html.match(/<footer\b/g) ?? []).length;
  assert.equal(footerCount, 1, `expected a single footer landmark, found ${footerCount}`);
  assert.match(html, /<footer class="site-footer" aria-label="Site footer">/);
  assert.match(html, /href="\/contatti"/);
});

// ---------------------------------------------------------------------------
// Global security headers (kanban t_6148aa6f, P2 gap from audit t_a07443bd).
// The worker edge (worker/index.ts) applies them to EVERY response; these
// tests exercise the real deployed worker through Miniflare.
// ---------------------------------------------------------------------------

/**
 * Assert the full global security-header set on a response, plus the CSP
 * baseline directives that must always be present.
 */
function assertSecurityHeaders(response, route) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", `${route}: nosniff`);
  assert.equal(response.headers.get("x-frame-options"), "DENY", `${route}: frame deny`);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin", `${route}: referrer policy`);
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/, `${route}: camera denied`);
  assert.match(response.headers.get("permissions-policy") ?? "", /microphone=\(\)/, `${route}: microphone denied`);
  assert.match(response.headers.get("permissions-policy") ?? "", /geolocation=\(\)/, `${route}: geolocation denied`);

  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/, `${route}: CSP default-src`);
  assert.match(csp, /object-src 'none'/, `${route}: CSP object-src`);
  assert.match(csp, /frame-ancestors 'none'/, `${route}: CSP frame-ancestors`);
  assert.match(csp, /base-uri 'self'/, `${route}: CSP base-uri`);
  assert.match(csp, /form-action 'self'/, `${route}: CSP form-action`);
}

test("security headers reach HTML pages, API errors, 404s and the moderation gate", async () => {
  // Every response class the worker can produce, without a DB binding:
  // SSR HTML (200), JSON 404 (non-integer photo id — no DB hit), plain
  // 404, the moderation gate (503 fail-closed, no credentials), and the
  // image optimizer (400 malformed request).
  const probes = [
    { route: "/", expect: 200 },
    { route: "/manifesto", expect: 200 },
    { route: "/faq", expect: 200 },
    { route: "/api/photos/abc", expect: 404 },
    { route: "/nonexistent-xyz", expect: 404 },
    { route: "/moderation", expect: 503 },
    { route: "/_vinext/image?url=/x.png&w=100", expect: 400 },
  ];

  for (const { route, expect } of probes) {
    const { response } = await renderRoute(route);
    assert.equal(response.status, expect, `${route} status`);
    assertSecurityHeaders(response, route);
  }
});

test("security headers do not overwrite a stricter app-level CSP (photo routes)", async () => {
  // Static guard: the worker middleware must only ADD headers. The photo
  // routes set `Content-Security-Policy: default-src 'none'; sandbox` on
  // binary bodies; if the edge ever overwrote it the sandbox would be
  // silently weakened. (Binary photo bytes need a D1/R2 binding, so the
  // merge rule is asserted on the source contract instead.)
  const workerSource = await readFile(path.join(root, "worker", "index.ts"), "utf8");
  assert.match(workerSource, /if \(!headers\.has\(name\)\)/, "edge must only add missing headers");
});

test("worker edge source carries the global security headers (static guard)", async () => {
  const workerSource = await readFile(path.join(root, "worker", "index.ts"), "utf8");
  for (const [name, value] of [
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=()"],
    ["Content-Security-Policy", "default-src 'self'"],
  ]) {
    assert.ok(workerSource.includes(name), `worker/index.ts must define ${name}`);
    assert.ok(workerSource.includes(value), `worker/index.ts must define ${value}`);
  }
});
