# ADR 0022: D1-authoritative operational data

- **Status:** accepted
- **Date:** 2026-08-09
- **Decision owner:** Simone Rondina, project owner
- **Related:** ADR 0012 (Workers hosting), ADR 0021 (community write path),
  `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`

## Context

OpenSurveillanceDB previously treated the LAN container's Miniflare SQLite
state as an import working copy, then used a scheduled container-to-D1
backfill. That process was not a replication protocol: it used `INSERT OR
IGNORE`, did not propagate updates or deletes, and could leave the two stores
in different states after an outage.

A single real data authority is required. A local and remote SQLite database
cannot provide atomic two-phase commits through ordinary Worker and CLI calls;
adding best-effort dual writes would turn a partial failure into silent drift.

## Decision

1. **Cloudflare D1 `osdb-production` is the sole authority for real data.**
   Production Worker writes already use `env.DB`; no application dual-write is
   introduced.
2. **The operational LXC runs its D1 binding remotely.** Its uncommitted
   `wrangler.jsonc` carries the real D1 ID and is made remote only by
   `scripts/enable-d1-authoritative.mjs`. The committed configuration keeps a
   placeholder ID and does not opt into remote access, preserving isolated
   development and test behaviour.
3. **The LXC receives a dedicated, least-privilege Cloudflare credential via
   systemd `LoadCredentialEncrypted`.** It is not placed in `.dev.vars`, source
   files, GitHub, or a plaintext systemd drop-in. The versioned templates are
   `ops/osdb-test-d1-authoritative-start.sh` and
   `ops/osdb-test-d1-authoritative.conf`.
4. **The historical local-to-D1 backfill is recovery-only.**
   `scripts/sync-d1-backfill.mjs` permits a real write only with
   `--allow-legacy-container-to-d1`; normal runs fail closed. The old scheduled
   job is paused pending explicit removal approval.
5. **Miniflare files are disposable test state, not a replica.** No local-only
   row is silently imported into D1 as part of this decision. If recovery ever
   needs data from an old local snapshot, it is a separately reviewed migration
   with a backup, row-level reconciliation, and explicit owner approval.

## Consequences

- A successful report/correction/community action is immediately visible to
  every runtime using D1; there is no nightly propagation window.
- The LXC needs D1 network/API availability to serve DB-backed pages or accept
  writes. Failure is visible as unavailable service rather than a local success
  that later diverges.
- Local development remains safe by default because it has neither a real D1 ID
  nor the encrypted LXC credential.
- Container deployment must preserve the local real `database_id`, enable
  `remote: true`, and run the helper's `--check` before service restart.

## Verification and recovery

- `node scripts/enable-d1-authoritative.mjs --config wrangler.jsonc --check`
  verifies the operational binding without printing the ID.
- The container health check includes `GET /api/cameras?limit=1`; a `200`
  verifies the D1 binding, while `503` is a failure.
- Before each container update, take the existing Proxmox snapshot. Roll back
  the container runtime/configuration if startup or the D1 health check fails;
  do **not** restore an old local SQLite database into D1 automatically.
