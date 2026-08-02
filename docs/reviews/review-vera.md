# Review totale codice — prospettiva DESIGN/UX (Vera)

**Autore:** Vera (Designer UX/UI)
**Data:** 2026-08-02
**Commit review:** `6f56d22` (main, `feat(header): auth entry point in top-right corner` #215)
**Documenti di riferimento:** `docs/FRONTEND_DESIGN.md` v2 (uncommitted, working tree di
`/home/simone/workspace/open-surveillance-db`), `docs/design-audit.md` (F1, uncommitted),
`docs/workstreams/PRODUCT_UX.md`. **Nessuna modifica al codice: solo review.**

---

## 0. Sintesi esecutiva

La review copre l'intero frontend su main @6f56d22: 584 righe di `app/globals.css`, 40+
componenti, tutte le route pubbliche e private, i bundle i18n. Verifica con **rendering reale**
(dev server `vinext`, computed style via browser) su `/`, `/directory`, `/segnala`, `/mappa`,
`/records/1`, `/account`, 404; contrasti ricalcolati (WCAG 2.x) per tutte le coppie rilevanti.

**Finding principale (processo):** il main @6f56d22 **NON contiene i fix code-side F4**
(`.tool-heading`/`.tool-section`, `.status-dot.demo/.pending`, pesi tipografici 800/700,
`body 16/1.5`, 6 contrasti AA, touch target 44px). Essi esistono solo come modifiche
uncommitted nel working tree di `/home/simone/workspace/open-surveillance-db` (dove il file
`globals.css` è anche in stato di conflitto merge con marker `<<<<<<<` non risolti). Il
documento FRONTEND_DESIGN.md v2 dichiara quindi come "✅ implementato" uno stato che su main
non esiste. **Priorità numero uno: portare F4 in main (commit) o ricreare i fix in una PR.**

Il codice è di qualità complessivamente alta: accessibilità di base solida (skip-link, focus
visible, landmark, aria-current, reduced-motion, empty state truthfull, status non-color-only),
estetica sobria civic-tech coerente, i18n EN/IT type-checked. I problemi rilevati sono
**per lo più il debito F4 non committato + 2 divergenze F3 nuove (radius token) + 3 finding
nuovi di questa review** (contrasto hover `.map-record`, contrasto locale-toggle, title 404).

**Conteggio item:** P0 = 0 · P1 = 5 · P2 = 8 · P3 = 9. Nessun bloccante: il sito funziona;
manca coerenza con il design system dichiarato.

---

## 1. Finding P1 (visibili all'utente, da correggere subito)

### P1-1 — Le pagine tool non hanno header stilizzato (G1 F1, ancora aperto su main)
| | |
|---|---|
| **File:riga** | `app/components/tools/DirectoryTool.tsx:46-47`, `SegnalaTool.tsx:29-30`, `CorreggiTool.tsx:26-27`, `MappaTool.tsx:95` usano `tool-section`/`tool-heading`; **nessuna definizione in `app/globals.css`** |
| **Problema** | Rendering reale verificato: h1 tool = **16px/400** (indistinguibile dal body), sezione senza padding verticale. L'audit F1 (G1) lo segnalava già su @200f415; il fix F4 (in working tree) **non è in main @6f56d22**. |
| **Fix proposto** | Definire in globals.css (come da FRONTEND_DESIGN §2.2, D19): `.tool-section { width:min(1180px, calc(100% - 48px)); margin:0 auto; padding:48px 0 96px; }` e `.tool-heading h1 { font-size:clamp(34px,4.5vw,52px); line-height:1.04; letter-spacing:-.06em; font-weight:800; }`; eccezione `.tool-section.map-tool` full-width per /mappa. **Portare il fix F4 in main.** |

### P1-2 — Status dot `demo` invisibile (G2 F1, ancora aperto)
| | |
|---|---|
| **File:riga** | `app/components/RecordCard.tsx:31` (`status-dot ${camera.status}`), `app/lib/map-popup.ts:46`, `app/records/[id]/RecordPageBody.tsx` (`status-dot ${record.status}`); CSS: solo `.osm-camera-marker.demo` esiste, **`.status-dot.demo` no** |
| **Problema** | I record pubblici demo (i soli visibili in seed) renderizzano il dot **trasparente** (verificato: `rgba(0,0,0,0)`). La label testuale resta (WCAG 1.4.1 ok) ma l'affordance visiva è persa su directory, popup, record detail. |
| **Fix proposto** | 1 regola: `.status-dot.demo { background:var(--status-demo); }` (il token `--status-demo:#6177ac` **manca** da `:root` — vedi P2-6). |

### P1-3 — Pesi tipografici della scala non applicati (G3 F1, ancora aperto)
| | |
|---|---|
| **File:riga** | `app/globals.css:89` (`.hero h1`), `:140` (`.section-heading h2`), `:167` (`.camera-card h3`), `:229` (`.record-list-card h3`), `:241` (`.record-detail h1`), `:254` (`.moderation-section h2`), `:442` (`.legal-section h2`), `:392` (`.auth-card h1`), `:118` (`.map-teaser-copy h2`) |
| **Problema** | Verificato in rendering: hero h1 = **76.8px/400**, section h2 = 400, card h3 = 400, teaser h2 = 400. La gerarchia "contrasti netti di peso (800 vs 400)" di §3.2 non è implementata: i titoli sono grandi ma tutti regular (preflight Tailwind azzera i pesi). |
| **Fix proposto** | Una riga per selettore in globals.css (800 per hero/section/tool/auth, 700 per record/legal/card) — esattamente il fix F4 G3 non committato. |

### P1-4 — Body senza font-size/line-height espliciti (G4 F1, ancora aperto)
| | |
|---|---|
| **File:riga** | `app/globals.css:43` — `body { margin:0; background:var(--paper); color:var(--ink); font-family:… }` senza `font-size`/`line-height` |
| **Problema** | Il rendering reale è 16px/1.5 (default preflight), che coincide con la scala §3.2 — ma per convenzione il design system richiede la regola esplicita; la mancanza rende il rendering dipendente dal default del framework. |
| **Fix proposto** | `body { … font-size:16px; line-height:1.5; }` (fix F4 G4). |

### P1-5 — Duplicazione h1/h2 + intro su `/directory` e `/segnala`
| | |
|---|---|
| **File:riga** | `app/components/tools/DirectoryTool.tsx:47` (`.tool-heading` h1 "Public directory") + `app/components/home/PublicDirectory.tsx` (sezione `records-heading` con h2 "Browse public records without the map" e intro quasi identica); stesso pattern su `SegnalaTool.tsx:30` + `ReportForm` |
| **Problema** | Verificato in rendering: `/directory` mostra **due "ACCESSIBLE DIRECTORY"** (eyebrow) e **due h1/h2 con lo stesso testo e la stessa intro** a poche righe di distanza. Confonde l'utente, duplica l'annuncio AT, appesantisce la pagina. Già segnalato come ⚠ in design-audit §2, mai risolto. |
| **Fix proposto** | La pagina tool deve avere **un solo header di pagina**: usare `.tool-heading` come unico titolo e rimuovere il blocco `records-heading` duplicato da `PublicDirectory` quando è dentro una tool page (variante prop o condizione per route tool), oppure trasformare l'h2 in un semplice intro testuale non duplicato. Da coordinare con Ada (struttura). |

---

## 2. Finding P2 (accessibilità/contrasto/coerenza)

### P2-1 — 5 grigi sotto AA su testo piccolo (già in F1 §8, **ancora su main**)
| Coppia | Ratio | Uso | File:riga | Fix |
|---|---|---|---|---|
| `#6f7e84` su `--paper` | **3.79** | `.loading-note` 12px | `globals.css:159` | `#5c6c75` (4.90) |
| `#6f7e84` su `#fffef9` | **4.16** | `.map-list-count` 11px | `globals.css:535` | `#5c6c75` |
| `#6f7e84` su `#fff` | **4.21** | `.geocode-option-type` 11px | `globals.css:555` | `#64737a` (4.91) |
| `#6b7a80` su `--paper` | **4.01** | `.footer-legal` 11px | `globals.css:287` | `#5c6c75` |
| `#8a979b` su `#fff` | **3.01** | `.geocode-attribution` 10px | `globals.css:557` | `#64737a` |

### P2-2 — `--muted` a 4.49:1 su paper (0.01 sotto AA)
| | |
|---|---|
| **File:riga** | `app/globals.css:11` — `--muted:#60727f` |
| **Problema** | Ratio reale 4.49:1 < 4.5:1. Ed è **un token morto**: 0 usi `var(--muted)` (verificato, tutti i grigi sono hardcodati). |
| **Fix proposto** | Portare `--muted` a `#5c6c75` (4.90:1) e usarlo per i testi secondari (fix F4 G5 non committato). |

### P2-3 — `.status-dot.pending` mai definita (dot trasparenti in moderation)
| | |
|---|---|
| **File:riga** | usata in `moderation/EditQueueItem.tsx:41`, `CorrectionQueueItem.tsx:28`, `HistorySection.tsx:25`, `PhotoQueueItem.tsx:22`, `useModerationQueue.tsx:86`, `CorrectionHistorySection.tsx:93,109`; **nessuna regola `.status-dot.pending` in globals.css** |
| **Problema** | Tutti i dot "in coda" della dashboard moderatori renderizzano trasparenti. |
| **Fix proposto** | `.status-dot.pending { background:var(--status-pending); }` + token `--status-pending:#8a979b` in `:root` (fix F4 P2 non committato). |

### P2-4 — **NUOVO** — Contrasto hover `.map-record` sotto AA
| | |
|---|---|
| **File:riga** | `app/globals.css:541` (`.map-record:hover { background:#eef3ea }`) + `:544` (`.map-record-meta { color:#60737d }`) |
| **Problema** | Su sfondo hover `#eef3ea`, il meta 12px `#60737d` scende a **4.39:1** (FAIL AA). Non era nell'audit F1 (copriva solo lo stato base). |
| **Fix proposto** | Usare `#5c6c75` per `.map-record-meta` (4.90 su `#fffef9`, 5.05 su `#eef3ea`) oppure uno sfondo hover più chiaro. |

### P2-5 — **NUOVO** — Contrasto testo `locale-toggle` appena sotto AA
| | |
|---|---|
| **File:riga** | `app/globals.css:75` — `.locale-toggle button { color:#62737b }` su `#fffef9` (bordo `#b7c2bd`) |
| **Problema** | Ratio **4.44:1** < 4.5:1 su testo 11px. |
| **Fix proposto** | `#5c6c75` (4.90:1). |

### P2-6 — **NUOVO (F3)** — Scala radius committata ≠ scala documentata v2
| | |
|---|---|
| **File:riga** | `app/globals.css:24-25` — `--radius-lg:12px; --radius-xl:16px; --radius-2xl:22px` |
| **Problema** | FRONTEND_DESIGN v2 §3.4 prescrive `lg:10px, xl:12px, 2xl:14px, 3xl:16px, hero:22px`. F3 (t_27bfa729) ha committato **valori diversi** (`lg:12, xl:16, 2xl:22`) e **ha eliminato `--radius-3xl` e `--radius-hero`**. La doc v2 è stata scritta DOPO F3 ma con la scala "canonica" diversa → il binding non combacia. Inoltre `--radius-2xl`/`--radius-xl`/`--radius-full` hanno solo 1 uso ciascuno, e nel CSS restano 15+ valori radius letterali (7,9,10,14,18,22px) fuori token. |
| **Fix proposto** | Decisione di design: allineare la scala (consigliato: mantenere la scala v2 completa `xs 4, sm 6, md 8, lg 10, xl 12, 2xl 14, 3xl 16, hero 22` e migrare i valori letterali — D15 debt F4) oppure aggiornare la doc v2 alla scala F3. Da fare in un refactor CSS dedicato; intanto **una riga nel doc per segnare lo stato reale**. |

### P2-7 — Token layer: 5 token colore morti + 5 spacing mai usati (F3)
| | |
|---|---|
| **File:riga** | `app/globals.css:11-20` |
| **Problema** | Zero usi verificati: `--muted`, `--navy-2`, `--lime`, `--coral`, `--sand` (colori); `--space-1`, `--space-10`, `--space-12`, `--space-20`, `--space-24` (spacing). `--space-8`/`--space-16` hanno 1 uso solo. I padding/margin restano ~60 valori letterali. |
| **Fix proposto** | Usare o rimuovere i token morti (D15/refactor CSS); intanto i commenti `:root` non devono dichiarare "rispecchiano ESATTAMENTE i valori esistenti" per token inutilizzati. |

### P2-8 — Touch target < 44px su `locale-toggle` e `filter-chip` (P3 F1, ancora su main)
| | |
|---|---|
| **File:riga** | `app/globals.css:75` (locale-toggle `min-width:34px`, altezza reale ~30.5px verificata) · `:497` (`.filter-chip { min-height:36px }`) |
| **Problema** | Target di prodotto 44px (WCAG 2.5.8 24px è rispettato ma sotto lo standard interno §8). Il locale-toggle è ora ancora più critico: è un controllo usato su ogni pagina. |
| **Fix proposto** | `min-width:44px; min-height:44px` sul toggle; `min-height:44px` + padding su filter-chip (fix F4 P3 non committato). |

---

## 3. Finding P3 (pulizia, coerenza, minori)

### P3-1 — 6 classi usate ma mai definite (no-op)
| Classe | Dove è usata | Effetto |
|---|---|---|
| `.tool-layout` | `app/components/ToolLayout.tsx:25` | nessuno (no-op) |
| `.filters-inline` | `FiltersBar.tsx` (variante inline) | nessuno (no-op) |
| `.map-tool` | `app/components/tools/MappaTool.tsx:95` | nessuno (no-op) |
| `.prototype-banner-compact` | `app/components/tools/MappaTool.tsx:105` | nessuno (no-op) |
| `.community-level` | `app/components/LevelBadge.tsx` | coperta da `.level-badge .status-dot` |
| `.place-empty-actions` | `app/components/home/PublicDirectory.tsx:140` | nessuna regola; resa inline ok |

**Fix:** definire o rimuovere (don't #4 del doc; F4 aveva previsto la rimozione di 3 di queste — non committato).

### P3-2 — Empty state directory senza link a `/segnala`
| | |
|---|---|
| **File:riga** | `app/components/home/PublicDirectory.tsx:142` — azione = solo "Clear search" |
| **Problema** | D5/§6.3.6 prevedono empty state truthfull + azione di recupero (reset + link `/segnala`). Il fix F4 (chiave `submitObservation`, `reportHref`) è nel working tree, non su main. |
| **Fix proposto** | Portare in main il fix F4 (azione doppia: reset + link `/segnala`). |

### P3-3 — **NUOVO** — 404/500: `<title>` = title della home (WCAG 2.4.2)
| | |
|---|---|
| **File:riga** | `app/not-found.tsx` e `app/error.tsx` senza `generateMetadata`; ereditano il title del root layout (`app/layout.tsx:16-17`) |
| **Problema** | Verificato in rendering: su una route inesistente il title è "OpenSurveillanceDB — Dati pubblici sulla sorveglianza pubblica" (title della home). Un utente con molte tab non distingue la pagina di errore; WCAG 2.4.2 (Page Titled) non soddisfatto per queste route. |
| **Fix proposto** | `generateMetadata` localizzato per 404/500 (es. "Page not found — OpenSurveillanceDB") usando `getServerMessages().errors`. |

### P3-4 — Hardcode colore azione `#0a705d` (4 occorrenze) senza token
| | |
|---|---|
| **File:riga** | `app/globals.css:172` (`.text-button`), `:197` (`.legal-microcopy a`), `:404` (`.check-label a`), `:573` (`.osm-popup-actions a`) |
| **Problema** | `#0a705d` è il colore link/testo-azione, diverso da `--focus:#0b705c`; nessun token dedicato → incoerenza futura (due verdi molto simili con significati diversi). |
| **Fix proposto** | Introdurre `--action:#0a705d` in `:root` e sostituire i 4 hardcode (o mappare a `--focus` se intenzionale unificarli). |

### P3-5 — SITEMAP.md non allineato (404/error pages assenti)
| | |
|---|---|
| **File:riga** | `docs/SITEMAP.md` — nessuna voce per `not-found.tsx`/`error.tsx`; auth routes citate solo in prosa |
| **Problema** | Debt tracciato in design-audit §11 ("SITEMAP da allineare"); la mappa informativa deve elencare le route speciali. |
| **Fix proposto** | Aggiornare SITEMAP.md con 404/500 (+ nota header ridotto §2.3 del doc). |

### P3-6 — Moderation dev: 503 "access control not configured" invece di redirect login
| | |
|---|---|
| **File:riga** | `app/moderation/page.tsx` (gating) |
| **Problema** | In dev, senza config, `/moderation` risponde 503 (verificato nel log dev server) — l'utente vede una pagina di errore invece di un redirect a login. In produzione il gating funziona (requireRole); è un problema di ambiente/dev UX. |
| **Fix proposto** | Valutare un redirect a `/login` con `next` param quando il ruolo non è configurabile; segnalare a Ada/Backend. |

### P3-7 — Header auth (t_65b778c5): micro-dettagli da rifinire
| | |
|---|---|
| **File:riga** | `app/components/AuthNavLinks.tsx`, `app/globals.css:71-73` |
| **Problema** | (a) Su ≤480px `.nav-shell` va a capo (`flex-wrap:wrap`, `globals.css:385`): brand + menu + toggle + auth links possono andare su 2 righe — verificare che resti ordinato (non testato a 320px in questa review: nessun emulatore viewport); (b) lo stato "unknown" renderizza nulla: su reti lente l'header appare "vuoto" a destra per 1-2s (privacy by design voluto, ma valutare un placeholder a larghezza riservata per evitare il salto di layout); (c) l'aria-label del link account (`t.accountAria`) è sempre presente ✅. |
| **Fix proposto** | Verifica mobile 320px con emulatore; eventualmente `min-width` riservata allo slot trailing; confermare il pattern "nessun flash" con un test di layout. |

### P3-8 — `/mappa` : h1 sr-only + struttura a region (coerente, ma check focus)
| | |
|---|---|
| **File:riga** | `app/components/tools/MappaTool.tsx` (h1 sr-only, t_11e38eab), `app/components/home/MapPanel.tsx:136-141` |
| **Problema** | Il focus dopo navigazione `/directory` → `/mappa?focus=ID` panna la mappa ma **non sposta il focus** al record (documentato come "da verificare" in §8 del doc). |
| **Fix proposto** | In `showRecordOnMap`/deep-link: gestire il focus sul record selezionato (es. focus sul bottone `.map-record.selected`) dopo il pan. |

### P3-9 — `ConfirmDialog` focus trap solo su 2 bottoni (minore)
| | |
|---|---|
| **File:riga** | `app/components/ConfirmDialog.tsx` (focus trap su cancel/confirm) |
| **Problema** | Il dialog contiene solo i 2 bottoni → trap corretta. Nessun problema reale; segnalato come "verificato ok". |
| **Fix proposto** | Nessuno (conferma positiva). |

---

## 4. Verifiche positive (confermate su main @6f56d22)

- **Header condiviso 6 link** (`PublicNav`/`PublicNavLinks`) su tutte le pubbliche con `aria-current="page"` ✅ (verificato su /, /directory, /segnala, /mappa, 404).
- **Auth entry point** (`AuthNavLinks`): renderizza nulla in SSR (privacy by design), correttamente anonimo (401) o autenticato (200) — verificato `/api/auth/me` → 401 → "Log in/Create account" visibili.
- **i18n EN/IT**: bundle per dominio, parità type-checked; toggle reale funzionante (verificato IT su /: lang=it, testi tradotti, nessun flash).
- **Geocode dropdown**: combobox ARIA completo (role=combobox, aria-expanded, aria-controls, aria-activedescendant, listbox, role=status per empty/error); API `/api/geocode` risponde 200 con risultati minimizzati ✅.
- **Mappa**: sidebar viewport-sync, empty note truthfull in-lista ("Clear filters"), mappa mai nascosta, `?focus=` deep link, mobile pannello ≤768px (verificato nel CSS) ✅.
- **Error pages**: 404/500 con shell condivisa, header ridotto 1 link, **nessun leak di path/errore** (verificato 404) ✅.
- **Contrasti principali**: hero su navy 10.9–15.1:1 ✅; testi principali su card 9+:1 ✅; bottoni 6–12.7:1 ✅.
- **Stati**: hover/focus/disabled presenti e coerenti; `:focus-visible` con `var(--focus)` (23 usi), override documentati (offset 1-3px, -3px FAQ) ✅; disabled con testo "Invio…" + opacity ✅; niente `cursor:pointer` su non-interattivi ✅.
- **Reduced-motion**, skip-link, landmark, `overflow-wrap:anywhere` su dd, touch ≥44px su `.button` (~47px) e `.confirm-button` ✅.
- **Tono**: estetica sobria civic-tech confermata visivamente (nessun allarmismo, nessun effetto vistoso) ✅.

---

## 5. Priorità consigliata (per il giro successivo)

1. **P1 — Merge dei fix F4 in main** (G1/G2/G3/G4, P2 contrasti, touch target, empty state): sono già scritti e verificati nel working tree; vanno committati (o ricreati come PR) insieme alla risoluzione dei marker di conflitto in `globals.css`. Sblocca in un colpo 4 P1 + 4 P2.
2. **P1 — Risolvere la duplicazione h1/h2** su /directory e /segnala (P1-5).
3. **P2 — Ripristinare la scala radius v2** (o allineare la doc) + token morti (P2-6/P2-7).
4. **P2 — Nuovi contrasti**: `.map-record-meta` hover (P2-4), `locale-toggle` (P2-5).
5. **P3 — Title 404/500** (P3-3), SITEMAP (P3-5), no-op classes (P3-1).
6. **P3 — Verifica mobile 320px** dell'header con auth links (P3-7).

---

## 6. Note di processo

- Il documento `FRONTEND_DESIGN.md` v2 e `design-audit.md` sono **non committati** nel working
  tree di `/home/simone/workspace/open-surveillance-db` (che è a @200f415 + fix F4); main è a
  @6f56d22. Il doc v2 dichiara D16–D20 "✅" ma su main quelle voci sono ancora 🔒. **Il doc e
  il codice devono viaggiare insieme in una PR unica** (F4 + doc), altrimenti il design system
  "vincolante" descrive uno stato inesistente.
- `app/globals.css` nel working tree di `/home/simone/workspace/open-surveillance-db` contiene
  **marker di conflitto git non risolti** (`<<<<<<< Updated upstream` / `>>>>>>> Stashed
  changes`, righe 3, 40-44, 47-48, …). Da risolvere PRIMA del merge.
- Nessuna modifica al codice è stata fatta da questa review (solo lettura + dev server locale).
