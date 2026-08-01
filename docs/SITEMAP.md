# Site map and information architecture

Last reviewed: 2026-08-01

This document defines the information architecture of the public website:
the complete site map, the global navigation (header nav and footer), and the
shared layout pattern that every informational page follows. It is the
reference for the pages built by the "separate pages, not everything on the
home" workstream and for the QA pass over the new routes.

## Principles

1. **The home page is a tool, not a document.** `/` keeps the interactive
   surface (map, directory, report, correction) and the short hero. Long-form
   content (mission, rules, policies, FAQ) lives on dedicated pages linked
   from the header and footer.
2. **One page, one job.** Every route has a single purpose and a single
   `h1`. No page mixes two topics (e.g. rules and contacts never share a
   route).
3. **Bilingual by construction.** Every page uses the existing
   `LocaleProvider` pattern: a `en` (pilot) and `it` bundle, type-checked
   for parity by `Translation<typeof en>` (`app/lib/i18n/types.ts`). No
   hard-coded user-facing strings. The locale preference is persisted in the
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

| Route          | Page                  | Purpose                                             | In header nav | In footer |
|----------------|-----------------------|-----------------------------------------------------|:---:|:---:|
| `/`            | Home                  | Map + directory + report + correction (the tool)    | ✓ (brand) | ✓ (brand) |
| `/guide`       | Guide                 | How to use the site (map, directory, exports)       | ✓ | ✓ |
| `/manifesto`   | Manifesto             | Mission, principles, non-goals, what we publish     | ✓ | ✓ |
| `/regole`      | Rules                 | Participation and content rules for contributors    | ✓ | ✓ |
| `/moderazione` | How moderation works  | Review flow, appeals, safeguards, SLAs              | — | ✓ |
| `/privacy`     | Privacy               | Public privacy notice                               | — | ✓ |
| `/termini`     | Terms of use          | Public terms of use                                 | — | ✓ |
| `/licenze`     | Licences              | Data and software licences, OSM attribution         | — | ✓ |
| `/faq`         | FAQ                   | Frequent questions                                  | — | ✓ |
| `/contatti`    | Contacts              | Who we are, owners, correction/removal contact      | — | ✓ |

Routes **not** linked in nav/footer (private or functional): `/moderation`
(moderator dashboard), `/account`, `/login`, `/register`, `/records/[id]`
(linked contextually from map/directory), `/api/*`, and the future
`/feedback` (ADR 0006).

## Page-by-page specification

### `/` — Home (exists, to be slimmed)

- **Purpose:** the interactive tool. Entry point for map exploration,
  directory browsing, submitting a report, and filing a correction.
- **Content:** hero, map section, directory section, correction section,
  report section. The "principles" section moves to `/manifesto`; long
  explanatory copy moves to `/guide`, `/regole`, and `/moderazione`.
- **Nav/footer:** brand in header and footer; footer also links the exports
  (GeoJSON/CSV) and the top-level informational pages.
- **Notes:** anchor targets (`#map`, `#records`, `#report`, `#top`) remain
  valid for the global header links (`/#map` etc.).

### `/guide` — Guide (exists, align to pattern)

- **Purpose:** how to use the site: map, directory, filters, exports, record
  lifecycle and statuses.
- **Content:** existing `app/guide/page.tsx` content, reflowed into the
  shared informational layout with a consistent footer.
- **Nav/footer:** in header nav and footer.
- **Ownership:** existing; layout alignment follows this document.

### `/manifesto` — Manifesto

- **Purpose:** mission, principles, non-goals, and what the project does and
  does not publish.
- **Content:** from the home "principles" section and `README.md`
  (mission, principles, non-goals: no video feeds, no tracking tools, no
  advice on avoiding lawful surveillance; private-home cameras excluded).
- **Nav/footer:** header nav + footer.
- **Ownership:** task `t_800022fa` (Linus).

### `/regole` — Rules

- **Purpose:** participation and content rules: what may be reported (public
  space only, no people/plates/private homes), moderation, corrections, data
  reuse.
- **Content:** from `docs/MODERATION.md` (publication standard, eligible
  examples, exclusions) and README "Before submitting".
- **Nav/footer:** header nav + footer.
- **Ownership:** task `t_5eeb6c62` (Linus).

### `/moderazione` — How moderation works

