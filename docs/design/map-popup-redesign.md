# Map popup redesign + mappa mobile MAP-FIRST (t_b7728ad0)

**Data:** 2026-08-05 · **Autore:** Vera (design) · **Stato:** implementato, testato, PR

## Contesto

CEO (2026-08-05): *"i pulsanti Conferma/Segnala/etc nel popup della mappa sono troppo
grandi"* — analizzare TUTTO il popup e rifare il layout. Estensione CEO (stesso giorno):
oltre al popup, AUDIT + REDESIGN della **mappa mobile completa** (Codex ha ispezionato la
pagina reale con 7.374 record: a Roma ~304 marker sovrapposti; il layout <=768 metteva la
sidebar sopra la mappa → la mappa, funzione primaria, arrivava dopo ~600px di scroll).

Dipende da t_4dbce318 (FASE C attribuzione UI, merged `63d1aa9`): il popup ora ha la riga
provenienza fonte/licenza/data.

## Metodo

- Build di produzione locale + preview con binding D1 reale (copia non tracciata di
  `scripts/serve-preview.mjs` con `d1Databases` + `ENVIRONMENT=development`), seed
  `db:reset`+`db:seed` + fixture audit (`scripts/audit-popup.sql`, UNTRACKED): camere con
  direzione/indirizzo/descrizione, batch import committed (FASE C provenance), conteggi
  community (like x3, confirm x5, gone x1; like x1, problem x2), sessione autenticata
  (contributor 900, token hash reale).
- Rendering con Chrome headless (puppeteer-core): viewport 390/768/1280 per il popup,
  390x700/390x844/768 per la pagina mobile; locale EN vs IT (cookie + localStorage);
  stati anonimo e loggato.
- Misure geometriche reali (`getBoundingClientRect`) prima/dopo: `geom-before.json` /
  `geom-after.json` in `docs/design/screenshots/map-popup-redesign/`.

## Audit PRIMA — popup mappa

| Metrica | PRIMA | DOPO |
|---|---|---|
| Altezza popup @1280 | 623px (115% della mappa) | 439px (81%) |
| Altezza popup @390 | 623px (134% della mappa) | 439–454px (95–98%) |
| Overflow sotto viewport @390 | **+231px** (le ultime 2 card fuori schermo) | +199px (marker sotto la piega; contenuto scrollabile) |
| Blocco azioni community | 216px (5 card 147×52, 3 righe) | toolbar 53–68px (1 riga) |
| Facts (ID/location/direzione) | 94px (righe stack) | 53px (griglia densa 2 col) |
| CTA visibili in competizione | 5 card + 2 link footer | 2 azioni + 1 disclosure + 1 footer |
| Gerarchia | azioni > record (invertita) | record > azioni (corretta) |

Problemi rilevati:

1. **Le 5 card community dominano il popup** (216px, ~35%): peso visivo delle azioni
   superiore al titolo/record. Gerarchia invertita.
2. **Popup altissimo** (623px): 134% dell'altezza mappa a 390px, overflow +231px oltre lo
   schermo mobile — le ultime 2 card (`Non c'è più`, `Segnala`) tagliate.
3. **Doppio CTA in competizione**: il footer aveva sia "Open record" sia "Report an issue"
   — il secondo duplicava le azioni community Problema/Privacy del widget.
4. **Facts in righe stack** (una riga per valore): coordinate/direzione occupavano 94px.
5. **Toolbar a 3 colonne strette**: label IT lunghe ("Aggiorna o segnala") andavano a capo
   su 3 righe sfilacciate.

Audit mobile PRIMA (estensione CEO):

| Metrica | PRIMA @390x700 | DOPO @390x700 | PRIMA @390x844 | DOPO @390x844 |
|---|---|---|---|---|
| Y della mappa | 652px | **340px** | 707px | **340px** |
| Altezza filtri | 278px | 232px | 278px | 232px |
| Altezza documento | 1392px | 1317px | 1526px | 1409px |
| Sidebar sopra la mappa | sì (266–321px) | no (sotto, collassata) | sì | no |
| Scroll prima della mappa | ~340px oltre il viewport | **0** (mappa nel primo viewport) | ~330px | 0 |
| Zoom Leaflet | 26×26 | **44×44** | 26×26 | 44×44 |
| Close popup Leaflet | 24×24 | **44×44** | 24×24 | 44×44 |

## Redesign — popup mappa (desktop e mobile)

Struttura del nuovo popup (`app/lib/map-popup.ts`):

