# Data dictionary

Status: current for main (2026-08-01). This document describes
every public field exposed by the prototype so that a contributor can
understand the public dataset from documentation alone (Horizon 3 exit gate in
[FUTURE_ROADMAP.md](FUTURE_ROADMAP.md)). It is a *lightweight* companion to the
[data model and API reference](DATA_MODEL.md): it does not replace that
document, it spells out each field, its allowed values, and its visibility
rules per output format.

For how future, versioned releases of the dataset will be published and cited,
see [Export versioning policy](EXPORT_VERSIONING.md).

## Public data boundary

The public dataset contains **only** camera records with status `verified`
(real, reviewed) or `demo` (clearly labelled illustrative content). Everything
else — pending submissions, corrections, moderation events, evidence,
reviewer notes — is private and must never appear in map, directory, JSON,
CSV, or GeoJSON output. See [DATA_MODEL.md](DATA_MODEL.md) and
[PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md) for the full boundary rules.

## Output formats and endpoints

| Output | Endpoint | Shape |
| --- | --- | --- |
| JSON | `GET /api/cameras` | `{ "records": [ … ], "total": N, "nextOffset": N \| null }` (paginated, see below) |
| CSV | `GET /api/cameras?format=csv` | One header row, one record per row, newline-terminated (complete snapshot) |
| GeoJSON | `GET /api/cameras?format=geojson` | `FeatureCollection` of `Point` features (complete snapshot) |
| Nearby JSON | `GET /api/cameras/nearby?latitude=…&longitude=…&radius=…` | `{ "records": [ … ] }`, same fields plus `distanceMeters` |
| Search JSON | `GET /api/cameras/search?q=…&lang=…` | `{ "query", "area": { "kind", "displayName"?, "latitude", "longitude", "radiusMeters", "radiusLabel" }, "count", "records" }` |
| Revisions JSON | `GET /api/cameras/revisions?cameraId=N` | `{ "recordId", "revisions": [ { "id", "entityId", "previousStatus", "newStatus", "action", "createdAt" } ] }` |
| Photos JSON | `GET /api/photos?cameraId=N` | `{ "photos": [ { "id", "mimeType", "width", "height" } ] }` |
| Photo bytes | `GET /api/photos/[id]` | Raw image bytes (JPEG/PNG/WebP), not a JSON envelope |

The default JSON list is paginated so the payload stays bounded as the
dataset grows: `limit` (default 500, hard max 500) and `offset` (default 0)
are optional non-negative integers. `total` is the number of records
matching the filters independent of the page, and `nextOffset` is the
offset of the next page (or `null` on the last page) so a client can walk
the whole list without guessing. Records are ordered `id DESC`, keeping
offsets stable between requests. Invalid values (`limit=0`, negatives,
decimals, non-numeric text) answer `400`; a blank `limit` falls back to the
default. CSV and GeoJSON exports deliberately ignore pagination: they are
complete snapshots for download, rate-limited in their own bucket.

Cache policy: the JSON list, the single-record route and the bbox/GeoJSON
marker layer answer `Cache-Control: public, s-maxage=300,
stale-while-revalidate=600` — the dataset changes through moderation
decisions, never live feeds, so a bounded 5-minute edge/browser cache keeps
the directory and map responsive while still converging after any decision
(and the moderation write path purges the exact `Cache-Tag` immediately).
The nearby, search, revisions, and photo-list responses answer
`Cache-Control: no-store` — they derive from moderation decisions or user
input that must never be served stale. The CSV/GeoJSON exports answer
`Cache-Control: public, max-age=3600`: a bounded 1 h staleness is
acceptable for a download snapshot, and the URL's content does change when
moderators act, so it is deliberately not `immutable`. Photo bytes keep
their longer `public, max-age=3600, immutable` policy because their storage
key already version-binds the content.

