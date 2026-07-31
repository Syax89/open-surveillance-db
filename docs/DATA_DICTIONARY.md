# Data dictionary

Status: current for the local prototype (2026-07-31). This document describes
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
| CSV | `GET /api/cameras?format=csv` | One header row, one record per row, CR/LF-terminated |
| GeoJSON | `GET /api/cameras?format=geojson` | `FeatureCollection` of `Point` features |
| Nearby JSON | `GET /api/cameras/nearby?latitude=…&longitude=…&radius=…` | `{ "records": [ … ] }`, same fields plus `distanceMeters` |

All four outputs derive from the same filtered public-record list
(`status IN ('verified','demo')`), so a record appears in all of them or in
none of them. CSV cells are escaped to reduce spreadsheet formula-injection
risk (values beginning with `=`, `+`, `-`, or `@` are prefixed with `'`).

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
| `updated` | ✓ | ✓ | ✓ | string | Short label of the last review action (e.g. `Local moderation: approved and verified`); seeded demo records carry their creation ISO timestamp. Stored as text; not a machine-readable verification date. |
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
| `message` | yes | — | Short description. |
| `contact` | no | — | Contact for follow-up; stored privately. |

The response is `201 { "referenceId": … }`; requests are private and never
alter a public record automatically.

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

## Related policies

- [Data model and API](DATA_MODEL.md) — schema and status lifecycle.
- [Moderation policy](MODERATION.md) — what a review decides and records.
- [Privacy and safety](PRIVACY_AND_SAFETY.md) — data minimisation and boundary rules.
- [Open source and data licensing](OPEN_SOURCE.md) — dataset licence.
- [Export versioning policy](EXPORT_VERSIONING.md) — how future releases will be versioned.
