# Deployment and operations plan

## Provisioning real accounts (pre-alpha)

The migrations seed **demo identities** for the local prototype (`Demo *`
reviewers in `drizzle/0008_wave_b_reviewer_roles.sql`, six `@osdb.test` demo
users in `drizzle/0010_auth_roles_appeals.sql`). They are removed by the
**last** migration, `drizzle/0017_remove_demo_seed.sql`, which runs on every
fresh database — so a fresh DB has **zero demo identities** (verified by
`npm run db:smoke`). Demo accounts must never be the moderation/admin
identities of a public environment.

Before opening the DB to the public, provision the real moderator/admin
accounts with the dedicated script (idempotent — safe to re-run, also usable
in CI/deploy):

```bash
PROVISION_ACCOUNTS='[
  {"email":"ada@example.org","displayName":"Ada","role":"admin","reviewerRole":"administrator"},
  {"email":"linus@example.org","displayName":"Linus","role":"moderator","reviewerRole":"record_reviewer"},
  {"email":"grace@example.org","displayName":"Grace","role":"moderator","reviewerRole":"intake_reviewer"}
]' npm run db:provision            # local D1 (default)
PROVISION_ACCOUNTS='[...]' npm run db:provision -- --remote   # alpha/prod D1
```

- `role` must be `contributor | moderator | admin` (coarse route gate, ADR 0014).
- `reviewerRole` is optional and only meaningful for `moderator`/`admin`;
  it creates the linked granular DATA_TRUST profile
  (`intake_reviewer | record_reviewer | senior_moderator | privacy_safety_lead | administrator`).
- Accounts are upserted on the unique email (and reviewer display name), so
  re-running never duplicates rows.
- The script only manages role identities — real authentication (passwords /
  OIDC) is a separate public-alpha ticket and out of scope here, exactly like
  the demo identities they replace.

Coordinated with the deploy workflow ticket (Cloudflare deploy + real D1
database id): the deploy pipeline runs `db:provision --remote` with the
`PROVISION_ACCOUNTS` value supplied as a GitHub secret after `db:smoke`
passes, and before the worker is exposed.

## Local development

```bash
npm install
npm run dev
npm run build
```

The default local database is seeded with demo pins. Do not load real reports
into a development machine or demo deployment. For the full clean-setup
walkthrough — schema migrations, synthetic fixtures, and the non-destructive
local reset — see [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md).

## Preconditions for a public environment

- Public repository, domain ownership, maintainers, and contact address established.
- D1/database migrations reviewed and applied through a repeatable release process.
- Separate environments for development, staging, and production.
- Secrets stored in the hosting platform, never in source or client bundles.
- Automated backups, restoration drill, monitoring, error alerting, and incident runbook.
- Abuse controls: rate limiting, authentication where needed, moderation roles, and audit logs.
- Privacy notice, terms, correction/removal form, and retention schedule published.
- Approved map tile provider or self-hosted map infrastructure. The
  same-origin tile proxy is in place and compliant by default
  (`/api/tiles/{z}/{x}/{y}.png` → `TILE_PROVIDER_URL`); before launch, choose
  the provider tier and set the variable (see
  [OSM_INTEGRATION.md](OSM_INTEGRATION.md)).

## Release procedure

1. Review changes, tests, migration impact, and documentation.
2. Deploy to staging with only synthetic/demo data.
3. Verify public routes do not expose `pending`, reviewer, account, or evidence data.
4. Confirm backups and rollback plan.
5. Deploy production, monitor health and error rates, and record the release.
6. Publish a concise changelog and data-export version where applicable.

For the current local environment (LXC 114), a concrete step-by-step checklist
with exact commands — build verification, changelog, tag, deploy, smoke tests,
rollback — lives in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). The
Operations manual ([OPERATIONS.md](OPERATIONS.md)) covers monitoring, backups,
and the Workers rollback plan.

## Build and verification

