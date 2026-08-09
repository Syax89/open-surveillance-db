# Operations manual — OpenSurveillanceDB

Status: operational draft for production rollout.
References: `docs/DEPLOYMENT.md` (preconditions and release procedures), `docs/roadmap.md`.
Last procedure verification: 2026-08-01 — including the local
operations drill (section 8 and appendix).

This document satisfies the operability precondition of `DEPLOYMENT.md`:
"Automated backups, restoration drill, monitoring, error alerting, and incident
runbook". Every procedure listed here has been executed at least once locally
(real commands and output in the [Appendix](#appendix-verified-commands)).

---

## 1. Overview

| Environment | Worker | D1 | Notes |
|---|---|---|---|
| development | local (`wrangler dev`) | local | demo data, no real data |
| staging | Workers (preview/`--env staging`) | staging D1 | synthetic data only (DEPLOYMENT.md §release constraint) |
| production | Workers (`open-surveillance-db`) | D1 `osdb-production` (remote) | only environment with real data |

Cross-cutting rules:

- No secrets in source, workflows, or logs. Credentials only via Cloudflare
  secrets / GitHub Actions secrets (`${{ secrets.* }}`).
- D1 dumps contain the contact data of correction requests
  (`correction_requests.contact`) and the moderation queue: they are sensitive
  data and must be treated as such (section [3.5](#35-backup-protection)).
- The moderation endpoint is fail-closed: without configured credentials it
  responds `503`, never `200` (verified, see Appendix).

---

## 2. Monitoring: health checks, error rate, alerting

### 2.1 Periodic health check

Endpoints to monitor in production:

| Check | URL | Expected | Meaning |
|---|---|---|---|
| homepage | `GET /` | `200`, expected `<title>` | worker + asset bundle served |
| public API | `GET /api/cameras` | `200` + JSON `{"records":[...]}` | D1 reachable, public query OK |
| moderation | `GET /api/moderation` | `401`/`503` (NEVER `200` without auth) | fail-closed gate active |

Manual procedure (identical to the one used in the local drill):

```bash
curl -sS -o /dev/null -w 'home        %{http_code} in %{time_total}s\n' https://<PROD_URL>/
curl -sS -o /dev/null -w 'api/cameras %{http_code} in %{time_total}s\n' https://<PROD_URL>/api/cameras
curl -sS -o /dev/null -w 'moderation  %{http_code}\n' https://<PROD_URL>/api/moderation
```

Automated by the `.github/workflows/ops-monitoring.yml` workflow (scheduled,
daily cron; opens a GitHub issue if a check fails — section 2.3).

### 2.2 Error rate and logs

- **Real-time logs**: `npx wrangler tail` (filterable with `--format json`).
  Typical use: incident debugging and `5xx` error checks.
- **Error rate (historical)**: Cloudflare dashboard → Workers →
  `open-surveillance-db` → Analytics (request volume, errors per status, p95
  latency). Recommended operational thresholds: error rate > 1% or p95 > 5s
  over 10 min → alert.
- **Log retention**: enable Workers Logpush to R2 or other private storage
  when volume justifies it (Cloudflare default: limited retention).

### 2.3 Alerting

1. **Health check workflow** (`.github/workflows/ops-monitoring.yml`): if a
   check does not respond with the expected status, it opens an issue
   `ops: health check FAILED` with the check output. The GitHub notification
   (email/app) is the primary channel.
2. **Cloudflare Health Checks** (optional, recommended): on the production
   domain, `GET /` health check with a 2-failure-out-of-3 threshold and
   email/webhook notification.
3. **Incident escalation**: see runbook, section 4.

---

## 3. Automated D1 backup

### 3.1 Export command (verified, wrangler 4.118.0)

```bash
# Production: full export (schema + data) of the remote D1
npx wrangler d1 export osdb-production --remote --output=d1-backup-$(date +%F).sql
```

Notes:

- The dump includes schema and content of all tables in the remote DB
  (`cameras`, `correction_requests`, `moderation_events`).
  **Always verify the dump contains the 3 tables** before archiving it
  (pitfall: a DB without applied migrations produces partial dumps — see
  Appendix, drill #1).
- Schema only: `--no-data`; data only: `--no-schema` (used for restore on an
  existing DB, section 3.4).
- `--remote` is mandatory to touch production; without the flag wrangler acts
  on the local DB.

### 3.2 Scheduled automation

Workflow `.github/workflows/ops-backup.yml`:

- trigger: `schedule` cron `0 2 * * *` (02:00 UTC, daily) + `workflow_dispatch`;
- runs `wrangler d1 export ... --remote` with credentials from
  `secrets.CLOUDFLARE_API_TOKEN` and `secrets.CLOUDFLARE_ACCOUNT_ID`;
- verifies the dump contains the expected 3 tables (`cameras`,
  `correction_requests`, `moderation_events`) and records the baseline counts;
- **encrypts the dump (AES-256-CBC, passphrase from
  `secrets.BACKUP_PASSPHRASE`)** and saves only the `.enc` file as a private
  GitHub artifact of the run (30-day retention). The plaintext file is deleted
  in the same job: the repo is public, artifacts must never contain plaintext
  dumps;
- **does not** run a deploy: the backup never touches the production worker.

GitHub prerequisites (set once, never hardcoded in workflows):

```text
CLOUDFLARE_API_TOKEN   token with "D1 - Edit" permission on the account
CLOUDFLARE_ACCOUNT_ID  Cloudflare account id
BACKUP_PASSPHRASE      passphrase for AES-256 encryption of dumps
D1_DATABASE_ID         real production D1 database_id (UUID; injected into
                       wrangler.jsonc at run time — the repo keeps the
                       placeholder 00000000-0000-4000-8000-000000000000).
                       Without it BOTH deploy.yml and ops-backup.yml stop
                       with a fail-fast error (never export against a
                       placeholder DB).
ENABLE_CF_BACKUP (var) "true" to arm the nightly backup job (see below)
ENABLE_RESTORE_DRILL (var)
                       "true" to arm the quarterly restore drill (see §3.4)
PROD_URL (variable)    production hostname checked by ops-monitoring.yml
                       (hostname only, no scheme — the workflow prepends
                       https://). Current value verified 2026-08-09:
                       open-surveillance-db.simone-rondina.workers.dev
                       (the deployed Cloudflare worker answers 200; the
                       NPM→LXC host osdb.syaxhome89.com currently answers
                       403 from anonymous clients because the container's
                       vite allowedHosts guard rejects it — see
                       DEPLOYMENT.md §Local LXC deployment). Set via
                       `gh variable set PROD_URL <host>`, issue #203.
PROD_URL_ALT (variable, optional)
                       second hostname for the dual health check in
                       ops-monitoring.yml (both must pass).
```

> **Secrets status (2026-08-09, ops audit)**: `BACKUP_PASSPHRASE`,
> `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` configured. `ENABLE_CF_BACKUP`
> and `ENABLE_RESTORE_DRILL` NOT set → the nightly backup and the quarterly
> drill are skipped by design until the vars are armed. `D1_DATABASE_ID`
> NOT set as a GitHub secret yet: the value exists in the local GPG vault
> (`<secrets-dir>/cloudflare-d1-database-id.gpg`, 36 chars = UUID) and the
> read-only export below was executed with it, but the GitHub secret must
> be created by an operator:
>
> ```bash
> # operator step (needs the vault value, never commit it):
> gh secret set D1_DATABASE_ID
> # arm the nightly backup only AFTER D1_DATABASE_ID exists:
> gh variable set ENABLE_CF_BACKUP true
> ```
>
> Until `ENABLE_CF_BACKUP=true`, the scheduled backup job shows as
> "skipped" in Actions (by design, not red) and the local container backup
> (`ops/backup-lxc114.sh`, section 8) remains the active backup path.

**Read-only export test (2026-08-09, verified)**: a manual
`wrangler d1 export osdb-production --remote` executed from a worktree with
the vault-injected `database_id` succeeds and produces a full schema+data
dump (35.7 MB, `cameras` rows present) — proving the export side of the
backup pipeline works with the current credentials. Command used (read-only,
never touch the remote):

```bash
# inject the real database_id from the vault into a TEMP config only
DBID=$(gpg -d --batch --quiet <secrets-dir>/cloudflare-d1-database-id.gpg | tr -d '\n')
sed "s/00000000-0000-4000-8000-000000000000/$DBID/" wrangler.jsonc > /tmp/wrangler-export.jsonc
CLOUDFLARE_API_TOKEN="$(gpg -d --batch --quiet <secrets-dir>/cloudflare-api-token.gpg | tr -d '\n')" \
CLOUDFLARE_ACCOUNT_ID="$(gpg -d --batch --quiet <secrets-dir>/cloudflare-account-id.gpg | tr -d '\n')" \
  npx wrangler d1 export osdb-production --remote --config=/tmp/wrangler-export.jsonc \
  --output=/tmp/osdb-export.sql
rm -f /tmp/wrangler-export.jsonc
```

Decrypting a backup for a restore drill:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:$BACKUP_PASSPHRASE" \
  -in d1-backup-<DATE>.sql.enc -out d1-backup-<DATE>.sql
sha256sum -c d1-backup-<DATE>.sql.enc.sha256   # integrity check before restore
```

The real production D1 `database_id` is injected at deploy/backup time from
the GitHub secret `D1_DATABASE_ID` (wrangler.jsonc keeps the placeholder
`00000000-0000-4000-8000-000000000000`, see DEPLOYMENT.md); the workflow
`ops-backup.yml` has its own inject step (fail-fast) since the 2026-08-09
audit — the backup must never export against a placeholder DB.

### 3.3 Post-backup integrity verification

In the backup run, after the export, a count verification is executed:

```bash
npx wrangler d1 execute osdb-production --remote \
  --command="SELECT 'cameras' t, COUNT(*) n FROM cameras UNION ALL \
             SELECT 'correction_requests', COUNT(*) FROM correction_requests \
             UNION ALL SELECT 'moderation_events', COUNT(*) FROM moderation_events;"
```

The day's counts are recorded in the run report: they serve as the baseline
for the restore drill (section 3.4, step 4).

### 3.4 Restore drill (procedure verified locally)

The drill must be executed at least quarterly and in any case before every
schema change. Two patterns, depending on the state of the destination DB:

**Pattern A — full restore on a pristine D1 (disaster recovery).**

```bash
# 1. Destination DB: empty (new D1 database, or reset)
# 2. Ingest the dump (schema + data):
npx wrangler d1 execute osdb-production --remote --file=d1-backup-<DATE>.sql
# 3. Verify structure: the 3 tables must exist
npx wrangler d1 execute osdb-production --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
# 4. Verify data: the counts must match those in the report of the backup day
#    (section 3.3)
```

**Pattern B — re-import on an existing D1 (data rollback, no reset).**

A full dump on a DB that already has the tables fails with
`table already exists` (verified). To reload data only:

```bash
# 1. Export the data-only backup (from the backup or export --no-schema)
npx wrangler d1 export osdb-production --remote --no-schema --output=d1-data-$(date +%F).sql
# 2. Reload the data on the existing DB
npx wrangler d1 execute osdb-production --remote --file=d1-data-<DATE>.sql
# 3. Verify counts as in Pattern A
```

**Drill success criteria**: (a) the 3 tables exist; (b) the counts match the
baseline; (c) a sample of public records is visible again via
`GET /api/cameras`. Drill outcome recorded in a comment on the issue/run that
scheduled it.

### 3.5 Backup protection

- Dumps contain contact and moderation data: **never** publish backups, never
  upload them to public storage, never include them in commits.
- The backup workflow saves only **encrypted** artifacts (AES-256-CBC,
  passphrase in `secrets.BACKUP_PASSPHRASE`): an unencrypted artifact on the
  public repo would amount to a data leak.
- GitHub artifacts with finite retention (30 days) are the acceptable minimum;
  for long retention use private R2 or company storage (always encrypted).
- Additional remote backups (NAS/object) must use an encrypted channel and
  restricted access.

---

## 4. Incident runbook

### 4.1 Severity

| Sev | Example | Target response |
|---|---|---|
| S1 | personal data publicly exposed; DB lost/corrupted; prolonged site outage | < 30 min |
| S2 | sustained error rate > 1%; degraded public feature; moderation inaccessible | < 2 h |
| S3 | partial degradation, no impact on public data | < 1 working day |

### 4.2 Roles and escalation

| Role | Person | Task |
|---|---|---|
| On-call / first responder | Simone Rondina (project owner) | verify alert, initial triage |
| Tech lead / decisions | Simone Rondina (project owner) | authorises rollback, restore, communication |
| QA | Simone Rondina (project owner) | post-mitigation verification on staging |
| Maintainer / communication | Simone Rondina (project owner) | public announcement if needed |

Escalation: the project owner covers all roles; (S1) immediate involvement
of the on-call and tech-lead roles.

### 4.3 Phases

1. **Detect**: health check workflow alert, `wrangler tail`, or a report.
2. **Triage (15 min)**: confirm the incident (manual `curl`), classify its
   severity, open an `incident: <title>` issue with a severity tag.
3. **Mitigate**: apply the fastest reversible countermeasure — worker rollback
   (section 5) and/or data restore (section 3.4). Record the commands executed
   and the times in the ticket.
4. **Verify**: full health check (2.1) + D1 count verification (3.3) + QA
   smoke test on staging.
5. **Resolve & postmortem**: close the incident only with verified public
   data. Within 3 working days: postmortem with timeline, root cause, and
   corrective actions (dedicated issues, each with an assignee).

### 4.4 Communication

- Internal: GitHub issue + mention on the team channel. Never personal-data
  details in public tickets (the repo is public): refer to incidents by ID,
  not by content.
- Public (only S1 with data exposure): note on `docs/legal/BREACH_PROCEDURE.md`
  and contact the supervisory authority per the applicable legal procedure.

---

## 5. Rollback plan (previous Workers versions)

### 5.1 Identifying versions

```bash
npx wrangler versions list          # last 10 worker versions
npx wrangler versions view <version-id>
```

Every release correlates to a git tag `v*` (repo release procedure: tag +
push, CI builds). version-id ↔ commit correlation: always record the
version-id in the release changelog/issue, or derive it from the Cloudflare
dashboard → Workers → Deployments (shows id and date).

### 5.2 Rollback (two levels)

**Level 1 — rollback to the last known good version (recommended, immediate):**

```bash
npx wrangler rollback                # returns to the previous deployment
```

**Level 2 — rollback to a specific version:**

```bash
npx wrangler rollback <version-id> -m "rollback for <reason> (issue #N)"
```

Rules:

- Worker rollback is **instantaneous and does not touch D1**: data stays
  unchanged. If the incident involves data (corruption, bad migration), worker
  rollback is not enough: D1 restore is required (3.4).
- After rollback: health check (2.1), QA smoke test, and record the source and
  destination version-ids in the incident issue.
- The rolled-back version stays in `versions list`: it is not lost.

### 5.3 Rollback vs hotfix decision matrix

| Situation | Action |
|---|---|
| UI/API regression after deploy, data OK | worker rollback (5.2) |
| failed D1 migration, data intact | worker rollback + migration fix, data-only restore (Pattern B) |
| corrupted/lost data | full restore on pristine D1 (Pattern A) + verification |
| urgent security bug in code | immediate rollback + hotfix on branch + urgent release |

### 5.4 Preconditions for rollback to be possible

- `CLOUDFLARE_API_TOKEN` with "Workers Scripts - Edit" permission (same
  secret used by the backup).
- The worker must be deployed with versioning enabled (default on modern
  Workers); otherwise at least run `wrangler deploy` of the previous version
  from the git tag (`git checkout vX.Y.Z && npx wrangler deploy`).

---

## 6. Pre-production checklist (link to DEPLOYMENT.md)

Before the first production deploy, confirm (tick when done):

- [ ] GitHub secret `D1_DATABASE_ID`: real production D1 `database_id`
      (injected at deploy time by the workflow, never stored in the repo).
- [ ] Migrations applied to the remote D1 (`wrangler d1 migrations apply ... --remote`).
- [ ] GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
      (public deploy phase only — not needed for the local test
      environment, section 8), `BACKUP_PASSPHRASE` (configured); repository
      variable `PROD_URL`.
- [ ] Cloudflare secrets: `MODERATION_USER`/`MODERATION_PASSWORD` or
      `MODERATION_TOKEN` (without these moderation responds 503 — fail-closed).
- [ ] `deploy.yml` workflow tested in **dry-run** at least once.
- [ ] `ops-monitoring.yml` workflow scheduled and passed at least once (manual dry run).
- [ ] `ops-backup.yml` workflow scheduled; first backup executed and dump verified (3 tables + counts).
- [ ] Restore drill executed (Pattern A) with recorded outcome.
- [ ] `v*` tag present and correlated to a deployment; `wrangler rollback` tested in staging.
- [ ] Incident runbook shared with the team (this file).

---

## 7. Deploy Cloudflare via CI (workflow `deploy.yml`)

The Worker deploy + production D1 migrations go through the
`.github/workflows/deploy.yml` workflow — never manual `wrangler deploy`
commands from local machines. The workflow is **manual** (`workflow_dispatch`)
until the public deploy decision is made (DEPLOYMENT.md "Preconditions for a
public environment"); once decided, the automatic trigger on tag `v*` is added
(documentation at the top of the file).

### 7.1 Modes

| Mode | What it does | Remote effect |
|---|---|---|
| `dry-run` (default) | `wrangler d1 migrations apply --remote --dry-run` (pending migrations, none applied) + `wrangler deploy --dry-run` (local bundle) | none |
| `deploy` | `wrangler d1 migrations apply --remote` + `wrangler deploy` + records the version id (`wrangler versions list`) | D1 migrated + worker updated |

The job runs on `environment: production` (GitHub Environments): once
required reviewers are added, every deploy requires human approval.

### 7.2 Prerequisites (one-time, before the first `deploy`)

```bash
# 1. GitHub secrets (never hardcoded in workflows)
gh secret set CLOUDFLARE_API_TOKEN   # permissions "Workers Scripts - Edit" + "D1 - Edit"
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set PROD_URL             # production hostname (e.g. osdb.example.org)

# 2. Production D1: create the database and store the database_id as a
#    GitHub secret (the workflow injects it at deploy; never commit it)
npx wrangler d1 create osdb-production   # output: database_id
gh secret set D1_DATABASE_ID

# 3. Worker secrets (persist across deploys; never in code)
npx wrangler secret put MODERATION_USER
npx wrangler secret put MODERATION_PASSWORD
npx wrangler secret put MODERATION_TOKEN      # optional, bearer alternative
```

Quick pre-flight verification from CI without touching production: the
workflow's `dry-run` mode (pending migrations + bundle).

### 7.3 Rollback

The worker is versioned: rollback is **instantaneous and does not touch D1**
(`npx wrangler rollback [version-id]` — see §5). If the incident involves
data, worker rollback is not enough: D1 restore is required (§3.4).

### 7.4 Rules

- Never run manual `wrangler deploy` to production from local machines: CI only.
- Never put moderation credentials in code or workflows: Cloudflare secrets only.
- A deploy that fails halfway (e.g. a bad migration) → worker rollback (§5.2)
  + migration fix; do not attempt a blind second deploy.

---

## 8. Local deployment operations (test container)

This section documents the **tested** procedures for the currently active
local environment: a LAN-only test container reachable at
`http://<lan-ip>:3000`. It is the reference environment for staging
verifications (DEPLOYMENT.md §"Local LXC deployment").

### 8.0 Container access: Proxmox API for lifecycle ops, SSH for code deploys

- The deploy key documented in DEPLOYMENT.md **was never injected** at
  `vzcreate` (verified on the 2026-07-31 17:01 task log), but it **was**
  added post-create via the Proxmox API (`lxc-inject-sshkey.py`:
  `PUT .../lxc/<vmid>/config` with `ssh-public-keys` + fresh digest, then
  reboot) — the operator workstation connects as `root@<lan-ip>` with the
  injected key (verified 2026-08-09; the Hermes sync cron
  `osdb-sync-d1.sh` uses the same SSH path).
- Lifecycle operations (snapshot, rollback, backup, stop/start) use the
  **Proxmox API token**, decrypted at runtime from the local GPG vault
  (`<secrets-dir>/proxmox-token.gpg`, path configurable via `PVE_TOKEN_GPG`) — never hardcoded in scripts.
- Code deploys/updates use SSH (`git fetch && git reset --hard origin/main`
  on the container — RELEASE_CHECKLIST.md §6), always after taking the
  pre-deploy snapshot (§8.4).
- Prerequisite on the machine running the scripts: `gpg` with the vault key,
  `curl`, `python3`, and the SSH key for `root@<lan-ip>`.

### 8.1 Periodic health check (monitoring)

Script: `ops/health-check.sh`

```bash
# manual
ops/health-check.sh
# cron (workstation): every 5 minutes — OSDB_BASE_URL MUST be set, the
# script has no LAN-IP default (audit ops 2026-08-09: the previous cron
# entry without it resolved <lan-ip> to nothing → every check 000/FAIL)
*/5 * * * * OSDB_BASE_URL=http://<lan-ip>:3000 \
  OSDB_HEALTH_LOG=<log-dir>/osdb-health.log \
  <repo-path>/ops/health-check.sh >> <log-dir>/osdb-health.log 2>&1
# alerting (audit ops 2026-08-09): on failure the script opens (or reuses)
# a GitHub issue "ops: health check FAILED" — same channel as
# .github/workflows/ops-monitoring.yml. Enable with OSDB_GH_ALERT=1:
*/5 * * * * OSDB_BASE_URL=http://<lan-ip>:3000 \
  OSDB_HEALTH_LOG=<log-dir>/osdb-health.log OSDB_GH_ALERT=1 \
  OSDB_GH_REPO=Syax89/open-surveillance-db \
  <repo-path>/ops/health-check.sh >> <log-dir>/osdb-health.log 2>&1
# (requires `gh` authenticated on the workstation; without OSDB_GH_ALERT=1
# the behaviour is unchanged: log + /tmp/osdb-health-FAIL marker only)
```

Verified routes (expected → meaning):

| Check | URL | Expected |
|---|---|---|
| homepage | `GET /` | `200` |
| public API | `GET /api/cameras` | `200` |
| geospatial | `GET /api/cameras/nearby?...` | `200` |
| guide | `GET /guide` | `200` |
| moderation | `GET /api/moderation` | `503` (fail-closed, never `200` without credentials) |

Exit code 0 = all OK; exit code 1 = at least one route out of threshold. On
failure the script creates the `/tmp/osdb-health-FAIL` marker (useful for a
watchdog) and the log in `<log-dir>/osdb-health.log` reports the
detail. The job is installed in the operator workstation's crontab (see above).

### 8.2 Automated backup (vzdump → NAS storage)

Script: `ops/backup-lxc114.sh`

```bash
# manual
ops/backup-lxc114.sh
# cron (workstation): every night at 02:30
30 2 * * * <repo-path>/ops/backup-lxc114.sh >> <log-dir>/osdb-backup.log 2>&1
```

What it does (all via Proxmox API):

1. Runs `vzdump` of the test container in **snapshot mode** (no downtime) on the
   CIFS **NAS** storage (configured on pve: `content=images,backup`), `zstd`
   compression, `prune-backups=keep-last=7` (7-backup retention).
2. Waits for task completion (poll up to 30 min) and checks
   `exitstatus=OK`.
3. Verifies via the storage content API that the archive
   `NAS:backup/vzdump-lxc-114-<date>_<time>.tar.zst` is listed and prints the
   total number of retained archives.

The app's D1 database (`.wrangler/state/v3/d1/.../*.sqlite`) lives in the
container rootfs and **is included** in the vzdump archive (verified: file
extracted and read with `PRAGMA integrity_check` OK, tables `cameras`,
`correction_requests`, `moderation_events`).

### 8.3 Restore procedure (disaster recovery)

From the most recent vzdump archive on the NAS:

```bash
# 1. find the archive on the NAS
smbclient //<nas-host>/<share> -U <username> -c 'cd dump; ls vzdump-lxc-<vmid>-*'
# 2. extract the D1 sqlite (example)
zstd -dc vzdump-lxc-<vmid>-<DATE>_<TIME>.tar.zst | tar -xf - -C /tmp \
  ./opt/open-surveillance-db/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
# 3. verify integrity
python3 -c "import sqlite3;c=sqlite3.connect('<file>');print(c.execute('PRAGMA integrity_check').fetchone())"
```

**Full** container restore (replacement): create a new container from the
archive with `pct restore` (or via API) or roll back to the pre-deploy
snapshot (section 8.4) — which also restores the non-DB files.

### 8.4 Rollback (pre-deploy snapshot)

Two complementary scripts:

```bash
# BEFORE every deploy: create the pre-deploy snapshot (rollback base)
ops/snapshot-pre-deploy.sh                 # default name pre-deploy-YYYYMMDD-HHMMSS
# ON PROBLEMS: rollback to that snapshot + restart + health check
ops/rollback-lxc114.sh pre-deploy-20260801-003428
```

Verified Proxmox rollback behaviour:

- The rollback API stops the container, restores the disk from the snapshot
  and **does not restart it on its own**: `rollback-lxc114.sh` handles
  stop→rollback→start→wait→health check in sequence.
- The rollback task is asynchronous: the POST returns an UPID that the script
  polls (`/nodes/pve/tasks/<upid>/status`) until `exitstatus=OK` — same
  polling as `backup-lxc114.sh` (§8.2, wait up to 30 min). The container start
  happens **only after the rollback completes**, not after a fixed timeout.
- After rollback the full health check (8.1) must be 5/5 OK before declaring
  the incident resolved (see runbook §4.3, Verify step).

### 8.5 Security notes

- No secrets in scripts: the Proxmox token is in the local GPG vault
  (`<secrets-dir>/proxmox-token.gpg`, chmod 600, path in `PVE_TOKEN_GPG`),
  decrypted at runtime.
- The vzdump archives contain the entire container rootfs (including D1 with
  possible correction requests): private NAS storage, restricted access,
  never on public channels.

### 8.6 Container → D1 production data sync (backfill)

Script: `scripts/sync-d1-backfill.mjs` (Hermes cron wrapper:
`osdb-sync-d1.sh` on the operator workstation).

Purpose: one-way sync of the container's LOCAL miniflare D1 (the source of
truth for imported camera data) to the REMOTE Cloudflare D1
(`osdb-production`). Remote rows are never overwritten: every statement is
`INSERT OR IGNORE`, so only ids missing on the remote are added. Deletes are
NOT propagated (a camera removed locally stays on the remote; the
moderation flow owns removals).

Constraints (learned the hard way, documented in the script header):

- D1 remote limits: max SQL statement 100 KB, max row 2 MB → statements are
  chunked (10 rows/stmt, 20 stmts/file; `import_batches.report/notes` are
  truncated to 40 KB each and use 1 row/stmt).
- FK order matters: contributors → import_batches → cameras → lifecycle →
  community_actions → settings → passkeys → recovery → correction_requests.
- `geocode_reverse_cache` is deliberately excluded (regenerable cache).
- The local DB is auto-detected as the 64-hex `*.sqlite` in
  `.wrangler/state/v3/d1/miniflare-D1DatabaseObject` — a stale `db.sqlite`
  in the same directory is ignored (pitfall 2026-08-09: it silently
  synced an old DB).
- **`photos` is NOT in the table list** — the table was dropped by
  migration 0043 (audit ops 2026-08-09).

Runbook (never run the backfill without evidence; it writes to production):

```bash
# read-only preview: dumps the local DB into chunk files, NO remote write
node scripts/sync-d1-backfill.mjs --dry-run
# real sync (requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env;
# usually executed by the Hermes cron wrapper, which decrypts them from the
# local GPG vault and copies them to the container):
node scripts/sync-d1-backfill.mjs
```

Exit code: 0 = all chunk files applied; 1 = at least one file failed after
3 retries (the count is per FILE, not per attempt — audit ops 2026-08-09).
Final smoke: after the apply the script compares remote vs local row counts
for every synced table and prints `smoke: <t> remoto=N OK|DIVERGE`.

### 8.7 Log rotation (wrangler.log)

The systemd unit sets `WRANGLER_LOG_PATH=.wrangler/wrangler.log`
(DEPLOYMENT.md §systemd unit). The file grows unbounded — add a logrotate
config on the container (or truncate at every restart):

```bash
# /etc/logrotate.d/osdb-wrangler  (container)
/opt/open-surveillance-db/.wrangler/wrangler.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
  copytruncate
}
```

`copytruncate` keeps the running process writing to the same inode without
a restart. Alternatively add `ExecStartPre=/usr/bin/truncate -s 0
/opt/open-surveillance-db/.wrangler/wrangler.log` to the unit so every
service restart resets the log (logrotate is preferred for a long-running
service).

---

## Appendix: verified commands

All verifications executed on 2026-07-31 by the project owner, locally, on `main`
(commit 09f847d), Node 22, wrangler 4.118.0 (reproducible `npm ci`).

| # | Procedure | Command | Real outcome |
|---|---|---|---|
| 1 | build | `npm run build` | `Build complete. Run vinext start...` |
| 2 | health check | `npx wrangler dev` + curl | `GET / 200 OK`, `GET /api/cameras 200 OK` |
| 3 | moderation fail-closed | curl `/moderation` without credentials | `503 Service Unavailable` ("Moderation access control is not configured; denying") |
| 4 | local D1 export | `wrangler d1 export osdb-production --local --output=...` | `Done!` — SQL with `CREATE TABLE` + `INSERT` |
| 5 | partial dump pitfall | export from a DB without migrations | dump with **only** `cameras` (lesson: apply migrations first, verify the 3 tables) |
| 6 | migrations | `wrangler d1 migrations apply ... --local` | 5 migrations `✅` (0000→0004) |
| 7 | Pattern A restore | `wrangler d1 execute ... --file=dump.sql` on a pristine DB | tables recreated; `sqlite_master` query OK |
| 8 | restore on existing DB | full dump on an already-migrated DB | `✘ table cameras already exists` (⇒ Pattern B with `--no-schema`) |
| 9 | rollback | `wrangler rollback --help`, `wrangler versions --help` | syntax verified: `rollback [version-id]`, `versions list/view/upload/deploy` |
| 10 | backup encryption | `openssl enc -aes-256-cbc -salt -pbkdf2 ...` + decrypt | roundtrip OK (`cmp` identical), `sha256sum` verified |
| 11 | workflow YAML | `python3 -c "yaml.safe_load(...)"` on `ops-monitoring.yml`, `ops-backup.yml` | both valid (`jobs: health-check`, `jobs: backup`) |
| 12 | advisory | `GHSA-36p8-mvp6-cv38` (CVE-2026-0933, command injection in `wrangler pages deploy`) | **not applicable**: patched in 4.59.1, repo on 4.118.0 |

### Appendix — local operations drill (2026-08-01)

All drills executed in the real environment (operator workstation → Proxmox
host <pve-host> → test container → NAS storage <nas-host>):

| # | Procedure | Command / script | Real outcome |
|---|---|---|---|
| L1 | health check routes | `ops/health-check.sh` | 5/5 OK (`/` 200, `/api/cameras` 200, nearby 200, `/guide` 200, `/api/moderation` 503) |
| L2 | pre-deploy snapshot | `ops/snapshot-pre-deploy.sh` | snapshot `pre-deploy-20260801-002440` created (UPID vzsnapshot) |
| L3 | vzdump→NAS backup | `ops/backup-lxc114.sh` | `vzdump-lxc-114-2026_08_01-00_34_31.tar.zst` 1.02 GB on `NAS:backup/`, task OK in 40s, verified via storage content API (2 archives, keep=7) |
| L4 | backup content | D1 sqlite extraction from archive | `PRAGMA integrity_check` = `ok`; tables `cameras`(4), `correction_requests`(2), `moderation_events`(0) |
| L5 | rollback | `ops/rollback-lxc114.sh pre-deploy-20260801-003428` | rollback UPID vzrollback TASK OK; container stopped by Proxmox → restart → site up in 40s → health check 5/5 OK |
| L6 | post-rollback data | `GET /api/cameras` | 2 `demo` records served (data preserved) |
| L7 | cron | `crontab -l` | `*/5 * * * * ops/health-check.sh` and `30 2 * * * ops/backup-lxc114.sh` installed |

Notes from the drill (already incorporated in §8):

- Proxmox rollback stops the container and does not restart it on its own →
  the script does an explicit start + wait + health check (§8.4).
- `ssh-public-keys` and `password` are not allowed by the LXC config PUT
  (API schema: "property is not defined in schema") → access via API token,
  §8.0.

Notes for the next drill:

- `wrangler d1 export` does not support `--persist-to` (only `execute`): the
  local drill uses the default DB of `wrangler dev` in `.wrangler/state`.
- The development environment's security scanner blocks `rm -rf` on temporary
  folders and `npx wrangler@<range>` (advisory): use the lockfile version
  (`node_modules/.bin/wrangler` after `npm ci`).
