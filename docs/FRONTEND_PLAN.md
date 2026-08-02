# Frontend plan — piano consolidato del refactor a pagine separate

Last reviewed: 2026-08-01
Status: **roadmap approvata** (consolidamento dei pareri CTO/QA/Backend/Security/Legal/Docs + visione design)

Questo documento è il **piano unico** del refactor del frontend verso pagine separate per
funzione. Consolida:

- **Visione di design**: [`docs/FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md) (Vera, t_c75d9b0e) —
  architettura pagine, design system, pattern filtri, stati, responsive, bilinguismo.
- **Parere CTO** (Ada, t_f24c3227): fattibilità, componenti, stato, routing, performance.
- **Parere Backend** (Linus, t_78bda96d): API, paginazione, filtri server-side, contratti, caching.
- **Parere QA** (Grace, t_8bc7f4e2): testabilità, criteri di accettazione, WCAG 2.2 AA, misura qualità.
- **Parere Security/Ops** (Ken, t_be8ce2fc): CSP, XSS/CSRF, privacy client, bundle, deploy LXC 114.
- **Parere Legal** (Rosa, t_286d9ced): contenuti obbligatori, consent, GDPR art. 13/14, gap.
- **Parere Docs/Content** (Marie, t_0067f1a5): contenuti per pagina, i18n EN/IT, microcopy, docs.

Il piano è la **roadmap del refactor**: ogni fase è un task kanban con assignee e priorità
(sezione 6) e ha criteri di accettazione verificabili (sezione 7).

---

## 1. Architettura delle pagine finale

### 1.1 Decisione di fondo (consenso di tutti i ruoli)

Il frontend è **già decomposto** (page.tsx a 130 righe, 5 componenti home; pagine informative
già route separate con `InfoPage`/`LegalPage`; i18n SSR per-dominio). Il **gap reale** è che i
quattro tool interattivi pubblici vivono ancora in `/` come sezioni anchor (`#map`, `#records`,
`#report`, `#correction`). Il refactor li **promuove a route proprie** e trasforma la home in
**hub di orientamento**. Non è un rewrite: è un'estrazione con riuso dei componenti esistenti.

Verdetto CTO: **FATTIBILE, basso rischio, allineato con l'implementazione attuale.**
Verdetto QA: approvabile come architettura di test. Verdetto Security: ok dentro lo stack attuale.
Verdetto Backend: richiede 4 interventi API minimi (sezione 3).

### 1.2 Route map target

Legenda: **[E]** esistente, **[N]** nuova.

| Route | Pagina | Contenuto | Nav header | Footer | Stato |
|-------|--------|-----------|:---:|:---:|-------|
| `/` | Home (hub) | Hero + teaser mappa **statico** + 4 card tool (Mappa, Directory, Segnala, Correggi) + principi sintetici | ✓ (brand) | ✓ | **[E]** — semplificare |
| `/mappa` | Mappa interattiva | Leaflet full-viewport, sidebar/pannello record, filtri (tipo+freshness) in URL, export, fallback testuale | ✓ | — | **[N]** |
| `/directory` | Directory testuale | Ricerca, filtri tipo/freshness, ordinamento, contatore, griglia RecordCard, empty state truthfull, paginazione | ✓ | ✓ | **[N]** |
| `/segnala` | Segnalazione | Form guidato (posizione mappa o coordinate manuali, campi minimi, foto, consent, reference ID) — privato pre-pubblicazione, `noindex` | ✓ | — | **[N]** |
| `/correggi` | Correzione/rimozione | Selezione record, tipo problema (inesatto/obsoleto/privacy/duplicato/altro), `?record=ID` precompilato, conferma | ✓ | — | **[N]** |
| `/records/[id]` | Dettaglio record | Scheda pubblica + gallery foto + storia revisioni + link a correggi | contestuale | — | **[E]** |
| `/guide` `/manifesto` `/regole` `/moderazione` `/privacy` `/termini` `/licenze` `/faq` `/contatti` | Pagine informative | Invariate (pattern `InfoPage`/`LegalPage`) | per-pagina | ✓ | **[E]** |
| `/moderation` `/account` `/login` `/register` | Tool privati | Invariati (`requireRole`, mai in nav pubblica) | — | — | **[E]** |

Correzioni tecniche CTO alla visione di Vera (vincolanti):