```
┌─────────────────────────────────┐
│ header: titolo / tipo / stato    │  compatto, un blocco
├─────────────────────────────────┤
│ facts: ID · Posizione           │  griglia densa 2 colonne
│        Campo visivo (se c'è)    │
│ [indirizzo] [descrizione]       │
├─────────────────────────────────┤
│ toolbar: [👍 Utile 3] [✓ Conferma 5] [Aggiorna/segnala ▾] │
│   └ disclosure: Non c'è più / Problema / Privacy          │
│      └ Privacy → conferma esplicita                        │
├─────────────────────────────────┤
│ footer: Open record →           │  UNICO CTA (report-issue rimosso)
│ provenance: fonte · licenza · data │  metadata discreto
└─────────────────────────────────┘
```

Decisioni di design:

1. **Toolbar compatta** (`CommunityActions.tsx`, variante compact): `Utile` e `Conferma`
   restano visibili con **icona SVG inline + conteggio** (nessuna libreria — PM directive
   zero nuove libs; icone stroke-only currentColor, aria-hidden). `Aggiorna/segnala` è un
   trigger disclosure che espone `Non c'è più`, `Problema`, `Privacy` con copy esplicito
   (aria-label = help ADR) e conteggi. La variante **full** (record page) resta invariata.
2. **Conferma esplicita solo per Privacy**: cliccare Privacy apre un mini-conferma nel
   pannello ("Confermi la segnalazione di privacy? … Non puoi annullarla") con i pulsanti
   "Segnala la questione di privacy" / "Annulla" — l'unica azione distruttiva (fast-hide
   GDPR). Le altre due (gone/problem) agiscono al click come prima. Nessun PUT parte prima
   della conferma (verificato nei test).
3. **Footer con un solo CTA**: il link "Report an issue" (/correggi?record=ID) è stato
   RIMOSSO dal popup — le azioni Problema/Privacy del disclosure sono la superficie di
   segnalazione a livello record; il form di correzione resta sul record detail. Niente più
   duplicazione/competizione. L'API `/correggi` e la pagina non sono toccate.
4. **Facts densi**: griglia 2 colonne `minmax(0,auto) minmax(0,1fr)` con `overflow-wrap`,
   niente `white-space:nowrap` sulle label (lezione layout-IT round 2).
5. **A11y**:
   - disclosure: `aria-expanded`, `aria-controls`, `role="group"` sul pannello; apertura →
     focus al primo elemento del pannello; `Escape` chiude e riporta il focus al trigger
     (ascolto su `document`: il pannello non è focusabile, il keydown su body va comunque
     gestito);
   - bottoni azione: `aria-pressed`, `role="status"` sr-only per i conteggi ("Utile: 12");
   - target touch ≥44px (min-height 44 su toolbar e pannello);
   - `:focus-visible` outline 3px su trigger e azioni del pannello.

## Redesign — mappa mobile MAP-FIRST (estensione CEO)

`app/globals.css` @media (max-width:768px):

1. **Ordine**: `.map-card .map-split > .map-panel { order:-1 }` — la mappa diventa la prima
   riga (DOM invariato per il layout desktop side-by-side; niente JS di riordino).
2. **Altezza mappa su svh**: `height:calc(100svh - 250px); min-height:340px;
   max-height:64svh` — riempie il viewport reale mobile (URL bar compresa) e non lo supera
   prima dell'interazione. `env(safe-area-inset-bottom)` sul padding del layout.
3. **Filtri compatti**: padding 10/14/12, label `text-2xs` con letter-spacing ridotto,
   select `padding:11px 10px; min-height:44px` (target WCAG 2.5.8 preservato). 278→232px.
4. **Pannello "Punti nella vista corrente" sotto la mappa, collassato di default**
   (`MapRecordList.tsx` + `MapPanel.tsx`): header con titolo + conteggio live + **toggle
   disclosure** (`aria-expanded`, `aria-controls="map-list-scroll"`, 44×44, keyboard). La
   lista è nascosta da `.map-list-scroll.is-collapsed { display:none }` finché l'utente non
   la espande — la mappa resta la prima cosa visibile. Lo stato parte da `matchMedia("(max-
   width:768px)")` al mount (SSR/test-safe: default espanso). Desktop ignora il flag
   (`@media min-width:769px .map-list-toggle { display:none }`).
5. **Zoom Leaflet ≥44px** (WCAG 2.5.8) e **attribution** compatta con ellipsis che non
   copre zoom/marker.
