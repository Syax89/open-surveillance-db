# Local playbook

This playbook is for exercising OpenSurveillanceDB with fictional data on one
development machine. It is not an operating procedure for a public service.
Do not enter real camera reports, personal data, images, live-feed links,
credentials, or sensitive operational details.

## What this verifies

The local loop follows the community model (ADR 0021):

```text
verified contributor → report → published immediately as `active`
community actions (confirm / no longer there / problem / privacy)
  → automatic state transitions (hidden / removed, reversible)
corrections and edit requests → private human review
```

`pending`, rejected, `removed`, `hidden`, and correction-request records must
never appear on the public map, directory, `/api/cameras`, CSV/GeoJSON
exports, or nearby search, except for the direct-link banner contract of
withdrawn records.

## Rate limits are best-effort locally

The local development instance runs without Cloudflare, so `cf-connecting-ip`
is never present and the per-caller buckets key on the first
`x-forwarded-for` hop (`app/lib/rate-limit.ts` `callerKey`). Any client can set
that header, so rate limits are NOT a security
boundary on a LAN deployment — treat them as development conveniences that
show the 429 contract, not as abuse protection. The public service must sit
behind Cloudflare (or an equivalent trusted edge that overwrites the
forwarded chain), where `cf-connecting-ip` is set by the platform and cannot
be spoofed; see `docs/DEPLOYMENT.md`.

## Start the local instance

Requirements: Node.js 22.13 or newer and a recent npm.

```bash
npm install
npm run db:migrate   # on a fresh checkout: apply the Drizzle schema migrations first
npm run dev
```

On a fresh checkout the local database has no schema until you migrate it:
`npm run db:migrate` creates the schema tables (plus the `d1_migrations`
journal) from `drizzle/`. If you are starting from an empty state, this step
is required — running `npm run dev` first would start against a database
without tables.

Open the app at `http://localhost:3000` and the local moderation
dashboard at `http://localhost:3000/moderation`. Keep the development server
running while following the checks below.

For the full clean-setup walkthrough — prerequisites, schema migrations,
synthetic fixtures, and the non-destructive reset procedure — see
[DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md).

The local database starts **empty**: the schema comes from the Drizzle
migrations and no demo rows are inserted at runtime. If you want the two
clearly labelled `demo` pins used to show the interface (they are fictional
and not claims about real cameras), run the optional, separate seed first:

```bash
npm run db:seed
```

## Create a safe test report

1. Register a verified contributor account (email verification is required
   for the write gate, ADR 0020) and sign in.
2. On `/segnala`, either click an arbitrary position on the map or enter
   valid latitude and longitude values. Do not choose a real sensitive
   location. Manual coordinates must be within the normal geographic ranges:
   latitude `-90` to `90`, longitude `-180` to `180`.
3. Confirm the selected coordinates are shown and the map centres on that
   point. The same non-blocking nearby-record check runs for a map click and
   valid manual coordinate entry; it considers `active`/`demo` public records
   only.
4. Submit a clearly fictional title such as `Local test — do not publish` and a
   generic type such as `Fixed dome`.
5. If exercising the optional fields, use a fictional manufacturer and a valid
   observation date in ISO form (`YYYY-MM-DD`). Do not use them for
   operational claims. Both values stay private in the record unless their
   individual publication choices are enabled.
6. Leave the address empty or use `Fictional test location`; use a short note
   that contains no personal or operational information.
7. Confirm the form notice: with a verified account the report is published
   **immediately** as `active` (ADR 0021).

After submitting, confirm the new title **is** present in the public map,
directory, `http://localhost:3000/api/cameras`, and its CSV and GeoJSON
exports.

## Community transitions (automatic)

With a second verified contributor (or the same one where allowed by the
anti-gaming rules), cast community actions on the fictional record and verify
the automatic thresholds (ADR 0021 §4/§5, defaults in `community_settings`):

| Actions | Expected result |
| --- | --- |
| `gone` sum ≥ 3 (≥ 3 distinct) | record → `removed`; gone actions consumed; public timeline event recorded |
| `problem` sum ≥ 3 (≥ 2 distinct) | record → `hidden`; banner contract on direct link |
| `privacy` (1 action) | record → `hidden` |
| contrary consensus (`confirm` above restore thresholds) | record restored to `active` (with cooldown when the hide reason was privacy) |

Check the public per-record timeline on the record page shows the events
without contributor identities.

## Edit requests and corrections (human review)

- **Edit a published record** (owner): `/records/[id]/edit` submits a
  `camera_edit` request that appears in the local moderation dashboard
  (`/moderation`) under **Edit requests**; applying it updates the record,
  discarding it leaves the record unchanged. Pending (legacy) records get a
  direct owner-only update instead.
- **Submit a correction** via `/correggi`: the request is private and
  human-reviewed; verify it never appears in any public output and that its
  resolution is recorded.

## Nearby API check

The local proximity endpoint is:

```text
/api/cameras/nearby?latitude=41.9004&longitude=12.4936&radius=100
```

`latitude` and `longitude` are required. `radius` is optional and defaults to
75 metres; when supplied it must be between 10 and 500 metres. A malformed,
out-of-range, or incomplete query must return a validation error rather than a
broader dataset. The endpoint is derived from the same `active`/`demo` public
list as `/api/cameras`; it is not a separate database query.

## Reset a local exercise safely

Local state can include submitted fictional reports and their audit history.
Treat it as data even in local development.

1. Stop the development server before changing any local state.
2. Identify the project-local runtime state directory created by the local
   worker tooling (`.wrangler/state/`), and make a dated copy outside the
   project before changing it. The exact non-destructive move-aside commands
   are in [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md#6-reset).
3. Prefer creating a fresh workspace copy for a clean exercise instead of
   erasing the existing state.
4. If a maintainer intentionally clears local state, restart the server and
   verify the API returns an empty list, or exactly the two labelled demo
   records after an explicit `npm run db:seed`.

This playbook intentionally provides no destructive reset command. Never use a
reset procedure against a deployment, shared environment, or any data that may
contain real reports.

## Automated verification

Run the project test suite before considering a local change complete:

```bash
npm test
```

The suite builds the application and checks the static publication boundaries:
only `active`/`demo` camera records may reach public JSON, CSV, GeoJSON, and
nearby responses; correction, moderation and community-action surfaces remain
separate from public pages. It also guards the manual-coordinate fallback so
it continues to use the same selection and nearby-check flow as the map.
