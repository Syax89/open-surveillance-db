# Map ↔ Directory switch: transizione fluida (issue #410)

**Ruolo:** design (Vera) · **Stato:** implementato su `design/issue-410-vt`
**Data:** 2026-08-09 · **Issue:** https://github.com/Syax89/open-surveillance-db/issues/410

## Problema

Lo switch Esplora (in alto a destra su `/mappa` e `/directory`) naviga via `<a href>`
normali: cambio pagina istantaneo, senza continuità visiva, e le due pagine hanno
larghezze diverse — `/mappa` workspace `min(1440px, 100% - 32px)`, `/directory`
catalogo `min(1180px, 100% - 48px)` (`--container-standard`). Lo shift di larghezza
viene percepito come "salto" proprio perché non c'è alcuna transizione.

## Misura dello shift di larghezza (criterio di accettazione)

Entrambi i container sono centrati (`margin: 0 auto`), quindi lo shift è simmetrico
(metà per lato):

| Viewport | /mappa | /directory | Shift totale | Per lato |
|---|---|---|---|---|
| 1920 | 1440 (margini 240) | 1180 (margini 370) | 260 px | 130 px |
| 1366 | 1334 (margini 16) | 1180 (margini 93) | 154 px | 77 px |
| 1280 | 1248 (margini 16) | 1180 (margini 50) | 68 px | 34 px |
| ≤1228 | full-width, gutter 16 px | full-width, gutter 24 px | 16 px | 8 px |

A 1920 lo shift è il più grande (130 px/lato) — coincide con lo schermo in cui la
mappa "vale" la sua larghezza. Sotto 1228 px resta una differenza di gutter di 8 px/lato.

## Decisione di design

### A — Equalizzare le larghezze: NO

La differenza è **deliberata** (redesign R2): il catalogo è una lista di righe di
testo, 1180 px è la larghezza di lettura; la mappa è un workspace che guadagna da
tutta la larghezza disponibile (il CEO ha chiesto esplicitamente la mappa grande,
PR #333). Equalizzare a 1440 px danneggerebbe la scansione delle righe del catalogo;
equalizzare a 1180 px rimpicciolirebbe la mappa. **Il problema non è la larghezza,
è l'assenza di transizione**: lo stesso shift, se avviene "dietro" una dissolvenza,
viene letto come cambio di vista intenzionale, non come salto.

### B — View Transitions API cross-document: SÌ (scelta, scoped)

- `<meta name="view-transition" content="same-origin">` emesso **solo** da `/mappa`
  e `/directory` (metadata `other`), non dal layout root: la transizione avviene
  **solo** tra le due viste dell'esploratore, tutte le altre navigazioni restano
  invariate (niente effetto site-wide non richiesto).
- **Progressive enhancement**: zero JS, zero polyfill, zero peso. I browser senza
  l'API (o con reduced motion) fanno la navigazione normale — status quo, nessuna
  regressione.
- **Crossfade sequenziale attraverso il fondo carta** (`--paper`): la pagina
  vecchia sfuma a opacità 0 in 140 ms, la nuova entra in 220 ms dopo un delay di
  140 ms. Lo shift di 260 px avviene mentre **entrambe** le pagine sono trasparenti:
  l'occhio non lo vede mai. (Un crossfade simultaneo mostrerebbe le due larghezze
  sovrapposte a mezza opacità — il "salto" animato, peggio del problema.)
- **Shared element**: `.explore-view-switch` riceve `view-transition-name` — lo
  switch resta ancorato e "sopravvive" al cambio pagina mentre il contenuto
  attorno sfuma. È lo stesso controllo nelle stesse coordinate in entrambe le
  toolbar, quindi il morph è naturale e dà continuità visiva.
- **Reduced motion (WCAG 2.3.3)**: le animazioni custom vivono dentro
  `@media (prefers-reduced-motion: no-preference)`; in `reduce` un kill-switch
  (`animation: none !important` su `::view-transition-*`) rende il cambio istantaneo.
- Durata totale ~360 ms, sola opacità, niente translate/scale: coerente con
  l'estetica sobria civic-tech (nessun effetto vistoso).

### C — Soften con animazione: assorbito in B · D — toggle SPA: NO

C è la versione "solo animazione di arrivo" senza API: su browser non supportanti
non risolve nulla, su browser supportanti rischia doppie animazioni (fade-in del
container + snapshot della transizione). D (router.push condiviso) rompe il mental
model del back button e aggiunge stato condiviso tra route — over-engineering per
un polish P3, e violerebbe il contratto "navigazione = URL" del repo.

## Accessibilità dello switch (criterio di accettazione)

Invariata e già corretta: `<nav aria-label>` con link reali (tastiera nativa),
`aria-current="page"` sul link attivo, focus-visible con outline `--focus`. La
transizione non rimuove la navigazione: URL e document title cambiano davvero, e
lo screen reader annuncia il nuovo documento come in una navigazione normale.
Nessun aria-live necessario (non è un aggiornamento in-place).

## File modificati

- `app/(tools)/mappa/page.tsx` — `other: { "view-transition": "same-origin" }`
- `app/(tools)/directory/page.tsx` — idem
- `app/globals.css` — blocco `osdb-vt-out/in` + shared element + kill-switch reduced-motion

## Verifica

- Build `npm run build` verde.
- HTML SSR: `<meta name="view-transition" content="same-origin"/>` presente su
  /mappa e /directory, **assente** su / e /segnala (scoping confermato).
- Bundle CSS servito: `@keyframes osdb-vt-out/in`, `view-transition-name`, kill-switch.
- Suite test completa in corso di verifica (worktree pulito, `node --test "tests/*.test.mjs"`).

## Note per il futuro

- Se un giorno la directory dovesse crescere fino a meritare la larghezza piena,
  riaprire A con dati reali — oggi la decisione R2 resta valida.
- L'aggiunta di un terzo strumento "esploratore" (es. una timeline) = aggiungere il
  meta alla sua pagina e lo switch condiviso entra in gioco da solo.
