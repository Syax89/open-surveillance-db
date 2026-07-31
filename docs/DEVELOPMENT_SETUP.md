# Development setup: clean local environment, migrations, fixtures, reset

This guide explains how to bring up a **clean local environment** from
scratch, how the local database gets its schema and data, and how to reset it
safely. It is written for contributors who want to reproduce the prototype on
their own machine.

Everything below was verified on 2026-07-31 against `main`
(`236dd6a`), with Node `22.22.3`, npm `10.9.8`, and the wrangler version
pinned in `package-lock.json` (4.118.x). The local environment never touches
the Cloudflare remote: every command below operates on the project-local
state unless it explicitly says `--remote`.

> Scope note: the roadmap item "run schema migrations from a fresh local
> database rather than relying on runtime demo setup alone" is tracked
> separately as an implementation task; this document describes how to do
> that today with the commands that already exist.

## 1. Prerequisites

- Node.js `>= 22.13.0` (enforced by `engines` in `package.json`) and a recent npm.
- git.
- No Cloudflare account or API token is needed for local development.

## 2. Clean local setup

From a fresh clone:

```bash
git clone https://github.com/Syax89/open-surveillance-db.git
cd open-surveillance-db
npm ci          # reproducible install from package-lock.json (Node >= 22.13)
npm run dev     # vinext dev: Vite + workerd, serves on http://localhost:3000
```

