# Design audit — conformità `FRONTEND_DESIGN.md` vs codice

**Autore:** Vera (Designer UX/UI)
**Data:** 2026-08-02
**Commit audito:** `200f415` (main, `fix(map): /api/geocode autocomplete never fired` #212)
**Documenti di riferimento:** `docs/FRONTEND_DESIGN.md` (visione/design system),
`docs/SITEMAP.md` (IA implementata), `app/globals.css` (unico foglio di stile)

## Metodo

Audit mista:

1. **Codice** — lettura integrale di `app/globals.css` (540 righe, unico CSS),
   21 `page.tsx`, 42 file in `app/components/` e dei bundle i18n.
2. **Rendering reale** — server dev locale (`vinext dev`), verifica dei
   computed style via browser su: `/`, `/mappa`, `/directory`, `/segnala`,
   `/manifesto`, `/records/1`, 404, plus geocode dropdown e marker popup
   (interazione reale). Nota: in dev l'API D1 non era migrata (`no such
   table: cameras`), quindi le pagine hanno usato il seed demo/fallback —
   comportamento di fallback conforme a FRONTEND_DESIGN §5.2–5.3.
3. **Contrasti** — ratio calcolati (WCAG 2.x, formula relativa) per tutte le
   coppie colore testo/sfondo rilevanti.

---

## 1. Sintesi esecutiva

Lo stato implementato è **molto avanti rispetto al documento**: F1–F4 e la
home hub (F2) sono completi, la nav condivisa a 6 link (t_a72a3106) è
implementata ovunque, i bundle i18n separati (`directory.ts`, `report.ts`,
`correction.ts`) esistono come raccomandato nell'Appendice B, il footer
include i 4 tool. **Ma il documento non è stato aggiornato dopo i task
mappa/community/error-pages**: 29 dei 42 componenti non sono documentati,
la sezione token/tipografia descrive valori che il CSS non applica, e 6
classi usate dal codice non esistono nel CSS.

### Gap prioritari (P1 — visibili all'utente)

| # | Gap | Evidenza |
|---|-----|----------|
| G1 | **Le pagine tool non hanno un titolo di pagina stilizzato.** `h1` di `/directory`, `/segnala`, `/correggi` renderizza a **16px/400** (testo indistinguibile dal body) perché `.tool-heading`/`.tool-section` sono usati ma **mai definiti nel CSS** (mai esistiti in alcun commit). Su `/segnala`: h1=16px vs h2 della sezione=51px. | rendering reale + `git log -S .tool-heading` vuoto |
| G2 | **Status dot `demo` invisibile.** Gli unici record pubblici (demo) renderizzano `status-dot demo` con `background: transparent` (nessuna regola `.status-dot.demo`). Colpisce card directory, risultati place-search, popup mappa, account. Il testo resta (WCAG 1.4.1 ok) ma l'affordance visiva è persa. | computed style: `rgba(0,0,0,0)` |
| G3 | **Pesi tipografici dei titoli non applicati.** Nessun `font-weight` su h1/h2/h3: hero h1, record h1, section h2, card h3 renderizzano tutti a **400** (preflight Tailwind azzera i pesi). La scala documentata (800/700) è disattivata → gerarchia visiva piatta. | computed style su `/`, `/manifesto` |
| G4 | **Body: 16px/1.5, non 15px/1.6.** Nessuna regola `font-size`/`line-height` su `body` in globals.css; vale il default preflight (16px/1.5). La tabella tipografica §3.3 è sbagliata sul body. | computed style |
| G5 | **5 token dichiarati non esistono; 5 token definiti non sono mai usati.** Mancano `--focus`, `--status-verified`, `--status-community`, `--status-review` (il focus `#0b705c` è hardcodato 24 volte, `var(--focus)` mai usato). Inutilizzati: `--muted`, `--navy-2`, `--lime`, `--coral`, `--sand` (0 usi). La scala `--space-*` (§3.4) non esiste. | grep token in `:root` + conteggio usi |

### Gap secondari (P2/P3) — elenco completo nelle sezioni seguenti

- P2: `.status-dot.pending` usato in 7 componenti moderation → dot invisibile.
- P2: contrasto sotto soglia AA su 5 coppie di testo piccolo (loading-note,
  map-list-count, footer-legal, geocode-attribution, geocode-option-type).
- P2: `--muted` su paper = 4.49:1 (il doc dichiara ~4.6 "✓ AA"; è 0.01 sotto).
- P2: `LegacyAnchorRedirect` è client-side `router.replace`, non 302 (D8 e
  §2.6/§9.1 descrivono 302; un fragment non arriva mai al server — correzione
  CTO già applicata nel codice, documento non aggiornato).
- P2: doc §2.3/§7.2 prescrivono "bottom-sheet" su mobile mappa; implementato
  un **pannello sopra la mappa** (38vh scrollabile, breakpoint 768px).
- P3: breakpoint 480px e 768px non documentati (doc: solo 700/980).
- P3: container `.map-layout` = `min(1440px, calc(100% - 32px))` non
  documentato (doc: largo = 1320px).
- P3: 6 classi no-op usate ma mai definite (vedi §6).
- P3: empty state directory senza il link a `/segnala` previsto da §5.1.
- P3: error pages (404/500) con header ridotto (1 link) — eccezione alla
  regola "6 link ovunque" non documentata in §2.5.
- P3: tocchi < 44px su `locale-toggle` (~25px) e `filter-chip` (36px) —
  la verifica "✓" di §6.2 non regge; WCAG 2.5.8 (24px) comunque rispettata.

---

## 2. Audit pagina per pagina

Legenda stato: ✅ conforme · ⚠ divergenza minore · ❌ divergenza visibile
**Doc** = sezione di FRONTEND_DESIGN.md di riferimento.

| Pagina | Stato | Rilievi |
|--------|:---:|---------|
| `/` home hub (§2.4, D1) | ✅/⚠ | Hero+MapTeaser+ToolCards+principi: conforme. ⚠ hero h1 weight 400 (G3); CTA hero → `/mappa` e `/segnala` ✓; zero Leaflet sulla home ✓ (MapTeaser statico, non `SurveillanceMap` come scritto in §3.5). |
| `/mappa` (§2.3) | ⚠ | Struttura integrata conforme (banner compatto, FiltersBar agganciata, split sidebar+map, export). h1 sr-only = decisione documentata (t_11e38eab). ⚠ `.prototype-banner-compact` mai definita; ⚠ container 1440px non documentato; ❌ componenti sidebar/geocode/popup non documentati (G6); layout mobile "panel sopra" ≠ "bottom-sheet" doc. |
| `/directory` (§2.3) | ❌ | ❌ h1 tool-heading 16px (G1); ⚠ h1 e h2 della sezione duplicano titolo+intro (due "ACCESSIBLE DIRECTORY" e due testi quasi identici); ✅ filtri in URL (F4/D3), contatore `role=status`, RecordCard condivisa; ⚠ empty state senza link `/segnala` (§5.1); ❌ status dot demo invisibile (G2). |
| `/segnala` (§2.3) | ❌ | ❌ h1 16px (G1); ✅ deep-link `?lat=&lng=` dal pick popup (t_6abb96ac), noindex, form guidato, coordinate manuali, duplicate alert, foto. |
| `/correggi` (§2.3) | ❌ | ❌ h1 16px (G1); ✅ `?record=ID` prefill + aria-live, noindex. |
| `/records/[id]` (§2.2) | ⚠ | ✅ header contestuale (`nav-record-actions`), 404 per id malformato (t_7eed4601); ⚠ record h1 weight 400 vs 700 (G3); ✅ verification widget + history; in dev l'API non era migrata → stato "Could not load" con retry (fallback corretto §5.3). |
| Pagine info `/manifesto` `/regole` `/guide` `/faq` `/contatti` `/moderazione` `/accessibility` (§2.2) | ⚠ | ✅ InfoPage/LegalPage con PublicNav 6 link + aria-current; ⚠ h1 weight 400 (G3); FAQ disclosure conforme. |
| Pagine legali `/privacy` `/termini` `/licenze` | ⚠ | ✅ LegalPage con tabelle/note; ⚠ pesi h2 (G3). |
| 404/500 (`not-found.tsx`/`error.tsx`) | ⚠ | ✅ shell ErrorPage condivisa, nessun leak del path/errore; ⚠ non documentato in FRONTEND_DESIGN (nessuna menzione error pages); ⚠ header ridotto (solo "Back to homepage"), eccezione alla regola 6-link non registrata. |
| `/account` `/login` `/register` | ⚠ | ✅ header contestuale (come da §2.5 "pagine funzionali"); ⚠ LevelBadge/contributions/ConfirmDialog non documentati (G6). |
| `/moderation` (privato) | ⚠ | ✅ dashboard per sezioni con `QueueSection`; ❌ `.status-dot.pending` mai definita → dot invisibili in tutte le sezioni coda/storico (P2). |

Footer globale: ✅ link ai 4 tool + istituzionali, licenza ODbL, attribuzione
OSM (conforme §2.5). Header: ✅ stesso `PublicNav` 6 link su tutte le pagine
pubbliche con `aria-current="page"` (t_a72a3106, coerente con §2.5).

---

## 3. Token: dichiarati vs definiti vs usati

Fonte: `:root` riga 3 di globals.css; doc §3.2/§3.4.

| Token | In doc §3.2 | In `:root` | Usi `var()` | Esito |
|-------|:---:|:---:|:---:|-------|
| `--ink` | ✓ | ✓ | 4 | ✅ |
| `--muted` | ✓ | ✓ | **0** | ⚠ definito mai usato (i grigi sono hardcodati: `#60737d`, `#5e707a`…) |
| `--paper` | ✓ | ✓ | 2 | ✅ |
| `--line` | ✓ | ✓ | 25 | ✅ |
| `--navy` | ✓ | ✓ | 1 | ✅ |
| `--navy-2` | ✓ | ✓ | **0** | ⚠ morto |
| `--mint` | ✓ | ✓ | 3 | ✅ |
| `--lime` | ✓ | ✓ | **0** | ⚠ morto |
| `--amber` | ✓ | ✓ | 2 | ✅ |
| `--coral` | ✓ | ✓ | **0** | ⚠ morto |
| `--sand` | ✓ | ✓ | **0** | ⚠ morto |
| `--focus` | ✓ | **✗** | 0 | ❌ `#0b705c` hardcodato 24 volte, `var(--focus)` mai usato |
| `--status-verified` | ✓ | **✗** | 0 | ❌ solo classi `.verified` (hardcoded) |
| `--status-community` | ✓ | **✗** | 0 | ❌ idem |
| `--status-review` | ✓ | **✗** | 0 | ❌ idem |
| `--space-1…24` (§3.4) | ✓ (aspirazionale) | **✗** | 0 | ❌ la scala non esiste; padding/spacing sono ~60 valori ad hoc |

Nota: §3.4 del doc è formulata come "consolidare in una scala esplicita" ma
la tabella 3.4 la presenta come consolidata; nel codice non c'è nulla.
`border-radius` reale: 15 valori distinti (4,6,7,8,9,10,12,14,16,18,22,99,
999px, 50%) — nessun token radius.

---

## 4. Tipografia: scala dichiarata vs reale (computed style)

Fonte doc §3.3; valori rilevati a 1280px di viewport (dev server, Arial).

| Ruolo | Doc | Reale | Esito |
|-------|-----|-------|:---:|
| Body | 15px / 1.6 / 400 | **16px / 1.5 / 400** (default preflight) | ❌ G4 |
| Hero h1 | clamp(48,6vw,82) / .96 / **800** / -.075em | 76.8px / .96 / **400** / -.075em | ❌ G3 |
| Record h1 | clamp(42,6vw,70) / .96 / **700** / -.07em | 70px / .96 / **400** / -.07em | ❌ G3 |
| Section h2 | clamp(34,4vw,53) / 1 / **800** / -.065em | 51.2px / 1 / **400** / -.065em | ❌ G3 |
| Legal h2 | clamp(23,3vw,32) / 1.08 / **700** / -.05em | size ok / **400** | ❌ G3 |
| Card h3 | 22px / 1.08 / **700** / -.04em | 22px / 1.08 / **400** | ❌ G3 |
| Eyebrow | 11px / 800 / .14em up | 11px / **800** / 1.54px up | ✅ |
| Card-topline | 11px / 800 / .09em up | idem | ✅ |
| Detail dt | 10px / 800 / .1em up | idem | ✅ |
| Famiglia | Arial, Helvetica, sans-serif | idem (body) | ✅ |

Causa G3: nessun `font-weight` sui selettori di heading; preflight Tailwind
v4 imposta `h1–h6 { font-weight: inherit }` → 400. La scala "a contrasti
netti di peso (800 vs 400)" di §3.3 è quindi **non implementata**: i titoli
sono grandi ma tutti regular. Verificato anche su `.hero h1`, `.record-detail
h1`, `.records-heading h2`, `.tool-cards h2`.

---

## 5. Spaziature, radius, container

- **Container:** standard `min(1180px, calc(100% - 48px))` ✅; leggibile
  `min(760px, …)` ✅ (record-detail, faq); largo `min(1320px, …)` ✅
  (nav-shell, hero); **non documentato:** `.map-layout` = `min(1440px,
  calc(100% - 32px))` (pagina mappa).
- **Breakpoint reali:** `980px` ✅, `700px` ✅, **`768px`** (mappa —
  non documentato), **`480px`** (nav/forms — non documentato). Doc §7.1
  dichiara solo 700/980/1320.
- **Touch target:** `.button` ~47px ✅; `.text-button` piccolo ma inline;
  **`locale-toggle` ~25px** e **`filter-chip` 36px** < 44px (la verifica "✓"
  di §6.2 è ottimistica; WCAG 2.5.8 24px comunque ok).
- **Radius:** nessun sistema (15 valori), coerente con l'assenza di token.

---

## 6. Classi usate ma MAI definite in globals.css

Estratte incrociando `className` nel TSX con i selettori CSS (unico foglio).

| Classe | Dove è usata | Effetto reale | Gravità |
|--------|--------------|---------------|:---:|
| `.tool-heading` | tools/*.tsx (directory, segnala, correggi) | h1+intro senza stile (16px) | **P1 (G1)** |
| `.tool-section` | tools/*.tsx (tutti e 4) | nessun layout/margine | P1 (G1) |
| `.status-dot.demo` | RecordCard, popup, account | dot trasparente | **P1 (G2)** |
| `.status-dot.pending` | 7 componenti `moderation/` | dot trasparente in coda/storico | P2 |
| `.filters-inline` | FiltersBar variant="inline" | no-op (layout da directory-controls) | P3 |
| `.prototype-banner-compact` | MappaTool | no-op (eredita il banner base) | P3 |
| `.map-tool` | MappaTool section | no-op | P3 |
| `.community-level` | LevelBadge | coperta da `.level-badge .status-dot` | — (risolta) |

---

## 7. Mappa dei 42 componenti (`app/components/`)

**Documentati in §3.5 (13):** SiteHeader, SiteFooter, Hero, SurveillanceMap,
RecordCard, MapPanel, PublicDirectory, ReportForm, CorrectionForm, InfoPage,
LegalPage, ModerationDashboard, LocaleToggle (in LocaleProvider).

**Nuovi — non documentati (29):**

| Componente | Pagina/i | Nota |
|------------|----------|------|
| `PublicNav` | tutte le pubbliche | header condiviso 6 link (t_a72a3106) — citato in §2.5 ma assente da §3.5 |
| `PublicNavLinks` | tutte le pubbliche | set nav unico, aria-current |
| `HomeNav` | `/` | island client del menu mobile |
| `ToolLayout` | tools | layout condiviso (route group) |
| `MapTeaser` | `/` | teaser statico (no Leaflet) — §3.5 attribuisce il teaser a SurveillanceMap, errato |
| `ToolCards` | `/` | 4 card tool (F2) |
| `FiltersBar` | `/mappa`, `/directory` | filtri condivisi D4 — citato in §4 ma assente da §3.5 |
| `GeocodeSearch` | `/mappa` sidebar | **combobox geocode** (dropdown, ARIA listbox, /api/geocode) — mai nominato nel doc |
| `MapRecordList` | `/mappa` sidebar | **sidebar lista** viewport-sync + empty note |
| `EmptyState` | directory, mappa, moderation | estrazione di `.empty-state` (D5) |
| `ErrorPage` | 404/500 | shell custom — **404/500 mai nominati nel doc** |
| `LegacyAnchorRedirect` | root layout | redirect client-side degli anchor legacy |
| `ConfirmDialog` | account | alertdialog accessibile (C6) |
| `LevelBadge` | account | badge livello (C5) — tema trattato nel parere community, non nel doc |
| `StarConfirmButton` | records/[id] | toggle verifica (C5) |
| `VerificationWidget` | records/[id] | widget verifica + gate |
| `tools/MappaTool` `DirectoryTool` `SegnalaTool` `CorreggiTool` | 4 tool | corpi pagina (F1/F4) |
| `moderation/*` (8 file: CameraQueueItem, CorrectionQueueItem, CorrectionHistorySection, DecisionForm, EditQueueItem, HistorySection, PhotoQueueItem, QueueSection, + hook useModerationQueue) | `/moderation` | scomposizione dashboard |

**Contenitori nuovi non documentati (i 5 del task):** dropdown GeocodeSearch
(`.geocode-dropdown`, CSS riga 506), marker popup (`lib/map-popup.ts` +
`.osm-popup*` + pick popup in SurveillanceMap), sidebar mappa (`.map-sidebar*`),
header condiviso 6 link (PublicNav/PublicNavLinks), 404 custom (ErrorPage +
`not-found.tsx`/`error.tsx`). Nessuno dei cinque è menzionato in
FRONTEND_DESIGN.md.

---

## 8. Contrasto WCAG — ratio calcolati

Doc §3.2 dichiara AA su `--muted` "~4.6:1": **reale 4.49:1** (0.01 sotto la
soglia AA per testo normale). Le altre coppie della tabella del doc reggono
(verificato). Violazioni AA su testo piccolo **non coperte dalla tabella**:

| Coppia | Ratio | Uso (size) | Esito |
|--------|:---:|------------|:---:|
| `#6f7e84` su paper | 3.79 | `.loading-note` 12px | ❌ |
| `#6f7e84` su `#fffef9` | 4.16 | `.map-list-count` 11px | ❌ |
| `#6f7e84` su `#fff` | 4.21 | `.geocode-option-type` 11px | ❌ |
| `#6b7a80` su paper | 4.01 | `.footer-legal` 11px | ❌ |
| `#8a979b` su `#fff` | 3.01 | `.geocode-attribution` 10px | ❌ |
| `#60727f` (--muted) su paper | 4.49 | testo secondario | ❌ (di 0.01) |

Status dot (2.3–2.9:1): ok perché sempre abbinati a label testuale (WCAG
1.4.1, D7) — ma con G2 i dot demo sono invisibili, quindi la coppia
"dot+label" degenera a sola label.

---

## 9. Divergenze di pattern (doc vs implementazione)

1. **Redirect anchor:** D8/§2.6/§9.1 → "302 alle nuove route". Implementato:
   `LegacyAnchorRedirect` **client-side** `router.replace` (un fragment non
   arriva al server; correzione CTO già nota nel codice, doc non aggiornato).
2. **Mappa mobile:** §2.3/§7.2 → "bottom-sheet collassabile". Implementato:
   **pannello sopra la mappa** (`.map-sidebar` max-height 38vh, scroll
   interno, breakpoint 768px). Il pattern implementato è ragionevole e
   documentato nel CSS, ma non nel doc.
3. **Empty state mappa:** §5.1 → "il pannello record mostra lo stesso empty
   state della directory + link vedi nella directory". Implementato:
   **nota truthfull dentro la sidebar** (`.map-list-empty-note`) con azione
   "Clear filters" — la mappa non sparisce mai (t_b9666d09). Più fedele a
   D5 della prescrizione, ma diverso.
4. **Empty state directory:** §5.1 prevede "reset + link a `/segnala`".
   Implementato: solo reset della ricerca (niente link a `/segnala`).
5. **Error pages:** non previste dal doc; usano header ridotto a 1 link
   (eccezione alla regola 6-link, non registrata in §2.5).
6. **Teaser home:** §3.5 dice "SurveillanceMap … (e teaser `/`)" — il teaser
   è `MapTeaser`, volutamente senza Leaflet (F2). Riga di doc errata.
7. **Nav links count:** §8.3 parla ancora di "fino a 5 link"; il set è 6
   (t_a72a3106). Inconsistenza interna al doc.

---

## 10. Raccomandazioni (ordine di priorità)

1. **P1 — Stilare `.tool-heading`/`.tool-section`** (h1 clamp ~42px, weight
   800, padding verticale) o riusare il pattern `record-detail` delle pagine
   info. Sblocca G1 su 3 pagine pubbliche.
2. **P1 — Definire `.status-dot.demo`** (e `.pending` per moderation):
   servono 2 regole CSS. Sblocca G2 e il dot moderation.
3. **P1 — Applicare i pesi della scala tipografica** (800 hero/section,
   700 record/legal/card) in globals.css: una riga per selettore.
4. **P2 — Ripristinare i token mancanti** `--focus`, `--status-*` in `:root`
   e sostituire i 24 hardcode di `#0b705c` con `var(--focus)` (manutenzione
   e coerenza; il colore non cambia).
5. **P2 — Rialzare i 5 grigi sotto soglia** (loading-note, map-list-count,
   footer-legal, geocode option-type/attribution) a ≥4.5:1, es.
   `#5c6c75`/`#64737a`.
6. **P2 — Aggiornare FRONTEND_DESIGN.md**: sezione token (aggiungere
   `--focus`, `--status-*`; marcare `--space-*` come da fare), correggere
   body 15px→16px e i pesi della scala, D8 (redirect client-side), layout
   mobile mappa (panel sopra, non bottom-sheet), container 1440px,
   breakpoint 480/768, empty-state mappa in-sidebar, error pages, e la riga
   SurveillanceMap/MapTeaser.
7. **P3 — Documentare i 29 componenti nuovi** in §3.5 (o in un'appendice
   "componenti aggiunti dopo la revisione") e aggiornare SITEMAP.md con
   not-found/error.
8. **P3 — Rimuovere le classi no-op** (`.filters-inline`,
   `.prototype-banner-compact`, `.map-tool`) o definirle.
9. **P3 — Empty state directory**: aggiungere il link a `/segnala` previsto
   da D5/§5.1.

**Nota di processo:** il refactor F1–F4 e i task successivi (mappa
t_702c10af/t_b9666d09/t_6abb96ac, community C5/C6, error pages t_7eed4601,
nav t_a72a3106) sono stati implementati con ottima disciplina di accessibilità
e commenti CSS esaustivi; il gap è documentale, non di qualità del codice.
L'aggiornamento di FRONTEND_DESIGN.md è il singolo intervento a maggior
ritorno: il documento è ancora la fonte di verità del design system ma
descrive uno stato precedente a ~15 PR.

---

## 11. Chiusura F4 (2026-08-02) — gap risolti nel codice

Il task F4 ha chiuso i gap code-side di questo report (sul main @`200f415`,
modifiche da revisione PR; il lato documentale era stato allineato in F2).

| Gap | Fix (F4) | File |
|-----|----------|------|
| G1 `.tool-heading`/`.tool-section` | ✅ definite: h1 800 clamp(34,4.5vw,52), padding 48/96, intro; `.tool-section.map-tool` = eccezione full-width `/mappa`; mobile ≤700px | `app/globals.css` |
| G2 `.status-dot.demo` | ✅ `background:var(--status-demo)` | `app/globals.css` |
| G3 pesi tipografici | ✅ 800/700 per selettore (hero, record, tool, auth, section, moderation, legal, card, empty-state, principles, map-teaser) | `app/globals.css` |
| G4 body | ✅ `body { font-size:16px; line-height:1.5 }` esplicito | `app/globals.css` |
| G5 token | ✅ `--focus`, `--status-verified/community/review/demo/pending` in `:root`; 23 hardcode `#0b705c` → `var(--focus)`; `--muted` → `#5c6c75`; classi `.verified/.community-report/.needs-review` migrate ai token | `app/globals.css` |
| P2 5 grigi sotto AA + `--muted` | ✅ `#5c6c75`/`#64737a` (≥4.5:1) su loading-note, map-list-count, footer-legal, geocode-option-type, geocode-attribution | `app/globals.css` |
| P2 `.status-dot.pending` | ✅ `background:var(--status-pending)` | `app/globals.css` |
| P3 `.filters-inline` | ✅ rimossa (la variante inline è solo `.directory-controls`) | `app/components/FiltersBar.tsx` |
| P3 `.prototype-banner-compact` | ✅ rimossa (lo stile compatto è di `.map-layout .prototype-banner`) | `app/components/tools/MappaTool.tsx` |
| P3 `.map-tool` | ✅ definita come eccezione full-width /mappa (non più no-op) | `app/globals.css` |
| P3 empty state directory | ✅ azione = reset + link `/segnala` (`reportHref`, chiave `submitObservation` EN/IT); classe `.empty-state-actions` definita | `PublicDirectory.tsx`, `directory.ts`, `globals.css` |
| P3 touch target | ✅ locale-toggle e filter-chip ≥44px (WCAG 2.5.8) | `app/globals.css` |
| PR review | ✅ `.github/PULL_REQUEST_TEMPLATE.md` con sezione **Design compliance**; `CONTRIBUTING.md` aggiornato | `.github/`, `CONTRIBUTING.md` |

**Verifica:** `npx tsc --noEmit`, `npm run lint`, `npm run build` e rendering
reale su dev server (computed style: h1 tool 800, dot demo visibile, body
16/1.5, contrasti ≥4.5:1, toggle/chip ≥44px).

**Debt residuo (tracciato, fuori scope F4):** scala `--shadow-*` (D15 —
`--space-*`/`--radius-*` nel frattempo implementati da F3, PR #214); 4 dead
tokens (`--navy-2`, `--lime`, `--coral`, `--sand`); classe
`.place-empty-actions` non definita (stessa resa inline); duplicazione
h1/h2+intro su `/directory` (⚠ §2); SITEMAP.md da allineare a not-found/error
(P3 #7).