The production build is a single command; lint, type-check, and the privacy
boundary tests are separate steps. All of the following have been verified
against `main`:

```bash
npm ci            # reproducible install (requires Node >= 22.13)
npm run lint      # ESLint over app/, db/, worker/, build/
npx tsc --noEmit  # strict TypeScript check (includes worker-configuration.d.ts)
npm run build     # vinext production build -> dist/client + dist/server
npm test          # build + privacy/publication boundary tests (tests/publication-boundaries.test.mjs)
```

The build emits a static client bundle (`dist/client`) served by the Worker's
`ASSETS` binding and a server bundle (`dist/server`) run by the `vinext start`
production server or by Cloudflare Workers (`wrangler deploy`).

### Build-time network usage (offline-safe)

The production build makes **no network requests**. Two hygiene decisions keep
it that way:

- **No `next.config`.** The repo has no `next.config.ts` (the template stub was
  removed). `vinext` loads `next.config.{ts,mjs,js,cjs}` only if present, and
  reads a small set of options from it (`output`, `redirects`, `rewrites`,
  `headers`, `images.dangerouslyAllowSVG`, `experimental`, …); with no file it
  falls back to documented defaults. If a future feature needs one of those
  options (e.g. SVG optimization in the image proxy, see `worker/index.ts`),
  add the file back — there is no other Next.js config surface.
- **No remote fonts.** The app does not use `next/font/google` (Geist/Geist_Mono
  were removed: the `--font-geist-*` variables they defined were never
  referenced by any stylesheet — `body` uses `Arial, Helvetica, sans-serif`).
  `next/font/google` would make the build fetch CSS + `.woff2` from
  `fonts.googleapis.com` / `fonts.gstatic.com` at build time (cached under
  `.vinext/fonts/`, which is gitignored), and fall back to runtime CDN `<link>`
  tags when offline — a hard network dependency for a build that must work in
  air-gapped CI and must not leak visitor requests to third parties. If custom
  fonts are ever needed, self-host them (e.g. `@fontsource-variable/*` or
  committed `.woff2` via `next/font/local`); do not reintroduce Google Fonts.

CI runs `npm ci` (resolves everything from the lockfile) and `npm run build`;
neither touches the network.

## Container deployment

The project ships no image; the container is a thin wrapper around the
verified production build. Node `22.x` is required (`engines`), and the image
must contain the build output plus the `worker/` entrypoint.

Minimal `Dockerfile` (multi-stage, ~200 MB image with Alpine runtime):

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/worker ./worker
COPY --from=build /app/wrangler.jsonc ./wrangler.jsonc
COPY --from=build /app/app ./app
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t open-surveillance-db .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e NEXT_PUBLIC_SITE_URL=https://example.org \
  open-surveillance-db
# health check: curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

Notes:

- `npm start` = `vinext start`: production server on `0.0.0.0`, port from
  `$PORT` (default 3000).
- The container does not run the Cloudflare D1 binding; DB calls (DB
  binding) resolve only in the Workers runtime. For a self-contained local
  preview use `npx wrangler dev` instead of the container.
- No secrets should ever be baked into the image: pass them as environment
  variables or via the container runtime's secret store.
- Add `NEXT_PUBLIC_SITE_URL` only for production metadata; it must stay
  unset in local development (see Environment variables below).

## Cloudflare Workers deployment

Production target is Cloudflare Workers (see `wrangler.jsonc`). **Deploys run
through CI only** (`.github/workflows/deploy.yml`, `workflow_dispatch` with a
`dry-run`/`deploy` mode — see OPERATIONS.md §7): never run `wrangler deploy`
manually against production. The workflow applies D1 migrations first, then
uploads the Worker, and it refuses to run while `wrangler.jsonc` keeps the
placeholder D1 `database_id`.

One-time setup before the first `deploy`:

