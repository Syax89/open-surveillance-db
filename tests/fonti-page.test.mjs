/**
 * /fonti SSR smoke test — import pipeline FASE C (kanban t_4dbce318).
 *
 * Renders the REAL built worker over HTTP with a REAL D1 binding (the
 * import_batches migration applied, committed + non-committed rows
 * seeded) and asserts the server-rendered page:
 *
 *   - GET /fonti 200: localized title + intro, the attribution table
 *     (source link, licence link, import date, grouped record count,
 *     attribution text), ONLY committed batches (running/failed rows
 *     never leak), the footer "Method & sources" link;
 *   - GET /licenze 200: the "Imported public datasets" section linking
 *     /fonti (the general mention, CEO route decision 2026-08-05);
 *   - sitemap.xml includes /fonti.
 *
 * Fixtures are fictitious (example.invalid dataset names).
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");
const DRIZZLE_DIR = path.join(root, "drizzle");

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

/** Real migration 0040 SQL (import_batches + cameras provenance columns). */
async function migration0040Sql() {
  const files = (await readdir(DRIZZLE_DIR)).filter((name) => /^0040_.*\.sql$/.test(name));
  assert.equal(files.length, 1, "exactly one migration 0040 file");
  return readFile(path.join(DRIZZLE_DIR, files[0]), "utf8");
}

/**
 * Apply migration 0040 on the workerd D1 binding — the import_batches
 * part only. workerd's d1.exec() rejects the multi-line DDL with an
 * "incomplete input" parse error, so every `;`-terminated statement runs
 * through the prepared path (the same one the INSERTs use). The cameras
 * ALTERs are dropped: /fonti queries import_batches alone, and the full
 * schema + cameras provenance columns are covered by the db-runtime tests
 * (tests/import-sources-read.test.mjs) against the REAL migrations.
 */
async function seedMigration0040(d1) {
  const raw = await migration0040Sql();
  const statements = raw
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("--") && !trimmed.startsWith("-->");
    })
    .join("\n")
    .split(";")
    .map((statement) => statement.replace(/^--> statement-breakpoint\s*/, "").trim())
    .filter((statement) => statement.length > 0)
    .filter((statement) => !statement.startsWith("ALTER TABLE") && !statement.includes("cameras_"));
  for (const statement of statements) {
    await d1.prepare(statement).run();
  }
}

