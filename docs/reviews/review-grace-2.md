# Review Totale 2 — QA (Grace)

- Task: `t_48eb4dc4` — REVIEW TOTALE 2 (ciclo 2026-08-03)
- QA: Grace (QA Automation Engineer)
- Data: 2026-08-03
- Base: `main` @ `c5d35d0` (fix(auth): ?merge= cleanup + 403 CSRF passkey, PR #243)
- Scope: QUALITÀ — lettura integrale della mansione QA con focus sul NUOVO workstream auth (Fase A→G, PR #232-#243): test E2E WebAuthn con cerimonie reali, write gate 401/403, token verifica scaduti/riusati, recovery codes, counter replay, rate limit mail 3/h, Lighthouse /login multi-metodo wcag22aa; copertura post-fix (auth/me, camera-edits, users) + stato fix review precedente (review-grace.md)
- Regola: **nessuna implementazione** — solo review. Report dei gap, niente fix.

## Verifica reale eseguita (baseline)

| Verifica | Comando | Esito |
|---|---|---|
| Suite completa | `npm test` (build + `node --test tests/*.test.mjs`) | **1704/1704 PASS, 0 fail, 0 skip** (75.6s) |
| Coverage righe | `npm run coverage` + `npm run coverage:docs` | **94.52%** righe (10899/11531), branch 89.50%, funzioni 97.76% — soglia CI 75% OK |
| Modulo `auth/me` | report coverage | `app/api/auth/me/route.ts` **96.52%** (111/115) — da 54.72% |
| Modulo `db/camera-edits.ts` | report coverage | **89.83%** (309/344) — da 76.45% |
| Modulo `db/users.ts` | report coverage | **100%** (93/93) — da 82.05% |
| Workstream auth (Fase C/D) | report coverage | `db/passkeys.ts` 100%, `db/oidc.ts` 100%, `db/mailer.ts` 100%, `write-gate.ts` 100% |
| Route auth più basse | report coverage | `passkey/credentials` 77.22%, `recovery` 79.45%, `login/complete` 80.91%, `logout` 82.50% |

Nota metodologica: come in review-grace.md, la coverage "all files 48.71%" del run c8 grezzo include i tree duplicati di `.coverage/trees/*`; il numero affidabile è `docs/QA_COVERAGE.md` rigenerato (94.52% su codice di produzione). La suite è cresciuta da 1453 a 1704 test da main @6f56d22 — il delta è quasi interamente il workstream auth.

Nota sul claim "auth/me 98%": la PR #225 dichiarava 98.11% (106 righe); su main @c5d35d0 il modulo è cresciuto a 115 righe e la coverage reale misurata è **96.52%** — comunque di gran lunga sopra la media e sopra soglia. Il P1-1 della review precedente è chiuso.

---

## Stato fix review precedente (review-grace.md @6f56d22)

| ID | Finding | Stato su main @c5d35d0 |
|---|---|---|
| P0-1 | Flake `client-verify-toggle.test.mjs:212` | **FIXED** — ora `waitFor(..., { timeout: 5000 })` sul gate enabled (righe 216-224); de-flake in PR #221 (3985450) |
| P0-2 | PR #216 (flake directory clear) non mergiata | **FIXED** — mergiata (427da5e) |
| P1-1 | PATCH /api/auth/me zero test, 54.72% | **FIXED** — `api-auth-me-patch.test.mjs` (22 test, 339 righe: whitelist, guard order 414→403→429→401→403→400, rate-limit, grammar, 503, no-store su ogni ramo); coverage reale 96.52% |
| P1-2 | Lighthouse non copre auth/legal | **FIXED** — `lighthouserc.cjs` ora 11 URL: `/login`, `/register`, `/account` + `/guide`, `/privacy` (PR #240, 64d577d) |
| P1-3 | `db/camera-edits.ts` 76.45%, `db/users.ts` 82.05% | **FIXED** — `db-camera-edits.test.mjs` (9 test, 240 righe: camera_not_found, no_changes senza evento, status_blocked, owner view, not_owner, not_found), `db-users.test.mjs` (11 test: lookup, order, mutations, reviewer linkage, roleAtLeast); ora 89.83% / 100% |
| P2-1 | Race `useModerationQueue.loadQueue` (double-fetch su decide) | **APERTO** — `loadQueue` crea un nuovo AbortController per chiamata (il cleanup dell'effect abortisce solo l'ultimo) e `decide()` (riga 137) rifà `loadQueue()` senza abortire il fetch in corso. Nessun test di risposte asimmetriche in `client-moderation-dashboard.test.mjs`. → P3-1 di questa review |
| P2-2 | `VerificationWidget.onToggleVerification` senza guard `toggleBusy` | **PARZIALE** — il button resta `disabled={busy}` (testato a riga 108), ma il handler non ha `if (toggleBusy) return;`; nessun test di doppio click rapido. → P3-2 |
| P2-3 | WCAG 2.2 AA 2.5.8 solo sul toggle | **PARZIALE** — Lighthouse ora copre `/login` `/register` `/account` con `categories:accessibility >= 0.95` (le regole layout-dependent girano su Chromium reale); axe SSR (axe-harness runOnly wcag22aa) su tutte le route del registry incluse le auth. L'assert esplicito 44×44 resta solo sul toggle (`a11y-interactive.test.mjs:388`). → P3-3 |
| P2-4 | Geocode/tile: ramo `caches.default === null` senza test | **FIXED** — `geocode-proxy.test.mjs` ora esegue i test con `delete globalThis.caches` in beforeEach/afterEach (righe 70-77): il ramo degradation è esercitato per default, la cache è iniettata solo nei 2 test dedicati (24h/1h, righe 276-287) |
| P2-5 | Offset paginazione non clampato su /api/cameras + search | **APERTO** — `readPageNumber(params.get("offset"), 0)` senza max ancora presente (`cameras/route.ts:153`, `search/route.ts:93`); nessun test con offset astronomico (grep 9007199254740991 = 0 hit nei test). → P2-4 |
| P2-6 | Abort walk filtrato non testato | **PARZIALE** — `refetch-loop.test.mjs` (3 test) pinna "fetch count FLAT dopo il walk filtrato", ma non il caso cambio-filtro-A→B a metà walk con abort inter-pagina. → P3-4 |
| P3-1 | `usePublicCount` fetch senza abort | **APERTO** — resta solo il flag `cancelled`, nessun AbortController. → P3-5 |
| P3-2 | GeocodeSearch unmount definitivo con timer pendente | **PARZIALE** — `geocode-remount-fix.test.mjs:227` pinna il comportamento (unmount non cancella il fetch, module-level timer) |
| P3-3 | GET /api/auth/me 401 senza no-store | **FIXED** — `api-auth.test.mjs:541-544` ora verifica `Cache-Control: no-store` sul 401 (PR #221) |
| P3-4 | malformed-JSON PATCH /api/auth/me assente | **FIXED** — `malformed-json-routes.test.mjs:138-141` ora include `PATCH /api/auth/me` nella lista parametrizzata |
| P3-5 | SurveillanceMap setView ridondante non testato | **PARZIALE** — focus deep link coperto (`client-tools.test.mjs:465-489, 681-687`), ma non il caso "già in vista → nessun zoom" |

---

## P0 — Bloccanti

**Nessun bloccante.** Suite 1704/1704 verde su main, coverage sopra soglia, flake P0-1/P0-2 della review precedente risolti e verificati. Il lavoro QA del workstream auth (PR #241) è mergiato e verde.

---

## P1 — Gap di copertura sui rami di errore delle route auth nuove

### P1-1. Route passkey/recovery/logout/reset sotto la media — rami 429/503/414 senza test
- **File:riga**: `tests/api-passkey.test.mjs` (567 righe) — grep `429|503|414` = **0 hit**; `tests/rate-limit-routes.test.mjs` copre il family `auth` solo via login/register, NON le route passkey/recovery
- **Problema**: le route nuove del workstream auth hanno le coverage più basse del codebase, tutte su rami di errore non esercitati:
  - `app/api/auth/passkey/credentials/route.ts` **77.22%** (61/79) — branch GET/DELETE: 414 (urlTooLong), 429 (auth bucket), 500 (db unavailable) non testati;
  - `app/api/auth/recovery/route.ts` **79.45%** (58/73) — 429 bucket, 503, 414 senza test;
  - `app/api/auth/passkey/login/complete/route.ts` **80.91%** (89/110) — 429, 503, 414 senza test;
  - `app/api/auth/passkey/register/complete/route.ts` **85.44%** — idem;
  - `app/api/auth/logout/route.ts` **82.50%** (33/40), branch 60% — 503/414 non testati;
  - `app/api/auth/reset-password/request|confirm` 82.43%/83.56% — idem.
- **Impatto**: le route auth sono il bersaglio di brute-force/abuse più probabile del sistema (recovery = recupero account, logout = rotazione sessioni, passkey = seconda fattore). Un errore nel rate-limit o nel fail-closed di queste route non farebbe fallire NULLA oggi. `db/passkeys.ts`/`db/oidc.ts` sono al 100%: il gap è tutto nell'orchestrazione route (guard order, status code), non nel SQL.
- **Test mancanti proposti** (nessuna implementazione — solo test): estendere `api-passkey.test.mjs`/`oidc-flow.test.mjs` con, per OGNI route: 414 URL >4096 (prima di ogni altra guard), 429 superato il bucket `auth` con Retry-After, 503 db unavailable, no-store sugli errori. Stesso pattern già usato in `api-auth-me-patch.test.mjs` (che è il modello di qualità da replicare).

### P1-2. `app/lib/mailer.ts` 84.38% con branch 66.67% — il wrapper mailer ha rami scoperti
- **File:riga**: `app/lib/mailer.ts` (108/128 righe coperte) — mentre `db/mailer.ts` è al 100%
- **Problema**: il layer lib/mailer (che orchestra render → rate-limit → binding → log) ha branch a 66.67%: i path di fallback/errore del wrapper (es. template render failure, decisioni di rate-limit propagate al chiamante) non sono coperti direttamente. `tests/mailer.test.mjs` (16 test) copre benissimo il db layer e i template; il wrapper intermedio resta il punto debole.
- **Test mancanti proposti**: unit test su `app/lib/mailer.ts` per i rami non coperti individuabili dal report c8 (`mailer.ts` a 84.38%) — in particolare il path che mappa `canSendAuthEmail` denied → `{ok:false, reason:"rate_limited", retryAfterSeconds}` e il fail-closed con binding rotto già coperto a db.

---

## P2 — Edge case / a11y / igiene minore

### P2-1. Qa-multiauth E2E: write gate attraversato da OGNI metodo — ma senza test del rate-limit mail 3/h in E2E
- **File:riga**: `tests/qa-multiauth-write-gate-e2e.test.mjs` (466 righe, 6 test top-level)
- **Problema**: il flusso register→verify→write usa il dev link (mailer su dev path); il rate-limit 3/h è testato solo in `auth-verify-e2e` (resend 4th → 429) e a db (`mailer.test.mjs`) — mai end-to-end con la route register + quota pre-flight combinata. Copertura complessiva del contratto comunque buona (vedi punti di forza); è un complemento, non una lacuna critica.
- **Test mancante proposto**: in `qa-multiauth-write-gate-e2e` o `auth-verify-e2e`, un test che esaurisca il budget 3/h con REGISTER + 2 RESEND reali e verifichi il 429 sul 4° invio senza consumare token (pattern già presente in `auth-verify-e2e.test.mjs:126-153` — estendere all'E2E completo con scrittura dopo).

### P2-2. E2E OIDC: il merge manuale non è coperto end-to-end (solo route-mock e db)
- **File:riga**: `tests/qa-multiauth-write-gate-e2e.test.mjs` (solo fast-path OIDC a :417-466) vs `oidc-flow.test.mjs` (route con db mockato) e `oidc-d1.test.mjs` (db reale)
- **Problema**: il percorso "conflitto email → merge manuale → write" (il caso più delicato: account esistente + identità esterna) non ha un E2E che parta dal callback reale con conflitto, passi per POST /api/auth/oidc/merge reale e arrivi alla scrittura. `createOidcMergeRequest`+`linkExternalIdentity` sono coperti a db reale e la route con mock — ma mai il filo completo con sessione reale.
- **Test mancante proposto**: in `qa-multiauth-write-gate-e2e`: register email+password reale → callback OIDC con la STESSA email (stub provider) → 302 a /login?merge= → POST /api/auth/oidc/merge reale → sessione → POST /api/cameras → 201.

### P2-3. `/account` — enroll passkey senza WebAuthn non testato (c'è solo su /login)
- **File:riga**: `tests/client-account.test.mjs` (18 test) — il caso "browser senza WebAuthn" è coperto solo per /login (`client-auth-methods.test.mjs:121-134`)
- **Problema**: su /account il pulsante "Add passkey" in un browser senza `navigator.credentials`/`PublicKeyCredential` potrebbe crashatare o mostrare un errore generico; il comportamento (spiegazione, no crash) non è pinnato. Asimmetria di copertura tra le due superfici passkey.
- **Test mancante proposto**: `client-account.test.mjs` — clear WebAuthn globals → click "Add passkey" → ruolo alert esplicativo, nessun crash, nessuna fetch.

### P2-4. Offset paginazione non clampato (P2-5 della review precedente, ancora aperto)
- **File:riga**: `app/api/cameras/route.ts:153`, `app/api/cameras/search/route.ts:93` — `readPageNumber(offset, 0)` senza max
- **Problema**: invariato da review-grace.md: `?offset=9007199254740991` passa la validazione e genera OFFSET astronomico sul D1. Nessun test lo copre. (DoS-perf, non data breach.)
- **Test mancante proposto**: in `api-cameras.test.mjs` e `api-search.test.mjs`: offset enorme → 400 o clamp, mai chiamata al db layer.

---

## P3 — Minori / igiene

### P3-1. Race `useModerationQueue` (P2-1 vecchia) — ancora non testata
- **File:riga**: `app/components/moderation/useModerationQueue.tsx:49-70` + `:137`; `tests/client-moderation-dashboard.test.mjs` senza test di risposte asimmetriche
- **Problema**: invariato. `loadQueue` non abortisce il fetch precedente quando chiamata da `decide()`; due decisioni ravvicinate → risposte fuori ordine possibili. Nessun test con delay asimmetrici.
- **Test mancante proposto**: come da review-grace.md P2-1 (prima risposta lenta + seconda veloce → stato finale = seconda; due decide → un solo fetch aggiuntivo).

### P3-2. `VerificationWidget` — doppio click non testato (P2-2 vecchia)
- **File:riga**: `app/components/VerificationWidget.tsx:88-108` — handler senza `if (toggleBusy) return;`; `client-verify-toggle.test.mjs:108` testa solo il disabled del button
- **Problema**: il disabled del button mitiga il click UI ma un doppio click prima del re-render di `busy` (o AT/azione programmatica) può ancora emettere 2 PUT/DELETE. Il comportamento non è pinnato da test.
- **Test mancante proposto**: doppio click rapido con fetch mock → `requests.filter(PUT/DELETE).length <= 1` durante `busy`.

### P3-3. Target-size 2.5.8 esplicito solo sul toggle; criteri 2.2 nuovi mai nominati nei test
- **File:riga**: `tests/a11y-interactive.test.mjs:388` (unico assert 44×44); Lighthouse copre le pagine auth ma con gate a livello categoria (>= 0.95), non per singolo criterio
- **Problema**: mitigato dal nuovo Lighthouse su /login /register /account (P1-2 chiuso), ma se il gate scende sotto 0.95 non si sa QUALE criterio 2.2 AA è fallito (2.4.11, 2.5.8, 3.3.7, 3.3.8...). Nessun test esplicito per 2.4.11/3.3.7/3.3.8/2.5.7/3.2.6.
- **Test mancante proposto**: estendere `a11y-interactive.test.mjs` con assert target-size sui button dei form auth (Log in, Create account, Sign in with passkey, Continue with GitHub/Google) — min-width/min-height ≥ 24×24 (o 44×44 standard progetto), come già fatto per il toggle.

### P3-4. Abort walk filtrato inter-pagina non testato (P2-6 vecchia, parziale)
- **File:riga**: `tests/refetch-loop.test.mjs` (3 test: fetch count FLAT) — non copre il cambio filtro A→B a metà walk con risposta di A che tenta di applicarsi
- **Test mancante proposto**: come da review-grace.md P2-6 (cambio filtro durante il walk → nessuna setRecords con dati del filtro vecchio; fetch si ferma dopo l'abort).

### P3-5. `usePublicCount` senza AbortController (P3-1 vecchia)
- **File:riga**: `app/lib/use-public-count.ts:25-48` — solo flag `cancelled`, fetch non abortita su unmount. Invariato; nessun test.

---

## Riepilogo priorità

| ID | Priorità | Area | Tipo |
|---|---|---|---|
| P1-1 | P1 | route auth nuove (passkey/recovery/logout/reset) | Rami 429/503/414 senza test; coverage 77-86% |
| P1-2 | P1 | `app/lib/mailer.ts` 84.38%, branch 66.67% | Wrapper mailer con rami scoperti |
| P2-1 | P2 | `qa-multiauth` / `auth-verify-e2e` | Rate-limit mail 3/h non coperto in E2E completo |
| P2-2 | P2 | `qa-multiauth-write-gate-e2e` | Merge OIDC manuale senza E2E reale |
| P2-3 | P2 | `client-account.test.mjs` | Enroll passkey senza WebAuthn non pinnato |
| P2-4 | P2 | `cameras/route.ts:153`, `search/route.ts:93` | Offset non clampato (P2-5 vecchia, aperta) |
| P3-1 | P3 | `useModerationQueue.tsx:137` | Race double-fetch non testata (P2-1 vecchia) |
| P3-2 | P3 | `VerificationWidget.tsx:88` | Doppio click non testato (P2-2 vecchia) |
| P3-3 | P3 | a11y suite | 2.5.8 esplicito solo sul toggle; criteri 2.2 nuovi mai nominati |
| P3-4 | P3 | `refetch-loop.test.mjs` | Abort walk inter-pagina non testato (P2-6 vecchia) |
| P3-5 | P3 | `use-public-count.ts` | Fetch senza abort (P3-1 vecchia) |

## Punti di forza confermati (non richiedono azione)

- **Cerimonie WebAuthn REALI (Fase G, PR #241)**: `tests/helpers/webauthn-fixtures.mjs` costruisce keypair EC P-256, attestationObject CBOR (fmt "none", privacy by design), authenticatorData con COSE key e assertion ECDSA-SHA256 firmate — la verifica `verifyRegistrationResponse`/`verifyAuthenticationResponse` di @simplewebauthn/server gira DAVVERO (non solo rejection paths come nelle suite di fase): enroll → login → write 201, verificato. Eccellente.
- **Counter replay**: testato sia a unit (`isCounterAdvancementOk` 0→0 ok, 5→5 no, 1→0 ok) sia E2E con assertion ri-firmata a counter non avanzato → 401 (qa-multiauth:330-353). Il counter è persistito e riletto dal DB reale.
- **Challenge hash-only + single-use**: `passkey-d1.test.mjs` prova che il DB contiene solo SHA-256 del challenge, che consume è single-use anche in race (due consumer, un vincitore) e che il TTL 10 min è applicato. Recovery codes: 10 codici, solo hash nel DB, re-issue revoca i vecchi (testato).
- **Token verifica scaduti/riusati**: 410 per usati E scaduti, purpose-bound (verify ≠ reset), revoca dei token più vecchi al resend, anti-enumeration (400 generico = token ignoto/erased). Coperto a route (`api-auth.test.mjs`), a db (`auth-d1.test.mjs` — incluso race single-winner) ed E2E (`auth-verify-e2e`, `qa-multiauth:356-384` con TTL forzato nel passato).
- **Write gate 401/403**: `write-gate.test.mjs` (20 test) + enforcement su TUTTE e 4 le route di scrittura (cameras, corrections, photos, confirmation PUT/DELETE) con body canonico anti-enumeration e no-store; attraversato da OGNI metodo auth (email verify, recovery, passkey, OIDC) con scrittura reale 201 in Fase G.
- **Rate limit mail 3/h**: SQL reale (`email_send_log`, migration 0029) — finestra rolling, Retry-After calcolato (3600/1800), per-contributor, budget NON consumato su fail-closed (senza VERIFY_BASE_URL o binding rotto), nessun dato personale nel log (solo contributor_id/kind/sent_at). `mailer.test.mjs` 16 test, `db/mailer.ts` 100%.
- **OIDC privacy (Fase D)**: email del provider MAI persistita (placeholder RFC 2606 `oidc.github.<sub>@invalid`), state single-use provider-bound, merge manuale con token single-use e 410 su riuso, anti-enumeration su merge (401 identico per email sconosciuta/password errata/account diverso), discovery Google a /start. `oidc-d1.test.mjs` + `oidc-flow.test.mjs` (27 test).
- **Lighthouse /login multi-metodo**: le 3 pagine auth nel gate `categories:accessibility >= 0.95` (Chromium reale — color-contrast, target-size, link-in-text-block); axe SSR con runOnly wcag22aa su tutte le route del registry incluse login/register/account (gate qa-phase-gate pinna la derivazione da `registeredRoutes()`).
- **Post-fix copertura**: auth/me 54.72→96.52%, camera-edits 76.45→89.83%, users 82.05→100% — tutti i P1 della review precedente chiusi e verificati con esecuzione reale.
- **Igiene fixture**: nessun dato personale reale (solo example.org/.test/.invalid, email derivate da UUID), nessuna rete reale (provider OIDC stubato, mailer su dev path), no-store ovunque sui dati personali.

---

*Verifica eseguita sul clone locale del repo (workspace kanban), checkout `c5d35d0`; `npm install` + `npm test` (1704/1704 PASS) + `npm run coverage` + `npm run coverage:docs` (94.52% righe, gate CI verde). Nessuna modifica al codice di produzione; unico output: questo report.*