```bash
# D1 database: create it and copy the database_id into wrangler.jsonc
npx wrangler d1 create osdb-production

# R2 bucket backing the PHOTOS binding (must exist in the account)
npx wrangler r2 bucket create opensurveillancedb-photos

# Worker secrets (persist across deploys; never in source)
npx wrangler secret put MODERATION_USER
npx wrangler secret put MODERATION_PASSWORD
npx wrangler secret put MODERATION_TOKEN   # optional bearer alternative
```

### Cloudflare bindings (`wrangler.jsonc`)

The Worker `Env` is wired entirely through `wrangler.jsonc` bindings — none
of these are configured in the platform's secret store. The committed file
declares:

| Binding | Type | Resource | Used by |
| --- | --- | --- | --- |
| `ASSETS` | Static assets | `dist/client` (production build output) | Serves the client bundle; image optimizer fetches assets through it (`worker/index.ts` `/_vinext/image`) |
| `DB` | D1 database | `osdb-production` | All relational data (`db/*`) |
| `PHOTOS` | R2 bucket | `opensurveillancedb-photos` | Photo evidence bytes: `db/photos.ts` stores EXIF-stripped images under `photos/<uuid>.<ext>` and reads them back for moderation preview / public serving. D1 stores metadata only — the bucket is the object store |
| `IMAGES` | Cloudflare Images | (managed service, no resource to create) | On-the-fly image optimization (`worker/index.ts` `/_vinext/image`): resize/format/quality transforms via `env.IMAGES.input(...)` |
| `EMAIL` | Email Service (`send_email`) | domain `opensurveillancedb.org`, sender `noreply@opensurveillancedb.org` | Transactional auth mail (`db/mailer.ts`): account verification and password reset (AUTH MULTI-METODO Fase A2, ADR 0020). Restricted with `allowed_sender_addresses` so even a compromised worker can only send from the noreply address |

Create the R2 bucket before the first deploy (the binding in
`wrangler.jsonc` is declarative; the bucket must exist in the account):

```bash
npx wrangler r2 bucket create opensurveillancedb-photos
```

The `IMAGES` binding targets the Cloudflare Images managed service and needs
no explicit resource creation.

