# REFACTOR_I18N — per-domain message bundles

**Status:** implemented (2026-08-01)
**Scope:** `app/lib/i18n/`
**Supersedes:** single-file-per-language bundles (`en.ts` + `it.ts`)

## Why

Until this refactor, every interface string lived in one of two large
files: `en.ts` (923 lines) and `it.ts` (919 lines). Adding or reviewing a
wording meant scrolling a monolith, and a diff touching one page's copy
produced a noisy, hard-to-review change touching unrelated namespaces.

Goal (kanban task t_37936cf8): split the bundle **by domain** so each file
is small, self-contained and reviewable, while keeping the **exact same
`messages` shape** — zero changes for consumer components.

## Target structure (implemented)

```
app/lib/i18n/
  index.ts        # assembles `messages = { en, it }` from the domain files
  types.ts        # Locale, Translation<T> (unchanged)
  common.ts       # chrome: skip-link, language toggle
  map.ts          # interactive map + fallback wording
  status.ts       # shared record-status vocabulary
  home.ts         # homepage: hero, directory, correction form, report form
  guide.ts        # /guide — how it works
  manifesto.ts    # /manifesto
  moderazione.ts  # /moderazione — public page on how moderation works
  faq.ts          # /faq
  contact.ts      # /contatti
  rules.ts        # /regole — participation and content rules
  record.ts       # /records/[id] — record detail
  moderation.ts   # local moderation dashboard (queue, audit, photos)
  auth.ts         # login / register / account pages
  footer.ts       # global site footer
```

Each domain file exports **both languages for that domain**:

```ts
// home.ts
import type { Translation } from "./types";

export const en = { heroTitle: "…" } as const;   // pilot: canonical keys + wording
export const it: Translation<typeof en> = { heroTitle: "…" }; // parity, type-checked
```

`index.ts` assembles the same top-level shape consumers already use
(`messages[locale].home`, `bundle.guide`, …), so **no consumer component
changes** were needed.

## Completeness guarantee (EN/IT parity)

- Each `it` is `Translation<typeof en>` (mapped type in `types.ts`): a
  missing key, an extra key, or a wrong-shaped nested map fails
  `npx tsc --noEmit` — CI enforces parity at compile time.
- Verified after the split: all 14 domains, 722 message leaves per
  language, identical key sets at every nesting level; 0 missing, 0 extra,
  0 value drift between the old and new files.
- `tests/navigation-pages.test.mjs` re-checks per-domain key parity and
  untranslated-English leftovers at test time.

## Working with a domain file

- **Change a wording:** edit the string in the domain's `en` and `it`
  objects; `tsc` confirms the shape still matches.
- **Add a new string:** add the key to `en` **first** (pilot), then to
  `it`; the compiler tells you which `it` object is missing it.
- **Add a third language (future):** for each domain file add
  `export const xx: Translation<typeof en> = { … }`, extend `Locale` in
  `types.ts`, and register the assembled bundle in `index.ts`.

## Rationale for per-domain (not per-page, not per-language-only)

- Per-domain files keep a wording review local: one page's copy lives in
  one file, EN + IT side by side.
- The domain boundaries mirror the public routes, so a page owner knows
  exactly which file to open.
- Keeping `en`/`it` co-located avoids the old cross-file jump when
  translating and makes a translation PR readable in a single diff.
- The `messages` assembly point stays a single, tiny, auditable file.

## Conceptual mapping (route → bundle)

The bundles mirror the **concepts**, not one file per route: surfaces that
share copy share a bundle. There is deliberately **no** monolithic `info`
or `legal` bundle — legal content is a separate typed layer
(`app/lib/legal/`), and each informational page owns its bundle. See
`docs/SITEMAP.md` (section "i18n message bundles") for the full table; the
short version:

| Concept | Bundle | Notes |
|---------|--------|-------|
| Chrome + footer + status vocabulary | `common.ts`, `footer.ts`, `status.ts` | shared across routes |
| Map | `map.ts` | `/mappa` (F1 route split) |
| Directory | `directory.ts` | `/directory` (F1 route split) |
| Report | `report.ts` | `/segnala` (F1 route split) |
| Correction | `correction.ts` | `/correggi` (F1 route split) |
| Home (hub) | `home.ts` | `/` hero + orienting content (tool sections moved to their own bundles in F1) |
| Record detail | `record.ts` | |
| Auth | `auth.ts` | |
| Moderation dashboard | `moderation.ts` | private, local-only |
| Informational pages | `guide.ts`, `manifesto.ts`, `faq.ts`, `contact.ts`, `rules.ts`, `moderazione.ts` | one per page |
| Legal pages | `app/lib/legal/` | typed content layer, NOT i18n bundles |

## Parity is structural, not semantic

`Translation<typeof en>` guarantees that the Italian bundle has the **same
keys and shape** as the English pilot — it cannot guarantee that the Italian
copy **means the same thing**. Real examples found during the frontend
review (fixed in F-i18n, PR #156):

- `auth.loggedOutTitle`: EN "You are logged out" → IT was "Hai effettuato
  l'accesso" (logged **in**);
- `auth.accountDeletedBody`: same inverted meaning;
- `auth.createOne`: "Create one" → IT "Crealo" (colloquial register; fixed
  to "Crea un account").

**Structural parity is a build gate; semantic parity is a human review
gate.** Every translation change is a reviewed policy change
(`docs/workstreams/PRODUCT_UX.md`, "Internationalisation"), and the
per-domain files are small enough that a native speaker can review a full
EN/IT pair in one diff. The i18n QA suite re-checks key parity and
untranslated-English leftovers at test time.

## Microcopy standards

All interactive surfaces follow the same state and error vocabulary, so a
user sees consistent wording (and screen-reader announcements) across the
map, directory, record detail and moderation dashboard.

### State set: `{loading, empty, not-found, error, offline}`

Each state is **title + body + recovery action** where an action makes
sense. Implemented examples:

| State | Keys | Example |
|-------|------|---------|
| `loading` | `loading` (+ `role="status"`) | `record.loading` |
| `empty` | `emptyTitle` + `emptyBody` + action | `home.emptyTitle/emptyBody/clearSearch` |
| `not-found` | `notFound` + `notFoundDetail` + action | `record.notFound/notFoundDetail/browseDirectory` |
| `error` | `loadError` + `loadErrorDetail` + action | `record.loadError/loadErrorDetail/retryLoad` |
| `offline` | `offlineTitle` + `offlineBody` + `offlineAction` | `map`/`home`/`record` — "You are offline / Sei offline" + "Showing the last loaded records. / Mostriamo gli ultimi record caricati." + "Try again / Riprova" |

The offline state is wired with `navigator.onLine` listeners
(`online`/`offline` events) and rendered as `role="status"`; it is
SSR-safe (never in first paint, because `navigator` is undefined on the
server). The map and directory keep showing the already-loaded records —
the notice explains that nothing refreshes until the connection returns.

### Uniform API error pattern

Reachability failures use one canonical pattern (copy lives in
`record.loadErrorDetail` and is mirrored where the same failure can
happen):

- EN: "The record service is unreachable right now. Check your connection
  and try again."
- IT: "Il servizio dei record non è raggiungibile in questo momento.
  Controlla la connessione e riprova."

Rate limiting gets its own explicit retry window:
- EN: "Too many searches. Please try again in a minute."
- IT: "Troppe ricerche. Riprova tra un minuto."

### Moderation decision confirmation

A saved decision announces **"Decision saved / Decisione salvata"** plus a
summary of what was decided (entity, action, reason), rendered in
`role="status"` so screen readers announce it:
"Camera report #7 Decision saved: Approve. Reason: Verified public
infrastructure." (key `moderation.decisionSaved`).

### aria-live contract for async outcomes

Every async outcome (place search, photo upload, report/correction
submission, moderation decision) is announced:

- `role="status"` (polite) for non-urgent results — search results,
  saved notices, loading notes, offline banners;
- `role="alert"` (assertive) only for urgent/blocking conditions —
  duplicate warnings, failed decisions/errors;
- live regions are placed in the DOM **before** the content they announce
  so a screen reader reaches them in reading order.
