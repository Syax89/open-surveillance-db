# Popup lifecycle mappa — P0 FIX (SurveillanceMap)

> Kanban t_33b82720 (P0) · Ada (Tech Lead) · 2026-08-05
> Dipende da t_66766914 (hydration MapPanel, PR #318, merged `55ab7af`).
> Branch: `feature/ada/t_33b82720-popup-lifecycle`.

## Contesto — segnalazione utente

«La popup della camera non appare subito, appare/scompare; dopo un doppio
click rimane; pan/zoom fa apparire popup non richiesti.»

Root cause individuate con riproduzione TDD (12 test E2E, `node --test`):

1. **Il click su marker veniva sovrascritto dal picker generico.** In
   Leaflet il click su un marker *bubbula* alla mappa (default
   `bubblingMouseEvents: true`). Il handler `map.on("click")` apriva
   SEMPRE il popup coordinate/segnala (righe ~296-303), che SOSTITUIVA la
   popup del marker (Leaflet ammette un solo popup aperto per mappa).
   Risultato: la popup della camera appare e scompare (sostituita dal
   picker); con doppio click il comportamento dipende dal timing →
   incoerenza riportata.

2. **`clearLayers` + focus apriva popup a ogni moveend.** La rebuild dei
   marker (viewport/cameras/grid) chiamava `layer.clearLayers()`
   (distrugge il marker → chiude la sua popup) e, se
   `focusLocationRef.current` era valorizzato (deep link `?focus`),
   riapriva il popup del focus a OGNI rebuild → «pan/zoom fa apparire
   popup non richiesti» con deep link attivo.

3. **Il click su mappa vuota apriva sempre il picker**, anche durante
   esplorazione/pan/tap mobile — rumore visivo non richiesto.

## Decisioni architetturali

### D1 — Navigazione base SILENZIOSA; picker solo in modalità esplicita «Aggiungi qui»

`map.on("click")` ora fa `return` a meno che la modalità esplicita non sia
attiva. La modalità è un bottone accessibile nella chrome della mappa
(`aria-pressed`, `role="group"` + hint `role="status"`, i18n EN+IT),
posizionato FUORI dal container Leaflet (`.map-addmode`, z-index 800 sopra
i pane Leaflet). In modalità attiva il click apre il picker coordinate e
chiama `onPick` (contratto t_6abb96ac conservato); uscendo dalla modalità
il picker già aperto resta (l'utente lo ha richiesto), i click successivi
sono silenziosi. `mapHint` aggiornato («Usa "Aggiungi qui" …»).

### D2 — Il click su marker fa `stopPropagation` e apre UNA volta, resta aperto

Il marker click handler ora:

- `L.DomEvent.stopPropagation(event)` → il click su un marker non arriva
  MAI al map click handler (il picker non può più sostituire la popup);
- `if (!marker.isPopupOpen()) marker.openPopup()` → idempotente: un click
  apre una volta e resta; un secondo click sullo stesso marker NON fa
  toggle-close (il default `bindPopup` toggle è neutralizzato riaprendo);
  un click su un secondo marker trasferisce una sola volta (Leaflet chiude
  il precedente).

### D3 — Rebuild popup-NEUTRA: ripristina SOLO il popup attivo, e solo se ancora visibile

- Nuovo `activePopupIdRef` aggiornato da `popupopen` (legge
  `data-record-id` dal nodo community) e azzerato da `popupclose` SOLO se
  la chiusura non è del rebuild (`rebuildingRef` attorno a
  `clearLayers`): la chiusura causata dalla rimozione del marker NON è
  una scelta utente, quindi il popup sopravvive alla rebuild.
- Prima di `clearLayers` l'effect salva `restoreId`; dopo il popolamento
  riapre SOLO quel marker (`byId.get(restoreId)`), se ancora renderizzato.
  Se il record è uscito dal viewport l'id resta (il popup «mantiene»: al
  primo rebuild in cui il record rientra, la popup torna — comportamento
  Leaflet nativo emulato). Se l'utente ha chiuso la popup (X / click
  fuori), `activePopupIdRef` è null → la rebuild non riapre nulla.
- Mai altri popup: la rebuild non apre MAI un popup che non era aperto.

### D4 — Deep link `?focus` apre UNA volta; i pan successivi non lo riaprono

`focusPopupShownRef` traccia `"lat,lng"` dell'ultimo focus mostrato: la
popup del record selezionato si apre al primo rebuild dopo il pan di
arrivo, e NON viene riaperta dai rebuild successivi (rimosso
l'`openPopup` incondizionato su ogni rebuild, causa del bug 2). Se la
popup del focus è ancora attiva, la D3 la ripristina quando il record è
visibile.

### D5 — Nessuna nuova libreria

Solo Leaflet nativo (`L.DomEvent.stopPropagation`, `marker.isPopupOpen`,
`marker.openPopup`), React state/ref, CSS.

## File modificati

| File | Cosa |
|---|---|
| `app/components/SurveillanceMap.tsx` | D1-D4: add-mode, stopPropagation, activePopupIdRef/rebuildingRef/focusPopupShownRef, restore popup-neutrale, toggle UI |
| `app/lib/i18n/map.ts` | Nuove chiavi EN+IT (`mapAddModeLabel`, `mapAddHere`, `mapAddModeStop`, `mapAddHint`), `mapHint` aggiornato (parity `Translation<typeof en>`) |
| `app/globals.css` | `.map-addmode*` (toggle 44px touch, aria-pressed state, focus-visible), `position:relative` su `.map-region` |
| `tests/client-map-popup-lifecycle.test.mjs` | NUOVO: 12 test E2E (di cui 11 riproduzione→verde) |
| `tests/client-map-pick.test.mjs` | Aggiornati i 2 test al contratto add-mode esplicita + caso «silenzioso fuori add-mode» |
| `tests/helpers/dom-harness.mjs` | Stub leaflet: `marker.isPopupOpen`, `marker.getElement` (badge aria-label), `L.DomEvent.stopPropagation` (traccia `__stopped`) |

## Test E2E obbligatori (tutti verdi, 12/12)

1. marker click apre UNA volta e resta (no picker generico, propagation fermata);
2. secondo click stesso marker → resta aperto (no toggle-close);
3. click secondo marker → trasferisce una volta (no picker);
4. pan (rebuild) → ZERO nuovi popup; ripristinato solo l'attivo se visibile;
5. pan fuori viewport → popup chiuso, zero nuovi;
6. grid badge → zoom 2 livelli, ZERO popup;
7. click mappa vuota → SILENZIOSO di default (onPick non chiamato);
8. click mappa vuota → picker SOLO in add-mode esplicita (toggle accessibile);
9. marker click dentro add-mode → vince la popup marker, mai il picker;
10. tap touch mobile su marker → apre una volta, zero picker;
11. tap touch mobile su mappa vuota → silenzioso fuori add-mode;
12. deep link `?focus` → apre una volta; pan via non lo riapre; pan di
    ritorno ripristina solo il popup precedentemente aperto.

## Verifiche

- `node --test` sui 9 file mappa correlati: 90/90 verdi.
- `tsc --noEmit`: pulito. `eslint`: 0 errori / 0 warning.
- Full suite `npm test` + build: in corso al momento del report.
- CI (6 check) + review Ada + merge: dopo.

## Non toccato

- API, schema DB, dati, semantica di provenance: invariati.
- Comportamento sidebar/lista viewport-sync, FOV layer, grid: invariati.
- Nessuna nuova dipendenza.
