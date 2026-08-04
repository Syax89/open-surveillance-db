# Direzione camere — FEATURE FRONTEND (mappa + form + dettaglio)

> Kanban t_f8b775ec (PARTE 2 UI) · design Vera · 2026-08-04
> Dipende da t_1b08fe12 (colonna `cameras.direction` + API) — PR #294.
> Branch: `feature/design/t_f8b775ec-direzione-camere` (base: `46b09f4`).

## Contesto

La direttiva CEO chiede di rendere visibile il campo visivo delle telecamere:
«triangolo che simula la visione della telecamera su mappa, circolare se a
cupola». Il backend (PR #294) ha aggiunto `cameras.direction` (bearing 0-359,
NULL per cupole/ignote) e l'ha esposto in tutte le API pubbliche. Questa
parte consegna l'interfaccia: cono/cerchio su mappa, campo direzione nei
form, riga nel dettaglio record, i18n EN+IT, a11y e test.

**Nota di stato**: al momento della consegna la PR #294 non è ancora
mergiata su main (stato OPEN, MERGEABLE, CI verde). Il branch di design è
basato sul commit backend `46b09f4` (che contiene migrazione + API): al
merge di #294 basta un rebase su main, nessun conflitto atteso (il design
non tocca file del backend).

## 1. Mappa — cono di visione e cerchio cupola

`app/components/SurveillanceMap.tsx` + `app/lib/field-of-view.ts` (puro,
testabile):

- **Camere direzionali con `direction` non-NULL**: cono/`wedge` di ~60°
  (apertura) e ~35 m (raggio), vertice sul marker, orientato al bearing.
  I punti sono calcolati con trigonometria piana (equirettangolare,
  `METERS_PER_DEGREE_LAT` con correzione `cos(lat)` per i meridiani) e
  renderizzati con **L.polygon nativo** — zero nuove librerie, niente
  `L.semiCircle` (non esiste nel core).
- **Cupole (`Fixed dome`)**: **L.circle** nativo, stesso raggio di 35 m
  (visione 360°, scala visiva identica al cono).
