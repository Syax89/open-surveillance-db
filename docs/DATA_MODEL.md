# Data model and API

> Field-by-field public reference: see the
> [data dictionary](DATA_DICTIONARY.md). Export releases: see the
> [export versioning policy](EXPORT_VERSIONING.md). Schema history: Drizzle
> migrations [`drizzle/`](../drizzle) (`0000`–`0025`), one per incremental
> change, with the live schema in [`db/schema.ts`](../db/schema.ts).

## Public camera record

| Field | Public? | Description |
| --- | --- | --- |
| `id` | Yes | Stable record identifier |
| `title` | Yes | Plain-language label; no personal names |
| `kind` | Yes | Camera category, for example fixed dome or traffic monitoring |
| `latitude`, `longitude` | Yes, rounded to ~4 decimal places (~10 m) by default | Location of publicly visible infrastructure |
| `address` | Usually | General location text, not a private address |
| `description` | Yes after review | Brief factual context, without sensitive operational detail |
| `manufacturer` | Only with a field-specific opt-in | Optional maker/brand supplied with a report; stays private unless a moderator explicitly elects to publish this field |
| `observedOn` | Only with a field-specific opt-in | Optional ISO calendar date of the observation; stays private unless a moderator explicitly elects to publish this field |
| `source` | Yes | Provenance type such as survey, official source, or demo |
| `updated` | Yes | Last public verification date (ISO 8601); freshness windows match only ISO values — illustrative demo labels are never window-matched |
| `status` | Yes in controlled form | `verified` or `demo`; `pending` is never public |

## Report metadata and publication choices (implemented)

