/**
 * Client-side DOM tests for SourcesPage — /fonti (import pipeline FASE C,
 * t_4dbce318).
 *
 * The /fonti page shell (app/fonti/page.tsx) queries the committed import
 * batches from D1 and passes them as props; SourcesPage is the pure
 * presentational component, so these tests exercise it with fixture data
 * (same contract as LegalPage in client-footer-legal.test.mjs):
 *
 *   1. renders the localized title/intro and a table with the five
 *      per-source columns (source, licence, imported on, records,
 *      attribution) — the licence-matrix attribution contract;
 *   2. the source and licence cells link out (target=_blank +
 *      rel=noopener noreferrer) to the original dataset / licence text;
 *      the import date renders localized, the record count is grouped;
 *      the attribution text renders verbatim (never reconstructed);
 *   3. empty state: no committed batches → the honest "no imported
 *      datasets yet" note, no table;
 *   4. EN/IT parity: the same fixture renders the localized labels and
 *      the it-IT date/count formatting.
 *
 * Fixtures are fictitious (example.invalid, made-up dataset names).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SourcesPage;
let sourcesEn;
let sourcesIt;

before(async () => {
  rtl = await setupDom();
  SourcesPage = (await loadDomModule("app/components/SourcesPage.mjs")).SourcesPage;
  const sourcesMod = await loadDomModule("app/lib/i18n/sources.mjs");
  sourcesEn = sourcesMod.en;
  sourcesIt = sourcesMod.it;
});

afterEach(() => rtl?.cleanup());

const fakeNavLabels = {
  mainNavigation: "Site navigation",
  homeAria: "OpenSurveillanceDB home",
};

// Two committed batches, mirroring the shape the runner persists: CC0
// source with a licence URL and OSM-style attribution text with a null
// licence URL (the text carries the link).
const fakeBatches = [
  {
    id: 1,
    slug: "fixture-zurigo-2026",
    sourceName: "Fixture City — Open Data",
    sourceUrl: "https://example.invalid/dataset/fixture-city",
    license: "CC0 1.0",
    licenseUrl: "https://example.invalid/licenses/cc0",
    attributionText: "Source: Fixture City, dataset \"Fixture cameras\" (https://example.invalid/dataset/fixture-city), CC0 1.0.",
    importDate: "2026-08-05T08:51:38.000Z",
    recordsInserted: 131,
    recordsTotal: 134,
  },
  {
    id: 2,
    slug: "fixture-osm-2026",
    sourceName: "Fixture Map contributors",
    sourceUrl: "https://example.invalid/map",
    license: "ODbL 1.0",
    licenseUrl: null,
    attributionText: "© Fixture Map contributors (https://example.invalid/map/copyright)",
    importDate: "2026-08-05T08:51:52.000Z",
    recordsInserted: 7030,
    recordsTotal: 7941,
  },
];

const enDate = new Date("2026-08-05T08:51:38.000Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const itDate = new Date("2026-08-05T08:51:38.000Z").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

test("sources page: renders the attribution table with the five per-source columns", async () => {
  const view = await renderWithLocale(React.createElement(SourcesPage, {
    navLabels: fakeNavLabels,
    locale: "en",
    t: sourcesEn,
    batches: fakeBatches,
  }));
  const { container } = view;

  assert.equal(view.getByRole("heading", { level: 1 }).textContent, "Methodology and data sources");
  assert.ok(view.getByText(/We document visible public surveillance infrastructure/));
  assert.ok(view.getByRole("heading", { level: 2, name: "How the database works" }));
  assert.ok(view.getByRole("heading", { level: 2, name: "Imported data sources" }));

  const table = container.querySelector("table.sources-table");
  assert.ok(table, "the sources table renders");
  const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent);
  assert.deepEqual(headers, ["Source", "Licence", "Imported on", "Records", "Attribution"]);

  // One row per committed batch, newest first (fixture order).
  const rows = table.querySelectorAll("tbody tr");
  assert.equal(rows.length, 2);

  // Row 1: source name links to the original dataset, licence links out
  // with the noopener contract, date localized, count grouped, attribution
  // verbatim.
  const sourceLink = view.getByRole("link", { name: /Fixture City — Open Data/ });
  assert.equal(sourceLink.getAttribute("href"), "https://example.invalid/dataset/fixture-city");
  assert.equal(sourceLink.getAttribute("target"), "_blank");
  assert.match(sourceLink.getAttribute("rel"), /noopener/);
  assert.match(sourceLink.getAttribute("rel"), /noreferrer/);
  const licenseLink = view.getByRole("link", { name: /CC0 1.0/ });
  assert.equal(licenseLink.getAttribute("href"), "https://example.invalid/licenses/cc0");
  assert.ok(view.getAllByText(enDate).length >= 1, "import dates render localized");
  assert.ok(view.getByText("131 records"));
  assert.ok(view.getByText(/Source: Fixture City, dataset "Fixture cameras"/));

  // Row 2: licence with no URL renders as plain text (the attribution
  // text still carries the required OSM-style link).
  assert.ok(view.getByText("ODbL 1.0"));
  assert.ok(view.getByText(/7,?030 records/), "grouped record count renders (locale-dependent separator)");
  assert.ok(view.getByText(/© Fixture Map contributors/));
});

test("sources page: empty state when no committed batch exists", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(SourcesPage, {
    navLabels: fakeNavLabels,
    locale: "en",
    t: sourcesEn,
    batches: [],
  }));

  assert.ok(screen.getByText("No imported datasets yet"));
  assert.ok(screen.getByText(/No public dataset has been imported so far/));
  assert.equal(screen.queryByRole("table"), null, "no table when there is nothing to attribute");
});

test("sources page: IT bundle renders localized labels, date and grouped count (parity)", async () => {
  const view = await renderWithLocale(React.createElement(SourcesPage, {
    navLabels: fakeNavLabels,
    locale: "it",
    t: sourcesIt,
    batches: fakeBatches,
  }));

  assert.equal(view.getByRole("heading", { level: 1 }).textContent, "Metodologia e fonti dei dati");
  const headers = Array.from(view.container.querySelectorAll("thead th")).map((cell) => cell.textContent);
  assert.deepEqual(headers, ["Fonte", "Licenza", "Importato il", "Record", "Attribuzione"]);
  assert.ok(view.getAllByText(itDate).length >= 1, "import dates render localized in Italian");
  assert.ok(view.getByText("131 record"));
  assert.ok(view.getByText(/7[.,]?030 record/), "grouped record count renders (separator depends on the ICU build)");
});

test("shared slug→source map: fetchImportSources + importSourceOf resolve readable attribution (FASE C)", async () => {
  // The CEO addition (2026-08-05): the map popup and the record page share
  // ONE slug→{name,licence,url} mapping fed by /api/import-sources — the
  // same data as /fonti. The map popup resolves 'import:<slug>' through it;
  // community reports and the demo seed resolve to null.
  const mod = await loadDomModule("app/lib/import-sources.mjs");
  const { fetchImportSources, importSourceOf, __resetImportSourcesCache } = mod;
  __resetImportSourcesCache();
  try {
    installFetchMock((input) => {
      if (String(input) === "/api/import-sources") {
        return jsonResponse({
          sources: [
            { slug: "fixture-zurigo-2026", sourceName: "Fixture City — Open Data", sourceUrl: "https://example.invalid/dataset", license: "CC0 1.0", licenseUrl: "https://example.invalid/licenses/cc0" },
          ],
        });
      }
      return jsonResponse({ error: "unexpected route" }, { status: 404 });
    });
    const map = await fetchImportSources();
    assert.ok(map.has("fixture-zurigo-2026"), "the map is keyed by slug");
    const resolved = importSourceOf({ source: "import:fixture-zurigo-2026" }, map);
    assert.equal(resolved?.sourceName, "Fixture City — Open Data");
    assert.equal(resolved?.license, "CC0 1.0");
    assert.equal(resolved?.licenseUrl, "https://example.invalid/licenses/cc0");
    // Community reports, the demo seed and unknown slugs carry no batch.
    assert.equal(importSourceOf({ source: "Community report" }, map), null);
    assert.equal(importSourceOf({ source: "Prototype seed" }, map), null);
    assert.equal(importSourceOf({ source: "import:unknown-slug" }, map), null);
  } finally {
    __resetImportSourcesCache();
  }
});