The JSON, CSV, GeoJSON, and nearby outputs derive from the same filtered
public-record list (`status IN ('verified','demo')`), so a record appears in
all of them or in none of them. CSV cells are escaped to reduce spreadsheet
formula-injection risk (values beginning with `=`, `+`, `-`, or `@` are
prefixed with `'`).

The search output is a spatial projection of the same list: the query is
resolved to a point plus a radius and every reviewed public record near that
area is returned. A raw coordinate pair (`41.9004, 12.4936`) is parsed
locally and searched at a fixed radius without touching the external
geocoder; any other text is resolved through the geocoder (`db/geocode.ts`,
Nominatim), whose bounding box decides the radius. The response carries the
resolved area explicitly and never claims coverage: an empty `records` array
means only that no published record falls inside the area. Failure modes are
truthful — `404` when the place cannot be resolved, `503` when the geocoder
or database is unavailable, `429` on the search rate limit, `400` for a
missing or over-long query — and the response is never cached
(`Cache-Control: no-store`).

The revisions output is a public change summary for a single record and
carries no moderator identity: only the lifecycle actions
(`approve`, `reject`, `hide`, `mark-stale`, `reverify`,
`scheduled-expiry`, `expiry-not-reconfirmed`, `marked-stale`) with their
timestamps are listed. It is served **only** for records that are currently
public — a `404` answers for any other record so pending/rejected/removed
records cannot be probed and their private history never leaks. It has its
own rate-limit bucket.

Photo outputs fail closed. `GET /api/photos?cameraId=N` lists only approved
photos (`status = 'approved'` and `redaction_confirmed = 1`) of a currently
public camera and answers `404` when the camera is not public, so a pending
or rejected record never leaks its evidence. `GET /api/photos/[id]` returns
bytes only under the same conditions; every other case answers an
indistinguishable `404` (no existence leak), the storage key never appears,
and the image is served with `Cache-Control: public, max-age=3600,
immutable`.

## Public record fields

Field names differ slightly between formats: JSON/GeoJSON use camelCase,
CSV uses snake_case for `observedOn` → `observed_on`. CSV and GeoJSON omit
some fields entirely (marked `—`).

