# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are tagged `v*` and built from the tag by CI (see
[docs/OPERATIONS.md](docs/OPERATIONS.md)). The current `package.json` version
is `0.1.0`; the first numbered release will use that version. Until then all
changes accumulate under `[Unreleased]`.

## [Unreleased]

### Added

- Initial prototype: OpenStreetMap-based map, searchable public directory and
  record-detail pages, public camera API with GeoJSON export, CSV export
  derived from the same public-record boundary, Cloudflare D1-compatible
  schema and migration, bilingual (EN/IT) interface, in-app guide, and local
  moderation dashboard.
- Submission intake that stores new reports as non-public `pending` records,
  with optional manufacturer and observation-date metadata kept private until
  explicitly published by a moderator.
- Private correction / request-for-review intake; requests never appear in
  public output.
- Local moderation workflow with required decision reason, append-only audit
  history, and a local lifecycle (verified → needs review → reverified or
  removed).
- CI pipeline (GitHub Actions): lint, type-check, tests, production build, and
  a security workflow.
- Runtime API contract tests for cameras, corrections, and moderation, plus
  publication-boundary tests proving non-public states stay out of every
  public representation.
- Locality/address/coordinate public search (`GET /api/cameras/search`):
  raw coordinate pairs are parsed locally, free-text places are resolved
  through a configurable geocoder (Nominatim by default), and every response
  describes the searched area — a zero-result state never claims an area has
  no surveillance. Per-caller rate limit and no edge caching.
- Rate limiting for submission endpoints and fail-closed moderation access
  control (ADR 0003).
- Pre-launch legal deliverables: privacy notice, lawful basis, processor
  register, retention schedule, breach procedure, moderation SLA, and
  supporting ADRs (0004, 0005).
- Operations manual with environment matrix, monitoring, backup, and rollback
  workflows (docs/OPERATIONS.md), and the local test deployment procedure on
  Proxmox LXC 114 (docs/DEPLOYMENT.md).
- Safe category and verification-freshness filters in the public directory:
  `GET /api/cameras` accepts a bounded `kind` and a whitelisted `freshness`
  window (`7d`/`30d`/`90d`) shared by JSON, GeoJSON, and CSV. Verification
  transitions now record ISO timestamps and a one-time migration backfills
  pre-existing prose values from the moderation audit trail, so a freshness
  window can never present stale or illustrative data as freshly verified.