- **Purpose:** public explanation of the review flow, appeals, corrections,
  and moderator safeguards. **Not** the private dashboard (that stays at
  `/moderation`).
- **Content:** from `docs/MODERATION.md` (review flow, appeals and
  corrections, moderator safeguards) and ADR 0014.
- **Nav/footer:** footer only (keeps the header lean).
- **Ownership:** not yet assigned — proposed: Marie (docs-to-web conversion
  is already her lane). Must be created before the footer links it.

### `/privacy` — Privacy

- **Purpose:** the public privacy notice.
- **Content:** from `docs/legal/PRIVACY_NOTICE.md`, presented in readable
  web form (sections, plain language, contact for correction/removal).
- **Nav/footer:** footer only.
- **Ownership:** task `t_15703460` (Marie).

### `/termini` — Terms of use

- **Purpose:** the public terms of use.
- **Content:** from `docs/TERMS_OF_USE.md` (14 sections), readable web form.
- **Nav/footer:** footer only.
- **Ownership:** task `t_15703460` (Marie).

### `/licenze` — Licences

- **Purpose:** data and software licences, OSM attribution, contributor
  promise.
- **Content:** from `docs/OPEN_SOURCE.md` (software, documentation, database
  and exports, OpenStreetMap data, contributor promise) + ODbL notice.
- **Nav/footer:** footer only.
- **Ownership:** task `t_15703460` (Marie).

### `/faq` — FAQ

- **Purpose:** frequent questions: how to report, map accuracy, how to
  correct an error, privacy.
- **Content:** curated Q&A from README/guide/moderation docs.
- **Nav/footer:** footer only.
- **Ownership:** task `t_dd306f21` (Marie).

### `/contatti` — Contacts

- **Purpose:** who we are, project owners, correction/removal contact,
  security disclosure route.
- **Content:** from `GOVERNANCE.md` (owners), `docs/legal/PRIVACY_NOTICE.md`
  (correction/removal contact), `SECURITY.md` (security route — no
  sensitive data in the public page body, only the route).
- **Nav/footer:** footer only.
- **Ownership:** task `t_dd306f21` (Marie).

## Global navigation

### Header nav (shared)

Present on every page (brand + up to four links + CTA + `LocaleToggle`),
following the existing `nav-shell` pattern:

| Link        | Route   | EN label        | IT label          |
|-------------|---------|-----------------|-------------------|
| brand       | `/`     | OpenSurveillanceDB | OpenSurveillanceDB |
| Map & data  | `/#map` | Map & data      | Mappa e dati      |
| Guide       | `/guide`| Guide           | Guida             |
| Manifesto   | `/manifesto` | Manifesto  | Manifesto         |
| Rules       | `/regole` | Rules         | Regole            |
| CTA         | `/#report` | Add a camera | Aggiungi una telecamera |

- Mobile: the existing `menu-button` collapses the links; the CTA stays
  visible in the opened menu (current behaviour).
- The header is rendered from shared i18n keys (see layout pattern below),
  not per-page strings.
- Anchor links (`/#map`, `/#report`) navigate to the home page and its
  section; they work from any route.

### Footer (shared)

Four columns + bottom bar, rendered on every page:

| Column   | Links                                                        |
|----------|--------------------------------------------------------------|
| Project  | Manifesto, Rules, How moderation works, Guide                |
| Legal    | Privacy, Terms of use, Licences                              |
| Support  | FAQ, Contacts                                                |
| Data     | Export GeoJSON, Export CSV (same public-record boundary)     |

Bottom bar: data licence **ODbL** notice, **© OpenStreetMap contributors**
attribution, and a link to the open-source repository (GitHub).

- Footer labels are bilingual (EN/IT) via the shared i18n keys.
- The footer is a `footer` landmark; link groups are wrapped in `nav` with
  `aria-label` only when they are navigation landmarks (recommended: one
  `nav` per column group, or a single labelled `nav` around all columns).
- Ownership: task `t_d04d1e7f` (Ada).

## Shared layout pattern for informational pages

All informational pages (`/guide`, `/manifesto`, `/regole`, `/moderazione`,
`/privacy`, `/termini`, `/licenze`, `/faq`, `/contatti`) use the same
structure so the QA pass and future maintenance stay uniform.

### Structure (JSX)

