# OSM ALPR imports (DeFlock-equivalent selection): US / CA

Two import sources read **automatic licence plate reader (ALPR)** records from
OpenStreetMap and are selected the same way the DeFlock project selects its
data. This page records what is imported, from where, under which licence, and
what is deliberately **not** imported.

- Adapters: `scripts/import/adapters/osm-alpr-usa-2026.mjs`,
  `scripts/import/adapters/osm-alpr-canada-2026.mjs`
  (shared gate: `scripts/import/adapters/osm-alpr-factory.mjs`)
- Descriptors: `docs/data-sources/imports/osm-alpr-usa-2026.json`,
  `docs/data-sources/imports/osm-alpr-canada-2026.json`
- Last reviewed: 2026-08-16.

## 1. Source and provenance

| | United States | Canada |
| --- | --- | --- |
| Slug | `osm-alpr-usa-2026` | `osm-alpr-canada-2026` |
| Extract | <https://download.geofabrik.de/north-america/us.html> | <https://download.geofabrik.de/north-america/canada.html> |
| Local file | `.import-data/osm-alpr-usa-2026.elements.json` | `.import-data/osm-alpr-canada-2026.elements.json` |
| Record cap (`max_records`) | 250 000 | 25 000 |

The operator downloads the **national** Geofabrik extract, converts it to
`{elements: [...]}` JSON (nodes/ways with tags, `out center` geometry for ways)
and drops it into the repo-root, gitignored `.import-data/` directory. The
adapters read that file only: **no Overpass query and no network access** in
either adapter, so a failed upstream call can never turn into an empty-but-
"successful" import.

**Scope, stated honestly:** the import is "what OSM holds in this national
extract". Neither adapter tests each coordinate against an administrative
boundary polygon, so the country label is the *source snapshot's* label, not a
per-feature geographic proof. Border-adjacent elements follow whatever the
Geofabrik extract contains.

## 2. Selection: DeFlock-equivalent, plus our public-scope gate

DeFlock's fetcher (`worker/src/fetchers/cameras.ts`,
<https://github.com/FoggedLens/deflockhopper_maps>) queries OpenStreetMap
(two parts of the same Overpass data) with:

```
node["man_made"="surveillance"]["surveillance:type"="ALPR"];
way ["man_made"="surveillance"]["surveillance:type"="ALPR"];
```

and keeps an element only when `tags.man_made === "surveillance"` and
`tags["surveillance:type"] === "ALPR"` (exact, case-sensitive token) both
still hold. We reuse exactly that tag selection, and add one stricter filter of
our own:

| Gate | Behaviour |
| --- | --- |
| element is `node` or `way` | relations and anything else skipped |
| id is a positive safe integer | missing/zero/negative/fractional/unsafe ids skipped |
| `man_made === "surveillance"` | exact match required |
| `surveillance:type === "ALPR"` | exact, case-sensitive (`alpr` is **not** accepted) |
| `surveillance === "public"` or `"outdoor"` | explicit only — a missing, `indoor`, `private` or any other scope is **skipped**, never inferred |
| coordinates present | validator skip (shared runner rules still apply) |

Because the gates live inside the adapter parser, they hold for every entry
point: the adapter's own local-file fetch, `--source=<file>` runs, fixtures and
direct `parsePayload()` calls.

Rejected on purpose: non-ALPR surveillance, `surveillance:type=guard` layers,
suspect/community ALPR CSV datasets (e.g. alprwatch.org dumps), and **all**
images.

## 3. What is stored (canonical fields only)

One row per OSM element, with
`external_id = "osm:<type>/<id>"` and the canonical kind
`Traffic / licence plate reader` (forced by the adapter, not read from the
descriptor):

`title`, `kind`, `latitude`, `longitude`, `direction`, `address`, `notes`.

- `title`: the OSM `name` when the element has one; otherwise the operator name
  when it is a public entity (existing entity-only policy); otherwise
  `ALPR camera <id>`. The OSM ref is kept in unnamed titles so that two plate
  readers at the same gantry stay two rows — the pipeline's text-similarity
  dedup would otherwise treat them as one record.
- `address`: `addr:street` / `addr:housenumber` / `addr:city` only.
- `notes`: `Operatore: <name>` only when the operator looks like a public
  entity (the shared entity-only policy). Never a person name, never source
  free text.

Tags are copied through an **allowlist** before normalisation
(`man_made`, `surveillance`, `surveillance:type`, `camera:type`,
`camera:direction`, `name`, `operator`, `addr:*`). Everything else — free-text
descriptions/notes, `image`/`mapillary`/`url`, `contact:*`, `wikidata`, change
metadata, contributor ids/names — is dropped before a row exists.

Not imported from DeFlock either: its zone/mount/`ref` extras, its app text,
its icons/logos and its screenshots.

## 4. Licence and attribution obligations

- **The data are OpenStreetMap**, © OpenStreetMap contributors, licensed
  **ODbL 1.0**: <https://www.openstreetmap.org/copyright>,
  <https://opendatacommons.org/licenses/odbl/1-0/>. The database itself is
  ODbL, so the import is licence-compatible and the existing `/licenze` and map
  attribution already carry the OSM credit; the descriptor repeats it as
  `attribution_text` on every import batch.
- **Geofabrik** (<https://download.geofabrik.de/>) only hosts the extract; it
  adds no rights over the data and is recorded as `source_url` so the
  provenance chain (batch → extract → OSM) is traceable.
- **DeFlock is not the data owner.** It is an independent ALPR map built on
  OSM. Its terms (<https://deflock.org/terms>) reserve its own text and logos
  (its source software is MIT). We copy **no** DeFlock text, logo or
  screenshot, and the descriptor's `source_name` says "OpenStreetMap ALPR
  surveillance (DeFlock-equivalent selection)" — the selection rule is
  equivalent, the dataset is OSM's.
- This lane **mirrors two country extracts, not all of DeFlock**: no claim is
  made that the DeFlock map (or any future country coverage) is reproduced
  here.

## 5. Running it (operator, local extract only)

```bash
# dry-run (default, no writes) against a local D1 file
node scripts/import/cli.mjs run --slug=osm-alpr-usa-2026 --d1-path=<local.sqlite>

# explicit source override (same gates, same parser)
node scripts/import/cli.mjs run --slug=osm-alpr-canada-2026 \
  --source=.import-data/osm-alpr-canada-2026.elements.json --d1-path=<local.sqlite>

# apply
node scripts/import/cli.mjs run --slug=osm-alpr-usa-2026 --d1-path=<local.sqlite> --apply
```

Tests: `node --test tests/import-osm-alpr.test.mjs` (offline fixtures, no
network, no real data).
