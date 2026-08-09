# Import adapters — Phase B (kanban t_c338e9df)

Per-source adapters of the import pipeline (blueprint:
`docs/data-sources/normalizzazione-pipeline.md`). Each adapter is the
source-specific *front half*: fetch + parse → staged rows in our canonical
schema. The shared *runner* (D1 batch, full Pass 2 dedup, events,
rollback) is Phase A (`scripts/import/` + migration 0040); these adapters
are what the runner reads.

## Current adapters

| Slug | Source | Licence | Format |
| --- | --- | --- | --- |
| `zurigo-videokameras-2026` | Stadt Zürich — Open Data | CC0 1.0 | CSV (per-site) |
| `milano-varchi-2026` | Comune di Milano — Open Data | CC BY 3.0 IT | GeoJSON (CKAN, Area C + B) |
| `osm-surveillance-italia-2026` | OpenStreetMap | ODbL 1.0 (OSM) | Overpass API (Italy bbox in chunks) |

Descriptor: `docs/data-sources/imports/<slug>.json` (design § 8.2 keys).

## Contract (interface consumed by the Phase A runner)

Each `.mjs` module exports:

- `slug` (string) — batch slug, must match the descriptor.
- `getDescriptor()` → descriptor object (parsed JSON).
- `fetchPayload()` → `{ ...raw payload, checksum }` (sha256 of the payload,
  design § 7.6). Retry/backoff and the project User-Agent are already inside.
- `parsePayload(raw)` → `{ staged, skipped, checksum }`
  - `staged`: array of **canonical** rows (design § 2):
    `{ title, kind, latitude, longitude, direction, address, notes,
      description, external_id }` — `source` (`import:<slug>`) and
    `import_batch_id` are runner-owned and must NOT be set here.
  - `skipped`: `{ total, reasons }` with per-reason counts (for the report).
  - `checksum`: may be `null` (the runner uses the one from `fetchPayload`).

Rules already applied inside the adapters (do not duplicate in the runner):

- coordinates validated at parse (finite lat/lon, no `(0,0)` from empty
  strings — see `parseCoord`);
- `kind` already canonical (never the source string); `direction` already
  int 0–359 or `null`; domes already with `direction = null`
  (DOME_KIND invariant);
- `external_id` stable and idempotent (prefixed source id or deterministic
  hash § 7.4);
- privacy gate § 7.6 already applied (no PII, operator only if an entity).

## Usage

```bash
# dry-run (default: no writes) — prints n total/valid/invalid,
# intra + cross dedup vs local D1, review candidates; writes report JSON.
npm run import:dry-run -- --slug=zurigo-videokameras-2026
npm run import:dry-run -- --slug=milano-varchi-2026 --out=/tmp/milano.json
npm run import:dry-run -- --slug=osm-surveillance-italia-2026 --db=/path/to/d1.sqlite
```

`--limit=N` trims the staged rows (quick dry-runs), `--db=` points to a
D1 sqlite (default: automatic discovery in `.wrangler/state`).

> The dry-run harness (`dry-run.mjs`) is a development tool: Pass 2 dedup
> uses local mirrors of `textSimilarity`/`haversine` (the same formulas as
> `app/lib/duplicate-detection.ts`) so it runs without a TS build. The
> Phase A runner will use the real modules.

## Tests

```bash
node --test tests/import-adapters.test.mjs
```

Offline, with fixtures: field mapping, kind/direction, validation, skip_if,
external_id idempotency, operator-PII gate.