- Fresh-database migration smoke test job in CI: the full migration chain
  must apply cleanly to an empty database before the pipeline passes
  ([#47](https://github.com/Syax89/open-surveillance-db/pull/47)).
- Contributor accounts and sessions: email+password registration, login and
  logout, PBKDF2-SHA256 password hashing, hashed opaque session tokens,
  same-origin and per-session CSRF protection, and an account page listing
  attributed submissions. Anonymous submissions remain possible by design
  ([#57](https://github.com/Syax89/open-surveillance-db/pull/57),
  [ADR 0013](docs/decisions/0013-contributor-accounts-and-sessions.md)).
- Contributor account erasure with de-attribution (GDPR art. 17): deleting an
  account detaches its submissions from the contributor identity
  ([#61](https://github.com/Syax89/open-surveillance-db/pull/61)).
- Community system decision record: ADR 0018 formalises the two identity
  layers (contributors vs users/reviewers), the `camera_confirmations`
  verification model (UNIQUE per record+contributor, toggle PUT/DELETE,
  daily quota as D1 state), derived trust levels (pure `deriveLevel`,
  thresholds 0/1/5/20/50, verified-only, never denormalised, no leaderboard),
  two-track contribution editing (pending = owner PATCH; published =
  re-moderated `camera_edit` edit-request; removed/rejected = 409), the
  six-layer anti-gaming model, and the extended art. 17 erasure
  ([#168](https://github.com/Syax89/open-surveillance-db/pull/168),
  [docs/decisions/0018-community-verifications-trust-levels-editing.md](docs/decisions/0018-community-verifications-trust-levels-editing.md)).
- Site map updated **before** the community code: private routes
  `/account/contributions` (kebab-case, `noindex`) and `/records/[id]/edit`
  (auth-gated, owner-only), the verification widget on `/records/[id]`
  (aggregate public count only), and the new `community.ts` i18n bundle
  mapping (auth/record/community) ([docs/SITEMAP.md](docs/SITEMAP.md)).
- Coarse auth roles (`contributor`/`moderator`/`admin`) enforced on every
  protected route via `requireRole`, with the acting reviewer derived
  server-side from the authenticated user, plus a contributor appeal workflow
  against moderation decisions — file, list, and decide, with escalated
  appeals resolving at the administrator ([#62](https://github.com/Syax89/open-surveillance-db/pull/62),
  [ADR 0014](docs/decisions/0014-auth-roles-appeals.md)).
- Append-only audit log extended to appeals (`appeal_id` link on
  `moderation_events`); internal workflow events (appeals, recusals,
  escalations) stay out of the public revision history
  ([#62](https://github.com/Syax89/open-surveillance-db/pull/62)).
- Compliant map-tile strategy: same-origin tile proxy with identifying
  User-Agent, forwarded Referer, ≥7-day edge caching, switchable provider
  (`TILE_PROVIDER_URL`/`TILE_PROVIDER_KEY`), and a documented
  community-vs-commercial-vs-self-hosted decision matrix
  ([#55](https://github.com/Syax89/open-surveillance-db/pull/55),
  [docs/OSM_INTEGRATION.md](docs/OSM_INTEGRATION.md)).
- Local operations for the LXC 114 test deployment:
  `ops/health-check.sh` (5-route health probe, fail-closed moderation check),
  `ops/backup-lxc114.sh` (vzdump snapshot to NAS, zstd, keep-last 7, D1
  included and integrity-checked), `ops/snapshot-pre-deploy.sh`, and
  `ops/rollback-lxc114.sh` (rollback + explicit restart + health check),
  with the live drill recorded in `docs/OPERATIONS.md`
  ([#58](https://github.com/Syax89/open-surveillance-db/pull/58),
  [#60](https://github.com/Syax89/open-surveillance-db/pull/60)).
- Public information-site restructure: bilingual `/manifesto`, `/regole`,
  `/privacy`, `/termini`, `/licenze`, `/faq`, `/contatti`, and `/moderazione`
  pages wired into a global site footer with institutional links, ODbL and
  OSM attribution, plus a full sitemap and navigation pattern
  ([#65](https://github.com/Syax89/open-surveillance-db/pull/65),
  [#67](https://github.com/Syax89/open-surveillance-db/pull/67),
  [#68](https://github.com/Syax89/open-surveillance-db/pull/68),
  [#70](https://github.com/Syax89/open-surveillance-db/pull/70),
  [#71](https://github.com/Syax89/open-surveillance-db/pull/71),
  [#73](https://github.com/Syax89/open-surveillance-db/pull/73),
  [#66](https://github.com/Syax89/open-surveillance-db/pull/66)).
- Image upload for camera records with secure storage: `/api/photos` intake
  with size/MIME/dimension caps, magic-byte container verification, mandatory
  EXIF/XMP/IPTC stripping (fail-closed), sanitised bytes in R2 with metadata
  only in D1, and a moderation/redaction gate — approved photos are served
  only for public cameras; pending or rejected evidence never leaks
  ([#64](https://github.com/Syax89/open-surveillance-db/pull/64)).
- Legal/privacy boundary review applied at the public boundary: coordinate
  precision enforced at ~4 decimal places, retention schedule, and terms and
  privacy notice aligned with the contributor-account flow
  ([#59](https://github.com/Syax89/open-surveillance-db/pull/59),
  [ADR 0008](docs/decisions/0008-data-licence-precision-retention-contact.md));
  governance owners and hosting/domain decisions documented
  ([#48](https://github.com/Syax89/open-surveillance-db/pull/48),
  [ADR 0011](docs/decisions/0011-governance-owners-hosting-domain.md),
  [#52](https://github.com/Syax89/open-surveillance-db/pull/52)).
- Community i18n bundle (`app/lib/i18n/community.ts`): frozen vocabulary for
  trust levels, verifications (never "stars"), contributor profile,
  contribution editing, abuse reporting and destructive confirmations — EN
  pilot + IT type-checked parity, registered in `index.ts` (COMMUNITY_PLAN
  §6, ADR 0007)
  ([#172](https://github.com/Syax89/open-surveillance-db/pull/172)).
- Backend community verifications (C1, ADR 0018): migrazioni D1 0020-0023
  (`camera_confirmations`, `camera_edit_requests`,
  `correction_requests.contributor_id`, index livelli), API conferme
  PUT/DELETE/GET `/api/cameras/[id]/confirmation`, `confirmationCount` nei
  payload pubblici (GROUP BY IN, no N+1), anti-gaming 6 strati (quota D1
  20/40, per-record 5, IP-hash burst, decay su `last_verified_at`), erasure
  estesa art. 17 (ADR 0018, C1).
- Report intake C4 (COMMUNITY_PLAN §2.4): `issue_type` whitelist
  (`inaccurate|missing|removal|abuse|other`), dedupe one-open-report per
  (submitter, target) con indici unici parziali (migrazione 0024, 409 su
  duplicato o target già rimosso), attribuzione opzionale al contributor
  (`contributor_id`, sessione + CSRF quando presente), anonimo sempre
  possibile e rate-limitato per IP (bucket `submit` 5/60s).
- Community profile contributions (C2, ADR 0018): migrazione D1 0025
  (index `(contributor_id, created_at DESC)` su cameras e photos),
  `GET /api/auth/me/contributions` paginato (contratto F0, filtri whitelist,
  `Cache-Control: no-store`, solo dati propri), `deriveLevel` puro
  (L0=0/L1=1/L2=5/L3=20/L4=50, solo `status='verified'` conta) e `level` nel
  meta di `/api/auth/me` e della lista contributi; `me/submissions` deprecato
  (backward-compat).
- Community documentation (C-docs, COMMUNITY_PLAN §6.4): `/guide` extended
  with four community sections (account — why and how, email+password today,
  re-aligned with the final login choice; editing your contribution — owner
  only, re-moderation, not immediately public; verifications — what they
  confirm, one per user, kept fair, never attributed publicly; trust levels —
  thresholds 1/5/20/50, recognition not competition) and `/faq` with five new
  Q&A (account, verifications, editing, contributor levels, verifications on
  account erasure), both EN/IT type-checked via the existing bundle parity;
  `docs/workstreams/PRODUCT_UX.md` gains the "Verify and manage your own
  contributions" journey; `docs/DATA_DICTIONARY.md` documents
  `confirmationCount`, the verification toggle contract, the
  `me/contributions` contract and the derived trust level
  (thresholds + meta, never denormalised, no public attribution);
  `docs/REFACTOR_I18N.md` and `docs/SITEMAP.md` updated (C phase status,
  guide/FAQ specs). No new `docs/USER_GUIDE.md` — `/guide` stays the only
  user guide (SITEMAP rule).
- Pre-submit duplicate confirmation gate (H1, FUTURE_ROADMAP, ADR 0019): the
  duplicate check now runs BEFORE storage, and a `high`-strength match
  (same spot ≤ 25 m, or ≤ 75 m with matching text) refuses the report with
  `409` + `possibleDuplicates` unless the payload carries
  `duplicateConfirmed: true` (strict boolean — `"true"`, `1` and any other
  value fail closed). Medium/low candidates stay informational. The check
  reads only reviewed public records, fails open on outage, and the /segnala
  form surfaces the authoritative candidate list with a mandatory
  confirmation checkbox that disables submit until acknowledged; the hook
  also refuses implicit form submissions (Enter) while the gate is open.
- Moderator H1 (correction request → record outcome, t_69891619): the
  correction rows in the local dashboard now carry the record-outcome
  select (required on approve: verified/kept, corrected, removed, marked
  for review, escalated), the record-id field (required on the new
  "Link to record" action, optional on approve/reject) and the
  `associate` action that links a pending request to a record without
  deciding; `GET /api/moderation/corrections?cameraId=N`
  (moderator-only: worker edge gate + coarse role, `Cache-Control:
  no-store`) serves the private per-record correction history — pending
  and resolved requests with outcome, resolvedAt and the append-only
  decision trail — rendered in a dedicated dashboard section. Contact
  details, internal notes and reviewer attribution never leave the
  gated moderation API: the public record page keeps exposing only the
  filtered public revision projection (AC-5)
  ([#187](https://github.com/Syax89/open-surveillance-db/pull/187)).
- /mappa redesign (user request, t_702c10af): the interactive map now fills
  nearly the whole tool viewport with a scrollable left sidebar that lists
  ONLY the points inside the current map view — zoom in narrows the list,
  zoom out widens it (moveend/zoomend, 200 ms debounce; the pure
  bounds→list contract lives in `app/lib/map-viewport.ts` and is unit
  tested). The search input moved to the top of the sidebar (same `?q=`
  state as the FiltersBar, which keeps kind/freshness/sort/reset — one
  search control per page). Clicking a marker opens a Leaflet popup with
  title, kind, status, record id, coordinates, address/description
  (HTML-escaped) and the correction (`/correggi?record=ID`) + detail links;
  selecting a list row pans the map and opens the popup, selecting a marker
  highlights its row (`aria-current`). Below 768 px the sidebar becomes a
  panel above the map. The home hub still renders the static MapTeaser
  (no Leaflet mounted), and GeoJSON/CSV export, offline state, text
  fallback and `/records/[id]` are untouched.

### Changed

- **BREAKING** `POST /api/corrections` (C4, COMMUNITY_PLAN §2.4): `issueType`
  è ora una whitelist (`inaccurate|missing|removal|abuse|other`) — le
  categorie free-text storiche ("Inaccurate location/details", "Privacy
  concern", ...) rispondono 400; `removal`/`abuse` non accettano MAI
  free-text, anche se il messaggio contiene la parola. I client esistenti
  devono usare i valori whitelist.
- Production build audited; TypeScript and lint issues fixed as part of the
  build pipeline (docs/DEPLOYMENT.md added).
- Local deployment documentation aligned with the actual runtime: `vinext dev`
  under `workerd` via a systemd unit, with `vinext start` (plain Node)
  documented as incompatible (`ERR_UNSUPPORTED_ESM_URL_SCHEME` on
  `cloudflare:`).
- Italian interface strings fixed where they said the opposite of the
  English pilot: the logged-out title and the account-deleted body now say
  "logout" instead of "accesso", and the "create an account" link reads
  "Crea un account" instead of "Crealo" (F-i18n, FRONTEND_PLAN §5.1).
- Internal jargon removed from user-facing strings: `RETENTION_SCHEDULE R7`
  (auth), `GOVERNANCE.md`, "Wave A pilot boundary" and `MODERATION_SLA`
  (contacts) replaced with plain-language wording (F-i18n).
- Offline state added to the map, directory and record detail: when the
  connection drops, a status notice explains that the last loaded records
  are still shown and offers a retry (F-i18n).
- Microcopy standardized: uniform API-reachability error pattern
  ("non raggiungibile in questo momento / controlla la connessione /
  riprova"), explicit rate-limit retry window ("Riprova tra un minuto"),
  and moderation decisions confirm with "Decisione salvata" plus a summary
  of entity, action and reason (F-i18n).
- i18n mapping documented: per-domain bundles kept, with a conceptual
  route→bundle table in `docs/SITEMAP.md` and `docs/REFACTOR_I18N.md`
  (no monolithic info/legal bundles; legal stays in `app/lib/legal/`).

### Fixed

- Public API no longer exposes the private `notes` field for `verified`/`demo`
  records (pre-hosting hardening).
- Moderation endpoints are fail-closed: without credentials they return
  `503 Moderation is unavailable.`.
- `POST /api/cameras` and `POST /api/corrections` return `400` for a JSON
  `null` body instead of a `500`.
- `rendered-html` test suite repaired and included in the full CI run.
- `package.json` license field set (pre-hosting hardening).
- Info pages render exactly one footer: per-page `<footer>` blocks removed so
  every page keeps the global site footer only, and the `/regole` "never"
  heading renders its correct title instead of the body string
  ([#76](https://github.com/Syax89/open-surveillance-db/pull/76)).
- Italian interface bundles use "contributor" instead of "contributore"
  (`auth.ts` register title and `moderazione.ts` credentials copy), fixing
  the pre-existing EN/IT terminology drift flagged by the community copy
  review (COMMUNITY_PLAN §6.1)
  ([#172](https://github.com/Syax89/open-surveillance-db/pull/172)).
- WCAG 2.2 AA fixes from the manual H2 a11y pass (t_793479ed): `/mappa`
  reflows below 640px (`.section-note` `white-space:normal`, 1.4.10), the
  sr-only map link shows a visible focus badge when tabbed (2.4.7), and
  `/records/[id]` + `/account` render per-page `<title>` metadata (2.4.2)
  via server shells that wrap the client bodies.
- Deploy workflow dry-run no longer uses the non-existent `--dry-run` flag
  on `wrangler d1 migrations apply` (wrangler 4.x exits 1 with "Unknown
  arguments: dry-run, dryRun"): the dry-run step now uses the read-only
  `wrangler d1 migrations list osdb-production --remote`, so the first
  manual dry-run trigger completes instead of failing.

### Security

- Moderation access control implemented and documented
  ([ADR 0003](docs/decisions/0003-moderation-access-control.md)); rate limits
  added on submission routes.
