# QA Report — F-QA trasversale: contratti URL, axe-core audit, gap aria, criteri per fase, e2e (t_7b716c97)

**QA Engineer:** Grace (OpenSurveillanceDB Ltd.)
**Data:** 2026-08-01
**Branch:** qa/t_7b716c97-url-axe-a11y-gates
**Fase:** F-QA della roadmap docs/FRONTEND_PLAN.md (sez. 5.2/5.3/7.2), consolidamento t_06675d6b

---

## 1. Deliverable di questa fase

### 1.1 Contratto URL (prerequisito F4) — `tests/url-contract.test.mjs`
Oracolo eseguibile di parse/stringify dei filtri (type/freshness/lat/lng/z/query):
- round-trip lossless, encoding UTF-8 e caratteri riservati;
- valori invalidi → fallback safe documentato, mai throw, mai 500 (fuzz su freshness=banana, type da 500 char, coppie duplicate, stringhe vuote);
- lo stub `next/navigation` del dom-harness è stato esteso con un modello URL-state (pathname+search+history stack): deep-link iniziale, router.push/replace, back/forward, replace senza crescita della history.
- **F4 GATE**: quando `app/components/useCameraFilters.mjs` atterrerà (t_522638a5), la suite verifica che l'implementazione reale soddisfi le stesse invarianti. Fino ad allora il gate è SKIPPED in modo esplicito (CI verde per F0-F3, contratto visibile nell'output).

### 1.2 axe-core audit per route — `tests/axe-audit.test.mjs` + `tests/helpers/axe-harness.mjs`
- Audit con il **vero engine axe-core** (devDependency `axe-core@^4.10`, mai shipped) sull'HTML SSR di **ogni route pubblica** del registry (20 route), via Miniflare sul worker buildato.
- Gate: **0 violazioni critiche/serie**; moderate/minor riportate nel test di riepilogo (non nascoste).
- Regole layout-dipendenti (color-contrast, target-size, ...) escluse con motivazione documentata: copertura demandata a Lighthouse CI (task proposto a Ken, t_2d2bf33f) e alle asserzioni contrast token-level di navigation-pages.
- Chiude il gap "automated checks pending" di docs/ACCESSIBILITY_STATEMENT.md (aggiornata EN+IT).

### 1.3 Gap noti chiusi
- **QA-2026-08-01-2 (aria-invalid sui form)** — CLOSED: login/register ora hanno validazione client per-campo con `aria-invalid` sul campo sbagliato, `noValidate` sul form (niente doppia UI nativa), errore server resta su `role="alert"` senza accusare un campo specifico. Test di interazione che pina il comportamento (submit vuoto → entrambi i campi marcati, nessun fetch; fix del campo → si sblocca solo lui; displayName da 1 char invalido).
- **QA-2026-08-01-3 (aria-current sulla nav attiva)** — CLOSED: il footer globale (root layout, presente su ogni route) marca con `aria-current="page"` il link della route corrente (13 link, esattamente uno per route); brand header/footer marcato sulla home. La nav per-pagina del ToolLayout (F3) **non si auto-linka mai** (pattern hand-off, FRONTEND_DESIGN §2.5 — pin `client-tools`): la pagina corrente non ha quindi un self-link da marcare nella tool nav, ed è esposta all'assistive technology dal footer e dall'h1 di pagina. Test SSR (footer per route) + test di interazione ToolLayout (nessun self-link su /mappa e /directory).

### 1.4 Criteri di accettazione per fase — `tests/qa-phase-gate.test.mjs` + `tests/helpers/route-contracts.mjs`
- Registry unico delle route (20): per ognuna i 4 artifact obbligatori (a) SSR smoke, (b) interaction test, (c) i18n parity, (d) a11y contract.
- Il gate fallisce se: una route registrata non ha i 4 artifact, un artifact non esiste su disco, il sorgente della route non esiste, o l'axe audit non deriva la propria lista dal registry (niente route auditate fuori-banda).
- Regola di fase: le PR F1-F4 aggiungono le route nuove al registry **nella stessa PR** che le crea.
- Igiene fixture: nessun dato personale nel registry o nei test (test dedicato).

### 1.5 e2e miniflare estesi — `tests/e2e-journeys.test.mjs` + `tests/browse-filter-record.test.mjs`
1. **browse → filtri → record**: DirectoryTool reale in jsdom (search/kind/sort/count aria-live/empty state/link record) + layer SSR (home hub → /directory shell → /records/[id] shell aria-live).
2. **segnala → submit → coda moderazione**: POST /api/cameras 201 → pending in coda → approve → verified nel listing pubblico → dettaglio SSR raggiungibile (route reali, db D1 in-memory con migrazioni reali).
3. **login → account**: register emette sessione, /api/auth/me risolve il contributor, me/submissions mostra SOLO i propri report, logout revoca la sessione (401 dopo).

### 1.6 Lighthouse CI (item 6)
Nessun workflow Lighthouse esiste in .github/workflows/ → **proposta come task a Ken** (t_2d2bf33f): gate bloccante accessibility >= 0.95, copertura delle regole layout-dipendenti escluse da jsdom.

## 2. File toccati

| File | Motivo |
|---|---|
| tests/url-contract.test.mjs (nuovo) | contratto URL F4 + scenari harness |
| tests/axe-audit.test.mjs (nuovo) | audit axe per route |
| tests/helpers/axe-harness.mjs (nuovo) | runner axe in jsdom + regole escluse |
| tests/helpers/route-contracts.mjs (nuovo) | registry route/artifact |
| tests/qa-phase-gate.test.mjs (nuovo) | gate meccanico 4 artifact |
| tests/e2e-journeys.test.mjs (nuovo) | journey segnala→moderazione, login→account |
| tests/browse-filter-record.test.mjs (nuovo) | journey browse→filtri→record |
| tests/helpers/dom-harness.mjs | stub next/navigation URL-state + legacy aliases |
| tests/helpers/e2e-harness.mjs | route me/submissions/logout caricate |
| tests/a11y-interactive.test.mjs | gap aria chiusi: test nuovi, pinned obsolete rimosse |
| app/components/SiteFooter.tsx | aria-current su ogni link del footer |
| app/components/SiteHeader.tsx | aria-current sul brand (home) |
| app/components/ToolLayout.tsx | commento contratto: nav per-pagina mai self-link (niente aria-current dead) |
| app/login/page.tsx, app/register/page.tsx | aria-invalid per-campo + noValidate |
| package.json | devDependency axe-core |
| docs/ACCESSIBILITY_STATEMENT.md | gap "automated checks pending" chiuso (EN+IT) |

## 3. Note per il reviewer
- Il test `axe-audit` richiede `npm run build` (npm test lo esegue già).
- F4 (t_522638a5) deve: (1) NON cancellare tests/url-contract.test.mjs (è il gate di accettazione), (2) il gate si attiva sul modulo reale `app/lib/use-camera-filters.mjs` con gli export `parseCameraFilters`/`stringifyCameraFilters` (contratto verificato contro la PR #165: round-trip, encoding, fallback invalidi, bound q≤200/type≤60, focus non-numerico → null).
- Le route F1-F3 sono già nel registry con i loro artifact esistenti (home-hub, client-tools, pages-render, i18n-pages): nessun test di fase rotto.
