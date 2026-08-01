# Frontend design — visione e architettura delle pagine

Last reviewed: 2026-08-01
Author: Vera (Designer UX/UI)

Questo documento definisce la **visione di design** per il refactor del frontend
verso pagine separate per funzione. È il complemento di design di
`docs/SITEMAP.md` (architettura informativa attuale) e
`docs/workstreams/PRODUCT_UX.md` (requisiti UX/accessibilità). Non contiene
codice: è il piano che guida l'implementazione.

---

## 1. Analisi dello stato attuale

### 1.1 Cosa c'è già (e funziona)

Il frontend è più maturo di quanto ipotizzato all'origine del task. Tutti i
punti dell'analisi si basano sul codice effettivo in `app/`:

- **`app/page.tsx` è già stato decomposto**: 130 righe, orchestrazione di 5
  componenti home (`Hero`, `MapPanel`, `PublicDirectory`, `CorrectionForm`,
  `ReportForm`). Il monolito "269+ righe" non esiste più.
- **Pagine informative già separate**: `/manifesto`, `/regole`, `/moderazione`,
  `/privacy`, `/termini`, `/licenze`, `/faq`, `/contatti`, `/guide` — ognuna con
  una route propria, un singolo `h1`, e bundle i18n tipizzato EN/IT.
- **Pattern condivisi esistenti**: `InfoPage` (free-form) e `LegalPage`
  (strutturato) per le pagine informative; `SiteHeader` e `SiteFooter` globali
  (footer nel root layout, header iniettato per pagina).
- **i18n**: externalizzato in `app/lib/i18n/` con parità EN/IT type-checked
  (`Translation<typeof en>`); locale risolta SSR via cookie (ADR 0015).
- **Accessibilità**: skip link, focus visible (`outline:3px solid #0b705c`),
  `prefers-reduced-motion`, landmark `nav`/`main`/`footer` con `aria-label`,
  fallback testuale della mappa, list alternativa keyboard-accessible.
- **Route dei tool privati**: `/moderation` (dashboard moderatori, protetto
  `requireRole`), `/account`, `/login`, `/register`, `/records/[id]`.

### 1.2 Cosa manca (il gap di design)

Il problema non è "page.tsx monolitico" — è che **tutti i tool interattivi
pubblici vivono ancora in `/` come sezioni anchor** (`#map`, `#records`,
`#report`, `#correction`). Questo crea tre problemi di UX:

1. **La home page è una "tutto-in-uno"**: mappa, directory, segnalazione e
   correzione competono per l'attenzione su una singola rotta. La home è
   contemporaneamente landing, strumento di esplorazione, form di inserimento e
   form di correzione. L'utente non sa mai dove "è".
