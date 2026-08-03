# Review tecnica 2 — open-surveillance-db @ `c5d35d0` (main)

**Autore:** Linus (sviluppatore backend/API)
**Data:** 2026-08-03
**Scope:** revisione completa del codice di produzione nella mansione dev su main @ `c5d35d0` — worker edge (`worker/index.ts`), layer dati (`db/*`), route API (`app/api/*`), lib condivise (`app/lib/*`), migrazioni (`drizzle/0027–0031`), CI (`.github/workflows/*`). Focus sul workstream auth multi-metodo (passkey WebAuthn, OIDC GitHub/Google, verifica email, write gate, mailer Cloudflare, schema 0027–0031, ADR 0020) + verifica dei fix del ciclo precedente (P1-1 chunking, P1-2 updated ISO, PBKDF2 iterations, R2 orfane, write gate) + regressioni dal redesign /directory e dai fix /mappa.
**Metodo:** lettura integrale dei moduli nuovi/modificati (db/auth.ts 1084 righe, db/passkeys.ts, db/oidc.ts, db/mailer.ts, db/schema.ts, worker/index.ts, 20 route `app/api/auth/*`, app/lib/auth-*, write-gate, csrf, rate-limit, oidc, passkey, mailer, email-templates), grep mirati sulle duplicazioni e sui punti di scrittura, diff `6f56d22..c5d35d0`, esecuzione locale della suite completa. **Nessuna modifica applicata** (review-only).

---

## Sintesi esecutiva

Il workstream auth multi-metodo è progettato e implementato con **qualità alta**: fail-closed ovunque, hash-only per ogni token (sessioni, challenge WebAuthn, recovery codes, OIDC state/merge, verify/reset), single-use con UPDATE condizionale atomico, TTL + sweep, anti-enumeration su tutti i percorsi, write gate uniforme. Migrazioni 0027–0031 eccellenti e ben documentate. **Nessuna vulnerabilità sfruttabile (P0) trovata.**

Il problema principale è **l'integrazione incompleta del mailer A2**: il modulo `db/mailer.ts` (rate limit via `email_send_log`, fail-closed su `VERIFY_BASE_URL`, templates bilingui) è **codice morto in produzione** — nessun route lo importa. I tre route live (register, verify-email/resend, reset-password/request) usano il mailer "homegrown" `app/lib/mailer.ts`, che ha un **sender di default non allineato all'allowlist del binding EMAIL** (`no-reply@…` vs `noreply@…`): in produzione con configurazione di default ogni email di verifica/reset verrebbe rifiutata dal provider (E_SENDER_NOT_VERIFIED), l'errore viene inghiottito, e gli utenti non riceverebbero MAI il link — con il write gate che blocca di conseguenza tutti gli invii. Inoltre il mailer live espone `verification.devLink` (il token grezzo) nella risposta API ogni volta che il binding EMAIL è assente, in qualunque ambiente (fail-open su un controllo di sicurezza).

Secondo filone: **l'atomicità dei write path multi-statement resta irrisolta** (P1-1 del ciclo 1): moderazione, appeals, e i NUOVI percorsi reset-password/confirm e linkExternalIdentity girano come statement separati, non in `d1.batch()`.

Conteggio per priorità: **P0: 0 · P1: 2 · P2: 6 · P3: 9** (di cui 4 carry-over dal ciclo 1 non risolti).

---

## Verifica dei fix del ciclo precedente — TUTTI OK

