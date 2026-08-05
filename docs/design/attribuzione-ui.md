# Attribuzione UI — import pipeline FASE C (kanban t_4dbce318)

**Autore:** Vera (Design UX/UI) · **Data:** 2026-08-05
**Dipendenze:** FASE A (PR #313, migrazione 0040) + FASE B (PR #314, adapter
TOP-3: Zürich CC0, Milano CC BY, OSM ODbL — 7 374 record importati su D1
LXC con `attribution_text` persistito per batch).

## Decisione di architettura informativa (CEO 2026-08-05)

La lista delle fonti è una **pagina dedicata `/fonti`**, NON una sezione di
`/licenze` e NON nella navigazione principale: è collegata dal **footer**
accanto a Licenze, perché è macchina di attribuzione, non strumento
quotidiano. `/licenze` mantiene solo la menzione generale con link a
`/fonti`. Questo rispetta il principio "one page, one job" di
`docs/SITEMAP.md` e tiene la navigazione principale focalizzata sui tool.

## 1. Pagina /fonti

- **Server component** (`app/fonti/page.tsx`, `dynamic = "force-dynamic"`):
  query D1 a ogni richiesta, come `/sitemap.xml` — un nuovo batch appare al
  primo hit, un batch rollbackato sparisce. Mai un'attribuzione per dati non
  pubblicati.
- **Data:** `db/import-sources.ts` — `listCommittedImportBatches()`: SOLO
  batch `committed` (un batch `running`/`failed`/`rolled_back` non ha dati
  pubblicati), ordinati per `import_date DESC`.
- **Tabella** (riusa il markup `legal-table` + `LegalTableWrap` per lo
  scroll da tastiera): Fonte (nome ente linkato al dataset originale),
  Licenza (linkata al testo), Importato il (data locale), Record
  (`records_inserted`), Attribuzione (testo esatto persistito dal runner —
  mai ricostruito). Links esterni con `target=_blank` + `rel=noopener
  noreferrer`; suffisso sr-only "(apri in nuova finestra)".
- **Metadata localizzate** (title/description, og/twitter) via
  `generateMetadata` + bundle `app/lib/i18n/sources.ts` EN/IT (parity tsc).
- **Sitemap:** `/fonti` aggiunta a `STATIC_ROUTES` di `app/sitemap.ts`.
- **Empty state onesto:** nessun batch committed → "No imported datasets
  yet" + spiegazione, mai fonti inventate.
- Per la riga OSM l'attribution text contiene il link copyright richiesto
  dall'ODbL ("© OpenStreetMap contributors (URL)") — renderizzato come testo
  (React lo escapa), link separati nelle colonne.

## 2. /licenze — sezione 6 "Imported public datasets"

Menzione generale (EN/IT): il database del progetto è ODbL 1.0 ma la licenza
di una singola fonte non è mai sostituita; elenco puntuale su /fonti. Nota:
i record importati riportano la provenienza e restano soggetti alla verifica
community. `versionNote` aggiornata.

## 3. Record detail — provenienza

- `db/cameras.ts`: i due resolver by-id (`getPublicCameraById`,
  `getCommunityRecordById`) ora aggiungono `importBatch` (`{sourceName,
  sourceUrl, license, licenseUrl}`) via `getImportBatchById` — un lookup per
  PK solo quando `import_batch_id` è presente; `null` per le segnalazioni.
  Le liste NON cambiano (niente N+1 su 7k righe).
- **Badge:** sotto il badge community ("Mai confermata") una riga
  `.record-provenance`: "Importato da <ente> · <licenza>" con link al
  dataset e al testo licenza. La fact "Fonte" mostra il nome leggibile, mai
  lo slug grezzo `import:<slug>`.
- **Data di aggiunta** (aggiunta CEO): nuova fact "Added" / "Aggiunta"
  (`createdAt` locale) nel `<dl>` — prima di "Last confirmation".

## 4. Popup mappa — provenienza in piccolo (aggiunta CEO 2026-08-05)

- **Mapping condiviso:** `GET /api/import-sources` serve i batch committed
  (`{slug, sourceName, sourceUrl, license, licenseUrl}`) riusando la STESSA
  funzione db della pagina /fonti. La lib client `app/lib/import-sources.ts`
  (`fetchImportSources` + `importSourceOf`) risolve `import:<slug>` → nome
  leggibile; cache module-level; fallback vuoto = fonte grezza.
