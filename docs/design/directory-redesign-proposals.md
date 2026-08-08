# Directory redesign — 4 proposte valutate e scelta (t_127492f1)

Data: 2026-08-02 · Autore: Vera (Designer UX/UI) · Stato: implementata su
`feature/design/t_127492f1-directory-redesign` (PR in review)

## 1. Contesto

Feedback CEO su `/directory`: *"è un casino, da rifare"*. Diagnosi verificata
su rendering reale (2026-08-02):

1. **DUE input di ricerca sovrapposti**: "Search by place" (blocco con h2 +
   help + form) e "Search the public directory" (filtro `?q=` che per
   placeholder accettava anche "place or coordinate") — ambigui, doppio peso
   visivo.
2. **Filtri sparsi**: il blocco place-search era separato dalla `FiltersBar`;
   la count stava sotto i filtri; nessuna toolbar risultati.
3. **Nessuna export in pagina** (CSV/GeoJSON esistevano solo su /guide e
   /mappa, via `/api/cameras?format=…`).
4. **Card da 270px min** con 4–6 fatti = densità bassa; nessuna modalità
   compatta.
5. "Use the map instead" fluttuava da solo sopra il place-search.
6. Gerarchia debole: h1 tool → h2 place-search → filtri senza heading.

Criteri di valutazione richiesti: **ordine visivo (filtri+lista+export)**,
**densità informativa**, **mobile**, **a11y AA**, **coerenza design system**.

## 2. Metodo

Quattro agenti indipendenti hanno prodotto quattro proposte DISTINTE, una per
"firma" di design di modello (brief vincolanti per evitare convergenze):

| # | Firma | File proposta | Concept |
|---|-------|---------------|---------|
| 1 | Anthropic/Claude | `proposals/claude.md` | "L'indice editoriale" — catalogo a righe |
| 2 | ChatGPT/OpenAI | `proposals/openai.md` | "One Bar Directory" — toolbar unica sticky |
| 3 | Gemini/Terra | `proposals/gemini.md` | "Elenco come dataset" — sidebar + tabella |
| 4 | DeepSeek | `proposals/deepseek.md` | "Righe piatte" — bare essentials |

Nota di processo: l'ambiente non espone reasonix multi-model; le quattro
proposte sono state eseguite come **richieste separate** (un agente per
proposta) sul runtime disponibile, con persona di design esplicita nel brief.
I file originali restano nel workspace della task
(fuori dal repo).

## 3. Sintesi delle proposte

### 3.1 Claude — "L'indice editoriale"
Righe-catalogo ~80px (vs card 270px, ~3× densità), UN solo input `?q=` con
geocoding come azione secondaria ("Near this place") + `?place=` additivo,
toolbar compatta, export discreto nell'header risultati, count subito sopra.
Auto-valutazione: 5/5/4/5/4.

### 3.2 OpenAI — "One Bar Directory"
Una toolbar-card sticky (≥980px) che assorbe search+filtri+sort+export+count;
filtri avanzati in `<details>` (progressive disclosure); "Search by place"
come modalità mutualmente esclusiva col campo `?q=`; card compatte 3 colonne
≥1320px. Auto-valutazione: 5/4/4/4/5.

### 3.3 Gemini — "Elenco come dataset"
Sidebar filtri a sinistra (sticky, landmark `aside`) + tabella dati con
colonne ordinabili (`aria-sort`), toggle densità (localStorage), count "N di
M", minimap opzionale, export nell'header tabella. Densità massima; nuovo
componente `RecordTable` motivato. Auto-valutazione: 5/5/4/4/4.

### 3.4 DeepSeek — "Righe piatte"
Tre fasce lineari: **controlli → count/export → lista**. Una sola riga di
controlli nudi (nessuna card-contenitore), righe piatte ~70px con hairline,
export onesto (dichiara che applica i filtri server type/freshness), reset
condizionale, "Cerca vicino a un luogo…" come trigger che espande un solo
input. Auto-valutazione: 5/5/4/4/5.