| Fix | Commit/PR | Verdetto | Evidenza |
|---|---|---|---|
| P1-1 chunking `confirmationCountsFor` @100 (503 su GET /api/cameras >100 record) | 72b8091 (#220) | ✅ FIXED | `db/confirmations.ts:101-127`: loop `offset += 100`, `IN (...)` per chunk, merge in un Map. |
| P1-2 `cameras.updated` sempre ISO | d335978 (#226) + 43db967 | ✅ FIXED | Zero stringhe prosa: `getCameraTransition` (db/moderation.ts:858-910) ritorna `updated: nowIso`; `createPendingCamera` scrive `now`; camera-edits:391 `binds.push(input.now)`; appeals:277 `.bind(now,…)`; retention:311 `.bind(now,…)`; applyCorrectionOutcome (moderation.ts:1395-1429) `nowIso`. Grep `updated = '<prosa>'` = 0 hit. |
| PBKDF2 iterations embedded nell'hash | d9abbde (#224) | ✅ FIXED | `db/auth.ts:117-151`: formato `pbkdf2$<iterations>$<salt>$<hash>` con iterations parsate dall'hash; fallback 3-part legacy → costante corrente. `hashPassword` usa 210.000. |
| R2 orfane se INSERT D1 fallisce | 639ed16 (#223) | ✅ FIXED | `db/photos.ts:96-133`: catch sull'INSERT → `env.PHOTOS.delete(storageKey)` best-effort, poi rethrow; chiave UUID fresca per tentativo (retry idempotente). |
| Write gate (Fase E1) | 328016b (#236) | ✅ FIXED | `app/lib/write-gate.ts` + `requireVerifiedContributor` sui 4 endpoint pubblici (POST cameras/corrections/photos, PUT/DELETE confirmation): 401 anonimo / 403 non-verificato con body unico anti-enumeration. Test dedicati verdi. |
| P1-4 paginazione nearby/search in SQL | 2985618 (#227) | ✅ FIXED | `db/cameras.ts:385-462`: `SQL_HAVERSINE_DISTANCE` in SQL, `LIMIT/OFFSET` nel DB, `COUNT` per `total`, merge delle due funzioni duplicate dietro `findPublicCamerasNearPage(defaultLimit)`. |
| Fix sicurezza appeals identity (spoofable email bridge) | t_5ca60ab2 (#222) | ✅ FIXED | `app/api/appeals/route.ts`: `getUserByContributorId` al posto di `getUserByEmail` (bridge esplicito `users.contributor_id`). |

**Esecuzione locale:** suite completa `npm test` (build vinext + node --test) su `c5d35d0`: **1704 test, 0 fail** (~124 s). Batch mirato auth (mailer, write-gate, auth-verify-e2e, passkey-d1, oidc-d1, auth-flow-e2e, worker-edge, anti-gaming): 132/132 verdi.

---

## P1 — Da correggere prima (correttezza / funzionalità)

### P1-1 · Mailer A2 non integrato: `db/mailer.ts` è codice morto, il rate limit `email_send_log` non è mai attivo, e il mailer live ha un sender non allineato al binding EMAIL (→ email mai consegnate in produzione)

**File:** `db/mailer.ts` (intero, 257 righe), `db/schema.ts:689-701` (`emailSendLog`), `drizzle/0029_email_send_log.sql`, `app/lib/email-templates.ts` (200 righe), `app/lib/mailer.ts` (il percorso live), `app/api/auth/register/route.ts:104`, `app/api/auth/verify-email/resend/route.ts:75`, `app/api/auth/reset-password/request/route.ts:75`, `worker/index.ts:33-34` (env `EMAIL_SEND_LIMIT_*`), `wrangler.jsonc:23`.

**Problema (4 facce dello stesso disallineamento):**

1. **Dead code.** `db/mailer.ts` (`sendAuthEmail`, `canSendAuthEmail`, `recordEmailSend`, `emailSendLimits`) e `app/lib/email-templates.ts` (`renderAuthEmail`, `buildAuthActionUrl`) sono importati **solo** da `tests/mailer.test.mjs` e dal test harness — nessun file di produzione. I tre route live usano il mailer Fase B `app/lib/mailer.ts` (`sendVerificationEmail` / `sendPasswordResetEmail`), che NON scrive `email_send_log`. La tabella `email_send_log` (migration 0029) resta **sempre vuota in produzione**: il rate limit "3 email/h per contributor via email_send_log" documentato in ADR 0020 decision 2, nelle migrazioni 0029/0031, in `worker/index.ts` e in `docs/DEPLOYMENT.md` **non esiste nel percorso di richiesta**. Il commit 9d5d177 (#234, A2) dichiarava la consegna; il successivo 8fbed56 (#237, Fase B) ha cablato i route sul mailer homegrown e l'integrazione non è mai avvenuta (il commento in `app/lib/mailer.ts:65` dice "the A2 canonical implementation this module mirrors" — un mirror che non è mai stato sostituito).

2. **Sender mismatch → email rifiutate in produzione.** Il binding EMAIL ha `allowed_sender_addresses: ["noreply@opensurveillancedb.org"]` (wrangler.jsonc:23). Il mailer **live** ha `DEFAULT_FROM = "no-reply@opensurveillancedb.org"` (app/lib/mailer.ts:31, trattino!) e legge l'env `MAIL_FROM` (riga 41) — un nome che **non esiste** nell'interfaccia `Env` del worker (worker/index.ts dichiara solo `MAILER_FROM`, riga 31) e che la documentazione non cita (docs/DEPLOYMENT.md:478 documenta `MAILER_FROM`, default `noreply@…` senza trattino, "Must be in the EMAIL binding's allowed_sender_addresses or the provider rejects with E_SENDER_NOT_VERIFIED"). In produzione con default: `from = no-reply@opensurveillancedb.org` → fuori allowlist → **ogni invio fallisce**. `deliver()` inghiotte l'errore (`delivered:false`), la registrazione risponde 201, ma il link non parte mai; re-send idem → l'utente resta non verificato e il write gate blocca ogni invio. Il bug è mascherato da "mail never breaks auth".

3. **Fail-open sul token.** Quando il binding EMAIL è assente, `app/lib/mailer.ts:68-72` ritorna `devLink` (l'URL col token grezzo) e i route register/resend lo **echeggiano nella risposta API** (`verification.devLink`, register:121; resend:84). Il codice non distingue dev da prod: una produzione a cui manca il binding (config errata, binding non applicato) **espone il token di verifica via API**. Il commento ("a real deployment (binding present) never exposes the token") descrive l'intento, non il comportamento del codice. Il design A2 (`sendAuthEmail`) era fail-closed (`missing_config` senza `VERIFY_BASE_URL`, nessun token in risposta) — è morto con db/mailer.ts.

4. **Doppio contatore con semantica diversa.** Il budget reale è `countVerificationTokensSentSince` (db/auth.ts:753-766): conta i **token creati** per purpose nell'ora. (a) Conta anche gli invii falliti: in register il token viene mintato prima del send (register:103), quindi 3 invii falliti bruciano il budget orario pur non essendo partita alcuna email. (b) La migration 0031 commenta "each purpose gets its own 3/h send limit … a reset burst can never exhaust the verification budget or vice versa": i budget per-purpose esistono solo nel contatore token; il contatore `email_send_log` (morto) non filtra per `kind` nonostante la colonna sia lì.

**Fix suggeriti (in ordine):**
- Cablare i tre route su `sendAuthEmail` (db/mailer.ts) e rimuovere il percorso `app/lib/mailer.ts` (o viceversa: unificare); in ogni caso **una sola** implementazione live.
- Allineare il sender di default all'allowlist (`noreply@opensurveillancedb.org`) e usare `MAILER_FROM` (l'env dichiarato) nel mailer live.
- Echo di `devLink` solo quando anche `VERIFY_BASE_URL` è assente (segnale dev esplicito), oppure dietro un flag `ENV=development` — mai con il solo binding mancante.
- Decidere e documentare quale contatore è il budget (token-mint vs send-log) e far sì che gli invii falliti non consumino il budget (l'approccio `email_send_log` scrive solo dopo l'accettazione del provider, db/mailer.ts:214-216).

### P1-2 · (Carry-over ciclo 1) Write path di moderazione/appeals non atomici — non risolto

**File:** `db/moderation.ts:794-855` (moderateCamera), `:1090-1136` (moderateCorrection), `:1281-1325` (moderateCameraEdit), `db/photos.ts:267-293` (moderatePhoto), `db/appeals.ts:175-197` (fileAppeal), `:261-305` (decideAppeal: UPDATE appeal → UPDATE cameras/corrections + `reopenQueueForItem` → `recordModerationEvent`, tutti `await` separati), `db/moderation.ts:542-576` (runFreshnessSweep: UPDATE+INSERT in loop, P2-10 ciclo 1).

**Problema:** ogni decisione esegue UPDATE entità + INSERT `moderation_events` + UPDATE `moderation_queue` come statement separati, senza `d1.batch()`. Un crash a metà buca il trail append-only o lascia la queue aperta con entità terminale. È la classe di inconsistenza che il P1-1 del ciclo 1 aveva segnalato e che il fix 72b8091 (chunking) non tocca. Il codice conosce già `d1.batch()` (retention, eraseContributor, createVerificationToken).

**Fix:** `d1.batch([UPDATE entità, INSERT event, UPDATE queue])` per decisione (100 statement max/batch, come retention). Il read-back `loadCamera(d1, id)!` dopo RETURNING (es. moderation.ts:738, 767, 838…) diventa superfluo: la riga aggiornata è già nel RETURNING.

---

## P2 — Debito tecnico / correttezza secondaria

### P2-1 · reset-password/confirm: tre statement non atomici (rotate → revoke → verify)
**File:** `app/api/auth/reset-password/confirm/route.ts:70-72` — `resetContributorPassword`, `revokeAllContributorSessions`, `markContributorEmailVerified` come `await` separati. Il commento (riga 67-69) asserisce che la revoca "happens before the response so a stolen old session cannot race the reset", ma la sequenza non è atomica: tra il rotate e la revoca c'è una finestra di 2 round-trip D1 in cui una sessione vecchia rubata può ancora scrivere. Impatto: finestra millisecondi e richiede una sessione già compromessa; stessa classe del P1-1 ma conseguenza contenuta. **Fix:** `d1.batch([...])` (markContributorEmailVerified è l'unico con RETURNING: ultimo nello batch, `first<>` sul risultato).

### P2-2 · linkExternalIdentity: link + consume non atomici
**File:** `db/oidc.ts:266-298` — l'UPDATE su `contributors` (con subquery `used_at IS NULL AND expires_at > ?`) e il successivo UPDATE di consume su `oidc_merge_requests` sono due statement separati. La single-use è comunque garantita dal predicato nella subquery (un merge già consumato non rilinka) e la scrittura è idempotente (stessi valori), ma due richieste concorrenti possono entrambe superare il gate `used_at IS NULL` prima del consume. **Fix:** `d1.batch([...])`; il commento di riga 127 ("Atomically consume") non corrisponde all'implementazione.

### P2-3 · (Carry-over) `parseCookies`: `decodeURIComponent` senza try/catch
**File:** `app/lib/csrf.ts:43` — cookie malformato (`%zz`) → `URIError` → 500 su ogni route che legge cookie (`resolveOptionalContributor`). Già segnalato come P2-16 nel ciclo 1, **ancora aperto**. Fix: `try { decodeURIComponent(value) } catch { value }`.

### P2-4 · (Carry-over) `countVerifiedCameras` ≡ `verifiedContributionCount`
**File:** `db/auth.ts:977-984` e `db/confirmations.ts:85-92` — stessa identica query (`COUNT(*) FROM cameras WHERE contributor_id = ? AND status = 'verified'`). P2-3 del ciclo 1, **ancora aperto**. Una funzione, l'altra re-export.

### P2-5 · (Carry-over) SELECT colonne `cameras` duplicata
**File:** `db/cameras.ts:118, 193/258, 293, 359` (inline, 5×) + `db/moderation.ts:267-268` (`cameraColumns`) + `db/camera-edits.ts:319-320` (`ownerColumns`) — la proiezione pubblica (CASE `publish_*`) è riscritta in 7 punti. P2-1 del ciclo 1, **ancora aperto**. Una costante esportata (`CAMERA_PUBLIC_COLUMNS`) riusata da tutti.

### P2-6 · (Carry-over) `setConfirmation`: doppia SELECT sulla stessa camera
**File:** `db/confirmations.ts:176-196` — la prima SELECT carica la riga, la seconda rifà il public check. P2-15 del ciclo 1, **ancora aperto**. Unire in una sola query con il predicato pubblico.

---

## P3 — Pulizia / manutenibilità

### P3-1 · Commento stale sul level gate in `db/confirmations.ts:15-16`
"level gate (>= 1 verified contribution, **never email verification — no mailer exists**, ADR 0013)": il mailer esiste (Fase A2) e il write gate E1 richiede proprio l'email verification (stacking documentato nel commento della route confirmation, "Decision point flagged for Ada"). La logica è invariata e corretta; il commento è fuorviante.

### P3-2 · Due mailer + due set di template
`app/lib/mailer.ts` (template inline EN-only, sender `no-reply`) vs `db/mailer.ts` + `app/lib/email-templates.ts` (template bilingui EN/IT, sender `noreply`, fail-closed). Il P1-1 li unifica; qui si annota anche la divergenza di copia (i template A2 sono bilingui ADR 0007, quelli live solo EN).

### P3-3 · `buildAuthActionUrl` punta a `/api/auth/reset-password` (GET) che non esiste
`app/lib/email-templates.ts:52` genera il link reset su `/api/auth/reset-password` — non esiste una GET lì (i route sono POST `/api/auth/reset-password/request` e `/confirm`; la pagina client è `/reset-password`). Morto con db/mailer.ts, ma se il P1-1 lo riattiva senza correggerlo genera link 404. Il mailer live invece punta correttamente a `/reset-password`.

### P3-4 · `issueRecoveryCodes`: DELETE + 10 INSERT non atomici, N+1
`db/passkeys.ts:282-304` — DELETE dei codici inutilizzati, poi 10 INSERT `await` seriali. (a) Se il processo muore dopo il DELETE, i vecchi codici sono revocati ma i nuovi non persistono; (b) 11 round-trip seriali (→ `d1.batch`); (c) dopo un `createPasskey` riuscito con `issueRecoveryCodes` fallito, il retry risponde 409 (passkey già presente) e il re-enroll resta bloccato finché l'utente non elimina la passkey. Invertire l'ordine (INSERT nuovi → DELETE vecchi) o batch.

### P3-5 · `eraseContributor` non pulisce esplicitamente le nuove tabelle auth
`db/auth.ts:1060-1081` — il batch elimina `camera_confirmations`, `sessions` e `contributors`, de-attribuisce cameras/corrections/edits e severs `users`. Le nuove tabelle (`passkeys`, `recovery_codes`, `webauthn_challenges`, `email_verification_tokens`, `email_send_log`, `oidc_merge_requests`) si affidano al CASCADE D1 reale (presente nelle migrazioni → ok in produzione), ma il commento dichiara "the app layer must be the source of truth" perché il test harness non applica le FK: le righe orfane resterebbero nel harness. Aggiungerle al batch per coerenza col principio dichiarato (e con `login_attempts`, che non ha FK).

### P3-6 · register/complete passkey: il consume della challenge non verifica il contributor
`app/api/auth/passkey/register/complete/route.ts:63-69` — `consumeWebAuthnChallenge` controlla solo `kind === 'register'`, non `contributorId === resolved.contributor.id`. Il legame è implicito (il challenge raw esiste solo nel browser che ha iniziato la cerimonia con sessione+CSRF), ma un check difensivo esplicito è gratuito.

### P3-7 · reset-password/request non filtra `auth_provider`
`app/api/auth/reset-password/request/route.ts:57` — un account OIDC-only (placeholder `oidc.<provider>.<sub>@invalid`, hash inutilizzabile) può ricevere un token reset se l'attaccante conosce il placeholder: l'email non è instradabile, quindi il link non arriva, ma il budget reset (3/h) viene consumato e il token resta valido 24h. DoS contenuto del budget; considerare `authProvider === 'password'` come precondizione.

### P3-8 · `retryAfterSeconds` impreciso nei route verify/resend
`app/api/auth/verify-email/resend/route.ts:64-67` e `reset-password/request/route.ts:64-67` calcolano Retry-After sull'intera finestra residua (fino a 3600 s) invece che dal row più vecchio (come fa `canSendAuthEmail` — morto). Sicuro ma fuorviante per il client.

### P3-9 · Nome divergente del write gate nei documenti
ADR 0020 decision 2 cita `resolveVerifiedContributor`; il simbolo reale è `requireVerifiedContributor` (app/lib/write-gate.ts:69). Aggiornare l'ADR.

---

## Regressioni / workstream adiacenti (nessuna azione o già ok)

- **Redesign /directory (t_127492f1, #231) + CEO feedback /mappa (43db967, #229):** nessuna regressione trovata. Export CSV/GeoJSON spostati in /directory con filtri server-side applicati (`exportHref`), banner prototipo rimosso, count/reset allineati, `usePlaceSearch` estratto e condiviso. `usePlaceSearch` gestisce 404/429/!ok con messaggi dedicati.
- **Paginazione search/nearby:** i route `/api/cameras/search` e `/nearby` usano `findPublicCamerasNearPage` con il contratto `{ records, total, nextOffset }`; test `url-state-contract` e `api-cameras` coprono il clamp.
- **GET /api/photos ora rate-limited** (bucket `read`, 60/min): chiuso il gap di scraping segnalato in t_5ca60ab2.
- **Worker edge:** nessun cambiamento regressivo; `sweepOidcExpired` aggiunto al cron giornaliero, fail-closed invariato. Nota: `sweepExpiredWebAuthnChallenges` (10-min TTL) è chiamato opportunisticamente nei begin ceremony (passkeys.ts:168-177), non nel cron — corretto per il TTL breve.
- **CI:** gitleaks su push a main ora scansiona `before..after` (d344e9b, #238) — chiude la regressione dei falsi positivi; npm audit `--omit=dev` come gate + report completo non-bloccante; soglia coverage 75.
- **Passkey login/complete:** 5 layer di verifica (consume single-use → credenziale esistente → firma COSE → userHandle binding → signature-counter anti-clone) con 401 uniforme. Eccellente.
- **OIDC:** PKCE S256, stato single-use con TTL 10', merge manuale con proof della password + lockout ADR 0016, email del provider mai persistita (placeholder RFC 2606), `redirect_to` sanitizzato (niente schemi/`//`/backslash). Eccellente.
- **Write gate:** i 4 endpoint pubblici; appeals/edit/moderation restano sui loro gate dedicati (coerente con la spec E1).

---

## Punti di forza da preservare (nessuna azione)

- Migrazioni 0027–0031: hash-only ovunque, single-use atomico, TTL + indici per sweep, commenti che spiegano il perché; smoke test che impone zero righe seed.
- Modello token unificato (verify/reset) con revoca dei token più vecchi alla re-emissione e 410 sul replay.
- Write gate con body unico anti-enumeration (401/403 indistinguibili nel payload) e `no-store`.
- Lockout per-email (hash, mai IP) con escalation esponenziale a cap; applicato anche al merge OIDC.
- `safeRedirectTarget` e `sessionTtlSeconds` come unica fonte del TTL cookie/DB.
- Il fix `getUserByContributorId` (niente più bridge per email spoofabile).
- Assenza di `@ts-ignore`/`any` diffusi; zero TODO/FIXME nuovi; test 1704 verdi locali.

---

## Appendice — numeri

- Diff `6f56d22..c5d35d0`: 175 file, +28.996/−1.475 (workstream auth + directory/mappa).
- Nuovi moduli auth: `db/{auth,+319,passkeys 340,oidc 327,mailer 257,users +16}`, `app/lib/{auth-session,auth-route-helpers,authz,write-gate,oidc,passkey,webauthn-client,mailer,email-templates}`, 20 route `app/api/auth/*` (~2.013 righe).
- Migrazioni: 0027 (84), 0028 (41), 0029 (35), 0030 (79), 0031 (30).
- Suite completa eseguita su c5d35d0: **1704 test, 0 fail** (build vinext inclusa, ~124 s).
- Fix ciclo precedente verificati: 6/6 OK (vedi tabella).
- Carry-over aperti dal ciclo 1: P1 atomicità moderazione; P2-3, P2-15, P2-16 (duplicazioni/parseCookies).