1. **D8 redirect anchor → client-side.** Il fragment `#map` non arriva mai al server: i 302 non
   funzionano. Serve `LegacyAnchorRedirect` (componente client, on mount legge `location.hash` →
   `router.replace()`). Progressive enhancement, gli anchor restano funzionali fino a Fase 3.
2. **D3 "SSR-renderable" → solo shell.** La lista filtrata resta client-side finché l'API non ha
   filtri server-side (dominio Backend, F0). Il piano promette URL condivisibile/bookmarkable, non
   SSR della lista risultato prima di quel gate.
3. **Soglia clustering marker**: >~1500 marker su `/mappa` → `leaflet.markercluster` o `L.canvas()`.
   A volumi attuali (centinaia) il layer attuale va bene; soglia come acceptance di performance.

### 1.3 Navigazione

- **Header condiviso** (`PublicNav`, t_a72a3106): tutte le pagine pubbliche
  (home, tool, info, legal) hanno lo STESSO header — i sei link della home
  con la pagina corrente marcata `aria-current="page"`. Il set per-pagina
  ridotto delle tool (4 link) è stato rimosso (CEO check 2026-08-02).
- **Footer globale** (root layout): aggiungere i link ai 4 tool pubblici accanto ai link
  istituzionali. Da aggiungere anche il link all'accessibility statement (G2 Legal).
- **Route group**: `app/(tools)/{mappa,directory,segnala,correggi}/page.tsx` +
  `app/(tools)/layout.tsx` (URL puliti, layout condiviso, niente duplicazione ToolLayout).
- **Slug**: `/mappa`, `/segnala`, `/correggi` coerenti con convenzione italiana; `/directory` in
  inglese (precedente: `/guide`). Va documentato in SITEMAP.md prima dell'implementazione
  (regola già esistente: nuove route listate prima del codice).
- **SEO**: `robots: noindex` su `/segnala` e `/correggi` (form). `/directory` è l'unica pagina
  con valore SEO reale; `/mappa` client-heavy (shell SSR ok).

---

## 2. Design system

### 2.1 Principi (Vera, confermati da tutti)

Chiarezza, fiducia, sobrietà civic-tech (modello OpenStreetMap/Wikidata, non dashboard di
security). **Palette e tipografia consolidate dall'esistente, non cambiate** (D6). Niente
animazioni decorative, niente gradienti aggressivi. Design token layer esplicito in `:root`.

### 2.2 Palette (token esistenti, contrasto verificato)

| Token | Valore | Uso | AA |
|-------|--------|-----|:---:|
| `--ink` | `#102332` | testo principale | ✓ AAA (~14.5:1) |
| `--muted` | `#60727f` | testo secondario | ✓ AA (~4.6:1) |
| `--paper` | `#f5f3ec` | sfondo pagina | — |
| `--line` | `#d8ddd6` | bordi/separatori | — |
| `--navy` / `--navy-2` | `#09233a` / `#123b55` | hero, sfondi scuri | ✓ (testo hero ≥4.5:1 verificato) |
| `--mint` / `--lime` | `#cbf7da` / `#94e8a5` | primary bg / success | — |
| `--amber` / `--coral` | `#f8b84e` / `#e87b67` | warning / error | ⚠ solo dot + label |
| `--focus` | `#0b705c` | focus ring | ✓ AA (~4.8:1) |
| status dots | `#42a979` / `#d3963e` / `#d8715e` | verified / community / review | ⚠ sempre con label |

**Regola critica (D7, WCAG 1.4.1):** gli status dot non trasmettono mai informazioni da soli —
sempre abbinati a `publicStatusLabel`. Il colore è ridondante, non esclusivo.

**Vincolo QA:** i token colore con contrasto AA vanno resi **un test automatico** (check nel test,
non solo dichiarazione) + lint che vieta colori hardcoded nei componenti.

### 2.3 Tipografia e spaziature

- Famiglia Arial/Helvetica/sans-serif (già in `body`); possibile upgrade a system font stack.
- Scala tipografica esistente consolidata (hero clamp(48px,6vw,82px) → label 10px, pesi 800 vs 400).
- Spaziature 4px-based esplicite (`--space-1..24`), contenitori: standard `min(1180px, ...)`,
  leggibile `min(760px, ...)`, largo `min(1320px, ...)`.

### 2.4 Componenti

**4 nuovi (CTO):**