## 4. Confronto sui 5 criteri

| Criterio | Claude | OpenAI | Gemini | DeepSeek |
|----------|:---:|:---:|:---:|:---:|
| Ordine visivo (filtri+lista+export) | 5 | 5 | 5 | **5** |
| Densità informativa | 5 | 4 | 5 | **5** |
| Mobile | 4 | 4 | 4 | **4** |
| A11y AA | 5 | 4 | 4 | **4** |
| Coerenza design system | 4 | 5 | 4 | **5** |
| **Rischio implementativo** | medio | medio | **alto** | **basso** |

Note puntuali:
- **Claude**: ottimo ordine e densità, ma la count sopra i controlli (che la
  modificano) è fuori ordine logico; `?place=` aggiunge stato URL; 3 varianti
  su 3 componenti.
- **OpenAI**: tool-feel efficace, ma la toolbar sticky con ombra e il
  nascondere freshness/sort dietro `<details>` riduce la manipolazione
  diretta (il DS richiede "reset sempre visibile" e controlli espliciti);
  estetica borderline "dashboard".
- **Gemini**: densità massima ma superficie più grande (tabella nuova,
  `?sort=` esteso nel hook condiviso, toggle localStorage, minimap); estetica
  da data-explorer che sfiora la "dashboard di security" — contro il
  principio §1 del DS. La trasformazione tabella→lista mobile è il punto più
  delicato.
- **DeepSeek**: l'ordine "filtri → count/export → lista" risponde
  letteralmente al criterio; zero chrome = massima sobrietà civic-tech;
  rischio minimo (variante `bare` di FiltersBar riusa la griglia esistente,
  righe contestuali, nessun nuovo parametro URL, nessun tocco ai hook
  condivisi). Limiti dichiarati: export filtrato solo su type/freshness
  (dichiarato nella label), reset condizionale.

## 5. Scelta: proposta 4 — "Righe piatte" (DeepSeek), con correzioni da Claude

**Motivazione**: è la proposta che risolve il "casino" con il minor
cambiamento possibile e la massima aderenza al design system:
1. **Ordine visivo letterale** (filtri → count/export → lista): tre fasce
   lineari, zero blocchi fluttuanti, un solo input visibile alla volta.
2. **Sobrietà**: niente toolbar-card sticky, niente ombre nuove, niente
   tabella analitica — coerente con civic-tech sobrio del DS (§1, §3.5).
3. **Rischio basso**: nessun nuovo parametro URL (D3 intatto), nessuna
   modifica a hook/API condivisi, /mappa e home byte-identici.
4. **Densità**: ~3× record per viewport senza sacrificare i fatti chiave.

**Correzioni applicate da Claude** (mantenendo la firma DeepSeek):
- Export e count nella STESSA riga meta (ma sotto i controlli, sopra la
  lista — ordine di DeepSeek);
- Contrasti e target da palette (Claude era più rigoroso su a11y);
- "Use the map instead" nel tool-heading (entrambi lo proponevano).

