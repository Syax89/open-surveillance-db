/**
 * Canonical alternates on the public routes (P2 audit 2026-10-22, issue #14).
 *
 * Every indexable public route declares a self-referencing
 * `<link rel="canonical">` built from its literal route path; the root
 * metadataBase (app/layout.tsx, NEXT_PUBLIC_SITE_URL) resolves it against the
 * configured public origin. Before this fix only /, /directory, /mappa and
 * /records/[id] had one, so the informational/legal pages published no
 * canonical signal at all.
 *
 * BUILD REQUIREMENT: this suite runs the real SSR bundle in Miniflare and
 * asserts ABSOLUTE canonicals, so the build must be produced with the
 * production origin:
 *
 *   NEXT_PUBLIC_SITE_URL=https://opensurveillancedb.org npm run build
 *
 * (same convention as the sitemap/robots suites — the CI ci + coverage jobs
 * set it explicitly). The test oracle is the constant below plus the literal
 * route: it never derives the expected canonical from the HTML under test.
 *
 * Coverage: the 12 indexable routes that gained a canonical, each in EN and
 * IT (with the localized metadata still in place); the negatives that must
 * NOT gain one (auth/private surfaces, the noindex write tools, /moderation,
 * the legacy redirect); and the canonicals that already existed and must
 * keep their exact absolute URLs.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");
const DRIZZLE_DIR = path.join(root, "drizzle");

/** The configured public origin every absolute canonical must resolve to. */
const ORIGIN = "https://opensurveillancedb.org";

/** The 12 indexable public routes that gained a self-referencing canonical. */
const CANONICAL_ROUTES = [
  "/guide",
  "/faq",
  "/contatti",
  "/licenze",
  "/fonti",
  "/manifesto",
  "/privacy",
  "/regole",
  "/termini",
  "/accessibility",
  "/api-docs",
  "/contribuisci",
];

/**
 * Routes that must never carry a canonical: auth/private surfaces and the two
 * noindex write tools (their `robots: noindex` intent is deliberate — see
 * SITEMAP.md; a canonical would compete with the indexed pages instead).
 * `/moderation` is additionally behind the worker moderation gate, and
 * `/moderazione` is a redirect — both are pinned in their own tests below.
 */
const NO_CANONICAL_ROUTES = [
  "/login",
  "/register",
  "/account",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/records/1/edit",
  "/segnala",
  "/correggi",
];

/** The subset that also declares `robots: noindex` in its metadata. */
const NOINDEX_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/segnala", "/correggi"];

/** Canonicals that already existed and must keep their exact absolute URL. */
const EXISTING_CANONICALS = [
  { route: "/", expected: `${ORIGIN}/` },
  { route: "/directory", expected: `${ORIGIN}/directory` },
  { route: "/mappa", expected: `${ORIGIN}/mappa` },
  { route: "/records/12", expected: `${ORIGIN}/records/12` },
];

const IT_COOKIE = { cookie: "opensurveillancedb-locale=it" };

/** Collect every JS module of the built worker, with index.js as the entry. */
async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".js")) found.push({ type: "ESModule", path: full });
    }
  };
  await walk(serverDir);
  const entry = found.find((module) => module.path === path.join(serverDir, "index.js"));
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((module) => module !== entry)];
}

/**
 * Create the import_batches table /fonti reads (migration 0040's import part,
 * applied statement by statement — workerd's exec() rejects the multi-line
 * DDL). No rows: the page renders its truthful empty attribution state, and
 * the canonical is what this suite asserts. Same pattern as fonti-page.test.mjs.
 */
async function seedImportBatches(d1) {
  const files = (await readdir(DRIZZLE_DIR)).filter((name) => /^0040_.*\.sql$/.test(name));
  assert.equal(files.length, 1, "exactly one migration 0040 file");
  const raw = await readFile(path.join(DRIZZLE_DIR, files[0]), "utf8");
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
  for (const statement of statements) await d1.prepare(statement).run();
}

let mf;

before(async () => {
  mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    // Moderation credentials so the /moderation edge gate answers a
    // deterministic 401 (instead of fail-closed 503 "not configured").
    bindings: { MODERATION_USER: "fixture-moderator", MODERATION_PASSWORD: "fixture-password" },
  });
  await seedImportBatches(await mf.getD1Database("DB"));
});

