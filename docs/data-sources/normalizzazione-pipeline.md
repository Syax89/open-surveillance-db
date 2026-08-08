# Normalisation pipeline for public camera datasets — design

- **Status:** draft (design phase — kanban t_74e02c5a, FONTI PUBBLICHE #3)
- **Date:** 2026-08-04
- **Author:** Ken (DevSecOps / CI)
- **Scope:** design only, no implementation. This document is the blueprint the
  implementation phases will follow.
- **Inputs (in progress, same workstream):**
  - FONTI PUBBLICHE #1 census → `docs/data-sources/censimento-fonti.md`
    (concrete source inventory: URLs, entities, formats, licences, quality)
  - FONTI PUBBLICHE #2 licence matrix → `docs/data-sources/licenze-compatibilita.md`
    (ODbL-compatibility of each source licence)
- **Related docs:** ADR 0008 (data licence + ~10 m public coordinate rounding),
  ADR 0019 (pre-submit duplicate gate), ADR 0020 (verified-account write gate),
  ADR 0021 (community-driven pivot), `docs/OSM_INTEGRATION.md` § 7 (data
  boundary: an OSM import needs a documented tag mapping, licence analysis and
  a reversible workflow — this document is that design),
  `docs/OPEN_SOURCE.md` (ODbL obligations), `docs/DATA_MODEL.md` (pre-pivot
  model; will be updated in the pivot phase),
  `app/lib/duplicate-detection.ts`, `db/cameras.ts`, `db/schema.ts`,
  `drizzle/0036-0039_*`.

## 0. Executive summary (decisions)

| # | Question | Decision |
| --- | --- | --- |
| D1 | What status do imported records get? | **`active`**, exactly like community reports, with `last_verified_at = NULL`. No new status, no new badge field: ADR 0021 § 9.1 already renders `last_verified_at IS NULL` as "never confirmed", which is precisely the "imported, awaiting community validation" semantic. |
| D2 | Provenance convention | `cameras.source = 'import:<batch-slug>'` (e.g. `import:milano-videosorveglianza-2026`), plus a new **`import_batches`** table (one row per import run, UNIQUE slug) and two new `cameras` columns: **`external_id`** (source-native id, for idempotency) and **`import_batch_id`** (FK, for attribution and rollback). |
| D3 | Duplicate strategy | Reuse `app/lib/duplicate-detection.ts` primitives in an **offline batch** mode against **all non-`demo` records** on **raw** coordinates. < 10 m + same kind → auto-skip; < 10 m + different kind → review; ≤ 75 m + text ≥ 0.6 → auto-skip; ≤ 200 m + text ≥ 0.6 → review; collision with `hidden`/`removed` → review (an import never silently resurrects a community-removed camera). |
| D4 | Merge | **Disabled in v1** (duplicate → skip + report). Optional "enrich-only" merge (fill NULL fields, never overwrite community data) is designed but behind a per-source flag, with rollback payload capture. |
| D5 | Pipeline shape | **One-shot idempotent runner**, `npm run import:run -- --slug=<slug>` (dry-run default, `--apply` to write). **No cron in v1.** A scheduled refresh for a curated allow-list of stable sources is a later phase. |
| D6 | Schema change | One hand-written migration **0040** (`import_batches` + two `cameras` columns + partial UNIQUE index + rollback index), declared in `db/schema.ts` (project convention 0012/0014). |
| D7 | Event model | Every inserted camera gets one public `camera_lifecycle_events` row `event_type='imported'` (detail: `{batch, external_id}`), so provenance shows on the record page without attribution. No actor, no PII — ADR 0021 § 7. |

## 1. Context

The CEO's workstream FONTI PUBBLICHE wants public camera datasets imported
into the directory (municipal open-data portals, OSM surveillance nodes, EU
portals, civic projects). The census (#1) inventories the concrete sources;
the licence matrix (#2) decides which licences are importable into an ODbL 1.0
database. This document designs **how** an import works once the *what*
(source + licence) is approved: normalisation to the canonical `cameras`
schema, deduplication against existing records (community reports **and**
previous imports), provenance and rollback, state semantics coherent with
ADR 0021, the pipeline mechanics, and the quality gates.

Constraints taken as given:

- The database and every export are **ODbL 1.0** (ADR 0008); code is AGPL.
  Every imported row stays inside that boundary; attribution obligations of
  the *source* licence are handled by #2 and surfaced in `/licenze` + exports.
- **Privacy and safety by design** (project rule): imports ingest only camera
  metadata; never personal data (operator names/emails/phones), never photo
  evidence, never PII in `notes`/`description`.
- Community data is **ground truth**: an import may add information but never
  silently overwrite a community-reported value, status, or verification state.
- The ADR 0021 state machine (`active` / `hidden` / `removed` / `demo`,
  community-driven transitions) is the **only** state machine. The design adds
  no states and no transitions to it.

## 2. Canonical target row

Every source format is normalised to one canonical staged row; after dedup the
staged rows become `cameras` rows.

| cameras column | Required? | Import rule |
| --- | --- | --- |
| `title` | **yes** | From source `name`/description, or generated deterministically (see § 7.2). ≤ 90 chars, language-neutral when possible. |
| `kind` | **yes** | Mapped to the canonical vocabulary (`Fixed dome`, `Bullet`, `PTZ`, `Traffic / licence plate reader`, `Other / unknown` — `app/lib/camera-kinds.ts`). Unmapped source value → `Other / unknown` + report note. Never invented. |
| `manufacturer` | no | Mapped if the source has it (rare); else NULL. |
| `address` | no | Assembled from source street/number/city fields or `addr:*` tags; else NULL. ≤ 180 chars. |
| `latitude` / `longitude` | **yes** | WGS84 (EPSG:4326), **raw precision** (the DB stores exact; public reads round to ~10 m, ADR 0008). See § 7.1. |
| `direction` | no | 0–359 integer, NULL when unknown. Domes always NULL (invariant `DOME_KIND`, migration 0035). |
| `status` | **yes** | `'active'` — D1. |
| `source` | **yes** | `'import:<batch-slug>'` — D2. |
| `notes` | no | Empty, or a deterministic provenance note (e.g. `Imported from <source_name>, <batch-slug>`). Never free text from the source. |
| `description` | no | Mapped from a source description field, if present and non-personal. |
| `observed_on` | no | Mapped from a source date if present; `publish_observed_on` stays 0 unless the source licence allows showing it (default: hidden). |
| `last_verified_at` | **NULL** | D1 — never confirmed. |
| `review_due_at` / `review_interval_months` | defaults | NULL / 12 (schema default). Purely informational (ADR 0021 § 9.2). |
| `contributor_id` | NULL | Imports are not community submissions; attribution lives in `import_batches`. |
| `external_id` | **yes** | Source-native stable id (`node/12345`, municipal row id, or a deterministic hash, § 7.4). |
| `import_batch_id` | **yes** | FK to the run that inserted the row. |
| `publish_manufacturer` | 0 | Manufacturers only public when a community report set the flag. |

## 3. Field mapping by format family

Mapping is driven by a **source descriptor** (JSON, versioned in the repo,
§ 8.2) — a declarative column-map plus transforms — never hard-coded per
source. The three families below are the generic shapes; each concrete source
from the census gets a descriptor that pins the aliases.

### 3.1 Municipal CSV (typical Italian open-data portal)

Typical shape (e.g. `dati.comune.milano.it`, Torino, Bologna, Roma): a table
with an id, a description/tipologia column, gestore/ente, indirizzo, and
coordinates — frequently **not** WGS84 (UTM 32N / RDN2008 or comma-decimal).

| Source column (aliases, case-insensitive) | → cameras | Transform |
| --- | --- | --- |
| `id` / `cod` / `codice` / `id_impianto` | `external_id` | `milano:<value>` prefix per source in the descriptor |
| `descrizione` / `tipologia` / `tipo` / `desc` | `title` + `kind` | title: trimmed text; kind: § 3.4 table |
| `gestore` / `ente` / `operatore` / `proprietario` | — | dropped (potential PII) or into `notes` only if it is an entity name, never a person |
| `indirizzo` / `via` + `civico` + `comune` | `address` | joined `via civico, comune` |
| `lat` / `latitude` / `latitudine` / `y_wgs84` / `y` | `latitude` | parse comma-decimal, reproject if needed (§ 7.1) |
| `lon` / `longitude` / `longitudine` / `x_wgs84` / `x` | `longitude` | same |
| `direzione` / `orientamento` | `direction` | § 3.5 |
| `stato` / `stato_attivazione` | — | **not** mapped to `cameras.status` (see § 5.4); only a `skip_if` filter in the descriptor (e.g. `skip_if: { stato: "dismesso" }`) |
| anything else | — | ignored (whitelist per descriptor; unknown columns are logged, never ingested) |

Descriptor keys for CSV: `encoding` (default utf-8, fallback latin1),
`delimiter` (`,` / `;`), `decimal_comma` (bool), `crs`, `skip_rows`,
`skip_if`, `columns` (alias→target map), `external_id_prefix`.

### 3.2 GeoJSON (municipal APIs, dati.gov.it, data.europa.eu, WFS GetFeature)

A `FeatureCollection` of Points (rarely Polygons for zones — filtered out or
centroid-ed only when the descriptor says so).

| GeoJSON member | → cameras | Notes |
| --- | --- | --- |
| `feature.id` or a properties id field | `external_id` | prefer a stable properties key (`id`, `COD`, `@id`) |
| `geometry.coordinates [lon, lat]` | `longitude`, `latitude` | **always check `crs`** — default EPSG:4326, but 3857/32632 appear; reproject (§ 7.1) |
| `properties.name` / `description` / `denominazione` | `title` | |
| `properties.type` / `tipologia` / `tipo` / `category` | `kind` | § 3.4 |
| `properties.operator` / `gestore` | `manufacturer` or dropped | only if it is a manufacturer (e.g. Hikvision); entity names go nowhere |
| `properties.url` / `website` | `notes` (as `Fonte: <url>`) | optional |
| `properties.direction` / `bearing` | `direction` | § 3.5 |
| `properties.address` / `addr:street` … | `address` | |

Descriptor keys for GeoJSON: `properties_map` (property→target), `crs`,
`id_property`, `filter` (e.g. `type == 'FeatureCollection'` only; reject
GeometryCollections unless a `pick_first` flag).

### 3.3 OSM surveillance nodes (`man_made=surveillance`)

Extracted via Overpass (e.g. `node["man_made"="surveillance"]` or
`way[...]`) → GeoJSON, then mapped. **Attribution: derived from OSM data
© OpenStreetMap contributors, ODbL 1.0** — this is a *derivative database* and
the share-alike obligations are handled by #2; `import_batches.license` must
record `ODbL 1.0 (OSM)`. OSM_INTEGRATION.md § 7 data boundary applies: this
workflow is the documented, reversible import path.

| OSM tag | → cameras | Notes |
| --- | --- | --- |
| `@id` (`node/12345`) | `external_id` | `osm:<@id>` |
| `name` | `title` | fallback: `operator` + ` surveillance camera`, or generated (§ 7.2) |
| `camera:type` | `kind` | `dome`→`Fixed dome`, `panning`→`PTZ`, `fixed`→`Bullet` (ambiguous fixed → see § 3.4), `ALPR`/`traffic`→`Traffic / licence plate reader` |
| `surveillance:type` | `kind` (override) | `ALPR`→`Traffic / licence plate reader`; `camera`→keep `camera:type` mapping; `guard`→skip (not a camera) |
| `camera:direction` | `direction` | numeric degrees or compass (N, NE, NNW…) → § 3.5 |
| `operator` | — | kept in `notes` as `Operatore: <value>` only when it is a public entity; dropped if it looks like a person |
| `addr:street` / `addr:housenumber` / `addr:city` | `address` | joined |
| `man_made=surveillance` | filter | required tag of the query |
| `surveillance=indoor` | filter | `skip_if` — indoor cameras are out of scope for a *public* directory |
| `camera:mount` / `level` / `height` | — | ignored in v1 |

Descriptor keys for OSM: `overpass_query` (or a saved overpass file),
`tag_map`, `kind_map`, `skip_if`, `attribution` (`OpenStreetMap contributors`).

### 3.4 Kind mapping (source vocabulary → canonical)

The mapping lives in each descriptor (`kind_map`), with these defaults for
Italian municipal text and OSM values:

| Source value (lowercased, diacritics-folded) | Canonical kind |
| --- | --- |
| `dome`, `cupola`, `a cupola`, `telecamera a cupola`, `camera:type=dome` | `Fixed dome` |
| `bullet`, `a proiettile`, `fissa`, `camera:type=fixed` | `Bullet` (see ambiguity note) |
| `ptz`, `motorizzata`, `brandeggiabile`, `camera:type=panning` | `PTZ` |
| `targa`, `lettura targhe`, `ocr`, `targa reader`, `varchi ztl`, `alpr`, `camera:type=alpr`, `surveillance:type=alpr`, `traffic`, `velox`, `tutor` | `Traffic / licence plate reader` |
| anything else / missing | `Other / unknown` |

> Ambiguity note: `fissa` / `camera:type=fixed` does not say *dome vs bullet*.
> Default is `Bullet` only when the source text says bullet/proiettile;
> bare `fissa`/`fixed` → `Other / unknown` with a report note, because a
> misclassified kind is worse for the map cone rendering than an honest
> unknown. Domes are the one case where the kind itself forces `direction
> NULL` (invariant), so the mapping must be conservative.

### 3.5 Direction parsing

- Numeric string `0..359` (or `360` → normalized to 0): stored as integer.
- Compass word (OSM `camera:direction` allows `N, NNE, NE, …` and Italian
  `nord, nord-est, …`): map to the centre of the sector (N=0, NE=45, E=90,
  SE=135, S=180, SW=225, W=270, NW=315; 16-wind rose → 22.5° steps,
  rounded to integer).
- Anything else / missing → `NULL`.
- Post-map invariant: if the final kind is `Fixed dome`, force `direction =
  NULL` (schema invariant, `DOME_KIND`).

## 4. Duplicate strategy

Two passes, both reusing the existing primitives from
`app/lib/duplicate-detection.ts` (`normalizeText`, `tokenSet`,
`textSimilarity`, `classifyDuplicateMatch`) — no new detection code for the
core math.

### 4.1 Pass 1 — intra-source (inside the same dataset)

Group staged rows by **snapped coordinates** (round to 4 decimals ≈ 11 m,
matching the ADR 0008 public rounding) **+ kind**:

- same snap-cell + same kind → keep the row with the highest field
  completeness (title + address + manufacturer + direction present), skip the
  rest (count `records_skipped_duplicate`);
- same snap-cell + different kind → keep **both** (a pole with a dome and a
  traffic camera is real), flag the pair in the report;
- `external_id` duplicates (same source id twice) → keep first, skip rest.

### 4.2 Pass 2 — cross-source (against the whole database)

For each staged row, query **all** non-`demo` cameras (`active`, `hidden`,
`removed` — NOT the public predicate; `demo` excluded entirely) inside a
bounding box around the staged point on **raw** stored coordinates (pattern
of `listPublicCamerasNear` with `rawCoordinates: true`, radius 200 m +
15 m padding for the rounding displacement). Then classify per candidate
(`distance` = haversine on raw coords, `similarity` = `textSimilarity` of
title+address+kind):

| Rule | Outcome | Counted as |
| --- | --- | --- |
| `distance ≤ 10 m` AND same kind | **skip** (auto-duplicate) | `records_skipped_duplicate` |
| `distance ≤ 10 m` AND different kind | **review** | `records_review` |
| `10 < distance ≤ 75 m` AND `similarity ≥ 0.6` | **skip** | `records_skipped_duplicate` |
| `75 < distance ≤ 200 m` AND `similarity ≥ 0.6` | **review** | `records_review` |
| candidate status is `hidden` or `removed` (any distance ≤ 200 m) | **review** — never silently resurrect a camera the community withdrew/removed | `records_review` |
| otherwise | **insert** | `records_inserted` |

Rationale for the thresholds (vs the interactive gate, ADR 0019): the
interactive gate uses `≤ 25 m` = high because a human confirms; a batch import
has no human in the loop, so the *auto-skip* band is tighter (`< 10 m` same
kind — the task's explicit requirement "prossimità spaziale <10m + tipo") and
everything ambiguous goes to the **review list** in the batch report for a
human/operator pass, not to the database. The `< 10 m` figure is also the
resolution of the public coordinate rounding (ADR 0008 ≈ 10 m): two raw points
closer than 10 m are indistinguishable on every public surface.

Review items are **not** written to any queue table in v1 (ADR 0021 retired
`moderation_queue` for the normal flow; no new queue). They live in the batch
`report` JSON + console output; an operator resolves them with the normal
tools (community actions, corrections, or a corrected descriptor + re-run).

### 4.3 Direction of the dedup relationship

- Import vs existing **community report** → Pass 2 catches it (the report is
  `active`, raw coords, same rules). The community report wins: the import row
  is skipped.
- Community report vs existing **import** → the pre-submit gate
  (ADR 0019, `POST /api/cameras`) already warns the user about nearby public
  records; imported records are public, so the gate covers this direction with
  **no change**.
- Import vs previous **import** → `(source, external_id)` partial UNIQUE
  index + Pass 2. A re-run of the same batch is a no-op by key; a *different*
  batch covering the same camera (e.g. municipality CSV + OSM) hits Pass 2 and
  skips.

### 4.4 Merge (designed, disabled in v1)

Descriptor flag `enrich: true` enables *enrich-only* merging: when Pass 2
classifies a candidate as skip/review, the runner may fill **NULL** columns of
the existing `active` record (`manufacturer`, `address`, `direction`,
`observed_on`) from the staged row. Hard rules:

- never overwrite a non-NULL value;
- never touch `status`, `contributor_id`, `last_verified_at`, `created_at`,
  `source`, `title`, `kind`, coordinates;
- append a deterministic note (`notes += "\nArricchito da import:<slug>"`);
- every changed value is recorded in `import_batches.rollback_payload`
  (`{camera_id: {column: oldValue}}`) so the rollback restores it.

v1 ships with `enrich` **false** everywhere: community data is ground truth
and a silent auto-merge is a correctness risk; the community can add a missing
manufacturer through the normal edit flow. The mechanism is designed now so a
later phase flips it per source without a redesign.

## 5. State semantics (coherent with ADR 0021)

- Imported rows are inserted **`status = 'active'`** and become public
  immediately — exactly the ADR 0021 publication model for community reports
  (§ 1: no pending queue). There is no moderation step for imports either.
- `last_verified_at` stays **NULL** → the existing UI badge "never confirmed"
  (ADR 0021 § 9.1) is the "importato, mai confermato" indicator. No schema
  change, no new status, no new transition: the community validates imported
  cameras with the **same** `confirm` / `gone` / `problem` / `privacy`
  actions (camera_community_actions), and a `confirm` refreshes
  `last_verified_at` like any other record.
- Why **not** a dedicated `imported` status or an `imported_at` badge column:
  - it would fork `PUBLIC_CAMERA_STATUSES`, every public read path, and the
    transition matrix for zero product value — the never-confirmed badge
    already says everything the directory needs;
  - provenance is a **fact about the row's origin**, already carried by
    `source` + `import_batch_id` + the `imported` lifecycle event;
  - a record whose import data is corrected by a community edit must not stop
    being "confirmed-able" — a status would entangle origin with freshness.
- `demo` is never produced by imports (gate: imports only insert `active`).

### 5.1 Lifecycle events

On insert, each imported camera gets one public event
(`camera_lifecycle_events`, no actor):

```json
{ "event_type": "imported", "detail": { "batch": "milano-videosorveglianza-2026", "external_id": "milano:42" } }
```

`imported` joins the documented event-type vocabulary of ADR 0021 § 7
(no CHECK constraint exists on `event_type` — vocabulary is code/docs-level,
so no migration is needed for the type itself). The record page's history
panel then shows provenance without attribution. One event per row is cheap
(INSERT-time, same batch as the row).

### 5.2 Source-status conflicts

A municipal column like `stato = dismesso` must **not** map to
`cameras.status` (that is the community's state machine). It becomes a
descriptor `skip_if` filter (drop the row) or, when the source is newer than
our data, a **review** item. Imported data can never force `hidden`/`removed`.

## 6. Provenance & attribution

### 6.1 `source` convention

- Community reports: `'Community report'` (existing, unchanged).
- Imports: `'import:<batch-slug>'`, exact equality, e.g.
  `import:milano-videosorveglianza-2026`, `import:osm-surveillance-2026-08`,
  `import:torino-tvcc-2026`.
- `batch-slug` = lower-kebab `<dataset>-<year>`; a refresh of the same dataset
  in the same year appends `-r2`, `-r3`…, or the month (`-2026-08`). The slug
  is the unique key of `import_batches`, so `source` is a stable, parseable
  provenance string that is already exposed verbatim in the CSV/GeoJSON
  exports and record pages — attribution by construction.
- `source` is **immutable** for the life of the row (never rewritten by
  re-imports; a new batch creates new rows or enriches, old rows keep their
  origin).

### 6.2 `import_batches` table (new)

```sql
CREATE TABLE `import_batches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `slug` text NOT NULL UNIQUE,                -- 'milano-videosorveglianza-2026'
  `source_name` text NOT NULL,                -- 'Comune di Milano — Open Data'
  `format` text NOT NULL,                     -- 'csv' | 'geojson' | 'osm-overpass' | 'wfs'
  `license` text NOT NULL,                    -- 'IODL 2.0' | 'ODbL 1.0 (OSM)' | 'CC-BY 4.0' | ...
  `license_url` text,
  `source_url` text NOT NULL,                 -- landing page / download URL (from #1 census)
  `import_date` text NOT NULL,                -- ISO 8601
  `status` text NOT NULL DEFAULT 'running'
      CHECK (status IN ('running','committed','rolled_back','failed')),
  `records_total` integer NOT NULL DEFAULT 0,
  `records_inserted` integer NOT NULL DEFAULT 0,
  `records_skipped_duplicate` integer NOT NULL DEFAULT 0,
  `records_merged` integer NOT NULL DEFAULT 0,
  `records_review` integer NOT NULL DEFAULT 0,
  `records_invalid` integer NOT NULL DEFAULT 0,
  `source_checksum` text,                     -- sha256 of the downloaded payload
  `rollback_payload` text,                    -- JSON {camera_id: {col: oldValue}} (merge phase)
  `report` text,                              -- JSON: per-row errors, review candidates, kind_map misses
  `notes` text,
  `created_by` text NOT NULL DEFAULT 'import-runner',
  `created_at` text NOT NULL
);
CREATE INDEX `import_batches_status_idx` ON `import_batches` (`status`);
```

Every field the task listed is present: fonte (`source_name` + `source_url`),
licenza (`license` + `license_url`), data import (`import_date`), n record
(the `records_*` counters), per attribuzione (`slug` + FK on cameras) e
rollback (`status` + `rollback_payload`).

### 6.3 `cameras` additions (migration 0040)

```sql
ALTER TABLE `cameras` ADD COLUMN `external_id` text;
ALTER TABLE `cameras` ADD COLUMN `import_batch_id` integer REFERENCES `import_batches`(`id`);
CREATE UNIQUE INDEX `cameras_source_external_unique`
  ON `cameras` (`source`, `external_id`) WHERE `external_id` IS NOT NULL;
CREATE INDEX `cameras_import_batch_idx` ON `cameras` (`import_batch_id`);
```

- `external_id` — source-native stable identifier, NULL for community reports.
  The partial UNIQUE is the **idempotency key**: re-running a batch can never
  double-insert a row.
- `import_batch_id` — direct rollback/attribution handle (cleaner than
  parsing `source`). No `ON DELETE` action needed: batch rows are never
  deleted; rollback deletes *cameras* rows, not the batch row.
- Drizzle schema.ts declarations for both columns and both indexes (project
  convention: hand-written migration + schema declaration together).

### 6.4 Attribution surfaces (later phase)

- `/licenze` page: new section listing `import_batches` (source_name, license
  + link, source_url, import_date, counts) — the "pattern di attribuzione nel
  sito" required by #2.
- Exports (`/api/cameras?format=csv|geojson`): `source` column already present
  → imported rows carry `import:<slug>` automatically; the ODbL notice stays.
  For OSM-derived rows the notice must add "© OpenStreetMap contributors"
  (exact wording per #2).
- Record page: show the source string; when `import_batch_id` is set, render
  "Imported from <source_name> on <import_date> · never confirmed" (the
  existing never-confirmed badge covers the second half).
- No public API change: the shared public predicate (ADR 0021, `active` in
  `PUBLIC_CAMERA_STATUSES` in the pivot's FASE 2 code change) exposes imported
  rows on every surface (list, map, bbox, sitemap, exports) automatically.

## 7. Quality gates

### 7.1 Coordinates & CRS

- Reject rows with missing / non-finite / out-of-range lat (`[-90, 90]`) or
  lon (`[-180, 180]`).
- Reject `(0, 0)` unless the descriptor whitelists it (some datasets use
  `0,0` for "unknown").
- CRS: descriptor declares the source CRS (default EPSG:4326). Known Italian
  offenders: EPSG:32632 (UTM 32N), EPSG:32633, EPSG:3857, EPSG:6706
  (RDN2008). Reproject to WGS84 before staging. Recommended: `proj4`
  devDependency (small, standard); if the team prefers zero new deps, hardcode
  the ~6 transforms above with explicit tests — documented trade-off, decided
  at implementation time.
- Store **raw** precision in D1 (ADR 0008: public surfaces round to ~10 m; the
  DB keeps the exact point so dedup and moderation stay precise).

### 7.2 Minimum fields & generated title

Required per staged row: `title`, `latitude`, `longitude`, `kind`,
`source`, `external_id`. Anything else optional.

Title generation (deterministic, ≤ 90 chars, no invented claims) when the
source has no usable name:

1. `operator` + ` surveillance camera` (e.g. `Comune di Milano surveillance camera`) — only if operator is an entity;
2. `Surveillance camera, <street> <number>` from the assembled address;
3. `Surveillance camera` + nothing else (last resort).

### 7.3 Kind & direction validation

- Kind must be one of the canonical values; unmapped → `Other / unknown` +
  report note (never invent, never store the raw source string).
- Direction: integer 0–359 after parsing; dome → forced NULL.
- `kind` is a controlled string in the backend, but the import runner
  validates against the canonical list because the map rendering depends on it.

### 7.4 `external_id` generation

Prefer the source's own stable id (prefixed: `milano:`, `osm:`). When the
source has none, generate deterministically: `sha1(normalizeText(title) + '|' + lat.toFixed(6) + '|' + lon.toFixed(6))` — stable across re-runs, so
idempotency survives even id-less datasets.

### 7.5 Row-level errors & caps

- Bad rows never abort the batch: each row's error is collected in the
  `report` JSON (`records_invalid` counter); descriptor `strict: true` flips
  to fail-fast for tiny high-trust sources.
- Hard caps in the descriptor: `max_records` (default 100 000) and a
  per-run size guard on the payload (e.g. 200 MB) — a runaway import cannot
  hammer D1 or the source.
- Summary invariants checked at the end of every run:
  `records_total = inserted + skipped_duplicate + merged + review + invalid`.

### 7.6 Privacy & security (DevSecOps gates)

- **No PII ingestion**: descriptor column whitelist only; any source column
  matching person-ish patterns (email, phone, nome/cognome) is dropped and
  logged. `notes`/`description` never carry free source text.
- **No credentials**: descriptors and workflows contain URLs/licences only;
  any API key (WFS, portals) comes from the runner environment (`env`), never
  from the repo, never from a workflow secret that could leak into logs
  (gitleaks scans descriptors too).
- **Source etiquette**: the runner sends the project User-Agent
  (`OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db;
  contact: privacy@opensurveillancedb.org)` — same as the tile/geocode
  proxies), respects `robots.txt`/ToS, and throttles (min interval between
  requests; Overpass: standard usage policy, one query, low rate).
- **Reproducibility**: `source_checksum` (sha256 of the fetched payload) is
  stored on the batch row; a re-run against a changed payload is a *different
  batch* (new slug) unless `--force` explicitly refreshes.
- **Rollback is reversible-undo, not data loss**: it deletes only rows the
  batch itself inserted (their cascaded lifecycle events) and restores merged
  fields from `rollback_payload`; every rollback writes an internal
  `moderation_events` audit row (`action='import-rollback'`,
  actor `'import-runner'`) so the operation is attributable internally while
  the public projection stays clean.

## 8. Pipeline design

### 8.1 One-shot idempotent runner vs cron — decision: one-shot first

**Decision (D5):** a one-shot, repeatable, idempotent runner invoked manually;
**no cron in v1**.

Rationale:

- Imports are **low-frequency and high-stakes**: municipal datasets refresh
  yearly/quarterly at best, each run publishes public records and touches the
  community dataset — a human reviews the dry-run diff and the review list
  before `--apply`.
- **Source schemas drift** (column renames, CRS changes, portal API changes):
  an unattended cron importing garbage into the public directory is the worst
  failure mode. A manual run fails loudly in the terminal.
- **Licence cadence is human**: #2 gates each source; a cron must not import
  before the licence review is done. `import_batches.license` is written by
  the human-approved descriptor, not by the scheduler.
- The project already has a cron slot (`wrangler.jsonc` `0 3 * * *`) for
  freshness/backup; imports deliberately stay out of it.

A scheduled refresh (cron) is a **later phase**, only for an allow-list of
stable, licence-cleared sources (e.g. OSM extract monthly), with the same
runner behind a `--cron` mode that aborts when the source payload checksum
differs (schema drift detection) instead of importing blind.

### 8.2 Source descriptors

`data-sources/imports/<slug>.json`, versioned in the repo, reviewed like code
(PR + gitleaks). Shape (validated at load time; a broken descriptor is a
runner error, not a partial import):

```jsonc
{
  "slug": "milano-videosorveglianza-2026",
  "source_name": "Comune di Milano — Open Data",
  "format": "csv",                          // csv | geojson | osm-overpass | wfs
  "license": "IODL 2.0",                    // per #2 matrix
  "license_url": "https://…",
  "source_url": "https://…/dataset/videosorveglianza",
  "encoding": "utf-8",
  "delimiter": ";",
  "decimal_comma": true,
  "crs": "EPSG:32632",
  "columns": { "id": "external_id", "tipologia": "kind", "via": "address", "lat": "latitude", "lon": "longitude", "direzione": "direction" },
  "kind_map": { "cupola": "Fixed dome", "fissa": "Other / unknown" },
  "skip_if": { "stato": "dismesso" },
  "external_id_prefix": "milano:",
  "enrich": false,
  "max_records": 100000
}
```

### 8.3 Runner steps (`scripts/import-run.mjs`, `npm run import:run`)

1. Parse CLI: `--slug=<slug>` (required), `--dry-run` (default),
   `--apply`, `--force` (refresh of an existing slug), `--rollback` (see 8.5).
2. Load + validate the descriptor (JSON schema). `--apply` requires the
   descriptor's `license` to be in the #2-compatible set (hard gate).
3. If `--apply`: `INSERT INTO import_batches (slug, …, status='running')` —
   UNIQUE slug aborts with a clear message (batch exists; use `--force` for a
   refresh or a new slug for a new run).
4. Fetch the payload (`fetch` with the project User-Agent + throttle, or a
   local file path for offline staging). Compute sha256 → `source_checksum`.
5. Parse per family (§ 3) → staged canonical rows (raw WGS84, validated).
6. Dedup Pass 1 (intra-source, § 4.1) then Pass 2 (cross-source, § 4.2).
7. Write phase (only with `--apply`), in **D1 batch chunks**:
   - chunk = ≤ 50 staged rows → 100 statements per D1 batch call
     (row INSERT + lifecycle `imported` event; D1 batch limit is 100
     statements/call — chunking is mandatory);
   - every INSERT carries `(source, external_id)` and the partial UNIQUE
     index makes the statement **safe to re-run** (`INSERT … ON CONFLICT DO
     NOTHING` or rely on the index error handled per-chunk) — a crash
     mid-run resumes without duplicates;
   - counts accumulate in memory; on success update the `import_batches` row
     (counters, `report`, `status='committed'`).
8. Print the summary + review list; write the report JSON to
   `data-sources/imports/reports/<slug>-<ts>.json` (and to the batch row).

Dry-run executes steps 1–6 and prints the would-be diff (inserts / skips /
reviews / invalid) without writing anything — the mandatory human gate before
`--apply`.

### 8.4 Idempotency semantics

- Same `slug`, same payload → `(source, external_id)` UNIQUE makes every
  statement a no-op; the batch row is already `committed` → runner aborts
  unless `--force`.
- `--force` (refresh): matches staged rows against `(source, external_id)`;
  existing rows are updated **only** in nullable, import-owned columns
  (address/manufacturer/direction NULL-gap fill per § 4.4 rules, or full
  replace only for rows the batch itself inserted) — never community fields.
  New rows insert; missing rows are not deleted (a source dropping a camera is
  a `gone` signal for the community, not an auto-delete).
- Different slug, same camera (two sources) → Pass 2 dedup, first source wins,
  second skipped (+ report).

### 8.5 Rollback (`npm run import:rollback -- --slug=<slug>`)

1. Load the batch; abort unless `status='committed'`.
2. `DELETE FROM cameras WHERE import_batch_id = ?` → cascades the camera's
   lifecycle events (camera_lifecycle_events `ON DELETE CASCADE`) and
   community actions (camera_community_actions `ON DELETE CASCADE`) — the
   camera never legitimately existed; actions cast on it die with it
   (consistent with erasure semantics, ADR 0021 § 13).
3. If `rollback_payload` is set (merge phase): restore the captured values.
4. Insert internal `moderation_events` audit row
   (`action='import-rollback'`, entity `'camera'`-scoped note with the batch
   slug).
5. Set `import_batches.status='rolled_back'`; print counts.

Rollback never touches community reports (their `import_batch_id` is NULL and
their rows were never modified in v1).

### 8.6 Concurrency

The runner is offline (local Node + `wrangler d1 execute`-style access via the
D1 HTTP/binding pattern used by `scripts/db-reset.mjs`), single-operator:
no two runs for the same slug can race (UNIQUE slug + exclusive batch row).
Community writes (reports/actions) during an import are safe: inserts are
independent rows; dedup reads a consistent snapshot per chunk. No lock needed
in v1; if a cron refresh is added later, the batch `status` + slug lock covers
it.

## 9. Migration plan (Drizzle 0040)

One hand-written migration (`drizzle/0040_import_batches.sql`, journal idx 40,
pattern of 0036–0039) + `db/schema.ts` declarations:

1. `CREATE TABLE import_batches` (DDL § 6.2) + status index.
2. `ALTER TABLE cameras ADD COLUMN external_id text;`
3. `ALTER TABLE cameras ADD COLUMN import_batch_id integer REFERENCES import_batches(id);`
4. `CREATE UNIQUE INDEX cameras_source_external_unique … WHERE external_id IS NOT NULL;`
5. `CREATE INDEX cameras_import_batch_idx ON cameras (import_batch_id);`
6. `db/schema.ts`: declare `importBatches` table + the two cameras columns +
   both indexes (so `drizzle-kit generate` never re-emits them).
7. Post-migration smoke (pattern `scripts/db-migration-smoke.mjs`): counts
   match, UNIQUE index present, existing community rows unaffected
   (`import_batch_id`/`external_id` NULL, zero behavior change).

No data backfill: existing rows are community reports and stay NULL.

## 10. Implementation phases (follow-up tasks, not this doc)

| Phase | Deliverable | Depends on |
| --- | --- | --- |
| P1 | Migration 0040 + schema.ts + smoke test | #2 licence matrix (gates) |
| P2 | Descriptor schema/validation + parsers (CSV, GeoJSON, OSM) + unit tests (fixtures with comma-decimals, UTM, compass directions) | P1 |
| P3 | `scripts/import-run.mjs`: staging, dedup Pass 1+2, dry-run diff, chunked D1 writes, `imported` events | P2 |
| P4 | Rollback + `--force` refresh + report files + `moderation_events` audit | P3 |
| P5 | Attribution UI: `/licenze` source list, record-page "imported from …" + OSM attribution in exports | P3, #2 |
| P6 | Cron refresh allow-list (optional, later) | P4, ops decision |

Each phase is a separate kanban task with its own PR; the runner is exercised
against an in-memory D1 test harness (node:sqlite, pattern of the existing
test suite) with a fixture batch: apply → re-run (idempotent no-op) → rollback
(counts zero, events cascaded, batch `rolled_back`).

## 11. Open questions / dependencies

1. **Census #1** (`docs/data-sources/censimento-fonti.md`, in progress): the
   concrete source list fills the descriptor inventory. The mapping design
   above is format-family-generic and does not block on it; the first
   descriptors (P2) should target the 2–3 highest-ranked sources from the
   census.
2. **Licence matrix #2** (`docs/data-sources/licenze-compatibilita.md`, in
   progress): hard gate in the runner (`--apply` refuses non-compatible
   licences). The `/licenze` attribution pattern in P5 follows its
   recommendations.
3. **ADR 0022?** If the CEO wants the D1–D7 decisions as an ADR (state
   semantics, provenance, dedup thresholds), extract them after this doc is
   reviewed. Not required for implementation.
4. **`camera:type=fixed` → kind**: the conservative default (`Other /
   unknown`) may under-classify OSM bullets; revisit with the census OSM
   sample before P3.
5. **proj4 dependency**: approve `proj4` as devDependency for CRS
   reprojection, or accept the hardcoded-transform variant (§ 7.1).
6. **D1 batch statement budget**: verify the current Cloudflare D1 batch limit
   (100 statements/call) at P3 time and tune the chunk size accordingly.

## 12. Acceptance criteria (design review)

- [ ] Every item of the task is answered: field mapping per typical format
      (CSV comunali, GeoJSON, OSM tags), dedup (< 10 m + kind + user reports),
      provenance convention + `import_batches`, state semantics coherent with
      ADR 0021 (never-confirmed badge), pipeline one-shot idempotent vs cron,
      quality validation.
- [ ] No new status added to the ADR 0021 state machine; imported rows are
      `active` + `last_verified_at NULL`.
- [ ] Dedup reuses `app/lib/duplicate-detection.ts` primitives; nothing is
      auto-merged in v1; hidden/removed collisions go to review.
- [ ] Rollback is defined (rows by `import_batch_id`, cascaded events, audit
      row, `rolled_back` status) and never touches community data.
- [ ] One migration (0040), declared in schema.ts, no backfill.
- [ ] Privacy gates: no PII ingestion, no credentials in descriptors, source
      etiquette, checksums.
