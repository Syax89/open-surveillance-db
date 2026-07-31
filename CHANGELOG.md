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

### Changed

- Production build audited; TypeScript and lint issues fixed as part of the
  build pipeline (docs/DEPLOYMENT.md added).
- Local deployment documentation aligned with the actual runtime: `vinext dev`
  under `workerd` via a systemd unit, with `vinext start` (plain Node)
  documented as incompatible (`ERR_UNSUPPORTED_ESM_URL_SCHEME` on
  `cloudflare:`).

### Fixed

- Public API no longer exposes the private `notes` field for `verified`/`demo`
  records (pre-hosting hardening).
- Moderation endpoints are fail-closed: without credentials they return
  `503 Moderation is unavailable.`.
- `POST /api/cameras` and `POST /api/corrections` return `400` for a JSON
  `null` body instead of a `500`.
- `rendered-html` test suite repaired and included in the full CI run.
- `package.json` license field set (pre-hosting hardening).

### Security

- Moderation access control implemented and documented
  ([ADR 0003](docs/decisions/0003-moderation-access-control.md)); rate limits
  added on submission routes.