6. **Popup nel viewport mobile**: `.leaflet-popup-content-wrapper` e `.leaflet-popup-content`
   con `max-height:min(60svh, calc(100svh - 140px))` + `overflow-y:auto` — il contenuto
   scrolla dentro il popup; la mappa resta utilizzabile. Close button Leaflet 44×44
   (specificità aumentata: `a.leaflet-popup-close-button`, la regola Leaflet 0,2,1 avrebbe
   vinto su una 0,2,0). Nessuna gesture custom, nessuna libreria.

## i18n

`app/lib/i18n/community.ts` — chiavi nuove in `actions` (EN pilota, IT parity tsc):

- `moreActions: "Update/report"` / `"Aggiorna/segnala"` (forma con barra: il trigger sta
  in una colonna ~90px; "Update or report" andava a capo su 3 righe)
- `moreActionsHelp` (aria-label del trigger), `moreMenuLabel` (aria-label del pannello)
- `privacyConfirmTitle` / `privacyConfirmBody` / `privacyConfirmAction` / `cancel`

## File modificati

| File | Cosa |
|---|---|
| `app/lib/map-popup.ts` | nuovo layout header/facts/footer; report-issue rimosso; options per provenance |
| `app/components/CommunityActions.tsx` | variante compact → toolbar + disclosure + privacy confirm; icone SVG inline |
| `app/components/home/MapPanel.tsx` | popupHtmlFor senza issueHref; stato pointsCollapsed (matchMedia) |
| `app/components/home/MapRecordList.tsx` | toggle disclosure nel header del pannello punti |
| `app/components/tools/MappaTool.tsx` | rimossa prop issueHref |
| `app/globals.css` | popup compatto, toolbar, pannello disclosure, MAP-FIRST mobile, svh, zoom/close 44px, safe-area |
| `app/lib/i18n/community.ts` | 6 nuove chiavi EN+IT |
| `tests/client-community-actions.test.mjs` | 2 test riscritti (toolbar/disclosure, privacy confirm con counting mock) |
| `tests/client-tools.test.mjs` | popup senza /correggi, footer singolo |
| `tests/client-field-of-view.test.mjs` | firma popupHtmlFor aggiornata (no issueHref) |
| `tests/client-map-panel.test.mjs` | NUOVO: toggle pannello punti (aria-expanded/controls, collapsed, no-handler) |
| `tests/component-smoke.test.mjs` | baseline MapPanel 159→165 |

## Test

- `npm run build` — OK (tsc --noEmit 0 errori, vinext build complete).
- Suite completa: **2114/2114 verdi** (`node --test tests/*.test.mjs`).
- Test nuovi/aggiornati:
  - `client-community-actions` (10): anonimo/loggato, toggle, aria-pressed, 403/409/401,
    compact toolbar (icone, aria-expanded, Escape, menu nascosto fino all'apertura),
    privacy confirm (nessun PUT prima della conferma, cancel non invia);
  - `client-map-panel` (3): header+count+toggle, collapsed (aria-expanded=false, classe
    is-collapsed, click→handler), no toggle senza handler;
  - `client-tools` popup: recordId/coordinate/detail link invariati, **assenza** di
    /correggi nel popup (eliminata la duplicazione), footer presente.

## Screenshot

- Mosaici prima/dopo: `docs/design/screenshots/map-popup-redesign/`
  (`popup-1280-en.png`, `popup-390-en.png`, `popup-1280-it.png`, `mobile-390x844-en.png`,
  `mobile-390x700-en.png`)
- Misure geometriche: `geom-before.json` / `geom-after.json` (stessa cartella)
- Screenshot grezzi: workspace kanban `/tmp/osdb-popup/shots/{before,after,mobile-before,mobile-after}`

## Note

- **Soglie/API non toccate**: nessuna soglia ADR, nessun endpoint, nessun rate limit,
  nessun contratto server. `/correggi` resta come route e nel record detail; è rimosso
  SOLO il link dal popup (duplicazione con le azioni Problema/Privacy).
- La variante full del widget community (record page) è invariata (5 card): il redesign
  riguarda il popup mappa.
- A 390x700 il marker del deep-link ?focus=1 è sotto la piega (y=744 > viewport 700): il
  popup è ancorato al marker, quindi il suo bordo inferiore esce di 44px — ma il contenuto
  è scrollabile internamente e il close è 44×44 raggiungibile. A 390x844 (viewport target
  iPhone) il popup rientra interamente.
- I 304 marker sovrapposti di Roma (dataset reale 7.374 record) restano un problema di
  clustering: fuori scope (PM directive: ZERO nuove librerie, niente markercluster) —
  follow-up P2 con un overlay di densità nativo.
