# Import adapters — FASE B (kanban t_c338e9df)

Adapter per-sorgente del pipeline di import (blueprint:
`docs/data-sources/normalizzazione-pipeline.md`). Ogni adapter è il *front
half* source-specific: fetch + parse → righe staged nel nostro schema
canonico. Il *runner* comune (batch D1, dedup Pass 2 completo, eventi,
rollback) è la FASE A (`scripts/import/` + migrazione 0040); questi adapter
sono ciò che il runner legge.

## Adapter attuali

| Slug | Sorgente | Licenza | Formato |
| --- | --- | --- | --- |
| `zurigo-videokameras-2026` | Stadt Zürich — Open Data | CC0 1.0 | CSV (per-sito) |
| `milano-varchi-2026` | Comune di Milano — Open Data | CC BY 3.0 IT | GeoJSON (CKAN, Area C + B) |
| `osm-surveillance-italia-2026` | OpenStreetMap | ODbL 1.0 (OSM) | Overpass API (bbox Italia a chunk) |

Descriptor: `docs/data-sources/imports/<slug>.json` (chiavi del design § 8.2).

## Contract (interfaccia consumata dal runner FASE A)

Ogni modulo `.mjs` esporta:

- `slug` (string) — slug del batch, deve combaciare con il descriptor.
- `getDescriptor()` → oggetto descriptor (JSON parsato).
- `fetchPayload()` → `{ ...payload grezzo, checksum }` (sha256 del payload,
  design § 7.6). Retry/backoff e User-Agent di progetto già dentro.
- `parsePayload(raw)` → `{ staged, skipped, checksum }`
  - `staged`: array di righe **canonicali** (design § 2):
    `{ title, kind, latitude, longitude, direction, address, notes,
      description, external_id }` — `source` (`import:<slug>`) e
    `import_batch_id` sono runner-owned e NON vanno impostati qui.
  - `skipped`: `{ total, reasons }` con conteggi per motivo (per il report).
  - `checksum`: può essere `null` (il runner usa quello di `fetchPayload`).

Regole già applicate dentro gli adapter (non duplicare nel runner):

- coordinate validate al parse (lat/lon finite, niente `(0,0)` da stringhe
  vuote — vedi `parseCoord`);
- `kind` già canonico (mai la stringa sorgente); `direction` già int 0–359 o
  `null`; cupole già con `direction = null` (invariante DOME_KIND);
- `external_id` stabile e idempotente (id sorgente prefissato o hash
  deterministico § 7.4);
- gate privacy § 7.6 già applicati (no PII, operator solo se entità).

## Uso

```bash
# dry-run (default: nessuna scrittura) — stampa n totali/validi/invalidi,
# dedup intra + cross vs D1 locale, review candidates; scrive report JSON.
npm run import:dry-run -- --slug=zurigo-videokameras-2026
npm run import:dry-run -- --slug=milano-varchi-2026 --out=/tmp/milano.json
npm run import:dry-run -- --slug=osm-surveillance-italia-2026 --db=/path/to/d1.sqlite
```

`--limit=N` taglia le righe staged (dry-run rapidi), `--db=` punta a un
sqlite D1 (default: discovery automatica in `.wrangler/state`).

> Il dry-run harness (`dry-run.mjs`) è uno strumento di sviluppo: la dedup
> Pass 2 usa mirror locali di `textSimilarity`/`haversine` (le stesse formule
> di `app/lib/duplicate-detection.ts`) per girare senza build TS. Il runner
> FASE A userà i moduli veri.

## Test

```bash
node --test tests/import-adapters.test.mjs
```

Offline, con fixture: mapping campi, kind/direction, validazione, skip_if,
idempotenza external_id, gate operator-PII.
