# Import run #1 — report (FASE B, kanban t_c338e9df)

- **Data:** 2026-08-05 (fetch live 06:51–08:08 UTC; apply 10:30 CEST)
- **Autore:** Ken (DevSecOps / CI) — FASE B «ADAPTER TOP-3»
- **Dipendenze:** FASE A merged su main (`7b76917`, PR #313) — runner
  `scripts/import/cli.mjs` + migrazione 0040 (`import_batches`,
  `cameras.external_id`, `cameras.import_batch_id`, partial UNIQUE
  `(source, external_id)`). Gli adapter FASE B si agganciano al contract
  runner (vedi `scripts/import/README.md`).
- **Blueprint:** `docs/data-sources/normalizzazione-pipeline.md` (D1–D7, § 2
  riga canonica, § 3.4/3.5 mapping, § 4 dedup, § 7 quality gates, § 8.2
  descriptor)

## Riepilogo numeri (runner FASE A — dry-run pre-import)

| Adapter (slug) | Licenza | Rows total | Invalidi | Dedup | Review | **Insert** |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `zurigo-videokameras-2026` | CC0 1.0 | 134 | 0 | 3 | 0 | **131** |
| `milano-varchi-2026` | CC BY 3.0 IT | 213 | 0 | 0 | 0 | **213** |
| `osm-surveillance-italia-2026` | ODbL 1.0 (OSM) | 7 941 | 0 | 910 | 1 | **7 030** |
| **Totale** | | **8 288** | **0** | **913** | **1** | **7 374** |

Invariante verificata per ogni run:
`total = invalid + skipped_duplicate + review + insert` (sempre `true`).

> Nota sui report JSON in `docs/data-sources/imports/reports/`: i tre file
> con timestamp (08:51–09:01 UTC) sono gli snapshot dry-run **pre-fix**
> dell'harness legacy (OSM: 11 629 rows → 10 396 insert, bbox senza filtro
> confine). I numeri definitivi sopra sono quelli del runner CLI FASE A sul
> payload finale (vedi § 3). Il file `zurigo-videokameras-2026-final.json`
> (harness legacy rigenerato a DB già popolato: 0 insert / 126 dedup / 8
> review) è stato rimosso perché non significativo: il Pass 2 cross colpiva
> le righe appena importate.

## 1. Zürich — Videokameras Stadtverwaltung (score 10, CC0)

- **Fonte:** Stadt Zürich — Open Data Zürich
  `https://data.stadt-zuerich.ch/dataset/prd_stez_liste_videokameras_stadtverwaltung`
- **Formato:** CSV diretto (`…/download/liste_videokameras_stadtverwaltung.csv`),
  UTF-8 (BOM), campi quotati, CRLF — parser RFC 4180 nell'adapter.
- **Mapping campi (da censimento-fonti.md § 3.1, verificato live):**

| Colonna sorgente | → cameras | Note |
| --- | --- | --- |
| `standort_beschreibung` | `title` | ≤ 90 char |
| `adresse_beschreibung` | `address` | ≤ 180 char |
| `lat` / `lon` | `latitude` / `longitude` | EPSG:4326, raw precision |
| `bereich_detail_beschreibung` | `description` | testo non-personale, ≤ 500 char |
| `anzahl_kameras_*` | — | il dataset è **per-sito** con conteggi: 1 record per sito, non per camera |
| `verantwortliche_da`, `aufbewahrungsdauer`, `rechtsgrundlage_url` | — | **non importati** (gate PII § 7.6: responsabile potrebbe essere persona; non mappabili) |

- **Kind:** nessuna info sorgente → `Other / unknown` (mai inventato, § 3.4).
  `direction` sempre `NULL`.
- **external_id:** nessuna colonna id → hash deterministico
  `sha1(titolo|lat|lon)` (§ 7.4), 16 hex — stabile tra re-run (idempotenza).
- **Attribuzione (CC0 — non richiesta):** buona pratica di progetto, citare la
  fonte: *«Fonte: Stadt Zürich, dataset "Aktuelle Auflistung von Videokameras
  der Stadtverwaltung Zürich" (URL), CC0 1.0 (URL)»*.
- **Numeri:** 134 siti → 134 validi → 3 dedup intra (coppie di siti distinti
  nella stessa cella ~11 m: Quartierwache Hottingen/Kreisbüro 7,
  Regionalwache Industrie/Kreisbüro 5, Stadthaus/Stadtkasse — regola § 4.1,
  tenuta la riga più completa) → **131 insert candidati**.

## 2. Milano — Varchi Area C + Area B (CC BY, attribuzione «Comune di Milano»)

- **Fonte:** Comune di Milano — Open Data (CKAN)
  `https://dati.comune.milano.it/it/dataset/ds82_infogeo_varchi_elettronici_localizzazione_`
  + `https://dati.comune.milano.it/dataset/ds959-varchi-areab`
- **Formato:** GeoJSON (FeatureCollection di Point, CRS84 `[lon, lat]`),
  risorse scoperte via API CKAN `package_show` (non URL hardcoded).
