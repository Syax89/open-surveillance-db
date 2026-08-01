# Project status

Last reviewed: 2026-08-01

## Implemented locally

- [x] Public-facing prototype interface.
- [x] Interactive map based on OpenStreetMap tiles.
- [x] Searchable text directory and record-detail pages for public/demo records.
- [x] Safe directory filters (type and ordering) shared by map and list.
- [x] Safe category and verification-freshness directory filters: whitelisted freshness windows (`7d`/`30d`/`90d`), parameterised SQL, ISO verification timestamps, and a one-time backfill for pre-existing prose values.
- [x] Non-blocking local duplicate warning based only on nearby public/demo records.
- [x] Report position may be selected by map click or validated manual coordinates; both paths use the same public-only duplicate check.
- [x] Camera-record API and GeoJSON export.
- [x] CSV export derived from the same public-record boundary as JSON and GeoJSON.
- [x] D1-compatible schema and migration.
- [x] Submission path that creates non-public `pending` records.
- [x] Optional manufacturer and observation-date report metadata, normalised
  and validated at intake, with independent per-field publication choices that
  default to private even after the camera itself is approved.
- [x] Private correction/request-for-review intake; requests are not public.
- [x] Local-only moderation queue for pending reports and correction requests.
- [x] Required moderation reason, optional reviewer note, and append-only local audit history.
- [x] Local lifecycle for verified records: mark for review, reverify, or remove.
- [x] Reviewed public change summary on record pages; it omits contributor identities and internal notes.
- [x] Automated contract tests for public-data and private-request boundaries.
- [x] Local playbook for fictional submit → moderate → public-result checks.
- [x] Local fictional-data check: rejected records remain absent from public outputs and create an audit event.
- [x] Local fictional-data lifecycle check: only verified state reaches public outputs.
- [x] Externalised English/Italian interface strings (English as pilot language, Italian type-checked for parity) across public pages, record detail, map, and local moderation.
- [x] Locality/address/coordinate public search with truthful empty states: coordinate pairs are parsed locally, other places are resolved through a configurable geocoder, results stay within the reviewed public-record boundary, and zero-result responses describe the searched area without claiming an absence of cameras.
- [x] Public in-app guide plus skip link, visible focus treatment, reduced-motion support, and map-directory accessibility guidance.
- [x] Draft accessibility statement and design decision for a non-sensitive usability-feedback route ([`docs/ACCESSIBILITY_STATEMENT.md`](ACCESSIBILITY_STATEMENT.md), [ADR 0006](decisions/0006-non-sensitive-usability-feedback-route.md)).
- [x] Contributor accounts and sessions: email+password registration/login/logout, PBKDF2-SHA256 password hashing, hashed opaque session tokens, same-origin + per-session CSRF protection, account page with attributed submissions. Anonymous submissions remain possible by design ([ADR 0013](decisions/0013-contributor-accounts-and-sessions.md)).
- [x] Contributor account erasure with de-attribution (GDPR art. 17): deleting an account detaches its submissions from the contributor identity.
- [x] Clearly labelled illustrative demo data.
- [x] Lightweight public data dictionary and export versioning policy
  ([`docs/DATA_DICTIONARY.md`](DATA_DICTIONARY.md),
  [`docs/EXPORT_VERSIONING.md`](EXPORT_VERSIONING.md)); versioned releases
  remain future work pending the final data licence.
- [x] Documented clean local setup, schema migrations, synthetic fixtures, and
  non-destructive local reset (`docs/DEVELOPMENT_SETUP.md`, commands verified
  on `main`).
- [x] Initial open documentation and project policies.
- [x] Compliant map-tile strategy: same-origin tile proxy with identifying
  User-Agent, forwarded Referer, ≥7-day edge caching, switchable provider
  (`TILE_PROVIDER_URL`/`TILE_PROVIDER_KEY`), and a documented
  community-vs-commercial-vs-self-hosted decision matrix
  ([`docs/OSM_INTEGRATION.md`](OSM_INTEGRATION.md)).
- [x] Coarse auth roles (`contributor`/`moderator`/`admin`) enforced on every
  protected route via `requireRole` (moderation queue, appeals), with the
  acting reviewer derived server-side from the authenticated user instead of a
  client-chosen actor id ([ADR 0014](decisions/0014-auth-roles-appeals.md)).
