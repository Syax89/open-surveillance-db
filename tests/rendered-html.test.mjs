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

/** Render the homepage exactly like the deployed worker would. */
async function renderHomepage() {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
  });
  try {
    const response = await mf.dispatchFetch("http://localhost/", {
      headers: { accept: "text/html" },
    });
    return { response, html: await response.text() };
  } finally {
    await mf.dispose();
  }
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
  // A11y live region for the "loading public records" notice.
  assert.match(html, /role="status"/);

  // Browse acceptance (docs/workstreams/PRODUCT_UX.md): map card and the
  // accessible directory list must both expose the record ID alongside the
  // same public fields. Server-rendered demo records make this checkable.
  const recordIdFields = (html.match(/<dt>Record ID<\/dt>/g) ?? []).length;
  assert.ok(recordIdFields >= 2, `expected the record ID in the map card and each list card, found ${recordIdFields}`);
  assert.match(html, /<dt>Record ID<\/dt><dd>1<\/dd>/);

  // No starter-template preview may leak into the public page.
  assert.doesNotMatch(html, /codex-preview|sites-skeleton|react-loading-skeleton/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("server-rendered homepage provides the map region and its text-list alternative", async () => {
  const { response, html } = await renderHomepage();

  assert.equal(response.status, 200);

  // The map is a labelled landmark whose description points to the directory
  // (the text-list equivalent required by PRODUCT_UX.md for every map task).
  assert.match(html, /id="map-region"[^>]*role="region" aria-label="Interactive OpenStreetMap map"/);
  assert.match(html, /Go to the accessible directory/);

  // The text-list alternative itself is part of the initial HTML: a searchable
  // directory with a result count and a per-record "Show on map" keyboard path.
  assert.match(html, /Browse public records without the map/);
  assert.match(html, /id="record-search"/);
  assert.match(html, /id="record-search-count"[^>]*role="status"/);
  assert.match(html, /Show on map/);
  assert.match(html, /record-list/);
});

test("starter preview skeleton stays removed from the template", async () => {
  const [page, layout, packageJson, publicFiles] = await Promise.all([
    readFile(path.join(root, "app", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readdir(path.join(root, "public")),
  ]);

  // The preview source directory and its static copy must not exist.
  await assert.rejects(access(path.join(root, "app", "_sites-preview")));
  assert.ok(!publicFiles.includes("_sites-preview"), "public/_sites-preview must not exist");

  // The template dependency was never adopted.
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  // The real app must not reference the preview or its meta tag.
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/i);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview|codex-preview/i);
  assert.match(layout, /title:\s*"OpenSurveillanceDB/);
});
