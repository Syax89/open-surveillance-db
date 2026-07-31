# Project status

Last reviewed: 2026-07-31

## Implemented locally

- [x] Public-facing prototype interface.
- [x] Interactive map based on OpenStreetMap tiles.
- [x] Searchable text directory and record-detail pages for public/demo records.
- [x] Safe directory filters (type and ordering) shared by map and list.
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
- [x] Automated contract tests for public-data and private-request boundaries.
- [x] Local playbook for fictional submit → moderate → public-result checks.
- [x] Local fictional-data check: rejected records remain absent from public outputs and create an audit event.
- [x] Local fictional-data lifecycle check: only verified state reaches public outputs.
- [x] English/Italian interface for public pages, record detail, and local moderation.
- [x] Public in-app guide plus skip link, visible focus treatment, reduced-motion support, and map-directory accessibility guidance.
- [x] Clearly labelled illustrative demo data.
- [x] Initial open documentation and project policies.

## Not yet implemented

- [ ] Authentication and contributor accounts.
- [ ] Authentication/roles, audit log, appeal workflow, and production moderation controls.
- [ ] Image upload, secure storage, EXIF stripping, and redaction tooling.
- [ ] Legal/privacy review and public-facing terms.
- [ ] A production map-tile strategy compliant with provider terms.
- [ ] Public deployment, domain, backup/restore drills, and monitoring.
- [ ] Android application.

The checked items describe local prototype capability only. They do not mean the service is ready to collect or publish real surveillance-camera data.

## Local test deployment (LXC 114)

- [x] Always-on test site on Proxmox LXC 114 `osdb-test` → http://192.168.1.201:3000 (LAN only).
- [x] systemd unit `osdb-test.service` (`vinext dev` in workerd, `Restart=on-failure`, enabled) and `onboot=1` on the container.
- [x] Runtime decision documented: `vinext start` cannot run on plain Node (`ERR_UNSUPPORTED_ESM_URL_SCHEME` on `cloudflare:`), see `docs/DEPLOYMENT.md`.
- [x] Verified: `/` 200, `/api/cameras` 200 (demo-only records, no `notes`), `/api/cameras/nearby` 200, `/guide` 200, `/api/moderation` 503 fail-closed, `/api/corrections` GET 405.
- [ ] Cloudflare Workers + D1 staging deployment (blocked by CEO decision: local-first for now).
