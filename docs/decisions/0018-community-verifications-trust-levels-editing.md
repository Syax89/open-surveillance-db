# ADR 0018: Community verifications, trust levels and contribution editing

- **Status:** accepted
- **Date:** 2026-08-01
- **Author:** Simone Rondina (project owner), recording the consolidated community-system
  decisions from the project opinions (data #813, CTO #817, legal #818,
  docs #816, backend #822, QA #821, copy #814, design #815), superseded by
  the community-driven model in [ADR 0021](0021-community-driven-pivot.md)
- **Related ADRs:** 0001 (public data boundary), 0008 (data licence,
  precision, retention), 0009 (reviewer roles and moderation queue),
  0013 (contributor accounts and sessions), 0014 (auth roles and appeals)
- **Related docs:** `docs/roadmap.md` (current state), `docs/SITEMAP.md`
  (routes listed before code), `docs/DATA_MODEL.md`, `docs/MODERATION.md`,
  `docs/legal/PRIVACY_NOTICE.md`, `docs/legal/RETENTION_SCHEDULE.md`,
  `docs/TERMS_OF_USE.md`

## Context

The community system — a personal contributions profile, derived trust
levels, and per-record verifications — was the next feature wave after the
frontend route split. Nine project opinions (data, CTO, backend, QA, legal,
copy, docs, design, auth research) were consolidated into the then-current
community plan (archived outside the repository), which fixed the
architecture, the data model, the legal basis and the acceptance criteria
at the time; the community-driven model adopted later is recorded in
ADR 0021. The CTO opinion (#817) made one
binding prerequisite: **the separation of the two existing identity layers and
the editing/verification model must be recorded in an ADR before any code
touches the schema.** This ADR is that record. It does not decide new
questions; it formalises decisions already taken in the plan so that the
implementation phases (C1–C6) have a stable contract.

Two facts shape everything below:

1. The site has **two deliberately separate identity layers** today (ADR 0013
   vs ADR 0014): `contributors` (self-service email+password accounts with
   real browser sessions and CSRF — the *reporter* identity) and `users` +
   `reviewers` (provisioned moderation identities resolved from edge-set
   headers — the *moderator* identity). They share no foreign key and no
   mapping.
2. A published record is **signed by the moderator** (`verified` /
   `needs_review` / `stale` carry a moderation review, ADR 0001). An owner
   edit that bypassed that review would silently undo a moderator decision,
   so user edits cannot mutate published records directly.

## Decision

### 1. Two identities, one community layer

1. The community system (profile, contributions, levels, verifications,
   contribution editing) builds **exclusively on `contributors`** (ADR 0013)
   and its browser-session + CSRF infrastructure. It never reads or writes
   `users` / `reviewers` (ADR 0014).
2. `users` + `reviewers` stay the **moderation layer only**: queue, appeals,
   review decisions, edit moderation. No foreign key, no mapping, no shared
   table links the two layers; any future login option (ADR 0013 follow-up)
   must produce a `contributors.id`, never a third layer.
3. A moderator is **not** an elevated contributor. On community endpoints a
   moderator who is not the record owner gets the same result as any other
   non-owner (404/403 as specified below); moderators act on user edits only
   through the moderation endpoints.

### 2. Verifications — `camera_confirmations`

1. New table `camera_confirmations`
   (`id, camera_id FK CASCADE, contributor_id FK CASCADE, created_at`,
   **`UNIQUE(camera_id, contributor_id)`**), migration D1 0020, plus an
   index on `(contributor_id, created_at)` for the daily-quota count. The
   UNIQUE constraint is the structural anti-gaming layer: one active
   verification per (record, contributor), enforced at the database level.
2. **Toggle semantics, one confirmation type.** There is no `type` column
   and no `weight` column (QA simplification over the data opinion's
   `record_confirmations`). `removal` / `abuse` are not star types: they go
   exclusively through the correction flow (decision 6 below).
   - `PUT /api/cameras/[id]/confirmation` (empty body) inserts the row →
     `{ confirmed: true, count }`. A second PUT on an existing row is **409**
     (duplicate, structural constraint).
   - `DELETE /api/cameras/[id]/confirmation` removes the row →
     `{ confirmed: false, count }`. DELETE without a row is **404**.
   - `GET /api/cameras/[id]/confirmation` returns the caller's personal
     state `{ confirmed }`; anonymous → `false`.
   - All three are `Cache-Control: no-store` (personal data; the public
     aggregate lives on the record payload).
3. The public payload `GET /api/cameras/[id]` (+ list) carries
   `confirmationCount` — **aggregate only, never attribution** to any
   profile. Counts for a page come from one `GROUP BY … IN (page ids)`
   query (no N+1). Public read cache: `s-maxage=300, stale-while-revalidate=600`.
4. **Daily quota as D1 state, not a rate-limiter.** `MAX_CONFIRMATIONS_PER_DAY`
   (20; 40 for trusted levels) is enforced inside the toggle transaction as a
   `COUNT` on `(contributor_id, created_at)` for the current window — the
   `appealAppellantLimits` pattern, not an in-memory per-isolate limiter.
   Exceeded → **429 + Retry-After**. Per-record cap: max 5 verifications/day
   from distinct accounts on one record; the 6th → 429.
5. **Level gate.** Verifications from a level-0 (new) account are **403
   fail-closed** (UI: disabled button with explanatory copy), not silently
   weight-0. The gate to confirm is **level ≥ 1 = at least one verified
   contribution**, never email verification (no mailer exists, ADR 0013).
   Self-verification (confirming your own record) is **403**.
6. **Decay.** Verifications older than the review window
   (`created_at >= cameras.lastVerifiedAt`) are excluded from counts; a
   re-verified record renews its verifications. Rate-limit buckets: RouteKind
   `confirm` (30/min) and `edit` (5/min), independent, env-tunable.

### 3. Trust levels — derived, never denormalised

1. Level = **pure function** `deriveLevel(count)` in a single file
   (`app/lib/trust-levels.ts`), thresholds in one const:
   0 → L0, 1 → L1, 5 → L2, 20 → L3, 50 → L4.
2. `count` = `COUNT(cameras WHERE contributor_id = ? AND status = 'verified')`
   — **only verified records count**, never pending/rejected/removed.
   Backed by an index-only `(contributor_id, status)` index (migration D1
   0023). At these volumes a single indexed COUNT on a D1 single-writer is
   free; no cache, no `contributors.contributor_level` column.
3. **Never denormalised.** A stored level would need invalidation on every
   status change in 5+ places. `deriveLevel` is recomputed on read; it is
   exposed in `GET /api/auth/me` (`{ level }`) and in the contributions
   list meta.
4. **No leaderboard, no public ranking.** Levels are a private personal
   badge (PRODUCT_UX.md: "Do not use contributor ranking as product goals";
   legal #818). Public UI shows the badge label only
   (New / Trusted / Experienced contributor; internal L0–L4 maps to 3 badge
   labels: L0→New, L1–L2→Trusted, L3–L4→Experienced). The numeric weight is
   never exposed (not gaming-designable).
5. **Anti-farming of levels.** Only approved records count (1); a ratio gate
   (>50% rejected of submitted → level does not rise) (2); bidirectionality:
   removing/rejecting a verified record lowers the count and the level (3);
   no decay by inactivity (4); no-op edits produce no event (5). Level L4
   **community verification path is out of alpha** — flagged for a separate
   ADR and CEO decision.

### 4. Contribution editing — two-track `PATCH /api/cameras/[id]`

| Record status | Behaviour | Response |
|---|---|---|
| `pending` (never public) | **Direct PATCH** with server-side ownership check (`cameras.contributor_id === session.contributor.id`), CSRF + same-origin + rate-limit (bucket `edit`). Non-owner / anonymous / moderator non-owner → **404 fail-closed** (no-existence-oracle pattern). | 200, owner-view including `notes`, `Cache-Control: no-store` |
| `verified` / `needs_review` / `stale` (published history) | PATCH **does not mutate `cameras`**: inserts a row in `camera_edit_requests` (explicit per-column diff against the whitelist) + a `moderation_queue` row (entity `camera_edit`). One open edit-request per camera (partial unique `(camera_id) WHERE status='pending'`, pattern `moderation_queue_open_unique`). Approve applies the diff + `moderation_events` action `edit_applied`; reject → `edit_rejected`. | **202** `{ editRequest: { id, cameraId, status: 'pending', createdAt } }` |
| `removed` / `rejected` (terminal) | Edit blocked, no queue row. | **409** |

1. **Editable whitelist** (same limits as POST): `title` (90), `kind` (60),
   `address` (180), `notes` (1000), `manufacturer` (80), `observedOn` (valid
   date), `description`. **Never editable**: `status`, `contributor_id`,
   `source`, `publish_manufacturer` / `publish_observed_on` (moderator
   decision), `last_verified_at` / `review_due_at` (freshness clock).
   Proposed coordinates pass the ~10 m rounding + sensitivity review.
2. **Moderators non-owner → 403** on the edit API (they act only through the
   moderation endpoints). **No-op edit** (same content) → 200 "no changes",
   no event (anti-farming).
3. The published-record path is a **pending → review gate** (ADR 0001):
   every change to published data goes through a human moderator, the
   controller remains accountable (art. 5(2)); moderation is a safeguard,
   not a transfer of responsibility (legal #818). TERMS_OF_USE §5.3 is
   extended to edits.
4. **Edit page.** Private route `/records/[id]/edit`, auth-gated, only the
   owner and only editable states; form pattern `ReportForm`, notice "changes
   enter moderation". Inline editing stays reserved to the profile
   `displayName` field only.

### 5. Anti-gaming — six layers (consolidated)

1. **Structural UNIQUE** `(camera_id, contributor_id)` at DB level — no
   double verifications; toggle = PUT/DELETE (2nd PUT → 409, DELETE without
   row → 404).
2. **Level gate** — level-0 and self-verification → 403 fail-closed (UI
   disabled); gate = ≥1 verified contribution, never email verification.
3. **Daily per-account quota** — 20/day (40 trusted) as D1 state count inside
   the toggle transaction → 429 + Retry-After; per-record cap 5/day, 6th →
   429.
4. **IP-hash bucket** (`submitterKey` pattern) — N accounts from the
   same IP in a burst trip the bucket + surge alert with `callerHash`
   (never raw IP); NAT/CGNAT → soft-flag, not ban.
5. **Decay** — verifications outside the review window don't count; a
   re-verified record renews them.
6. **Corrections whitelist** (below) — removal/abuse never bypass moderation
   as star types; dedupe (one open report per (user, target) → 409).

### 6. Corrections and erasure

1. **`issue_type` becomes a whitelist** on `POST /api/corrections`:
   `inaccurate | missing | removal | abuse | other` (today free-text —
   breaking change, tested on `corrections-intake-contract.test.mjs`).
   `removal` / `abuse` flow into the existing `moderateCorrection` queue.
   Anonymous reports stay possible (reporter privacy); login optional;
   rate-limited per IP (bucket `submit`); dedupe: one open report per
   (user, target) → 409 or merge. New column
   `correction_requests.contributor_id` (NULL = anonymous, migration D1 0022)
   enables "my corrections" in the profile.
2. **Erasure extended (GDPR art. 17)** — `eraseContributor()` (db/auth.ts)
   is extended in one atomic D1 batch, **before** the schema PR merges (QA
   gate): delete the contributor's verifications, `SET NULL` on
   `camera_edit_requests.contributor_id` and
   `correction_requests.contributor_id`, then delete the contributor row.
   `cameras` are never touched (de-attribution stays the ADR 0013 pattern).
   Verifications *received* by the erased account disappear with it;
   verifications *given* to other records are deleted (they were the
   contributor's own data, art. 17); records keep their status and public
   history. `ON DELETE CASCADE` on `camera_confirmations` is mirrored in the
   app layer because the test harness does not enforce foreign keys.
3. **Legal basis** for levels and verifications: art. 6(1)(f) for all
   (recognition/incentive and community verification), **never consent**
   (core function, imbalance). No new collection: levels are computed from
   already-collected data, no behavioural metrics. Auto-computed level that
   unlocks features is **not** automated decision-making with legal effects
   (art. 22 note in legal #818), but documented, transparent,
   non-discriminatory criteria; if it ever conditions legal rights, an
   art. 22 assessment + 13(2)(f) notice is required. Public profile is
   **opt-in, private by default**; only display name, never real name/email;
   no profile export.

## Consequences

- **Schema** (migrations D1 0020–0023, all hand-written + journal/snapshot):
  `camera_confirmations` (0020), `camera_edit_requests` (0021),
  `correction_requests.contributor_id` (0022), `cameras (contributor_id,
  status)` index (0023). No `confidence_score` column in alpha (v2, out of
  scope).
- **API**: PUT/DELETE/GET `…/confirmation` (no-store), `confirmationCount`
  on public payloads, `GET /api/auth/me/contributions` paginated (canonical
  F0 contract) with `level` in meta, two-track PATCH, corrections whitelist.
- **UI/routes** (listed in `docs/SITEMAP.md` before code): extended
  `/account` (badge, progress line, local state filters, paginated list),
  private `/account/contributions`, private `/records/[id]/edit`,
  verification widget on `/records/[id]` (aggregate count only). New i18n
  bundle `community.ts` (EN pilot + IT, type-checked parity); terminology
  frozen: "trust levels / livelli di fiducia", "verifications / verifiche",
  "confirmation / conferma" — never stars, badges, upvotes, tiers, rank, XP.
- **Legal docs**: PRIVACY_NOTICE v0.8, TERMS_OF_USE v0.4, RETENTION_SCHEDULE
  R14, LAWFUL_BASIS LIA §3.1, MODERATION.md edit section (C-legal phase).
- **Security posture**: community endpoints are browser-session-only (CSRF
  double-submit, same-origin); edge strips `x-osdb-user-email` / platform
  headers on these routes so moderation identity can never be spoofed into
  the community layer (extends ADR 0014 edge gate tests).
- **Trade-offs accepted**: the verified-record edit path is slower for the
  user (goes through human moderation) — required to keep the moderator's
  signature on published data; the daily quota is a D1 COUNT inside the
  write transaction (single-writer, negligible at these volumes) instead of
  a cheaper limiter, because a per-isolate limiter cannot be the source of
  truth; verifications are hard-deleted on toggle-off (no soft-revoke audit
  row) — accepted because a verification is reversible user signal, not a
  moderation decision, and `moderation_events` remains the immutable trail.

## Alternatives

- **`record_confirmations` with `type` + `weight` columns and soft-revoke**
  (data opinion #813): richer signal, but three star types duplicated the
  corrections flow and the weight was gaming-designable; rejected for alpha
  in favour of one confirmation type (QA #821) — removal/abuse stay in
  corrections.
- **Denormalised `contributors.contributor_level`** (with cache): rejected by
  CTO/backend/QA — invalidation on every status change in 5+ places; an
  indexed COUNT is free at these volumes.
- **Direct PATCH also on `needs_review` / `stale`** (maintainer position): rejected
  by the maintainer on the backend/legal position — those states already have published
  history under moderation, so edits must go through the human gate.
- **Public leaderboard / ranking**: rejected (legal #818 + PRODUCT_UX.md) —
  identification risk and a documented product non-goal.
- **Email verification as the confirm gate**: impossible (no mailer, ADR
  0013); replaced by the level ≥ 1 gate.
- **`confidence_score` (weighted) in alpha**: rejected — v2, out of
  alpha; no confidence column in the schema now.
- **Profile as new `/profile` page**: rejected — `/account` is extended
  (design #815), keeping one account surface.

## Update (2026-08-02): email verification now exists (ADR 0020)

The "no mailer exists, ADR 0013" notes above (level gate § 2.2.5 and
alternatives) are superseded in one respect: the **mailer now exists**
(Cloudflare Email Routing, AUTH MULTI-METODO Fase A2) and **email
verification is required for write access** (read-only sessions until
verified — [ADR 0020](0020-multi-method-authentication.md) decision 2).

The **level gate for confirmations is unchanged**: L1 still means "at least
one verified contribution" (community plan § 3.2, archived), never email
verification — the two gates are separate. Write access (submissions, edits,
verifications) is the one gated on email verification.
