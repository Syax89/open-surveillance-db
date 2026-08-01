/**
 * Per-phase QA gate (F-QA t_7b716c97, item 4 — FRONTEND_PLAN.md sez. 7.2).
 *
 * Mechanically enforces the acceptance criterion: "route nuova senza
 * (a) SSR smoke, (b) interaction test, (c) i18n parity, (d) a11y contract
 * → QA negata."
 *
 * The registry (tests/helpers/route-contracts.mjs) is the single source of
 * truth: every SSR-able route lists its four mandatory artifact files. This
 * suite fails when:
 *   - a registered route lacks one of the four artifacts,
 *   - an artifact file does not exist on disk,
 *   - a route's app source does not exist,
 *   - the axe audit (the a11y contract) is not wired to the registry.
 *
 * Phase rule (roadmap 5.3/7.1): F1-F4 add their new routes to the registry
 * IN THE SAME PR that creates them — a route that merges without its four
 * artifacts trips this gate on the next CI run. No personal data anywhere.
 */
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registeredRoutes, REQUIRED_ARTIFACTS } from "./helpers/route-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(root, "tests");

test("gate: every registered route lists all 4 mandatory artifacts", () => {
  const routes = registeredRoutes();
  assert.ok(routes.length >= 14, `the registry must cover every SSR-able route (found ${routes.length})`);
  for (const entry of routes) {
    assert.ok(entry.route.startsWith("/"), `${entry.name}: route must start with /`);
    for (const artifact of REQUIRED_ARTIFACTS) {
      assert.ok(
        typeof entry.artifacts?.[artifact] === "string" && entry.artifacts[artifact].length > 0,
        `${entry.route}: missing '${artifact}' artifact in the registry`,
      );
    }
  }
});

test("gate: every artifact file exists on disk", async () => {
  for (const entry of registeredRoutes()) {
    for (const artifact of REQUIRED_ARTIFACTS) {
      const file = entry.artifacts[artifact];
      await assert.doesNotReject(
        access(path.join(testsDir, file)),
        `${entry.route}: artifact file '${file}' does not exist — add the test in the SAME phase as the route`,
      );
    }
  }
});

test("gate: every route source exists in the app", async () => {
  for (const entry of registeredRoutes()) {
    await assert.doesNotReject(
      access(path.join(root, entry.source)),
      `${entry.route}: app source '${entry.source}' does not exist`,
    );
  }
});

test("gate: the a11y contract (axe audit) is wired to the registry", async () => {
  const axeSuite = await readFile(path.join(testsDir, "axe-audit.test.mjs"), "utf8");
  assert.match(
    axeSuite,
    /import\s*\{[^}]*registeredRoutes[^}]*\}\s*from\s*["']\.\/helpers\/route-contracts\.mjs["']/,
    "the axe audit must derive its route list from the registry (no route may be audited out of band)",
  );
  // The audit builds AUDIT_ROUTES by mapping over registeredRoutes(), so a
  // route added to the registry is audited BY CONSTRUCTION — no literal
  // route string needs to appear in the file. Pin the derivation instead
  // of the strings: if a future refactor hardcodes the route list, the gate
  // trips and routes stop being audited silently.
  assert.match(
    axeSuite,
    /registeredRoutes\(\)\.map/,
    "AUDIT_ROUTES must be derived from registeredRoutes() — a hardcoded list bypasses the per-phase gate",
  );
});

test("gate: the route registry itself contains no personal data", () => {
  const source = JSON.stringify(registeredRoutes());
  assert.doesNotMatch(source, /@[a-z0-9.-]+\.(com|org|net|it|test)/i, "no real email addresses in the registry");
  assert.doesNotMatch(source, /(password|secret|token)\s*[:=]/i, "no credentials in the registry");
});
