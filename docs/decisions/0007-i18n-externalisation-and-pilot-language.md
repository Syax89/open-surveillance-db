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

1. **English is the pilot language.** `app/lib/i18n/en.ts` is the single
   canonical message bundle: it defines the key set, the namespaces and the
   exact English wording for every user-facing string.
2. **All other languages are type-checked against English.** Each bundle is
   declared as `Translation<typeof en>` (`app/lib/i18n/types.ts`), a mapped
   type that recurses through nested dictionaries (status maps, reason codes,
   action labels) and preserves function signatures (plural formatters such
   as `awaiting`). A missing or extra key fails `npx tsc --noEmit`, so CI
   enforces parity at compile time — no runtime fallback machinery needed.
3. **Dependency-free.** No i18n runtime library is introduced; the bundles
   are plain serialisable data + simple formatters, keeping the Worker bundle
   small and the diff auditable.
4. **Locale stays client-side.** The choice lives in `localStorage` and is
   applied via `LocaleProvider`/`useMessages()`; English remains the SSR
   default so the server-rendered page, metadata and API responses are
   language-neutral (consistent with ADR 0001: interface strings never affect
   public data).
5. **Shared vocabulary is centralised.** Status labels live once in the
   `status` namespace and are reused by home, guide and record detail;
   moderation keeps its own `statusLabels` where the vocabulary differs
   (`hidden`, per-queue wording).
6. **Adding a language** means: add `xx.ts` with `Translation<typeof en>`,
   extend `Locale` in `types.ts`, and register the bundle in `index.ts`.
   The compiler then lists every key the new language must translate.

## Consequences

- UI code contains no user-facing string literals outside `app/lib/i18n/`
  (verified by review; API/DB error payloads remain server-side and are not
  localised — they are internal and fail closed).
- CI (tsc --noEmit) is the translation completeness gate.
- Wording reviews happen in one place per language; a future pilot-area
  language (e.g. IT for the pilot jurisdiction) already ships as `it.ts`.
- Trade-off: namespaces repeat a few common words (e.g. `exploreMap`) instead
  of sharing a global key set — acceptable for now, keeps each page's bundle
  self-contained and reviewable; revisit only if a third language lands.