- **Mapping (censimento § 3.2, verificato live):**

| Proprietà | → cameras | Note |
| --- | --- | --- |
| `id_amat` | `external_id` | **namespaced per dataset**: `milano:areac:57` / `milano:areab:57` — i due package usano la STESSA sequenza id (C: 57–98, B: 1–971): senza namespace 34 falsi duplicati |
| `label` / `nome` | `title` | |
| `stato` | — | **mai** su `cameras.status` (§ 5.2); `skip_if` per `DA PROGRAMMARE PRE-ESERCIZIO` (non installato) |
| `autorizzaz` | — | non mappato (decreto, non dato camera) |
| geometria Point | `latitude` / `longitude` | |

- **Kind:** `Traffic / licence plate reader` per tutti i varchi (varchi
  elettronici = lettura targhe; mappatura § 3.4 «varchi ztl»).
- **Attribuzione (CC BY 3.0 IT):** *«Fonte: Comune di Milano, dataset "Varchi
  elettronici ZTL" / "Varchi Area B" (URL), concesso con CC BY 3.0 IT (URL).
  Coordinate arrotondate a ~4 decimali (~10 m); campi ristrutturati»* —
  **attribution «Comune di Milano»** + indicazione modifiche, come da matrice
  `licenze-compatibilita.md` § 3.2/§ 5.2. Versione 3.0 IT (storica del portale)
  da confermare con l'ente: l'API CKAN dichiara `cc-by`
  (opendefinition.org/licenses/cc-by) senza versione.
- **Numeri:** 42 (C) + 188 (B) = 230 feature → 213 validi (17 skip
  `DA PROGRAMMARE PRE-ESERCIZIO`) → 0 dedup intra → **213 insert candidati**
  (42 Area C + 171 Area B attivi/pre-esercizio).

## 3. OpenStreetMap — `man_made=surveillance` Italia (ODbL)

- **Fonte:** Overpass API pubblica (overpass-api.de + fallback kumi.systems),
  query per bbox Italia **a 12 chunk** (4×3) per rispettare il rate limit
  (censimento § 3.4: bbox intera → limiti). Throttle 3 s tra chunk, retry con
  backoff su 429/504, timeout 120 s/chunk, `out center` per i way.
- **Query:** `node|way["man_made"="surveillance"]["surveillance"~"^(public|outdoor)$"]`
  intersecata ad `area["ISO3166-1"="IT"][admin_level=2]` — il filtro confine
  è stato aggiunto dopo che la preview del primo run evidenziava punti fuori
  confine (Svizzera / Costa Azzurra: bbox rettangolare che include aree
  estere). Con il filtro, solo elementi dentro il confine reale (design § 3.3:
  escludere `indoor` — il regex copre entrambi).
- **Mapping tag (design § 3.3 + spec task):**

| Tag | → cameras | Note |
| --- | --- | --- |
| `@id` (`node/12345`) | `external_id` | `osm:node/12345` |
| `name` | `title` | fallback § 7.2: `operator`+`surveillance camera` → `Surveillance camera, via n` → `Surveillance camera` |
| `camera:type` | `kind` | `dome`→`Fixed dome`, `fixed`→`Bullet`, `panning`→`PTZ` (spec task; design § 3.4 nota conservativa su `fixed` — decisione documentata: seguita la spec FASE B) |
| `surveillance:type` | `kind` (override) | `alpr`→`Traffic / licence plate reader`; `guard`→**skip** (non è una camera) |
| `camera:direction` | `direction` | gradi o rosa dei venti (16 direzioni, EN/IT/DE); cupola → forzato `NULL` |
| `operator` | `notes` (`Operatore: …`) | **solo se entità pubblica** (euristica keyword/acronimo/forma giuridica); nomi persona (es. "Mario Rossi") → scartati (gate PII § 7.6) |
| `addr:street`+`housenumber`+`city` | `address` | |
| `surveillance=indoor` | filter | skip (query già lo esclude, safety net nel parse) |
| `camera:mount`, `level`, `height` | — | ignorati in v1 (§ 3.3) |

- **Attribuzione (ODbL 1.0):** *«© OpenStreetMap contributors»* linkato a
  `https://www.openstreetmap.org/copyright` (matrice § 3.4; obbligo ODbL
  § 4.2/4.3 — riga fissa in `/licenze` + exports).
- **Numeri (payload finale, filtro confine attivo):** 7 984 elementi
  (12 chunk: 108, 14, 373, 30, 70, 1 217, 297, 430, 2 118, 3 013, 314, 0) →
  7 941 validi (43 skip `surveillance:type=guard` e `camera:mount`) → 910 dedup
  intra (snap-cell 4 decimali + kind, § 4.1) → **7 030 insert candidati**,
  1 review item (distanza ≤ 200 m / similarità vs record esistente — da
  valutare a mano prima di un eventuale refresh `--force`). 0 invalidi.
