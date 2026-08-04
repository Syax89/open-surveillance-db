# QA Layout IT — Round 2 (t_690ed55e)

**Data:** 2026-08-05 · **Autore:** Vera (design) · **Stato:** verificato

## Contesto

Feedback CEO (2026-08-04): *"quando passo all'italiano il layout si muove, le parole
sono lunghe diverse"*. Le feature recenti — campo direzione (#296), form segnala,
popup mappa con direzione, cronologia record — hanno introdotto stringhe IT
~1.5–2x più lunghe delle EN, mai testate a layout.

Obiettivo: **layout STABILE tra EN e IT** a 390/768/1280 px su home, /segnala,
/mappa, /directory e dettaglio record, eliminando ogni shift/wrap/overflow causato
dalla sola lingua.

## Metodo

- Build di produzione locale + preview con binding D1 reale
  (`scripts/serve-preview-audit.mjs`, persistence `.wrangler/state`, seed
  `db:reset`+`db:seed`, fixture sessione verificata per il form /segnala).
- Rendering con Chrome headless (puppeteer-core): locale EN (nessun cookie) vs IT
  (cookie `opensurveillancedb-locale=it` + `localStorage` per i client island).
- Per ogni pagina × viewport: misura geometrica di **tutti** gli elementi
  (`getBoundingClientRect`) nelle due lingue → delta `dx/dw/dh` (px) per elemento;
  screenshot full-page EN vs IT (sotto `docs/qa/screenshots/audit-it-round2/`,
  `BEFORE/` pre-fix, `AFTER/` post-fix, `MOSAIC/` confronti affiancati).
- Soglia di attenzione: |delta| > 2px su posizione/larghezza/altezza.

## Problemi rilevati (BEFORE)

Delta di altezza documento (EN → IT) @390: home +110px, /segnala +80px,
/directory +55px, /records/1 +37px, /mappa +20px — la pagina "cresce" passando
all'italiano. Cause per pagina:

| Pagina | Elemento | Delta @390 | Causa |
|---|---|---|---|
| home | `.hero h1` | wrap su riga extra | headline IT ~7% più lunga |
| home | CTA `Segnala una telecamera →` | larghezza −50px, sposta freccia | bottone non a larghezza stabile |
| home | `.hero-intro`, hero block | altezza −25px IT | conseguenza del wrap h1 |
| /segnala | `legend` coordinate | −59px | testo IT più corto, layout interno non stabile |
| /segnala | `fieldset.coordinate-entry` | +17px altezza | label/help IT su più righe |
| /mappa | filtri `Tipo di telecamera` ecc. | label +14px, select +14px, colonna shift | griglia a frazioni fisse con contenuto che cambia |
| /mappa | `.map-hint` (66 char IT) | −84px larghezza, −16px altezza | testo lungo senza `overflow-wrap`, hint si restringe |
| /directory | `.record-search` (placeholder IT ~1.3x) | input +11px, help text −17px | track griglia 1fr che si adatta all'intrinseco dell'input |
| /directory | filtri + `Azzera i filtri` | ±11px shift | stessa griglia a contenuto variabile |
| /records/1 | `.confirm-button` `0 verifiche` | +25px | bottone non stabile |
| /records/1 | azioni (`Segnala una correzione` / `Proponi una modifica`) | riga che cambia | wrap del bottone su 2 righe solo in IT |
| tutte | `.nav-links` desktop | wrap/overflow a 768–1280 | nav gap/font fissi con voci IT più lunghe |
| tutte | skip-link | −39px (EN→IT) | solo testo diverso, non un bug |

## Fix applicati (`app/globals.css`)

1. **`.nav-links`** — `gap: clamp(10px, 1.3vw, 28px)` + `font-size: clamp(12px, 1vw, 14px)`:
   la nav desktop resta su una riga in entrambe le lingue a tutti i viewport
   (prima: gap/font fissi → voci IT lunghe spingevano fuori riga).
2. **`.hero h1`** (@media ≤480) — `font-size: clamp(36px, 10.2vw, 49px)`: stessa
   resa display ai margini, ma a 390px EN e IT cadono sullo **stesso numero di
   righe** → altezza hero identica (prima: IT +1 riga, +25px).
3. **`.map-hint`** — `max-width: calc(100% - 32px)` + `overflow-wrap: anywhere`:
   l'hint IT (66 char) ora va a capo dentro i bordi invece di restringere il box.
