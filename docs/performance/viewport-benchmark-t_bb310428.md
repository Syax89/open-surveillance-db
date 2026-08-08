# Benchmark contratto viewport mappa — 7.378 record reali (kanban t_bb310428)

- **Data:** 2026-08-05, misure 22:03 UTC (run worker linus)
- **Task:** P0 MAP UX REGRESSION — popup flicker, azioni community in ritardo,
  marker in ritardo (CEO su `/mappa` deployata)
- **Autore:** Linus (backend/API) — misura a livello API sul dataset D1 reale
  (7.378 record attivi), stessa base usata da `map-7374-benchmark.md`
  (t_26ce96f3): DB D1 locale, dev server vinext su :3000
- **Vincolo:** zero nuove librerie (direttiva QA#5 F3 t_ab0d4c75); benchmark
  con soli `node` + `fetch` globali — nessuna dipendenza nel package.json

## Contesto (root cause misurata sul container di test)

`usePublicCameras` eseguiva **15 richieste seriali** `GET /api/cameras?limit=500`
(offset 0..14) prima di `setRecords`: primo byte ~0.92s, completamento ~5.35s.
La mappa mostrava quindi **0 punti** e poi marker in ritardo quando il walk
completo finiva.

## Contratto nuovo (questa PR)

`GET /api/cameras?bbox=west,south,east,north&limit=10000&offset=0` restituisce
la pagina JSON dei record pubblici DENTRO il box:

- `listPublicCamerasInBboxPage` (db/cameras.ts): predicato pubblico + bbox
  BETWEEN, limit clampato a `PUBLIC_CAMERAS_BBOX_MAX_LIMIT = 10.000` al
  confine db → una vista nazionale intera (7.378 record) cade in **una sola
  pagina**; il walk residuo (se mai serve) resta confinato nel box;
- il client (`useViewportCameras`) richiede **solo il viewport corrente** con
  cache 5min chiavata sul box quantizzato + dedupe in-flight + skip per pan
  contenuto (padding 15%);
- `VIEWPORT_BBOX_LIMIT = 10.000` (allineato al limite server).

## Metodo (riproducibile)

```bash
# 1) dev server con D1 locale contenente il dataset reale (7.378 record)
npm run dev        # vinext su :3000
# 2) benchmark API (nessuna dipendenza, node >= 18)
node scripts/benchmark-viewport.mjs --url http://localhost:3000
```

Misure (stato caldo dopo warm-up, 3 run per il bbox, mediana):

| Scenario | Richieste | Tempo | Byte | Note |
| --- | --- | --- | --- | --- |
| PRIMA — walk seriale lista (15 × limit=500) | 15 | **3.709 ms totali** (240 ms/req) | 4,07 MB | zero marker fino alla fine del walk |
| DOPO — vista nazionale (bbox Italia intera) | 1 | **2.046 ms** (mediana) | 4,04 MB | 1,81× sul walk, MAI una catena seriale |
| DOPO — viewport iniziale Roma z13 | 1 | **185 ms** (mediana) | 146 KB | primo marker **~0.19s**, obiettivo ≤1s |

Dettaglio walk (per pagina, ms): 240, 227, 247, 240, 240, 241, 249, 252, 252,
240, 232, 273, 238, 262, 256.

JSON grezzo: `docs/performance/viewport-benchmark-t_bb310428.json`

## Lettura dei risultati

1. **La regressione riportata dal CEO era il viewport iniziale** (Roma z13):
   prima la mappa aspettava l'intero walk (~3.7s+ sul locale; ~5.35s sul container di test)
   prima di mostrare QUALSIASI marker; ora il primo viewport arriva con **una
   richiesta da ~185 ms** — ~20× sul walk totale, primo marker visibile ben
   dentro l'obiettivo ≤1s, niente attesa 0 → lista completa.
2. **Vista nazionale**: una sola richiesta da ~2s è comunque 1,81× più veloce
   del walk, ma soprattutto elimina la catena seriale: il client non dipende
   più dal completamento dell'intero dataset per fare qualunque cosa; pan/zoom
   successivi riusano la cache e non rifanno rete (containment skip).
3. **La grid aggregation (t_26ce96f3) resta invariata**: a zoom nazionali il
   client renderizza i badge di cella; il payload bbox alimenta gli stessi
   conteggi della lista (equivalenza count/list preservata dai test
   `db-public-contracts` / `api-cameras`).

## Limiti

- Misura a livello API (niente browser/Playwright in questo ambiente: il
  benchmark browser `scripts/benchmark-map.mjs` resta lo strumento per le
  metriche DOM/FPS e richiede l'ambiente #317 con Chromium).
- La latenza assoluta dipende dal dev server locale; i rapporti (20× / 1,81×)
  sono la metrica robusta.
