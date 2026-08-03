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

- **Auth — mailer Cloudflare (Fase A2, t_4c398006, ADR 0020 decision 2):**
  transactional email infrastructure for account verification and password
  reset, with zero new third parties (Cloudflare Email Service on
  `opensurveillancedb.org`, covered by the existing Cloudflare DPA — PR1).
  New `EMAIL` send binding in `wrangler.jsonc` restricted to
  `noreply@opensurveillancedb.org`; bilingual EN/IT (ADR 0007) HTML + plain
  templates in `app/lib/email-templates.ts` with a **zero-tracking
  contract** (no pixels/remote assets/links beyond the action URL, asserted
  in `tests/mailer.test.mjs`); `db/mailer.ts` send layer with fail-closed
  `VERIFY_BASE_URL` (missing → 503, never a broken link) and a durable
  **3 emails/h per contributor** re-send limit enforced in D1 via the new
  `email_send_log` table (migration 0029 — stores only contributor_id,
  kind and sent_at: no content, no recipient address, no IP). The routes
  that consume the mailer land in Fase B; this PR ships the mailer itself
  plus schema, harness, docs (DEPLOYMENT.md) and 16 tests.

- **Docs/GDPR — AUTH MULTI-METODO Fase F (t_c9fc674b, ADR 0020):** new
  [ADR 0020](docs/decisions/0020-multi-method-authentication.md)
  (multi-method authentication — email+password with verification, passkeys/
  WebAuthn, OIDC via GitHub/Google as opt-in disclosed method; amends ADR 0013)
  plus the aligned documentation: AUTH_OPTIONS.md gains §10 mapping the adopted
  decision to the research options; COMMUNITY_PLAN.md §1.3/§1.5 amended (OIDC
  no longer blanket-excluded, passkeys promoted to Fase C, mailer gap closed);
  PRIVACY_AND_SAFETY.md contributor-account section updated (verification,
  passkey vendor note, OIDC tracking disclosure, erasure extended);
  PRIVACY_NOTICE.md v0.10 with new §3.1 "How you authenticate" and §3/§4/§5/§6/
  §7/§10 updates; TERMS_OF_USE.md v0.6 with §3.7 authentication-methods
  clauses and §15 open item; PROCESSOR_REGISTER.md PR1 extended to Cloudflare
  Email Routing (zero new processors) plus conditional PR5/PR6 (GitHub/Google
  OIDC — dormant until the DPA + EU–US DPF activation gate);
  RETENTION_SCHEDULE.md new rule R15 (verification tokens 24 h; passkeys/
  recovery codes until erasure); decisions/README.md index updated.
- External OIDC login (Fase D, t_87f24b2d, ADR 0020): opt-in GitHub +
  Google sign-in with PKCE (S256), OIDC discovery for Google, account
  linking `(auth_provider, external_sub)` → contributor, and a manual
  merge flow when the provider's verified email conflicts with an existing
  password account (single-use merge token, lockout-protected password
  proof — no silent takeover). Privacy by design: the provider email is
  compared in memory and NEVER stored (placeholder
  `oidc.<provider>.<sub>@invalid`, RFC 2606; only sub + verified flag are
  kept). Migration 0030 (`oidc_states`, `oidc_merge_requests`), routes
  GET /api/auth/oidc/[provider]/start, GET .../callback,
  POST /api/auth/oidc/merge, `ops/oidc-secrets.sh` (client ID/secret in
  the GPG vault), and runtime tests (route-level
  `tests/oidc-flow.test.mjs`, DB boundary `tests/oidc-d1.test.mjs`).

- Header auth entry point (`app/components/AuthNavLinks.tsx`, t_65b778c5,
  CEO request 2026-08-02; mobile placement t_94b3726d): the shared public
  header now carries login/register/account links as the last item of the
  `.nav-links` container, right after the six public nav links. On desktop
  (≥768px) they stay visible in the header, pushed to the right end next
  to the EN/IT LocaleToggle; on mobile (<768px) they travel INSIDE the
  hamburger dropdown (separated by a hairline), so the top bar (brand +
  menu button + LocaleToggle) never wraps at 320/390px. Anonymous visitors
  get "Log in" (/login) and "Create account" (/register); signed-in
  contributors get the account link (/account) with their display name.
  Session state is read client-side from the existing GET /api/auth/me
  endpoint (server half: app/lib/auth-session.ts) and the initial/failed
  states render nothing — the SSR HTML stays session-free and errors never
  claim "anonymous" or "signed in" (privacy by design, fail-closed).
  Labels come from the existing auth bundle (EN login:21/register:22, IT
  login:90/register:91); aria-current marks the current auth route (WCAG
  2.2 AA). The six shared public nav links and all other header variants
  (record/moderation/account) keep the exact baseline markup.