GitHub repository secrets used by the workflow:
`CLOUDFLARE_API_TOKEN` (permissions "Workers Scripts - Edit" + "D1 - Edit")
and `CLOUDFLARE_ACCOUNT_ID` (the `PROD_URL` variable is only used by the
`ops-monitoring.yml` health-check workflow, not by deploys). `PROD_URL`
(hostname only, no scheme — the workflow prepends `https://`) is set to
`open-surveillance-db.simone-rondina.workers.dev` (workers.dev subdomain
`simone-rondina`; no custom domain/route registered yet). Update it with
`gh variable set PROD_URL <host>` whenever the public URL changes (see
docs/OPERATIONS.md §3.2 and issue #203). The job
targets the `production` GitHub Environment (add required reviewers for a
human gate on deploys).

Manual smoke commands after a deploy (read-only):

```bash
npx wrangler tail                        # live logs
npx wrangler versions list               # version ids for rollback correlation
npx wrangler rollback [version-id]       # instant rollback, does not touch D1
```

The OpenAI-hosting metadata scaffold (`.openai/hosting.json` and the `sites()`
Vite plugin that copied it plus `drizzle/` into `dist/.openai`) was template
leftover and has been removed: this project deploys only to Cloudflare
Workers, and Drizzle migrations are read directly from the `drizzle/` source
directory (`migrations_dir` in `wrangler.jsonc`), so no build-time copy is
needed.

`worker-configuration.d.ts` is generated by `npx wrangler types` and is
committed so CI type-checks the `Env` bindings without a Cloudflare login.

### Transactional email (Email Service, AUTH MULTI-METODO Fase A2)

Account verification and password reset are sent from the Worker through
the **Cloudflare Email Service** `send_email` binding (`EMAIL`) on the
`opensurveillancedb.org` domain (ADR 0020 decision 2). Cloudflare is already
the processor for the whole account (DPA v6.3 + SCC + EU–US DPF, see
[PROCESSOR_REGISTER.md](legal/PROCESSOR_REGISTER.md) PR1): the mailer adds
**zero new third parties and zero new DPAs**.

One-time domain onboarding (dashboard, cannot be done from the repo):

1. **Compute → Email Service → Email Sending → Onboard Domain**, pick
   `opensurveillancedb.org`. Cloudflare adds the sending records
   automatically on the `cf-bounce` subdomain (MX, SPF
   `include:_spf.mx.cloudflare.net`, DKIM `cf-bounce._domainkey`) and DMARC
   on `_dmarc.opensurveillancedb.org`. Propagation is usually 5–15 minutes.
2. Verify the records under **Email Sending → Settings**.
3. The `EMAIL` binding in `wrangler.jsonc` is restricted with
   `allowed_sender_addresses: ["noreply@opensurveillancedb.org"]` — the
   worker can never send from any other address (defence in depth).
4. Set `VERIFY_BASE_URL` (see the environment-variables table below) to the
   public site URL — without it the mailer fails closed (`missing_config`)
   and the auth routes answer 503 instead of emailing a broken link.

Local development: `wrangler dev` simulates the `send_email` binding —
emails are logged to the console and saved under a temp directory, never
sent (set `remote: true` on the binding only when you intentionally want
real delivery from a local run). There is nothing else to configure: the
mailer code path is identical in dev and prod.

Email templates live in `app/lib/email-templates.ts` and are **zero
tracking by contract**: no `<img>`/pixels, no remote assets, no links
beyond the single action URL, plain-text alternative always present —
asserted by `tests/mailer.test.mjs`. The send rate limit (3 emails/h per
contributor, ADR 0020) is enforced in D1 via `email_send_log` (migration
0029) and is durable across worker isolates.

## Local LXC deployment (current)

The always-on test site lives on Proxmox container **114 `osdb-test`**
(192.168.1.201:3000), reachable only on the LAN. This is the **current local
environment** and the reference for staging checks; the Cloudflare
deployment remains a future precondition (see "Preconditions for a public
environment" above).

### Container

- Debian 13 template (`debian-13-standard_13.1-2_amd64.tar.zst`), unprivileged
  with `nesting=1`, 2 cores, 2048 MB RAM, 512 MB swap, rootfs 10 GB
  (`local-lvm:vm-114-disk-0`).
- Network: `eth0` = 192.168.1.201/24, gateway 192.168.1.1, DNS 192.168.1.192.
- `onboot=1` (set via Proxmox API so the site comes back after a host reboot).
- No SSH access: the deploy key was **not** injected at create time (verified
  from the `vzcreate` task log, 2026-07-31 — no `--ssh-public-keys` was passed)
  and `ssh-public-keys`/`password` cannot be set post-create (API schema
  rejects them). All container operations (snapshot, rollback, backup,
  stop/start) are performed via the Proxmox API token, see
  `docs/OPERATIONS.md` §8.

### Application

- Node.js 22 LTS installed from the official tarball in `/opt/node` (no distro
  packages). The `PATH` used by systemd includes `/opt/node/bin`.
- Initial install on the container:

  ```bash
  git clone https://github.com/Syax89/open-surveillance-db /opt/open-surveillance-db
  cd /opt/open-surveillance-db
  npm ci
  npm run build   # verify the production build once at setup time
  ```

- Updates are applied with `git fetch && git reset --hard origin/main`, then
  `npm ci`, then `systemctl restart osdb-test.service`.
- No `.env` file is needed: the only production metadata variable
  (`NEXT_PUBLIC_SITE_URL`) stays unset on purpose for the test site.

### Runtime choice: `vinext dev`, not `vinext start`

`vinext start` (the production server, plain Node) **cannot** serve this app:

```
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file,
data, and node are supported by the default ESM loader. Received protocol
'cloudflare:'
```

The DB layer imports `env` from `cloudflare:workers` — a Workers-runtime
module externalized for `workerd` — so a plain Node process fails at module
load before serving anything. `vinext dev` runs the same RSC environment
inside `workerd` via `@cloudflare/vite-plugin` and is the repo-documented
local run (`npm run dev`). On a single-tenant LAN test box the difference
(dev-server overhead, no production bundle) is acceptable; this is
documented in the systemd unit and revisited whenever the Workers deployment
is activated.

### systemd unit (`/etc/systemd/system/osdb-test.service`)

```ini
[Unit]
Description=OpenSurveillanceDB test environment (vinext dev / workerd, port 3000 LAN)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/open-surveillance-db
Environment=WRANGLER_LOG_PATH=.wrangler/wrangler.log
Environment=NODE_ENV=development
# NOTE: 'vinext start' (plain Node) cannot serve this app: db layer imports
# 'cloudflare:workers' (Workers runtime module, externalized for workerd).
# ERR_UNSUPPORTED_ESM_URL_SCHEME on 'cloudflare:'. vinext dev runs the RSC
# environment in workerd via @cloudflare/vite-plugin (repo-documented run).
ExecStart=/opt/open-surveillance-db/node_modules/.bin/vinext dev --port 3000 --hostname 0.0.0.0
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

Managed with `systemctl enable --now osdb-test.service`; logs via
`journalctl -u osdb-test.service -f`.

### Verification

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.201:3000/        # 200
curl -sS http://192.168.1.201:3000/api/cameras                              # 200, only status demo/verified
curl -sS "http://192.168.1.201:3000/api/cameras/nearby?latitude=41.9004&longitude=12.4936&radius=50"  # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.201:3000/guide    # 200
curl -sS http://192.168.1.201:3000/api/moderation                            # 503 fail-closed (no creds)
curl -sS http://192.168.1.201:3000/api/appeals                              # 503 fail-closed (no creds)
```

Public API responses must expose only `demo`/`verified` records and never the
private `notes` field (enforced by the publication-boundary tests in CI).

The moderation and moderator-facing appeals endpoints are **fail-closed**:
without credentials they return `503 Moderation is unavailable.`. To enable
the local moderation queue, add `MODERATION_USER` / `MODERATION_PASSWORD`
(Basic auth) or `MODERATION_TOKEN` (bearer) to the unit's `Environment=`
lines and restart. Filing an appeal (`POST /api/appeals`) is exempt from the
edge gate by design (CEO decision 2026-08-02, ADR 0014 amendment): it
authenticates with a contributor session at the route layer instead.

### Identity and access-control environment variables

The worker edge is the single identity authority (ADR 0014): it strips
client-supplied identity headers from every request and re-injects the
server-chosen identity only after the moderation gate succeeds. All of these
are optional; the fail-closed defaults below apply when unset. Set them in
the hosting platform's secret/environment store, never in source.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODERATION_USER` / `MODERATION_PASSWORD` | unset | Basic auth for the moderation gate (fails closed: 503 without any credential) |
| `MODERATION_TOKEN` | unset | Bearer token alternative for the same gate (API automation) |
| `MODERATION_IDENTITY_EMAIL` | unset | `users.email` injected as `x-osdb-user-email` after the gate succeeds. Local prototype: `admin@osdb.test`. Unset = gate passes with NO identity → protected routes reject with 401 (fail closed) |
| `TRUST_PLATFORM_HEADERS` | `false` | `true` only in a real ChatGPT-plugin deployment, where the platform gateway (not arbitrary clients) sits in front of the worker: passes `oai-authenticated-user-email` through instead of stripping it. Never set for direct-Internet or LAN deployments |

## Environment variables

`NEXT_PUBLIC_SITE_URL` may be set to the canonical public URL for metadata generation. It must be absent or point to a non-production value in local development. When it is absent, `app/layout.tsx` omits `metadataBase` entirely and serves the favicon through a relative `<link rel="icon" href="/favicon.svg">` in the root layout — this keeps deployments without the variable free of absolute `localhost` metadata URLs (the old `?? "http://localhost:3000"` fallback made browsers request the favicon from `localhost` on staging). Any future identity, storage, analytics, or notification settings need an explicit inventory and privacy review.

### Abuse-control environment variables

The per-route rate limits, input caps, and abuse alerts are configured through
environment variables. All are optional; the defaults below apply when unset.
Set them in the hosting platform's secret/environment store, never in source
or client bundles (the secrets gate in CI rejects hardcoded credentials).

| Variable | Default | Purpose |
| --- | --- | --- |
| `READ_RATE_LIMIT_MAX` / `READ_RATE_LIMIT_WINDOW_SECONDS` | 60 / 60 | Plain reads (`GET /api/cameras`, photo bytes `GET /api/photos/[id]`, photo list `GET /api/photos`) |
| `EXPORT_RATE_LIMIT_MAX` / `EXPORT_RATE_LIMIT_WINDOW_SECONDS` | 10 / 60 | Bulk exports (CSV/GeoJSON) |
| `NEARBY_RATE_LIMIT_MAX` / `NEARBY_RATE_LIMIT_WINDOW_SECONDS` | 30 / 60 | Nearby search |
| `REVISIONS_RATE_LIMIT_MAX` / `REVISIONS_RATE_LIMIT_WINDOW_SECONDS` | 30 / 60 | Public change history (`GET /api/cameras/revisions`) |
| `POST_RATE_LIMIT_MAX` / `POST_RATE_LIMIT_WINDOW_SECONDS` | 5 / 60 | Submissions (cameras + corrections) |
| `MODERATION_RATE_LIMIT_MAX` / `MODERATION_RATE_LIMIT_WINDOW_SECONDS` | 30 / 60 | Moderation API (second layer over edge auth), including appeal decisions (`PATCH /api/appeals/[id]`) |
| `APPEAL_RATE_LIMIT_MAX` / `APPEAL_RATE_LIMIT_WINDOW_SECONDS` | 20 / 60 | Appeal filing and review (`POST/GET /api/appeals`) — a distinct bucket from moderation so contributors contesting decisions and moderators reviewing them never starve the moderation queue |
| `TILES_RATE_LIMIT_MAX` / `TILES_RATE_LIMIT_WINDOW_SECONDS` | 60 / 60 | Tile proxy (`GET /api/tiles/*`) — protects the OSMF upstream from per-caller scraping |
| `POST_SUBMISSIONS_DISABLED` | `false` | Kill switch: reject new submissions with 503 |
| `PHOTOS_MAX_PENDING_PER_CALLER` | 20 | Pending-photo count cap per caller bucket (authenticated: `contributor:<id>`; anonymous: `anon:<sha256(caller key)>`). `POST /api/photos` answers 429 when a caller is at the cap — a state quota distinct from the HTTP rate limit, bounding how much R2 storage and how many moderation-queue items one caller can accumulate while the queue catches up. Only `status = 'pending'` photos count; approved/rejected photos leave the cap as soon as a moderator decides them |
| `PHOTOS_MAX_PENDING_BYTES` | 209715200 (200 MiB) | Pending R2 bytes cap per caller bucket, same semantics — bounds the storage volume even when the count is not the binding constraint |
| `MAX_BODY_BYTES` | 32768 (32 KiB) | Max JSON request body; larger bodies answer 413 |
| `ABUSE_ALERT_THRESHOLD` | 10 | Per-caller abuse events per window before an alert fires |
| `ABUSE_ALERT_SURGE_THRESHOLD` | 50 | Route-wide events per window before a surge alert fires |
| `ABUSE_ALERT_COOLDOWN_SECONDS` | 300 | Minimum seconds between two alerts for the same key/route |
| `ABUSE_ALERT_WEBHOOK_URL` | unset | Optional JSON webhook; without it alerts go to the server log |

The limiter is a per-isolate sliding window (60 s default) — see
`app/lib/rate-limit.ts`. Input caps live in `app/lib/input-limits.ts`; alerts
in `app/lib/abuse-alerts.ts`. Alerts carry only a SHA-256 hash of the caller
key (never the raw IP) and never request bodies or query strings (see
`docs/workstreams/OPS_OPEN.md` §Observability). For a public deployment that
needs global or long-window limits, replace the in-memory limiter with
Cloudflare's rate-limiting product (see `docs/workstreams/OPS_OPEN.md`
§Security for the per-isolate caveat and the buckets to migrate first) or a
KV/DO-backed counter.

### Media, tiles, and auth environment variables

The media/tile variables configure the photo upload pipeline and the
same-origin tile proxy; the moderation/auth variables gate the moderation
surface and contributor sessions. All are optional; the defaults below apply
when unset. Set them in the hosting platform's secret/environment store
(`wrangler secret put` on Workers), never in source or client bundles.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TILE_PROVIDER_URL` | `https://tile.openstreetmap.org` | Upstream tile base URL for `/api/tiles/{z}/{x}/{y}.png` (no trailing slash; a trailing `/` is tolerated). See [OSM_INTEGRATION.md](OSM_INTEGRATION.md) for the provider decision matrix |
| `TILE_PROVIDER_KEY` | unset | API key appended as `?key=…` for tile providers that require one (MapTiler, Stadia Maps, …). Never commit it; set it as a Worker secret |
| `MODERATION_USER` / `MODERATION_PASSWORD` | unset | HTTP Basic auth pair that unlocks `/moderation` and `/api/moderation*` at the worker edge. Both must be set together |
| `MODERATION_TOKEN` | unset | Alternative bearer token for the same gate (API automation). At least one credential method (Basic pair or bearer) must be configured |
| `AUTH_SESSION_TTL_DAYS` | `30` | Contributor session lifetime in days (ADR 0013); TTL is computed as `days × 86400` seconds. The SAME value drives the DB `expires_at` and the cookie `Max-Age`, so the two can never diverge (audit t_5ca60ab2, P2) |
| `AUTH_COOKIE_SECURE` | unset (`false`) | Set to `true` in production so the session cookie carries the `Secure` attribute (HTTPS precondition; must stay unset on the plain-HTTP LAN prototype) |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_SECONDS` | `10` / `60` | Per-key rate limit on `/api/auth/login` and `/api/auth/register` |
| `VERIFY_BASE_URL` | unset (fail-closed) | Public site base URL used to build verification / password-reset action links (e.g. `https://opensurveillancedb.org`). Unset → the mailer answers `missing_config` and auth routes return 503; set it in `.dev.vars` locally and as a secret/var in production |
| `MAILER_FROM` | `noreply@opensurveillancedb.org` | Sender address for transactional auth mail. Must be in the `EMAIL` binding's `allowed_sender_addresses` (or the provider rejects with `E_SENDER_NOT_VERIFIED`) |
| `EMAIL_SEND_LIMIT_MAX` / `EMAIL_SEND_LIMIT_WINDOW_SECONDS` | `3` / `3600` | Re-send budget per contributor for auth emails (ADR 0020): at most `EMAIL_SEND_LIMIT_MAX` sends per `EMAIL_SEND_LIMIT_WINDOW_SECONDS` seconds, enforced in D1 via `email_send_log` |

The moderation gate **fails closed**: if neither the Basic pair nor the
bearer token is configured, every `/moderation` and `/api/moderation*`
request is denied with `503 Moderation is unavailable.` — see
`worker/index.ts` and [ADR 0003](decisions/0003-moderation-access-control.md).
The photo pipeline needs no additional variables beyond the `PHOTOS` R2
bucket binding and the `IMAGES` binding declared in `wrangler.jsonc` (see
"Cloudflare bindings" above): image size/dimension caps are tuned via the
abuse-control variables in the previous table.
