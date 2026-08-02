# Review Totale Code — QA (Grace)

- Task: `t_081771b5` — REVIEW TOTALE CODE (mansione QA)
- QA: Grace (QA Automation Engineer)
- Data: 2026-08-02
- Base: `main` @ `6f56d22` (feat(header): auth entry point, PR #215)
- Scope: QUALITÀ — copertura test, test flaky, edge case, race condition, a11y (WCAG 2.2 AA), regressioni visive, route critiche (auth, geocode, search)
- Regola: **nessuna implementazione** — solo review. Report dei gap, niente fix.

## Verifica reale eseguita (baseline)

| Verifica | Comando | Esito |
|---|---|---|
| Suite completa | `npm test` (build + `node --test tests/*.test.mjs`) | **1453/1453 PASS, 0 fail, 0 skip** (60.9s) |
| Suite completa | `npm run coverage` (NODE_V8_COVERAGE, run 1) | **FAIL — 1 flake** (`client-verify-toggle.test.mjs:212`) |
| Suite completa | `npm run coverage` (run 2 e 3, stress) | 1453/1453 PASS ×2 (flake intermittente) |
| Test mirato | `node --test tests/client-verify-toggle.test.mjs` ×3 con coverage | 3/3 PASS (il flake emerge solo sotto carico) |
| Coverage righe | baseline `docs/QA_COVERAGE.md` (d83c466) | 93.56% righe (8144/8705), soglia CI 75% |
| Moduli più bassi | `docs/QA_COVERAGE.md` | `app/api/auth/me/route.ts` **54.72%**, `db/camera-edits.ts` 76.45%, `db/users.ts` 82.05% |

Nota metodologica: la coverage "all files 48.98%" del run c8 grezzo include i tree duplicati di `.coverage/trees/*` (ogni route compilata N volte), quindi il numero affidabile è la baseline `QA_COVERAGE.md` (93.56% su codice di produzione, esclusi test/helper).

---

## P0 — Bloccanti (flake attivo + fix noto non mergiato)

### P0-1. Flake attivo in `tests/client-verify-toggle.test.mjs:211-212` — assert su stato async senza attesa del gate
- **File:riga**: `tests/client-verify-toggle.test.mjs:211-212`
- **Problema**: il test `record detail: L1+ toggle PUTs...` fa `findByRole("button", { name: "Confirm this record exists" })` e **subito dopo** `assert.equal(button.disabled, false)`. Il button appare nel DOM nel primo render (gate `"checking"`, disabled), e `disabled: false` arriva solo dopo che i DUE fetch async (`/api/cameras/7/confirmation` + `/api/auth/me`) si risolvono. Sotto `npm run coverage` (NODE_V8_COVERAGE + suite parallela) il fetch non è ancora tornato quando `findByRole` risolve → `disabled === true` → `ERR_ASSERTION true !== false`. **Riprodotto 1 volta su 3 run coverage completi** (run 1 FAIL, run 2-3 PASS) — esattamente la firma del flake PR #216: timing-dipendente, verde in esecuzione singola.
- **Impatto**: il job CI `coverage` (`npm run coverage` in `.github/workflows/ci.yml`) può fallire random su main, senza che il codice di produzione sia cambiato. Stesso family del flake già visto su PR #182/#213.
- **Test mancante / fix proposto**: la riga 212 deve aspettare il gate esplicito, non il solo DOM:
  ```js
  await rtl.waitFor(() => assert.equal(
    screen.getByRole("button", { name: "Confirm this record exists" }).disabled,
    false,
    "the toggle enables only after the personal-state gate settles",
  ), DEBOUNCE_WAIT); // o timeout dedicato (es. { timeout: 5000 })
  ```
  (Pattern identico ai gate di PR #216: precondizione esplicita prima dell'assert, mai inferenza dal DOM. Nota: gli assert `disabled === true` alle righe 176/194/303 NON sono race-prone — lo stato iniziale fail-closed è già `disabled` — solo il 212, che pretende `false`, lo è.)

### P0-2. PR #216 (fix flake `client-tools.test.mjs:614`) ancora OPEN — main esposto
- **File:riga**: `tests/client-tools.test.mjs:574-627` (flake documentato a :614)
- **Problema**: il flake `"typing + clearing committed twice via history.replaceState"` (race clear/debounce, root cause analizzata da Ada post-PR #213) è ancora PRESENTE su main: il branch `feature/linus/t_2c1a8518-flaky-directory-clear-test` (+24 righe, 2 gate espliciti: seed montato prima di digitare + attesa del commit `?q=` via spy `historyReplaceCalls`) NON è stato mergiato.
- **Impatto**: CI su main può fallire random (già accaduto una volta su PR #213); il fix esiste ed è verificato 5/5 stress-run.
- **Azione QA**: review del diff (già fatta in questo task: `git diff main...origin/feature/linus/t_2c1a8518-flaky-directory-clear-test` — solo test, +24 righe, corretto) e merge.

---

## P1 — Gap di copertura su route critiche

### P1-1. `PATCH /api/auth/me` (update displayName) — ZERO test a livello API
- **File:riga**: `app/api/auth/me/route.ts:73-117` (PATCH); coverage modulo **54.72%** (la più bassa del codebase, da `docs/QA_COVERAGE.md`)
- **Problema**: la route PATCH (whitelist single-key `displayName`, guard order urlTooLong → sameOrigin → auth rate-limit → session 401 → CSRF 403 → body validation 400 → db) non ha NESSUN test API diretto. È coperta solo indirettamente dal client (`tests/client-account.test.mjs:321` — fetch mock, non esercita la route). Il db layer `updateContributorDisplayName` non è testato (grep: 0 hit nei test). Non esiste in: `api-auth.test.mjs` (nessun PATCH), `malformed-json-routes.test.mjs` (la route non è nella lista ROUTES), `rate-limit-routes.test.mjs` (nessun `auth/me`).
- **Test mancanti proposti** (file: `tests/api-auth.test.mjs` o nuovo `api-auth-me-patch.test.mjs`):
  1. PATCH con solo `{ displayName: "New" }` + CSRF ok → 200, profilo aggiornato, `Cache-Control: no-store`;
  2. whitelist: PATCH con `{ displayName: "X", role: "admin" }` → 400 "Only the displayName field can be updated" e NESSUN effetto parziale;
  3. PATCH con body non-oggetto / array / JSON malformato → 400;
  4. CSRF mancante/errato → 403; cross-origin → 403; senza sessione → 401;
  5. rate-limit: superato il bucket `auth` → 429 con Retry-After (route-level, oggi non coperto);
  6. displayName troppo corto (1 char) / troppo lungo (61) / non-stringa → 400;
  7. db layer: `updateContributorDisplayName` con id inesistente → null → 401;
  8. db unavailable → 503.

### P1-2. Lighthouse (regressioni visive + a11y layout-dependent) non copre le pagine auth né le pagine legali
- **File:riga**: `lighthouserc.cjs:29-36` (url list: solo `/`, `/mappa`, `/directory`, `/segnala`, `/correggi`, `/records/1`, `/guide`, `/accessibility`)
- **Problema**: il gate Lighthouse a11y `categories:accessibility >= 0.95` (l'unico posto dove girano le regole **layout-dependent** — color-contrast, target-size WCAG 2.5.8, link-in-text-block, scrollable-region-focusable — che jsdom non può valutare, vedi `tests/helpers/axe-harness.mjs` LAYOUT_ONLY_RULES) copre solo 8 route pubbliche. Mancano: `/login`, `/register`, `/account` (le pagine AUTH aggiunte in PR #215, le più importanti per a11y: form, focus trap, target-size dei button) e `/faq`, `/contatti`, `/privacy`, `/termini`, `/licenze`, `/manifesto`, `/regole`, `/moderazione`. Una regressione visiva/a11y su quelle pagine non farebbe fallire NULLA.
- **Test mancante proposto**: estendere `url` in `lighthouserc.cjs` con `/login`, `/register`, `/account` (+ le pagine legali/statiche mancanti). Nessuna credenziale serve: le route auth SSRn come pubbliche (lighthouse `numberOfRuns: 1`, locale en — coerente con l'SSR harness).

### P1-3. Coverage `db/camera-edits.ts` 76.45% e `db/users.ts` 82.05% — sotto la media, funzioni 77.78% / 71.43%
- **File:riga**: `db/camera-edits.ts` (344 righe), `db/users.ts` (78 righe)
- **Problema**: sono i due moduli db con la peggiore copertura dopo `auth/me`; le funzioni non coperte (`db/camera-edits.ts` funzioni 77.78%) includono verosimilmente i path di errore degli edit request (i test `api-edit.test.mjs` coprono la route, ma i rami interni del db layer — rollback, transizioni, `changes: 0`) restano scoperti.
- **Test mancante proposto**: unit test su `db/camera-edits.ts` per: edit su camera inesistente → null; edit che non cambia nulla → `changed:false` senza evento (già testato a route, da replicare a db puro); transizione di stato non valida → fallimento senza scrittura; `db/users.ts`: erasure con id inesistente, role-check path di errore.

---

## P2 — Edge case non coperti / race condition / a11y

### P2-1. Race condition in `useModerationQueue.loadQueue` (double-fetch su decide)
- **File:riga**: `app/components/moderation/useModerationQueue.tsx:49-70` (loadQueue) e `:137` (`loadQueue()` dopo ogni decisione)
- **Problema**: `decide()` chiama `loadQueue()` a ogni decisione, ma `loadQueue` crea un NUOVO AbortController e NON abortisce il fetch precedente: il cleanup dell'effect (`useEffect(() => loadQueue(), ...)`) abortisce solo l'ultimo controller. Con due decisioni ravvicinate (o un decide durante il load iniziale) partono fetch concorrenti su `/api/moderation` e le risposte possono arrivare fuori ordine → lo stato della queue può essere sovrascritto da una risposta più vecchia (dati stantii, badge errati). Il `finally(() => setLoading(false))` del fetch più vecchio può inoltre spegnere lo spinner mentre il nuovo è ancora in corso.
- **Test mancante proposto**: in un DOM-harness, mockare `/api/moderation` con risposte ritardate asimmetriche: (a) prima risposta lenta + seconda veloce → lo stato finale deve riflettere la SECONDA; (b) due decide consecutivi → un solo fetch aggiuntivo (o abort del precedente). Estendere `client-moderation-dashboard.test.mjs`.

### P2-2. `VerificationWidget.onToggleVerification` — nessuna guard su `toggleBusy` nel handler
- **File:riga**: `app/components/VerificationWidget.tsx:91-134`
- **Problema**: il button è `disabled={disabled || busy}` (`StarConfirmButton.tsx:44`), quindi il doppio click UI è mitigato, MA il handler stesso non ha guard `if (toggleBusy) return;` e la guard esistente è solo sul gate di livello. Un doppio click che arriva prima del re-render di `busy` (o un'azione programmatica/AT) può scatenare 2 PUT/DELETE concorrenti sullo stesso `recordId` — il server rate-limita, ma il client farebbe due mutazioni con flip di stato `confirmed` non idempotente (PUT poi DELETE → risultato opposto all'intento).
- **Test mancante proposto**: `tests/client-verify-toggle.test.mjs` — doppio click rapido sul toggle con fetch mock: devono partire UN solo PUT (il secondo click è no-op) oppure DELETE+PUT gestiti in ordine. Assert: `requests.filter(method PUT/DELETE).length <= 1` durante `busy`.

### P2-3. a11y WCAG 2.2 AA — target-size 2.5.8 verificato SOLO sul verification toggle
- **File:riga**: `tests/a11y-interactive.test.mjs:388-391` (unico test 2.5.8: `.confirm-button` 44×44)
- **Problema**: WCAG 2.2 AA `2.5.8 Target Size (Minimum)` richiede target ≥ 24×24 CSS px (con eccezioni). L'unico test esplicito copre il toggle; i button delle pagine AUTH (login/register/account, PR #215), i link della nav, gli action button del record detail e del moderation dashboard non hanno assert di target-size. In jsdom le regole axe layout-dependent sono disabilitate (`axe-harness.mjs` LAYOUT_ONLY_RULES), quindi l'unico gate reale è Lighthouse → che NON copre le pagine auth (vedi P1-2). Nessun test esplicito per 2.4.11 (Focus Not Obscured), 2.5.7 (Dragging), 3.2.6 (Consistent Help), 3.3.7 (Redundant Entry), 3.3.8 (Accessible Authentication) — le nuove regole 2.2 AA non sono mai nominate nei test.
- **Test mancante proposto**: (a) estendere `tests/a11y-interactive.test.mjs` con assert CSS/aria per i target dei form auth (min-width/min-height o area ≥ 24×24 — o 44×44 come standard del progetto); (b) audit esplicito dei criteri 2.4.11/2.5.7/3.2.6/3.3.7/3.3.8 sulle pagine auth (es. `axe.run` con `runOnly: ["wcag22aa"]` su `/login` renderizzato, senza escludere le layout rules — possibile in jsdom per focus-not-obscured? no: serve browser reale → coprire con Lighthouse su /login, vedi P1-2).

### P2-4. Geocode route — nessun test del degradation path quando `caches.default` è assente
- **File:riga**: `app/api/geocode/route.ts:127-133` (geocodeCache → null) e `app/api/tiles/[z]/[x]/[y]/route.ts` (tileCache → null, stesso pattern)
- **Problema**: in runtime non-Workers (test plain Node, preview, eventuale deploy non-CF) `caches.default` può non esistere: il codice degrada a "caching-directive-only". Il comportamento (nessun crash, risposta 200 con `Cache-Control` ma `X-Geocode-Cache` assente) non è testato: `geocode-proxy.test.mjs` e `geocode-cache.test.mjs` iniettano sempre una fake cache, quindi il ramo `cache === null` resta scoperto (stesso per tile-proxy). Edge case piccolo ma è un ramo esplicito del codice con 0 test.
- **Test mancante proposto**: in `tests/geocode-proxy.test.mjs` — run della GET senza global `caches` (come girano già gli altri test route): assert 200 + results corretti + `Cache-Control: public, max-age=...` + nessun throw. Idem `tests/tile-proxy.test.mjs`.

### P2-5. Offset paginazione non clampato su `/api/cameras` e `/api/cameras/search`
- **File:riga**: `app/api/cameras/route.ts:152-153` (`readPageNumber(offset, 0)` senza max) e `app/api/cameras/search/route.ts:93` (`readPageNumber(offset, 0, Number.MAX_SAFE_INTEGER)`)
- **Problema**: `limit` è clampato (500 / 100), ma `offset` è accettato fino a `Number.MAX_SAFE_INTEGER`. Un client ostile può chiedere `?offset=9007199254740991`: passa la validazione (`/^\d+$/` + `Number.isSafeInteger`) e la query SQL esegue un OFFSET astronomico → scansione/lettura inutile sul D1 a ogni richiesta (lento, no error). I test coprono "invalid pagination values" (non-numerici) ma non un offset enorme ma VALIDO.
- **Test mancante proposto**: in `tests/api-cameras.test.mjs` e `tests/api-search.test.mjs`: `?offset=9007199254740991` → 400 (o clamp) e MAI chiamata al db layer; `?offset=1e6` oltre una soglia documentata → 400. (Decidere una soglia: es. max offset 10000 per search/list, coerente con il max page size.)

### P2-6. `usePublicCamera`/`usePublicCameras` — il walk con `filters` non testa l'abort del fetch filtrato a metà walk
- **File:riga**: `app/lib/use-public-cameras.ts:331-375`
- **Problema**: il branch `serverActive` (filtered walk) possiede il proprio AbortController e il cleanup abortisce, ma `walkFilteredPages` non ha test che verifichi: cambio filtro A→B a metà walk → la risposta di A NON deve applicarsi (le `setState` sono guarded da `cancelled`, ma il walk stesso non è interrotto — le pagine restanti di A vengono ancora fetchate dopo l'abort? `fetch` con signal aborted → throw → catch guarded → ok, ma il loop non ha check esplicito di `signal.aborted` tra le pagine: dopo un abort a metà walk, il fetch successivo throwa subito → esce; il comportamento è corretto per caso, non per design documentato).
- **Test mancante proposto**: DOM-harness con fetch che conta le chiamate: (a) cambio filtro durante il walk → nessuna `setRecords` con i dati del filtro vecchio (già coperto da `refetch-loop.test.mjs` per il loop, ma non per l'abort inter-pagina); (b) dopo l'abort, il numero di fetch al server si ferma (non continua a scaricare tutte le pagine).

---

## P3 — Minori / igiene

### P3-1. `use-public-count.ts` — fetch senza AbortController (unmount → setState post-smontaggio)
- **File:riga**: `app/lib/use-public-count.ts:25-48`
- **Problema**: a differenza di `usePublicCameras` (AbortController) e `AuthNavLinks` (controller + cancelled), `usePublicCount` ha solo il flag `cancelled`: l'unmount evita il setState, ma la fetch continua fino alla fine (nessun abort). Su un hub che si smonta presto è un warning React in dev e un fetch inutile. Non testato.
- **Test mancante proposto**: DOM-harness: mount + unmount immediato → la fetch viene abortita (`signal.aborted`) o almeno nessun setState post-smontaggio (no console.error). Estendere `client-public-cameras-layer.test.mjs` o `home-hub.test.mjs`.

### P3-2. `GeocodeSearch` — registry module-level: nessun test per il caso "unmount definitivo con timer pendente"
- **File:riga**: `app/components/home/GeocodeSearch.tsx:62-84` (pendingGeocodeByInput) e `:162-166` (assenza cleanup su unmount, by design)
- **Problema**: il registry è deliberatamente senza cleanup (fix t_b1e192e1), ma se il componente viene smontato DEFINITIVAMENTE (navigazione lontano da /mappa) con un debounce pendente, il timer scatta comunque e chiama `setLastQuery`/`setResults` su un componente smontato (React warning) e fa partire un fetch inutile. Il `__resetGeocodePending` esiste solo per i test. Edge case accettato (trade-off documentato), ma non c'è test che fissi il comportamento atteso dell'UNMOUNT definito (remount è coperto da `geocode-remount-fix.test.mjs`).
- **Test mancante proposto**: in `geocode-remount-fix.test.mjs`: unmount SENZA remount con timer pendente → il fetch parte una volta sola, nessun crash; il componente successivo montato non eredita risultati vecchi (reset dello stato visivo).

### P3-3. `GET /api/auth/me` — 401 senza `Cache-Control: no-store`
- **File:riga**: `app/api/auth/me/route.ts:31-32` (401) vs `:37` (200 con no-store)
- **Problema**: il ramo 401 non porta `Cache-Control: no-store` (il PATCH lo mette su tutti i rami, il GET solo sul 200). Un edge/proxy intermedio potrebbe cacheare il 401 di un utente, facendo sembrare anonimo un utente appena loggato. In pratica il worker edge non aggiunge Cache-Control e le route auth non sono sotto CDN cache — rischio basso, incoerenza di pattern.
- **Test mancante proposto**: in `api-auth.test.mjs` — assert header `Cache-Control: no-store` anche sul 401 di `GET /api/auth/me` (e verificare che `worker-edge` non lo sovrascriva).

### P3-4. `malformed-json-routes.test.mjs` — PATCH non coperto per `/api/auth/me`
- **File:riga**: `tests/malformed-json-routes.test.mjs:60-118` (ROUTES: manca PATCH /api/auth/me)
- **Problema**: il parametrized malformed-JSON copre POST cameras/corrections/appeals/login/register + PATCH moderation/appeals, ma non PATCH /api/auth/me né PATCH /api/cameras/[id] (edit). Il ramo `request.json()` del PATCH me (che usa try/catch custom, non readJsonBody) non è mai esercitato con JSON malformato → il catch → 400 "A JSON object with the displayName field is required" è senza test.
- **Test mancante proposto**: aggiungere la route a ROUTES (con session headers, come già fa per POST /api/appeals).

### P3-5. `SurveillanceMap` — effetto focus `setView` non testato per il caso "già in vista"
- **File:riga**: `app/components/SurveillanceMap.tsx:311-320`
- **Problema**: l'effetto focus fa `setView` a ogni cambio di `focusLocation`, anche quando il punto è già visibile (zoom bump a ≥15): comportamento voluto per il deep link, ma nessun test pinna "non zooma di nuovo se già dentro la view" (churn UX su /mappa?focus=). Coperto solo il caso "pana + apre popup" in `client-tools.test.mjs:277`.
- **Test mancante proposto**: DOM-harness con leaflet stub: focusLocation dentro i bounds correnti → nessun `setView` ridondante (o comportamento documentato). Estendere `client-tools.test.mjs` / `map-viewport.test.mjs`.

---

## Riepilogo priorità

| ID | Priorità | Area | Tipo |
|---|---|---|---|
| P0-1 | P0 | `client-verify-toggle.test.mjs:212` | Flake attivo sotto coverage (CI random) |
| P0-2 | P0 | `client-tools.test.mjs:614` + PR #216 | Fix flake pronto, non mergiato |
| P1-1 | P1 | `app/api/auth/me/route.ts` PATCH | Copertura 54.72%, 0 test API |
| P1-2 | P1 | `lighthouserc.cjs` | Regressioni visive/a11y non coperte su auth+legali |
| P1-3 | P1 | `db/camera-edits.ts`, `db/users.ts` | Coverage sotto media, funzioni 71-78% |
| P2-1 | P2 | `useModerationQueue.tsx:137` | Race double-fetch su decide |
| P2-2 | P2 | `VerificationWidget.tsx:91` | Doppio submit senza guard busy |
| P2-3 | P2 | a11y suite | WCAG 2.2 AA 2.5.8 solo sul toggle; 2.4.11/2.5.7/3.2.6/3.3.7/3.3.8 mai testati |
| P2-4 | P2 | `geocode/route.ts:127`, tile | Ramo `caches.default === null` senza test |
| P2-5 | P2 | `cameras/route.ts:152`, `search/route.ts:93` | Offset non clampato (DoS-perf) |
| P2-6 | P2 | `use-public-cameras.ts:331` | Abort walk filtrato non testato |
| P3-1 | P3 | `use-public-count.ts` | Fetch senza abort su unmount |
| P3-2 | P3 | `GeocodeSearch.tsx:62` | Timer pendente su unmount definitivo non testato |
| P3-3 | P3 | `auth/me/route.ts:31` | 401 senza no-store |
| P3-4 | P3 | `malformed-json-routes.test.mjs` | PATCH /api/auth/me assente |
| P3-5 | P3 | `SurveillanceMap.tsx:311` | setView ridondante non testato |

## Punti di forza confermati (non richiedono azione)

- **Route critiche auth/geocode/search**: copertura test robusta e di qualità — `api-auth.test.mjs` (34 test: lockout per-email con hash, 401 generico anti-enumeration, CSRF, rate-limit, erasure), `geocode-proxy.test.mjs` (20 test: validazione query, Referer verbatim, cache 24h/1h, timeout, body cap, 429), `api-search.test.mjs` (14 test: coordinate senza geocoder, bounding-box radius, 404/503 truthful, paginazione), `route-edge-coverage.test.mjs` (414/429/401/413/500 su auth). Nessun gap P0 su queste tre famiglie a livello di route esistenti.
- **Worker edge**: gate moderation fail-closed, strip identity headers, CSP/sicurezza, purge — ben testati (`worker-edge.test.mjs` 18 test, `cache-purge.test.mjs` 5).
- **Retention**: 30+ test su R1-R6 con legal hold e appeal blocking.
- **Duplicati/anti-gaming**: `corrections-dedupe`, `anti-gaming` (19 test), `duplicate-detection` solidi.
- **a11y SSR**: axe su tutte le 21 route del registry, 0 critical/serious (con runOnly wcag22aa).
- **Baseline suite**: 1453/1453 PASS in `npm test` — verde, determinismo ok in esecuzione singola.

---

*Verifica eseguita sul clone locale del repo (workspace kanban), checkout `6f56d22`; nessuna modifica al codice di produzione; unico output: questo report.*
