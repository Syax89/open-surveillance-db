# Frontend design system — documento unico vincolante

Last reviewed: 2026-08-02
Author: Vera (Designer UX/UI)
Version: v2 (sostituisce la v1 del 2026-08-01)
Stato: **vincolante** — fonte di verità unica per UI/UX del frontend.

Questo documento è il **riferimento normativo** del design system: definisce
token, tipografia, layout, componenti, stati e regole che l'implementazione
**deve** rispettare. Non è una visione: è il contratto.

- Complementi: `docs/SITEMAP.md` (IA), `docs/workstreams/PRODUCT_UX.md`
  (requisiti UX/accessibilità), `docs/design-audit.md` (audit di conformità
  codice vs doc, main @`200f415`, 2026-08-02).
- Se una sezione è marcata **[binding]** significa che il codice attuale
  diverge e la voce è il target da implementare (gap tracciato in
  `design-audit.md`). Se è **[implementato]** significa che è verificato sul
  codice attuale.

**Legenda stato:** ✅ implementato e verificato · 🔒 binding (da implementare /
da allineare) · ⚠ parziale (vedi nota)

---

## 1. Principi di design

1. **La home è un hub, non un tool.** `/` orienta: missione, teaser mappa,
   quattro card tool, principi. Non ospita più i tool interattivi (F1–F4
   completati: i tool sono route proprie).
2. **Una rotta, un job.** Ogni tool ha la sua route, il suo `h1`, il suo
   header. Navigazione esplicita, mai per scroll.
3. **Stato in URL, non in memoria.** Filtri, ricerca, ordinamento vivono nei
   query param: condivisibili, bookmarkable, SSR-renderable (F4 ✅).
4. **Un solo design system.** Header, footer, palette, tipografia, spaziature
   e componenti base sono condivisi ovunque.
5. **Navigazione bidirezionale.** Da ogni tool si torna alla home e agli altri
   tool. Niente vicoli ciechi.

Il progetto documenta infrastrutture di sorveglianza pubblica: il design deve
trasmettere **chiarezza, fiducia, sobrietà** — mai allarmismo né estetica
"poliziesca". Riferimento morale: civic-tech open data (OpenStreetMap,
Wikidata), non dashboard di security. Niente effetti vistosi, niente animation
decorative, niente gradienti aggressivi.

---

## 2. Architettura delle pagine

### 2.1 Route map (stato reale — tutte le route esistono)

| Route | Pagina | Nav | Stato |
|-------|--------|:---:|-------|
| `/` | Home hub (Hero + MapTeaser + ToolCards + principi) | PublicNav | ✅ |
| `/mappa` | Mappa interattiva integrata (sidebar + mappa, h1 sr-only) | PublicNav | ✅ |
| `/directory` | Directory testuale (ricerca + filtri + griglia) | PublicNav | ✅ |
| `/segnala` | Form segnalazione guidato (`?lat=&lng=` deep link) | PublicNav | ✅ |
| `/correggi` | Form correzione (`?record=ID` prefill) | PublicNav | ✅ |
| `/records/[id]` | Dettaglio record (scheda + verification widget) | contestuale (`nav-record-actions`) | ✅ |
| `/records/[id]/edit` | Modifica contributo (privato) | contestuale | ✅ |
| `/guide` | Guida all'uso | PublicNav | ✅ |
| `/manifesto` | Manifesto | PublicNav | ✅ |
| `/regole` | Regole | PublicNav | ✅ |
| `/moderazione` | Spiegazione pubblica del flusso di moderazione | PublicNav | ✅ |
| `/privacy` `/termini` `/licenze` | Pagine legali | PublicNav | ✅ |
| `/faq` `/contatti` `/accessibility` | Info | PublicNav | ✅ |
| `/moderation` | Dashboard moderatori (privata, `requireRole`) | contestuale (`nav-actions`) | ✅ |
| `/account` `/login` `/register` | Auth/account | contestuale | ✅ |
| 404 (`not-found.tsx`) / 500 (`error.tsx`) | Error pages custom | **ridotto: 1 link** (eccezione §2.3) | ✅ |

### 2.2 Tool pages (route group `app/(tools)/`)

Le quattro pagine tool condividono il layout `ToolLayout` (PublicNav + `main#main-content`).

**Intestazione di pagina (✅ implementato in F4 — gap P1 G1 chiuso):** le classi
`.tool-heading` e `.tool-section` sono definite in globals.css (h1 800,
clamp(34px,4.5vw,52px), padding 48/96px; `/mappa` resta full-width senza header
visibile via `.tool-section.map-tool`). Regole:

```
.tool-section { width:min(1180px, calc(100% - 48px)); margin:0 auto; padding:48px 0 96px; }
.tool-heading { margin:0 0 34px; }
.tool-heading h1 {
  margin:0; max-width:640px;
  font-size:clamp(34px, 4.5vw, 52px); line-height:1.04;
  letter-spacing:-.06em; font-weight:800;
}
.tool-heading .eyebrow { margin-bottom:14px; }
.tool-heading p:not(.eyebrow) { margin:18px 0 0; max-width:600px; color:#5e707a; font-size:16px; line-height:1.55; }
```

Eccezione documentata: `/mappa` NON ha header visibile (t_11e38eab) — l'h1
resta `sr-only` per la gerarchia documentale e `aria-labelledby` della
sezione. La pagina parte direttamente con la mappa.

**Un solo header di pagina per tool page (F5, P1-5):** `/directory`, `/segnala`
e `/correggi` rendono `.tool-heading` (eyebrow + h1 + intro) come UNICO header;
i componenti di sezione incorporati (`PublicDirectory`, `ReportForm`,
`CorrectionForm`) ricevono `showHeading={false}` e NON ripetono il blocco
eyebrow+h2+intro. Le sezioni mantengono i contenuti funzionali non-duplicati:
link "Use the map instead" (directory), report-rule "Before submitting"
(segnala) e "Urgent concern" (correggi). Gerarchia heading: h1 tool →
h2 sezione (es. place-search) → h3 card.

**Directory catalog mode (t_127492f1; redesign t_f13fcb1c):** la tool page
usa `PublicDirectory variant="catalog"` con il layout browse-record
"indice editoriale" (proposta vincente di `docs/design/browse-record-redesign.md`):

1. `.directory-tool-heading` = `.tool-heading` con il link "Use the map
   instead" allineato a destra (modifier: il layout flex vale SOLO per
   /directory, /segnala e /correggi restano invariati).
2. `FiltersBar variant="bare"` — la stessa griglia controlli (search + type +
   freshness + sort + reset, ids storici `record-*`) SENZA il counter, in una
   griglia a DUE righe pulite: search a tutta larghezza, poi type/freshness/
   sort/reset + il toggle "Search near a place" (`extraControls`, FiltersBar)
   nella seconda riga — un solo cluster di ricerca per pagina.
3. `.place-search` come pannello collassabile a CARD contenuta
   (`.place-search-closed` = `display:none` finché il trigger non lo apre —
   mai l'attributo `hidden`, vietato dal contratto pages-render; l'input è
   finalmente stilizzato come gli altri input — audit V1). Un solo input di
   ricerca visibile alla volta; la ricerca per luogo è una *modalità*, non
   una feature sorella (principio già stabilito da /mappa con `hideSearch`).
4. `.directory-results` — header risultati VISIBILE: h2 "Directory results"
   (chiave `resultsRegion`, niente più h2 sr-only) + count (`role=status`, id
   `record-search-count`) + export CSV/GeoJSON come bottoni secondari
   (`.export-button`, restano `<a role=link>` per i contratti).
5. `.filter-chips` — chips dei filtri attivi (type/freshness/q), rimozione
   one-shot, target ≥44px (pattern Google Maps/CKAN).
