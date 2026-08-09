# Roadmap

Consolidated document (2026-08-08): replaces the old sprint plans
(`STATUS.md`, `DEVELOPMENT_PLAN.md`, `EXECUTION_BOARD.md`, `FRONTEND_PLAN.md`,
`NEXT_SPRINT.md`, `FUTURE_ROADMAP.md`), archived outside the repository.
For the current state, this document, the README and the linked technical
documents are authoritative.

## Current state

**Live service**: SSR web app (React/Vinext on Cloudflare Workers), D1
database, worker cache for public reads, automatic deploy to the public
domain on every merge to `main`. The interface is bilingual (EN/IT).

### Features in production

- **Interactive map** (`/mappa`): OSM tiles via same-origin proxy (cache ≥ 7
  days, configurable provider), viewport-first rendering with native grid
  aggregation at national zoom, camera field-of-view cones/circles above zoom
  16, keyboard-accessible popups with community actions.
- **Public directory** (`/directory`): search, safe type/freshness filters,
  A–Z index, CSV/GeoJSON exports, `?page=` pagination — the text equivalent
  of the map.
- **Reports** (`/segnala`): position from an optional one-tap device location,
  map click or manual coordinates; reverse-geocode address prefill receives
  coordinates rounded to ~11 m, plus optional manufacturer/observation-date
  metadata, server-enforced duplicate gate (ADR 0019), immediate publication
  from verified accounts (ADR 0021).
- **Corrections / takedown requests** (`/correggi`): private, human-reviewed
  channel (ADR 0021 §6.2).
- **Community system** (ADR 0021): community actions (useful / confirm / no
  longer there / problem / privacy) with trust-weighted automatic state
  transitions, public unattributed per-record timeline, banner direct-link
  contract for withdrawn records.
- **Accounts**: email+password with verification (PBKDF2-SHA256, opaque
  hashed sessions, CSRF), passkeys (WebAuthn), GitHub/Google OIDC
  (server-gated), GDPR erasure with de-attribution — ADR 0013/0014/0016/0020.
- **Public API**: `/api/cameras` (JSON/GeoJSON/CSV), search, nearby, actions,
  events, tiles and geocode proxies; built-in `/api-docs` page; fail-open
  worker cache (`X-OSDB-Cache`) — `app/lib/public-cache.ts`.
- **Import pipeline**: `scripts/import/` (per-source adapters, fail-closed
  licence gate, cross-source dedup, idempotency, per-batch attribution on
  `/fonti`).
- **i18n**: EN pilot + IT type-checked parity (ADR 0007).
- **Accessibility**: WCAG 2.2 AA target, axe-core on every SSR route in CI,
  Lighthouse gate ≥ 0.95 ([docs/ACCESSIBILITY_STATEMENT.md](ACCESSIBILITY_STATEMENT.md)).

### Public data

The database holds community reports plus imports from official open-data
sources: OpenStreetMap coverage (IT/AT/CH/DE), Milan, Zürich, Kanton Bern,
Hamburg, Paris region (GPSO, PVPP, Agen), Spain (DGT, Madrid, Barcelona), the
Netherlands (Utrecht, Amsterdam), UK (Plymouth, TfL), Ukraine, Luxembourg,
Finland, Norway, Canada (BC, Québec) and the United States (PA, MD, Baltimore,
NY Thruway, Denver, DC, CA, SF, MN, New Orleans, Boulder, Rochester). The full
registry with licences is in
[docs/data-sources/README.md](data-sources/README.md); committed batches and
record counts are shown live on `/fonti`.

## Direction

```text
Data quality and reliable moderation
  → accessible public experience
  → reproducible operations
  → pilot decisions and guarantees
  → limited public alpha
  → multi-city open-data programme
```

The project does not trade review quality, privacy or openness for speed.

## Next steps (priority)

1. **Final domain launch**: cut over from the temporary domain to
   `opensurveillancedb.org` (deployment variable, no code change — see
   `docs/DEPLOYMENT.md`), with the remaining operational hardening.
2. **Multi-country programme**: continue the open-data scan (UK, PT, BE,
   northern Europe), clarify remaining licence cases, and grow the import
   pipeline.
3. **OG image** with the current logo and a "Quick start" curl block in the
   README.

## Historical archives

Superseded plan/sprint/review documents live outside the repository (operator
archive). References in old reports may point to files that are no longer
tracked; the README, this document and the linked technical documents are the
current source of truth.
