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
//
// Dynamic routes: "/records/[id]" is resolved to a fictional demo id
// (/records/1) by the SSR/axe suites before dispatching — the registry
// keeps the Next.js route pattern as the source of truth.
export function registeredRoutes() {
  return [
    {
      route: "/",
      name: "home (hub)",
      source: "app/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "home-hub.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F2 hub SSR-pure: interaction = usePublicCount + nav (home-hub); journey in e2e-journeys",
    },
    {
      route: "/mappa",
      name: "map tool",
      source: "app/(tools)/mappa/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-tools.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F1 tool; F4 possiede il contratto URL dei filtri (url-contract gate)",
    },
    {
      route: "/directory",
      name: "directory tool",
      source: "app/(tools)/directory/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-tools.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F1 tool; journey browse→filtri→record in browse-filter-record",
    },
    {
      route: "/segnala",
      name: "report tool",
      source: "app/(tools)/segnala/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-tools.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F1 tool; journey segnala→submit→coda moderazione in e2e-journeys",
    },
    {
      route: "/correggi",
      name: "correction tool",
      source: "app/(tools)/correggi/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-tools.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F1 tool",
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
      source: "app/account/AccountPageBody.tsx",
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
      source: "app/records/[id]/RecordPageBody.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-record-page.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "route dinamica: audit e SSR usano l'id demo fittizio /records/1",
    },
    {
      route: "/records/[id]/edit",
      name: "record edit",
      source: "app/records/[id]/edit/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-edit-form.test.mjs",
        i18n: "client-locale-toggle.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "C6: privata auth-gated owner-only; la pagina SSR parte dal gate loading (client)",
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
    {
      route: "/accessibility",
      name: "accessibility statement page",
      source: "app/accessibility/page.tsx",
      artifacts: {
        ssr: "pages-render.test.mjs",
        interaction: "client-locale-toggle.test.mjs",
        i18n: "i18n-pages.test.mjs",
        a11y: "axe-audit.test.mjs",
      },
      note: "F-legal G2: pagina pubblica della dichiarazione",
    },
  ];
}

/** The artifact file names the per-route gate requires. */
export const REQUIRED_ARTIFACTS = ["ssr", "interaction", "i18n", "a11y"];
