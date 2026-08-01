# Public site map

Structure of the public web application (Next.js App Router under `app/`).
Routes have no locale prefix: the language is chosen client-side
(`app/components/LocaleProvider.tsx`, stored in `localStorage`); the server
always renders English first.

## Public routes

| Route | Page | Content source |
| --- | --- | --- |
| `/` | Home — map, accessible directory, report form | `app/page.tsx` |
| `/guide` | How it works | `app/guide/page.tsx` |
| `/records/[id]` | Record detail | `app/records/[id]/page.tsx` |
| `/privacy` | Privacy notice (EN/IT) | `app/privacy/page.tsx` ← `docs/legal/PRIVACY_NOTICE.md` |
| `/termini` | Terms of use (EN/IT) | `app/termini/page.tsx` ← `docs/TERMS_OF_USE.md` |
| `/licenze` | Licences (EN/IT) | `app/licenze/page.tsx` ← `docs/OPEN_SOURCE.md` |

The three legal pages share the same information-page layout
(`app/components/InfoPage.tsx`) and their bilingual content lives in
`app/lib/legal-content.ts` (English canonical, Italian mirror, type-checked
against the same shape).

## Restricted routes (contributors / moderators)

| Route | Page |
| --- | --- |
| `/login`, `/register`, `/account` | Contributor auth (ADR 0013) |
| `/moderation` | Moderation dashboard |

These routes require an authenticated session and are never linked from the
public navigation.

## Navigation

- **Nav (all pages):** brand → home; links to the map (`/#map`), the
  directory (`/#records`) and the guide (`/guide`); locale toggle (EN/IT).
- **Footer (all public pages):** brand, tagline, links to the map, the
  directory, and the three legal pages (`/privacy`, `/termini`, `/licenze`).

## Related

- `docs/SITEMAP.md` — this file: the sitemap of the public site.
- Legal source documents: `docs/legal/PRIVACY_NOTICE.md`, `docs/TERMS_OF_USE.md`,
  `docs/OPEN_SOURCE.md` (pre-launch drafts; the web pages keep the
  "not in force" framing until launch).
