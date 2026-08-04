/**
 * Rendered-HTML smoke test for the public legal / information pages
 * (/privacy, /termini, /licenze — kanban t_15703460).
 *
 * Uses the same Miniflare harness as tests/rendered-html.test.mjs: the
 * production worker (built by `npm test` before this suite runs) is
 * served and each legal route is fetched over HTTP. Assertions cover the
 * English SSR default (the server renders the pilot language, ADR 0007)
 * plus the footer cross-links on the homepage.
 */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
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

async function renderPath(requestPath) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
  });
  try {
    const response = await mf.dispatchFetch(`http://localhost${requestPath}`, {
      headers: { accept: "text/html" },
    });
    return { response, html: await response.text() };
  } finally {
    await mf.dispose();
  }
}

test("public legal pages are served with their English content", async () => {
  const cases = [
    { path: "/privacy", markers: ["Privacy notice", "Controller", "Art. 6(1)(f) GDPR", "privacy@opensurveillancedb.org", "Cookies", "opensurveillancedb-locale", "art. 122 D.Lgs. 196/2003"] },
    { path: "/termini", markers: ["Terms of use", "Controller / operator", "ODbL 1.0", "privacy@opensurveillancedb.org"] },
    { path: "/licenze", markers: ["Licences", "AGPL-3.0-or-later", "ODbL 1.0", "CC BY-SA 4.0"] },
    { path: "/accessibility", markers: ["Accessibility statement", "WCAG 2.2 AA", "Partially compliant", "privacy@opensurveillancedb.org"] },
  ];

  for (const { path: requestPath, markers } of cases) {
    const { response, html } = await renderPath(requestPath);

    assert.equal(response.status, 200, `${requestPath} should return 200`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    for (const marker of markers) {
      assert.ok(html.includes(marker), `${requestPath} should contain "${marker}"`);
    }

    // Shared info-page layout: navigation shell, main landmark, version note.
    assert.match(html, /class="nav-shell"/);
    assert.match(html, /id="main-content"/);
    assert.match(html, /class="legal-section"/);
    assert.match(html, /class="record-detail-note"/);

    // QA#2 F1: the legal-table-wrap wrapper (scrollable on narrow
    // viewports) must be present; the client island adds tabindex/role/
    // aria-label only when the table overflows (hydration, viewport
    // dependent), so the SSR shell is the plain wrapper.
    if (requestPath === "/privacy") {
      assert.match(html, /class="legal-table-wrap"/, "/privacy must render the scrollable table wrapper");
      assert.match(html, /class="legal-table"/, "/privacy must render the data table");
    }

    // QA#2 F2: inline markdown links inside bold text (e.g. `**[ODbL
    // 1.0](url)**` on /termini and /licenze) must be rendered as REAL
    // anchors — never the raw `[label](url)` source text.
    if (requestPath === "/termini" || requestPath === "/licenze") {
      assert.match(
        html,
        /<a href="https:\/\/opendatacommons\.org\/licenses\/odbl\/"[^>]*>ODbL 1\.0<\/a>/,
        `${requestPath} must render the ODbL link inside the bold text`,
      );
      assert.ok(
        !html.includes("**[ODbL 1.0]"),
        `${requestPath} must not leak the raw markdown bold syntax`,
      );
    }

    // The global site footer (SiteFooter in the root layout) links the
    // public legal pages on every route.
    assert.match(html, /class="site-footer"/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /href="\/termini"/);
    assert.match(html, /href="\/licenze"/);
    assert.match(html, /href="\/accessibility"/);
  }
});

test("global site footer links to the public legal pages", async () => {
  const { response, html } = await renderPath("/");

  assert.equal(response.status, 200);
  // The global footer (root layout) must be part of the server-rendered
  // homepage and link the public legal pages.
  assert.match(html, /class="site-footer"/);
  assert.match(html, /class="footer-links"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/termini"/);
  assert.match(html, /href="\/licenze"/);
  assert.match(html, /href="\/accessibility"/);
});
