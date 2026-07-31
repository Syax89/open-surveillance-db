# Export versioning policy

Status: **proposal for future releases** (2026-07-31). The current prototype
exposes live convenience downloads (`/api/cameras?format=csv|geojson` and the
JSON list) that always reflect the current database and carry **no version
identifier**. This document defines how *versioned* dataset releases will be
published once the project reaches the public-alpha phase. It does not
describe functionality that exists today.

The corresponding execution-board ticket is *"Publish versioned data exports,
data dictionary, and changelog"* (P1 in [EXECUTION_BOARD.md](EXECUTION_BOARD.md)),
blocked on the **final data licence** decision (Wave A).

## Why versioned exports

Versioned, immutable releases let consumers:

- cite exactly what they analysed (`dataset 2026.08.1`, not "whatever the API
  returned on that day");
- detect and understand changes between releases through a changelog;
- audit what data was public under which policy documents at a given time.

They are a precondition of Wave D (limited public alpha), not of the local
prototype.

## Scope

A "versioned export" is a **snapshot** of the reviewed public dataset
(`verified` records; `demo` records stay clearly labelled or are excluded
per the release notes) published as a release artifact, together with its
metadata. Live API/CSV/GeoJSON endpoints remain out of scope: they are
convenience views of the current database and are never a substitute for a
release.

## Versioning scheme

Proposed: **date-based release versions** in the form `YYYY.MM.<release>`.

- `YYYY.MM` identifies the month of the release cycle (e.g. `2026.08`).
- `<release>` is a per-month sequence starting at `1` (e.g. `2026.08.1`).
- Releases are immutable once published. Corrections to a published release
  are published as a new release (`2026.08.2`), never by mutating the old one.
- Pre-alpha snapshots may additionally carry a `-rc`/`-alpha` suffix and must
  be clearly labelled as not for production use.

Date-based versions are preferred over semantic versions because the dataset
is a collection of facts with no stable API contract; a field-level
compatibility policy is documented below instead.

## Required metadata on every release

Each versioned export must carry, in an accompanying machine-readable manifest
(proposed: `manifest.json` shipped with the artifact) and in the human release
notes:

| Item | Example | Purpose |
| --- | --- | --- |
| Dataset version | `2026.08.1` | Unambiguous citation. |
| Release date | `2026-08-31` | Freshness and retrieval. |
| Licence | SPDX identifier, per [OPEN_SOURCE.md](OPEN_SOURCE.md) | Reuse conditions. Final licence still to be decided in Wave A. |
| Schema version | git short SHA of the migrations used | Field-level compatibility. |
| Policy snapshot | git tag or commit of `docs/` at release time | Which policy documents governed the data. |
| Provenance summary | counts by `source` and `status` | Aggregate transparency; no private data. |
| Changelog reference | link to the release notes entry | What changed since the previous release. |

The manifest must never contain private fields or personal data — the same
boundary as the [data dictionary](DATA_DICTIONARY.md) applies to the metadata.

## Policy versioning

Policy documents live in `docs/` (data model, moderation, privacy and safety,
data dictionary, this document) and are versioned by git. A **policy
snapshot** is the set of policy documents as of a specific commit or release
tag. Because policies and dataset are versioned together in this repository,
the dataset version can always be traced back to the exact policy documents
that applied at publication time. The manifest's *Policy snapshot* field
records that link.

Proposed rule: **any change to the public data boundary, field semantics, or
publication rules requires a new dataset release** even if no rows changed,
so that a release is never ambiguous about which policy applied.

A machine-readable policy manifest (a checked-in file listing each policy
document and its current version/status) is planned as future work; it will be
added when the first real versioned export is produced, not before.

## Compatibility policy (field changes)

| Change | Version impact | Changelog requirement |
| --- | --- | --- |
| Add an optional field | new release, consumers unaffected | document the field with its visibility rules |
| Rename/remove a field, or change its meaning or allowed values | new release; consumers should re-validate | **major**-flagged entry, with migration notes |
| Change visibility rules (e.g. a field becomes conditional) | new release | document against the data dictionary |
| Policy/legal change affecting the dataset | new release, even with unchanged rows | reference the policy snapshot diff |

Field-level truth always lives in the [data dictionary](DATA_DICTIONARY.md):
a release must not ship fields that the dictionary does not describe, and the
dictionary must be updated in the same change as the field.

## Changelog

Every release needs a changelog entry that answers, for a reader without
internal access:

1. What changed in the data (additions, removals, corrections).
2. Which fields changed, with their new visibility rules.
3. Which policy documents changed, and why (with decision links).
4. Any known caveats (e.g. a jurisdiction's records not yet migrated).

Until a dedicated `CHANGELOG.md` exists, release notes live in the
[status](STATUS.md) and execution-board progress log.

## Open decisions (Wave A blockers)

Before the first versioned release can be published, the following must be
decided and recorded in `docs/decisions/`:

- **Final data licence** (SPDX identifier) — hard blocker for P1.
- Publication precision and retention choices (per-jurisdiction).
- Whether `demo` records are included in releases or excluded.

Until then, all exports remain prototype downloads without version guarantees.