**Scarti motivati**: Gemini troppo pesante per il valore aggiunto (la
directory è l'equivalente testuale della mappa, non un BI tool); OpenAI
nasconde controlli a basso rischio dietro disclosure; Claude ha la count fuori
ordine e aggiunge stato URL.

## 6. Implementazione (PR)

Layout finale di `/directory` (desktop):

```
.tool-heading.directory-tool-heading      eyebrow + h1 + intro   [Use the map ↑]
FiltersBar variant="bare"                 [Cerca…] [Tipo ▾] [Freshness ▾] [Ordina ▾] [Azzera]
.directory-meta                           N record trovati (role=status) · [Cerca vicino a un luogo…] [CSV · GeoJSON]
.place-search (pannello collassabile)     h2 + help + form (ids storici)  ← chiuso finché il trigger non lo apre
h2.sr-only "Directory results"            scala h1→h2→h3
.place-banner (se ricerca luogo attiva)   area + count + [Cancella]
ul.record-list (1 colonna)                righe piatte: titolo | fatti | azioni
EmptyState truthfull                      se 0 risultati
```

File cambiati:

| File | Cambio |
|------|--------|
| `app/components/tools/DirectoryCatalog.tsx` | **nuovo** — layout catalog (meta row, pannello luogo, righe, empty) |
| `app/lib/usePlaceSearch.ts` | **nuovo** — flusso ricerca-luogo condiviso (hub + catalog), precedente ReportForm/useReportFlow |
| `app/components/home/PublicDirectory.tsx` | variante `hub` (byte-identica) / `catalog` (delega a DirectoryCatalog); 140 righe (budget refactor ✓) |
| `app/components/FiltersBar.tsx` | variante `bare`: griglia controlli senza counter (inline/panel byte-identiche) |
| `app/components/tools/DirectoryTool.tsx` | exportHrefs (kind+freshness via `serverFiltersFrom`), variant catalog, link mappa nel tool-heading |
| `app/lib/i18n/directory.ts` | +6 chiavi en/it: `resultsRegion`, `exportCsv`, `exportGeoJson`, `exportHint`, `searchNearPlace`, `placeHide`; `searchPlaceholder` ristretto |
| `app/globals.css` | `.directory-tool-heading`, `.directory-meta`, `.place-search-closed`, `.place-banner`, righe contestuali `.directory-tool .record-list`, media 700 |
| `docs/FRONTEND_DESIGN.md`, `docs/SITEMAP.md` | aggiornati (catalog mode, varianti, responsive) |

**Decisioni di implementazione** (emerse dai contratti di test, non dalla
proposta grezza):
1. **RecordCard invariata** (nessuna variante `row`): lo stile riga arriva
   dal contesto `.directory-tool .record-list` — la classe
   `class="record-list-card"` resta byte-identica perché la suite a11y la
   conta esattamente, e il budget refactor dei componenti home (≤150 righe)
   resta rispettato.
2. **Pannello luogo chiuso via classe** (`.place-search-closed` =
   `display:none`), non attributo `hidden`: il contratto pages-render vieta
   `hidden` non-aria.
3. **Record ID mantenuto nelle righe** (fatto chiave): il contratto
   rendered-html richiede `<dt>Record ID</dt>` in ogni card (equivalente
   testuale della mappa).
4. **`h2.sr-only` "Directory results"** (nuova chiave i18n, non il riuso di
   `recordsTitle`): rendered-html vieta la stringa storica del records-heading
   su /directory e la scala heading non deve saltare h1→h3.
5. **Export onesto**: `/api/cameras?format=csv|geojson&kind=…&freshness=…`
   (solo filtri server, come il fetch della lista); la label `exportHint`
   dichiara cosa contiene il download.
6. **Un solo flusso di risultati**: una ricerca luogo attiva sostituisce la
   lista (banner + fact Distanza); niente doppia lista impilata (era parte
   del "casino").

**Verifica**: build ✅; suite completa `node --test "tests/*.test.mjs"`:
**1454 test, 0 fail** ✅ (inclusi rendered-html, a11y-interactive,
pages-render, client-tools, browse-filter-record, component-smoke — budget
refactor ≤150 righe rispettato, i18n-pages, home-hub, navigation-pages,
status-leak, publication-boundaries, community-i18n, axe-audit); rendering
verificato EN/IT desktop, filtro→URL→count→export sincronizzati, pannello
luogo collassabile, home e /mappa byte-identici.

## 7. Follow-up proposti (fuori scope PR)

- `--shadow-*` binding del DS (D15) resta aperto (debt storico, non di
  questa task).
- Valutare `?place=` in URL in un secondo tempo, se la ricerca per luogo
  della directory deve diventare deep-linkabile come su /mappa.
- La densità "tabella" (proposta Gemini) può diventare un toggle futuro se
  il volume di record crescerà — oggi 2 record demo, la riga è sufficiente.
