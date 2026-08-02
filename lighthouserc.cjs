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
      // Every public route (QA review P1-2): the 8 originals plus the auth
      // pages (PR #215 — the most layout-sensitive: forms, focus traps,
      // target-size on buttons) and the legal/static pages, so a visual or
      // a11y regression on any of them fails the gate. Auth routes SSR as
      // public (no credentials needed), matching the SSR axe harness.
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/mappa",
        "http://localhost:3000/directory",
        "http://localhost:3000/segnala",
        "http://localhost:3000/correggi",
        "http://localhost:3000/records/1",
        "http://localhost:3000/guide",
        "http://localhost:3000/accessibility",
        "http://localhost:3000/login",
        "http://localhost:3000/register",
        "http://localhost:3000/account",
        "http://localhost:3000/faq",
        "http://localhost:3000/contatti",
        "http://localhost:3000/privacy",
        "http://localhost:3000/termini",
        "http://localhost:3000/licenze",
        "http://localhost:3000/manifesto",
        "http://localhost:3000/regole",
        "http://localhost:3000/moderazione",
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
