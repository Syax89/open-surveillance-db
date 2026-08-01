// Axe-core audit helper for SSR-rendered routes (F-QA t_7b716c97, item 2).
//
// Runs the REAL axe-core engine (devDependency, never shipped) against a
// jsdom copy of the worker's SSR HTML. This is the automated half of the
// a11y contract: every route must produce 0 critical/serious violations.
//
// What is excluded and why:
//   - color-contrast: axe needs a real rendering engine (fonts, layout,
//     canvas) to measure contrast; jsdom has none. Covered by Lighthouse CI
//     (accessibility >= 0.95, proposed in ops) and by the token-level
//     contrast assertions in navigation-pages.test.mjs.
//   - target-size (WCAG 2.5.8): needs layout. The touch-target >= 44px
//     requirement is enforced by the FRONTEND_PLAN design-system review and
//     Lighthouse.
//   - link-in-text-block, scrollable-region-focusable: layout-dependent.
//
// Anything else — landmark/region, document-title, heading-order,
// image-alt, label, aria-*, button-name, duplicate-id, html-has-lang,
// meta-viewport, skip-link... — runs for real against the DOM structure.
//
// Fixture hygiene: the audited HTML is the public SSR output only; no
// personal data is involved.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Rules that need a real layout engine and are therefore covered elsewhere
// (see header comment). Kept as a shared list so the suite can report them
// as "covered by Lighthouse / manual checks" instead of silently skipping.
export const LAYOUT_ONLY_RULES = [
  "color-contrast",
  "target-size",
  "link-in-text-block",
  "scrollable-region-focusable",
];

/**
 * Run axe-core against SSR HTML.
 *
 * @param {string} html  the full HTML document returned by the worker
 * @param {object} [options]
 * @param {string[]} [options.excludeRules]  additional rules to disable
 * @param {string[]} [options.runOnlyTags]   WCAG tag values to audit
 * @returns {Promise<import("axe-core").AxeResults["violations"]>}
 */
export async function runAxeOnHtml(html, { excludeRules = [], runOnlyTags } = {}) {
  const tags = runOnlyTags ?? ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
  const dom = new JSDOM(html, { pretendToBeVisual: true, runScripts: "outside-only" });
  try {
    const { window } = dom;
    const axeSource = await readFile(path.join(root, "node_modules", "axe-core", "axe.min.js"), "utf8");
    // Evaluating the bundle inside the jsdom window attaches window.axe
    // (runScripts: "outside-only" is required for the UMD wrapper to bind).
    window.eval(axeSource);
    const disabledRules = Object.fromEntries(
      [...LAYOUT_ONLY_RULES, ...excludeRules].map((rule) => [rule, { enabled: false }]),
    );
    const result = await window.axe.run(window.document, {
      runOnly: { type: "tag", values: tags },
      rules: disabledRules,
    });
    // The violations are objects created inside the jsdom window realm;
    // node:assert/strict deepStrictEqual compares prototypes, so even an
    // EMPTY jsdom-realm array fails `assert.deepEqual(violations, [])`
    // (F-QA t_7b716c97 found this while wiring the axe gate). Clone the
    // result into plain Node-realm objects before returning it.
    return structuredClone(result.violations);
  } finally {
    dom.window.close();
  }
}

/** Group violations by impact for compact reporting. */
export function violationSummary(violations) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const violation of violations) counts[violation.impact] += 1;
  return counts;
}

/** Render one violation as a single-line description (id, impact, nodes). */
export function describeViolation(violation) {
  const targets = (violation.nodes ?? [])
    .slice(0, 3)
    .map((node) => (node.target ?? []).join(" "))
    .join(" | ");
  return `${violation.id} [${violation.impact}] ${violation.help ?? ""} — ${targets}`;
}
