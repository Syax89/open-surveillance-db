# Benchmark mappa — 7.374+ punti reali (kanban t_26ce96f3)

- **Data:** 2026-08-05 (misure 14:43–14:47 UTC)
- **Autore:** Ken (DevSecOps / CI) — task «MAPPA — PERFORMANCE REALE 7.374+ PUNTI»
- **Motivo:** CEO 2026-08-05: visualizzazione lenta su `/mappa` con il dataset
  reale (7.374 record importati, vedi `docs/data-sources/import-run-1.md`)
- **Dipendenze:** redesign popup merged su main (`d54be8f`, PR #316,
  `t_b7728ad0`) — stesso file `SurveillanceMap.tsx`, nessun conflitto pendente
- **Vincolo:** ZERO nuove librerie (direttiva PM da QA#5 F3 `t_ab0d4c75`)

## Metodo (riproducibile)

Script unico `scripts/benchmark-map.mjs` (Playwright headless, nessuna
dipendenza nel package.json; browser via `PLAYWRIGHT_PATH`). Entrambe le
misure con **identica** versione runtime:

| Parametro | Valore |
| --- | --- |
| Node | v22.22.3 (entrambi i run) |
| Browser | Playwright chromium 151.0.7922.34 (entrambi i run) |
| Viewport | 1440×900 |
| Dataset | D1 locale reale — 7.378 record pubblici (stesso DB, stesso dev server vinext su :3000) |
| URL | `http://localhost:3000/mappa` |
| Prima misura (before) | `git stash` dei 4 file app → working tree = main `d54be8f` |
| Dopo misura (after) | working tree = branch fix (restore dallo stash) |
| JSON grezzi | `docs/performance/benchmark-before.json`, `docs/performance/benchmark-after.json` |

Metriche misurate: walk paginato `/api/cameras?limit=500` (15 pagine),
conteggio marker DOM a zoom nazionale (z5) e città (z13), first
contentful/largest paint + primo marker, heap JS, FPS pan/zoom reale (frame
counter `requestAnimationFrame` in pagina, gesti mouse reali), latenza
click→popup su **marker individuale** (mai su badge: un badge fa zoom-in, non
apre il popup — fix del run precedente, vedi `measurePopupClick`).

## Root cause (confermata)

`viewportBounds` è `null` al primo paint: la vecchia logica
`recordsInBounds(cameras, null)` restituiva l'**intero dataset** e l'effect
materializzava **7.378** `L.divIcon` DOM marker prima del primo `emitBounds`
che applicava il culling. A z5 il pan crollava a **6.8 fps** e uno zoom-in di
2 livelli a **1.5 fps** (~680 ms/frame).

## Soluzione (implementata, zero nuove librerie)

1. **Viewport-first** — `markersForViewport(records, null, zoom)` restituisce
   layer VUOTO: prima del primo `emitBounds` il pane non materializza nulla
   (il primo bounds arriva un frame dopo la creazione della mappa, attesa
   invisibile). La sidebar mantiene il contract «mai vuota» col suo
   `recordsInBounds(records, null)` (testo, economico).
2. **Aggregazione a griglia in pixel** — `app/lib/map-grid.ts`: a densità alta
   o zoom basso i record visibili vengono bucketati in celle di **48px**
   schermo (Web Mercator world px, `256·2^zoom`), **un badge divIcon per
   cella** con conteggio; click sul badge = zoom-in +2 verso il centroide.
   Marker individuali (popup/tooltip) solo quando visibili ≤ 250
   (`MAX_INDIVIDUAL_MARKERS`) o zoom ≥ 14 (`GRID_MAX_ZOOM`). Celle con un
   solo record renderizzano il marker individuale (niente badge "1").
3. **Deep link** — il record selezionato (`?focus=ID`) è SEMPRE renderizzato
   come marker individuale sopra la griglia, anche se la vista è aggregata.
4. **FOV** — il cono (solo zoom ≥ 16, dove la griglia è inattiva) segue lo
   stesso `markersForViewport`: geometria solo per i record effettivamente
   renderizzati.
5. **Nessuna perdita di record** — `visible` = intero set `recordsInBounds`
   (stesso predicato della sidebar); ogni record visibile sta in esattamente
   una cella o è renderizzato individualmente (testato).

## Metriche BEFORE → AFTER

| Metrica | BEFORE (main) | AFTER (fix) | Δ |
| --- | ---: | ---: | ---: |
| Walk 15 pagine (richieste / tempo totale) | 15 / 5767 ms | 15 / 5421 ms | ≈ −6% |
| Marker DOM a z5 (nazionale) | **7.378** | **29** | **−99,6%** (254×) |
| Marker DOM a z13 (città) | 184 | 53 | −71% |
| First contentful paint | 1296 ms | 620 ms | −52% |
| Largest contentful paint | 1364 ms | 760 ms | −44% |
| Primo marker nel DOM | 235 ms | 162 ms | −31% |
| Heap JS usato | 29,4 MB | 27,6 MB | −6% |
| FPS pan z5 (nazionale) | 6,8 (147 ms/frame) | **58,3** (17 ms/frame) | **8,6×** |
| FPS zoom-in z5 | 1,5 (679 ms/frame) | **95,2** (11 ms/frame) | **63×** |
| FPS pan z13 (città) | 60,0 | 181,3 | 3× |
| FPS zoom-in z13 | 121 | 243 | 2× |
| Latenza click→popup (marker individuale) | 128 ms | 125 ms | ≈ invariata |

Note di lettura:
- Il walk domina il tempo a freddo (~5,5 s, ~4 MB): è l'architettura client
  (paginazione 15×500) ed è invariata — il fix agisce sul rendering DOM, non
  sul trasporto (nessuna query bounds lato server richiesta, vincolo zero
  nuove librerie). A cache HTTP calda il walk è servito senza round-trip D1.
- `markersAfter: 0` a z13 in entrambi i run: dopo 2 zoom-in il viewport
  centra una zona senza record — comportamento identico before/after, non
  una regressione.
- Latenza popup misurata su marker individuale (mai badge) in entrambi i
  run: i 726 ms del run precedente erano un artefatto (click su badge → zoom).

## Test

- `tests/map-grid.test.mjs` — 17 test unitari su `map-grid.ts` (proiezione
  Web Mercator roundtrip, decisione densità/zoom, integrità celle, no-record-
  loss, viewport-first con bounds null, deep link in `visible`, culling):
  `node --test tests/map-grid.test.mjs`
- Suite completa + typecheck + build: verdi (vedi PR).

## Limiti noti

1. **Walk invariato** — il tempo a freddo è dominato dal caricamento dati
   (15 richieste × 500). Un server/API bounds query ridurrebbe il trasporto,
   ma è fuori scope (zero nuove librerie, API pubblica invariata). Documentato
   come evoluzione possibile.
2. **Badge senza drill-down** — il click su badge fa zoom-in +2 verso il
   centroide; non esiste ancora un popup «elenco record nella cella» (fuori
   scope CEO: «badge count/click zoom-in»).
3. **`hasActions: false` nel popup benchmark** — il popup aperto dal click
   benchmark è il fallback standalone (`defaultPopupHtml`, senza toolbar
   community); il popup della pagina reale (via `popupHtmlForRef`) include le
   azioni. La metrica misurata (click→open) è valida e identica nei due run.
4. **Heap approssimato** — `performance.memory` richiede Chromium ed è
   indicativo; comparabile perché stesso browser in entrambi i run.
5. **Soglie** (`GRID_CELL_PX=48`, `GRID_MAX_ZOOM=14`, `MAX_INDIVIDUAL_MARKERS=250`)
   calibrate sul dataset attuale; con dataset molto più densi la cella da 48px
   può richiedere calibrazione (testata: 7.374 punti → 29 nodi a z5).

## File toccati

- `app/lib/map-grid.ts` (nuovo) — proiezione + aggregazione pura
- `app/components/SurveillanceMap.tsx` — viewport-first, badge, deep-link overlay, FOV
- `app/lib/i18n/map.ts` — label badge EN/IT
- `app/globals.css` — stile badge
- `tests/map-grid.test.mjs` (nuovo) — 17 test
- `scripts/benchmark-map.mjs` (nuovo) — benchmark riproducibile
- `docs/performance/benchmark-{before,after}.json` (nuovi) — dati grezzi