- **Delta vs dry-run originale (10 396):** il primo fetch (pre-fix) non aveva
  il filtro `area["ISO3166-1"="IT"]` (11 677 elementi) e includeva elementi
  fuori dal confine reale; inoltre OSM è un dataset live — i conteggi dei
  chunk variano leggermente tra fetch (rate limit, aggiornamenti mappa).
- **Distribuzione kind (campione Milano, 271 elem):** Bullet 121 · Traffic
  reader 93 · Fixed dome 47 · Other/unknown 7 · PTZ 3.

## Decisioni registrate (per review Ada/CEO)

1. **Zürich per-sito, non per-camera**: il dataset ha conteggi per sito; 1
   record per standort (kind `Other / unknown`). Un futuro arricchimento può
   splittare per `anzahl_kameras_*`.
2. **`camera:type=fixed` → `Bullet`**: la spec FASE B lo impone; la nota
   conservativa del design (§ 3.4) preferiva `Other / unknown`. Scelta:
   **spec FASE B vince** — impatto: i marker mappa mostrano cono direzionale
   per i fixed con `camera:direction` (verosimile per telecamere fisse).
3. **external_id Milano namespaced per dataset** (`milano:areac:` /
   `milano:areab:`) — gli id_amat collidono tra Area C e Area B.
4. **skip_if Milano**: `DA PROGRAMMARE PRE-ESERCIZIO` escluso (non installato);
   `IN PRE-ESERCIZIO` e `ATTIVI E SANZIONANTI` importati.
5. **Filtro confine Italia in OSM**: aggiunto `area["ISO3166-1"="IT"]` alla
   query — la bbox rettangolare da sola includeva elementi in Svizzera/Costa
   Azzurra (evidenziato dalla preview). Costo: il filtro area rallenta i chunk
   (~13 min totali), ma il risultato è geograficamente corretto.
6. **Licenza Milano**: `cc-by` da API CKAN; versione 3.0 IT presunta (storica
   portale) — confermare con l'ente prima del primo import in produzione.
   Aggiunto `CC BY 3.0 IT` alla matrice importabile (`licence-gate.mjs`).

## Import reale su D1 locale LXC (osdb-test) — fatto e verificato

FASE A è atterrata (PR #313) quindi l'import reale è stato eseguito con il
runner ufficiale contro il D1 locale dell'LXC di test:

```bash
# su osdb-test (192.168.1.201), repo a main 7b76917 + adapters FASE B
D1=.wrangler/state/v3/d1/miniflare-D1DatabaseObject/da01e386….sqlite
node scripts/import/cli.mjs run --slug=zurigo-videokameras-2026 --apply --d1-path=$D1
node scripts/import/cli.mjs run --slug=milano-varchi-2026 --apply --d1-path=$D1
node scripts/import/cli.mjs run --slug=osm-surveillance-italia-2026 --apply --d1-path=$D1
```

(OSM applicato con payload pinnato — stesso checksum del dry-run — per evitare
un secondo fetch Overpass da 13 min; i conteggi del batch coincidono col
dry-run del runner.)

**Verifica (post-apply, read-only):**

- D1 locale LXC: **7 374 camere** — `import:zurigo-videokameras-2026` 131 ·
  `import:milano-varchi-2026` 213 · `import:osm-surveillance-italia-2026`
  7 030.
- `import_batches`: 3 batch **committed** (zurigo 134/131/3/0/0, milano
  213/213/0/0/0, osm 7 941/7 030/910/1/0) — `attribution_text` persistito
  correttamente per ciascun batch.
- API `GET /api/cameras` su osdb-test: `total: 7374`, record con
  `source="import:<slug>"`, `status="active"`, `last_verified_at=null`
  (badge «mai confermato», ADR 0021).
- Mappa: preview Leaflet rigenerata con i dati finali
  (`docs/data-sources/imports/preview-import-run-1.html`, 7 392 marker —
  leggera differenza col totale runner perché la preview applica la sua dedup
  intra per layer). I punti sono nelle aree attese: varchi entro la cerchia
  milanese, siti EWZ/Stadtpolizei a Zurigo, nodi OSM su tutto il territorio
  italiano.

## Test adapter (offline)

`tests/import-adapters.test.mjs` — 27 test, tutti verdi (`node --test
tests/import-adapters.test.mjs`): mapping campi (CSV RFC4180 con virgolette
escaped, GeoJSON), kind/direction (gradev, rosa 16 venti EN/IT/DE, cupola→NULL,
ALPR override, guard/indoor skip), validazione coordinate (vuote → skip, mai
`(0,0)`), skip_if, idempotenza external_id (hash deterministico, namespace
Milano), gate operator-PII (entità sì, persona no).

File: `scripts/import/adapters/` (lib.mjs, zurigo-videokameras-2026.mjs,
milano-varchi-2026.mjs, osm-surveillance-italia-2026.mjs, dry-run.mjs,
preview-map.mjs, README.md) · `docs/data-sources/imports/<slug>.json`
(descriptor, chiavi § 8.2) · report JSON in
`docs/data-sources/imports/reports/`.