- [x] Contributor appeal workflow against moderation decisions: file, list,
  decide (independent senior moderator; escalated appeals resolve at the
  administrator); an upheld appeal returns the record to the moderation queue
  for a fresh decision ([ADR 0014](decisions/0014-auth-roles-appeals.md)).
- [x] Append-only audit log extended to appeals (`appeal_id` link on
  `moderation_events`); internal workflow events (appeals, recusals,
  escalations) stay out of the public revision history.
- [x] Image upload for camera records with secure storage: `/api/photos`
  intake with size/MIME/dimension caps, magic-byte container verification,
  mandatory EXIF/XMP/IPTC stripping (fail-closed), sanitised bytes in R2 with
  metadata only in D1, and a moderation/redaction gate — approved photos are
  served only for public cameras; pending or rejected evidence never leaks.
- [x] Legal/privacy review of the public boundary and public-facing terms:
  coordinate precision at ~4 decimal places, retention schedule, and terms
  and privacy notice aligned with the contributor-account flow, plus
  bilingual `/privacy`, `/termini`, `/licenze` pages linked from the global
  footer.
- [x] Public information-site restructure: bilingual pages `/manifesto`,
  `/regole`, `/privacy`, `/termini`, `/licenze`, `/faq`, `/contatti` (and
  `/moderazione`), wired into a global site footer with institutional links,
  ODbL and OSM attribution.
- [x] Local monitoring, backup, and rollback for the LXC 114 test deployment:
  health check, scheduled backups, pre-deploy snapshot, and a rollback script
  that polls the Proxmox task status (`ops/health-check.sh`,
  `ops/backup-lxc114.sh`, `ops/snapshot-pre-deploy.sh`,
  `ops/rollback-lxc114.sh`).
- [x] QA evidence archived under [`docs/qa/`](qa/):
  [`QA_REPORT_auth-flow-e2e.md`](qa/QA_REPORT_auth-flow-e2e.md) (authenticated
  submit → moderate → publish flow, 457 tests) and
  [`QA_REPORT_navigation-pages.md`](qa/QA_REPORT_navigation-pages.md)
  (navigation, accessibility, EN/IT parity, and GDPR notice links, 569 tests).

## Not yet implemented

- [ ] MFA enforcement and provisioning of operator identities onto the
  `users` role table — contributor accounts and sessions are in place
  ([ADR 0013](decisions/0013-contributor-accounts-and-sessions.md)); the
  seeded demo identities remain prototype-only and `mfa_enabled` lands with
  the real auth provider.
- [ ] Public `/feedback` page for the non-sensitive usability-feedback route (designed in [ADR 0006](decisions/0006-non-sensitive-usability-feedback-route.md); implementation pending).
- [ ] Production moderation controls at public launch: abuse-response runbook,
  retrospective review workflow for emergency hides, and
  [MODERATION_SLA](legal/MODERATION_SLA.md) targets in force (roles, appeals,
  and the audit log are in place — [ADR 0014](decisions/0014-auth-roles-appeals.md)).
- [ ] Public deployment with a public domain — production monitoring,
  backup/restore drills, and error alerting remain a future precondition, see
  `docs/DEPLOYMENT.md` (the local LXC 114 deployment already has
  monitoring/backup/rollback in place).
- [ ] Android application.

The checked items describe local prototype capability only. They do not mean the service is ready to collect or publish real surveillance-camera data.

## Local test deployment (LXC 114)

- [x] **Current local environment**: always-on test site on Proxmox LXC 114 `osdb-test` → http://192.168.1.201:3000 (LAN only).
- [x] systemd unit `osdb-test.service` (`vinext dev` in workerd, `Restart=on-failure`, enabled) and `onboot=1` on the container.
- [x] Runtime decision documented: `vinext start` cannot run on plain Node (`ERR_UNSUPPORTED_ESM_URL_SCHEME` on `cloudflare:`), see `docs/DEPLOYMENT.md`.
- [x] Verified: `/` 200, `/api/cameras` 200 (demo-only records, no `notes`), `/api/cameras/nearby` 200, `/guide` 200, `/api/moderation` 503 fail-closed, `/api/corrections` GET 405.
- [x] Ops scripts for the local environment: `ops/health-check.sh`, `ops/backup-lxc114.sh`, `ops/snapshot-pre-deploy.sh`, `ops/rollback-lxc114.sh`.
- [ ] Cloudflare Workers + D1 staging deployment (blocked by CEO decision: local-first for now).