| Field | JSON | CSV | GeoJSON | Type | Description and rules |
| --- | --- | --- | --- | --- | --- |
| `id` | ✓ | ✓ | ✓ | integer | Stable record identifier. Never reused after a record is removed. |
| `title` | ✓ | ✓ | ✓ | string | Plain-language label. No personal names. |
| `kind` | ✓ | ✓ | ✓ | string | Camera category, e.g. `Fixed dome`, `Traffic monitoring`. Controlled by reviewers rather than free-form capability claims. |
| `manufacturer` | ✓ | ✓ | ✓ | string \| null | Optional maker/brand. **Conditional:** `null` unless the moderator explicitly set `publishManufacturer = 1` for that record. |
| `observedOn` / `observed_on` | ✓ | ✓ | ✓ | string \| null | Optional observation date in `YYYY-MM-DD` form. **Conditional:** `null` unless `publishObservedOn = 1`. |
| `publishManufacturer` | ✓ | — | — | 0 \| 1 | Per-field publication flag; `1` only when a moderator elected to publish the manufacturer. Never appears in CSV/GeoJSON. |
| `publishObservedOn` | ✓ | — | — | 0 \| 1 | Per-field publication flag; `1` only when a moderator elected to publish the observation date. Never appears in CSV/GeoJSON. |
| `address` | ✓ | ✓ | — | string \| null | General location text, not a private address. Not exported in GeoJSON. |
| `latitude` | ✓ | ✓ | — (in geometry) | number | WGS84 latitude of publicly visible infrastructure; rounded/generalised where precision would be unsafe. In GeoJSON it lives in the feature geometry, not the properties. |
| `longitude` | ✓ | ✓ | — (in geometry) | number | WGS84 longitude; same precision rule as latitude. GeoJSON geometry is `[longitude, latitude]`. |
| `direction` | ✓ | ✓ | ✓ | integer \| null | Field-of-view compass bearing in degrees 0-359 (clockwise from north) for DIRECTIONAL cameras; `null` for non-directional / unknown (kanban `t_1b08fe12`, migration 0035). A dome camera (canonical kind `Fixed dome`) always carries `null` — the map renders domes circular, never a triangle. Out-of-range or non-integer values are rejected with `422` on input. |
| `status` | ✓ | ✓ | ✓ | string | `verified` (reviewed, real) or `demo` (fictional, clearly labelled). No other status can be present in a public output. |
| `source` | ✓ | ✓ | ✓ | string | Provenance label. In the prototype the observed values are `Prototype seed` (illustrative demo records) and `Community report` (submitted and later approved). Future provenance classes are defined in [workstreams/DATA_TRUST.md](workstreams/DATA_TRUST.md). |
| `updated` | ✓ | ✓ | ✓ | string | Last public verification date (ISO 8601) — every code path that touches `cameras.updated` writes a comparable ISO timestamp (P1-2); the descriptive text of a moderation action lives in `moderation_events.note`, never in this column. Freshness windows (`7d`/`30d`/`90d`) match only ISO values: the seeded demo records deliberately carry the literal label `Demo data` (illustrative pins are excluded from freshness windows by the client gate). Migration `0007_directory_freshness_backfill` converted the pre-existing prose labels of verified records into comparable ISO timestamps. |
| `description` | ✓ | ✓ | ✓ | string | Brief factual context written or reviewed by a moderator; no sensitive operational detail. |
| `createdAt` | ✓ | — | — | string | Submission/creation timestamp (ISO). Not exported in CSV/GeoJSON. |
| `confirmationCount` | ✓ | — | — | integer | Aggregate community-verification count (ADR 0018 §2.3, C1): how many distinct contributors currently confirm the camera exists at the documented location. **Never per-profile attribution** — the public DOM carries only the aggregate. Only in the JSON list and single-record payloads (the map marker/bbox layer and the CSV/GeoJSON exports omit it). Counts are *decayed*: only verifications at/after `lastVerifiedAt` count, and re-verifying a record "renews" its verifications. |

### Nearby response extra field

`GET /api/cameras/nearby` returns the same public records with one additional
field:

| Field | Type | Description |
| --- | --- | --- |
| `distanceMeters` | number | Great-circle distance from the requested point, in metres. The endpoint accepts `latitude`/`longitude` (required) and `radius` (optional, 10–500 m, default 75 m) and is used for the local duplicate warning. |

## Submission input fields (`POST /api/cameras`)

Input is trimmed and length-limited; invalid positions or an invalid optional
observation date are rejected with `400`; an out-of-range `direction` is
rejected with `422` (kanban `t_1b08fe12`). The response (`201`) echoes the
stored private record, which the submitter may inspect; none of it is public
until a moderator approves the record.

When a reviewed public record at essentially the same spot (or ≤ 75 m with
matching text) is found **before** storage, the route answers `409` with
`{ error, possibleDuplicates }` and stores nothing (ADR 0019). The submitter
must explicitly acknowledge the candidate is a distinct camera via
`duplicateConfirmed: true`; the report is then stored and the candidates are
returned in the `201` for moderation context. Medium/low candidates never
block and appear in `possibleDuplicates` either way.

| Field | Required | Limit | Notes |
| --- | --- | --- | --- |
| `title` | yes | 90 chars | |
| `kind` | yes | 60 chars | |
| `latitude` | yes | -90 … 90 | Must be a finite number. |
| `longitude` | yes | -180 … 180 | Must be a finite number. |
| `address` | no | 180 chars | |
| `manufacturer` | no | 80 chars | Stored privately; publication needs the moderator opt-in. |
| `observedOn` | no | 10 chars | Must be a real calendar date in `YYYY-MM-DD` form. |
| `notes` | no | 1000 chars | **Never public.** Internal intake notes; excluded from every public output by the public query boundary. |
| `duplicateConfirmed` | no | boolean | Strictly `true` to acknowledge a `high`-strength candidate (ADR 0019). Anything else (`"true"`, `1`, absent) fails closed with `409`. |

