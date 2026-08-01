// Route registry for the F-QA per-phase gate (FRONTEND_PLAN.md sez. 7.2).
//
// Single source of truth for the acceptance criterion "route nuova senza
// (a) SSR smoke, (b) interaction test, (c) i18n parity, (d) a11y contract
// → QA negata". Every route the refactor ships must be listed HERE with its
// four mandatory test artifacts (file names under tests/).
//
// Phase rule (roadmap 5.3/7.1): the F1-F4 PRs ADD their new routes to this
// registry IN THE SAME PR that creates the route — never after. The gate
// test (tests/qa-phase-gate.test.mjs) fails when a listed artifact file is
// missing or a listed app source does not exist, so a half-tested route
// cannot merge silently.
//
// For existing routes the mapping records what already covers them; the
// "note" column explains intent. Fixtures remain fictional — no personal
// data anywhere in this registry or the tests that consume it.

export function registeredRoutes() {
  return [
    {
      route: "/",
      name: "home (hub)",
      source: "app/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-public-cameras-layer.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F2 hub: SSR puro, card tool, usePublicCount; filtri UI journey in e2e-journeys",
    },
    {
      route: "/guide",
      name: "guide",
      source: "app/guide/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica: interazione = toggle lingua (chrome condiviso)",
    },
    {
      route: "/login",
      name: "login",
      source: "app/login/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-auth-forms.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "aria-invalid chiuso in F-QA (QA-2026-08-01-2)",
    },
    {
      route: "/register",
      name: "register",
      source: "app/register/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-auth-forms.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "aria-invalid chiuso in F-QA (QA-2026-08-01-2)",
    },
    {
      route: "/account",
      name: "account",
      source: "app/account/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-account.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "solo dati propri (journey login→account in e2e-journeys)",
    },
    {
      route: "/records/[id]",
      name: "record detail",
      source: "app/records/[id]/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-record-page.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F0: fetch via GET /api/cameras/[id] quando atterrato",
    },
    {
      route: "/moderation",
      name: "moderation",
      source: "app/moderation/page.tsx",
      auth: true,
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-moderation-dashboard.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "guard role → 403; gate edge esercitato in worker-edge",
    },
    {
      route: "/privacy",
      name: "privacy",
      source: "app/privacy/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F-legal G1: sezione cookie qui",
    },
    {
      route: "/termini",
      name: "terms",
      source: "app/termini/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica",
    },
    {
      route: "/licenze",
      name: "licenses",
      source: "app/licenze/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica",
    },
    {
      route: "/faq",
      name: "faq",
      source: "app/faq/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica",
    },
    {
      route: "/contatti",
      name: "contact",
      source: "app/contatti/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica",
    },
    {
      route: "/manifesto",
      name: "manifesto",
      source: "app/manifesto/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica",
    },
    {
      route: "/regole",
      name: "rules",
      source: "app/regole/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica",
    },
    {
      route: "/moderazione",
      name: "moderation info page",
      source: "app/moderazione/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "statica",
    },
  ];
}

/** The artifact file names the per-route gate requires. */
export const REQUIRED_ARTIFACTS = ["ssr", "interaction", "i18n", "a11y"];