- **Popup** (`app/lib/map-popup.ts`): riga `.osm-popup-provenance` in basso
  (testo piccolo, `--text-2xs`, separata con bordo — non ruba spazio alle
  azioni community): per gli importati "Fonte: <ente> · <licenza linkata> ·
  Aggiunta: <data locale>"; per le segnalazioni "Fonte: Segnalazione della
  community" senza licenza + data; seed demo → valore grezzo (fallback
  offline). Il cono di visione resta `aria-hidden`; la provenienza è testo.
- **Record detail** aggiornato con la data (punto 3).

## 5. Directory/mappa — filtro origine (?origin=)

Semplice come previsto: dimensione URL `origin` (all/reports/imported)
client-side su `source` — stesso pattern di `?state=` (FASE 3 UI). Predicato:
`reports` = `source === 'Community report'`, `imported` =
`startsWith('import:')`; il seed demo non matcha né l'uno né l'altro
(illustrativo, non una segnalazione). Select localizzata in FiltersBar
(visibile solo su /directory e /mappa — la home resta byte-identical),
etichette "Origin/Origine", "Community reports/Segnalazioni", "Imported
data/Dati importati".

## 6. i18n

Nuovi bundle/keys: `sources.ts` (pagina), footer `sources` ("Data
sources"/"Fonti dei dati"), record `importedFrom` + `addedOn`, map
`popupAdded` + `popupCommunityReport`, directory `origin*`. Tutte EN pilot +
IT `Translation<typeof en>` — `tsc --noEmit` parity verificata. Nessuna
stringa "contributore".

## 7. Test

| Suite | Copre |
| --- | --- |
| `import-sources-read.test.mjs` (4) | read side db: solo committed, ordinamento, getImportBatchById, attach su getCommunityRecordById |
| `fonti-page.test.mjs` (3) | SSR reale (Miniflare + D1): /fonti con batch reali, /licenze sezione 6 + link, sitemap contiene /fonti |
| `client-sources-page.test.mjs` (4) | DOM: tabella 5 colonne, link/attribuzione, empty state, IT parity, mapping condiviso slug→fonte |
| `client-record-page.test.mjs` (+2) | provenienza accanto al badge, fact "Added", nessuna provenienza per le segnalazioni |
| `client-field-of-view.test.mjs` (+1) | riga provenienza nel popup (importato/community, EN/IT, slug mai esposto) |
| `url-state-contract.test.mjs` (+2) | parse/stringify ?origin=, predicato applyCameraFilters, select DOM |
| `client-footer-legal.test.mjs` (agg.) | link /fonti nel footer (17 link, 15 interni) |
| `legal-pages.test.mjs` (agg.) | marker sezione 6 + href /fonti |
| `api-import-sources.test.mjs` (2) | route pubblica: payload + cache headers, 503 fail-closed |

Harness: `db/import-sources.ts` aggiunto a db-runtime-harness e
api-harness (db-real + mock `mocks/import-sources.mjs`), route registrata.

## 8. File modificati

```
app/fonti/page.tsx                      (nuovo)
app/components/SourcesPage.tsx          (nuovo)
app/lib/i18n/sources.ts                 (nuovo)
db/import-sources.ts                    (nuovo)
app/api/import-sources/route.ts         (nuovo)
app/lib/import-sources.ts               (nuovo)
app/components/SiteFooter.tsx           link /fonti
app/lib/i18n/footer.ts                  key sources
app/sitemap.ts                          /fonti in STATIC_ROUTES
app/lib/legal/en.ts + it.ts             sezione 6 licenze
db/cameras.ts                           importBatch sui resolver by-id
app/records/[id]/RecordPageBody.tsx     provenienza + fact Added
app/lib/i18n/record.ts                  importedFrom, addedOn
app/lib/map-popup.ts                    riga provenienza
app/components/home/MapPanel.tsx        fetch sorgenti + wire popup
app/components/SurveillanceMap.tsx      MapCamera source/createdAt
app/lib/use-camera-filters.ts           dimensione origin
app/components/FiltersBar.tsx           select origin (opzionale)
app/components/tools/{DirectoryTool,MappaTool,DirectoryCatalog}.tsx
app/components/home/PublicDirectory.tsx inoltro origin
app/lib/i18n/{map,directory}.ts         keys popup/origin
app/globals.css                         .record-provenance, .osm-popup-provenance
tests/…                                 (vedi tabella)
docs/SITEMAP.md                         rotta /fonti
```