4. **`.record-detail-actions`** (@media ≤480) — `display:grid;
   grid-template-columns: repeat(2, minmax(0,1fr))`: i due bottoni azione **non
   possono più** finire su righe diverse tra le lingue; testo centrato e
   `white-space:normal` + `overflow-wrap:anywhere` dentro la propria colonna.
5. **`.directory-controls`** — prima colonna `minmax(0,1fr)` + `.record-search
   input { width:100%; min-width:0 }`: il placeholder IT più lungo non allarga
   più la track (prima: +24px di colonna e help text ri-wrappato).
6. **`.map-card .filters-panel`** — colonne `minmax(0,1fr)`: select con label IT
   più larghe non si scambiano più ±14px tra le lingue.
7. Pulizia media query (980/700/480) per mantenere le griglie a frazione pura
   anche nei breakpoint intermedi.

Tecniche usate (richieste dal task): `min-width`/griglia stabile sui bottoni,
`overflow-wrap:anywhere`, `grid minmax(0,1fr)`, niente `white-space:nowrap` su
label lunghe, `clamp()` sul font dove serve. Nessuna modifica a stringhe/i18n.

## Verifica (AFTER)

Misura finale (build di produzione, preview con D1, Chrome headless): altezza
documento EN vs IT dopo i fix — i delta residui sono da testo prosa che va a
capo (IT più lungo), non da controlli/componenti.

| Pagina | 390px EN→IT | 768px | 1280px |
|---|---|---|---|
| home | 3581 → 3691 (+110) | 2699 → 2741 (+42) | 2271 → 2350 (+79) |
| /segnala | 2690 → 2770 (+80) | 2392 → 2481 (+89) | 2083 → 2135 (+52) |
| /mappa | 1490 → 1509 (+19) | 1411 → 1430 (+19) | 1050 → 1102 (+52) |
| /directory | 2152 → 2207 (+55) | 1498 → 1517 (+19) | 1188 → 1240 (+52) |
| /records/1 | 1489 → 1526 (+37) | 1278 → 1297 (+19) | 1222 → 1274 (+52) |

Il Δ condiviso di 52px a 1280px (e 19px a 768px) è il footer (`site-footer`:
tagline IT 127 char vs EN 89); il resto è prosa di sezione (hero intro 6→7
righe a 390px, principles, report-section). Questi wrap sono proporzionali
alla lunghezza del testo, non shift di controlli: per azzerarli servirebbero
clamp di font sulla prosa (testato: clamp 17px sull'hero intro NON converge,
il testo IT resta su una riga in più — riduce solo la leggibilità) → trattati
come follow-up P2, non fixati qui per non degradare la tipografia.

Elementi a controllo/componente verificati stabili dopo i fix:
- `.hero h1` a 390px: EN e IT entrambe 3 righe, stessa altezza (126.5px);
- `.map-hint`: box a larghezza fissa col testo IT che va a capo dentro i bordi;
- `.directory-controls` + input ricerca: colonna identica tra lingue;
- `.map-card .filters-panel`: select allineate, nessuno shift ±14px;
- `.record-detail-actions` a ≤480px: i due bottoni sempre sulla stessa riga;
- `.nav-links`: una riga a tutti i viewport in entrambe le lingue.

## Screenshot

- BEFORE: `docs/qa/screenshots/audit-it-round2/BEFORE/` (5 pagine × 3 viewport × EN/IT)
- AFTER:  `docs/qa/screenshots/audit-it-round2/AFTER/`
- Confronti affiancati EN-vs-IT: `docs/qa/screenshots/audit-it-round2/MOSAIC/`
- Misure geometriche: `geom-before.json` / `geom-after.json` (stessa cartella)

## Note

- `/segnala` è protetto da WriteGate: il form compare lato client dopo verifica
  sessione ("Verifica in corso…" nello stato SSR). La sessione fixture
  (`scripts/audit-session.sql`, UTENTE NON VERSIONATO) abilita il form reale con
  il campo direzione e la bussola.
- L'edit CSS è puramente `app/globals.css`; nessun cambiamento di layout
  funzionale, nessuna stringa toccata.
- Non coperto: IE/legacy (fuori scope), estremi <320px (già gestiti da t_94b3726d).