### Correction request input (`POST /api/corrections`)

| Field | Required | Limit | Notes |
| --- | --- | --- | --- |
| `cameraId` | no | integer ≥ 1 | Optional link to a public record. |
| `issueType` | yes | 50 chars | Short reason label (e.g. inaccurate details, no longer present, privacy concern). |
| `message` | yes | 1500 chars | Short description. |
| `contact` | no | 180 chars | Contact for follow-up; stored privately. |

The response is `201 { "referenceId": … }`; requests are private and never
alter a public record automatically.

### Photo intake input (`POST /api/photos`)

Uploads one image as the raw request body (JPEG/PNG/WebP only, size and
dimension limits are env-tunable). The route sniffs the container from magic
bytes (never trusts the caller's `Content-Type`), strips EXIF/XMP/IPTC
metadata — mandatory, fail closed — and stores sanitised bytes in R2
(`PHOTOS`) with metadata-only in D1. The response (`201`) is photo metadata
only: never the storage key, never the bytes back. The photo stays private
until a moderator approves it and confirms redaction; only then can it
appear in the public photo outputs above.

## Community verifications, trust levels and contribution profile (C1/C2)

The community layer (ADR 0018, COMMUNITY_PLAN §2–§4) adds two private,
authenticated surfaces on top of the public dataset, plus the aggregate
`confirmationCount` on public record payloads described above. All
community endpoints are personal data: they answer `Cache-Control: no-store`
and are gated by the contributor session (ADR 0013) with same-origin + CSRF
on mutations.

### Verification toggle — `PUT/DELETE/GET /api/cameras/[id]/confirmation`

A verification is a personal confirmation that the camera exists at the
documented location. It is **not** a vote or a rating: one verification per
account per record (UNIQUE `(camera_id, contributor_id)` at the database
level), a level gate (≥ 1 published contribution), a self-verification ban,
daily per-account and per-record quotas, and an IP-hash burst bucket are the
anti-gaming layers (COMMUNITY_PLAN §4.2).

| Method | Behaviour | Responses |
| --- | --- | --- |
| `PUT` | Toggle ON (empty body) → `{ "confirmed": true, "count": N }` | `401` anonymous · `403` CSRF or level gate or self-verify · `404` record not public · `409` already verified · `429` quota |
| `DELETE` | Toggle OFF → `{ "confirmed": false, "count": N }` | `404` no verification to remove · `401`/`403` as above |
| `GET` | Personal state → `{ "confirmed": bool }` (anonymous → `false`) | `404` invalid id · `429` rate limit |

The public aggregate lives on the record payload as `confirmationCount`
(JSON list + single-record route, `s-maxage=300, stale-while-revalidate=600`);
the personal toggle state is always `no-store`.

### Contribution profile — `GET /api/auth/me/contributions`

The authenticated contributor's own attributed contributions (camera
reports, corrections, photo uploads), paginated with the canonical F0
contract and the caller's own trust level in the meta. Only own data is ever
served: a `contributorId` query parameter targeting another account answers
`400` and is never resolved (no cross-account path, no existence oracle).

| Query | Values | Notes |
| --- | --- | --- |
| `type` | `camera` \| `correction` \| `photo` | Optional whitelist; unknown value → `400` |
| `status` | `pending` \| `verified` \| `needs_review` \| `removed` | Optional whitelist; unknown value → `400` |
| `page` | positive integer, default `1` | 1-based |
| `pageSize` | integer 1–100, default `25` | clamped at the db boundary too |

Response:

```json
{
  "contributions": [
    { "type": "camera|correction|photo", "id": 7, "title": "…" | null,
      "issueType": "…" | null, "cameraId": 3 | null,
      "status": "verified", "createdAt": "2026-08-01T…Z" }
  ],
  "pagination": { "page": 1, "pageSize": 25, "total": 3, "totalPages": 1, "hasMore": false },
  "level": { "level": 2, "verifiedCount": 7, "threshold": 5, "nextThreshold": 20 }
}
```

