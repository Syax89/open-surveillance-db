# OSM ALPR imports (DeFlock-equivalent selection): US / CA

Two import sources record **automatic licence plate reader (ALPR)** locations
from OpenStreetMap, selected the way the DeFlock project selects its data. This
page carries the rationale the code deliberately does not repeat: source,
gates, what is stored, licence obligations and the operator recipe.

- Adapters: `scripts/import/adapters/osm-alpr-usa-2026.mjs`,
  `scripts/import/adapters/osm-alpr-canada-2026.mjs`
  (shared gate: `scripts/import/adapters/osm-alpr-factory.mjs`)
- Descriptors: `docs/data-sources/imports/osm-alpr-usa-2026.json`,
  `docs/data-sources/imports/osm-alpr-canada-2026.json`
- Last reviewed: 2026-10-21.

## 1. Source and transport

| | United States | Canada |
| --- | --- | --- |
| Slug | `osm-alpr-usa-2026` | `osm-alpr-canada-2026` |
| Extract | <https://download.geofabrik.de/north-america/us.html> | <https://download.geofabrik.de/north-america/canada.html> |
| Local file | `.import-data/osm-alpr-usa-2026.elements.json` | `.import-data/osm-alpr-canada-2026.elements.json` |
| `max_records` | 250 000 | 25 000 |

The operator downloads the **national** Geofabrik extract, converts it offline
to Overpass-shaped JSON (`{elements: [...]}`, `out center` geometry for ways)
and drops it into the repo-root, gitignored `.import-data/` directory. The
adapters read that file only: **no Overpass query and no network access**, so a
failed upstream call cannot become an empty-but-"successful" import. The
descriptor `format` is `osm-overpass` because the payload is Overpass-shaped
JSON; the Geofabrik/PBF transport is recorded in `source_url` and `notes`.

**Scope, stated honestly:** the import is "what OSM holds in this national
extract". Neither adapter tests each coordinate against an administrative
boundary polygon, so the country label is the *source snapshot's* label, not a
per-feature geographic proof. Border-adjacent elements follow whatever the
Geofabrik extract contains.

## 2. Selection: DeFlock-equivalent, plus our public-scope gate

DeFlock's fetcher (`worker/src/fetchers/cameras.ts`,
<https://github.com/FoggedLens/deflockhopper_maps>) queries OpenStreetMap with

```
node["man_made"="surveillance"]["surveillance:type"="ALPR"];
way ["man_made"="surveillance"]["surveillance:type"="ALPR"];
```

and keeps an element only when `tags.man_made === "surveillance"` and
`tags["surveillance:type"] === "ALPR"` still hold. We reuse exactly that tag
selection, and add one stricter filter of our own:

| Gate | Behaviour |
| --- | --- |
| element is a `node` or a `way` | relations and anything else skipped |
| `id` is a **numeric** positive safe integer | string ids, zero, negatives, fractions skipped — no normalisation |
| `man_made === "surveillance"` | exact match required |
| `surveillance:type === "ALPR"` | exact, case-sensitive (`alpr` is **not** accepted) |
| `surveillance === "public"` or `"outdoor"` | explicit only — a missing, `indoor`, `private` or any other scope is **skipped**, never inferred |
| coordinates present | skip; the shared runner validators still apply |

The gate runs inside the adapter's parser, so it holds for every entry point:
the local-file fetch, `--source=<file>` runs, fixtures and direct
`parsePayload()` calls.

Rejected on purpose: non-ALPR surveillance, `surveillance:type=guard` layers,
suspect/community ALPR CSV datasets (e.g. alprwatch.org dumps), and **all**
images.

## 3. What is stored

Normalisation is the shared OSM country factory (unchanged) plus the shared
runner: canonical kinds, `direction` as an integer 0–359,
`external_id = "osm:<type>/<id>"`, ALPR rows always
`Traffic / licence plate reader` via the descriptor's `surveillance_type_map`.

Forwarded tags are an explicit allowlist — `camera:direction`, `addr:street`,
`addr:housenumber`, `addr:city` — plus the three selection tags. In particular
**`name` and `operator` are not forwarded at all**: they are free text that can
carry a person's name, and a location record does not need them. There is
therefore no person-name heuristic in this code, and no operator note: imported
ALPR rows get the normaliser's generic title (`Surveillance camera`, or
`Surveillance camera, <street>` when a street address exists), the street
address when tagged, and coordinates/direction. Everything else in
`element.tags` — free-text descriptions and notes, `image`/`mapillary`/`url`,
`contact:*`, `wikidata`, change metadata, contributor ids/names — is dropped
before a staged row exists.