- **Camere senza direzione / direzione NULL**: nessuna geometria.
- **Performance** (stessa direttiva del culling marker QA#5 F3): la
  geometria è disegnata **solo sopra zoom 16** (`FOV_MIN_ZOOM`) e **solo
  per i record nel viewport corrente** (`recordsInBounds`, lo stesso helper
  del culling marker). Il layer vive in una `LayerGroup` separata
  (`fovLayerRef`), così clear/redraw non tocca mai i marker; lo zoom è
  letto in stato (`mapZoom`) nel handler `moveend zoomend` per attraversare
  la soglia senza attendere il debounce dei bounds.
- **Colore = status** (verde `verified`, blu `demo`, …): classi CSS
  `.fov-cone.<status>` con i token `--status-*` già esistenti e `!important`
  per battere gli attributi inline di Leaflet. Zero hex nuovi (vincolo
  tokenizzazione t_be89b99c).
- **A11y**: il cono è **decorativo** — `aria-hidden="true"` sull'intero
  overlay pane (dove vivono i path) e `pointer-events:none`, così non
  intercetta click né lettori di schermo. L'informazione è **testuale nel
  popup** (`Field of view: NE 45°`, v. §3) e nel dettaglio record.

### Verifica live (browser reale, wrangler dev + D1 locale seminato)

- zoom 13 (sotto soglia): `pathCount = 0` con 4 marker presenti;
- zoom 16: `pathCount = 4` → 1 `fov-cone fov-circle verified` (cupola) +
  3 `fov-cone verified` (coni a 45°/135°/270°);
- computed fill del path = `rgb(66, 169, 121)` = `--status-verified` (il
  token vince sull'attributo `#3388ff` di Leaflet);
- `aria-hidden="true"` sull'overlay pane verificato nel DOM;
- popup marker: `FIELD OF VIEW / SE 135°`.

Screenshot: `docs/design/screenshots/direzione-camere/mappa-zoom16-coni-cerchio.png`
(coni + cerchio a zoom 16), `.../mappa-zoom13-senza-coni.png` (prima della
soglia), `.../mappa-popup-direzione.png` (popup col testo direzione).

## 2. Form /segnala — campo direzione condizionale

`app/components/home/ReportForm.tsx` + `app/lib/useReportFlow.ts` +
`app/components/tools/SegnalaTool.tsx`:

- Il **kind select è ora controllato** e usa i **valori canonici**
  (`Fixed dome`, `Bullet`, `PTZ`, …) con label localizzate, condivisi tra i
  due form tramite `app/lib/camera-kinds.ts` (`KIND_OPTIONS`). Prima il
  valore inviato era la **label localizzata** (in IT si salvava "Dome
  fissa"): correzione di design necessaria perché la regola cupola del
  backend (`kind === 'Fixed dome'`) e la visibilità del campo funzionino
  in entrambe le lingue. Il rendering EN resta identico (label = valore).
- Il **fieldset "Field of view direction"** appare **solo per kind
  direzionali** (tutto tranne la cupola). Selezionando una cupola il campo
  sparisce e l'eventuale bearing impostato viene azzerato.
- UI: checkbox **"I don't know the direction"** (default, → `direction:
  null`), slider **0-359** con **anteprima a freccia** (rotazione CSS) e
  readout **bussola+gradi** ("NE 45°", `app/lib/compass.ts` — 16 venti,
  abbreviazioni neutre EN/IT).
- Il payload invia sempre `direction` (numero o null): il server applica
  comunque la regola cupola.

## 3. Form /records/[id]/edit — stesso campo, prefill

`app/records/[id]/edit/page.tsx`:

- `OwnerRecord` include `direction`; il form **pre-compila lo slider** col
  bearing salvato (`directionKnown = true` se il record ne ha uno).
- Il fieldset è **nascosto per le cupole**; passare a cupola azzera il
  bearing. Il PATCH invia sempre `direction` (numero o null — "non so"
  cancella, il backend applica il diff con `null`).
- `FIELD_LIMITS` invariato; gli errori 422 del backend restano distinti
  dal 400 generico (già gestiti dal backend).

## 4. Dettaglio record — riga "Direzione"

`app/records/[id]/RecordPageBody.tsx`: riga `<dt>Direction</dt><dd>NE
45°</dd>` nel dl dei fatti **solo se** `direction` è un numero finito
(cupole e direzioni ignote omettono la riga). Verificata EN ("DIRECTION /
SE 135°") e IT ("DIREZIONE / SE 135°").

## 5. i18n EN+IT (tsc parity)

Nuove chiavi in `map.ts` (`fovDirection`), `report.ts`
(`directionTitle/Help/Unknown/Degrees`, `ptz`), `record.ts`
(`direction`, `editDirection*`). IT senza il termine "contributore",
registro sobrio. `Translation<typeof en>` garantisce parità (tsc verde).

## 6. Test

- `tests/field-of-view.test.mjs` (13 test puri): trig del wedge (vertice
  sul marker, raggio ~35 m, apertura ±30°, verso corretto, wrap 360°),
  bussola 16 venti + wrap, regola cupola/kinds, costanti.
- `tests/client-field-of-view.test.mjs` (15 test DOM): cono/cerchio
  sopra soglia, niente geometria sotto soglia e dopo lo zoom-out, layer
  separato dai marker, aria-hidden sull'overlay pane, popup col testo
  direzione, visibilità campo nei due form, payload null/numero,
  azzeramento passando a cupola, prefill dell'edit.
- Harness: stub Leaflet esteso (`polygon`/`circle` registrati in un array
  `paths` separato, zoom mutabile, `getPane`); ogni `layerGroup` ora ha
  storage proprio (il clear del layer FOV non tocca i marker).

## 7. Evidenze e limiti

- Suite completa: **1926+ test verdi** (rebuild + `node --test`), lint e
  tsc puliti. Nota: un singolo test geocode click-outside è risultato
  flaky in full-suite (già annotato nel codice come tale), verde in
  isolamento e verde al re-run.
- Screenshot su LXC con `wrangler dev --local` + D1 seminato (4 record:
  1 cupola + 3 direzionali). Il form /segnala è dietro il write gate
  (richiede sessione verificata): lo screenshot mostra la parete di
  login; il comportamento del campo è coperto dai test DOM.
- Il cono è un'approssimazione di design (60°/35 m), non una misura
  reale: coerente con la nota di veridicità del sito («approximate»).
