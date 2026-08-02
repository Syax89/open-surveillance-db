# Site map and information architecture

Last reviewed: 2026-08-02 (post-implementation state, F1–F3 + community C1–C6)

> **Design & refactor vision:** the refactor that promotes the home-page tool
> sections to separate routes (`/mappa`, `/directory`, `/segnala`, `/correggi`)
> is specified in [`docs/FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md) (design
> vision) and [`docs/FRONTEND_PLAN.md`](FRONTEND_PLAN.md) (consolidated
> roadmap with phases, API requirements, legal/security/i18n requirements and
> acceptance criteria). This document describes the implemented state; those
> documents describe the target state and the phase plan.

This document defines the information architecture of the public website:
the complete site map, the global navigation (page nav-shell and footer), and
the shared layout pattern that every informational page follows. It reflects
the **implemented** state of the site (all routes live since PRs #65, #67,
#68, #70, #71, #73, #76; QA in PR #72; informational pages converted to
Server Components in PR #120, with SSR locale resolution in PR #132; the four
public tool routes split in F1, t_03c0fa15 / PR #158; the home hub in F2,
t_52dcb95e / PR #162; the footer tool links and legacy-anchor redirect in F3,
t_2ca69725 / PR #161; the community frontend — extended `/account` and the
verification widget — in C5, PR #181, and the owner edit page in C6, PR
#180). It is the reference for future page changes and for the QA pass over
the routes.

**Phase status (frontend refactor, roadmap `docs/FRONTEND_PLAN.md`):**

- **F1 done** — the four tool routes exist as dedicated pages
  (`/mappa`, `/directory`, `/segnala`, `/correggi`, route group
  `app/(tools)/` with shared `ToolLayout`).
- **F2 done** (t_52dcb95e, PR #162) — the home is a hub: static map teaser
  (`MapTeaser`) + four tool cards (`ToolCards`). `/` no longer renders the
  old anchor sections (`#map`, `#records`, `#report`).
- **F3 done** (t_2ca69725, PR #161) — the tool routes are linked from the
  home nav (`HomeNav`) and from the global footer (`SiteFooter`), and
  `LegacyAnchorRedirect` client-side-redirects the legacy anchors
  (`/#map`, `/#records`, `/#report`, `/#correction`) to the tool routes.

**Phase status (community system, roadmap `docs/COMMUNITY_PLAN.md`):**

- **C-ADR done** — ADR 0018 (verifications, trust levels, two-track editing,
  two identity layers) recorded before any code; the routes below are listed
  here **before** implementation per the route rule.
- **C1, C2, C3, C4 done** — backend schema/verifications (C1, PR #174),
  profile API with `deriveLevel` (C2, PR #176), two-track contribution
  editing with moderated edit requests (C3, PR #177), corrections whitelist +
  dedupe (C4, PR #175). The verification toggle, the profile/level contracts
  and the edit-flow backend are live on `main`.
- **C6 done** — frontend edit page `/records/[id]/edit` + owner edit links
  (C6, PR #180); **C5 done** — extended `/account` (level badge + paginated
  contributions) and the verification widget on `/records/[id]` (C5, PR
  #181).

## Principles

1. **The home page is a hub, not the tool.** Since F1 (t_03c0fa15) the four
   interactive tools live on their own routes (`/mappa`, `/directory`,
   `/segnala`, `/correggi`) with a shared tool layout; `/` keeps the hero and
   orienting content and links the tools (F2 completed the hub: static map
   teaser + four tool cards). Long-form content (mission, rules, policies,
   FAQ) lives on dedicated pages linked from the header and footer.
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
- Public tool routes follow the same kebab-case convention with one
  documented exception: `/mappa`, `/segnala`, `/correggi` are Italian
  (coherent with the informational slugs), while **`/directory` keeps the
  English slug** — precedent: `/guide` (already live, never renamed).
  Decided in `docs/FRONTEND_PLAN.md` §1.3 (CTO t_f24c3227) and listed here
  **before** implementation, per the rule below.
- **Existing routes are never renamed.** `/guide` (already live) keeps its
  English slug; `/moderation` keeps its role as the **private moderator
  dashboard** (protected by `requireRole`). The public informational page
  about how moderation works is a **different route** (`/moderazione`) and
  must not be confused with the dashboard.
- New routes must be **kebab-case, lowercase**, and listed in this document
  before implementation.

## i18n message bundles (conceptual mapping)

Interface strings live in **per-domain bundles** under `app/lib/i18n/`
(PR #80; see [`docs/REFACTOR_I18N.md`](REFACTOR_I18N.md)). The mapping from
concept to bundle is conceptual, not one-bundle-per-route: surfaces that
share copy share a bundle. There is deliberately **no** monolithic `info`
or `legal` bundle — legal content is a separate typed layer
(`app/lib/legal/`), and the informational pages each own their bundle.

| Concept | Surface / route | Bundle |
|---------|-----------------|--------|
| Chrome (skip link, locale toggle, SEO metadata) | every route | `common.ts` |
| Global footer | every route | `footer.ts` |
| Record-status vocabulary | map, directory, record detail | `status.ts` |
| Map | `/mappa` | `map.ts` |
| Directory | `/directory` | `directory.ts` |
| Report | `/segnala` | `report.ts` |
| Correction | `/correggi` | `correction.ts` |
| Home (hub) | `/` hero + orienting content | `home.ts` |
| Record detail | `/records/[id]` | `record.ts` |
| Verification widget | `/records/[id]` (aggregate count + personal toggle) | `community.ts` (shared vocabulary: levels, verifications) |
| Auth | `/login`, `/register`, `/account` | `auth.ts` |
| Contribution editing | `/records/[id]/edit` | `record.ts` (form) + `community.ts` (moderation notice, statuses) |
| Community (levels, verifications) | `/account`, `/records/[id]`, `/records/[id]/edit`, `/guide` | `community.ts` (new per-domain bundle, EN pilot + IT) |
| Moderation (private dashboard) | `/moderation` | `moderation.ts` |
| Info — guide | `/guide` | `guide.ts` |
| Info — manifesto | `/manifesto` | `manifesto.ts` |
| Info — FAQ | `/faq` | `faq.ts` |
| Info — contacts | `/contatti` | `contact.ts` |
| Info — rules | `/regole` | `rules.ts` |
| Info — how moderation works | `/moderazione` | `moderazione.ts` |
| Legal (privacy, terms, licences) | `/privacy`, `/termini`, `/licenze` | `app/lib/legal/` (typed layer, not i18n bundles) |

## Site map

| Route          | Page                  | Purpose                                             | In home nav | In footer | Status |
|----------------|-----------------------|-----------------------------------------------------|:---:|:---:|--------|
| `/`            | Home (hub)            | Hero + orienting content; static map teaser (`MapTeaser`) + four tool cards (`ToolCards`) | ✓ (brand) | ✓ (brand) | implemented (F2, t_52dcb95e / PR #162) |
| `/mappa`       | Map                   | Interactive map (Leaflet), record panel, filters, export, text fallback | ✓ (F3) | ✓ (F3) | implemented (F1, t_03c0fa15 / PR #158) |
| `/directory`   | Directory             | Searchable text directory with filters, sort, count, pagination | ✓ (F3) | ✓ (F3) | implemented (F1, t_03c0fa15 / PR #158) |
| `/segnala`     | Report a camera       | Guided private submission form (`noindex`)          | ✓ (F3, CTA) | ✓ (F3) | implemented (F1, t_03c0fa15 / PR #158) |
| `/correggi`    | Correct / remove      | Correction/removal request form (`noindex`, `?record=ID` prefill) | — | ✓ (F3) | implemented (F1, t_03c0fa15 / PR #158) |
| `/guide`       | Guide                 | How to use the site (map, directory, exports)       | ✓ | ✓ | implemented (pre-existing) |
| `/manifesto`   | Manifesto             | Mission, principles, non-goals, what we publish     | ✓ | ✓ | implemented (PR #65) |
| `/regole`      | Rules                 | Participation and content rules for contributors    | ✓ | ✓ | implemented (PR #67) |
| `/moderazione` | How moderation works  | Review flow, appeals, safeguards, SLAs              | — | ✓ | implemented (PR #73) |
| `/privacy`     | Privacy               | Public privacy notice                               | — | ✓ | implemented (PR #70) |
| `/termini`     | Terms of use          | Public terms of use                                 | — | ✓ | implemented (PR #70) |
| `/licenze`     | Licences              | Data and software licences, OSM attribution         | — | ✓ | implemented (PR #70) |
| `/accessibility` | Accessibility statement | WCAG 2.2 AA commitment, compliance status, barrier reporting | — | ✓ | implemented (F-legal t_2bef9ebb) |
| `/faq`         | FAQ                   | Frequent questions                                  | — | ✓ | implemented (PR #68) |
| `/contatti`    | Contacts              | Who we are, owners, correction/removal contact      | — | ✓ | implemented (PR #68) |

"Home nav" means the page is linked from the home page's `nav-shell`. The
home keeps the full link set (Map, Directory, Guide, Rules, Manifesto, CTA
Report) at the **route URLs** (`/mappa`, `/directory`, `/segnala` — F3,
t_2ca69725). The four tool pages link each other through the shared
`ToolLayout` nav (Map, Directory, Report, Correction, Guide, Home), so there
are never dead ends between the tools. Informational pages render their own
compact `nav-shell` with a context-appropriate subset of links; see "Page
navigation" below.

Routes **not** linked in nav/footer (private or functional): `/moderation`
(moderator dashboard), `/account` (profile: level badge + paginated
contributions, C5), `/records/[id]/edit` (owner edit page, C6 — linked
contextually from `/records/[id]` and `/account`, never from public nav),
`/login`, `/register`, `/records/[id]` (linked contextually from
map/directory), `/api/*`, and the future `/feedback` (ADR 0006, still
proposed).

## Page-by-page specification

### `/` — Home (implemented, F2 hub)

- **Purpose:** the orienting entry point. Short hero + links to the four
  tool pages; the full tool surfaces live on their own routes since F1.
- **Content:** hero, static map teaser (`MapTeaser`, a static preview with
  no Leaflet instance), four tool cards (`ToolCards`: `/mappa`,
  `/directory`, `/segnala`, `/correggi`), and a short principles section
  (kept short; the full manifesto lives at `/manifesto`). The old anchor
  sections (`#map`, `#records`, `#report`) no longer exist on the page; F2
  (t_52dcb95e / PR #162) replaced them with the hub cards.
- **Nav/footer:** brand in the page `nav-shell` and in the footer; the home
  links the tools at their route URLs (`HomeNav`, F3).

### `/mappa` — Map (implemented, F1 t_03c0fa15)

- **Purpose:** the interactive map tool. Full-viewport Leaflet map, record
  panel, filters (type + freshness, applied client-side until the
  server-side filter gate, `docs/FRONTEND_PLAN.md` §3.3), exports, textual
  fallback.
- **Content:** `app/(tools)/mappa/page.tsx` (thin server shell) +
  `MappaTool` (`app/components/tools/MappaTool.tsx`, `"use client"`),
  wrapped in a `Suspense` boundary (Next 16 `useSearchParams` requirement).
  Bundle: `map.ts`.
- **Layout:** route group `app/(tools)/layout.tsx` → `ToolLayout`
  (`app/components/ToolLayout.tsx`): shared nav (Map, Directory, Report,
  Correction, Guide, Home) + `main#main-content`.
- **Nav/footer:** in tool nav (`ToolLayout`); also linked from the home nav
  and the global footer (F3, t_2ca69725).

### `/directory` — Directory (implemented, F1 t_03c0fa15)

- **Purpose:** the searchable text directory, the keyboard/AT-equivalent of
  the map. Search, low-risk filters (type, freshness), sort, result count,
  truthful empty state, server-side pagination.
- **Content:** `app/(tools)/directory/page.tsx` + `DirectoryTool`
  (`app/components/tools/DirectoryTool.tsx`, `"use client"`), reusing
  `FiltersBar`, `EmptyState`, `RecordCard`. Bundle: `directory.ts`.
- **SEO:** the only tool page with real SEO value (`docs/FRONTEND_PLAN.md`
  §1.3) — indexable, own metadata.
- **Nav/footer:** in tool nav (`ToolLayout`); also linked from the home nav
  and the global footer (F3, t_2ca69725).

### `/segnala` — Report a camera (implemented, F1 t_03c0fa15)

- **Purpose:** guided private submission of a possible record. Eligibility
  check, minimum fields, coordinates, photo with redaction note, consent,
  non-public reference ID.
- **Content:** `app/(tools)/segnala/page.tsx` + `SegnalaTool`
  (`app/components/tools/SegnalaTool.tsx`, `"use client"`), reusing
  `ReportForm` + `useReportFlow`. Bundle: `report.ts`.
- **SEO/privacy:** `robots: noindex, nofollow` (form page; submissions are
  private until moderated).
- **Nav/footer:** in tool nav (`ToolLayout`); linked from the home nav as
  the CTA (`HomeNav`, F3) and from the global footer (`SiteFooter`, F3).

### `/correggi` — Correct / remove (implemented, F1 t_03c0fa15)

- **Purpose:** correction/removal request: select a record, choose an issue
  type (inaccurate / outdated / privacy / duplicate / other), minimal
  supporting context, reference ID. `?record=ID` pre-fills the related
  record.
- **Content:** `app/(tools)/correggi/page.tsx` + `CorreggiTool`
  (`app/components/tools/CorreggiTool.tsx`, `"use client"`), wrapped in a
  `Suspense` boundary (`useSearchParams`), reusing `CorrectionForm`. Bundle:
  `correction.ts`.
- **SEO/privacy:** `robots: noindex, nofollow` (form page; corrections are
  private requests).
- **Nav/footer:** in tool nav (`ToolLayout`); linked from the global footer
  (`SiteFooter`, F3); not in the home nav (corrections are reachable from
  the footer, the tool nav and contextually from records).

### `/records/[id]` — Record detail (implemented, verification widget live)

- **Purpose:** the public record page — location, kind, status, notes,
  freshness, and the verification widget.
- **Content:** existing record-detail page with the **verification widget
  (C5, PR #181, ADR 0018):** "confirm this record exists" with the
  personal toggle (`aria-pressed`, `aria-live=polite`, target ≥ 44px,
  `prefers-reduced-motion`) and the **aggregate `confirmationCount`**
  (`VerificationWidget` / `StarConfirmButton`). Public DOM shows aggregate
  counts only — never per-profile attribution (ADR 0018 decision 2).
  Bundles: `record.ts` + `community.ts`.
- **Privacy:** page stays indexable; the count is public aggregate data
  (`s-maxage=300, stale-while-revalidate=600`), the personal toggle state is
  `no-store` and only meaningful for a logged-in contributor.
- **Nav/footer:** linked contextually from map/directory (unchanged).

### `/account` — My profile and contributions (implemented, community C5)

- **Purpose:** private profile page of the signed-in contributor: trust-level
  badge and the paginated list of their contributions (cameras, corrections,
  photos) with **local** state filters (no URL state — private page, not
  shareable), badge level and a textual progress line ("X verified
  contributions to the next level", no bar).
- **Content:** `/account` profile (ADR 0018 decision 1/3/4) with the
  **contributions section** (C5, PR #181): paginated list from
  `GET /api/auth/me/contributions` (canonical `page`/`pageSize` contract,
  `role="status"` counter), "Modifica" links to `/records/[id]/edit` for the
  owner only (C6), truthful empty state. There is **no separate
  `/account/contributions` route** — the list is a section of `/account`.
  Bundles: `auth.ts` (profile chrome) + `community.ts` (levels/verifications
  vocabulary).
- **SEO/privacy:** `robots: noindex` (private account surface).
- **Nav/footer:** never linked from public navigation (account surface).
- **Auth:** auth-gated (contributor session, ADR 0013); anonymous → 401.

### `/records/[id]/edit` — Edit contribution (implemented, community C6)

- **Purpose:** private, dedicated edit page for the record **owner** —
  replaces inline editing for contribution fields (design #815 C7).
- **Content:** form pattern `ReportForm` with editable whitelist (title,
  kind, address, notes, manufacturer, observedOn, description — ADR 0018
  decision 4), the notice "changes enter moderation" for published states,
  and the edit-request status when one is pending. Bundle: `record.ts`
  (form) + `community.ts` (moderation notice, statuses).
- **SEO/privacy:** auth-gated (contributor session); owner-only; never
  linked from public navigation; `robots.txt` disallows `/records/*/edit`
  (private surface).
- **Behaviour:** `pending` → direct PATCH (owner-check); `verified` /
  `needs_review` / `stale` → edit-request re-moderated (entity
  `camera_edit`, 202 + `editRequest`); `removed` / `rejected` → 409 blocked.
  Owner pre-fill comes from the owner-only `GET /api/cameras/[id]/edit`
  (200 `{ record, editRequest }`, no-store), never from the public GET.

### `/guide` — Guide (implemented, pre-existing; community sections C-docs)

- **Purpose:** how to use the site: map, directory, filters, exports, record
  lifecycle and statuses; since C-docs also the community layer: accounts,
  editing your own contribution (re-moderation), verifications and trust
  levels.
- **Content:** `app/guide/page.tsx`, rendered with the shared
  `nav-shell` + `record-detail` layout; the global footer comes from the
  root layout (not repeated in the page). Since F1 the map and directory are
  separate routes: the guide's copy (bundle `guide.ts`) describes them as
  **pages** (`/mappa`, `/directory`), not home sections; the physical nav
  links/CTAs point at the route URLs since F3 (t_2ca69725), and the legacy
  anchors (`/#map`, `/#records`) redirect via `LegacyAnchorRedirect`.
  The community sections reuse the frozen `community.ts` vocabulary (trust
  levels, verifications) — the guide bundle remains the **only** user guide
  (no duplicate `docs/USER_GUIDE.md` is maintained).
- **Nav/footer:** in home nav and footer.

### `/manifesto` — Manifesto (implemented, PR #65)

- **Purpose:** mission, principles, non-goals, and what the project does and
  does not publish.
- **Content:** from the home "principles" section and `README.md` (mission,
  principles, non-goals: no video feeds, no tracking tools, no advice on
  avoiding lawful surveillance; private-home cameras excluded). Bundle:
  `manifesto` (`app/lib/i18n/manifesto.ts`).
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

### `/accessibility` — Accessibility statement (implemented, F-legal t_2bef9ebb)

- **Purpose:** the public accessibility statement: commitment (WCAG 2.2 AA),
  compliance status, what is already implemented, known limitations, and how
  to report a barrier (D.Lgs. 106/2018 good practice).
- **Content:** `legalMessages[locale].accessibility` from `app/lib/legal/en.ts`
  / `it.ts` (structured sections rendered by `LegalPage`), adapted from
  `docs/ACCESSIBILITY_STATEMENT.md` — the repository copy stays canonical.
- **Nav/footer:** footer only.

### `/faq` — FAQ (implemented, PR #68; community Q&A C-docs)

- **Purpose:** frequent questions: how to report, map accuracy, how to
  correct an error, privacy; since C-docs also accounts, verifications,
  editing a contribution, contributor levels and account-erasure effects on
  community data.
- **Content:** curated Q&A from README/guide/moderation docs. Bundle: `faq`.
- **Nav/footer:** footer only.

### `/contatti` — Contacts (implemented, PR #68)

- **Purpose:** who we are, project owners, correction/removal contact,
  security disclosure route.
- **Content:** from `GOVERNANCE.md` (owners and roles), the correction /
  removal contact from `docs/legal/PRIVACY_NOTICE.md`
  (privacy@opensurveillancedb.org), and the security reporting route from
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
| `/`         | Map (`/mappa`), Directory (`/directory`), Guide, Rules, Manifesto, CTA Report (`/segnala`) — `HomeNav`, route URLs since F3 |
| `/mappa`, `/directory`, `/segnala`, `/correggi` | shared `ToolLayout`: Map, Directory, Report, Correction, Guide, Home (CTA) — no dead ends between the four tools (F1; per-page refinement in F3, t_2ca69725) |
| `/guide`    | Map, Directory, FAQ, Contacts, Manifesto, Home                 |
| `/manifesto`, `/regole` | Map, Directory, Guide, Home (CTA)              |
| `/moderazione` | Map, Directory, Home (CTA)                                  |
| `/faq`      | Map, Directory, Contacts, Home (CTA)                          |
| `/contatti` | Map, Directory, FAQ, Home (CTA)                               |
| `/privacy`, `/termini`, `/licenze`, `/accessibility` | Map, Directory, Guide (via `LegalPage`)  |

- Mobile: the `menu-button` collapse is implemented on the home page; the
  informational pages currently render the `nav-links` inline (they wrap at
  ≤700px per the shared CSS) — keep this behaviour consistent when adding
  pages.
- Labels come from each page's bundle (`bundle.<page>.navigation` etc.), not
  from a shared nav bundle.
- Legacy anchor links (`/#map`, `/#records`, `/#report`, `/#correction`)
  still work from any route: `LegacyAnchorRedirect` (F3, t_2ca69725)
  client-side redirects them to the matching tool route, preserving the
  query string and using `router.replace` so the back button returns to the
  referring page. In-page anchors that still exist on the home (`#top`,
  `#how-it-works`) are left untouched.

### Footer (shared, global)

`SiteFooter` (`app/components/SiteFooter.tsx`) is rendered **once in the
root layout** (`app/layout.tsx`), so every page — public, guide, record,
moderation and auth — shares the same institutional navigation. It is a
`footer` landmark (`contentinfo`) containing a labelled `nav` with the
institutional links and the legal bar:

| Section    | Content                                                       |
|------------|---------------------------------------------------------------|
| Brand      | OpenSurveillanceDB + tagline                                  |
| Nav        | Map (`/mappa`), Directory (`/directory`), Report (`/segnala`), Correction (`/correggi`), Manifesto, Rules, Guide, Privacy, Terms of use, Licences, Accessibility, FAQ, Contact |
| Legal bar  | Data licence **ODbL 1.0** notice + **© OpenStreetMap contributors** attribution |

- Footer labels are bilingual (EN/IT) via the shared `footer` bundle
  (`bundle.footer`).
- The moderation queue (`/moderation`) is deliberately **not** linked in the
  footer (publication-boundaries suite).
- The four public tool routes are linked in the footer since F3
  (t_2ca69725 / PR #161), per `docs/FRONTEND_PLAN.md` §1.3; the form
  surfaces (`/segnala`, `/correggi`) keep their `noindex` metadata but are
  discoverable from the footer like any other page.
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
3. **Bilingual:** add one per-domain file in `app/lib/i18n/` (e.g.
   `home.ts`) exporting the page's `en` pilot object and its `it`
   counterpart; parity is enforced by the `Translation<typeof en>` type
   inside each domain file. Pages read their bundle server-side via
   `getServerMessages()` (`app/lib/server-i18n.ts`) — never import the
   client hook `useMessages()` in a page. Legal pages use the
   `app/lib/legal/` layer with the same en/it parity rule. Add
   `nav`/`footer` keys in the relevant domain (see
   `docs/REFACTOR_I18N.md`).
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
| `common`, `status` | `app/lib/i18n/common.ts`, `status.ts` | shared UI chrome (skip link, record statuses) |
| `home`    | `app/lib/i18n/home.ts` | home page (hero, principles; tool sections removed in F1) |
| `map`     | `app/lib/i18n/map.ts` | `/mappa` interactive map + fallback |
| `directory` | `app/lib/i18n/directory.ts` | `/directory` text directory |
| `report`  | `app/lib/i18n/report.ts` | `/segnala` report form |
| `correction` | `app/lib/i18n/correction.ts` | `/correggi` correction form |
| `guide`   | `app/lib/i18n/guide.ts` | guide page |
| `manifesto` | `app/lib/i18n/manifesto.ts` | manifesto page |
| `moderazione` | `app/lib/i18n/moderazione.ts` | how-moderation-works page |
| `faq`     | `app/lib/i18n/faq.ts` | FAQ page |
| `contact` | `app/lib/i18n/contact.ts` | contacts page |
| `rules`   | `app/lib/i18n/rules.ts` | rules page |
| `record`  | `app/lib/i18n/record.ts` | record detail page (+ edit form, C6) |
| `moderation` | `app/lib/i18n/moderation.ts` | private moderator dashboard |
| `auth`    | `app/lib/i18n/auth.ts` | login/register/account (+ contributions list, C5) |
| `community` | `app/lib/i18n/community.ts` | shared community vocabulary — levels, verifications, edit notices (new, C-i18n; used by `/account`, `/records/[id]`, `/records/[id]/edit`, `/guide`) |
| `footer`  | `app/lib/i18n/footer.ts` | global footer labels |
| `legal`   | `app/lib/legal/en.ts` / `it.ts` | structured legal content (`privacy`, `terms`, `licenses`, `accessibility`) rendered by `LegalPage` |

Notes:

- Each per-domain file pairs the page's `en` pilot object with its `it`
  counterpart, type-checked by `Translation<typeof en>` inside the same
  file; `app/lib/i18n/index.ts` assembles the full `messages` shape (see
  `docs/REFACTOR_I18N.md`).
- The legal layer is **separate** from the main bundle: `app/lib/legal/`
  has its own `en.ts` / `it.ts` / `types.ts` / `index.ts` and its own
  `LegalContent` type (inline markup support).

## Content sources map

| Page          | Primary sources                                          |
|---------------|----------------------------------------------------------|
| `/mappa`      | `docs/FRONTEND_DESIGN.md` (map tool), `docs/OSM_INTEGRATION.md` (tiles/attribution), data layer `app/lib/use-public-cameras.ts` |
| `/directory`  | `docs/FRONTEND_DESIGN.md` (directory tool), `docs/DATA_MODEL.md` (fields shown), `docs/MODERATION.md` (status meanings) |
| `/segnala`    | README "Before submitting", `docs/MODERATION.md` (publication standard), `docs/legal/PRIVACY_NOTICE.md` (consent/privacy copy), `docs/FRONTEND_PLAN.md` §7.2 |
| `/correggi`   | `docs/MODERATION.md` (appeals and corrections), `docs/legal/PRIVACY_NOTICE.md` (correction/removal contact), `docs/FRONTEND_PLAN.md` §7.2 |
| `/manifesto`  | home `principles` section, `README.md` (Principles, non-goals) |
| `/regole`     | `docs/MODERATION.md` (Publication standard, Eligible examples, Exclusions), README "Before submitting" |
| `/moderazione`| `docs/MODERATION.md` (Review flow, Appeals and corrections, Moderator safeguards), ADR 0014 |
| `/privacy`    | `docs/legal/PRIVACY_NOTICE.md`                           |
| `/termini`    | `docs/TERMS_OF_USE.md`                                   |
| `/licenze`    | `docs/OPEN_SOURCE.md`, `LICENSE`                         |
| `/faq`        | README, `docs/MODERATION.md`, `docs/PRIVACY_AND_SAFETY.md` |
| `/contatti`   | `GOVERNANCE.md` (owners/roles), `docs/legal/PRIVACY_NOTICE.md` (correction/removal contact), `SECURITY.md` (security route only) |
| `/records/[id]` (verification widget, C5) | `docs/COMMUNITY_PLAN.md` §4 (verification model), ADR 0018, `docs/MODERATION.md` (status meanings) |
| `/account` (contributions section, C5) | `docs/COMMUNITY_PLAN.md` §2.3 (profile API), ADR 0018, `docs/DATA_MODEL.md` |
| `/records/[id]/edit` (C6) | `docs/COMMUNITY_PLAN.md` §2.2 (two-track editing), ADR 0018, `docs/MODERATION.md` (edit moderation) |

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

- Header nav: pages keep their compact per-page `nav-shell`; if more pages
  are added, revisit the home link set (do not grow it without an explicit
  decision).
- Tool nav: the shared `ToolLayout` nav is uniform across the four tools
  (F1) and the footer tool links are live (F3, t_2ca69725). If the tool
  count grows, revisit whether the uniform nav set still fits.
- `/guide` slug kept for compatibility; a future alias `/guida` is possible.
- `/feedback` route (ADR 0006) remains proposed, not implemented.
- Community frontend (C5/C6) is implemented: `/account` profile with
  contributions section, verification widget on `/records/[id]`, owner edit
  page `/records/[id]/edit`. There is no `/account/contributions` route —
  the contributions list is a section of `/account`.