| Componente | Scopo | Note |
|------------|-------|------|
| `FiltersBar` | ricerca + kind + freshness + sort + reset + contatore risultati | estratto da `PublicDirectory`, condiviso `/mappa` ↔ `/directory` (D4), prop `variant` |
| `EmptyState` | stato vuoto truthfull | oggi solo classe CSS `.empty-state` |
| `MapTeaser` | anteprima **statica** mappa per home hub | nessuna istanza Leaflet sulla home (niente doppio mount, zero JS mappa) |
| `ToolLayout` | layout condiviso route group `(tools)` | header contestuale + main |

**Riusati as-is (nessun rewrite):** `MapPanel`, `SurveillanceMap`, `PublicDirectory` (ridotto),
`ReportForm`/`useReportFlow`, `CorrectionForm`, `RecordCard`, `SiteHeader`, `SiteFooter`,
`InfoPage`, `LegalPage`.

### 2.5 Pattern filtri (D4 — identici mappa e directory)

| Filtro | Controllo | Valori | Query param |
|--------|-----------|--------|-------------|
| Ricerca testuale | `<input type="search">` | testo libero | `?q=` |
| Tipo camera | `<select>` | `all` + tipi dinamici (whitelist) | `?type=` |
| Freshness | `<select>` | `all`, `7d`, `30d`, `90d` | `?freshness=` |
| Ordinamento | `<select>` | `alphabetical`, `position` | `?sort=` |
| Ricerca per luogo | input + submit | testo/coordinate | `?place=` |
| Reset | `<button>` | rimuove tutti i params | sempre visibile |

UX: feedback immediato (contatore `role="status"`, niente bottone "applica"), reset sempre
disponibile, empty state truthfull ("Nessun record pubblicato trovato" + reset + link a `/segnala`),
annuncio AT con `aria-live="polite"`. **Solo filtri a basso rischio** (tipo, freshness,
ordinamento) — mai stato/produttore/dati sensibili (principio PRODUCT_UX).

---

## 3. Requisiti API / backend per pagina

### 3.1 Stato verificato su main (HEAD 950e8b2)