The fields formerly listed as "planned for moderated storage" exist today in the
[`cameras` table](#cameras) (`db/schema.ts`):

- **Optional report metadata**: `manufacturer` and `observedOn`. Intake
  normalises the manufacturer text and accepts the observation date only in a
  valid calendar-date form. Both fields belong to the private pending report
  first; neither is made public merely because it was submitted or because the
  camera record is approved.
- **Per-field publication choices**: `publishManufacturer` and
  `publishObservedOn` default to `false`. A moderator makes each choice
  independently during a camera decision. The public query and every export
  suppress the underlying value unless its own flag is `true`.
- **Submission attribution**: `contributorId` links the report to the
  authenticated contributor who submitted it (ADR 0013). Anonymous submissions
  remain possible and leave the link `NULL`.
- **Review decision trail**: the append-only [`moderationEvents`](#moderationevents)
  table records reviewer, reason code, decision time, and status change per
  decision.
- **Correction/takedown requests**: the [`correctionRequests`](#correctionrequests)
  table holds requests and their resolution state.
- **Evidence references**: the [`photos`](#photos) table holds photo metadata
  (bytes live in object storage, never in D1).
- **Change history**: public, per-record revision history served by
  `GET /api/cameras/revisions`.

## Status lifecycle

### Camera records

```mermaid
stateDiagram-v2
  [*] --> pending: submitted
  pending --> verified: reviewer approves
  pending --> rejected: reviewer rejects
  pending --> removed: reviewer hides
  verified --> needs_review: correction, mark-stale, or scheduled expiry
  verified --> removed: reviewer hides
  needs_review --> verified: re-verified
  needs_review --> removed: reviewer hides
  needs_review --> stale: review window lapses without reconfirmation
  stale --> verified: re-verified
  stale --> removed: reviewer hides
  rejected --> [*]
  removed --> [*]
```

Only `verified` records are eligible for real public publication. `demo` is
reserved for fictional, clearly labelled prototype content. A record is only
published as *current* while it is inside its freshness window
(`last_verified_at` + `review_interval_months`); the scheduled recheck date is
`review_due_at`, and a window that lapses without reconfirmation moves the
record to `needs_review`.

When a moderator approves a report, approval is not a blanket publication of
every submitted field. Optional `manufacturer` and `observedOn` metadata each
have an independent publication choice, defaulting to private. A moderator
sets `publishManufacturer` and/or `publishObservedOn` only after confirming
the individual value is sufficiently accurate, relevant, and safe under the
applicable data-minimisation policy. A false flag suppresses the raw value from
JSON, CSV, GeoJSON, map, directory, and record-detail output.

### Appeals (ADR 0014)

A contributor who disagrees with a final moderation decision may contest it:

```mermaid
stateDiagram-v2
  [*] --> pending: appeal filed (POST /api/appeals)
  pending --> upheld: independent senior moderator
  pending --> dismissed: independent senior moderator
  pending --> escalated: routed to administrator
  escalated --> upheld: administrator decides
  escalated --> dismissed: administrator decides
  upheld --> [*]
  dismissed --> [*]
```

An *upheld* appeal reverses the decision: the entity returns to the moderation
queue for a fresh decision by a different reviewer (it never publishes
anything by itself). A *dismissed* appeal leaves the original decision
standing. An *escalated* appeal may only be resolved by the administrator.
Every transition writes an append-only `moderation_events` row
(`appeal-filed | appeal-uphold | appeal-dismiss | appeal-escalate`) linked via
`appeal_id`; appeal events are internal workflow and never appear in the
public revision history.

### Photo pipeline (2026-08)

Photos are evidence, never public by default:

```mermaid
stateDiagram-v2
  [*] --> pending: intake (POST /api/photos)
  pending --> approved: moderator approves + confirms redaction
  pending --> rejected: moderator rejects
  approved --> [*]
  rejected --> [*]
```

Intake is fail-closed: size/MIME/dimension limits, magic-byte container
verification, mandatory EXIF/XMP/IPTC stripping, sanitised bytes in object
storage (R2, `PHOTOS`) with metadata only in D1. A photo is served publicly
only when it is `approved`, `redaction_confirmed` is set, and the linked
camera is itself public and current. Pending or rejected evidence never leaks
through the public routes.

## API endpoints

All routes live under `app/api/`. Public reads share rate-limit buckets
(plain read vs. bulk export vs. dedicated per-route buckets); submissions,
auth, and moderation have their own stricter limits. Input limits reject
oversized URLs (`414`) and bodies (`413`), and every state-changing route
enforces same-origin + CSRF when a session is present.

| Method | Route | Auth | Behaviour |
| --- | --- | --- | --- |
| `GET` | `/api/cameras` | public | Public `verified` + `demo` records. Filters: `kind` (exact text), `freshness` (`7d` \| `30d` \| `90d` \| `all`), `format` (`json` default, `csv`, `geojson` with `Content-Disposition` download) |
| `POST` | `/api/cameras` | public (attribution optional) | Normalises optional `manufacturer`, validates optional `observedOn` (`YYYY-MM-DD`), creates a private `pending` report. Rate-limited; with a live session the report is attributed to the contributor and the request must pass same-origin + CSRF. Duplicate gate (ADR 0019): a `high`-strength nearby reviewed record answers `409` with `possibleDuplicates` unless the payload carries `duplicateConfirmed: true`; the check runs before storage and fails open |
| `GET` | `/api/cameras/nearby` | public | Pre-submit duplicate check: `latitude`/`longitude` (required), `radius` 10–500 m (default 75), optional `title`/`address`/`kind` hints used for similarity ranking. Returns public records with `distanceMeters` |
| `GET` | `/api/cameras/search` | public | Locality/address/coordinates search. Raw coordinate pairs use a fixed radius; other text resolves through the Nominatim geocoder to a place + bounding-box radius. Response carries the resolved area and a truthful zero-result state |
| `GET` | `/api/cameras/revisions` | public | Public change history for one public record (`cameraId` required). Serves only currently-public records; internal workflow events (appeals, recusals, escalations) are filtered out |
| `GET` | `/api/cameras/[id]` | public | One public record (same public predicate + ~10 m coordinate rounding as the list); fail-closed `404` for anything not publicly current — a pending, stale, rejected or removed record is indistinguishable from a missing id (no existence leak). Bounded edge cache (`Cache-Control: s-maxage=300`) with a `Cache-Tag` so the moderation write path purges it |
| `PATCH` | `/api/cameras/[id]` | session (contributor) | Community contribution editing (ADR 0018 §4, C3), two-track: `pending` records get a direct owner-only UPDATE (optional `expectedUpdated` optimistic-concurrency precondition, stale value answers `409`); `verified`/`needs_review`/`stale` records never mutate `cameras` — they insert a `camera_edit_requests` diff row + `moderation_queue` row and answer `202 { editRequest }`; `removed`/`rejected` answer `409`. The editable whitelist is validated before any write (non-editable fields answer `400`); same-origin + CSRF + edit rate-limit bucket (5/min) |
| `PUT` | `/api/cameras/[id]/confirmation` | session (contributor) | Verify a public record (ADR 0018 §2): level gate (≥ 1 verified contribution, else `403`), self-verification blocked (`403`), one confirmation per (record, contributor) — a duplicate answers `409`; daily quota and per-record cap answer `429`. Returns `{ confirmed: true, count }` |
| `DELETE` | `/api/cameras/[id]/confirmation` | session (contributor) | Remove the caller's own verification on a record; `404` when none exists. Returns `{ confirmed: false, count }` |
| `GET` | `/api/cameras/[id]/confirmation` | public (session optional) | The caller's own verification state for one record: `{ confirmed: boolean }`; anonymous callers get `false`. Never edge-cached |
| `GET` | `/api/cameras/[id]/edit` | session (owner) | Owner-only read for the edit page (ADR 0018 §4, C6): `200 { record, editRequest }` for the owner at any status (notes included, plus the open edit-request so the page can show "request in progress"); `403` for a non-owner on a published record, `404` fail-closed otherwise (no-existence-oracle rule). `no-store` |
| `POST` | `/api/corrections` | public | Correction/takedown request: `cameraId` (optional), `issueType`, `message`, `contact`. Returns `201 { referenceId }`; requests never alter a public record automatically |
| `POST` | `/api/auth/register` | public | Contributor account (email + password, PBKDF2-SHA256, ADR 0013). Sets `osdb_session` (HttpOnly) + `osdb_csrf` cookies |
| `POST` | `/api/auth/login` | public | Verify credentials and open a session (same cookie pair). Unknown email and wrong password both answer `401` |
| `POST` | `/api/auth/logout` | session | Revoke the current session and clear cookies; idempotent |
| `GET` | `/api/auth/me` | session | Current contributor profile (never the password hash) + the caller's own trust `level` (derived from the verified contribution count, C2); `401` anonymous | 
| `PATCH` | `/api/auth/me` | session | Update the caller's public `displayName` (2–60 chars after trim, or null/empty to clear — same grammar as registration). Only the `displayName` key is accepted; any other key answers `400` with no partial effects. Returns the refreshed public profile, `no-store` |
| `GET` | `/api/auth/me/submissions` | session | The contributor's own attributed reports (id, title, status, created_at); `401` anonymous. **Deprecated (C2)** — superseded by `/api/auth/me/contributions`, kept for backward compatibility | 
| `GET` | `/api/auth/me/contributions` | session | The contributor's own attributed contributions (camera reports, corrections, photo uploads), paginated (F0: `page`/`pageSize` default 25, max 100, `pagination` object) with optional `type`/`status` whitelist filters and the caller's trust `level` in the meta; `Cache-Control: no-store`; `401` anonymous, `400` cross-account/unknown filter, `503` db unavailable | 
| `DELETE` | `/api/auth/account` | session | Account erasure (GDPR art. 17, RETENTION_SCHEDULE R7): de-attributes every attributed report, revokes all sessions, hard-deletes the contributor row; returns the count of de-attributed reports |
| `POST` | `/api/appeals` | contributor+ | File an appeal against a *final* moderation decision (`entity`, `entityId`, `decisionEventId`, `reason` ≤ 1500 chars). One pending appeal per decision (`409`); every step writes an audit event |
| `GET` | `/api/appeals` | moderator+ | List filed appeals (appellant display name, contested decision, status) |
| `PATCH` | `/api/appeals/:id` | moderator+ | Decide a pending appeal: `uphold` \| `dismiss` \| `escalate`. Decider must be a senior moderator who did not make the original decision; escalated appeals resolve only at the administrator |
| `GET` | `/api/moderation` | moderator+ | Pending moderation queue (cameras, corrections, photos), ordered by recency |
| `PATCH` | `/api/moderation` | moderator+ | Decide an entity. Camera actions: `approve`, `reject`, `hide`, `mark-stale`, `reverify`, `escalate`. Correction actions: `approve`, `reject`, `associate`, `escalate`. Photo actions: `approve` (requires `redactionConfirmed: true`), `reject`. Acting reviewer is derived server-side from the authenticated user's linked reviewer profile (ADR 0014) |
| `GET` | `/api/moderation/photos/:id` | moderator+ (edge gate) | Moderator preview of a photo's bytes before deciding; pending/rejected photos are never served by the public route |
| `GET` | `/api/moderation/corrections` | moderator+ (edge gate) | Private correction-request history for one record (`cameraId` required positive integer): every request linked to the record (pending and resolved) with its decision events, contact detail and reviewer attribution. Never served by a public route; `400` missing/invalid id, `404` unknown record |
| `POST` | `/api/photos` | public | Photo intake: raw image body, size/MIME/dimension caps, magic-byte verification, mandatory EXIF/XMP/IPTC strip, bytes → R2, metadata → D1. Returns photo metadata, never the storage key or bytes |
| `GET` | `/api/photos?cameraId=N` | public | Approved, redaction-confirmed photos of a public camera (record-detail gallery); `404` when the camera is not public |
| `GET` | `/api/photos/:id` | public | Serve one approved photo (bytes only when approved + redaction confirmed + linked camera public and current); otherwise fail-closed `404` |
| `GET` | `/api/tiles/:z/:x/:y` | public | Same-origin OSMF-compliant tile proxy: stable User-Agent, Referer forwarded, server-side caching honouring upstream headers, strict zoom/x/y validation. Provider switchable via `TILE_PROVIDER_URL` / `TILE_PROVIDER_KEY` |
| `GET` | `/api/locale` | public | Persist the interface locale and deep-link (ADR 0015): `?lang=it&next=/guide` sets the preference cookie server-side and redirects (`302`) to the same-site `next` path (open-redirect-safe), so a shared link SSR-renders in the forced language with no EN→IT flash |

The POST routes are no longer prototype-only: they carry rate limiting, input
limits, optional authenticated attribution with CSRF protection, and (for
photos) the full intake pipeline described above. The reviewer interface is
the `/api/moderation` queue gated by coarse roles; the worker edge Basic/Bearer
gate remains the transport-level login for the moderation dashboard.

## Tables

Thirteen tables in D1, defined in [`db/schema.ts`](../db/schema.ts) and built up by
migrations [`drizzle/0000`–`0025`](../drizzle). All timestamps are ISO 8601
text. See the [data dictionary](DATA_DICTIONARY.md) for the public projection
of `cameras` and the input contract of the submission routes.

### `cameras`

The public record plus moderation state. Public projection: `id`, `title`,
`kind`, `manufacturer`/`observedOn` (conditional on the publish flags),
`direction` (field-of-view bearing 0-359 for directional cameras, `NULL`
otherwise — migration `0035`, kanban `t_1b08fe12`; a dome camera, canonical
kind `Fixed dome`, always stores `NULL` and renders circular on the map),
`address`, `description`, `latitude`, `longitude`, `source`, `updated`,
`status`, `createdAt`. Private columns: `notes` (intake notes, never public),
`publishManufacturer`, `publishObservedOn`, freshness state
(`lastVerifiedAt`, `reviewDueAt`, `reviewIntervalMonths`), and `contributorId`
→ `contributors.id` (nullable: anonymous reports).

### `correctionRequests`

Correction/takedown requests: `cameraId` (optional link), `issueType`,
`message`, `contact`, `status` (`pending`), `outcome`, `resolvedAt`
(resolution timestamp, set when a moderator reaches a terminal state;
anchors the retention floor — never public), `contributorId` (optional
attribution to the filing contributor, ADR 0018; `NULL` = anonymous),
`createdAt`. Never public; callers only receive the opaque `referenceId`.

### `contributors`

Public credential store (ADR 0013). `email` (lowercase, unique),
`displayName` (optional public handle), `passwordHash`
(`pbkdf2$<iterations>$<saltB64>$<hashB64>`, PBKDF2-SHA256 at 210,000
iterations), timestamps. Anonymous submissions remain possible by design.

### `sessions`

Login sessions (ADR 0013). Only the SHA-256 of the raw token is stored
(`tokenHash`, unique), plus a per-session `csrfToken` echoed through a
non-HttpOnly cookie and verified on state-changing requests. `contributorId`
→ `contributors.id` (cascade delete), `expiresAt`, `revokedAt` (set on
logout).

### `loginAttempts`

Per-email login lockout counters (ADR 0016). Keyed by the SHA-256 of the
normalised email (`emailKey`) so the table stores no PII. `failedCount`
counts failed logins inside the current window (`windowStart`); reaching the
threshold sets `lockedUntil` and every login for that email answers `429`
with `Retry-After` until it passes. `lockoutLevel` counts consecutive
lockouts so the duration backs off exponentially (capped in code). All
queries go through `db/auth.ts`.

### `users`

Coarse role identity (ADR 0014): `email` (unique), `displayName`, `role`
(`contributor` | `moderator` | `admin`), `active`, `mfaEnabled`, timestamps.
Gates every protected route via `requireRole`. The six "Demo" rows are
local-prototype seed (migration `0010`) and are replaced by provisioned
accounts before public alpha. Bridged to `contributors` by email at
provisioning time (see ADR 0014 integration note).

### `reviewers`

Named moderators with the granular DATA_TRUST role: `displayName` (unique),
`role` (e.g. `intake_reviewer`, `record_reviewer`, `senior_moderator`,
`administrator`), `active`, `mfaEnabled`, `userId` → `users.id` (optional
link). The moderation PATCH derives the acting reviewer server-side from the
authenticated user's linked reviewer row.

### `moderationQueue`

Per-entity workflow state (one open row per entity): `entity` + `entityId`,
`state` (default `queued`; a row is closed before a new one can open),
`assigneeId` → `reviewers.id`, `sensitivity` (`standard` | `sensitive` |
`urgent`), `requiresSecondReview`, `secondReviewerId`,
`escalationReason`, timestamps. `cameras.status` stays the domain/public
state; this table tracks assignment, sensitivity, second review, and
escalation.

### `moderationAppeals`

Contributor appeals (ADR 0014): `entity` + `entityId`,
`decisionEventId` → `moderationEvents.id` (the contested final decision),
`appellantId` → `users.id`, `reason`, `status` (`pending` → `upheld` |
`dismissed` | `escalated`), `decidedBy` → `reviewers.id`, `decisionNote`,
`decidedAt`. One pending appeal per decision (partial unique constraint in the
migration).

### `moderationEvents`

Append-only audit trail for moderation and appeals. `entity` + `entityId`,
`previousStatus`, `newStatus`, `action`, `reasonCode`, `note`, `actor`,
`reviewerId` → `reviewers.id`, `actorRole`, `recused`, `escalated`,
`secondReviewerId`, `appealId` (→ `moderation_appeals.id`), `createdAt`.
UPDATE/DELETE are blocked at the database layer (triggers in migration
`0008`); the API exposes no way to mutate history.

### `photos`

Photo evidence metadata (bytes live in R2 bucket `PHOTOS` under an opaque
`storageKey` never exposed to clients). `cameraId`, `contributorId`,
`submitterKey` (internal pending-quota bucket: `contributor:<id>` for
authenticated uploads, `anon:<sha256(caller key)>` for anonymous ones; never
exposed and only pending rows count), `mimeType`, `width`, `height`,
`sizeBytes`, `status` (`pending` → `approved` | `rejected`), `exifStripped`
(mandatory intake strip), `redactionConfirmed` (set by the moderator at
approval time), timestamps.

### `cameraConfirmations`

Community verifications (ADR 0018 §2, migration `0020`). Toggle semantics:
`cameraId` → `cameras.id` (cascade delete), `contributorId` →
`contributors.id` (cascade delete), `createdAt`. The UNIQUE
`(camera_id, contributor_id)` index is the structural anti-gaming layer —
one active verification per (record, contributor), enforced at the database
level (a concurrent double-PUT yields exactly one row, the second answers
`409`). `createdAt` drives the daily-quota COUNT and the per-record cap; the
decay rule (`created_at >= cameras.last_verified_at`) is applied in the
count query.

### `cameraEditRequests`

Community contribution editing (ADR 0018 §4, migration `0021`). Published-
record edits never mutate `cameras` directly: they insert a row here with
the explicit per-column diff against the editable whitelist (`proposedTitle`,
`proposedKind`, `proposedAddress`, `proposedNotes`, `proposedManufacturer`,
`proposedObservedOn`, `proposedDirection`, `proposedDescription` — the
direction column is migration `0035`) plus a `moderation_queue` row
(entity `camera_edit`). `cameraId` (set null on delete), `contributorId`,
`status` (`pending` → `approved` | `rejected`), `decidedBy` → `reviewers.id`,
`decisionNote`, `decidedAt`, timestamps. The partial unique index
`(camera_id) WHERE status = 'pending'` enforces one open edit-request per
camera.

## Local report-location selection

The local report form accepts a position chosen by clicking the map or by
entering a valid latitude and longitude. Both interactions use the same
validated `latitude`/`longitude` submission fields and trigger the same
non-blocking nearby check (`GET /api/cameras/nearby`). That check draws only
from `verified` and fictional `demo` records; it does not expose pending
submissions or other private data.

## Data quality rules

- Every published record needs provenance, a review decision, and an update date.
- Prefer a precise coordinate only when its publication is safe; the default published precision is ~4 decimal places (~10 m), rounding (never truncating), and finer values require a documented justification (ADR 0008).
- Use controlled categories rather than free-form surveillance capability claims.
- Treat "brand", "direction", "coverage", and similar fields as potentially sensitive; their public availability requires a jurisdiction-specific rule.
- Retire or mark stale records rather than presenting old observations as current facts.