- Custom 404 page (`app/not-found.tsx`, t_7eed4601): non-existent routes and
  `notFound()` calls (including the malformed-record guard on
  `/records/[id]`) render a design-system error page with bilingual EN/IT
  copy from the persisted locale cookie, a link back to the homepage and
  the working site header/footer/locale toggle — no dead end, no path or
  error echoed (privacy by design). The root error boundary
  (`app/error.tsx`) reuses the same shell for unhandled server errors (500)
  with a "Try again" reset action.

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

- Header mobile menu boundary moved from 700px to 768px and the auth entry
  point moved INSIDE the menu (t_94b3726d, CEO live feedback 2026-08-02):
  `AuthNavLinks` is now the last item of `.nav-links` instead of a separate
  top-right `trailing` slot (the slot was removed from `SiteHeader`). Below
  768px the six links + auth collapse into the hamburger dropdown (scoped
  with `:has(.menu-button)` so the login/register/account/error shells keep
  their inline "back home" row); at ≤480px the header compacts (brand 13px,
  mark 24px, 12px margins, 6px gaps) so brand + menu button + LocaleToggle
  fit one line at 320px. The 701-767px range, where the full row previously
  overflowed, now uses the mobile menu too. On desktop the inline row wraps
  (flex-wrap) instead of overflowing the document in the 768-980px tablet
  range — the "inline, wrap" behaviour §9.1 of the design doc already
  promised. Tests:
  tests/header-mobile-menu-contract.test.mjs (new CSS viewport contract),
  tests/client-auth-nav-links.test.mjs (in-menu placement + aria-current).
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