```tsx
"use client";
import { LocaleToggle, useMessages } from "../components/LocaleProvider";
import Link from "next/link";

export default function InfoPage() {
  const bundle = useMessages();
  const t = bundle.<page>;           // per-page bundle (e.g. bundle.manifesto)
  const nav = bundle.nav;            // shared navigation strings
  const footer = bundle.footer;      // shared footer strings

  return (
    <main id="main-content" className="info-page">
      {/* header nav: shared component (nav-shell + LocaleToggle) */}
      <HeaderNav active="/manifesto" />

      <article className="record-detail">
        <p className="eyebrow"><span /> {t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className="record-detail-summary">{t.intro}</p>
      </article>

      {/* content sections: <section> with aria-labelledby, one per topic */}
      <section aria-labelledby="topic-1-title">
        <h2 id="topic-1-title">{t.topicOneTitle}</h2>
        <p>{t.topicOneBody}</p>
      </section>

      <Footer />
    </main>
  );
}
```

### Rules for the pattern

1. **Header nav and footer are shared components** (from the global layout
   or a `components/` module), never copied per page. The current `/guide`
   duplication of nav/footer is the motivation for this pattern.
2. **One `h1` per page**, placed in the `article.record-detail` hero
   (existing class). Sections use `h2`; sub-parts `h3`. No skipped levels.
3. **Bilingual:** add one top-level bundle per page in `app/lib/i18n/en.ts`
   (pilot) and mirror it in `it.ts`; parity is enforced by the
   `Translation<typeof en>` type. Add `nav` and `footer` bundles for the
   shared chrome (see "i18n keys" below).
4. **Content sources** are the docs referenced in the page-by-page spec;
   pages summarise/adapt them, they do not duplicate the raw markdown
   wholesale.
5. **No pending/private data, no identities, no internal notes** on any
   informational page (QA check, `t_cdbaad9e`).
6. **Mobile:** the pattern reuses the existing responsive rules
   (`nav-shell` collapse at 700px, `record-detail` single column at 480px).

### i18n keys to add

| Bundle    | Purpose                                          |
|-----------|--------------------------------------------------|
| `nav`     | shared header links (map, guide, manifesto, rules, add-a-camera) |
| `footer`  | shared footer columns and labels (project/legal/support/data, ODbL, OSM attribution) |
| `manifesto`, `regole`, `moderazione`, `privacy`, `termini`, `licenze`, `faq`, `contatti` | per-page content bundles |
| `guide`   | exists; extend if the layout alignment needs new strings |

## Content sources map

| Page          | Primary sources                                          |
|---------------|----------------------------------------------------------|
| `/manifesto`  | home `principles` section, `README.md` (Principles, non-goals) |
| `/regole`     | `docs/MODERATION.md` (Publication standard, Eligible examples, Exclusions), README "Before submitting" |
| `/moderazione`| `docs/MODERATION.md` (Review flow, Appeals and corrections, Moderator safeguards), ADR 0014 |
| `/privacy`    | `docs/legal/PRIVACY_NOTICE.md`                           |
| `/termini`    | `docs/TERMS_OF_USE.md`                                   |
| `/licenze`    | `docs/OPEN_SOURCE.md`, `LICENSE`                          |
| `/faq`        | README, `docs/MODERATION.md`, `docs/PRIVACY_AND_SAFETY.md` |
| `/contatti`   | `GOVERNANCE.md`, `docs/legal/PRIVACY_NOTICE.md` (contact), `SECURITY.md` (route only) |

## Acceptance checklist (QA, task `t_cdbaad9e`)

1. Every link in header nav and footer resolves (HTTP 200, no 404).
2. `/moderazione` exists and is distinct from the `/moderation` dashboard.
3. Each informational page: one `h1`, no skipped heading levels, skip link
   works, visible focus, contrast passes.
4. EN/IT bundles are complete and coherent on every page (type-checked
   parity + spot check).
5. No pending/private data, contributor identities, or internal notes on any
   public page.
6. Rendered-route tests added for the new routes in the existing test suite.

## Open items

- `/moderazione` ownership not yet assigned (proposed: Marie, before the
  footer links it).
- Header nav stays at four links + CTA; if more pages are added, revisit
  (do not grow the header without an explicit decision).
- `/guide` slug kept for compatibility; a future alias `/guida` is possible
  but not required now (YAGNI).
