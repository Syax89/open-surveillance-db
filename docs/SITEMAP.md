# Public site map

This document describes the **public-facing routes** of the OpenSurveillanceDB
web application and how they are linked. It is the reference for page
implementation work: every public route, navigation entry and footer link
listed here exists in the app.

Scope: **public pages only**. Authenticated/restricted routes (`/login`,
`/register`, `/account`, `/moderation`) and the `/api/*` endpoints are
documented in their own places ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md),
[`docs/MODERATION.md`](MODERATION.md)).

## Public routes

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Home | Interactive map, searchable record directory, report and correction forms. |
| `/guide` | Project guide | How the project works, the report → moderation → publication cycle, data policy. |
| `/records/[id]` | Record detail | Single public record: facts, source, freshness, review history summary. |
| `/privacy` | Privacy notice | Personal-data processing, negative scope, retention, GDPR rights (bilingual EN/IT). |
| `/termini` | Terms of use | Contract for the Service: permitted use, prohibitions, publication, liability (bilingual EN/IT). |
| `/licenze` | Licences | Software, documentation, database (ODbL 1.0) and OSM licensing (bilingual EN/IT). |

## Navigation

Every page renders the same top navigation shell (`.nav-shell`):

- brand mark + "OpenSurveillanceDB" → `/` (home);
- **Explore map** → `/#map`;
- **Browse records** → `/#records`;
- **How it works** → `/guide`;
- locale toggle (EN / IT, `LocaleProvider`).

## Footer

The footer (`.footer-links`) appears on the home page, the guide and the
legal pages. It contains, in order: **How it works** (`/guide`), the open-data
export links (home only), **Privacy** (`/privacy`), **Terms of use**
(`/termini`), **Licences** (`/licenze`), and **Back to top** (home only).

## Legal pages

The three legal pages share one layout component
(`app/components/LegalPage.tsx`) over structured bilingual content
(`app/lib/legal/`). Content sources (canonical, in the repository):

| Route | Content source |
|-------|----------------|
| `/privacy` | `docs/legal/PRIVACY_NOTICE.md` |
| `/termini` | `docs/TERMS_OF_USE.md` |
| `/licenze` | `docs/OPEN_SOURCE.md` |

Language handling follows ADR 0007: English is the pilot language and the
server-rendered default; Italian is type-checked for parity. The URL is
language-neutral (no `/en/` / `/it/` prefixes): the locale toggle switches
the content in place.

## Implementation notes

- Legal pages are `"use client"` components so they react to the client-side
  locale (same pattern as `app/guide/page.tsx`).
- Content blocks support a minimal inline markup (`**bold**`, `*italic*`,
  `[label](url)`) rendered by `LegalPage` — no markdown runtime.
- Rendered-HTML coverage: `tests/legal-pages.test.mjs` (server-rendered
  smoke test via Miniflare).
