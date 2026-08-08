# Browse Record — redesign completo di /directory (t_f13fcb1c)

Data: 2026-08-03 · Autore: Vera (Designer UX/UI) · Stato: proposte + implementazione
su `feature/design/t_f13fcb1c-browse-record-redesign` (PR da aprire)

> Contesto CEO: il redesign flat catalog (#231, `t_127492f1`) **non ha convinto** —
> "la pagina è da rifare tutta". Questa task è l'approccio completo:
> audit critico → ricerca best practice → 4 proposte distinte (una per firma di
> modello) → confronto → raccomandazione → implementazione.

---

## 1. Metodo

1. **Audit su rendering reale**, non solo codice: preview server Miniflare
   (`scripts/serve-preview.mjs`) + browser (screenshot desktop, pannello
   ricerca-luogo aperto, misure CSSOM via console) + lettura integrale di
   `DirectoryTool`, `DirectoryCatalog`, `PublicDirectory` (variante catalog),
   `RecordCard`, `FiltersBar`, `useCameraFilters`, `usePublicCameras`,
   `usePlaceSearch`, `globals.css` (786 righe), bundle i18n `directory.ts`,
   e dei contratti di test che vincolano la pagina (rendered-html,
   a11y-interactive, browse-filter-record, client-tools, url-state-contract,
   pages-render, axe-audit, Lighthouse CI ≥0.95).
2. **Ricerca best practice** su 4 famiglie di riferimento (OSM, Google Maps,
   portali OpenData/CKAN, Wikipedia).
3. **4 proposte distinte** con wireframe testuali, una per firma di design
   (Claude, ChatGPT, Gemini, DeepSeek), con brief vincolanti per evitare
   convergenze.
4. **Confronto su criteri espliciti** e raccomandazione motivata.
5. **Implementazione** della proposta vincente, con contratti di test verdi.

---

## 2. Audit critico della pagina attuale (post-#231)

### 2.1 Evidenze raccolte sul rendering reale

| # | Evidenza | Dove |
|---|----------|------|
| V1 | L'input `#place-search` **non ha alcuno stile**: `border:0`, `background:transparent`, `padding:0`, `height:24px` (CSSOM misurato). Nessuna regola `.place-search input` esiste in globals.css — solo `.record-search input` è stilizzato. Il pannello "Search by place" mostra un campo di testo fluttuante invisibile. | `globals.css` (nessuna regola), screenshot pannello aperto |
| V2 | Griglia controlli fratturata a 1280px: search da sola su riga 1, `sort` in colonna sotto la search, `type`+`freshness` a destra, "Reset filters" fluttuante in uno spazio vuoto. | screenshot desktop, `.directory-controls` (3 colonne `1fr/.34fr/.38fr` con 5 item) |
| V3 | Riga meta `.directory-meta` mischia 3 lavori diversi sulla stessa baseline: contatore (`role=status`), trigger luogo, export CSV/GeoJSON come **link di testo** separati da `·` (affordance minima). | screenshot desktop |
| V4 | "Hide place search ↓" usa una **freccia giù per un'azione di chiusura** (semantica invertita). | screenshot pannello aperto |
| V5 | Il pannello luogo si fonde con la prima riga della lista: hairline sottile, nessun contenitore visibile, form che "sanguina" nei risultati. | screenshot pannello aperto |
| V6 | `h2.sr-only` "Directory results": heading invisibile usato solo per tenere la scala h1→h2→h3 — nessun header risultati visibile con conteggio/contesto. | SSR + screenshot |
| V7 | Fatti di riga: etichette uppercase 10px `#63717b` ripetute per OGNI riga (4 etichette × N righe) con gap larghi; il `<dl>` eredita `grid-template-columns:repeat(3,1fr)` dalla card base → **4 fatti in 3 colonne (3+1, sbilanciato)** anche nella riga piatta. | CSSOM + CSS |
| V8 | Spazio vuoto ampio in alto a destra dell'header tool (layout sbilanciato a sinistra). | screenshot desktop |
| V9 | Nessuna UI di **paginazione**: `usePublicCameras` cammina TUTTE le pagine di `/api/cameras` (500/richiesta) lato client; il catalogo renderizza l'intero dataset filtrato in un'unica lista DOM. | `use-public-cameras.ts` (walkPages), `DirectoryCatalog` |
| V10 | La **ricerca per luogo non è nello stato URL**: un risultato luogo non è condivisibile né deep-linkabile; in più la lista luogo SOSTITUISCE quella filtrata (cambio di modello) mentre l'URL continua a mostrare i vecchi filtri. | `usePlaceSearch` (stato locale), URL |
| V11 | **Due paradigmi di ricerca in competizione**: `?q=` (testo: titolo/tipo/fonte/indirizzo/coordinate, client) nella FiltersBar vs "Search near a place" (geografica, server) nascosta dietro un trigger nella meta row. | struttura pagina |
| V12 | Disclaimer "non è prova dell'assenza di sorveglianza" ripetuto 3 volte sulla stessa pagina (pageIntro, placeSearchHelp, emptyBody). Onesto ma rumoroso. | bundle i18n |
| V13 | Export: due link di testo `CSV · GeoJSON` senza contesto (niente data/volume), raggiungibilità bassa; l'hint dichiara correttamente i filtri applicati (bene). | screenshot |

### 2.2 Problemi per dimensione

**UX / Architettura informativa (P1)**
- A1. **Nessuna esperienza di "browse"**: la pagina è una lista piatta ordinata
  alfabeticamente; mancano indice alfabetico, raggruppamenti, statistiche di
  sintesi ("N record, M verificati quest'anno"), ordinamento di default utile
  (per recency). Il default alfabetico è arbitrario per un database di
  sorveglianza: la recency è la dimensione più informativa.
- A2. **Due ricerche** (V11) con modelli mentali diversi e nessuna gerarchia
  tra loro; il trigger luogo è in una riga meta che non sembra "search".
- A3. **Stato luogo fuori dall'URL** (V10): viola il principio D3/D4
  "URL come unica fonte di verità" che il resto della pagina rispetta.
- A4. Il conteggio mostra solo il totale filtrato ("2 public records found"),
  mai la posizione nel set ("mostrando 1–20 di 42") — nessun senso di scala.

**Densità informativa (P1)**
- D1. Etichette ripetute per riga (V7): 4 coppie label:value × N righe =
  rumore visivo; una tabella/riga con header una sola volta sarebbe più densa
  e scansionabile (pattern dataset).
- D2. Righe da ~80px con 3 colonne (titolo | fatti | azioni) ma fatti a
  griglia 3+1 sbilanciata (V7).
- D3. Nessuna vista alternativa: con la crescita del DB (lo scopo di un
  registro pubblico) questa pagina diventerà inutilizzabile.

**Coerenza design system (P2)**
- C1. `RecordCard` riusata come "riga" via override contestuali
  (`.directory-tool .record-list .record-list-card`): l'anatomia card
  (card-topline/kind/dl) sopravvive nella riga; meglio un componente riga
  esplicito o una resa contestuale più radicale.
- C2. `.directory-meta` inventa un pattern (riga meta) che non esiste altrove;
  al suo interno convivono `.data-actions` (pattern /guide) e trigger luogo.
- C3. Tutto è `.text-button`: nessuna azione primaria sulla pagina (l'unico
  `.button` vero è "Search" dentro il pannello luogo collassato).
- C4. Titolo IT "Elenco pubblico" è un'etichetta debole per la funzione
  "browse records" (in nav: "Browse records").

**Accessibilità (P2)**
- A11y1. Input luogo invisibile (V1) = campo di testo senza bordo né sfondo:
  peggiora anche il focus-visible (anello su un input borderless).
- A11y2. Freccia "Hide ↓" invertita (V4) — confonde, non viola WCAG ma è una
  trappola cognitiva.
- A11y3. Etichette fatti 10px uppercase (V7): contrasto ~4.95:1 su `#fffef9`
  (AA normale sì, ma 10px è sotto ogni soglia di comfort) e doppione di
  informazioni già leggibili (location ripetuta).
- A11y4. Più regioni `role=status`/aria-live sulla pagina (count, offline,
  risultati luogo): annunci che possono sovrapporsi.
- A11y5. `h2.sr-only` (V6): hack strutturale; un heading visibile porterebbe
  contesto reale agli utenti vedenti e agli AT insieme.

**Mobile (P2)**
- M1. Sotto 700px tutto impila: search, 3 select, reset, meta (count, trigger
  luogo, export), righe con azioni sotto — una colonna lunghissima con poca
  scansionabilità.
- M2. La riga piatta diventa un blocco verticale (titolo/fatti/azioni) —
  accettabile ma le azioni "Show on map"/"Open record" ripetute N volte
  allungano il tab order.

**Performance e accessibilità dei dati (P1)**
- P1. **Walk di tutto il dataset** (V9): il catalogo scarica l'intero archivio
  pubblico (N pagine × 500) e filtra/ordina client. Per la mappa è giustificato
  (serve la copertura completa); per un elenco no: l'API espone già
  `limit/offset/total/nextOffset` (PR #149) ma la directory non li usa. Con
  migliaia di record: DOM gigantesco, memoria, rete.
- P2. Export filtri-aware solo su kind+freshness (q/sort client) — dichiarato
  nell'hint (bene), ma l'export "di quello che vedo" non è possibile.
- P3. Nessuna metrica di copertura: "quanti record ci sono in totale" è
  visibile solo come count filtrato; il totale server (`total`) esiste ma non
  è esposto.

**Stato URL (P2)**
- U1. I 5 parametri (q/type/freshness/sort/focus) sono solidi: debounce 400ms,
  replace non push, no-op guard, mirror committed — **da preservare intatti**.
- U2. Mancano `page` e `place`: la posizione nella lista non è deep-linkabile.

### 2.3 Cosa va PRESERVATO (contratti e pattern solidi)

- `?q= ?type= ?freshness= ?sort= ?focus=` con debounce e replace (t_3c4b188e):
  zero regressioni sul hook condiviso.
- Id/classi conteggiati dalle suite: `#record-search`, `#record-search-count`
  (role=status), `#record-kind-filter`, `#record-freshness-filter`,
  `#record-sort`, `ul.record-list`, `class="record-list-card"`, `<dt>Record ID</dt>`
  per card, bottone "Show on map" per card (link `router.push(mapHrefWithFocus)`).
- Empty state truthfull, banner offline, hint export onesto, pannello luogo
  chiuso via classe (mai `hidden`), scala heading, target ≥44px, focus
  visible, pannello luogo con `aria-expanded`/`aria-controls`.
- Variante hub della home byte-identica (nessun tocco a PublicDirectory hub).

---

## 3. Ricerca best practice

| Riferimento | Pattern chiave | Lezione per /directory |
|-------------|----------------|------------------------|
| **Wikipedia — Special:AllPages / categorie** (verificato live) | Indice alfabetico A–Z (jump bar), campi "starting at/ending at", namespace filter, paginazione "next page" | Un **indice A–Z** rende l'elenco *sfogliabile* oltre che ricercabile; la **paginazione** è il meccanismo di scala per set grandi; i filtri contestuali (namespace) stanno accanto all'indice |
| **Google Maps — pannello lista** | Lista piazzata a sinistra + mappa a destra; **chips filtro** sopra la lista (tipo, distanza); risultati con distanza; azioni sempre accessibili | La lista è la superficie di navigazione primaria; **chips filtro attivi** con rimozione one-click; **distanza come fatto guida** quando c'è un contesto geografico |
| **Portali OpenData (CKAN: dati.gov.it, data.europa.eu, data.gov)** | Search box in alto, **facet sidebar con conteggi** (formato, licenza, tag), contatore "N datasets found", sort, **paginazione**, card risultato compatte (titolo + descrizione + badge formato) | Il contatore + sort + paginazione sono la triade obbligatoria di un catalogo; i **facet con conteggi** danno orientamento; i badge formato sono l'equivalente del nostro "kind" |
| **OSM — risultati di ricerca / browse** | Righe risultato: nome + tipo + coordinate; la pagina browse mostra i dati strutturati (tag) come tabelle | Nella riga, **nome + tipo + posizione** bastano; i dati strutturati stanno nel dettaglio (/records/[id] — già implementato) |
| **Zillow / GitHub search / NPM** (pattern industria) | Filter bar con chips + sort + count + paginazione; righe con title + meta line + azioni | La **riga a due linee** (title+stato / meta) è il compromesso densità/leggibilità; paginazione con "Showing X–Y of Z" |

**Sintesi delle lezioni** (criteri condivisi):
1. **Sfogliabilità** (indice A–Z / raggruppamenti) oltre alla ricerca.
2. **Triade catalogo**: contatore di scala ("N of M"), sort, paginazione.
3. **Filtri attivi visibili e rimovibili** (chips) — mai stato nascosto.
4. **Densità senza rumore**: header di colonna una sola volta, meta line
   compatta per riga, dettaglio nel record page.
5. **Un solo concetto di ricerca** alla volta, con gerarchia chiara.

---

## 4. Quattro proposte di layout

### 4.1 Claude — "L'indice editoriale" (browse index)

Concept: la directory come **indice sfogliabile**, sul modello Wikipedia
AllPages + catalogo editoriale. Un header risultati VISIBILE con conteggio di
scala, indice A–Z, chips dei filtri attivi, paginazione "mostrando X–Y di Z",
riga a due linee (titolo+stato / kind·luogo·verifica) con Record ID in evidenza.

```
.tool-heading                          eyebrow + h1 + intro            [Use the map ↑]
┌─ search cluster (una riga) ───────────────────────────────────────────────┐
│ [🔍 Search the public directory ………………]  [Near a place… ↓] (secondary btn) │
└───────────────────────────────────────────────────────────────────────────┘
[Type ▾] [Freshness ▾] [Order ▾] [Reset]        ← una riga allineata (4 colonne)
────────────────────────────────────────────────────────────────────────────
Directory results (h2 VISIBILE)   2 public records found   [⬇ CSV] [⬇ GeoJSON]
[chips filtri attivi:  Fixed dome ✕  Last 30 days ✕ ]        (solo se attivi)
[A  B  C  D  …  Z]                                        ← indice alfabetico
────────────────────────────────────────────────────────────────────────────
#12  [●] Illustrative record A  · Fixed dome          [Show on map →] [Open →]
     Via Roma 1 · Verified 2026-07-01
#13  [●] Illustrative record B  · Traffic monitoring   [Show on map →] [Open →]
     Illustrative location, Rome · Verified 2026-06-15
────────────────────────────────────────────────────────────────────────────
[← Previous]   Showing 1–20 of 42   Page 3 of 3   [Next →]
```

Motivazione: risponde letteralmente a "browse record" — l'utente può
**sfogliare** (A–Z, pagine) oltre che cercare; l'header risultati dà scala
("quanti, dove sono"); le chips rendono lo stato filtro esplicito e rimovibile;
la riga a due linee dimezza il rumore delle 4 etichette ripetute. Coerente con
l'estetica civic-tech (nessuna dashboard, nessuna tabella analitica).

### 4.2 ChatGPT — "One-bar directory" (command palette)

Concept: **una toolbar unica sticky** che assorbe tutto il controllo
(search + luogo + filtri + sort + export + count), con `details`/chips per la
disclosure progressiva; risultati a righe dense con azioni inline; palette
tastiera ( `/` = focus search, frecce = navigazione righe).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [🔍 Cerca…]  [📍 Near a place]  [Type ▾][Fresh▾][Sort ▾]  N found  [CSV][GJ]│  ← sticky ≥980px
└──────────────────────────────────────────────────────────────────────────┘
  [chips:  Fixed dome ✕   Last 30 days ✕ ]
────────────────────────────────────────────────────────────────────────────
#12  Illustrative record A — Fixed dome · Via Roma 1 · 2026-07-01   [Mappa] [Apri]
#13  Illustrative record B — Traffic monitoring · Rome · 2026-06-15 [Mappa] [Apri]
────────────────────────────────────────────────────────────────────────────
[← Prev] 1 · 2 · 3 [Next →]
```

Motivazione: tool-feel immediato, manipolazione diretta, densità alta;
perfetta per utenti che sanno già cosa cercano. Rischio: la toolbar-card con
ombra e la disclosure dietro menu riducono la sobrietà e nascondono controlli
a basso rischio (già scartato in #231 per lo stesso motivo); il pattern
"palette" è più adatto a power user.

### 4.3 Gemini — "Elenco come dataset" (data table)

Concept: **tabella dati ordinabile** con header di colonna una sola volta,
`aria-sort`, toggle densità, paginazione server-side con page-size, facets
sidebar con conteggi, export nell'header tabella. Densità massima.

```
[Type ▾] [Freshness ▾]                                     [⬇ CSV] [⬇ GeoJSON]
┌─ sidebar facets (aside, sticky) ─┐  ┌─ tabella ────────────────────────────┐
│ Kind                             │  │ ID ▲ │ Title ▲ │ Kind ▲ │ Location │ Verif ▲ │
│  ● Fixed dome        (12)        │  │ 12   │ Illustr. A │ Fixed dome │ Rome │ 2026-07 │
│  ○ Traffic monitoring (7)        │  │ 13   │ Illustr. B │ Traffic    │ Rome │ 2026-06 │
│  ○ Bullet              (3)       │  └──────────────────────────────────────┘
│ Freshness                        │  [← Prev] Showing 1–25 of 42  [Next →]
│  ● 7d (5)  30d (11)  90d (19)    │
└──────────────────────────────────┘
```

Motivazione: densità e scansionabilità massime (header una volta sola),
ordinamento per colonna, facet con conteggi (pattern CKAN). Rischio: estetica
da data-explorer/BI che sfiora la "dashboard di security" — contro il
principio §1 del design system (sobrietà civic-tech); la trasformazione
tabella→lista mobile è il punto più delicato; superficie nuova (componente
tabella, aria-sort, toggle localStorage).

### 4.4 DeepSeek — "Righe piatte v2" (bare essentials + scala)

Concept: la **minima evoluzione** di #231: mantiene l'ordine a tre fasce ma
corregge i difetti strutturali — input luogo stilizzato, un solo concetto di
ricerca, header risultati visibile, paginazione reale, niente index né chips.

```
.tool-heading                                    eyebrow + h1 + intro  [Use map ↑]
[🔍 Search the public directory] [Type ▾] [Freshness ▾] [Sort ▾] [Reset]
2 public records found (role=status)   [Search near a place…]  [CSV] [GeoJSON]
[stylized place panel if open]
──── righe piatte (come #231, ma con dl bilanciato a 2 colonne) ────
[← Prev] Showing 1–20 of 42  [Next →]
```

Motivazione: rischio minimo, continuità con #231, fix mirati. Limite: non
risponde al feedback CEO "da rifare tutta" — è la stessa pagina con i buchi
tappati; mancano sfogliabilità e senso di scala che un browse richiede.

---

## 5. Confronto e raccomandazione

| Criterio | Claude (indice) | ChatGPT (one-bar) | Gemini (tabella) | DeepSeek (v2) |
|----------|:---:|:---:|:---:|:---:|
| "Browse" experience (sfogliabilità) | **5** | 3 | 4 | 2 |
| Densità informativa | 4 | 4 | **5** | 4 |
| Scala / paginazione | **5** | 4 | **5** | 4 |
| Stato filtro esplicito (chips) | **5** | 4 | 3 | 2 |
| Mobile | 4 | 4 | 3 | 4 |
| A11y AA | **5** | 4 | 4 | 4 |
| Coerenza DS civic-tech | **5** | 3 | 3 | 4 |
| Rischio implementativo | medio | medio | **alto** | **basso** |
| Rispetto feedback CEO ("rifare") | **5** | 4 | 5 | 2 |

**Raccomandazione: proposta 4.1 — "L'indice editoriale" (Claude),**
con due prestiti dichiarati:
- dalla 4.3 Gemini: **header di colonna implicito nella riga a due linee**
  (kind·luogo·verifica su una meta line, etichette NON ripetute per riga);
- dalla 4.2 ChatGPT: **chips dei filtri attivi** con rimozione one-click.

Motivazione:
1. È l'unica proposta che trasforma la pagina in una vera esperienza di
   **browse** (indice A–Z + paginazione + scala "mostrando X–Y di Z") —
   risponde al feedback CEO senza riproporre il flat catalog.
2. **Paginazione client** su set già filtrato (kind/freshness via API) e
   `?page=` in URL: DOM limitato, deep-link della posizione, zero modifiche
   all'API (contratto PR #149 resta intatto, hook condivisi intatti).
3. **Sobrietà civic-tech rispettata**: nessuna tabella analitica, nessuna
   sidebar dashboard, nessuna ombra nuova; i pattern (chips, index, header
   risultati) riusano i token del DS.
4. **A11y**: header risultati VISIBILE (niente più h2 sr-only), chips con
   target ≥44px, indice con `aria-current`, paginazione con stato disabilitato,
   input luogo finalmente stilizzato (fix P1 di V1).
5. **Rischio contenuto**: nessun tocco a useCameraFilters/usePublicCameras
   (page gestito localmente), RecordCard invariata, variante hub intatta.

**Scarti motivati**: Gemini troppo pesante e fuori registro per il valore
aggiunto (la directory è l'equivalente testuale della mappa, non un BI tool);
ChatGPT nasconde controlli e ha estetica borderline dashboard; DeepSeek v2
non risponde al "da rifare" (è il #231 corretto, non un redesign).

---

## 6. Implementazione (proposta vincente)

### 6.1 Layout finale

```
.tool-heading.directory-tool-heading     eyebrow + h1 + intro        [Use map ↑]
FiltersBar variant="bare" + extraControls:
  .directory-controls (4 colonne ≥1100px; 2 ≤980px; 1 ≤700px)
    [🔍 search (span 2)] [Type ▾] [Freshness ▾] [Sort ▾] [Reset]
    [+ extra: "Search near a place…" toggle — stesso cluster della ricerca]
.place-search (pannello, input STILIZZATO, freccia ↑ in "Hide")
── results header (.directory-results) ────────────────────────────
h2 VISIBILE "Directory results"
#record-search-count (role=status) "N public records found"   [⬇ CSV] [⬇ GeoJSON]
chips filtri attivi (solo se attivi): "Fixed dome ✕" "Last 30 days ✕" "q: … ✕"
── indice alfabetico (solo sort=alphabetical e lista normale) ─────
A B C D … Z (solo lettere presenti; aria-current sulla lettera di pagina)
── righe (RecordCard, stile contestuale v2) ──────────────────────
[●] Titolo (h3) · Kind · Stato                [Show on map →] [Open record →]
    Via Roma 1 · Last verification 2026-07-01 · Record ID 12
── paginazione (.directory-pagination) ───────────────────────────
[← Previous]  Showing 1–20 of 42 · Page 2 of 3  [Next →]
EmptyState truthfull se 0 risultati (invariato)
```

### 6.2 Decisioni di implementazione (contratti rispettati)

1. **RecordCard invariata**; la riga v2 resta stile contestuale
   `.directory-tool .record-list` (classe `record-list-card` byte-identica,
   suite a11y e rendered-html intatte: `<dt>Record ID</dt>`, bottone
   "Show on map" per card).
2. **`?page=` gestito LOCALMENTE in DirectoryCatalog** (useSearchParams +
   replace; reset a 1 quando q/type/freshness/sort cambiano o quando una
   ricerca luogo si attiva/chiude). Hook condivisi intatti; /mappa non tocca.
3. **Paginazione client** sul memo filtrato (pageSize 20): DOM limitato;
   il fetch resta il walk condiviso (il set è già limitato dai filtri server
   kind/freshness). `total` mostrato come scala "Showing X–Y of Z".
4. **Indice A–Z**: lettere dal titolo dei record filtrati; click →
   pagina contenente la prima occorrenza + `scrollIntoView` sull'header
   risultati (focus sull'h2 con tabindex=-1; reduced-motion rispettato).
5. **Chips filtri attivi**: label + bottone `×` (aria-label "Remove filter:
   …") che chiama il setter corrispondente (clear one-shot, come il reset).
6. **Trigger luogo dentro il cluster di ricerca** via nuova prop opzionale
   `extraControls` su FiltersBar (solo catalog; inline/panel byte-identiche).
7. **Fix P1 V1**: regole `.place-search-form input` in globals.css
   (stesso stile di `.record-search input`).
8. **"Hide place search"** con freccia `↑`; **"Search near a place…"** con `↓`
   (semantica corretta).
9. **Export come bottoni secondari** (ancore con classe `.export-button`,
   restano `role=link` name "Download CSV"/"Download GeoJSON" per client-tools;
   aria-describedby export-hint conservato).
10. **h2 visibile** `resultsRegion` (chiave già esistente) sostituisce lo
    sr-only; scala h1→h2→h3 invariata; rendered-html (no "Browse public
    records without the map") rispettato.
11. **Header risultati** in un unico blocco `.directory-results`; il count
    `role=status` mantiene formato e id storici (`oneRecordFound`/`recordsFound`).
12. **Mobile**: 4 colonne→2→1; indice scrollabile orizzontale; paginazione
    con bottoni pieni ≥44px; chips wrap.

### 6.3 File cambiati

| File | Cambio |
|------|--------|
| `app/components/tools/DirectoryCatalog.tsx` | layout v2: header risultati, chips, indice A–Z, paginazione `?page=`, trigger luogo nel cluster (via extraControls), pannello stilizzato |
| `app/lib/use-camera-filters.ts` | 6ª dimensione `?page=` (parse/stringify/hrefFor, reset a 1 nei setter, `setPage`); /mappa no-op (parsa, non scrive mai) |
| `app/components/FiltersBar.tsx` | nuova prop opzionale `extraControls` (renderizzata in fondo alla griglia; inline/panel byte-identiche) |
| `app/components/home/PublicDirectory.tsx` | pass-through opzionale `page`/`setPage` (solo catalog; hub intatto) |
| `app/components/tools/DirectoryTool.tsx` | destruttura `setPage` e la inoltra; commenti aggiornati |
| `app/lib/i18n/directory.ts` | +chiavi en/it: chips (activeFilters, removeFilter), indice (alphaIndexTitle, alphaIndexAria), paginazione (showingRecords, pageOf, previousPage, nextPage) |
| `app/globals.css` | griglia controlli 2 righe, `.directory-results`, `.export-button`, `.filter-chips`, `.alpha-index`, `.directory-pagination`, riga v2 (meta line), input luogo stilizzato, media query |
| `tests/browse-directory-redesign.test.mjs` | **nuovo** — paginazione (`?page=` deep link + reset), chips, indice A–Z, toggle luogo |
| `tests/url-state-contract.test.mjs` | contratto esteso alla 6ª dimensione `?page=` (round-trip, lenient parse) |
| `docs/FRONTEND_DESIGN.md`, `docs/SITEMAP.md` | stato post-implementazione |
| `docs/design/browse-record-redesign.md` | questo report |

### 6.4 Verifica

- `npm run build` ✅ e `npx tsc --noEmit` ✅ e `npm run lint` ✅.
- Suite completa `node --test "tests/*.test.mjs"`: **1784 test, 0 fail** ✅
  (inclusi rendered-html, a11y-interactive, browse-filter-record, client-tools,
  url-state-contract — esteso alla 6ª dimensione `?page=` — pages-render,
  axe-audit, i18n-pages; + 7 nuovi test in `tests/browse-directory-redesign.test.mjs`:
  paginazione/`?page=`/deep link/reset, chips, indice A–Z, toggle luogo).
- Rendering reale verificato nel browser (preview server Miniflare, EN):
  header risultati visibile, chips con rimozione one-shot, indice A–Z a 26
  lettere (presenti = link, assenti = muted), input luogo con bordo/sfondo
  (fix V1), "Hide place search ↑" (fix V4), pannello a card separata (fix V5),
  griglia controlli a 2 righe pulite (fix V2), riga v2 con meta line
  (fix V7). Home hub e /mappa byte-identici (suite home-hub/client-tools ✅).
- **Nota Lighthouse**: il gate CI a11y ≥0.95 (color-contrast, target-size WCAG
  2.5.8) non è eseguibile in locale (nessun Chromium disponibile in questo
  ambiente); la verifica reale avviene nel job lighthouse della PR. I token e
  i target usati (≥44px su chip/index/pagination/export, contrasti da
  palette) sono stati scelti per superarlo.

---

## 7. Follow-up CEO (t_d089a17e, 2026-08-03): card visibili + barra di stato

Dopo il merge di #258 il CEO segnala: *"i box/righe dei record si fondono
con lo sfondo — background transparent su sfondo carta, sembrano messi a
caso"*. Le righe flat (hairline + bg trasparente su `--paper`) non reggono
come contenitori. Fix (Vera design):

1. **/directory**: ogni riga resta flat a 3 colonne (indice A–Z, chips,
   paginazione e `?page=` intatti), ma dentro una **card visibile**
   (`#fffef9`, bordo 1px `--line`, `radius-lg`, padding 16×20px, gap 12px
   tra card) + **barra di stato** sinistra 3px nel colore del token
   `--status-*` e tint 9% del token su `#fffef9` (precalcolata).
2. **/mappa (MapRecordList)**: stessa logica — card bianca, rail 3px, tint
   8% su `#fff`, e la riga ora espone **status-dot + label testuale**
   (nuova riga `.map-record-status`): il colore non è mai l'unico segnale.
   La selezione è passata dal bordo sinistro alla wash di sfondo
   (`#e4efe6` + `aria-current`) per non competere con il rail di stato.
3. **Hub home**: stessa barra di stato sulle card esistenti (scope
   `.records-section .record-list`), zero tocchi a RecordCard.
4. **A11y**: i due testi più chiari sulla superficie tintata
   (`.card-topline` → `var(--muted)`, `.record-kind` → `#576d77`) sono
   scuriti per tenere ≥4.5:1 su tutte le tint (min misurato 4.85:1); dot +
   label restano (WCAG 1.4.1). Tutti i valori derivano dai token
   `--status-*` esistenti — nessun token globale nuovo (nessun ADR).
5. **Test**: nuovi guard in `a11y-interactive.test.mjs` (status-dot per
   card + source-guard CSS) e `client-tools.test.mjs` (righe sidebar
   /mappa con dot + label); rendered-html invariato (markup RecordCard
   byte-identico).

---

## Fix t_d52fde50 (CEO feedback 2, 2026-08-03): card EVIDENTI sul paper

Il primo giro (#261) rendeva le righe card visibili (`#fffef9` + bordo +
rail 3px + tint 9%), ma il CEO le vedeva ancora "trasparenti": `#fffef9`
e le tint 9%-over-`#fffef9` hanno contrasto ~1:1 con `--paper`
(`#f5f3ec`), quindi il box si fondeva con la pagina e solo il rail lo
separava. Verificato visivamente sul container di test (http://<lan-ip>:3000/directory,
screenshot `directory-BEFORE-lxc.png`, archiviato fuori dal repo).

### Decisioni di design (Vera)

1. **La card è il contenitore evidente**: superficie bianca `#fff`
   (vs paper crema), bordo scoped `#b9c7bf` (già in uso su
   `.empty-state`) visibile su bianco e su paper, `box-shadow` soft
   (`0 1px 2px` + `0 6px 16px rgba(16,35,50,…)`) come cue di elevazione.
2. **Tint 14% over `#fff`** (da 9% over `#fffef9`): verified `#e5f3ec`,
   community `#f9f0e4`, review `#faebe8`, pending `#eff0f1`, demo
   `#e9ecf3` — una wash percepibile ma tenue; il rail 3px pieno del token
   resta il segnale di stato forte.
3. **A11y mantenuta**: il testo più chiaro su tint (dt) scurito a
   `#576d77`; peggior coppia misurata `#576d77`-on-`#faebe8` = 4.69:1
   (script di verifica in corso PR). Colore mai unico segnale (dot +
   label restano, WCAG 1.4.1).
4. **Coerenza**: stesso trattamento sul `.record-list-card` condiviso
   (guide/regole/manifesto/moderazione diventano card visibili); /mappa
   rows (bianche con rail) già ok, invariati.
5. **Nessun token globale toccato** (nessun ADR): solo valori scoped
   nelle regole esistenti + tint precalcolate dai `--status-*`.
