/**
 * Axe-core audit of every public route (F-QA t_7b716c97, item 2).
 *
 * Closes the "automated checks pending" gap in
 * docs/ACCESSIBILITY_STATEMENT.md: for every route the worker serves, the
 * SSR HTML is copied into jsdom and audited with the REAL axe-core engine
 * (devDependency — never shipped). The gate is 0 critical/serious
 * violations; moderate/minor are reported in the summary test and tracked,
 * not silently ignored.
 *
 * Layout-dependent rules (color-contrast, target-size, ...) cannot run in
 * jsdom — see tests/helpers/axe-harness.mjs — and are covered by the
 * Lighthouse CI proposal (ops, accessibility >= 0.95) plus the token-level
 * contrast assertions in navigation-pages.test.mjs.
 *
 * Requires `npm run build` first (npm test already builds before running).
 */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import {
  describeViolation,
  runAxeOnHtml,
  violationSummary,
} from "./helpers/axe-harness.mjs";
import { registeredRoutes } from "./helpers/route-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");

const MODERATION_CREDENTIALS = {
  env: { MODERATION_USER: "moderator", MODERATION_PASSWORD: "s3cret" },
  headers: { authorization: `Basic ${Buffer.from("moderator:s3cret").toString("base64")}` },
};

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
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((m) => m !== entry)];
}

/** Render a route exactly like the deployed worker would. */
async function renderRoute(route, { env = {}, headers = {} } = {}) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    bindings: env,
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

// Every SSR-able route in the route-contracts registry plus the gated
// moderation shell (which needs credentials). /records/[id] is dynamic:
// the audit resolves it to a fictional demo id (/records/1) — fixture
// hygiene, no real personal data anywhere.
const AUDIT_ROUTES = [
  ...registeredRoutes().map((r) => ({
    route: r.route.replace("[id]", "1"),
    ...(r.auth ? MODERATION_CREDENTIALS : {}),
  })),
];

for (const { route, env, headers } of AUDIT_ROUTES) {
  test(`axe: ${route} has 0 critical/serious violations`, async () => {
    const { response, html } = await renderRoute(route, { env, headers });
    assert.equal(
      response.status,
      200,
      `${route} must render 200 to be audited (got ${response.status}) — a route that cannot SSR fails the a11y gate`,
    );
    const violations = await runAxeOnHtml(html);
    const severe = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    assert.deepEqual(
      severe.map(describeViolation),
      [],
      `${route}: critical/serious axe violations found — ${severe.map(describeViolation).join("\n")}`,
    );
  });
}

test("axe: full audit summary — every violation by impact (moderate/minor tracked, not hidden)", async (t) => {
  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const details = [];
  for (const { route, env, headers } of AUDIT_ROUTES) {
    const { html } = await renderRoute(route, { env, headers });
    const violations = await runAxeOnHtml(html);
    const summary = violationSummary(violations);
    for (const impact of Object.keys(totals)) totals[impact] += summary[impact];
    for (const violation of violations) {
      details.push(`${route} → ${describeViolation(violation)}`);
    }
  }
  // The gate is 0 critical/serious; moderate/minor are listed here so a
  // human reviewer sees them instead of axe silently ignoring them.
  assert.equal(totals.critical + totals.serious, 0, "critical/serious must stay 0 across all routes");
  if (details.length > 0) {
    t.diagnostic(`axe audit non-severe findings:\n${details.join("\n")}`);
  }
});
