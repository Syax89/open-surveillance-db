/**
 * Lighthouse CI configuration (kanban t_2d2bf33f — QA proposal F-QA item 6).
 *
 * BLOCKING accessibility gate: every public route below must score
 * accessibility >= 0.95 in Lighthouse (real Chromium rendering — the
 * layout-dependent axe rules that jsdom cannot evaluate: color-contrast,
 * target-size WCAG 2.5.8, link-in-text-block, scrollable-region-focusable).
 * A PR whose preview fails this gate is rejected by the lighthouse job in
 * .github/workflows/lighthouse.yml.
 *
 * F8 (qa#5, t_ab0d4c75): the same run now also WARNS on performance/SEO
 * (categories:performance >= 0.6, categories:seo >= 0.9, LCP <= 4.0 s,
 * CLS <= 0.1) — non-blocking until the perf baseline stabilizes (see the
 * assert block for the rationale).
 *
 * Coverage model (reliability fix t_2f6e49a0, 2026-08-02): the list below is
 * ONE representative route per DISTINCT layout template, not every URL —
 * Lighthouse audits the layout-dependent rules, and the app has 5 shared
 * templates: TWO static content templates — InfoPage (guide/faq/contatti/
 * manifesto/regole/moderazione) and LegalPage (privacy/termini/licenze/
 * accessibility: a distinct component rendering a <table> with caption/th
 * scope, role="note" blocks, aria-labelledby sections and a version note) —
 * plus the tools shell ((tools)/layout.tsx: mappa, directory, segnala,
 * correggi — kept individually, each has a distinct layout), the auth pages
 * (login/register/account — the most layout-sensitive: forms, focus traps,
 * target-size on buttons) and the record detail (/records/[id]). /guide
 * represents InfoPage; /privacy represents LegalPage, which carries its own
 * colour tokens on .legal-table/.legal-note that only a real-rendering
 * contrast audit can catch (jsdom cannot evaluate color-contrast). Content-
 * level axe rules (alt text, aria, heading structure, …) still run on EVERY
 * public route via the jsdom SSR suite, so no route loses automated
 * coverage. 19 URLs made the job take 16-22 min against a 20 min timeout and
 * saturated the runner pool (queues of 40+ min, runs appearing "in_progress"
 * forever) — see kanban t_2f6e49a0.
 *
 * Local QA run (after `npm run build`):
 *   npx lhci autorun
 * The CLI starts the preview server itself (startServerCommand) and asserts
 * the same threshold — run it before pushing to catch regressions early.
 *
 * Note: the assertion key "categories:accessibility" is the LHCI syntax for
 * the Lighthouse category score; ["error", { minScore: 0.95 }] fails the run
 * when the score drops below 0.95.
 */
module.exports = {
  ci: {
    collect: {
      // Serves the production build exactly like the deployed Worker
      // (Miniflare + dist/server bundle + dist/client assets), see
      // scripts/serve-preview.mjs. Public routes only — no fixtures, no
      // credentials, no personal data.
      startServerCommand: "npm run preview:serve",
      // One representative per distinct layout template (11 URLs): home, the
      // 4 tools routes (mappa/directory/segnala/correggi — each a distinct
      // layout), record detail (/records/[id]), the 3 auth pages (PR #215 —
      // the most layout-sensitive: forms, focus traps, target-size on
      // buttons), /guide (InfoPage) and /privacy (LegalPage — its own colour
      // tokens on .legal-table/.legal-note need real-rendering contrast
      // checks, t_52c7e214). Auth routes SSR as public (no credentials
      // needed), matching the SSR axe harness. A visual or a11y regression
      // on any represented layout fails the gate.
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/mappa",
        "http://localhost:3000/directory",
        "http://localhost:3000/segnala",
        "http://localhost:3000/correggi",
        "http://localhost:3000/records/1",
        "http://localhost:3000/login",
        "http://localhost:3000/register",
        "http://localhost:3000/account",
        "http://localhost:3000/guide",
        "http://localhost:3000/privacy",
      ],
      numberOfRuns: 1,
      settings: {
        chromeFlags: ["--no-sandbox"],
        // Auditing the public site in the pilot language (EN) — same default
        // the SSR test harness uses. Locale toggle is covered by unit tests.
        locale: "en",
      },
    },
    assert: {
      assertions: {
        // BLOCKING GATE: accessibility category score >= 0.95.
        "categories:accessibility": ["error", { minScore: 0.95 }],
        // F8 qa#5 (t_ab0d4c75): performance/SEO were collected but never
        // asserted — a +100 KB bundle regression or a doubled LCP passed
        // the gate silently. These thresholds are WARN (non-blocking) on
        // purpose: the current mobile-4x baseline is perf 65-77 / LCP
        // 4.1-7.1 s (docs/qa/qa-infra-ken.md F5), so error thresholds
        // would turn the whole job red before the perf work lands. Once
        // the baseline stabilizes, promote to ["error", ...] in the same
        // keys. numberOfRuns stays 1 (t_2f6e49a0): 3 runs would triple the
        // ~8-10 min runtime against the 15-min step timeout and re-saturate
        // the runner pool; the median smoothing can be adopted together
        // with the timeout bump when the error thresholds are enabled.
        "categories:performance": ["warn", { minScore: 0.6 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 4000 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