Errors: `401` anonymous · `400` unknown filter or invalid pagination or
cross-account `contributorId` · `503` database unavailable. The superseded
`GET /api/auth/me/submissions` stays for backward compatibility and is
deprecated. `GET /api/auth/me` also carries the caller's own `level` so the
account page renders the badge and progress line in one call.

### Trust level — `level` (derived, never denormalised)

The level is a pure function `deriveLevel(verifiedCount)` of the
contributor's **verified** contribution count — `status = 'verified'`
records only; pending, rejected and removed never count. Thresholds live in
one constant (`app/lib/trust-levels.ts`, `TRUST_LEVELS`):

| Level | Threshold (verified contributions) |
| --- | --- |
| L0 | 0 |
| L1 | 1 |
| L2 | 5 |
| L3 | 20 |
| L4 | 50 |

The meta shape is machine-readable: `{ level, verifiedCount, threshold,
nextThreshold }` with `nextThreshold: null` at the top level (L4). There is
**no** `contributors.contributor_level` column — the level is always
recomputed from a COUNT over the `(contributor_id, status)` index, so it can
never go stale when a moderation decision flips a record's status, and
account erasure recalculates it by de-attributing records. No endpoint
exposes anyone else's or a global level, and no leaderboard/ranking exists
(COMMUNITY_PLAN §3.1, §5.2). Display labels ("New contributor", "Trusted
contributor", "Experienced contributor") are a frontend/i18n concern
(`community.ts` bundle), never a backend constant.

## Fields that are never public

The following exist in storage or private responses and must never appear in
any public output:

- `cameras.notes` — intake notes (public query explicitly omits it).
- `correction_requests.*` — full correction requests (only the opaque
  `referenceId` is returned to the requester).
- `moderation_events.*` — reviewer actions, reason codes, notes, and actor
  identifiers. Only aggregate statistics may become public later
  ([workstreams/DATA_TRUST.md](workstreams/DATA_TRUST.md)).
- Pending reports in any state other than `verified`/`demo` (`pending`,
  `needs_review`, `rejected`, `removed`).
- `photos.*` — photos that are not approved (`pending`, `rejected`, or
  `redaction_confirmed = 0`) and their R2 storage keys. The public photo
  endpoints fail closed with an indistinguishable `404`, never revealing the
  existence of a non-approved photo.
- `appeals.*` — appeals against moderation decisions and their reasons; only
  moderators can list them, and no appeal content is ever serialised in a
  public response.
- `moderation_queue.*` — the internal moderation queue: assignees,
  sensitivity flags, escalation reasons, and reviewer notes.
- `sessions.*` and auth tokens — contributor sessions, session tokens, and
  CSRF tokens are never serialised in any response outside the authenticated
  session flow itself.
- `camera_confirmations.*` — who verified a record is never public: the
  public payloads expose only the aggregate `confirmationCount`, never a
  per-profile link (ADR 0018 decision 2). The personal toggle state
  (`GET /api/cameras/[id]/confirmation`) is `no-store` and only meaningful
  for the signed-in caller.
- Trust levels of other contributors (or global levels) — `level` is served
  only to the caller for their own profile; no endpoint exposes anyone
  else's level and no leaderboard/ranking exists (COMMUNITY_PLAN §3.1,
  §5.2).

## Related policies

- [Data model and API](DATA_MODEL.md) — schema and status lifecycle.
- [Moderation policy](MODERATION.md) — what a review decides and records.
- [Privacy and safety](PRIVACY_AND_SAFETY.md) — data minimisation and boundary rules.
- [Open source and data licensing](OPEN_SOURCE.md) — dataset licence.
- [Export versioning policy](EXPORT_VERSIONING.md) — how future releases will be versioned.