after(async () => {
  if (mf) await mf.dispose();
});

async function renderRoute(route, headers = {}) {
  // redirect: "manual" — the legacy /moderazione route must be observed as a
  // redirect, not silently followed to /guide.
  const response = await mf.dispatchFetch(`http://localhost${route}`, {
    headers: { accept: "text/html", ...headers },
    redirect: "manual",
  });
  return { response, html: await response.text() };
}

/** Every canonical href in the document, in document order. */
const canonicalHrefs = (html) => [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"/g)].map((match) => match[1]);
const titleOf = (html) => (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();

// ---------------------------------------------------------------------------
// The 12 indexable routes — absolute self-referencing canonical, EN and IT
// ---------------------------------------------------------------------------

test("every indexable public route publishes its absolute self-referencing canonical (EN)", async () => {
  for (const route of CANONICAL_ROUTES) {
    const { response, html } = await renderRoute(route);
    assert.equal(response.status, 200, `${route} must render`);
    const hrefs = canonicalHrefs(html);
    assert.deepEqual(
      hrefs,
      [`${ORIGIN}${route}`],
      `${route} must publish exactly one canonical at ${ORIGIN}${route} (got ${JSON.stringify(hrefs)} — an unset NEXT_PUBLIC_SITE_URL at build time leaves it relative)`,
    );
    assert.match(html, /<html[^>]*lang="en"/, `${route} keeps the EN document language`);
  }
});

test("the same routes keep their localized metadata in IT, canonical unchanged", async () => {
  for (const route of CANONICAL_ROUTES) {
    const en = await renderRoute(route);
    const it = await renderRoute(route, IT_COOKIE);
    assert.equal(it.response.status, 200, `${route} must render in IT`);
    assert.deepEqual(
      canonicalHrefs(it.html),
      [`${ORIGIN}${route}`],
      `${route} keeps the same language-neutral canonical in IT (content URLs stay language-neutral)`,
    );
    assert.match(it.html, /<html[^>]*lang="it"/, `${route} serves the IT document language`);
    assert.notEqual(titleOf(it.html), titleOf(en.html), `${route} still localizes its <title> in IT`);
    assert.notEqual(titleOf(it.html), "", `${route} still has a <title>`);
  }
});

// ---------------------------------------------------------------------------
// Negatives — auth/private, noindex tools, moderator dashboard, redirect
// ---------------------------------------------------------------------------

test("auth/private and noindex surfaces carry NO canonical", async () => {
  for (const route of NO_CANONICAL_ROUTES) {
    const { response, html } = await renderRoute(route);
    assert.equal(response.status, 200, `${route} must render`);
    assert.deepEqual(canonicalHrefs(html), [], `${route} must stay canonical-free`);
    if (NOINDEX_ROUTES.includes(route)) {
      assert.match(
        html,
        /<meta name="robots" content="[^"]*noindex/,
        `${route} keeps its deliberate robots noindex (that is why it takes no canonical)`,
      );
    }
  }
});

test("the moderator dashboard is gate-protected and publishes no canonical", async () => {
  const { response, html } = await renderRoute("/moderation");
  assert.equal(response.status, 401, "an anonymous request still hits the moderation gate (no page, nothing to index)");
  assert.deepEqual(canonicalHrefs(html), []);
});

test("the legacy /moderazione redirect answers without a canonical", async () => {
  const { response, html } = await renderRoute("/moderazione");
  assert.ok([301, 307, 308].includes(response.status), `expected a redirect, got ${response.status}`);
  assert.match(response.headers.get("location") ?? "", /\/guide/, "the redirect still targets /guide");
  assert.deepEqual(canonicalHrefs(html), [], "a redirect must not publish a canonical");
});

// ---------------------------------------------------------------------------
// Immutable existing canonicals
// ---------------------------------------------------------------------------

test("the canonicals that already existed keep their exact absolute URLs", async () => {
  for (const { route, expected } of EXISTING_CANONICALS) {
    const { response, html } = await renderRoute(route);
    assert.equal(response.status, 200, `${route} must render`);
    assert.deepEqual(canonicalHrefs(html), [expected], `${route} keeps ${expected}`);
  }
});