async function renderWithSeededD1() {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
  });
  try {
    // Seed the binding with the REAL migration SQL, then two committed
    // batches (the exact attribution fields the page renders) and one
    // running batch that must stay invisible.
    const d1 = await mf.getD1Database("DB");
    await seedMigration0040(d1);
    const insert = d1.prepare(
      `INSERT INTO import_batches (slug, source_name, format, license, license_url, attribution_text, source_url, import_date, status, records_total, records_inserted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await insert.bind(
      "fixture-zurigo-2026", "Fixture City — Open Data", "csv", "CC0 1.0",
      "https://example.invalid/licenses/cc0",
      "Source: Fixture City, dataset \"Fixture cameras\" (https://example.invalid/dataset/fixture-city), CC0 1.0.",
      "https://example.invalid/dataset/fixture-city", "2026-08-05T08:51:38.000Z",
      "committed", 134, 131, "2026-08-05T08:51:38.000Z", "2026-08-05T08:52:00.000Z",
    ).run();
    await insert.bind(
      "fixture-osm-2026", "Fixture Map contributors", "osm-overpass", "ODbL 1.0", null,
      "© Fixture Map contributors (https://example.invalid/map/copyright)",
      "https://example.invalid/map", "2026-08-05T08:51:52.000Z",
      "committed", 7941, 7030, "2026-08-05T08:51:52.000Z", "2026-08-08T10:00:00.000Z",
    ).run();
    await insert.bind(
      "fixture-running", "Half-imported source", "geojson", "ODbL 1.0", null,
      "Partial attribution", "https://example.invalid/partial", "2026-08-05T09:00:00.000Z",
      "running", 100, 40, "2026-08-05T09:00:00.000Z", null,
    ).run();

    const response = await mf.dispatchFetch("http://localhost/fonti", {
      headers: { accept: "text/html" },
    });
    return { response, html: await response.text(), mf };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}

test("GET /fonti: server-renders the attribution table with committed batches only", async () => {
  const { response, html, mf } = await renderWithSeededD1();
  try {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    // Localized metadata + page copy (EN default, ADR 0007).
    assert.match(html, /<title>Methodology and data sources/);
    assert.match(html, /<h1[^>]*>Methodology and data sources<\/h1>/);
    assert.match(html, /We document visible public surveillance infrastructure/);
    assert.match(html, /<h2[^>]*>How the database works<\/h2>/);
    assert.match(html, /<h2[^>]*>Imported data sources<\/h2>/);

    // Attribution table: the five columns.
    for (const header of ["Source", "Licence", "Imported on", "Records", "Attribution"]) {
      assert.ok(html.includes(`<th scope="col">${header}</th>`), `/fonti table must include the ${header} column`);
    }

    // Committed batch 1: source link, licence link, date, count, attribution.
    // (The sr-only "(Open ...)" suffix renders inside the anchor.)
    assert.match(html, /<a href="https:\/\/example\.invalid\/dataset\/fixture-city"[^>]*>Fixture City — Open Data<span/);
    assert.match(html, /<a href="https:\/\/example\.invalid\/licenses\/cc0"[^>]*>CC0 1\.0<span/);
    assert.ok(html.includes("131 records"));
    assert.ok(html.includes("Source: Fixture City, dataset"));

    // Committed batch 2: OSM-style plain-text licence + attribution text.
    assert.match(html, /<a href="https:\/\/example\.invalid\/map"[^>]*>Fixture Map contributors<span/);
    assert.ok(html.includes("7030 records") || html.includes("7,030 records"));
    assert.ok(html.includes("© Fixture Map contributors"));

    // NEVER the running batch: an attribution for data that is not
    // published would be a lie.
    assert.ok(!html.includes("Half-imported source"), "running batches must not appear on /fonti");
    assert.ok(!html.includes("fixture-running"));

    // Dynamic "Last updated" line: derived from the committed batches at
    // request time (max updated_at — the osm batch was force-refreshed on
    // 2026-08-08), never a hardcoded date that goes stale.
    assert.ok(
      html.includes("Last updated: 8 August 2026. The import descriptors in the repository (docs/data-sources/imports/) remain canonical."),
      "the note must show the freshest committed mutation, not a static date",
    );

    // Footer links the page itself (and it is NOT in the main nav).
    assert.match(html, /<a[^>]*href="\/fonti"[^>]*>Method &amp; sources<\/a>/);
  } finally {
    await mf.dispose();
  }
});

test("GET /licenze: general mention of imported datasets links /fonti (CEO route decision)", async () => {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
  });
  try {
    const response = await mf.dispatchFetch("http://localhost/licenze", {
      headers: { accept: "text/html" },
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    // Section 6 (imported public datasets) with the cross-link.
    assert.ok(html.includes("Imported public datasets"), "/licenze must mention the imported-datasets policy");
    assert.match(html, /<a href="\/fonti"[^>]*>Data sources<\/a>/, "/licenze must link the dedicated /fonti page");
    // The footer keeps the /fonti entry on every route.
    assert.match(html, /<a[^>]*href="\/fonti"[^>]*>Method &amp; sources<\/a>/);
  } finally {
    await mf.dispose();
  }
});

test("GET /sitemap.xml includes /fonti", async () => {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
  });
  try {
    const d1 = await mf.getD1Database("DB");
    await seedMigration0040(d1);
    // The sitemap queries cameras with the shared public predicate; the
    // minimal table carries exactly the columns the predicate references.
    await d1.prepare("CREATE TABLE cameras (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, status text NOT NULL, review_due_at text)").run();
    const response = await mf.dispatchFetch("http://localhost/sitemap.xml", {
      headers: { accept: "application/xml" },
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(body.includes("<loc>/fonti</loc>"), "sitemap.xml must list /fonti");
  } finally {
    await mf.dispose();
  }
});