**No row-count guarantee.** This is a selection from OSM, not a mirror of it,
and the standard pipeline decides what lands in the database: Pass 1 drops
intra-source duplicates (same ~11 m snap cell + kind), Pass 2 compares each row
with the whole non-demo database (community reports and earlier imports) and may
**skip** it as a duplicate or send it to **review**; only inserted rows exist
afterwards. Rows that collide with a hidden/removed community record always go
to review and are never silently resurrected.

Nothing from DeFlock's non-OSM material is copied either: its zone/mount/`ref`
extras, app text, icons/logos and screenshots stay out.

## 4. Licence obligations (ODbL 1.0)

The data are **OpenStreetMap**, © OpenStreetMap contributors, licensed **ODbL
1.0**: <https://www.openstreetmap.org/copyright>,
<https://opendatacommons.org/licenses/odbl/1-0/>. Geofabrik
(<https://download.geofabrik.de/>) only hosts the extract and adds no rights
over the data; it is recorded as `source_url` so batch → extract → OSM stays
traceable.

Our database is itself ODbL, which is why this source is licence-compatible.
Importing OSM data creates a **derivative database**, so the obligations are not
attribution-only:

- **Attribution** — credit "© OpenStreetMap contributors" with a link to the
  copyright page, on every public surface that shows the data. The descriptor
  carries it as `attribution_text` and every import batch stores it.
- **Share-alike** — the derivative database (and any public derivative of it)
  must be offered under ODbL 1.0 as well. Our own database licence already
  satisfies this, so the condition is: never relicense the imported rows, and
  keep them under ODbL when they are extracted, merged or redistributed.
- **Availability / "keep open"** — anyone who publicly uses a substantial part
  of the derivative database must be able to obtain it under ODbL (offer the
  database, or a way to get it, alongside the public use). Public exports and
  data downloads must therefore stay offered, not withdrawn.
- **No additional restrictions** — no technical or contractual measure may
  narrow the rights ODbL grants on the imported rows.
- **Change indication** — modified/derived records must be identifiable as
  changed; import batches already record provenance (`import_batches`,
  `external_id`, `source = import:<slug>`).

DeFlock is not the data owner: it is an independent ALPR map built on OSM, and
its terms (<https://deflock.org/terms>) reserve its own text and logos (its
software is MIT). The descriptor's `source_name` says "OpenStreetMap ALPR
surveillance (DeFlock-equivalent selection)" — the *selection rule* is
equivalent, the dataset is OSM's. This lane mirrors two country extracts, not
all of DeFlock.

## 5. Operator recipe (local D1 only)

Real imports run only on the local LXC against the **local** D1 SQLite file.
Never point `--d1-path` at a Cloudflare/remote database, and never run the
Cloudflare production pipeline from this recipe.

```bash
# 0. STOP the local service first. A live dev/preview server holds its own
#    writer on the same SQLite file; two concurrent writers risk a locked or
#    corrupted database. Only an --apply run writes, so stop before step 3.

# 1. produce the extract (operator side, out of band):
#    Geofabrik <country>-latest.osm.pbf → filtered ALPR extract →
#    {elements:[...]} JSON at .import-data/osm-alpr-<country>-2026.elements.json

# 2. dry-run first (no writes; safe while the file is only read)
/usr/bin/node scripts/import/cli.mjs run --slug=osm-alpr-usa-2026 --d1-path=<local.sqlite>

# 3. apply — SERVICE STOPPED, local SQLite only
/usr/bin/node scripts/import/cli.mjs run --slug=osm-alpr-usa-2026 --d1-path=<local.sqlite> --apply

# optional: same gates through an explicit source override
/usr/bin/node scripts/import/cli.mjs run --slug=osm-alpr-canada-2026 \
  --source=.import-data/osm-alpr-canada-2026.elements.json --d1-path=<local.sqlite>
```

Re-running a committed slug aborts by design; `--force` refreshes in place
without duplicating rows.

Tests: `/usr/bin/node --test tests/import-osm-alpr.test.mjs` (offline fixtures,
no network, no real data).
