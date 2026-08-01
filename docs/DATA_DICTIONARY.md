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
| JSON | `GET /api/cameras` | `{ "records": [ … ] }` |
| CSV | `GET /api/cameras?format=csv` | One header row, one record per row, newline-terminated |
| GeoJSON | `GET /api/cameras?format=geojson` | `FeatureCollection` of `Point` features |
| Nearby JSON | `GET /api/cameras/nearby?latitude=…&longitude=…&radius=…` | `{ "records": [ … ] }`, same fields plus `distanceMeters` |
| Search JSON | `GET /api/cameras/search?q=…&lang=…` | `{ "query", "area": { "kind", "displayName"?, "latitude", "longitude", "radiusMeters", "radiusLabel" }, "count", "records" }` |
| Revisions JSON | `GET /api/cameras/revisions?cameraId=N` | `{ "recordId", "revisions": [ { "id", "entityId", "previousStatus", "newStatus", "action", "createdAt" } ] }` |
| Photos JSON | `GET /api/photos?cameraId=N` | `{ "photos": [ { "id", "mimeType", "width", "height" } ] }` |
| Photo bytes | `GET /api/photos/[id]` | Raw image bytes (JPEG/PNG/WebP), not a JSON envelope |

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
| `status` | ✓ | ✓ | ✓ | string | `verified` (reviewed, real) or `demo` (fictional, clearly labelled). No other status can be present in a public output. |
| `source` | ✓ | ✓ | ✓ | string | Provenance label. In the prototype the observed values are `Prototype seed` (illustrative demo records) and `Community report` (submitted and later approved). Future provenance classes are defined in [workstreams/DATA_TRUST.md](workstreams/DATA_TRUST.md). |
| `updated` | ✓ | ✓ | ✓ | string | Last public verification date (ISO 8601). Freshness windows (`7d`/`30d`/`90d`) match only ISO values, so non-ISO labels are never window-matched: seeded demo records carry the literal label `Demo data`, and a fresh submission `Submitted just now` until it is verified. Migration `0007_directory_freshness_backfill` converted the pre-existing prose labels of verified records into comparable ISO timestamps. |
| `description` | ✓ | ✓ | ✓ | string | Brief factual context written or reviewed by a moderator; no sensitive operational detail. |
| `createdAt` | ✓ | — | — | string | Submission/creation timestamp (ISO). Not exported in CSV/GeoJSON. |

### Nearby response extra field

`GET /api/cameras/nearby` returns the same public records with one additional
field:

| Field | Type | Description |
| --- | --- | --- |
| `distanceMeters` | number | Great-circle distance from the requested point, in metres. The endpoint accepts `latitude`/`longitude` (required) and `radius` (optional, 10–500 m, default 75 m) and is used for the local duplicate warning. |

## Submission input fields (`POST /api/cameras`)

Input is trimmed and length-limited; invalid positions or an invalid optional
observation date are rejected with `400`. The response (`201`) echoes the
stored private record, which the submitter may inspect; none of it is public
until a moderator approves the record.

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

## Related policies

- [Data model and API](DATA_MODEL.md) — schema and status lifecycle.
- [Moderation policy](MODERATION.md) — what a review decides and records.
- [Privacy and safety](PRIVACY_AND_SAFETY.md) — data minimisation and boundary rules.
- [Open source and data licensing](OPEN_SOURCE.md) — dataset licence.
- [Export versioning policy](EXPORT_VERSIONING.md) — how future releases will be versioned.