6. `.alpha-index` — indice alfabetico A–Z (pattern Wikipedia AllPages): solo
   le lettere presenti nel set filtrato; click → pagina della prima
   occorrenza + focus sull'header risultati; `aria-current` sulle lettere
   della pagina corrente. Visibile solo con sort alfabetico.
7. `.directory-tool .record-list` a UNA colonna con righe piatte (hairline,
   `titolo | meta line | azioni` — la meta line è il `<dl>` di RecordCard
   renderizzato come riga orizzontale di coppie dt/dd: etichette NON ripetute
   in griglia 3+1, audit V7; la classe `record-list-card` resta byte-identica
   per le suite a11y e il contratto rendered-html `<dt>Record ID</dt>`).
8. `.directory-pagination` — paginazione "Previous / Showing X–Y of Z ·
   Page N of M / Next", stato `?page=` in URL (6ª dimensione di
   useCameraFilters, reset a 1 su ogni cambio filtro; /mappa parsa ma non
   scrive mai page → URL invariati). Un solo flusso di risultati: una ricerca
   luogo attiva sostituisce la lista (banner `.place-banner` con area + count
   + clear, fact Distanza) e nasconde indice/chips/paginazione.

La home resta su `variant="hub"` (output byte-identico: records-heading +
blocco place-search + FiltersBar inline + count + griglia 2 colonne).

### 2.3 Eccezioni header