Open `http://localhost:3000`. The application creates its own local database
on first request and seeds **two clearly labelled demo records** when the
`cameras` table is empty (see [Synthetic fixtures](#5-synthetic-fixtures)).

`npm ci` is preferred over `npm install` because it installs exactly what
`package-lock.json` pins. `npm install` also works if you are not worried
about reproducibility.

### 2.1 Verify the setup

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/         # 200
curl -s http://localhost:3000/api/cameras                               # 200, only demo records
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/guide    # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/moderation # 503 (fail-closed, no credentials)
```

The moderation route intentionally answers `503 Moderation is unavailable.`
without configured credentials; that is the fail-closed default, not a bug.

## 3. How the local database works

There are two complementary mechanisms.

### 3.1 Runtime bootstrap (automatic)

The data layer self-heals on first use (`db/cameras.ts` `getD1()` and the
`corrections`/`moderation` modules):

- `CREATE TABLE IF NOT EXISTS` for `cameras`, `correction_requests`, and
  `moderation_events`;
- a `PRAGMA table_info(cameras)` check that adds missing metadata columns
  (`manufacturer`, `observed_on`, `publish_manufacturer`,
  `publish_observed_on`) with `ALTER TABLE`;
- `CREATE INDEX IF NOT EXISTS` for the status lookups;
- a seed of two demo records when `cameras` is empty.

This is why `npm run dev` alone is sufficient on a brand-new machine.

### 3.2 Drizzle migrations (explicit, versioned)

`drizzle/` contains the versioned schema changes generated with
`npm run db:generate` (drizzle-kit):

| Migration | Content |
| --- | --- |
| `0000_eminent_vision.sql` | `cameras` table |
| `0001_low_queen_noir.sql` | `correction_requests` table |
| `0002_confused_human_torch.sql` | `moderation_events` table |
| `0003_camera_evidence_metadata.sql` | `cameras.manufacturer`, `cameras.observed_on` |
| `0004_camera_metadata_publication_consent.sql` | `cameras.publish_manufacturer`, `cameras.publish_observed_on` |

The `wrangler.jsonc` `d1_databases` entry points `migrations_dir` at
`drizzle`, so wrangler applies them in filename order and records what ran in
a `d1_migrations` table.

## 4. Running migrations on a fresh local database

On a truly fresh local state (right after `npm ci`, before the dev server has
created anything), apply the migrations first, then start the app:

```bash
npx wrangler d1 migrations apply opensurveillancedb --local   # press Enter to confirm
npm run dev
```

Verified result on a fresh state: all five migrations apply (`✅`), producing
the three tables plus the `d1_migrations` bookkeeping table. The app then
seeds the two demo records on top of the migrated schema. (Wrangler asks
"About to apply 5 migration(s) ... continue?" before executing; confirm with
Enter.)

Local D1 state lives under the project's `.wrangler/` directory (gitignored);
the actual SQLite files are under
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`.

> **Pitfall — order matters.** If the dev server has already run against the
> local state, the runtime bootstrap has created the tables, and
> `wrangler d1 migrations apply --local` then fails with
> `✘ [ERROR] table \`cameras\` already exists ... SQLITE_ERROR` (verified).
> Migrations are meant to be applied to a **fresh** database. For a database
> that was bootstrapped at runtime, do not re-apply migrations; use the reset
> procedure in [section 6](#6-reset) and start over, or keep using runtime
> bootstrap.

For the remote Cloudflare D1 database the same command targets the remote:

```bash
npx wrangler d1 migrations apply opensurveillancedb --remote
```

(Requires Cloudflare credentials and a real `database_id`; see
`docs/DEPLOYMENT.md`.)

## 5. Synthetic fixtures

The repository deliberately contains **no real camera data**. Synthetic data
exists in two places.

### 5.1 Demo records (runtime seed)

Two clearly labelled fictional pins are seeded whenever the local `cameras`
table is empty (`db/cameras.ts`, `seedRecords`):

| id | Title | Kind | Latitude | Longitude | Status | Source | `updated` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Illustrative record A | Fixed dome | 41.9004 | 12.4936 | `demo` | `Prototype seed` | `Demo data` |
| 2 | Illustrative record B | Traffic monitoring | 41.9047 | 12.5031 | `demo` | `Prototype seed` | `Demo data` |

Their `description` fields state explicitly that they are not claims about
real cameras. Because the public read boundary whitelists `verified` and
`demo` statuses (`db/cameras.ts` `listPublicCameras`), the demo records appear
on the map, directory, `/api/cameras`, CSV/GeoJSON exports, and nearby
search. They are safe to use for manual interface checks and for the
[local playbook](LOCAL_PLAYBOOK.md).

### 5.2 Test fixtures (in-memory mocks)

`tests/helpers/` contains the test harness:

- `mock-state.mjs` — shared mutable state for the mocked `db` modules;
- `mocks/` — per-module mocks (`cameras`, `corrections`, `moderation`,
  `cloudflare-workers`) that the test suite imports instead of the real data
  layer.

These are **not database rows**: they exist only inside the test process.
Real DB fixtures are only the two demo records above.

## 6. Reset

Local state can include submitted fictional reports and their audit history.
Treat it as data even in a prototype. The reset below is **non-destructive**
by design: nothing is deleted, the local database is moved aside so the next
start recreates it from scratch.

```bash
# 1. Stop the development server (Ctrl+C in the `npm run dev` terminal).

# 2. Move the project-local runtime state aside, with a unique dated name.
mv .wrangler/state .wrangler/state.bak-$(date +%F-%H%M%S)

# 3. Start again. The app creates a fresh local database and re-seeds it.
npm run dev

# 4. Verify that only the two labelled demo records exist.
curl -s http://localhost:3000/api/cameras
```

Use `%F-%H%M%S` (date + seconds) rather than a day-only date: if the backup
directory from an earlier reset the same day already exists, `mv` silently
nests the new state *inside* it (`.wrangler/state.bak-2026-07-31/state`)
instead of replacing it (verified). The unique name keeps every backup
sibling, not nested.

Verified: after this procedure the API returns exactly the two demo records
from [section 5.1](#51-demo-records-runtime-seed), with fresh ids, and no
submitted reports or audit history.

Alternatives and rules:

- **Fresh workspace copy** — the safest option when you want a completely
  clean exercise: clone the repository into a new directory and follow
  [section 2](#2-clean-local-setup).
- If you no longer need the backed-up state, delete the
  `.wrangler/state.bak-*` directory deliberately, as you would any other
  backup.
- **Never** run any reset procedure against a deployment, shared environment,
  or any data that may contain real reports (`docs/LOCAL_PLAYBOOK.md` states
  the same rule).
- `.wrangler/` is gitignored; local state is never committed.

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `✘ [ERROR] table 'cameras' already exists` when applying migrations | Migrations run against a state dir the app already bootstrapped | Reset first ([section 6](#6-reset)), then apply migrations on the fresh state, or skip migrations and rely on runtime bootstrap |
| `Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: ... Received protocol 'cloudflare:'` | `npm start` (`vinext start`, plain Node) cannot load the Workers-runtime `cloudflare:` module | Use `npm run dev` (`vinext dev`, runs in workerd). See `docs/DEPLOYMENT.md` § Local LXC deployment |
| `/moderation` and `/api/moderation` return 503 | Fail-closed default: no moderation credentials configured | Set `MODERATION_USER`/`MODERATION_PASSWORD` (Basic auth) or `MODERATION_TOKEN` (bearer) in the environment, then restart |
| Port 3000 already in use | Another instance is running | Stop it, or start with a different port (`npm run dev -- --port 3001`) |

## 8. Related documentation

- [Local playbook](LOCAL_PLAYBOOK.md) — fictional submit → moderate →
  public-result acceptance checks, and the cautious reset policy.
- [Data model and API](DATA_MODEL.md) — public record fields and status lifecycle.
- [Deployment and operations](DEPLOYMENT.md) — production build, container,
  Cloudflare Workers, and the LXC test host.
- [Operations manual](OPERATIONS.md) — backup/restore drills and verified
  wrangler commands (appendice).
- [Development plan](DEVELOPMENT_PLAN.md) and
  [Execution board](EXECUTION_BOARD.md) — workstreams and ownership.
