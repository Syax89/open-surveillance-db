# Site map and information architecture

Last reviewed: 2026-08-01 (post-implementation state)

This document defines the information architecture of the public website:
the complete site map, the global navigation (page nav-shell and footer), and
the shared layout pattern that every informational page follows. It reflects
the **implemented** state of the site (all routes live since PRs #65, #67,
#68, #70, #71, #73, #76; QA in PR #72; informational pages converted to
Server Components in PR #120, with SSR locale resolution in PR #132). It is
the reference for future page changes and for the QA pass over the routes.

## Principles

1. **The home page is a tool, not a document.** `/` keeps the interactive
   surface (map, directory, report, correction) and the short hero. Long-form
   content (mission, rules, policies, FAQ) lives on dedicated pages linked
   from the header and footer.
2. **One page, one job.** Every route has a single purpose and a single
   `h1`. No page mixes two topics (e.g. rules and contacts never share a
   route).
3. **Bilingual by construction.** Every page uses the existing
   `LocaleProvider` pattern: an `en` (pilot) and `it` bundle, type-checked
   for parity by `Translation<typeof en>` (`app/lib/i18n/types.ts`). The
   legal pages (`/privacy`, `/termini`, `/licenze`) additionally use the
   structured legal content layer (`app/lib/legal/`). No hard-coded
   user-facing strings. The locale preference is persisted in the
   `opensurveillancedb-locale` cookie and read server-side (root layout +
   informational pages) so SSR renders the user's language with correct
   `<html lang>` and localized metadata (ADR 0015). Content URLs stay
   language-neutral; deep-links to a specific language use the redirect stub
   `GET /api/locale?lang=it&next=/guide` (sets the cookie, then 302).
4. **Privacy and safety by design.** Informational pages describe *what the
   project does and how moderation works*; they never expose pending/private
   data, contributor identities, internal notes, or operational details.
5. **Public pages stay public, tool pages stay tooled.** Public-facing
   informational routes are linked in nav/footer. Private tool routes
   (`/moderation` dashboard, `/account`, `/login`, `/register`) are never
   linked from the public navigation.
6. **Accessibility is part of the layout.** Every page starts with the skip
   link (provided by `LocaleProvider`), uses one `main#main-content`, a
   single `h1`, landmark navigation with `aria-label`, visible focus, and
   sufficient contrast.

## Route conventions

- Public informational routes use **short Italian slugs** (`/manifesto`,
  `/regole`, `/faq`…), matching the project's bilingual identity and the
  canonical names used in the footer.
- **Existing routes are never renamed.** `/guide` (already live) keeps its
  English slug; `/moderation` keeps its role as the **private moderator
  dashboard** (protected by `requireRole`). The public informational page
  about how moderation works is a **different route** (`/moderazione`) and
  must not be confused with the dashboard.
- New routes must be **kebab-case, lowercase**, and listed in this document
  before implementation.

## Site map

| Route          | Page                  | Purpose                                             | In home nav | In footer | Status |
|----------------|-----------------------|-----------------------------------------------------|:---:|:---:|--------|
| `/`            | Home                  | Map + directory + report + correction (the tool)    | ✓ (brand) | ✓ (brand) | implemented (prototype) |
| `/guide`       | Guide                 | How to use the site (map, directory, exports)       | ✓ | ✓ | implemented (pre-existing) |
| `/manifesto`   | Manifesto             | Mission, principles, non-goals, what we publish     | ✓ | ✓ | implemented (PR #65) |
| `/regole`      | Rules                 | Participation and content rules for contributors    | ✓ | ✓ | implemented (PR #67) |
| `/moderazione` | How moderation works  | Review flow, appeals, safeguards, SLAs              | — | ✓ | implemented (PR #73) |
| `/privacy`     | Privacy               | Public privacy notice                               | — | ✓ | implemented (PR #70) |
| `/termini`     | Terms of use          | Public terms of use                                 | — | ✓ | implemented (PR #70) |
| `/licenze`     | Licences              | Data and software licences, OSM attribution         | — | ✓ | implemented (PR #70) |
| `/faq`         | FAQ                   | Frequent questions                                  | — | ✓ | implemented (PR #68) |
| `/contatti`    | Contacts              | Who we are, owners, correction/removal contact      | — | ✓ | implemented (PR #68) |

"Home nav" means the page is linked from the home page's `nav-shell` (the
only page with the full link set: Map & data, Directory, Guide, Rules,
Manifesto, Add a camera). Informational pages render their own compact
`nav-shell` with a context-appropriate subset of links; see "Page
navigation" below.

Routes **not** linked in nav/footer (private or functional): `/moderation`
(moderator dashboard), `/account`, `/login`, `/register`, `/records/[id]`
(linked contextually from map/directory), `/api/*`, and the future
`/feedback` (ADR 0006, still proposed).

## Page-by-page specification

### `/` — Home (implemented)

- **Purpose:** the interactive tool. Entry point for map exploration,
  directory browsing, submitting a report, and filing a correction.
- **Content:** hero, map section, directory section, correction section,
  principles section (kept short; the full manifesto lives at `/manifesto`).
- **Nav/footer:** brand in the page `nav-shell` and in the footer; the map
  section links the exports (GeoJSON/CSV) and `/guide`.
- **Notes:** anchor targets (`#map`, `#records`, `#report`, `#top`) remain
  valid for the nav links (`/#map` etc.).

### `/guide` — Guide (implemented, pre-existing)

- **Purpose:** how to use the site: map, directory, filters, exports, record
  lifecycle and statuses.
- **Content:** `app/guide/page.tsx`, rendered with the shared
  `nav-shell` + `record-detail` layout; the global footer comes from the
  root layout (not repeated in the page).
- **Nav/footer:** in home nav and footer.

### `/manifesto` — Manifesto (implemented, PR #65)

- **Purpose:** mission, principles, non-goals, and what the project does and
  does not publish.
- **Content:** from the home "principles" section and `README.md` (mission,
  principles, non-goals: no video feeds, no tracking tools, no advice on
  avoiding lawful surveillance; private-home cameras excluded). Bundle:
  `manifesto` (`app/lib/i18n/en.ts`).
- **Nav/footer:** home nav + footer.

### `/regole` — Rules (implemented, PR #67)

- **Purpose:** participation and content rules: what may be reported (public
  space only, no people/plates/private homes), moderation, corrections, data
  reuse.
- **Content:** from `docs/MODERATION.md` (publication standard, eligible
  examples, exclusions) and README "Before submitting". Bundle: `rules`.
- **Nav/footer:** home nav + footer.

### `/moderazione` — How moderation works (implemented, PR #73)

- **Purpose:** public explanation of the review flow, appeals, corrections,
  and moderator safeguards. **Not** the private dashboard (that stays at
  `/moderation`).
- **Content:** from `docs/MODERATION.md` (review flow, appeals and
  corrections, moderator safeguards) and ADR 0014. Bundle: `moderazione`.
- **Nav/footer:** footer only (keeps the header lean).

### `/privacy` — Privacy (implemented, PR #70)

- **Purpose:** the public privacy notice.
- **Content:** `legalMessages[locale].privacy` from `app/lib/legal/en.ts` /
  `it.ts` (structured sections rendered by `LegalPage`), adapted from
  `docs/legal/PRIVACY_NOTICE.md` — the repository copy stays canonical.
- **Nav/footer:** footer only.

### `/termini` — Terms of use (implemented, PR #70)

- **Purpose:** the public terms of use.
- **Content:** `legalMessages[locale].terms` from `app/lib/legal/en.ts` /
  `it.ts`, adapted from `docs/TERMS_OF_USE.md` (14 sections), readable web
  form.
- **Nav/footer:** footer only.

### `/licenze` — Licences (implemented, PR #70)

- **Purpose:** data and software licences, OSM attribution, contributor
  promise.
- **Content:** `legalMessages[locale].licenses` from `app/lib/legal/en.ts` /
  `it.ts`, adapted from `docs/OPEN_SOURCE.md` (software, documentation,
  database and exports, OpenStreetMap data, contributor promise) + ODbL
  notice.
- **Nav/footer:** footer only.

### `/faq` — FAQ (implemented, PR #68)

- **Purpose:** frequent questions: how to report, map accuracy, how to
  correct an error, privacy.
- **Content:** curated Q&A from README/guide/moderation docs. Bundle: `faq`.
- **Nav/footer:** footer only.

### `/contatti` — Contacts (implemented, PR #68)

- **Purpose:** who we are, project owners, correction/removal contact,
  security disclosure route.
- **Content:** from `GOVERNANCE.md` (owners and roles), the correction /
  removal contact from `docs/legal/PRIVACY_NOTICE.md`
  (privacy@opensurveillancedb), and the security reporting route from
  `SECURITY.md` — the page links the GitHub security-advisories form and
  does not include sensitive data in the body. Bundle: `contact`.
- **Nav/footer:** footer only.

## Global navigation

### Page navigation (`nav-shell`, per page)

There is **no shared header component**: every page renders its own
`nav-shell` (brand + `nav-links` + `LocaleToggle`) with the link set that
fits its context. This is the implemented pattern; keep it consistent:

| Page(s)     | `nav-links` (in order)                                        |
|-------------|---------------------------------------------------------------|
| `/`         | Map & data (`/#map`), Directory (`/#records`), Guide, Rules, Manifesto, CTA Add a camera (`/#report`) |
| `/guide`    | Map, Directory, FAQ, Contacts, Manifesto, Home                 |
| `/manifesto`, `/regole` | Map, Directory, Guide, Home (CTA)              |
| `/moderazione` | Map, Directory, Home (CTA)                                  |
| `/faq`      | Map, Directory, Contacts, Home (CTA)                          |
| `/contatti` | Map, Directory, FAQ, Home (CTA)                               |
| `/privacy`, `/termini`, `/licenze` | Map, Directory, Guide (via `LegalPage`)  |

- Mobile: the `menu-button` collapse is implemented on the home page; the
  informational pages currently render the `nav-links` inline (they wrap at
  ≤700px per the shared CSS) — keep this behaviour consistent when adding
  pages.
- Labels come from each page's bundle (`bundle.<page>.navigation` etc.), not
  from a shared nav bundle.
- Anchor links (`/#map`, `/#records`) navigate to the home page and its
  section; they work from any route.

### Footer (shared, global)

`SiteFooter` (`app/components/SiteFooter.tsx`) is rendered **once in the
root layout** (`app/layout.tsx`), so every page — public, guide, record,
moderation and auth — shares the same institutional navigation. It is a
`footer` landmark (`contentinfo`) containing a labelled `nav` with the
institutional links and the legal bar:

| Section    | Content                                                       |
|------------|---------------------------------------------------------------|
| Brand      | OpenSurveillanceDB + tagline                                  |
| Nav        | Manifesto, Rules, Guide, Privacy, Terms of use, Licences, FAQ, Contact |
| Legal bar  | Data licence **ODbL 1.0** notice + **© OpenStreetMap contributors** attribution |

- Footer labels are bilingual (EN/IT) via the shared `footer` bundle
  (`bundle.footer`).
- The moderation queue (`/moderation`) is deliberately **not** linked in the
  footer (publication-boundaries suite).
- De-dup note: pages must **not** render their own footer — the global one
  is enough (PR #76 removed the per-page duplicates).

## Shared layout pattern for informational pages

All informational pages (`/guide`, `/manifesto`, `/regole`, `/moderazione`,
`/privacy`, `/termini`, `/licenze`, `/faq`, `/contatti`) share the same
structure so the QA pass and future maintenance stay uniform. Two variants
are implemented:

### Variant A — free-form informational pages (`InfoPage` + `getServerMessages`)

Used by `/guide`, `/manifesto`, `/regole`, `/moderazione`, `/faq`,
`/contatti`. Since PR #120 the pages are **Server Components**: the shared
`InfoPage` component (`app/components/InfoPage.tsx`, no `"use client"`)
renders the `nav-shell` + `record-detail` layout, and each route is an
`async` page that resolves its bundle server-side via `getServerMessages()`
(`app/lib/server-i18n.ts`, reads the `opensurveillancedb-locale` cookie)
and supplies per-route metadata with `generateMetadata()`. The only client
island is `<LocaleToggle />` (re-renders the route via `router.refresh()`).

Pattern (abridged from `app/guide/page.tsx`):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "../components/InfoPage";
import { getServerMessages } from "../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getServerMessages()).<page>;
  return { title: t.title, description: t.intro, /* …OG/Twitter… */ };
}

export default async function GuidePage() {
  const bundle = await getServerMessages();
  const t = bundle.<page>;            // per-page bundle (e.g. bundle.guide)

  return (
    <InfoPage
      navLabel={t.navigation}
      homeLabel={t.homeAria}
      navLinks={
        <>
          <Link href="/#map">{t.map}</Link>
          <Link href="/#records">{t.directory}</Link>
          {/* …page-specific links… */}
          <Link className="nav-action" href="/">{t.home}</Link>
        </>
      }
      eyebrow={t.eyebrow}
      title={t.title}
      intro={t.intro}
      actions={/* optional .record-detail-actions CTAs */}
    >
      {/* content sections: <section> with aria-labelledby, one per topic */}
      <section aria-labelledby="topic-1-title">
        <h2 id="topic-1-title">{t.topicOneTitle}</h2>
        <p>{t.topicOneBody}</p>
      </section>
    </InfoPage>
  );
}
```

- `InfoPage` encapsulates the previously duplicated structure: navigation
  shell (brand + page nav links + `<LocaleToggle />`), intro article
  (eyebrow / `h1` / summary / optional CTA row) and the content sections
  supplied as children. Nav links and CTAs differ per page, so both are
  injected as props; every page's copy stays in its own i18n bundle.
- The server-side pattern is what makes the routes statically renderable:
  correct `<html lang>` on first paint, localized metadata per route and
  shareable deep-links — the SSR/SEO motivation behind PR #120 and the
  cookie-based locale resolution (ADR 0015, PR #132).
- The global `SiteFooter` is rendered by the root layout — **do not** add a
  `<Footer />` in the page body.

### Variant B — legal pages (`LegalPage` + `app/lib/legal/`)

Used by `/privacy`, `/termini`, `/licenze`. The page wrapper is an `async`
Server Component (same as Variant A): it resolves the locale server-side
and passes the structured content plus the nav labels to the shared
`LegalPage` component. `LegalPage` itself stays a client component because
it renders the inline-markup blocks (`**bold**`, `*italic*`,
`[label](url)`):

```tsx
import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";
import { legalMessages } from "../lib/legal";
import { getServerLocale, getServerMessages } from "../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const content = legalMessages[await getServerLocale()].privacy;
  return { title: content.title, description: content.intro, /* … */ };
}

export default async function PrivacyPage() {
  const [locale, bundle] = await Promise.all([getServerLocale(), getServerMessages()]);
  const home = bundle.home;
  return (
    <LegalPage
      content={legalMessages[locale].privacy}
      navLabels={{ mainNavigation: home.mainNavigation, homeAria: home.homeAria, /* … */ }}
    />
  );
}
```

- `LegalPage` renders the `nav-shell` (Map, Directory, Guide), the
  `record-detail` hero (eyebrow, `h1`, intro) and the content sections.
- Content blocks live in `app/lib/legal/en.ts` / `it.ts`
  (`LegalContent` type in `app/lib/legal/types.ts`), with inline markup
  support: `**bold**`, `*italic*`, `[label](url)`.
- The repository copies of the legal docs (`docs/legal/PRIVACY_NOTICE.md`,
  `docs/TERMS_OF_USE.md`, `docs/OPEN_SOURCE.md`) remain canonical; the
  bundles are the presentation layer.

### Rules for the pattern

1. **The footer is shared and global** (root layout); it is never copied
   per page.
2. **One `h1` per page**, placed in the `article.record-detail` hero
   (existing class). Sections use `h2`; sub-parts `h3`. No skipped levels.
3. **Bilingual:** page strings live in the page's bundle inside
   `app/lib/i18n/en.ts` (pilot) mirrored in `it.ts`; parity is enforced by
   the `Translation<typeof en>` type. Pages read their bundle server-side
   via `getServerMessages()` (`app/lib/server-i18n.ts`) — never import the
   client hook `useMessages()` in a page. Legal pages use the
   `app/lib/legal/` layer with the same en/it parity rule. (A refactor
   splitting the i18n monolith into per-domain files —
   `app/lib/i18n/home.ts`, `guide.ts`, `auth.ts`, … — is in progress in
   PR #80; when it merges, update this rule and the i18n section below to
   the per-domain layout.)
4. **Content sources** are the docs referenced in the page-by-page spec;
   pages summarise/adapt them, they do not duplicate the raw markdown
   wholesale.
5. **No pending/private data, no identities, no internal notes** on any
   informational page (QA check, enforced since PR #72).
6. **Mobile:** the pattern reuses the existing responsive rules
   (`nav-shell` wrap at 700px, `record-detail` single column at 480px).

## i18n bundles (current state)

| Bundle    | Where                                                     | Purpose |
|-----------|-----------------------------------------------------------|---------|
| `common`, `map`, `status` | `app/lib/i18n/en.ts` / `it.ts` | shared UI chrome (skip link, map labels, record statuses) |
| `home`    | `app/lib/i18n/en.ts` / `it.ts` | home page (hero, map, directory, correction, principles) |
| `guide`   | 〃                          | guide page |
| `manifesto` | 〃                        | manifesto page |
| `moderazione` | 〃                      | how-moderation-works page |
| `faq`     | 〃                           | FAQ page |
| `contact` | 〃                           | contacts page |
| `rules`   | 〃                           | rules page |
| `record`  | 〃                           | record detail page |
| `moderation` | 〃                       | private moderator dashboard |
| `auth`    | 〃                           | login/register/account |
| `footer`  | 〃                           | global footer labels |
| `legal`   | `app/lib/legal/en.ts` / `it.ts` | structured legal content (`privacy`, `terms`, `licenses`) rendered by `LegalPage` |

Notes:

- The main i18n files are still **monolithic** `en.ts` / `it.ts` (top-level
  bundle per page). PR #80 splits them into per-domain files
  (`app/lib/i18n/home.ts`, `guide.ts`, `auth.ts`, …) — after that PR
  merges, update this table to the per-domain paths and drop the "monolith"
  wording. Until then, this table describes `main` as it is.
- The legal layer is **separate** from the main bundle: `app/lib/legal/`
  has its own `en.ts` / `it.ts` / `types.ts` / `index.ts` and its own
  `LegalContent` type (inline markup support).

## Content sources map

| Page          | Primary sources                                          |
|---------------|----------------------------------------------------------|
| `/manifesto`  | home `principles` section, `README.md` (Principles, non-goals) |
| `/regole`     | `docs/MODERATION.md` (Publication standard, Eligible examples, Exclusions), README "Before submitting" |
| `/moderazione`| `docs/MODERATION.md` (Review flow, Appeals and corrections, Moderator safeguards), ADR 0014 |
| `/privacy`    | `docs/legal/PRIVACY_NOTICE.md`                           |
| `/termini`    | `docs/TERMS_OF_USE.md`                                   |
| `/licenze`    | `docs/OPEN_SOURCE.md`, `LICENSE`                         |
| `/faq`        | README, `docs/MODERATION.md`, `docs/PRIVACY_AND_SAFETY.md` |
| `/contatti`   | `GOVERNANCE.md` (owners/roles), `docs/legal/PRIVACY_NOTICE.md` (correction/removal contact), `SECURITY.md` (security route only) |

## QA verification (completed, PR #72)

The acceptance pass over the informational routes was executed and merged
with PR #72 (tests: `tests/navigation-pages.test.mjs`,
`tests/publication-boundaries.test.mjs`, `tests/pages-render.test.mjs`,
`tests/legal-pages.test.mjs`). It covered:

1. Every link in page nav and footer resolves (HTTP 200, no 404).
2. `/moderazione` exists and is distinct from the `/moderation` dashboard.
3. Each informational page: one `h1`, no skipped heading levels, skip link
   works, visible focus, contrast passes.
4. EN/IT bundles are complete and coherent on every page (type-checked
   parity + spot check).
5. No pending/private data, contributor identities, or internal notes on any
   public page.
6. Rendered-route tests added for the new routes in the existing test suite.

## Open items

- **i18n refactor (PR #80):** the per-domain bundle split
  (`app/lib/i18n/<domain>.ts`) is open; after it merges, update the "i18n
  bundles" section and rule 3 of the layout pattern in this document.
- Header nav: pages keep their compact per-page `nav-shell`; if more pages
  are added, revisit the home link set (do not grow it without an explicit
  decision).
- `/guide` slug kept for compatibility; a future alias `/guida` is possible.
- `/feedback` route (ADR 0006) remains proposed, not implemented.