- **Error pages (404/500):** header ridotto a **1 link** (`nav-action` "Torna
  alla home") + LocaleToggle. Il footer resta raggiungibile. Eccezione alla
  regola "PublicNav 6 link" — voluta (un vicolo cieco non deve sembrare una
  pagina rotta, ma non deve nemmeno offrire navigazione fuorviante).
- **Record detail, auth, moderation:** header contestuale
  (`nav-record-actions` / `nav-actions`) — azioni pertinenti al contesto
  (torna al record, profilo, esci), non il set pubblico.

---

## 3. Design token layer (vincolante)

### 3.1 Colori

Palette già in `:root` (globals.css) ✅, inclusi i token status/focus aggiunti
in F4 (gap P1 G5 chiuso).

```
/* Core (✅ implementato in :root) */
--ink: #102332      /* testo principale */
--paper: #f5f3ec    /* sfondo pagina */
--line: #d8ddd6     /* bordi, separatori */
--navy: #09233a     /* hero, sfondi scuri */
--mint: #cbf7da     /* primary action bg */

/* Palette estesa (✅ in :root ma 0 usi — dead tokens, gap P1 G5) */
--navy-2: #123b55
--lime: #94e8a5
--coral: #e87b67
--sand: #ebe7da

/* Semantic status (✅ in :root da F4; le classi hardcoded ora usano i token) */
--status-verified: #42a979
--status-community: #d3963e
--status-review: #d8715e
--status-demo: #6177ac      /* colore già usato da .osm-camera-marker.demo */
--status-pending: #8a979b   /* grigio-azzurro neutro, "in coda" (moderation) */

/* Focus (✅ in :root da F4; i 23 hardcode di #0b705c sostituiti con var(--focus)) */
--focus: #0b705c
```

**Regola (P1 G5 — ✅ chiusa in F4):** nessun nuovo hardcode di colore dove
esiste un token; i 23 hardcode di `#0b705c` sono stati sostituiti con
`var(--focus)`. Debt residuo: i 4 dead tokens (`--navy-2`, `--lime`, `--coral`,
`--sand`) vanno **usati o rimossi** nel prossimo refactor (tracciato in
design-audit §3).

**Verifica contrasto WCAG (tabella corretta rispetto alla v1):**

| Token | Su sfondo | Ratio reale | Uso | AA? |
|-------|-----------|-------------|-----|:---:|
| `--ink` | `--paper` | 14.5:1 | testo corpo | ✓ AAA |
| `--muted` #5c6c75 | `--paper` | **4.85:1** | testo secondario | ✅ (F4) |
| `--focus` #0b705c | `--paper` | 4.8:1 | focus ring | ✓ |
| `#405462` (nav-links) | `--paper` | 7.2:1 | link nav | ✓ AAA |
| `#0b705c` (link/action) | `--paper` | 4.8:1 | link action | ✓ |
| `#fffef9` (card bg) | `--paper` | 1.02:1 | surface | n/a |
| `--coral` | `--paper` | 3.1:1 | status dot only | ⚠ sempre con label |
| `--amber` | `--paper` | 1.9:1 | status dot only | ⚠ sempre con label |

**Contrasti sotto AA su testo piccolo (✅ chiuso in F4 — gap P2):** i 5 grigi
sotto soglia sono stati sostituiti con `#5c6c75` (≈4.8:1 su paper) per testo
11–12px e `#64737a` (≈4.8:1 su bianco) per testo su sfondo bianco.

| Coppia (pre-F4) | Ratio | Uso | Applicato (F4) |
|----------------|:---:|-----|---------|
| `#6f7e84` su paper | 3.79 | `.loading-note` 12px | `#5c6c75` |
| `#6f7e84` su `#fffef9` | 4.16 | `.map-list-count` 11px | `#5c6c75` |
| `#6f7e84` su `#fff` | 4.21 | `.geocode-option-type` 11px | `#64737a` |
| `#6b7a80` su paper | 4.01 | `.footer-legal` 11px | `#5c6c75` |
| `#8a979b` su `#fff` | 3.01 | `.geocode-attribution` 10px | `#64737a` |
| `#60727f` (`--muted`) su paper | 4.49 | testo secondario | `#5c6c75` |

**Regola di accesso critica (D7):** gli status dot **non trasmettono mai
informazioni da soli** — sempre abbinati a label testuale localizzata
(`publicStatusLabel`). Il colore è ridondante, non esclusivo (WCAG 1.4.1).

### 3.2 Tipografia (type scale — corretta rispetto alla v1)

- **Famiglia:** Arial, Helvetica, sans-serif (in `body`). Niente font
  variabili o webfont: sobrietà e performance.
- **Body:** **16px / 1.5 / 400** (v1 diceva 15px/1.6 — errato; il rendering
  reale è 16/1.5). ✅ esplicito in CSS da F4 (`body { font-size:16px;
  line-height:1.5; }`), non più default preflight.

| Ruolo | Selettore | Size | Line-height | Weight | Tracking | Stato |
|-------|-----------|------|-------------|--------|----------|:---:|
| Hero h1 | `.hero h1` | clamp(48px, 6vw, 82px) | .96 | **800** | -.075em | ✅ (F4) |
| Record h1 | `.record-detail h1`, `.moderation-page>h1` | clamp(42px, 6vw, 70px) | .96 | **700** | -.07em | ✅ (F4) |
| Tool h1 | `.tool-heading h1` | clamp(34px, 4.5vw, 52px) | 1.04 | **800** | -.06em | ✅ (F4, G1) |
| Auth h1 | `.auth-card h1` | clamp(34px, 5vw, 54px) | 1.04 | 800 | -.06em | ✅ (F4) |
| Section h2 | `.section-heading h2`, `.records-heading h2` | clamp(34px, 4vw, 53px) | 1 | **800** | -.065em | ✅ (F4) |
| Moderation h2 | `.moderation-section h2` | clamp(28px, 3vw, 42px) | 1 | 800 | -.06em | ✅ (F4) |
| Legal h2 | `.legal-section h2` | clamp(23px, 3vw, 32px) | 1.08 | **700** | -.05em | ✅ (F4) |
| Card h3 | `.camera-card h3`, `.record-list-card h3` | 22px | 1.08 | **700** | -.04em | ✅ (F4) |
| Card title | `.tool-card-title` | 18px | 1.1 | 800 | -.03em | ✅ |
| Popup h3 | `.osm-popup h3` | 15px | 1.2 | 800 | -.02em | ✅ |
| List item title | `.map-record-title` | 14px | 1.3 | 800 | -.02em | ✅ |
| Eyebrow | `.eyebrow` | 11px | 1.4 | 800 | .14em up | ✅ |
| Card-topline | `.card-topline` | 11px | 1.4 | 800 | .09em up | ✅ |
| Detail dt | `.record-detail-facts dt` | 10px | 1.4 | 800 | .1em up | ✅ |

**✅ chiuso in F4 (P1 G3):** i pesi della scala (800/700) sono applicati per
selettore in globals.css (una riga ciascuno). La gerarchia visiva "contrasti
netti di peso (800 vs 400)" è parte del design system.

### 3.3 Spacing (scala 4px — ✅ implementato in F3, t_27bfa729)

I token `--space-1..24` sono in `:root` (globals.css) da F3. La codebase usa
ancora ~60 valori ad hoc letterali, ma la scala sotto è la fonte canonica; il
refactor CSS deve mappare i padding/margin residui sulla scala.

```
--space-1: 4px    --space-2: 8px    --space-3: 12px   --space-4: 16px
--space-5: 20px   --space-6: 24px   --space-8: 32px   --space-10: 40px
--space-12: 48px  --space-16: 64px  --space-20: 80px  --space-24: 96px
```

Convenzioni d'uso:
- padding interni card: `--space-4`/`--space-6` (16/24px);
- gap tra card e griglie: `--space-4` (16px);
- sezioni verticali: `--space-12`/`--space-16` (48/64px);
- spaziature piccole (tra label e campo, tra dot e testo): `--space-1`/`--space-2` (4/8px);
- touch target: padding ≥ `--space-3` su altezze da 44px.

### 3.4 Radius (scala — ✅ implementato in F3, t_27bfa729; outlier consolidati in F5, t_97442785)

Token `--radius-*` in `:root` da F3, consolidati dai valori esistenti. Gli
outlier fuori scala (7/9/10/14/18px) sono stati migrati al token più vicino
in F5 (P1-5/2-6, `globals.css` — unica eccezione: il reset `border-radius:0`
del workspace dentro la map-card, intenzionale):

```
--radius-xs: 4px    /* notice, offline-state, legal-note */
--radius-sm: 6px    /* input di form (report/correction), map-hint */
--radius-md: 8px    /* skip-link, locale-toggle, search input, duplicate-alert, geocode-option (da 7px) */
--radius-lg: 12px   /* tool-card, button, nav-action, record-list-card, empty-state (da 9/10px) */
--radius-xl: 16px   /* record-detail, live-map-workspace, map-card, map-teaser (da 14/18px) */
--radius-2xl: 22px  /* hero */
--radius-full: 999px/* pill: section-note, filter-chip */
--radius-round: 50% /* status-dot, brand-mark */
```

Consolidamento binding (eseguito in F5): i valori fuori scala (7, 9, 10,
14, 18px) migrano al token più vicino (7→`--radius-md`, 9/10→`--radius-lg`,
14→`--radius-xl`, 18→`--radius-xl` a seconda del contesto).

### 3.5 Ombre (scale — 🔒 binding, da implementare)

| Token | Valore | Uso |
|-------|--------|-----|
| `--shadow-float` | `0 2px 12px rgba(30,48,40,.12)` | `.map-hint` |
| `--shadow-menu` | `0 12px 24px rgba(30,45,45,.15)` | menu mobile `.nav-links` |
| `--shadow-popover` | `0 14px 30px rgba(25,46,52,.16)` | `.geocode-dropdown` |
| `--shadow-card` | `0 20px 45px rgba(25,46,52,.08)` | `.map-card`, `.record-detail`, `.live-map-workspace` |
| `--shadow-dialog` | `0 18px 50px rgba(14,42,53,.28)` | `.confirm-dialog` |

Principio: ombre basse e diffuse, mai dure. Solo 5 livelli; niente ombre su
testo, niente glow.

### 3.6 Contenitori, griglia e breakpoint

**Larghezze contenitore (✅ implementato):**
- Standard: `min(1180px, calc(100% - 48px))` — pagine section, tool-section
- Leggibile: `min(760px, calc(100% - 48px))` — record-detail, legal, FAQ
- Largo: `min(1320px, calc(100% - 48px))` — nav-shell, hero
- **Mappa: `min(1440px, calc(100% - 32px))`** (`.map-layout`) — aggiunto in v2
  (non documentato in v1)
- Mobile ≤700px: `min(100% - 32px, 1180px)`

**Breakpoint (✅ implementato — v1 documentava solo 700/980/1320):**

```
480px  — header compatto (brand ridotto, gap stretti) + nav wrap safety,
        coordinate-fields e report-metadata-fields a 1 colonna
700px  — tablet: griglie a 1 colonna, footer a 1 colonna
768px  — header: menu mobile (hamburger + dropdown, t_94b3726d); mappa:
        sidebar diventa pannello sopra la mappa (max-height 38vh)
980px  — desktop: griglie a 2/3 colonne, hero 2 colonne
1320px — wide: container max (nav-shell, hero)
```

### 3.6 Token layer implementato (F3, t_27bfa729)

Implementato in `app/globals.css` (`:root`). I token rispecchiano ESATTAMENTE
i valori preesistenti — nessun cambio di rendering (verificato: screenshot
prima/dopo identici al pixel su tutte le route pubbliche, Lighthouse a11y
>= 0.95 su ogni route).

**Spacing** — scala 4px (già in §3.4): `--space-1..24`
(`--space-1:4px`, `--space-2:8px`, `--space-3:12px`, `--space-4:16px`,
`--space-5:20px`, `--space-6:24px`, `--space-8:32px`, `--space-10:40px`,
`--space-12:48px`, `--space-16:64px`, `--space-20:80px`, `--space-24:96px`).

**Radius** — consolidato dai valori esistenti:

```
--radius-xs:4px   (notice, offline-state, photo-moderate-note)
--radius-sm:6px   (form inputs, photo-list, legal-note, map-hint)
--radius-md:8px   (coordinate-entry, metadata-publication, photo-upload, map-record)
--radius-lg:12px  (tool-card, report/correction-form, faq-item, confirm-dialog)
--radius-xl:16px  (record-detail)
--radius-2xl:22px (hero)
--radius-full:999px (filter-chip pill, section-note)
--radius-round:50% (dot, brand-mark, marker, faq summary ::before)
```

I valori fuori scala esistenti (7px, 9px, 10px, 14px, 18px, 99px) sono stati
consolidati sui token in F5 (t_97442785) — nessun letterale fuori scala
resta in `globals.css` (unica eccezione: il reset `border-radius:0` della
map-card).

**Type scale** — valori esistenti (F2 §3.3) come token:

```
--text-2xs:10px   --text-xs:11px   --text-sm:12px   --text-md:13px
--text-base:14px  --text-lg:15px   --text-xl:16px   --text-2xl:17px
--text-3xl:18px   --text-4xl:20px  --text-5xl:22px
--text-hero:clamp(48px, 6vw, 82px)     --text-display:clamp(42px,6vw,70px)
--text-section:clamp(34px,4vw,53px)    --text-legal:clamp(23px,3vw,32px)
--text-moderation:clamp(28px,3vw,42px) --text-teaser:clamp(30px,3.6vw,48px)
--text-auth:clamp(34px,5vw,54px)
```

I valori 19px (brand) e 21px (hero-stats dt) restano letterali (fuori scala).

**Container widths** (§3.4) come token:

```
--container-standard:min(1180px, calc(100% - 48px))
--container-readable:min(760px, calc(100% - 48px))
--container-wide:min(1320px, calc(100% - 48px))
```

**Palette** — completata con i token mancanti di §3.2: `--focus` (#0b705c),
`--status-verified` (#42a979), `--status-community` (#d3963e),
`--status-review` (#d8715e); le classi `.verified` / `.community-report` /
`.needs-review` e i focus ring usano i token.

---

## 4. Layout grid

Il layout si basa su **CSS Grid**, mobile-first, con pattern per regione
(✅ implementati — verificati nel CSS):

| Regione | Griglia desktop | Griglia mobile (≤700px) |
|---------|-----------------|-------------------------|
| Hero | `1.02fr .98fr` | 1 colonna (≤980px) |
| Map workspace (`.map-split`) | `340px 1fr`, height `calc(100vh - 300px)` min 540px | 1 colonna, sidebar sopra la mappa (≤768px) |
| Map sidebar | colonna 340px, scroll interno `.map-list-scroll` | pannello max-height 38vh |
| Tool cards | `1fr 1fr` (2 colonne) | 1 colonna |
| Record list | `repeat(2, minmax(0,1fr))` | 1 colonna |
| Directory controls | `1fr minmax(175px,.34fr) minmax(190px,.38fr)` | 1fr 1fr (≤980) → 1fr (≤700) |
| Report/correction | `.8fr 1.1fr` | 1 colonna |
| Principles | `.85fr 1.15fr`; grid interna `repeat(3,1fr)` | 1 colonna |
| Record facts | `repeat(2,1fr)` | 1 colonna |
| Footer | `auto 1fr auto` | 1 colonna |
| Auth form | card max-width 560px | stessa |

Regole:
- Mai scroll orizzontale a 320px; tutte le griglie collassano a 1 colonna.
- Le card in griglia usano `gap:16px` (`--space-4`).
- Il workspace mappa è **un'unica card** (`.map-card`): FiltersBar come bordo
  superiore, split sotto, export footer in coda.

---

## 5. Formattazione (bordi, radius, ombre)

- **Bordi:** `1px solid var(--line)` per card e separatori; `#cdd6ce` per
  input; `#d6dbd3` per card form; `#e6b8ad` per zone danger/errori.
- **Bordi accent (banner/alert):** bordo sinistro 3px semantico —
  verde `#43a979` (notice/legal-note), ambra `#c99127` (duplicate-alert),
  `#c99a3a` (offline-state), `#c08a3e` (photo-moderate), `#c99127` (warning).
- **Radius:** la scala §3.4 — mai valori fuori scala nei componenti nuovi.
- **Ombre:** la scala §3.5 — mai ombre per componenti inline (testo, dot,
  label).

---

## 6. Componenti (design system)

### 6.1 Registro componenti (42 file in `app/components/`)

Legenda: **[spec]** = sezione dedicata sotto · **[patt.]** = pattern condiviso
(§6.3) · **→** = pagina di uso.

**Core / layout**
| Componente | Dove | Note | Stato doc |
|------------|------|------|:---:|
| `PublicNav` | tutte le pubbliche | header condiviso 6 link (t_a72a3106) | **[spec] 6.2.1** |
| `PublicNavLinks` | tutte le pubbliche | set nav unico, `aria-current="page"` | [spec] 6.2.1 |
| `SiteHeader` | root shell pagine | nav-shell brand + children + LocaleToggle | [patt.] |
| `SiteFooter` | root layout | footer globale 4 tool + istituzionali | [patt.] |
| `HomeNav` | `/` | island client del menu mobile (SSR-pure home) | [patt.] |
| `ToolLayout` | route group `(tools)` | layout condiviso tool: PublicNav + main | [patt.] |
| `ErrorPage` | 404/500 | shell error condivisa | **[spec] 6.2.5** |
| `LegacyAnchorRedirect` | root layout | redirect client-side anchor legacy (`router.replace`) | [patt.] |

**Home hub**
| `Hero` | `/` | hero scuro, 2 CTA, stat | [patt.] |
| `MapTeaser` | `/` | teaser **statico** (no Leaflet) — non è `SurveillanceMap` | [patt.] |
| `ToolCards` | `/` | 4 card tool 2×2 | [patt.] |

**Mappa (`/mappa`)**
| `MappaTool` | `/mappa` | corpo pagina: h1 sr-only + map-layout + map-card | [spec] 6.2.6 |
| `SurveillanceMap` | `/mappa` | mappa Leaflet lazy + fallback | [patt.] |
| `MapPanel` | `/mappa` | orchestratore workspace: map + sidebar + popup + export | [patt.] |
| `MapRecordList` | `/mappa` | **sidebar lista viewport-sync** | **[spec] 6.2.4** |
| `GeocodeSearch` | `/mappa` | **combobox geocode con dropdown** | **[spec] 6.2.3** |
| `lib/map-popup.ts` | `/mappa` | **builder HTML marker popup** (bindPopup) | **[spec] 6.2.2** |

**Directory e tool**
| `DirectoryTool` | `/directory` | tool-heading (con link mappa) + PublicDirectory catalog | [spec] 2.2 |
| `DirectoryCatalog` | `/directory` | **layout catalog**: FiltersBar bare + pannello luogo + header risultati + chips + indice A–Z + righe + paginazione `?page=` | **[spec] 2.2** |
| `SegnalaTool` | `/segnala` | tool-heading + ReportForm | [spec] 2.2 |
| `CorreggiTool` | `/correggi` | tool-heading + CorrectionForm | [spec] 2.2 |
| `PublicDirectory` | `/directory`, home | catalog (delega a DirectoryCatalog) / hub (sezione home) | [patt.] |
| `ReportForm` | `/segnala` | form guidato + coordinate + foto | [patt.] |
| `CorrectionForm` | `/correggi` | form correzione + duplicate alert | [patt.] |
| `FiltersBar` | `/mappa`, `/directory`, home | filtri condivisi D4, varianti `inline`/`panel`/`bare` | **[spec] 6.3.3** |
| `RecordCard` | directory, search, moderation | card record condivisa | [patt.] |
| `EmptyState` | directory, mappa, moderation | empty state truthfull (heading h2\|h3) | [patt.] |

**Record, community, auth**
| `RecordPageBody` (`app/records/[id]/RecordPageBody.tsx`) | `/records/[id]` | corpo client del dettaglio (loading/offline/error) | [patt.] |
| `VerificationWidget` | `/records/[id]` | widget verifica + gate | [patt.] |
| `StarConfirmButton` | `/records/[id]` | toggle verifica (aria-pressed, ≥44px) | [patt.] |
| `LevelBadge` | `/account` | badge livello (label + dot; progresso SOLO testo, mai barra) | [patt.] |
| `ConfirmDialog` | `/account` | alertdialog distruttivo accessibile (sostituisce `window.confirm`) | [patt.] |
| `ModerationDashboard` | `/moderation` | dashboard privata | [patt.] |

**Moderation (`moderation/`, 8 componenti + hook)**
| `QueueSection`, `CameraQueueItem`, `CorrectionQueueItem`, `EditQueueItem`, `PhotoQueueItem`, `DecisionForm`, `HistorySection`, `CorrectionHistorySection`, `useModerationQueue` | `/moderation` | coda per sezioni, decisioni, storico | [patt.] — dot `pending` 🔒 (§6.3.2) |

**Pagine info**
| `InfoPage` | manifesto, guide, faq, contatti, moderazione, accessibility | wrapper SSR free-form | [patt.] |
| `LegalPage` | privacy, termini, licenze | wrapper SSR strutturato (tabelle, note) | [patt.] |
| `LocaleToggle` | header | toggle EN/IT (in `LocaleProvider`) | [patt.] |

### 6.2 Specifiche componenti principali

#### 6.2.1 Header condiviso — `PublicNav` (+ `PublicNavLinks`) ✅

Unico header di TUTTE le pagine pubbliche (t_a72a3106).

- **Anatomia:** brand (mark 29px cerchio navy/mint + nome 19px/800/-.04em) ·
  nav-links (6 link + **auth entry point**, t_65b778c5) · LocaleToggle ·
  menu button (mobile).
- **Set link (ordine fisso):** Mappa `/mappa`, Directory `/directory`, Guide
  `/guide`, Regole `/regole`, Manifesto `/manifesto`, **Segnala CTA**
  `/segnala` (`.nav-action`). Pagina corrente: `aria-current="page"`.
- **Auth entry point (`AuthNavLinks`, t_65b778c5, fix mobile t_94b3726d):**
  "Log in" `/login` + "Create account" `/register` (anonimo) o link account
  `/account` (autenticato, aria-label sempre) — ULTIMO item di `.nav-links`,
  con `aria-current` sulla rotta auth corrente. Stato da `GET /api/auth/me`;
  stato iniziale/errore = nulla (nessun leak in SSR, fail-closed).
- **Stile:** link 14px/700 `#405462`, hover `#16715e`; CTA con bordo
  `#b7c2bd`, radius `--radius-lg` (9px→binding), padding 11px 15px.
- **Mobile (<768px):** `.menu-button` visibile; `.nav-links` pannello
  assoluto con `--shadow-menu`, `aria-expanded` sul toggle, `.is-open`.
  I link auth viaggiano NEL dropdown (separati da hairline), così la barra
  superiore (brand + menu + LocaleToggle) non va mai a capo a 320/390px
  (feedback CEO live). Regole scoped con `:has(.menu-button)` così gli
  header contestuali (login/register/account/error) non collassano.
- **≤480px:** header compatto — brand 13px/mark 24px, margini 12px, gap 6px
  (fit a 320px); `flex-wrap:wrap` resta solo come safety net.
- **Desktop (≥768px):** `.nav-links` riempie la shell (flex:1) e il cluster
  auth è spinto a destra (`margin-left:auto`) accanto al LocaleToggle.
- **Accessibilità:** landmark `nav` con `aria-label` localizzata; skip-link;
  focus `:focus-visible` outline 3px `var(--focus)` offset 3px.
- **Varianti brand:** home usa `brandHref="#top"` + `brandAs="anchor"`;
  ogni altra pagina linka a `/`.

**Regola:** set unico e stabile. Non reintrodurre set per-pagina. Le pagine
funzionali (auth, record, moderation) usano l'header contestuale; le error
pages l'header ridotto (§2.3).

#### 6.2.2 Marker popup — `lib/map-popup.ts` + `.osm-popup*` ✅

Popup costruito client-side come HTML string e bindato con `bindPopup`
(t_702c10af, refactor t_b9666d09).

- **Anatomia:** `.osm-popup` → h3 titolo (15px/800) · `.osm-popup-kind`
  (12px `#60737d`) · `.osm-popup-status` (12px/700, dot + label da
  `publicStatusLabel`) · `<dl>` (record id, coordinate 4 decimali) · address
  opzionale · description opzionale · `.osm-popup-actions` (2 link:
  `/records/[id]` e `/correggi?record=ID`, 12px/800 `#0a705d`).
- **Sicurezza:** ogni campo è HTML-escaped (`escapeHtml`) — il popup resta
  inerte; la label di stato viene SOLO dal helper pubblico, mai dal dato grezzo.
- **Accessibilità:** dot `aria-hidden` + label testuale (WCAG 1.4.1);
  i link del popup sono focusabili (Leaflet li integra nel tab order).
- **Marker:** `.osm-camera-marker` 25px cerchio verde (`#1a7c60`) con
  punto interno mint; `.demo` = slate `#6177ac`; `.selected` = outline 6px
  `rgba(24,97,79,.22)`.

#### 6.2.3 Dropdown geocode — `GeocodeSearch` ✅

Combobox ARIA sotto la search della sidebar mappa (t_b9666d09, debounce
remount-proof t_b1e192e1).

- **Anatomia:** `.map-list-search` (position:relative) → input
  `role="combobox"` + `.geocode-dropdown` (absolute, `top:100%`, z-index 30,
  `left/right:16px`, `--shadow-popover`, radius `--radius-lg`, bg `#fff`) →
  `<ul role="listbox">` (max-height 264px, scroll) → footer attribuzione
  Nominatim 10px.
- **ARIA:** `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant` sull'opzione attiva; stato vuoto/errore annunciato
  con `role="status"`.
- **Interazione:** debounce 300ms, max 5 suggerimenti (proxy same-origin
  `/api/geocode`, mai payload Nominatim grezzo — data minimization);
  ArrowUp/Down muovono l'highlight, Enter seleziona, Escape chiude, click
  fuori chiude; la selezione panna la mappa (zoom ≥15) e resetta il filtro
  locale.
- **Option:** `.geocode-option` 13px, `.is-active`/hover bg `#eef3ea`;
  `.geocode-option-name` 700 `#174e58`; `.geocode-option-type` 11px 🔒
  contrasto (→ `#64737a`).
- **Stati:** `.geocode-status` (idle/empty/error) 13px `#60737d`.

#### 6.2.4 Sidebar viewport — `MapRecordList` ✅

Lista dei record **dentro il viewport corrente** della mappa (t_702c10af),
con empty note truthfull in-lista (t_b9666d09).

- **Anatomia:** `.map-list-header` (h2 13px `#174e58` + `.map-list-count`
  11px `role="status"` "N di M in vista") → `.map-list-scroll` (flex:1,
  `overflow-y:auto`, `overscroll-behavior:contain`) → `.map-record-list`
  (`<ul>`) → item `.map-record` (button full-width).
- **Item `.map-record`:** title 14px/800 `#174e58`, meta 12px `#60737d`;
  hover bg `#eef3ea`; focus outline 3px `var(--focus)` offset 1px; **selected**
  border-left 3px `#1a7c60` + bg `#e4efe6`.
- **Sync viewport:** il pan della mappa aggiorna la lista (solo punti in
  vista); help sr-only `.sr-only` annuncia il sync ad AT.
- **Empty note (D5, map-always-visible):** la mappa **non sparisce mai**; con
  0 risultati la nota truthfull `.map-list-empty-note` (titolo 14px/800 +
  body 13px + azione "Clear filters" `onReset`) vive DENTRO la lista.
- **Mobile (≤768px):** sidebar = pannello sopra la mappa, max-height 38vh,
  lista scroll max-height 30vh, bordo inferiore (non bottom-sheet — v2
  corregge la v1).

#### 6.2.5 Error pages 404/500 — `ErrorPage` ✅

Shell condivisa da `not-found.tsx` (404) ed `error.tsx` (500) (t_7eed4601).

- **Anatomia:** `main#main-content.record-page` → `SiteHeader` ridotto
  (1 link `nav-action` "Torna alla home" + LocaleToggle) → `article.record-detail`
  (card `--shadow-card`, radius `--radius-xl`) → copia localizzata → CTA home
  (`.button`) + (500) bottone retry `onRetry={reset}`.
- **Document title (F5, P3-3 — WCAG 2.4.2):** ogni pagina di errore ha un
  `<title>` proprio, non quello della home ereditato dal root layout:
  "Page not found — OpenSurveillanceDB" (404, `generateMetadata` in
  `not-found.tsx`, SSR) e "Something went wrong — OpenSurveillanceDB" (500,
  `document.title` in `ErrorPage` — `error.tsx` è un boundary client e non
  può esportare metadata). Chiavi `errors.notFoundMetaTitle` /
  `errors.serverErrorMetaTitle`.
- **Privacy by design:** la pagina **non riporta mai** il path richiesto né il
  messaggio d'errore (ADR 0002, fail-closed come il gate moderation).
- **i18n:** client component voluto (error boundary) — copia da
  `useMessages().errors`, cookie locale onorato, toggle funzionante.
- **Header/footer raggiungibili:** un vicolo cieco non sembra rotto.

#### 6.2.6 Workspace mappa — `MappaTool` + `MapPanel` ✅

- **Struttura:** `tool-section.map-tool` → h1 sr-only → `.map-layout`
  (1440px) → `.map-card` (unica card: `FiltersBar variant="panel"` come
  bordo superiore, `MapPanel` sotto). Il banner prototipo e il footer
  `.data-actions` sono stati rimossi (feedback CEO 2026-08-02): la pagina
  parte direttamente con la card, la riga download GeoJSON/CSV vive su
  /directory.
- **MapPanel:** `map-split` 340px sidebar + mappa full-height
  (`calc(100vh - 300px)`, min 540px); mappa sempre renderizzata
  (map-always-visible t_b9666d09); `?focus=ID` deep link panna sul record
  (t_b9666d09); `issueHref="/correggi"`, `directoryHref="/directory"`.
- **Filtri:** `FiltersBar panel` con `hideSearch` (la search vive nella
  sidebar come `GeocodeSearch`, stesso stato `?q=`).

### 6.3 Pattern condivisi

#### 6.3.1 Bottoni `.button` ✅

| Variante | Stile | Hover | Disabled |
|----------|-------|-------|----------|
| `.button-primary` | bg `--mint`, testo `#0e2a35` | bg `#b4edc7` | 🔒 opacity .55 + `cursor:wait` in submit |
| `.button-quiet` | testo `#e7f4ee`, bordo `rgba(222,245,234,.42)` | (default) | — |
| `.detail-outline` | testo `#1c4858`, bordo `#b7c2bd` | (default) | — |
| `.button-danger` | bg `#8a3b2c`, testo bianco | bg `#a04432` | opacity .55 + `cursor:progress` |

Base: padding 13px 18px (≈47px di altezza ✅ WCAG 2.5.8), radius
`--radius-lg`, font 14px/800, focus outline 3px `var(--focus)` offset 3px,
`transition transform .2s, background .2s`; hover `translateY(-2px)`.
`.text-button`: link inline 13px/800 `#0a705d` con freccia.

#### 6.3.2 Status dot `.status-dot` ⚠ (G2/P2 binding)

Definite: `.verified` `#42a979`, `.community-report` `#d3963e`,
`.needs-review` `#d8715e`. **Mancano (🔒 binding, una riga ciascuna):**

```
.status-dot.demo { background:#6177ac; }    /* coerente con .osm-camera-marker.demo */
.status-dot.pending { background:#8a979b; } /* moderation: in coda */
```

Ogni dot è `aria-hidden` (o con label testuale accanto) — mai colore da solo.

#### 6.3.3 Filtri condivisi — `FiltersBar` ✅

Stesso componente su `/mappa` e `/directory` (D4, stato URL identico):

| Filtro | Controllo | Query param |
|--------|-----------|-------------|
| Ricerca testuale | `<input type="search">` (nascosto su /mappa — vive in sidebar) | `?q=` |
| Tipo camera | `<select>` | `?type=` |
| Freshness | `<select>` (all/7d/30d/90d) | `?freshness=` |
| Ordinamento | `<select>` (alpha/position) | `?sort=` |
| Pagina risultati (solo /directory, t_f13fcb1c) | paginazione "Prev/Next" | `?page=` |
| Reset | `<button>` | rimuove i params |

**Varianti (t_127492f1; t_f13fcb1c):** `inline` (home: riga controlli +
counter), `panel` (/mappa: bordo superiore della map-card, `hideSearch`),
`bare` (/directory catalog: la stessa griglia controlli SENZA il counter —
il counter vive nella `.directory-results` renderizzata da `PublicDirectory`
catalog, accanto a export; il toggle luogo arriva via `extraControls`,
renderizzato in fondo alla griglia accanto a Reset). Le varianti condividono
ids (`record-search`, `record-kind-filter`, `record-freshness-filter`,
`record-sort`, `record-search-count`), label e stato URL — solo la resa
del counter cambia.

Feedback immediato (contatore `role="status"`, niente bottone "applica"),
reset sempre visibile, empty state truthfull, solo filtri a basso rischio
(tipo/freshness/sort — mai stato, produttore, dati sensibili).

#### 6.3.4 Card record — `RecordCard` ✅

`.record-list-card`: min-height 270px, grid `auto 1fr auto`, gap 22px,
padding 24px, bordo `--line`, radius `--radius-lg`, bg `#fffef9`;
`.card-topline` + h3 + dl fatti (3 colonne) + azioni. Su ≤700px: dl 2
colonne; azioni in colonna.

**Righe contestuali (t_127492f1):** in `.directory-tool .record-list` la
stessa `RecordCard` diventa riga piatta (hairline inferiore, niente
min-height/radius/bg, 3 colonne `titolo | fatti | azioni`, titolo 17px) —
lo stile arriva dal contesto della lista, la classe dell'articolo resta
byte-identica (`class="record-list-card"`, conteggiata dalle suite a11y).
Home e moderation restano card (griglie fuori da `.directory-tool`).

#### 6.3.5 Form ✅

`ReportForm`/`CorrectionForm`/auth: label visibile 12px/800 `#435963`, input
full-width bordo `#cdd6ce` radius `--radius-sm` padding 11–13px, focus
bordo `#3e9477` + outline 3px `var(--focus)` offset 2px; errori
`role="alert"` associati al campo; submit con stato loading (disabled +
testo "Invio…"); checkbox ≥15px con label `.check-label`.

#### 6.3.6 Stato vuoto — `EmptyState` ✅

`.empty-state`: bordo tratteggiato `#b9c7bf`, bg `#eef4ea`, radius
`--radius-lg`, h2/h3 20px, body 14px `#52656d`, azione (reset / link).
Sempre truthfull: "nessun record pubblicato trovato" — mai "non esiste".

#### 6.3.7 Altri pattern ✅

- `.notice` (verde, bordo-sx 3px), `.offline-state` (ambra), `.prototype-banner`
  (giallo-verde, usato solo dal tool locale di moderazione — su /mappa il
  banner è stato rimosso, feedback CEO 2026-08-02), `.duplicate-alert` (ambra).
- `.auth-error` / `.auth-danger-zone` (rosso `#8a3b2c`).
- `.faq-item`: disclosure nativa `<details>`, summary 17px/800, marker "+"/"–"
  in cerchio `#e3eee4`, focus outline offset -3px.
- `.filter-chip`: pill `--radius-full`, 13px/700, `.active` bg `#0b705c`
  testo bianco; 🔒 altezza 36px < 44px (WCAG 2.5.8 24px ok; binding: ≥44px
  per i target principali).
- `.confirm-button`: ≥44×44px, `aria-pressed`, disabled opacity .55.
- `.level-badge`: label + dot verde; **progresso solo testo** (mai barra).
- `.loading-note`: 12px (🔒 contrasto §3.1).

---

## 7. Stati dei componenti (hover / focus / disabled)

### 7.1 Focus (baseline globale) ✅

```
:where(a, button, input, select, textarea):focus-visible {
  outline:3px solid var(--focus); outline-offset:3px;   /* 🔒 var(--focus) */
}
```

Override documentati: offset 2px su input form, tool-card, confirm-button,
filter-chip, locale-toggle (con `z-index:1` per non essere coperto);
offset 1px su `.map-record`; offset **-3px** su `.faq-item summary`
(resta dentro la card). `.sr-only a:focus` diventa badge fisso visibile.

### 7.2 Matrice stati

| Componente | Hover | Focus | Disabled / attivo |
|------------|-------|-------|-------------------|
| `.button-primary` | bg `#b4edc7`, `translateY(-2px)` | outline 3px | disabled: opacity .55 |
| `.button-danger` | bg `#a04432` | outline 3px | opacity .55, `cursor:progress` |
| `.nav-links a` | color `#16715e` | outline 3px | `aria-current="page"` (attivo) |
| `.tool-card` | `translateY(-2px)`, bordo `#9db8aa` | outline offset 2px | — |
| `.map-record` | bg `#eef3ea` | outline offset 1px | `.selected`: border-sx 3px `#1a7c60`, bg `#e4efe6` |
| `.geocode-option` | bg `#eef3ea` | — (input tiene il focus, `aria-activedescendant`) | `.is-active` bg `#eef3ea` |
| `.filter-chip` | bordo `#3e9477`, color `#0b705c` | outline offset 2px | `.active`: bg `#0b705c`, testo bianco |
| `.confirm-button` | bg `#f1f7f1`, bordo `#3e9477` | outline offset 2px | `[aria-pressed=true]`: bg `#eef4ea`, bordo `#43a979`; disabled opacity .55 `not-allowed` |
| `.faq summary` | cursor pointer | outline offset -3px | `[open]`: marker "–" |
| `.locale-toggle button` | (nessuno) | outline offset 2px + z-index | `.is-active`: bg `#174e58`, testo bianco |
| `.button` (submit) | default | outline 3px | disabled + "Invio…" (testo), `cursor:wait` (moderation) |
| `.menu-button` (mobile) | — | outline 3px | `aria-expanded` true → `.nav-links.is-open` |

Regole: niente `:hover` senza `:focus-visible` equivalente; niente
`cursor:pointer` su elementi non interattivi; disabled mai solo opacità
(accompagnato da `aria-disabled` o `disabled` nativo).

---

## 8. Accessibilità (WCAG 2.2 AA)

Baseline ✅ preservata: skip-link (focus-reveal), focus visible, landmark
(`nav` con aria-label, `main#main-content`, `footer` contentinfo), un h1 per
pagina, `prefers-reduced-motion`, sr-only, alternativa mappa (region
aria-label + descrizione sr-only + link alla directory + fallback testuale),
status non-colour, controlli nativi senza tabindex custom.

Da rafforzare / verificare:
- **Focus management:** `/directory` → `/mappa?focus=ID` deve portare il
  focus al record (non in cima) — §6.2.6 già pan; verificare focus.
- **Annuncio cambio pagina:** ogni pagina tool ha l'h1 come announce point
  (su /mappa è sr-only ma presente).
- **Filtri:** il cambio filtro annuncia il contatore via `role="status"`.
- **Touch target:** `.button` ~47px ✅; 🔒 `.locale-toggle` ~25px e
  `.filter-chip` 36px < 44px — binding: ≥44px (WCAG 2.5.8 24px è il minimo,
  il target di prodotto è 44px); i controlli nativi (select) restano ok.
- **Contrasto dark hero:** `#c9d7de`/`#f6f9f6` su `--navy` — verificato
  ≥4.5:1 body, ≥3:1 large text ✅.
- **200% zoom a 320px:** griglie a 1 colonna, niente scroll orizzontale ✅.
- **Contrasti secondari:** 🔒 §3.1 (6 coppie da allineare).

Testing: mantenere `a11y-interactive.test.mjs`, `navigation-pages.test.mjs`,
`pages-render.test.mjs`; manuale per ogni route: keyboard-only, NVDA +
VoiceOver, zoom 200% a 320px, contrasto per stato.

---

## 9. Responsive

### 9.1 Comportamento per breakpoint (corretto in v2)

| Componente | Mobile (<768px) | Tablet (768–980px) | Desktop (≥980px) |
|------------|-----------------|--------------------|-------------------|
| Nav header | menu hamburger (≤768, auth nel dropdown) | inline, wrap | inline |
| Hero | 1 colonna, padding ridotto | 1 colonna | 2 colonne |
| **Mappa** | **pannello sidebar sopra la mappa** (≤768px, 38vh) | sidebar + mappa | sidebar 340px + mappa |
| Directory controls | 1 colonna (≤700) | 2 colonne (≤980) | 3 colonne |
| Directory catalog (t_127492f1) | controlli 1 col; righe 1 col; meta in colonna (≤700) | controlli 2 col; righe 1 col | righe piatte full-width |
| Record grid | 1 colonna | 1 colonna | 2 colonne |
| Form | 1 colonna | 2 colonne | 2 colonne |
| Footer | 1 colonna (≤700) | 2 colonne (≤980) | 3 colonne |
| Record facts | 1 colonna | 2 colonne | 2 colonne |

Nota v2: la v1 prescriveva "bottom-sheet collassabile" per la mappa mobile;
l'implementazione (e la scelta di design finale) è un **pannello sopra la
mappa** (max-height 38vh, scroll interno, breakpoint 768px) — più semplice e
non oscura la mappa per scelta dell'utente. Il bottom-sheet NON è più il
pattern di riferimento.

### 9.2 Principi

Mobile-first; niente scroll orizzontale a 320px; touch target ≥44px sui
controlli principali; la mappa non è mai full-screen persistent che oscura i
risultati; form coordinate a 1 colonna (≤480px).

---

## 10. Bilinguismo EN/IT

- **Bundle per dominio** (✅ tutti esistenti): `auth, common, community,
  contact, correction, directory, errors, faq, footer, guide, home,
  manifesto, map, moderation, moderazione, record, report, rules, status,
  types` — parità type-checked (`Translation<typeof en>`).
- **SSR locale:** cookie `opensurveillancedb-locale`, niente flash EN→IT
  (ADR 0015); `<html lang>` dal root layout; `generateMetadata()` localizza
  title/description/OG.
- **URL language-neutral:** route slug neutri; deep-link con
  `GET /api/locale?lang=it&next=/mappa`.
- **Rotture di layout:** IT ~15-20% più lungo — `overflow-wrap:anywhere` su
  `dd` di card e facts; nav 6 link + auth che collassano nel menu mobile a
  ≤768px (t_94b3726d; v1 diceva "fino a 5 link" — errato: il set è 6,
  t_a72a3106); eyebrow uppercase con tracking .14em verificato su label IT.

---

## 11. Dos & don'ts

### Do

1. Usa i token (§3) — mai hardcode di colore/radius/spacing nei componenti nuovi.
2. Un `h1` per pagina; se la pagina parte con un tool visivo, l'h1 è
   `sr-only` (documentato) ma presente.
3. Status dot **sempre** con label testuale; mai colore come unico canale.
4. Empty state truthfull + azione (reset / link a `/segnala`).
5. Stato dei filtri in URL (`?q=`, `?type=`, `?freshness=`, `?sort=`).
6. Contatori e cambi risultato in `aria-live`/`role="status"`; errori in
   `role="alert"` associati al campo.
7. Loading come testo + `aria-live` (niente spinner decorativi, niente
   skeleton animati).
8. Controlli nativi (`<button>`, `<input>`, `<select>`, `<a>`); niente
   tabindex custom; DOM order = tab order.
9. Focus visibile con `:focus-visible` e `var(--focus)`.
10. Riusa i pattern condivisi (§6.3): `FiltersBar`, `RecordCard`,
    `EmptyState`, bottoni, status dot. Non duplicare.
11. Header condiviso `PublicNav` su tutte le pubbliche; mai set nav
    per-pagina.
12. La mappa **non sparisce mai** con filtri a 0 risultati: nota truthfull in
    sidebar con "Clear filters" (t_b9666d09).
13. Mappa mobile: pannello sopra la mappa (≤768px), non bottom-sheet.
14. Contrasto ≥4.5:1 per testo normale; grigi secondari dalla tabella §3.1.
15. Error pages: nessun leak di path/errore; header ridotto + footer
    raggiungibile.
16. i18n: bundle separati per dominio, parità type-checked; route slug
    language-neutral.
17. Commenti CSS che spiegano il *perché* (convenzione della codebase —
    ogni blocco cita il task e la decisione).

### Don't

1. Non usare estetica "poliziesca", allarmismo, gradienti aggressivi o
   effetti vistosi — il progetto documenta sorveglianza, non la vende.
2. Non trasmettere stato solo con colore (WCAG 1.4.1).
3. Non scrivere "nessuna telecamera esiste" negli empty state — solo
   "nessun record pubblicato trovato".
4. Non aggiungere classi CSS senza definirle. ✅ F4: `.tool-heading`,
   `.tool-section`, `.status-dot.demo`, `.status-dot.pending` definite;
   `.map-tool` definita come eccezione full-width di `/mappa`; le no-op
   rimosse (`.filters-inline`, `.prototype-banner-compact`).
5. Non usare `window.confirm` — usare `ConfirmDialog`.
6. Non mettere la search due volte su `/mappa` (FiltersBar `hideSearch` +
   sidebar `GeocodeSearch`).
7. Non interrompere la mappa quando i filtri danno 0 risultati.
8. Non introdurre skeleton/spinner animati per il loading.
9. Non usare bottom-sheet per la mappa mobile (pattern superato).
10. Non hardcodare `#0b705c` (24 occorrenze): usare `var(--focus)`.
11. Non ignorare `prefers-reduced-motion`.
12. Non usare header contestuali sulle pagine pubbliche (solo auth/record/
    moderation/error).
13. Non scendere sotto AA sui grigi secondari (tabella §3.1).
14. Non rompere i redirect legacy: gli anchor `/#map`, `/#records` restano
    gestiti da `LegacyAnchorRedirect` (client-side, voluto: un fragment non
    arriva al server — non tornare a un redirect 302 server-side).
15. Non aggiungere icone decorative senza label/aria-hidden — le icone sono
    sobrie e funzionali.

---

## 12. Riepilogo delle decisioni di design

| # | Decisione | Stato |
|---|-----------|:---:|
| D1 | La home è hub, non tool | ✅ |
| D2 | 4 route tool separate: `/mappa`, `/directory`, `/segnala`, `/correggi` | ✅ |
| D3 | Stato filtri in query param | ✅ |
| D4 | Mappa e directory condividono gli stessi filtri (`FiltersBar`) | ✅ |
| D5 | Empty state truthfull + azione; mappa mai nascosta | ✅ (empty mappa in-sidebar) |
| D6 | Palette e tipografia consolidate, non cambiate | ✅ |
| D7 | Status dot sempre con label testuale | ✅ |
| D8 | Redirect legacy anchor **client-side** (`LegacyAnchorRedirect`) — non 302 (un fragment non arriva al server) | ✅ (v2 corregge la v1) |
| D9 | Refactor incrementale in fasi (F1–F4 completate) | ✅ |
| D10 | Touch target ≥44px, zoom 200% a 320px | ⚠ parziale (locale-toggle, filter-chip) |
| D11 | Header unico `PublicNav` a 6 link su tutte le pubbliche (t_a72a3106) | ✅ |
| D12 | Mappa mobile: pannello sopra la mappa (≤768px), non bottom-sheet | ✅ (v2 corregge la v1) |
| D13 | Container mappa `min(1440px, calc(100% - 32px))`; breakpoint 480/768 | ✅ |
| D14 | Error pages custom 404/500 con header ridotto (eccezione 6-link) | ✅ |
| D15 | Token layer esplicito: spacing 4px, radius, shadow, type scale | ⚠ radius ✅ (F5, outlier consolidati); spacing/type ✅ (F3); shadow 🔒 |
| D16 | Pesi tipografici 800/700 applicati per selettore (F4) | ✅ |
| D17 | Body 16px/1.5 esplicito in CSS (F4) | ✅ |
| D18 | Contrasti secondari ≥4.5:1 (6 coppie allineate in F4) | ✅ |
| D19 | `.tool-heading`/`.tool-section` definiti (h1 tool 800, clamp 34–52px) | ✅ |
| D20 | `.status-dot.demo` / `.status-dot.pending` definiti | ✅ |

---

## Appendice A: Componenti → route (aggiornata)

| Componente | Route |
|------------|-------|
| `Hero`, `MapTeaser`, `ToolCards` | `/` |
| `MappaTool`, `MapPanel`, `SurveillanceMap`, `MapRecordList`, `GeocodeSearch`, `FiltersBar (panel)`, `lib/map-popup.ts` | `/mappa` |
| `DirectoryTool`, `PublicDirectory`, `FiltersBar (inline)`, `RecordCard`, `EmptyState` | `/directory` |
| `SegnalaTool`, `ReportForm` | `/segnala` |
| `CorreggiTool`, `CorrectionForm` | `/correggi` |
| `RecordPageBody`, `VerificationWidget`, `StarConfirmButton` | `/records/[id]`, `/records/[id]/edit` |
| `ModerationDashboard` + `moderation/*` (8) + `useModerationQueue` | `/moderation` |
| `InfoPage` | manifesto, guide, regole, faq, contatti, moderazione, accessibility |
| `LegalPage` | privacy, termini, licenze |
| auth (in page) | login, register, account (+ `LevelBadge`, `ConfirmDialog`) |
| `PublicNav`, `PublicNavLinks`, `ToolLayout`, `SiteFooter`, `LocaleProvider` | tutte |
| `ErrorPage` | 404/500 |
| `LegacyAnchorRedirect` | root layout |

## Appendice B: Bundle i18n (stato reale)

Tutti esistenti: `auth, common, community, contact, correction, directory,
errors, faq, footer, guide, home, manifesto, map, moderation, moderazione,
record, report, rules, status, types` (+ `index` aggregatore). Parità
EN/IT type-checked. Nessun bundle nuovo richiesto (la v1 li prevedeva come
"nuovi" — sono stati creati).

## Appendice C: Stato di conformità vs `design-audit.md` (chiusura F4)

Stato al 2026-08-02: i gap code-side dell'audit F1 sono chiusi in F4. Restano
binding solo D15 (scala `--space-*`/radius/shadow) e i debt tracciati sotto.

| Gap audit | Sezione doc | Stato F4 | Priorità |
|-----------|-------------|----------|:---:|
| G1 `.tool-heading`/`.tool-section` mai definite | §2.2 (D19) | ✅ definite in globals.css | P1 |
| G2 `.status-dot.demo` invisibile | §6.3.2 (D20) | ✅ definito (`--status-demo`) | P1 |
| G3 pesi 800/700 non applicati | §3.2 (D16) | ✅ una riga per selettore | P1 |
| G4 body 16px/1.5 non esplicito | §3.2 (D17) | ✅ regola esplicita | P1 |
| G5 token `--focus`/`--status-*` mancanti, 5 dead | §3.1 | ✅ in `:root`, de-hardcodato (dead tokens: debt) | P1 |
| P2 5 grigi sotto AA + `--muted` 4.49 | §3.1 (D18) | ✅ 6 valori sostituiti (≥4.5:1) | P2 |
| P2 `.status-dot.pending` | §6.3.2 | ✅ definito (`--status-pending`) | P2 |
| P2 redirect client-side | §12 D8 | ✅ doc allineato (niente codice) | — |
| P2 mappa mobile panel | §9.1 D12 | ✅ doc allineato | — |
| P3 breakpoint 480/768, container 1440 | §3.6 | ✅ doc allineato | — |
| P3 6 classi no-op | §11 don't #4 | ✅ rimosse o definite | P3 |
| P3 empty state directory senza link `/segnala` | §6.3.6 | ✅ azione reset + link (`submitObservation`) | P3 |
| P3 error pages | §2.3 D14 | ✅ doc allineato | — |
| P3 touch target locale-toggle/filter-chip | §8 | ✅ ≥44px | P3 |
| 29 componenti non documentati | §6.1 | ✅ doc allineato (questo doc) | — |

**Debt residuo (fuori scope F4):** D15 token layer — `--space-*`/`--radius-*`
✅ implementati in F3 (t_27bfa729, PR #214), resta 🔒 solo `--shadow-*`; 4
dead tokens; classe `.place-empty-actions` non definita (stessa resa inline);
duplicazione h1/h2+intro su `/directory` (⚠ audit §2).
