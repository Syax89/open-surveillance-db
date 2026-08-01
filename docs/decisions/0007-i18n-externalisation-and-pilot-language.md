# ADR 0007: i18n externalisation and pilot language

- **Status:** accepted
- **Date:** 2026-07-31
- **Author:** Ada (architecture / database)
- **Updates:** ADR 0001-public-data-boundary (interface strings are presentation-only and never affect API data).

## Context

The prototype UI grew bilingual (English + Italian) by duplicating inline
dictionaries per page (`page.tsx`, `guide/page.tsx`, `records/[id]/page.tsx`,
`ModerationDashboard.tsx`, plus ad-hoc ternaries in `SurveillanceMap.tsx` and
`LocaleProvider.tsx`). Consequences:

- no single place to review or maintain wording; translations drift (e.g.
  status labels differed between home and record detail);
- no guarantee that a language bundle is complete — a missing key rendered
  as `undefined` in the UI;
- adding a third language (the future pilot-area language, see
  `docs/EXECUTION_BOARD.md` Wave A) would mean editing every page.

The roadmap (docs/FUTURE_ROADMAP.md, Horizon 2) calls for externalised
interface strings with English plus the pilot-area language.

## Decision

1. **English is the pilot language.** Each per-domain file under
   `app/lib/i18n/` (e.g. `home.ts`, `auth.ts`, `moderation.ts`) exports an
   `en` object that is the canonical key set and exact English wording for
   its namespace; `index.ts` assembles the top-level `messages` shape from
   the domains. EN defines the key set, the namespaces and the wording for
   every user-facing string.
2. **All other languages are type-checked against English.** Each domain
   file pairs its `en` pilot object with an `it` counterpart declared as
   `Translation<typeof en>` (`app/lib/i18n/types.ts`), a mapped type that
   recurses through nested dictionaries (status maps, reason codes, action
   labels) and preserves function signatures (plural formatters such as
   `awaiting`). A missing or extra key fails `npx tsc --noEmit`, so CI
   enforces parity at compile time — no runtime fallback machinery needed.
3. **Dependency-free.** No i18n runtime library is introduced; the bundles
   are plain serialisable data + simple formatters, keeping the Worker bundle
   small and the diff auditable.
4. **Locale stays client-side.** The choice lives in `localStorage` and is
   applied via `LocaleProvider`/`useMessages()`; English remains the SSR
   default so the server-rendered page, metadata and API responses are
   language-neutral (consistent with ADR 0001: interface strings never affect
   public data).

   > **Superseded by ADR 0015 (2026-08-01) for the server side.** The
   > preference is now mirrored to the `opensurveillancedb-locale` cookie and
   > read server-side by the root layout and the informational pages, so SSR
   > renders the user's language (html lang + localized metadata) with no
   > EN→IT flash. `localStorage` remains for multi-tab sync. Interface
   > strings still never affect public data (ADR 0001 unchanged).
5. **Shared vocabulary is centralised.** Status labels live once in the
   `status` namespace and are reused by home, guide and record detail;
   moderation keeps its own `statusLabels` where the vocabulary differs
   (`hidden`, per-queue wording).
6. **Adding a language** means: for each domain file, add the new
   language's counterpart object typed as `Translation<typeof en>` (the
   compiler lists every key the new language must translate), extend
   `Locale` in `types.ts`, and register the assembled bundle in `index.ts`.

## Consequences

- UI code contains no user-facing string literals outside `app/lib/i18n/`
  (verified by review; API/DB error payloads remain server-side and are not
  localised — they are internal and fail closed).
- CI (tsc --noEmit) is the translation completeness gate.
- Wording reviews happen in one place per domain (EN pilot + IT parity
  side by side); a future pilot-area language (e.g. IT for the pilot
  jurisdiction) already ships as the `it` counterparts across the domain
  files. See `docs/REFACTOR_I18N.md` for the per-domain layout.
- Trade-off: namespaces repeat a few common words (e.g. `exploreMap`) instead
  of sharing a global key set — acceptable for now, keeps each page's bundle
  self-contained and reviewable; revisit only if a third language lands.

## Update (2026-08-01): per-domain bundle files (PR #80, open)

On `main` the bundles are still **monolithic**: `en.ts` (~929 lines) and
`it.ts` (~925 lines) each contain every namespace as a top-level key, exactly
as described in the Decision above. A refactor is in flight on branch
`refactor/i18n-domain-bundles` (PR #80) that splits the monolith into
**per-domain files** — one file per domain, each exporting both languages:

- `app/lib/i18n/common.ts` (shared chrome: skip link, language selection)
- `app/lib/i18n/map.ts`, `status.ts` (map labels, record statuses)
- `app/lib/i18n/home.ts`, `guide.ts`, `manifesto.ts`, `moderazione.ts`,
  `faq.ts`, `contact.ts`, `rules.ts`, `record.ts` (public pages)
- `app/lib/i18n/moderation.ts`, `auth.ts`, `footer.ts` (moderation
  dashboard, auth flows, global footer)

Structural invariants of the refactor:

- Every domain file exports `en` (canonical key set) and `it` typed as
  `Translation<typeof en>` — the parity guarantee of point 2 is unchanged.
- `app/lib/i18n/types.ts` is untouched (`Translation<T>` is unchanged).
- `app/lib/i18n/index.ts` assembles the per-domain files into the public
  `messages` shape; `useMessages()` consumption is unchanged.
- Adding a language (point 6) still means adding `xx.ts` + extending
  `Locale` + registering in `index.ts`; after the refactor the new-language
  files mirror the per-domain layout (`<domain>.xx.ts` pairs).

**To update after PR #80 merges:** the file-structure wording in points 1
(`en.ts` as "the single canonical message bundle") and 6 (adding a language)
of the Decision, and the `en.ts`/`it.ts` wording in Consequences, become
historical; rewrite them to describe the per-domain layout above. Until the
merge, this ADR describes `main` as it is.