2. **Deep-linking impreciso**: condividere `/#map` o `/#report` funziona ma è
   fragile (dipende dagli anchor, dallo scroll, dall'ordine di caricamento). Non
   si può condividere "la mappa centrata su Roma con filtro tipo=ANPR" perché lo
  stato è client-side e non in URL.
3. **Linguaggio di navigazione ambiguo**: il link "Map & data" punta a `/#map`,
  "Directory" a `/#records`. Semanticamente sono anchor, non destinazioni. Per
  l'utente e per il SEO sono la stessa pagina.

Il refactor deve **promuovere le sezioni-tool a route proprie**, mantenendo la
home come hub di orientamento (non come contiene-tutto).

---

## 2. Architettura delle pagine target

### 2.1 Principi di design

1. **La home è un hub, non un tool.** `/` orienta: dice cosa fa il progetto, linka
   i quattro tool (mappa, directory, segnala, correggi), mostra un teaser della
   mappa. Non ospita più la mappa interattiva a piena altezza né i form.
2. **Una rotta, un job.** Ogni tool ha la sua route, il suo `h1`, la sua
   intestazione di contesto. La navigazione tra tool è esplicita, non per
   scroll.
3. **Stato in URL, non in memoria.** Filtri, ricerca, ordinamento vivono nei
   query params così sono condivisibili, bookmarkable e SSR-renderable.
4. **Coerenza visiva: un solo design system.** Ogni pagina tool condivide
   header, footer, palette, tipografia, spaziature e componenti base.
5. **Navigazione bidirezionale.** Da ogni tool si torna alla home e agli altri
   tool; la home linka tutti i tool. Niente vicoli ciechi.

### 2.2 Route map target

Legenda: **[esistente]** = route già live; **[nuova]** = route da creare.

| Route | Pagina | Scopo | Nav header | Footer | Stato |
|-------|--------|-------|:---:|:---:|-------|
| `/` | Home (hub) | Hero + teaser mappa + link ai 4 tool + principi sintetici | ✓ (brand) | ✓ (brand) | **[esistente]** — da semplificare |
| `/mappa` | Mappa interattiva | Esplorazione cartografica dei record pubblici | ✓ | — | **[nuova]** |
| `/directory` | Directory testuale | Lista ricercabile, filtrabile, ordinabile — alternativa accessibile alla mappa | ✓ | ✓ | **[nuova]** |
| `/segnala` | Segnalazione | Form guidato di inserimento record (privato, pre-pubblicazione) | ✓ | — | **[nuova]** |
| `/correggi` | Correzione / segnalazione problema | Richiesta di correzione o rimozione su un record | ✓ | — | **[nuova]** |
| `/records/[id]` | Dettaglio record | Scheda pubblica del singolo record + link a correggi | contestuale | — | **[esistente]** |
| `/guide` | Guida | Come usare il sito (mappa, directory, export, stati record) | ✓ | ✓ | **[esistente]** |
| `/manifesto` | Manifesto | Missione, principi, non-goal | ✓ | ✓ | **[esistente]** |
| `/regole` | Regole | Regole di partecipazione e contenuti | ✓ | ✓ | **[esistente]** |
| `/moderazione` | Come funziona la moderazione | Spiegazione pubblica del flusso di review | — | ✓ | **[esistente]** |
| `/privacy` | Privacy | Informativa privacy pubblica | — | ✓ | **[esistente]** |
| `/termini` | Termini di uso | Termini di uso pubblici | — | ✓ | **[esistente]** |
| `/licenze` | Licenze | Licenze dati/software, attribuzione OSM | — | ✓ | **[esistente]** |
| `/faq` | FAQ | Domande frequenti | — | ✓ | **[esistente]** |
| `/contatti` | Contatti | Chi siamo, contatti, sicurezza | — | ✓ | **[esistente]** |
| `/moderation` | Dashboard moderatori | Coda di moderazione (privato, `requireRole`) | — | — | **[esistente]** |
| `/account` | Account | Profilo contributor, proprie segnalazioni | — | — | **[esistente]** |
| `/login` | Login | Autenticazione contributor | — | — | **[esistente]** |
| `/register` | Registrazione | Registrazione contributor | — | — | **[esistente]** |

### 2.3 Descrizione delle route nuove

#### `/mappa` — Mappa interattiva

- **Scopo:** esplorazione cartografica dei record pubblici. Sostituisce la
  sezione `#map` della home attuale.
- **Contenuto:** mappa Leaflet a pieno viewport (con sidebar/pannello record
  selezionato), controlli filtro tipo + freshness, export dati (GeoJSON/CSV),
  banner "prototipo", hint mappa, fallback testuale se script/tile fallisce.
- **Stato in URL:** `?type=ANPR&freshness=30d&lat=41.90&lng=12.50&z=13` —
  condivisibile e SSR-renderable.
- **Navigazione:** link a `/directory` (vista testuale equivalente), a
  `/segnala`, a `/records/[id]` (click marker → pagina record), a `/guide`.
- **Accessibilità:** la mappa ha sempre la sua descrizione `sr-only` + link alla
  directory; il pannello record è `aria-live="polite"`; il fallback testuale è
  la directory, linkata in primo piano se la mappa non si carica.
- **Layout:** mappa a sinistra (o a tutto schermo su mobile), pannello record
  a destra (o in basso su mobile). Su mobile, la mappa occupa il viewport e il
  record selezionato diventa un bottom-sheet collassabile.

#### `/directory` — Directory testuale

- **Scopo:** lista ricercabile, filtrabile e ordinabile dei record pubblici.
  Sostituisce la sezione `#records` della home attuale. È l'alternativa
  accessibile alla mappa (principio PRODUCT_UX: "functional list/search
  experience equivalent to map exploration").
- **Contenuto:** barra di ricerca testuale, filtro tipo, filtro freshness,
  ordinamento, contatore risultati, griglia di `RecordCard`, stato vuoto
  truthfull, ricerca per luogo (geocoding locale/coordinate).
- **Stato in URL:** `?q=t&tutti=ANPR&freshness=30d&sort=alpha` — condivisibile.
- **Navigazione:** link a `/mappa` ("usa la mappa"), a `/records/[id]`, azione
  "mostra sulla mappa" (apre `/mappa` con il record preselezionato via query
  param `?focus=ID`).
- **Accessibilità:** ogni controllo è nativo (`<input type="search">`,
  `<select>`), con `<label>` associato; il contatore è `role="status"`; lo stato
  vuoto dice "nessun record pubblicato trovato" e offre reset + link a `/segnala`.
- **Layout:** controlli in cima (grid responsive: 3 colonne desktop → 1 mobile),
  griglia di card 2 colonne desktop → 1 mobile, paginazione "load more" o
  paginata server-side.

#### `/segnala` — Segnalazione

- **Scopo:** form guidato di inserimento di un possibile record. Sostituisce la
  sezione `#report` della home attuale. Il record è privato (`pending`), mai
  pubblico prima dell'approvazione.
- **Contenuto:** guida all'ammissibilità (cosa è pubblicabile, cosa no),
  selezione posizione (mappa click o coordinate manuali con readout), campi
  minimi (tipo, posizione, data osservazione, nota), opzionali (produttore,
  data osservazione — con checkbox di consenso alla pubblicazione separato),
  upload foto (se abilitato), checkbox termini/licenza, conferma pre-invio,
  acknowledgement con reference ID.
- **Stato in URL:** nessuno (form transiente). Dopo l'invio, la conferma mostra
  il reference ID e un link a `/account` (se autenticato).
- **Navigazione:** link a `/regole` (regole di partecipazione), a `/guide`, a
  `/correggi` (se l'utente vuole correggere invece di segnalare), a `/login` /
  `/register` (se vuole tracciare la segnalazione).
- **Accessibilità:** ogni campo ha `<label>` visibile; gli errori sono
  `role="alert"` e associati al campo; il readout delle coordinate è leggibile
  come testo; il flow multi-step (se adottato) usa `aria-current="step"`; il
  bottone di submit ha stato loading.
- **Layout:** griglia 2 colonne desktop (sinistra: testo guida, destra: form),
  1 colonna mobile. Il form è in una card con padding generoso.

#### `/correggi` — Correzione / segnalazione problema

- **Scopo:** richiesta di correzione, aggiornamento o rimozione di un record
  pubblicato. Sostituisce la sezione `#correction` della home attuale.
- **Contenuto:** selezione del record (cerca per ID o titolo, o link dal record
  detail), tipo di problema (inesatto, obsoleto, privacy/sicurezza, duplicato,
  altro), contesto minimo, riferimento ID privato, conferma, guidance per
  privacy/urgenze.
- **Stato in URL:** `?record=ID` (precompila il record quando si arriva dal
  detail page).
- **Navigazione:** link a `/records/[id]` (torna al record), a `/contatti`
  (contatto diretto), a `/segnala` (se l'utente voleva segnalare un nuovo
  record, non correggere).
- **Accessibilità:** come `/segnala`, con l'aggiunta che il record precompilato
  è annunciato (`aria-live`).
- **Layout:** come `/segnala`.

### 2.4 Home page semplificata (route `/`)

La home cessa di essere "tutto-in-uno" e diventa un **hub di orientamento**:

1. **Hero** (conservato): titolo, intro, 2 CTA ("Esplora la mappa" → `/mappa`,
   "Segnala una telecamera" → `/segnala`), stat record.
2. **Teaser mappa** (nuovo): anteprima statica o mini-mappa non interattiva con
   CTA "Apri la mappa" → `/mappa`. Non è la mappa interattiva completa (la
   mappa completa vive su `/mappa`).
3. **Quattro card tool** (nuovo): griglia 2×2 (desktop) / 1×4 (mobile) con
   i link ai 4 tool pubblici: Mappa, Directory, Segnala, Correggi — ognuno con
   icona sobria, titolo, una riga di descrizione.
4. **Principi sintetici** (conservato e ridotto): 3 card (open by default,
   privacy first, moderated reports) come nella sezione `#how-it-works` attuale.
   Rinvia a `/manifesto` per il dettaglio.
5. **Footer** (conservato): globale, dal root layout.

La home **non** contiene più: la mappa interattiva a piena altezza, la
directory con filtri, il form di segnalazione, il form di correzione.

### 2.5 Navigazione globale

#### Header (per pagina)

Mantenere il pattern `SiteHeader` esistente: ogni pagina inietta i propri
link di contesto. La **home hub** ha il link set completo; le **pagine tool**
hanno un set ridotto orientato al cross-link tra tool.

| Pagina | Nav links (in ordine) |
|--------|----------------------|
| `/` | Mappa (`/mappa`), Directory (`/directory`), Segnala (`/segnala`), Guide, Regole, Manifesto |
| `/mappa` | Directory, Segnala, Guide, Home |
| `/directory` | Mappa, Segnala, Guide, Home |
| `/segnala` | Directory, Mappa, Guide, Regole, Home |
| `/correggi` | Directory, Mappa, Contatti, Home |
| `/guide`, `/manifesto`, `/regole` | Mappa, Directory, Guide/Manifesto, Home (CTA) |
| `/moderazione`, `/faq`, `/contatti` | Mappa, Directory, Home (CTA) |
| `/privacy`, `/termini`, `/licenze` | Mappa, Directory, Guide (via LegalPage) |
| `/records/[id]` | Directory (back), Correggi (azione), Home |
| `/moderation` (privato) | Home (ritorno), LocaleToggle |
| `/account`, `/login`, `/register` | Home |

**Regola:** il set di link header di ogni pagina tool include sempre almeno gli
altri tool pubblici + la home. Niente vicoli ciechi tra i 4 tool.

#### Footer (globale, conservato)

Il `SiteFooter` esistente resta nel root layout. Aggiungere i link ai 4 tool
pubblici nella sezione nav del footer (Mappa, Directory, Segnala, Correggi)
accanto ai link istituzionali esistenti (Manifesto, Regole, Guide, Privacy,
Termini, Licenze, FAQ, Contatti).

### 2.6 Migration path

Il refactor è incrementale e non-breaking:

1. **Fase 1 — Creare le route tool.** Creare `/mappa`, `/directory`, `/segnala`,
   `/correggi` estraendo i componenti esistenti (MapPanel, PublicDirectory,
   ReportForm, CorrectionForm) dalle sezioni di `app/page.tsx`. Ogni route
   riutilizza i componenti già esistenti senza riscriverli. La home continua a
   funzionare con le sezioni anchor (fallback temporaneo).
2. **Fase 2 — Semplificare la home.** Sostituire le sezioni interattive della
   home con il teaser mappa + le 4 card tool. La home diventa hub.
3. **Fase 3 — Aggiornare la navigazione.** Aggiornare `SiteHeader` (link set),
   `SiteFooter` (link ai tool), `SITEMAP.md`, e i bundle i18n (`home.ts` ecc.)
   con le nuove label di navigazione. I vecchi anchor (`/#map`, `/#records`)
   diventano redirect 302 alle nuove route (per i bookmark esistenti).
4. **Fase 4 — Stato in URL.** Spostare lo stato dei filtri/ricerca da
   `useState` a query params (`useSearchParams` + router). Abilita
   condivisione, bookmarking e SSR dei filtri.

---

## 3. Design system

### 3.1 Principi estetici

Il progetto documenta infrastrutture di sorveglianza pubblica: il design deve
trasmettere **chiarezza, fiducia, sobrietà** — mai allarmismo né estetica
"poliziesca". Riferimento morale: civic-tech open data (vedi OpenStreetMap,
Wikidata), non dashboard di security. Niente effetti vistosi, niente animation
decorative, niente gradienti aggressivi.

### 3.2 Palette (consolidata dall'esistente `globals.css`)

La palette è già definita in `:root` e funziona. La consolidido in un design
token layer esplicito:

```
/* Ink — testo principale */
--ink: #102332

/* Muted — testo secondario, label */
--muted: #60727f

/* Paper — sfondo pagina */
--paper: #f5f3ec

/* Line — bordi, separatori */
--line: #d8ddd6

/* Navy — hero, sfondi scuri */
--navy: #09233a
--navy-2: #123b55

/* Accents — semantic status */
--mint: #cbf7da     /* primary action bg */
--lime: #94e8a5     /* success accent */
--amber: #f8b84e    /* warning, community-report status */
--coral: #e87b67    /* error, needs-review status */
--sand: #ebe7da     /* surface variant */

/* Focus */
--focus: #0b705c    /* focus ring (WCAG AA su paper) */

/* Status dots */
--status-verified: #42a979
--status-community: #d3963e
--status-review: #d8715e
```

**Verifica contrasto WCAG AA:**

| Token | Su sfondo | Ratio | Uso | AA? |
|-------|-----------|-------|-----|:---:|
| `--ink` (#102332) | `--paper` (#f5f3ec) | ~14.5:1 | testo corpo | ✓ (AAA) |
| `--muted` (#60727f) | `--paper` (#f5f3ec) | ~4.6:1 | testo secondario | ✓ (AA) |
| `--focus` (#0b705c) | `--paper` | ~4.8:1 | focus ring | ✓ (AA) |
| `#405462` (nav-links) | `--paper` | ~7.2:1 | link nav | ✓ (AAA) |
| `#0b705c` (link/action) | `--paper` | ~4.8:1 | link action | ✓ (AA) |
| `#fffef9` (card bg) | `--paper` | ~1.02:1 | surface | n/a (surface) |
| `--coral` (#e87b67) | `--paper` | ~3.1:1 | status dot only | ⚠ paired with text label |
| `--amber` (#f8b84e) | `--paper` | ~1.9:1 | status dot only | ⚠ paired with text label |

**Regola di accesso critica:** gli status dot (`verified`, `community-report`,
`needs-review`) **non trasmettono mai informazioni da soli** — sono sempre
abbinati a un'etichetta testuale localizzata (`publicStatusLabel`). Il colore è
ridondante, non esclusivo (principio WCAG 1.4.1).

### 3.3 Tipografia

- **Famiglia:** Arial, Helvetica, sans-serif (già in `body`). Si valuta un
  upgrade a un system font stack (`-apple-system, system-ui, ...`) per
  uniformità cross-platform, ma Arial è sobrio e va bene per il civic-tech.
- **Scala tipografica (rhythm esistente, consolidato):**

| Ruolo | Classe | Size | Line-height | Weight | Tracking |
|-------|--------|------|-------------|--------|----------|
| Hero h1 | `.hero h1` | clamp(48px, 6vw, 82px) | .96 | 800 | -.075em |
| Record h1 | `.record-detail h1` | clamp(42px, 6vw, 70px) | .96 | 700 | -.07em |
| Section h2 | `.section-heading h2` | clamp(34px, 4vw, 53px) | 1 | 800 | -.065em |
| Legal h2 | `.legal-section h2` | clamp(23px, 3vw, 32px) | 1.08 | 700 | -.05em |
| Card h3 | `.camera-card h3` | 22px | 1.08 | 700 | -.04em |
| Body | body | 15px | 1.6 | 400 | normal |
| Eyebrow | `.eyebrow` | 11px | — | 800 | .14em uppercase |
| Topline | `.card-topline` | 11px | — | 800 | .09em uppercase |
| Detail dt | `.record-detail-facts dt` | 10px | — | 800 | .1em uppercase |

La scala è **sobria e gerarchica**: contrasti netti di peso (800 vs 400) e di
size (82px hero vs 10px label). Niente decorazione.

### 3.4 Spaziature (scale 4px-based)

La codebase usa valori specifici non sistemizzati. Consolidare in una scale
esplicita per coerenza futura:

```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
--space-24: 96px
```

**Larghezza contenitore:**
- Standard: `min(1180px, calc(100% - 48px))` (pagine section)
- Leggibile: `min(760px, calc(100% - 48px))` (record detail, legal, FAQ)
- Largo: `min(1320px, calc(100% - 48px))` (nav-shell, hero)

### 3.5 Componenti base (design system)

I componenti esistenti formano già un design system implicito. Lo formalizzo:

| Componente | File | Dove si usa | Note design |
|------------|------|-------------|-------------|
| `SiteHeader` | `app/components/SiteHeader.tsx` | tutte le pagine | nav-shell con brand + links + locale toggle |
| `SiteFooter` | `app/components/SiteFooter.tsx` | root layout | footer istituzionale globale |
| `Hero` | `app/components/home/Hero.tsx` | `/` | hero scuro con stat |
| `SurveillanceMap` | `app/components/SurveillanceMap.tsx` | `/mappa` (e teaser `/`) | mappa Leaflet con fallback |
| `RecordCard` | `app/components/RecordCard.tsx` | `/directory`, search results | card record condivisa |
| `MapPanel` | `app/components/home/MapPanel.tsx` | `/mappa` | mappa + card record + export |
| `PublicDirectory` | `app/components/home/PublicDirectory.tsx` | `/directory` | search + filtri + lista |
| `ReportForm` | `app/components/home/ReportForm.tsx` | `/segnala` | form segnalazione |
| `CorrectionForm` | `app/components/home/CorrectionForm.tsx` | `/correggi` | form correzione |
| `InfoPage` | `app/components/InfoPage.tsx` | pagine informative | wrapper shared (SSR) |
| `LegalPage` | `app/components/LegalPage.tsx` | `/privacy`, `/termini`, `/licenze` | wrapper legali (SSR) |
| `ModerationDashboard` | `app/components/ModerationDashboard.tsx` | `/moderation` | dashboard privata |
| `LocaleToggle` | `app/components/LocaleProvider.tsx` | header | toggle EN/IT |

**Pattern di componenti (classi CSS riutilizzabili):**

- **`.button` / `.button-primary` / `.button-quiet` / `.detail-outline`** —
  sistema di bottoni a 3 livelli (primary, quiet/outline, text).
- **`.text-button`** — bottone testuale (link inline con freccia).
- **`.card-topline`** — riga di metadata uppercase sopra un titolo card.
- **`.eyebrow`** — label uppercase sopra un heading.
- **`.empty-state`** — box tratteggiato per stato vuoto.
- **`.notice`** — banner informativo (verde, bordo sinistro).
- **`.prototype-banner`** — banner "prototipo" (giallo-verde).
- **`.duplicate-alert`** — alert warning duplicati.
- **`.auth-error`** / **`.auth-danger-zone`** — errori e zone pericolose.
- **`.status-dot`** + `.verified` / `.community-report` / `.needs-review` /
  `.demo` — dot di stato semantico (sempre con label testuale).

---

## 4. Pattern dei filtri (directory e mappa)

### 4.1 Filtri condivisi (mappa + directory)

I filtri devono essere **identici** su `/mappa` e `/directory` (stesso
componente, stesso stato URL) perché le due viste sono equivalenti
(principio PRODUCT_UX: map e list espongono gli stessi campi pubblici).

| Filtro | Controllo | Valori | Query param | Note |
|--------|-----------|--------|-------------|------|
| Ricerca testuale | `<input type="search">` | testo libero | `?q=` | match su titolo/kind/indirizzo |
| Tipo camera | `<select>` | `all` + tipi dinamici | `?type=` | whitelist dai dati |
| Freshness | `<select>` | `all`, `7d`, `30d`, `90d` | `?freshness=` | finestre whitelistate |
| Ordinamento | `<select>` | `alphabetical`, `position` | `?sort=` | |
| Ricerca per luogo | `<input>` + submit | testo/coordinate | `?place=` | geocoding, area + raggio |
| Reset | `<button>` | — | rimuove tutti i params | sempre visibile |

### 4.2 UX dei filtri

- **Feedback immediato:** il contatore risultati (`role="status"`) si aggiorna
  al cambiare di ogni filtro. Niente bottone "applica" separato.
- **Reset sempre disponibile:** un bottone "pulisci filtri" visibile quando c'è
  almeno un filtro attivo.
- **Stato vuoto truthfull:** "Nessun record pubblicato trovato" — non "nessuna
  telecamera esiste". Offre reset + link a `/segnala` (forse vuoi segnalarla).
- **Annuncio AT:** il contatore e lo stato vuoto sono in `aria-live="polite"`
  così lo screen reader annuncia il cambio risultati senza spostare il focus.
- **Filtri sicuri (principio PRODUCT_UX):** solo categorie a basso rischio
  (tipo, freshness, ordinamento). Niente filtri per stato (lo stato pubblico è
  implicito: solo `verified` + `demo`), produttore, o dati sensibili.

---

## 5. Stati: vuoto, caricamento, errore

### 5.1 Stato vuoto (empty state)

Ogni vista che mostra una lista deve avere uno stato vuoto **truthfull** e
**orientato all'azione**:

- **Directory senza risultati:** `.empty-state` con h3 "Nessun record
  pubblicato trovato", testo "Questo non significa che non ci siano telecamere
  nella zona — solo che non abbiamo record pubblicati che corrispondono ai
  tuoi filtri", bottone "Pulisci filtri", link a `/segnala`.
- **Mappa senza risultati:** la mappa mostra i marker solo se ci sono record;
  se i filtri restituiscono 0, il pannello record mostra lo stesso empty state
  della directory e un link "vedi nella directory".
- **Account senza segnalazioni:** "Non hai ancora inviato segnalazioni" + link
  a `/segnala`.
- **Moderation queue vuota:** "Niente in coda" per ogni sezione (già
  implementato in `QueueSection`).

### 5.2 Stato caricamento (loading)

- **Mappa:** `loading-note` ("Caricamento record...") sotto la mappa, `aria-live`.
  La mappa mostra il fallback se Leaflet non carica.
- **Directory:** `loading-note` con `aria-live="polite"`; le card non fanno
  skeleton (sobrietà: un testo semplice è meglio di un placeholder animato).
- **Record detail:** "Caricamento..." nel `.record-detail` con `aria-live`.
- **Form submit:** bottone con `disabled` + testo "Invio..." (già implementato).
- **Principio:** niente spinner animati decorativi. Testo + `aria-live`.

### 5.3 Stato errore (error)

- **API unreachable (mappa/directory):** `.notice` con `role="status"` —
  "Servizio temporaneamente non disponibile. Mostrando dati di esempio."
  (già implementato in `MapPanel`).
- **Record non trovato (detail):** h1 "Record non disponibile" + testo + CTA
  retry + CTA "Sfoglia la directory" (già implementato).
- **Errore form (segnala/correggi):** `role="alert"` associato al campo; testo
  localizzato; niente codice tecnico.
- **Errore auth:** `.auth-error` con `role="alert"` (già implementato).
- **Principio:** l'errore è onesto, localizzato, e offre sempre una via d'uscita
  (retry, alternativa, contatto). Mai allarmismo.

---

## 6. Accessibilità (WCAG 2.2 AA)

### 6.1 Baseline già implementata (da preservare)

- **Skip link:** `LocaleProvider` renderizza lo skip link (focus-reveal).
- **Focus visible:** `outline:3px solid #0b705c; outline-offset:3px` su tutti i
  elementi interattivi (`:focus-visible`).
- **Landmark:** `nav` (con `aria-label`), `main#main-content`, `footer`
  (`contentinfo`).
- **Heading structure:** un `h1` per pagina, `h2` per sezioni, niente salti
  di livello (verificato da `navigation-pages.test.mjs`).
- **Reduced motion:** `prefers-reduced-motion: reduce` disabilita smooth scroll
  e animation.
- **sr-only:** classe `.sr-only` per testo solo screen reader.
- **Map alternative:** `SurveillanceMap` ha region `aria-label` + descrizione
  `sr-only` + link alla directory + fallback testuale.
- **Status non-colour:** status dot sempre abbinati a label testuale
  (`publicStatusLabel`).
- **Keyboard:** tutti i controlli sono nativi (`<button>`, `<input>`, `<select>`,
  `<a>`); niente tabindex custom; ordine DOM = ordine tab.

### 6.2 Da rafforzare nel refactor

- **Focus management tra route:** quando si naviga da `/directory` a
  `/mappa?focus=ID`, il focus deve andare al record selezionato (non in cima).
  Usare `autoFocus` sul container del record o `focus()` programmatico.
- **Annuncio cambio pagina:** Next.js App Router annuncia le route change a AT
  per default; verificare che ogni nuova pagina tool abbia un `h1` che funge da
  announce point.
- **Filtri in URL:** i query param sono automaticamente annunciabili; verificare
  che il cambio di filtro sposti il focus sul contatore risultati (o lo
  annunci via `aria-live`).
- **Touch target:** verificare ≥44×44 CSS px su bottoni e select mobile (la
  codebase ha `padding:13px 18px` sui bottoni → ~44px height, ✓).
- **Contrasto dark hero:** il testo hero su `--navy` (#09233a) ha colore
  `#c9d7de` / `#f6f9f6` — verificare ratio ≥4.5:1 per body e ≥3:1 per large
  text (✓ per entrambi, ma documentarlo).
- **200% zoom a 320px:** verificare che le griglie a 2 colonne collassino a 1
  (già gestito dai `@media (max-width:700px)`) e che non ci sia scroll
  orizzontale.

### 6.3 Testing di accessibilità

- **Automated:** mantenere `a11y-interactive.test.mjs`, `navigation-pages.test.mjs`,
  `pages-render.test.mjs`.
- **Manuale (per ogni nuova route):** test keyboard-only (tab, enter, esc),
  screen reader (NVDA + VoiceOver), zoom 200% a 320px width, contrasto su ogni
  stato (default, focus, hover, disabled).
- **Page-specific:** mappa → verificare fallback; directory → verificare filtri
  da tastiera; form → verificare errori annunciati e focus non perso.

---

## 7. Responsive

### 7.1 Breakpoint (esistenti, consolidati)

```
/* Mobile-first: base = mobile */
/* Tablet: ≥700px */
/* Desktop: ≥980px */
/* Wide: ≥1320px (container max) */
```

### 7.2 Comportamento per breakpoint

| Componente | Mobile (<700px) | Tablet (700–980px) | Desktop (≥980px) |
|------------|-----------------|---------------------|--------------------|
| Nav header | hamburger menu (`.menu-button` + `.nav-links.is-open`) | inline, wrap | inline |
| Hero | 1 colonna, padding ridotto | 1 colonna | 2 colonne (copy + visual) |
| Mappa | viewport pieno, pannello record in basso | mappa + sidebar | mappa + sidebar |
| Directory controls | 1 colonna (stack) | 2 colonne | 3 colonne |
| Record grid | 1 colonna | 1 colonna | 2 colonne |
| Form (segnala/correggi) | 1 colonna | 2 colonne | 2 colonne (guida + form) |
| Footer | 1 colonna | 2 colonne | 3 colonne |
| Record detail facts | 1 colonna | 2 colonne | 2 colonne |

### 7.3 Principi responsive

- **Mobile-first:** il CSS base serve mobile; le `@media (min-width)` o
  `max-width` aggiungono complessità progressiva.
- **Niente scroll orizzontale a 320px:** tutte le griglie collassano a 1 colonna.
- **Touch target ≥44px:** bottoni e select hanno padding sufficienti.
- **Mappa su mobile:** non full-screen persistent che oscura risultati; il
  pannello record è collassabile (bottom-sheet pattern) o scrollabile sotto.
- **Form su mobile:** i campi coordinate sono a 1 colonna, il readout è
  leggibile, i checkbox hanno target sufficienti.

---

## 8. Bilinguismo EN/IT

### 8.1 Pattern esistente (da preservare)

- **Bundle per dominio:** ogni pagina ha il suo file in `app/lib/i18n/`
  (es. `home.ts`, `map.ts`, `record.ts`) con `en` (pilot) + `it` type-checked
  per parità (`Translation<typeof en>`).
- **SSR locale:** `getServerMessages()` legge il cookie `opensurveillancedb-locale`
  e renderizza server-side (ADR 0015). Niente flash EN→IT.
- **LocaleToggle:** bottone EN/IT che chiama `router.refresh()` (re-render
  server-side).
- **`<html lang>`:** settato dal root layout in base al cookie locale.
- **Metadata per-route:** `generateMetadata()` localizza title/description/OG.

### 8.2 Da aggiungere per le nuove route

- **Bundle `map.ts`** (esiste già per le label della mappa): estendere con le
  label della nuova pagina `/mappa` (title, intro, eyebrow, nav).
- **Nuovi bundle o estensioni:**
  - `directory.ts` (o estensione di `home.ts`): label della pagina directory.
  - `report.ts` (o estensione di `home.ts`): label della pagina segnalazione.
  - `correction.ts` (o estensione di `home.ts`): label della pagina correzione.
- **Parità type-checked:** ogni nuovo bundle segue `Translation<typeof en>`.
- **URL language-neutral:** le route sono slug neutri (`/mappa`, `/directory`,
  `/segnala`, `/correggi`); il deep-link a una lingua usa `GET /api/locale?lang=it&next=/mappa`.

### 8.3 Rotture di layout EN/IT

- **Testo più lungo in IT:** l'italiano è ~15-20% più lungo dell'inglese. Le
  grid e i flex-wrap devono gestire testo lungo senza overflow (già gestito da
  `overflow-wrap:anywhere` su `.record-list-card dd` e `.record-detail-facts dd`).
- **Label dei filtri:** le `<select>` option si espandono; verificare che le
  option IT non escano dal dropdown (nativo, non un problema).
- **Nav header:** le label IT dei link possono essere più lunghe; il wrap del
  nav-shell a 700px è già gestito. Verificare che il set di link delle nuove
  pagine tool (fino a 5 link) non overflow su tablet.
- **Eyebrow uppercase:** l'uppercase con tracking .14em può rompersi con testo
  IT lungo; verificare che gli eyebrow IT stiano su una riga o wrapping pulito.

---

## 9. Considerazioni per i ruoli (parere integrato)

Questo task richiede il parere di tutti i ruoli. Come designer, segnalo i punti
di contatto con CTO, docs e QA:

### 9.1 CTO (Ada) — impatto tecnico

- **Route separation:** l'estrazione delle sezioni in route proprie è
  tecnicamente diretta: i componenti esistono già. Il costo è nel routing
  (App Router `app/mappa/page.tsx`) e nello spostamento dello stato da
  `useState` a `useSearchParams` (Fase 4).
- **SSR dei filtri:** i query param permettono SSR dei filtri (la directory può
  renderizzare server-side con i filtri applicati), migliorando performance e
  SEO. Da coordinare con il data layer (`use-public-cameras.ts`).
- **Redirect anchor:** i vecchi `/#map`, `/#records` diventano 302 alle nuove
  route per preservare bookmark e link esterni.
- **Bundle splitting:** la mappa Leaflet è già lazy-loaded (`import("leaflet")`).
  Le nuove route non aumentano il bundle iniziale (la home semplificata carica
  meno JS).

### 9.2 Docs (Marie) — impatto documentazione

- **SITEMAP.md:** va aggiornato con le nuove route e la nuova nav.
- **PRODUCT_UX.md:** le user journey (Browse, Search, Submit, Correct) vanno
  riconciliate con le nuove route.
- **Guide page:** `/guide` va aggiornata per riflettere la nuova struttura
  (mappa e directory sono ora pagine separate, non sezioni della home).

### 9.3 QA (Grace) — impatto testing

- **Test esistenti:** `navigation-pages.test.mjs`, `pages-render.test.mjs`,
  `a11y-interactive.test.mjs` vanno estesi alle nuove route.
- **Redirect test:** verificare che i vecchi anchor facciano 302 alle nuove
  route.
- **Filter URL test:** verificare che i filtri in query param vengano
  applicati e condivisi correttamente.
- **Accessibilità per nuova route:** ogni nuova pagina tool deve passare il
  set di verifica (h1, skip link, focus, contrasto, keyboard).

---

## 10. Riepilogo delle decisioni di design

| # | Decisione | Motivazione |
|---|-----------|-------------|
| D1 | La home diventa hub, non tool | ridurre competizione attentionale, chiarire "dove sono" |
| D2 | 4 route tool separate: `/mappa`, `/directory`, `/segnala`, `/correggi` | deep-linking preciso, stato in URL, SEO |
| D3 | Stato filtri in query param | condivisibile, bookmarkable, SSR |
| D4 | Mappa e directory condividono gli stessi filtri | equivalenza map/list (principio PRODUCT_UX) |
| D5 | Empty state truthfull, mai "non esiste" | non sovrastimare la copertura (principio PRODUCT_UX) |
| D6 | Palette e tipografia consolidate, non cambiate | l'estetica civic-tech sobria funziona |
| D7 | Status dot sempre con label testuale | WCAG 1.4.1 (non solo colore) |
| D8 | Redirect 302 per i vecchi anchor | non rompere link esistenti |
| D9 | Migration in 4 fasi incrementali | non-breaking, testabile a ogni passo |
| D10 | Touch target ≥44px, zoom 200% a 320px | WCAG 2.2 AA, PRODUCT_UX acceptance |

---

## Appendice A: Mappa dei componenti → route target

| Componente (esistente) | Route attuale | Route target | Azione |
|------------------------|---------------|--------------|--------|
| `Hero` | `/` | `/` (hub) | conservare, semplificare CTA |
| `MapPanel` | `/` (#map) | `/mappa` | estrarre in `app/mappa/page.tsx` |
| `PublicDirectory` | `/` (#records) | `/directory` | estrarre in `app/directory/page.tsx` |
| `ReportForm` | `/` (#report) | `/segnala` | estrarre in `app/segnala/page.tsx` |
| `CorrectionForm` | `/` (#correction) | `/correggi` | estrarre in `app/correggi/page.tsx` |
| `SurveillanceMap` | dentro `MapPanel` | dentro `MapPanel` su `/mappa` | nessun cambiamento |
| `RecordCard` | directory + search | `/directory` + `/mappa` results | nessun cambiamento |
| `SiteHeader` | tutte | tutte | aggiornare link set |
| `SiteFooter` | root layout | root layout | aggiungere link ai 4 tool |
| `InfoPage` | pagine info | pagine info | nessun cambiamento |
| `LegalPage` | pagine legali | pagine legali | nessun cambiamento |
| `ModerationDashboard` | `/moderation` | `/moderation` | nessun cambiamento |

## Appendice B: Bundle i18n — nuovi/estesi

| Bundle | File | Nuove chiavi | Estensione |
|--------|------|--------------|------------|
| `home` | `app/lib/i18n/home.ts` | CTA hero → `/mappa`, `/segnala`; card tool (4); teaser mappa | estensione |
| `map` | `app/lib/i18n/map.ts` | title pagina, intro, eyebrow, nav, filtri (se non già presenti) | estensione |
| `directory` | nuovo `app/lib/i18n/directory.ts` | title, intro, eyebrow, nav, filtri label | nuovo (o in `home.ts`) |
| `report` | nuovo `app/lib/i18n/report.ts` | title, intro, eyebrow, nav | nuovo (o in `home.ts`) |
| `correction` | nuovo `app/lib/i18n/correction.ts` | title, intro, eyebrow, nav | nuovo (o in `home.ts`) |

**Raccomandazione:** preferire bundle separati (`directory.ts`, `report.ts`,
`correction.ts`) per mantenere `home.ts` focalizzato sulla home hub. La parità
EN/IT è type-checked in ogni file.