- Audit finding MEDIUM #2 (t_6b61fc3f, Ada): `PATCH /api/moderation` accepted
  a client-supplied `actorId` for admin-role callers ("stepping in for the
  demo actor selector"), letting an admin write moderation events as ANOTHER
  reviewer and corrupt the append-only audit trail in production. The acting
  reviewer is now ALWAYS derived server-side via `getReviewerByUserId` — an
  admin acts as their own reviewer like any moderator. The demo actor
  selector survives only behind the development flag `ENVIRONMENT =
  "development"` (set locally via `.dev.vars`, gitignored; unset = production,
  fail-closed; documented in worker-configuration.d.ts and ADR 0014 §3).
  Client actorId values outside that dev-only path are ignored, never
  honoured. Tests: new actor-identity suite in `tests/api-moderation.test.mjs`
  (admin in production ignores the spoofed id; admin in development keeps the
  demo selector; moderator in development still server-derived; no-reviewer
  profile 403) and `tests/auth-flow-e2e.test.mjs` rewritten — a spoofed
  actorId with admin identity now fails the role matrix and the escalated
  event lands on the server-derived reviewer, never the spoofed id.

- P1-1 reset-password/request binary account-existence oracle (t_11b6a22d,
  Ada security review): the 3/h reset budget branch answered `429 Too many
  reset emails` ONLY for registered addresses, while unknown addresses always
  get `200 { sent: true }` — 4 POSTs against a known address (3 delivered
  mails + 1 429) were enough to confirm the account exists, violating the
  route's own anti-enumeration contract (docstring). The budget-exhausted
  branch now answers the same generic `ok()` 200 `{ sent: true }` WITHOUT
  minting a token or sending mail; the budget still caps real emails at 3/h
  per contributor (only the response is now indistinguishable). Test updated
  in `tests/api-auth.test.mjs` to pin the 200 instead of the old 429.

- `/mappa` CEO feedback 2026-08-02 (t_9e8642a0): (1) il banner "Prototype
  mode" sopra la mappa è stato RIMOSSO — la pagina parte direttamente con la
  card della mappa, la mappa non è più presentata come prototipo (la
  veridicità resta in pageIntro e nelle note in-lista; chiavi i18n
  `map.prototypeMode/prototypeBanner` e CSS `.map-layout .prototype-banner`
  rimossi); (2) il contatore "X public records found" su /mappa era a 2px dal
  bordo sinistro della card — ora ha lo stesso inset di 18px della riga
  filtri (`.map-card .search-count`); (3) il bottone "Reset filters" della
  variante panel finiva da solo su una seconda riga della griglia a 3 colonne
  — ora `.map-card .filters-panel` è una griglia a 4 colonne
  (kind/freshness/sort/reset su UNA riga, bottone allineato a destra
  nell'ultima colonna auto; override responsive ≤980px/≤700px coerenti); (4)
  la riga download GeoJSON/CSV è stata SPOSTATA da /mappa a /directory
  (`.data-actions` da `MapPanel` a `DirectoryTool`, nuove chiavi
  `directory.downloadGeoJson/downloadCsv/readDataPolicy` EN/IT; il tool mappa
  non ha più il footer export). Regressione a11y intercettata dal gate
  Lighthouse (t_9e8642a0): la griglia 4-colonne dichiarata DOPO le media
  query responsive vinceva su mobile (stessa specificità, ultima regola) —
  su ≤980px i filtri restavano su 4 colonne strette (kind-filter ~30px,
  target-size WCAG 2.5.8 FAIL, accessibility 0.93) — ora la regola desktop è
  scoped a `@media (min-width:981px)` così gli override ≤980px/≤700px
  tornano a vincere; contrasto `.map-record-meta` #60737d→#546d78 (4.64:1 su
  `.map-record.selected` #e4efe6, era 4.18 < 4.5:1). Test: asserzioni
  aggiornate e nuove in
  `tests/client-tools.test.mjs` (banner assente su /mappa, download presenti
  solo su /directory), docs `FRONTEND_DESIGN.md` §6.2.6/§6.3.7 aggiornati.

- P1-1 `confirmationCountsFor()` D1 bound-parameter cap (t_b2d59dfc): a
  public camera page with more than 100 records used to build a single
  `IN (?, ...)` over every id, blowing past D1's 100-bound-parameter limit
  and turning `GET /api/cameras` (default limit 500) into a 503. The counts
  query now iterates in chunks of at most 100 ids and merges the GROUP BY
  results into one Map — same pattern as the correction-history events in
  `db/moderation.ts`. The in-memory D1 test harness
  (`tests/helpers/d1-sqlite.mjs`) now enforces the same 100-param cap, so a
  >100-record regression test fails on the unfixed code instead of passing
  on node:sqlite's higher SQLITE_MAX_VARIABLE_NUMBER.
- `verifyPassword` now derives at the iteration count embedded in the stored
  hash instead of the current `PBKDF2_ITERATIONS` constant (t_fe668331, P1-2
  security review): bumping the constant (e.g. 210k → 600k, AUTH_OPTIONS §8)
  no longer invalidates every existing password and locks out all
  contributors — each hash re-derives at its own stored count (ADR 0013),
  with a constant fallback for legacy 3-part hashes that predate the embedded
  count. New bump-safety tests in `tests/auth-d1.test.mjs` cover hashes at
  different iteration counts and the legacy fallback.

- `/mappa` autocomplete UX (t_3c4b188e): typing a place no longer triggers
  the search immediately — the geocode suggestion dropdown (250ms debounce)
  now appears BEFORE the points list re-filters (400ms `?q=` debounce), and
  the keyboard `?q=` commit writes the URL with a PURE
  `window.history.replaceState` instead of `router.replace`, so the deployed
  vinext RSC navigation error ("Cannot read properties of undefined
  (reading 'digest')" — an ASYNC throw that #212's try/catch could not
  catch) can no longer fire: no full reload, no remount, the dropdown stays
  open and stable while typing. A committed-filters mirror keeps /mappa and
  /directory filtering from the URL (deep links and back/forward still
  re-derive state).
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
- `/mappa` marker pane no longer stays empty (0 markers) when the public
  API is unreachable or empty: the marker-population effect now re-runs
  once the lazy leaflet import resolves (`mapReady` flag), instead of
  early-returning at mount and never being re-triggered by a stable
  `cameras` prop (t_eb2e33a3 regression after the #202 redesign).
- Photo uploads no longer leak orphaned R2 objects when the D1 metadata
  INSERT fails (t_00e63031, P1-3): `createPendingPhoto` now deletes the
  just-stored R2 object best-effort before rethrowing, so a failed upload
  cannot leave bytes in the `PHOTOS` bucket with no D1 row (which the
  retention sweep — D1-only — could never collect). The storage key is a
  fresh UUID per attempt, so retries are idempotent: a failed attempt
  leaves no object behind and the retry stores exactly one.
- ADR 0008 demo purge gate (audit CTO #7, R12, t_d7a4b99b): the guarantee
  "demo mai esportati" (ADR 0008 decision 1 / retention schedule R12)
  previously rested on the manual pre-launch purge alone — a forgotten R12
  run would have served `status='demo'` prototype records to the public.
  Every public read surface now excludes demo records unless the
  deployment explicitly sets `ENVIRONMENT=development` (fail-closed; unset
  or any other value behaves as production, same convention as the
  moderation demo actor selector, `worker-configuration.d.ts`). The gate
  lives in the shared `demoRecordsPublic()` helper and is applied by
  `publicCameraPredicate()` (JSON list, CSV/GeoJSON exports, bbox, by-id,
  nearby, facets) and by the two surfaces that duplicate the camera
  predicate inline — `getPublicPhoto` (GET /api/photos/[id]) and
  `setConfirmation` (PUT /api/cameras/[id]/confirmation). New dedicated
  suite `tests/demo-export-gate.test.mjs` (9 tests, real D1) plus
  production/development cases added to the photos, confirmations,
  freshness, state-transition and status-leak-boundary suites.

### Security

- **Rate limiting — Cloudflare Workers Rate Limiting binding (audit #3,
  MEDIUM, t_dff3dadf):** the four critical public route families (auth,
  write/submissions, read, tiles) no longer rely on the per-isolate
  in-memory buckets, which a caller could bypass by spreading a burst across
  worker isolates on a multi-isolate deployment. `app/lib/rate-limit.ts` now
  prefers the `ratelimits` bindings declared in `wrangler.jsonc`
  (`AUTH_LIMITER`, `WRITE_LIMITER`, `READ_LIMITER`, `TILES_LIMITER`,
  namespace_id self-defined per the platform docs) and falls back to the
  in-memory sliding window only when a binding is absent — local dev, the
  test suite, staging without the binding (documented in
  `docs/DEVELOPMENT_SETUP.md` §2.2). Binding thresholds mirror the current
  per-family defaults (pending Ada sign-off); the env knobs remain the
  source of truth for the fallback and the unbound families. New
  `tests/rate-limit-binding.test.mjs` pins the selection logic and the
  429/Retry-After contract on both backends.

- **Per-IP registration cap (P3-4, decisione CEO 2026-08-03, t_0941036b):**
  max 5 tentativi di registrazione / 24h rolling per IP, enforced come
  *stato quota* su D1 (`registrations_ip_log`, migration 0032) accanto al
  bucket `auth` in-memory — che da solo non può reggere una finestra di 24h
  tra isolate. Il 5° tentativo nella finestra risponde **429** con body
  generico anti-enumeration + `Retry-After` (di fatto ≤ 4 account/IP/giorno;
  un account-farm non può nemmeno sondare l'endpoint). L'attempt viene
  riservato e contato in **un unico batch D1** (atomico, niente race), e
  **rollbackato su ogni uscita non-201** (tentativi falliti non consumano
  budget; il contratto no-write dei body malformati resta). Chiave =
  **SHA-256 del caller key** (`cf-connecting-ip`), mai l'IP raw (privacy by
  design, pattern `photos.submitter_key`). Finestra rolling → reset
  automatico dopo 24h senza job di cleanup. Knob env
  `REGISTER_IP_RATE_LIMIT_MAX`/`_WINDOW_SECONDS` (default 5/86400).
  Documentato in `docs/COMMUNITY_PLAN.md` §3.3; suite E2E dedicata
  `tests/registration-ip-cap.test.mjs` (4 ok, 5a/6a 429, reset 24h, per-IP,
  hash-only, rollback, knob).

- Moderation access control implemented and documented
  ([ADR 0003](docs/decisions/0003-moderation-access-control.md)); rate limits
  added on submission routes.
