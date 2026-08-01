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
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/mappa",
        "http://localhost:3000/directory",
        "http://localhost:3000/segnala",
        "http://localhost:3000/correggi",
        "http://localhost:3000/records/1",
        "http://localhost:3000/guide",
        "http://localhost:3000/accessibility",
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
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
