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
