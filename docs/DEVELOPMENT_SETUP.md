# Development setup: clean local environment, migrations, fixtures, reset

This guide explains how to bring up a **clean local environment** from
scratch, how the local database gets its schema and data, and how to reset it
safely. It is written for contributors who want to reproduce the prototype on
their own machine.

Everything below was verified on 2026-08-02 against `main`
(`d59acca`), with Node `22.22.3`, npm `10.9.8`,
and the wrangler version pinned in `package-lock.json` (4.118.x). The
journal-mismatch symptoms in [section 7](#7-troubleshooting) were reproduced
in isolated local state directories, not on a shared database. The local
environment never touches the Cloudflare remote: every command below operates
on the project-local state unless it explicitly says `--remote`.

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
npm run db:migrate   # apply the Drizzle schema migrations (0000–0025)
npm run dev     # vinext dev: Vite + workerd, serves on http://localhost:3000
```

Open `http://localhost:3000`. The application reads the schema created by the
migrations and starts with an **empty** database — no demo rows are inserted
at runtime. If you want the two clearly labelled illustrative pins for manual
interface checks, run the optional demo seed once:

```bash
npm run db:seed
```

`npm ci` is preferred over `npm install` because it installs exactly what
`package-lock.json` pins. `npm install` also works if you are not worried
about reproducibility.

### 2.1 Verify the setup

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/         # 200
curl -s http://localhost:3000/api/cameras                               # 200, [] without db:seed
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/guide    # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/moderation # 503 (fail-closed, no credentials)
```

The moderation route intentionally answers `503 Moderation is unavailable.`
without configured credentials; that is the fail-closed default, not a bug.

### 2.2 Rate limiting in local development

The rate limiter (`app/lib/rate-limit.ts`) has two backends, selected per
route family at runtime:

- **Cloudflare Workers Rate Limiting binding** (`AUTH_LIMITER` /
  `WRITE_LIMITER` / `READ_LIMITER` / `TILES_LIMITER`, declared in
  `wrangler.jsonc` `ratelimits`) — the production backend for the four
  critical public families (auth, write, read, tiles; audit #3, MEDIUM).
- **In-memory sliding window** — the fallback, used whenever the binding is
  absent from `env`.

Local development and the test suite run **without** the bindings: `npm run
dev` and the route harness (`tests/helpers/api-harness.mjs`) do not inject
them, so the in-memory backend enforces the per-route limits exactly like
before (single-isolate scope — fine locally, never the public API). You can
verify this by lowering a knob, e.g. `AUTH_RATE_LIMIT_MAX=1` in `.dev.vars`
and hammering `/api/auth/login`: the second request from the same caller
answers `429` with `Retry-After`. The env knobs
(`*_RATE_LIMIT_MAX` / `*_RATE_LIMIT_WINDOW_SECONDS`) are the source of truth
for the in-memory backend; in production the four bound families are enforced
by the binding's `simple.limit` / `simple.period` in `wrangler.jsonc`
instead (see `docs/DEPLOYMENT.md`).

## 3. How the local database works

The schema comes exclusively from the versioned Drizzle migrations in
`drizzle/`. There is **no runtime bootstrap**: the database modules
(`db/cameras.ts`, `db/moderation.ts`, `db/corrections.ts`) are pure binding
passthroughs and never create tables, alter columns, or insert rows at
startup.

### 3.1 Drizzle migrations (explicit, versioned)

`drizzle/` contains the versioned schema changes generated with
`npm run db:generate` (drizzle-kit):

| Migration | Content |
| --- | --- |
| `0000_eminent_vision.sql` | `cameras` table + status index |
| `0001_low_queen_noir.sql` | `correction_requests` table + status index |
| `0002_confused_human_torch.sql` | `moderation_events` table + created-at index |
| `0003_camera_evidence_metadata.sql` | `cameras.manufacturer`, `cameras.observed_on` |
| `0004_camera_metadata_publication_consent.sql` | `cameras.publish_manufacturer`, `cameras.publish_observed_on` |
| `0005_freshness_state.sql` | freshness columns and backfill |
| `0006_flawless_thor_girl.sql` | `cameras.review_interval_months` |
| `0007_directory_freshness_backfill.sql` | one-time backfill: ISO `updated` timestamps for directory freshness filters |
| `0008_wave_b_reviewer_roles.sql` | reviewer roles, moderation queue, attributable audit events |
| `0009_contributor_auth.sql` | contributor accounts and sessions (ADR 0013) |
| `0010_auth_roles_appeals.sql` | auth roles, immutable audit trail, contributor appeals (ADR 0014) |
| `0011_photo_uploads.sql` | photo evidence metadata (image bytes in R2) |
| `0012_moderation_events_entity_idx.sql` | audit-trail lookup index |
| `0013_pending_photo_quota.sql` | per-caller pending-photo quota |
| `0014_cameras_coordinates_idx.sql` | coordinate lookup index for proximity searches |
| `0015_correction_camera_fk.sql` | `correction_requests.camera_id` → `cameras.id` FK |
| `0016_login_lockout.sql` | per-email login lockout |
| `0017_remove_demo_seed.sql` | remove demo identities before any public-alpha deployment (ADR 0009/0014) |
| `0018_moderation_events_entity_action_idx.sql` | retention sweep query index + R4 resolution-date anchor |
| `0019_cameras_composite_indexes.sql` | normalise `updated` + composite `(status, updated DESC)` indexes |
| `0020_camera_confirmations.sql` | `camera_confirmations` table (C1, ADR 0018) |
| `0021_camera_edit_requests.sql` | `camera_edit_requests` table (C1, ADR 0018) |
| `0022_correction_contributor.sql` | `correction_requests.contributor_id` (C1, ADR 0018) |
| `0023_cameras_contributor_status_idx.sql` | `(contributor_id, status)` index for trust levels (C1) |
| `0024_correction_dedupe_indexes.sql` | one-open-correction-per-(submitter, target) dedupe indexes (C4) |
| `0025_contributor_created_idx.sql` | `(contributor_id, created_at DESC)` indexes for the profile list (C2) |

The `wrangler.jsonc` `d1_databases` entry points `migrations_dir` at
`drizzle`, so wrangler applies them in filename order and records what ran in
a `d1_migrations` table.

#### Generating a new migration (`db:generate`)

When you change the schema in `db/schema.ts`, regenerate a migration instead
of editing an applied one. Migrations are append-only: the journal records the
name of every file that ran, so editing an applied file only desynchronizes
your local state from everyone else's.

```bash
# 1. edit db/schema.ts
npm run db:generate   # drizzle-kit diffs against the latest snapshot
npm run db:migrate    # apply the new migration to the local database
```

`npm run db:generate` runs `drizzle-kit generate` (config in
`drizzle.config.ts`: schema `./db/schema.ts`, output `./drizzle`). Expected
outcome: one new numbered file `drizzle/00NN_<name>.sql` describing only the
intended change, plus updates to `drizzle/meta/_journal.json` and the matching
snapshot. Review the generated SQL before committing: it should contain
exactly the schema change you made, nothing else. If `db:generate` produces
nothing or an unexpected diff, the journal/snapshots under `drizzle/meta/`
are out of sync — see [section 7](#7-troubleshooting).

## 4. Running migrations on a fresh local database

The four database commands, at a glance:

| Command | Purpose | Expected outcome |
| --- | --- | --- |
| `npm run db:generate` | Regenerate a migration after editing `db/schema.ts` | One new `drizzle/00NN_*.sql` (+ `drizzle/meta/` journal/snapshot update) with only your change |
| `npm run db:migrate` | Apply pending Drizzle migrations to the local D1 database | Full schema on a fresh state (26 files: 13 tables, 0 rows); no-op when everything is already applied |
| `npm run db:reset` | Start over non-destructively | `.wrangler/state` moved aside under a timestamped backup, then migrations applied to a fresh empty DB |
| `npm run db:seed` (optional) | Insert the two labelled demo pins | 2 fictional `demo` records, idempotent — safe to re-run |

On a truly fresh local state (right after `npm ci`), apply the migrations
first, then start the app:

```bash
npm run db:migrate
npm run dev
```

`npm run db:migrate` is a wrapper around
`wrangler d1 migrations apply osdb-production --local`. Wrangler asks
"About to apply N migration(s) ... continue?" before executing; confirm with
Enter. In a non-interactive shell (CI) wrangler auto-confirms (verified output:
`🤖 Using fallback value in non-interactive context: yes`).

Verified result on a fresh state: all 26 migration files apply (`✅`),
producing the 13 tables plus the `d1_migrations` bookkeeping table, and
**zero demo rows**. There is no "seed on empty table" path anywhere in the
runtime — see [section 5](#5-synthetic-fixtures).

Local D1 state lives under the project's `.wrangler/` directory (gitignored);
the actual SQLite files are under
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`.

> **Pitfall — order matters.** If you changed the local state with the dev
> server before migrating (or re-run migrations against an already-migrated
> database), `wrangler d1 migrations apply --local` reports the migrations as
> already applied, or fails with
> `✘ [ERROR] table `cameras` already exists ... SQLITE_ERROR` if the schema
> was created by other means. Migrations are meant to be applied to a
> **fresh** database. For a database in an inconsistent state, use the reset
> procedure in [section 6](#6-reset) and start over.

For the remote Cloudflare D1 database the same command targets the remote:

```bash
npx wrangler d1 migrations apply osdb-production --remote
```

(Requires Cloudflare credentials and a real `database_id`; see
`docs/DEPLOYMENT.md`.)

## 5. Synthetic fixtures

The repository deliberately contains **no real camera data**. Synthetic data
exists in two places.

### 5.1 Demo records (optional, explicit seed)

Two clearly labelled fictional pins live in the SQL fixture
`scripts/demo-cameras.sql` and are inserted **only** when you run:

```bash
npm run db:seed
```

| id | Title | Kind | Latitude | Longitude | Status | Source | `updated` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Illustrative record A | Fixed dome | 41.9004 | 12.4936 | `demo` | `Prototype seed` | `Demo data` |
| 2 | Illustrative record B | Traffic monitoring | 41.9047 | 12.5031 | `demo` | `Prototype seed` | `Demo data` |

Their `description` fields state explicitly that they are not claims about
real cameras. The seed is idempotent (`WHERE NOT EXISTS` guards), so
re-running it never duplicates rows. Because the public read boundary
whitelists `verified` and `demo` statuses (`db/cameras.ts`
`listPublicCameras`), the demo records appear on the map, directory,
`/api/cameras`, CSV/GeoJSON exports, and nearby search. They are safe to use
for manual interface checks and for the [local playbook](LOCAL_PLAYBOOK.md).

`npm run dev` never runs this seed: the demo rows exist only if you asked for
them. Acceptance of the H3 migration work:
`npm run db:migrate` on an empty local DB creates the full schema, `npm run
dev` starts without inserting demo rows, and no startup code path executes
the seed.

### 5.2 Test fixtures (in-memory mocks)

`tests/helpers/` contains the test harness:

- `db-runtime-harness.mjs` — transpiles the real DB modules and replays the
  real migration files (`drizzle/0000-*.sql` … `0025-*.sql`) onto an
  in-memory D1 adapter, so the test suite exercises exactly what
  `npm run db:migrate` produces locally;
- `mock-state.mjs` — shared mutable state for the mocked `db` modules;
- `mocks/` — per-module mocks (`cameras`, `corrections`, `moderation`,
  `cloudflare-workers`) that the test suite imports instead of the real data
  layer.

These are **not database rows**: they exist only inside the test process.
Real DB fixtures are only the two optional demo records above.

## 6. Reset

Local state can include submitted fictional reports and their audit history.
Treat it as data even in a prototype. The reset below is **non-destructive**
by design: nothing is deleted, the local database is moved aside so the next
start recreates it from scratch.

```bash
# 1. Stop the development server (Ctrl+C in the `npm run dev` terminal).

# 2. Reset: moves .wrangler/state aside with a unique timestamped name,
#    then applies the migrations to a fresh local database.
npm run db:reset

# 3. Start again (optional: re-add the two labelled demo pins).
npm run dev
npm run db:seed   # only if you want the illustrative records back

# 4. Verify: without db:seed the API returns an empty list.
curl -s http://localhost:3000/api/cameras
```

`npm run db:reset` wraps `scripts/db-reset.mjs`, which uses a
`%Y-%m-%d-%H%M%S` stamp for the backup name: if a backup from an earlier
reset the same day already exists, `mv` silently nests the new state *inside*
it (`.wrangler/state.bak-2026-07-31-213000/state`) instead of replacing it
(verified). The unique name keeps every backup sibling, not nested.

If there is no local state at all (a truly fresh clone before the first
`npm run dev`), the reset script prints
`No local state found (.wrangler/state missing) — nothing to reset.` and then
still applies the migrations, so `db:reset` is safe to run at any point.

Verified: after this procedure the API returns an empty list (or exactly the
two demo records if you re-ran `db:seed`), and no submitted reports or audit
history survive.

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

### 6.1 Working copies: one active copy per task

Two rules keep the repository copies in sync and the critical paths safe:

1. **One active working copy per task.** Work on a task in a single
   checkout/worktree, on a dedicated branch
   (`feature/<owner>/t_<task-id>-<slug>`), never in parallel copies. When the
   task is done, push the branch and return the copy to `main`; do not leave
   a second checkout parked on a stale branch with uncommitted leftovers.

2. **No uncommitted files on critical paths at the end of a session.**
   At the end of a session the working tree must be clean on the critical
   paths: auth routes (`app/api/auth/`, `app/api/appeals/`,
   `app/lib/csrf.ts`), the data layer (`db/*.ts`), and the migration set
   (`drizzle/*.sql`, `drizzle/meta/_journal.json`,
   `drizzle/meta/*_snapshot.json`). Uncommitted migration files (SQL +
   journal + snapshot) are the worst case: they silently desync the local
   database and `db:generate` from the branch for every later contributor.
   If the work is not ready to commit, stash it on the dedicated branch —
   never leave it in the working tree.

These rules were introduced after QA #4 (PR #276) found a shared checkout
with 8 uncommitted files including a migration (0033) and its
journal/snapshot, which exposed local databases to migration drift.

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `✘ [ERROR] table 'cameras' already exists` when applying migrations | Migrations run against a state dir that already has a schema | Reset first ([section 6](#6-reset)), then apply migrations on the fresh state |
| `✘ [ERROR] duplicate column name: manufacturer: SQLITE_ERROR` (or another `already exists` error) while applying a migration | The local schema already contains the change, but its journal entry is missing — journal/state desync (state created before migrations existed, an interrupted apply, or a hand-edited `d1_migrations`) | Reset ([section 6](#6-reset)) and re-migrate on the fresh state. Verified reproduction: deleting one journal row makes wrangler try to re-apply the migration and fail exactly like this |
| `✅ No migrations to apply!` but the schema does not match the current code | The journal (`d1_migrations`) lists migrations that no longer exist on disk; wrangler silently skips ghost entries (verified), so the DB drifts out of sync with the branch — typical after branch history was rewritten and a migration was dropped or renamed | Reset and re-migrate; keep `drizzle/*.sql` and `drizzle/meta/_journal.json` in sync with the branch you are on |
| `npm run db:migrate` reports everything already applied | The local state was migrated before | Nothing to do, or reset if you want a clean slate ([section 6](#6-reset)) |
| `no such column: ...` (or missing table) at runtime after switching branches | Stale local DB: `.wrangler/state` was migrated by an older commit, and the current code expects a newer schema | `npm run db:reset`, then `npm run db:migrate` on the new branch |
| `db:generate` produces nothing or an unexpected diff | `drizzle/meta/_journal.json`/snapshots are out of sync with the SQL files (hand-edited or restored from another branch) | Do not hand-edit the journal; regenerate from a clean checkout of the branch |
| `Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: ... Received protocol 'cloudflare:'` | `npm start` (`vinext start`, plain Node) cannot load the Workers-runtime `cloudflare:` module | Use `npm run dev` (`vinext dev`, runs in workerd). See `docs/DEPLOYMENT.md` § Local LXC deployment |
| `/moderation`, `/api/moderation`, `/api/appeals` return 503 | Fail-closed default: no moderation credentials configured | Set `MODERATION_USER`/`MODERATION_PASSWORD` (Basic auth) or `MODERATION_TOKEN` (bearer) in the environment, then restart |
| Moderation/appeals API returns `401 Authentication required` after a successful Basic login | The gate passed but no server-side identity was injected | Set `MODERATION_IDENTITY_EMAIL` (e.g. `admin@osdb.test` for the prototype) — the worker only injects identity from that setting (ADR 0014) |
| Port 3000 already in use | Another instance is running | Stop it, or start with a different port (`npm run dev -- --port 3001`) |

## 8. Aggiungere una lingua (i18n)

Le lingue supportate sono definite da UN SOLO registro centrale:
`SUPPORTED_LOCALES` in `app/lib/i18n/types.ts`. Tutto il resto ne
deriva: il tipo `Locale`, la mappa `messages`, `legalMessages`, i bottoni
del LocaleToggle, la risoluzione lato server/API, i tag BCP 47 per i
formattatori di date e gli attributi `lang`, e la copia delle email
transazionali. Non esiste più alcun ternario hardcoded `en`/`it`.

Aggiungere una lingua (es. il tedesco, codice `de`):

1. **File bundle**: crea `app/lib/i18n/de.ts` con tutti i namespace
   (`common`, `map`, `directory`, …) in un unico file, tipizzato
   `Translation<typeof en>` (importato da `app/lib/i18n/index.ts`). Il
   tipo mapped garantisce la parità a `tsc`: chiave mancante o extra
   rompe la build (ADR 0007).
2. **Una riga nel registro**: aggiungi l'entry a `SUPPORTED_LOCALES` in
   `app/lib/i18n/types.ts`, es.
   `{ code: "de", label: "DE", bcp47: "de-DE" }`.
   `label` è il testo del bottone nel toggle; `bcp47` alimenta
   `LOCALE_BCP47` (Intl e attributi `lang`). L'inglese (`en`) deve
   restare la PRIMA entry: `DEFAULT_LOCALE` ne deriva.
3. **Assemblaggio**: in `app/lib/i18n/index.ts` aggiungi l'import del
   bundle e una riga in `bundleSources` — la mappa `messages` esportata è
   derivata dal registro e si aggiorna da sola.
4. **Contenuti legali**: crea `app/lib/legal/de.ts` (tipizzato
   `LegalContent`) e aggiungilo a `legalSources` in
   `app/lib/legal/index.ts` — anche qui la mappa esportata è derivata dal
   registro.
5. **Email transazionali**: `EMAIL_COPY` in `app/lib/email-templates.ts`
   è tipizzata `Record<Locale, EmailCopy>`: `tsc` ti obbliga ad aggiungere
   il blocco copia della nuova lingua, e i renderer la includono
   automaticamente (con `lang="de-DE"` dal registro) in ogni messaggio.
6. **Verifica**: `npx tsc --noEmit` (parità bundle), `npm run lint`, e i
   test `tests/i18n-registry.test.mjs` (parità registro ↔ bundle, lookup
   dinamico) + `tests/i18n-pages.test.mjs` (SSR EN/IT) + la suite client
   del toggle. Nessuna nuova libreria: il sistema è interamente
   types-first.

Nota: il controllo "nessuna frase inglese non tradotta nel bundle
italiano" (`tests/navigation-pages.test.mjs`) è specifico per en/it; per
le altre lingue la parità è garantita da `Translation<typeof en>` a
`tsc`.

## 9. Related documentation

- [Local playbook](LOCAL_PLAYBOOK.md) — fictional submit → moderate →
  public-result acceptance checks, and the cautious reset policy.
- [Data model and API](DATA_MODEL.md) — public record fields and status lifecycle.
- [Deployment and operations](DEPLOYMENT.md) — production build, container,
  Cloudflare Workers, and the LXC test host.
- [Operations manual](OPERATIONS.md) — backup/restore drills and verified
  wrangler commands (appendice).
- [Development plan](DEVELOPMENT_PLAN.md) and
  [Execution board](EXECUTION_BOARD.md) — workstreams and ownership.