- `GET /api/cameras` — **già paginata** (`{records, total, nextOffset}`, PR #149) con filtri
  `kind` (match esatto) e `freshness` (su colonna `updated`) lato server, export CSV/GeoJSON.
  **Cache-Control JSON oggi `no-store`** → da cambiare.
- `GET /api/cameras/search` (geocode Nominatim + cache, `no-store`), `nearby` (cap 8 interno),
  `revisions` (solo pubblici), `photos`/`photos/[id]` (approved+redacted only), tiles proxy, locale.
- Auth (`register/login/logout/me/me/submissions/account`), `POST /api/cameras`, `/api/photos`,
  `/api/corrections`, moderazione + appeals (edge-gated).
- Data layer client `use-public-cameras.ts`: **eccellente, da NON toccare** (CTO). Walk paginati
  condivisi, cache a modulo, abort sul last consumer.

### 3.2 Interventi backend mancanti (F0 — Linus, P1)

Ordinati per priorità:

1. **`GET /api/cameras/[id]`** — manca del tutto. Oggi `/records/[id]` fa `find()` client-side sul
   walk completo; con la paginazione server-side questo pattern si rompe. Serve lo stesso public
   predicate, stesso rounding coordinate (~10 m, ADR 0008), 404 fail-closed per non-pubblici.
2. **Facets/metadati** — `kinds` distinti + conteggi kind/freshness oggi derivati client-side
   dall'intera lista; con la paginazione non più calcolabili. Facets inline nella risposta list
   (una sola round-trip) o `GET /api/cameras/meta` cached.
3. **Paginazione su `search` e `nearby`** — stessa shape `pagination` della list
   (`page`/`pageSize` default 25 cap 100, `total`, `totalPages`, `hasMore`). Nearby default 50.
4. **Cache-Control su JSON list + export** — `public, s-maxage=300, stale-while-revalidate=600`
   (list e GeoJSON/bbox); export `s-maxage=3600`; `search` resta `no-store`; facets/meta `s-maxage=300`.
5. **Indici compositi** — `(status, updated DESC)` per freshness e `(status, kind)` per kind.
   Eliminare il `GLOB` anti-label-non-ISO su `updated` (blocca l'uso dell'indice) normalizzando i
   valori non-ISO a `NULL`/data; aggiornare il test che lo copre.
6. **Semantica freshness** — decisione di dominio: `updated` (attuale) vs `last_verified_at`.
   Probabilmente `last_verified_at` è quella giusta; va decisa prima di F4.
7. **Moderation queue** — paginazione/filtri (entity, stato, sensitivity) quando la coda cresce.
   Non bloccante per il refactor pubblico.

### 3.3 Decisione filtri (Linus, condivisa da CTO)

**Server-side, senza discussione.** Con lista paginata nessun filtro può essere applicato
client-side al dataset completo. Il client traduce i filtri UI in query params. Resta client-side
solo: ordinamento della pagina corrente, toggle vista, evidenziazione selezionata.

**Mappa disaccoppiata dalla lista paginata**: la mappa ha bisogno di tutti i punti (o del bbox
visibile), non della pagina 1. `GET /api/cameras?bbox=...&format=geojson` per i marker (esiste già
il GeoJSON, basta aggiungere `bbox` + cache), lista paginata per la tabella/directory.

### 3.4 Contratti dati proposti (Linus)

**Lista paginata + facets:**
```json
GET /api/cameras?kind=fixed-dome&freshness=30d&page=1&pageSize=25
{
  "records": [ { "id": 42, "title": "…", "kind": "…", "manufacturer": "…|null",
    "observedOn": "ISO|null", "address": "…|null", "latitude": 41.9004, "longitude": 12.4936,
    "status": "verified", "source": "…", "updated": "ISO", "description": "…",
    "lastVerifiedAt": "ISO|null", "reviewDueAt": "ISO|null" } ],
  "pagination": { "page": 1, "pageSize": 25, "total": 512, "totalPages": 21, "hasMore": true },
  "facets": { "kinds": [ { "kind": "Fixed dome", "count": 210 } ],
    "freshness": { "7d": 12, "30d": 64, "90d": 130, "all": 512 } }
}
```

**Dettaglio record:** `GET /api/cameras/[id]` → `{ record: {...} }` (404 non-pubblici) + 2 chiamate
esistenti (`/api/photos?cameraId=N`, `/api/cameras/revisions?cameraId=N`).

**Vincoli non negoziabili** (valgono per ogni superficie nuova): mai `notes`/storage key,
rounding coordinate ~10 m, public predicate condivisa, 404 fail-closed, moderazione edge-gated,
envelope errori `{error}` uniforme.

---

## 4. Requisiti security / privacy / legal

### 4.1 Security (Ken — vincoli architetturali)

1. **Stack: mantenere vinext RSC + worker edge. NIENTE static export** — perderebbe header
   edge (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy), moderation gate, identity
   stripping (ADR 0014), API routes e SSR i18n. Deploy LXC 114 invariato (vinext dev).
2. **CSP/header** già solidi nel worker (`SECURITY_HEADERS`): preservare e mantenere come guardia
   CI. `script-src 'unsafe-inline'` richiesto dal bootstrap RSC (documentato); futuro: nonce/hash.
3. **XSS**: zero `dangerouslySetInnerHTML` (grep pulito oggi — regola per il refactor: mai),
   validazione server-side su ogni input (trim + maxLength da `input-limits.ts`, `kind` whitelist,
   redirect protetto anti open-redirect).
4. **CSRF**: riusare la tripla difesa esistente (`app/lib/csrf.ts`) su ogni nuova mutazione:
   cookie `HttpOnly; SameSite=Strict` + same-origin + `X-CSRF-Token`.
5. **Data exposure fail-closed**: mai fetch di endpoint `pending` dal client, mai dati moderatore
   nel bundle. I test `publication-boundaries` e `worker-edge` restano guardie CI.
6. **Cookie lingua**: OK (preferenza non-profilante, SameSite=Lax, 1 anno) — **da documentare in
   `/privacy`** (gap legale G1, si veda 4.3).

### 4.2 Privacy client (Ken)

- Zero tracking: `connect-src 'self'` lo rende tecnicamente impossibile. Da evitare: beacon,
  fingerprinting, font/CDN esterni.
- Foto: mantenere EXIF/XMP/IPPT/GPS stripping fail-closed, cap 4096px/10MiB, width whitelist
  (anti-DoS), immutable caching.
- Performance: mantenere code-split Leaflet; lazy-load bundle IT; misurare con `vite build`.

### 4.3 Legal (Rosa — check-list redesign)

**Preservare** (già conforme): footer globale con tutte le pagine legali; link al punto d'uso
(art. 13(1)); pagine legali bilingui con versionNote; checkbox report `required` non pre-spuntata
(attestazione di conformità, base 6(1)(f) — NON consenso GDPR, registro "confermo/dichiaro" mai
"acconsento"); delete account in `/account`; `/contatti` mailto + form correzioni per la
cancellazione (art. 15-22, ≤2 click, 1 mese dichiarato).

**Fix obbligatori (GAP):**
- **G1 — Sezione cookie** in `/privacy` (elenco, finalità, durata, natura funzionale del solo
  cookie `opensurveillancedb-locale`, impegno: se il redesign introduce cookie non necessari →
  banner di consenso obbligatorio, art. 122 D.Lgs. 196/2003). Oggi nessun banner richiesto.
- **G2 — Accessibility statement** linkato nel footer (buona pratica D.Lgs. 106/2018).
- **G3 — Conferma redazione foto**: checkbox condizionale quando `photos.length > 0`
  ("Ho oscurato volti e targhe") per accountability art. 5(2). Non bloccare il report senza foto.

**Raccomandati:**
- **Mini-informativa art. 13** di 2-3 righe accanto alle checkbox di report/correzioni/register
  (titolare, base 6(1)(f), link /privacy, diritti 15-22, contatto privacy@opensurveillancedb.org).
- [x] **Mailbox privacy attiva**: `privacy@opensurveillancedb.org` (ADR 0008) —
  bloccante pre-lancio risolto.

---

## 5. Requisiti i18n e accessibilità

### 5.1 i18n (Marie + stato verificato)

- **Struttura: mantenere i bundle per-dominio** (14 file, PR #80). Il mapping concettuale
  (home/directory/report/moderation/auth/info/legal) va **documentato come tabella** in
  SITEMAP.md + REFACTOR_I18N.md — NON creare bundle "info"/"legal" unici (ricreerebbero il
  monolite). Legal resta nel layer tipato separato `app/lib/legal/`.
- Nuove route: bundle dedicati `map.ts` (esteso), `directory.ts`, `report.ts`, `correction.ts`
  con parità `Translation<typeof en>` type-checked.
- **Fix traduzioni IT obbligatori** (bug reali in `auth.ts`): `loggedOutTitle` e
  `accountDeletedBody` dicono "accesso" invece di "logout"; `createOne` = "Crealo" → "Crea un
  account". Serve review umana di tutte le traduzioni IT (parità strutturale ≠ semantica).
- **Rimuovere gergo interno dalle stringhe utente**: RETENTION_SCHEDULE R7, GOVERNANCE.md,
  MODERATION_SLA, "(Wave A pilot boundary)" → solo significato in parole.
- **Stato offline mancante** in tutti i bundle (grep 0 hit): aggiungere "Sei offline: mostriamo
  gli ultimi record caricati" per map/directory/record.
- **Microcopy**: standardizzare il set di stati {loading, empty, not-found, error, offline} con
  titolo + body + azione di recupero; conferme moderation "Decisione salvata" + riepilogo;
  aria-live sugli esiti async (ricerca, upload, invio); pattern errori API uniforme.

### 5.2 Accessibilità (Grace — WCAG 2.2 AA)

**Baseline già presente da preservare**: skip link, focus visible `outline:3px solid #0b705c`,
landmark, un h1 per pagina, reduced-motion, sr-only, alternativa testuale mappa, status non solo
colore, controlli nativi keyboard-friendly.

**Da rafforzare nel refactor**:
- Focus management tra route (da `/directory` a `/mappa?focus=ID` → focus al record).
- Annuncio cambio pagina (h1 come announce point per ogni nuova route).
- Filtri in URL: focus sul contatore risultati o aria-live.
- Touch target ≥44px, zoom 200% a 320px senza scroll orizzontale, text spacing.
- **Gap noti da chiudere** (prerequisiti): QA-2026-08-01-2 (aria-invalid sui form),
  QA-2026-08-01-3 (aria-current sulla nav attiva).
- Mappa keyboard-complete: la directory testuale è il piano B e va resa **equivalente** per
  filtri/campi/ordinamento (equivalenza definita come criterio testabile).

### 5.3 Testabilità (Grace)

- `page.tsx` sottile; logica in `app/components/<area>/`; ogni nuovo componente "use client"
  registrato nel `PAGES` list di `tests/helpers/dom-harness.mjs` (contratto di isolamento).
- Per ogni nuova route: SSR smoke (`pages-render.test.mjs`), interaction test (jsdom +
  @testing-library), **stato URL test** (parse/stringify/encoding/fallback invalidi → mai 500/
  deep-link/back-forward — estendere lo stub di `next/navigation`), i18n parity (`i18n-pages.test.mjs`).
- **Criterio di approve**: route nuova senza (a) SSR smoke, (b) interaction test, (c) i18n parity,
  (d) a11y contract → QA negata.
- **Misura qualità**: axe-core audit in jsdom su ogni nuova route (0 violazioni critiche/serie);
  Lighthouse CI accessibility ≥ 0.95 bloccante; e2e miniflare estesi (browse→filtri→record,
  segnala→submit→coda, login→account); coverage per route; errori console = 0; contrast ratio
  verificati sui token.
- **Regola per fase**: ogni fase mantiene verdi i test esistenti (pages-render,
  navigation-pages, a11y-interactive puntano alle sezioni anchor attuali → vanno aggiornati
  NELLA stessa fase, non dopo).

---

## 6. Piano di implementazione a fasi

**Vincolo CTO: una PR per fase, CI verde, review Ada + approve QA. F4 ultima** (è l'unica fase
che cambia comportamento). Stima: 1-2 giorni/fase, 1-2 sprint totale. Zero librerie nuove (no
state lib; clustering solo oltre soglia).

| Fase | Contenuto | Task kanban | Assignee | Priorità | Dipende da |
|------|-----------|-------------|----------|:---:|------------|
| **F0** | Backend prereq: `GET /api/cameras/[id]`, facets, paginazione search/nearby, Cache-Control, indici compositi, drop GLOB, decisione freshness | `t_a4dbd3cc` | linus | 1 | — |
| **F1** | Route tool separate: route group `(tools)` + `/mappa` `/directory` `/segnala` `/correggi` + ToolLayout + estrazione componenti + FiltersBar/EmptyState + test | `t_03c0fa15` | linus | 1 | — |
| **F2** | Home hub: MapTeaser statico + card tool + usePublicCount | `t_52dcb95e` | linus | 2 | F1 |
| **F3** | Navigazione: header/footer link set + LegacyAnchorRedirect client-side | `t_2ca69725` | linus | 2 | F1 |
| **F4** | Stato filtri in URL: `useCameraFilters` + Suspense boundary + noindex segnala/correggi + contratto URL test | `t_522638a5` | linus | 3 | F0, F1 |
| **F-i18n** | Fix traduzioni IT (auth.ts), rimozione gergo, stato offline, pattern microcopy | `t_fad419d6` | marie | 1 | — |
| **F-legal** | Fix G1/G2/G3: sezione cookie, a11y statement nel footer, conferma redazione foto + mini-informativa art. 13 | `t_2bef9ebb` | linus (testi: rosa) | 2 | F-legal-copy |
| **F-legal-copy** | Testi legali: sezione cookie, mini-informativa, wording conferme | `t_547b21d8` | rosa | 2 | — |
| **F-docs** | Aggiornare SITEMAP.md (route + mapping concettuale), PRODUCT_UX.md, REFACTOR_I18N.md, /guide | `t_14f6a638` | marie | 2 | F1 |
| **F-QA** | QA trasversale: contratti URL test, axe-core audit, gap aria-invalid/aria-current, criteri per fase | `t_7b716c97` | grace | 2 | — |

Ordine consigliato di dispatch: F0 + F1 + F-i18n in parallelo → F2/F3 dopo F1 →
F4 dopo F0+F1 → F-legal dopo F-legal-copy → F-QA trasversale dalla F1 in poi.

---

## 7. Criteri di accettazione

### 7.1 Criteri globali (bloccanti per ogni fase)

1. **CI verde 5/5** (lint, test, coverage, build, security) su ogni PR di fase.
2. **Test esistenti aggiornati nella stessa fase** (pages-render, navigation-pages,
   a11y-interactive, i18n-pages) — nessuna fase li lascia rossi.
3. **Route nuova = 4 test obbligatori**: SSR smoke, interaction, i18n parity, a11y contract
   (QA negata se manca uno).
4. **Zero regressioni a11y**: axe-core 0 violazioni critiche/serie; Lighthouse a11y ≥ 0.95.
5. **Vincoli security**: nessun `dangerouslySetInnerHTML`, nessun fetch pending, CSP/header
   invariati, test `publication-boundaries` + `worker-edge` verdi.
6. **Mai dati sensibili nel DOM pubblico** (notes, storage key, moderatore, pending).
7. **Review CTO (Ada) + approve QA (Grace) prima del merge** (unico merge: Ada).

### 7.2 Criteri per pagina

| Pagina | Criteri di accettazione |
|--------|--------------------------|
| **Home (hub)** | Funziona senza JS e senza fetch client (SSR puro); hero + MapTeaser statico + 4 card tool; nessuna istanza Leaflet sulla home; stat record via `usePublicCount` (1 fetch) |
| **/mappa** | Regione mappa focusabile via tastiera con alternativa testuale sempre disponibile; marker click → record; filtri cambiano mappa E directory insieme; empty state esplicito (mai mappa muta); errore API → messaggio + retry, mai crash; soglia >~1500 marker → clustering; URL `?type=&freshness=&lat=&lng=&z=` condivisibile |
| **/directory** | Stessi filtri della mappa (un solo pattern da testare); URL condivisibile che ricostruisce lo stato; risultati mostrano source type + status + last verification (criterio trust PRODUCT_UX); empty state truthfull; paginazione non rotta da filtri combinati; contatore risultati aria-live |
| **/segnala** | Campi obbligatori validati; coordinate valide; limiti input; errori inline con aria-invalid/aria-describedby; errori server (429/403) in role=alert; submit disabilitato durante pending; conferma "ricevuta, nessuna promessa di pubblicazione"; **nessun dato form nei query param**; noindex |
| **/correggi** | `?record=ID` precompila il record annunciato (aria-live); conferma ricevuta; rate limiting; errori in alert; noindex; anonimo (403/redirect) e autenticato coperti nei test |
| **/records/[id]** | Fetch via `GET /api/cameras/[id]` (non find client-side); 404 fail-closed; gallery + revisions |
| **Moderazione** | Guard role → 403 non-moderatori; queue vuota → empty state; aria-live su aggiornamenti; focus management; paginazione quando la coda cresce |
| **Account** | Form validati; 409/401/429 localizzati in alert; redirect post-login; SOLO dati propri; autocomplete email/password (WCAG 1.3.5); delete account con conferma distruttiva |
| **Info** | h1 unico, landmark, skip link, lang SSR corretto, focus visibile, i18n parity, nessun contenuto sensibile |

### 7.3 Criteri trasversali

- **Legal**: sezione cookie in /privacy (G1), accessibility statement linkato nel footer (G2),
  conferma redazione foto condizionale (G3), mini-informativa art. 13 nei form. Bloccante
  pre-lancio risolto: mailbox privacy@opensurveillancedb.org attiva.
- **i18n**: parità EN/IT type-checked su ogni nuovo bundle; bug traduzione IT (loggedOutTitle,
  accountDeletedBody, createOne) chiusi; zero gergo interno; stato offline presente.
- **Performance**: `/directory` non carica Leaflet; hub carica meno JS di oggi; bundle IT
  lazy-loadato; LCP/CLS/INP misurati sui core journeys (informativi per alpha).
- **Docs**: SITEMAP.md aggiornato (route + mapping concettuale) come parte della PR di F1/F3;
  PRODUCT_UX.md e REFACTOR_I18N.md allineati; /guide riflette la nuova struttura.

---

## Appendice: tracciabilità dei pareri

| Sezione del piano | Fonte primaria |
|-------------------|----------------|
| Architettura pagine | Vera (FRONTEND_DESIGN.md) + correzioni Ada |
| Design system | Vera (FRONTEND_DESIGN.md) + vincoli Grace |
| API/backend | Linus (t_78bda96d) + verifica su main |
| Security/ops | Ken (t_be8ce2fc) |
| Legal | Rosa (t_286d9ced, PARERE_LEGAL_FRONTEND.md) |
| i18n/content | Marie (t_0067f1a5) |
| A11y/testabilità | Grace (t_8bc7f4e2) |
| Fasi e rischi | Ada (t_f24c3227) + Grace (sequencing QA) |
