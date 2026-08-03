# REVIEW TOTALE 2 — Architettura e Design (Ada, CTO)

- **Data:** 2026-08-03
- **Commit verificato:** `c5d35d0` (main, HEAD — fix auth #243)
- **Metodo:** lettura integrale del nuovo workstream auth (~6.800 righe: `db/auth.ts`,
  `db/passkeys.ts`, `db/oidc.ts`, `db/mailer.ts`, `db/users.ts`, `app/api/auth/*` (14 route),
  `app/lib/{auth-session,csrf,rate-limit,write-gate,passkey,oidc,mailer,email-templates,webauthn-client,confirm-ip-burst,photo-quota}.ts`,
  `worker/index.ts`, migrazioni 0026–0031, `db/schema.ts`, `db/retention.ts`) + verifica puntuale
  dei 5 fix del ciclo precedente + test di sicurezza (write-gate, qa-multiauth-write-gate-e2e,
  mailer, auth-d1, api-auth, anti-gaming). Nessuna esecuzione di suite (review statica);
  i riferimenti `file:riga` sono sul commit indicato.
- **Scopo:** solo review — nessuna modifica al codice. Fix proposti per priorità (P0–P3).

---

## Sintesi esecutiva

Il workstream auth multi-metodo (Fase A–G, ADR 0020) è **architetturalmente solido**: la
progettazione della sicurezza è coerente con l'ADR su tutta la superficie (token SHA-256
single-use, write gate fail-closed con body canonico anti-enumerazione, passkey con anti-replay
del signature counter, OIDC senza import email e con merge manuale anti-takeover, PKCE, erasure
estesa, mailer zero-tracking, PRIVACY_NOTICE v0.10 e PROCESSOR_REGISTER PR5/PR6 conditional con
activation gate). **Tutti e 5 i fix del ciclo precedente sono verificati sul codice reale e
corretti.** Nessun P0.

I problemi veri sono **1 vulnerabilità di sicurezza attiva (P1)** — un oracolo di enumerazione
account sull'endpoint pubblico di password reset, che viola il contratto anti-enumeration
dichiarato nella stessa route ed è pinnato da un test — più **2 incoerenze P2** (doppio mailer con
drift: il modulo "canonico" fail-closed è morto e `email_send_log` non viene mai scritto;
erasure delle nuove tabelle auth affidata solo al CASCADE FK, che l'harness di test non applica)
e **6 P3** nuovi + i P3 del ciclo 1 ancora aperti (tutti di manutenibilità, nessuno di sicurezza).

---

## Verifica fix del ciclo precedente (review-ada.md @6f56d22)

| Fix | Esito | Verifica sul codice |
|---|---|---|
| **P1-1** — `confirmationCountsFor()` >100 bound params D1 | ✅ **Corretto** | `db/confirmations.ts:101-127`: chunking a 100 con merge in `Map` (pattern `db/moderation.ts`), chiamato da `listPublicCamerasPage` (`db/cameras.ts:196-202`) e `getPublicCameraById` (`:299`). |
| **P1-2** — `verifyPassword()` ignora le iterations salvate | ✅ **Corretto** | `db/auth.ts:117-151`: il count embedded nel formato `pbkdf2$<iter>$<salt>$<hash>` guida la derivazione; fallback alla costante solo per hash legacy a 3 parti. `derivePasswordKey(password, salt, iterations)` onora il valore passato (`:86-109`). Commit d9abbde. |
| **P2-2** — TTL sessione divergente DB/cookie | ✅ **Corretto** | Tutti e 6 i `createSession` passano `ttlSeconds: sessionTtlSeconds(env)` (login `:94-99`, register `:110-116`, passkey login complete `:131-133`, OIDC callback `:134-139`, OIDC merge `:142-147`, recovery `:70-72`); `createSession` privilegia `ttlSeconds` su `ttlDays` (`db/auth.ts:505-513`). |
| **P2-3** — Attribuzione appelli spoofabile via email | ✅ **Corretto** | `users.contributor_id` esplicito (migrazione 0026, `db/users.ts:62-68`); `POST /api/appeals` usa `getUserByContributorId` (`app/api/appeals/route.ts:134`), mai email equality; severance esplicita in `eraseContributor` (`db/auth.ts:1074`); unlinked/unprovisioned → 401. |
| **P2-4** — `GET /api/photos` senza rate limit | ✅ **Corretto** | `app/api/photos/route.ts:203-222`: bucket `read` (default 60/min, `READ_RATE_LIMIT_*`) prima della query. |
| **P2-1** — XFF spoofabile fuori da CF | ✅ **Mitigato (documentazione)** | `docs/LOCAL_PLAYBOOK.md:19-30` + `docs/workstreams/OPS_OPEN.md` "Service protections": i bucket sono esplicitamente dichiarati non-boundary di sicurezza su LAN, `cf-connecting-ip` richiesto in produzione. Il codice `callerKey` è invariato (accettabile: è la mitigazione documentata richiesta). |
| **P3-2** — Paginazione nearby/search in memoria | ✅ **Corretto** | `db/cameras.ts:456`: distanza haversine in SQL + `LIMIT/OFFSET` (commit 2985618). |
| **P3-3** — Foto R2 orfane su errore D1 | ✅ **Corretto** | `db/photos.ts:118-130`: catch con `PHOTOS.delete(storageKey)` best-effort prima del rethrow. |
| **P3-4** — `PATCH /api/auth/me` senza `readJsonBody` | ✅ **Corretto** | `app/api/auth/me/route.ts:92-101`: `readJsonBody` + mapping `BodyReadError` → 413/400. |
| **P3-8** — Type-lie `confirmationCount` su export | ✅ **Corretto** | `db/cameras.ts:196-202`: popolato via `confirmationCountsFor` chunked. |
| **P3-1 / P3-5 / P3-6 / P3-7 / P3-9 / P3-10** | ⏳ **Ancora aperti** | `getDb()` dead code (`db/index.ts:5`); `parseCookies` URIError (`app/lib/csrf.ts:43`); freshness sweep su GET (`db/moderation.ts:424`); walkPages N-request (`app/lib/use-public-cameras.ts`); docs stale (`docs/STATUS.md` fermo al 2026-08-02, non cita auth); `login_attempts` senza retention (nessuna R8 in `db/retention.ts`). Backlog, nessuno urgente. |

---

## Workstream auth (ADR 0020) — punti di forza confermati

- **Write gate fail-closed a body canonico unico** (`app/lib/write-gate.ts`): 401 anonimo / 403
  non verificato / ok verificato, stesso `WRITE_GATE_ERROR` su tutte e 4 le route write
  (`cameras` POST `:201`, `corrections` POST `:67`, `photos` POST `:116`, `confirmation`
  PUT/DELETE `:86`); `Cache-Control: no-store`; ri-letura di `email_verified_at` a ogni write
  (una sessione aperta al register diventa scrivente nell'istante della verify, senza nuovi
  cookie). Fase G (qa-multiauth-write-gate-e2e, 6 test) attraversa il gate con OGNI metodo
  (email 403→verify→201, anon 401, recovery, passkey reale con counter replay rifiutato, token
  TTL 410, OIDC).
- **Token di verifica/reset**: SHA-256 hash-only, single-use atomico (UPDATE condizionale),
  TTL 24h, re-send che revoca i token più vecchi dello stesso purpose (il link stale risponde
  410), budget 3/h per purpose contato sui token creati, anti-enumeration sui body (400/410
  generici), `no-store` ovunque.
- **Passkey**: solo COSE public key a riposo, challenge hash-only 10 min single-use,
  `attestation: none` (privacy), anti-replay del signature counter con policy spec §6.1
  (coppia di zero tollerata, ogni altro non-incremento rifiutato), 10 recovery codes hashed
  single-use restituiti una sola volta, userHandle = contributor id documentato come non-segreto.
- **OIDC**: PKCE S256, state hash-only single-use 10 min, `safeRedirectTarget` solo path
  relativi (no scheme, no `//`, no backslash — open redirect chiuso), email del provider mai
  persistita (placeholder `oidc.<provider>.<sub>@invalid` RFC 2606 che fallisce `isValidEmail`,
  quindi non instradabile né usabile per reset), merge manuale anti-takeover con prova password
  (lockout-protetto) e token single-use 15 min, `code_verifier` in chiaro solo in-flight con
  giustificazione documentata, fail-closed 503 senza client id/secret, provider attivabili solo
  dopo l'OIDC activation gate (PR5/PR6 conditional in PROCESSOR_REGISTER).
- **Erasure**: severance esplicita users→contributor (0026), revoca sessioni esplicita, batch
  atomico, de-attribuzione mai delete per i dati pubblicati; in produzione le nuove tabelle auth
  cadono per CASCADE FK (vedi però P2-2 nuovo).
- **Migrazioni 0026–0031**: hand-written + dichiarate in `db/schema.ts` (convenzione journal),
  snapshot presenti fino a 0031, smoke test "zero righe in DB fresco", `_journal.json` allineato.
- **Fix #243 verificato**: `?merge=` ripulito con `router.replace` dopo 410
  (`app/login/page.tsx:184-195`) e messaggio dedicato per 403 CSRF su passkey
  ("Invalid CSRF token. Refresh the page and try again.", register begin/complete).
- **Template email**: zero-tracking (no `<img>`, no asset remoti, un solo action URL),
  HTML+plain bilinguali EN/IT, escaping display name, test dedicati (`tests/mailer.test.mjs`).

---

## P0 — Nessun item

Nessuna vulnerabilità sfruttabile a distanza sul percorso di autenticazione, nessun secret
committato, nessuna violazione del data boundary. I token sono sempre hash-only a riposo, le
cerimonie WebAuthn verificano origine/RPID/firma, il merge OIDC richiede la password
dell'account esistente.

---

## P1 — Sicurezza attiva (corretto subito)

### P1-1. Oracolo di enumerazione account su `POST /api/auth/reset-password/request`
- **File:** `app/api/auth/reset-password/request/route.ts:62-72` (docstring `:21-25` promette
  *"EVERY request answers 200 `{ sent: true }`"*); comportamento pinnato dal test
  `tests/api-auth.test.mjs:933-946`.
- **Problema:** il ramo "budget 3/h esaurito" risponde **429 con body diverso** (`Too many reset
  emails. Please try again later.`) — ma quel ramo è raggiungibile **solo per email con account**
  (le email sconosciute escono da `findContributorByEmail` → `ok()`). Quindi, con 4 richieste a
  un indirizzo (le prime 3 creano token e fanno inviare la mail al sistema), la 4ª risponde 429
  se l'account esiste, 200 se non esiste: **oracolo binario di esistenza account su endpoint
  pubblico**, ottenibile a costo di 4 POST e di 3 mail di reset spedite alla vittima. Viola il
  contratto anti-enumeration dichiarato nella stessa route e lo standard del progetto
  (register/login/recovery/passkey rispondono tutti body-generici; il pre-check register fu
  rimosso proprio per questo, commit 4e40aa4). Impatto: enumerazione account → phishing mirato
  ai contributori verificati.
- **Fix proposto (banale):** nel ramo budget-esaurito rispondere comunque `ok()` 200
  `{ sent: true }` **senza** creare token né inviare mail (il budget è rispettato dal lato
  risorsa; la risposta non deve segnalarlo). Aggiornare il test `api-auth.test.mjs:933-946` per
  pinnare 200 + nessun token creato + nessuna mail. Stessa verifica per il mirror `verify-email/
  resend` (lì non è un oracolo — richiede sessione dell'account — ma il 429 può restare o
  diventare 200 per coerenza).

---

## P2 — Sicurezza / integrità (boundary o drift)

### P2-1. Doppio mailer con drift: il modulo "canonico" fail-closed è morto, `email_send_log` mai scritto
- **File:** `db/mailer.ts` (sendAuthEmail/canSendAuthEmail, `:90-257`) vs `app/lib/mailer.ts`
  (sendVerificationEmail/sendPasswordResetEmail); route che usano il secondo:
  `app/api/auth/register/route.ts:20`, `verify-email/resend/route.ts:11`,
  `reset-password/request/route.ts:15`; docstring del primo: `worker/index.ts:23-28`.
- **Problema:** `db/mailer.ts` (Fase A2, "canonico") non è importato da **nessuna** route di
  produzione — solo da commenti e test (`tests/mailer.test.mjs`, `tests/helpers/db-runtime-
  harness.mjs:58`). Conseguenze:
  1. **`email_send_log` (migrazione 0029) non viene mai scritta in produzione** — la tabella
     esiste, ha indici e un commento "append-only log row per send", ma zero righe.
  2. Il budget 3/h reale è applicato da `countVerificationTokensSentSince` (conteggio dei
     TOKEN creati, `db/auth.ts:753-766`), non degli invii riusciti: **un invio fallito consuma
     comunque il budget** (il token è creato prima della `send`), quindi dopo un guasto del
     mailer il re-send va in 429 per un'ora — contraddice il claim "a mail outage never breaks
     registration… the user can re-send".
  3. **`VERIFY_BASE_URL` non è fail-closed nel path reale**: `db/mailer.ts:227-234` risponde
     `missing_config` (503) senza base URL, ma le route usano `app/lib/mailer.ts:46-49` che
     **cade sul request origin**. Su un deployment non-CF con Host header controllabile, una
     richiesta di reset con `Host: evil.com` farebbe arrivare alla vittima un link di reset su
     `evil.com` → **harvesting del token → account takeover** (su CF il Host è normalizzato
     dall'edge, quindi il rischio è deployment-dipendente, come P2-1 del ciclo 1). Il docstring
     di `worker/index.ts` documenta il comportamento del modulo morto, non del path reale.
  4. `tests/mailer.test.mjs` (400 righe) pina il fail-closed e il rate-limit SQL di `db/mailer.ts`
     — comportamento che la produzione non esegue: **il test copre codice morto**.
- **Fix proposto:** unificare su un solo mailer. Strada preferita: far passare le 3 route da
  `sendAuthEmail` (`db/mailer.ts`, log dopo il successo del provider, budget reale sugli invii,
  VERIFY_BASE_URL obbligatorio) mantenendo in `app/lib/mailer.ts` solo il fallback dev/test
  (devLink) per l'harness; oppure, se si preferisce il mailer "sottile", eliminare `db/mailer.ts`
  e la migrazione 0029 e documentare il budget token-based. In ogni caso: **rimuovere il
  fallback a requestOrigin in produzione** (o validarlo) e allineare i docstring di
  `worker/index.ts` al path reale. Owner: Linus + Ada; test: Grace (ri-puntare mailer.test.mjs).

### P2-2. Erasure delle nuove tabelle auth affidata solo al CASCADE FK — divergenza harness↔prod
- **File:** `db/auth.ts:1060-1081` (`eraseContributor` — batch esplicito su confirmations,
  edit-requests, corrections, cameras, users, **sessions**, contributors; nessuna DELETE su
  `passkeys`, `recovery_codes`, `email_verification_tokens`, `email_send_log`,
  `webauthn_challenges`, `oidc_merge_requests`); commento `:1076-1078` ("the test harness does
  not enforce FKs, so the app layer must be the source of truth"); `tests/helpers/d1-sqlite.mjs`
  non imposta mai `PRAGMA foreign_keys` (default OFF); test di erasure
  `tests/anti-gaming.test.mjs:387-433` copre solo cameras/confirmations/edit/corrections/users/
  contributors.
- **Problema:** in produzione D1 il CASCADE elimina le righe auth col contributor (ADR 0020
  "erasure extends to all of it" rispettato); **nell'harness di test le righe orfane sopravvivono**
  e nessun test le verifica. Il principio dichiarato dal codice stesso ("app layer must be the
  source of truth") è applicato a `sessions` ma non alle nuove tabelle → divergenza silenziosa
  su un percorso con obbligo legale (art. 17), pronta a esplodere se un domani il backend non
  cascadesse (o se qualcuno si fidasse dell'harness per certificare l'erasure).
- **Fix proposto:** aggiungere le 6 DELETE esplicite al batch di `eraseContributor` (stesso
  pattern di `sessions`) **oppure** attivare `PRAGMA foreign_keys = ON` nell'harness e
  aggiungere al test di erasure le asserzioni sulle nuove tabelle (count 0 dopo erasure). Owner:
  Linus; test: Grace.

---

## P3 — Manutenibilità / igiene

### P3-1. Retention mancante per i token di verifica scaduti (sweep promesso e inesistente)
- **File:** `drizzle/0027_multi_auth.sql:27-28` ("The `expires_at` index serves the expiry
  sweep"), `db/retention.ts` (nessuna regola), `worker/index.ts:302-324` (cron = retention +
  sweepOidcExpired).
- **Problema:** i token `email_verification_tokens` scaduti non vengono mai cancellati: la
  migrazione promette uno sweep servito dall'indice, ma non esiste né nel cron né altrove; i
  token si cancellano solo per consume o revoca al re-send. Tabella a crescita illimitata
  (hash-only, bassa sensibilità, ma viola la minimizzazione R15 "24h, deleted on use").
  Stesso discorso per `webauthn_challenges` scaduti: lo sweep è solo opportunistico sui begin
  (`app/api/auth/passkey/{login,register}/begin`), non nel cron.
- **Fix proposto:** aggiungere al cron retention (accanto a `sweepOidcExpired`) una DELETE
  bounded su `email_verification_tokens WHERE expires_at < now` e opzionalmente centralizzare
  anche lo sweep challenge. Owner: Linus.

### P3-2. Binding del challenge di registrazione passkey non enforceato nel complete
- **File:** `app/api/auth/passkey/register/complete/route.ts:63-69` (consume) + `:93-101`
  (createPasskey con la sessione corrente).
- **Problema:** `consumeWebAuthnChallenge` restituisce la riga con `contributorId` (il
  contributor che ha iniziato la cerimonia), ma la route non verifica che coincida con la
  sessione corrente: un challenge `register` iniziato con sessione A può essere completato da
  sessione B (la passkey viene enrollata a B). Impatto oggi nullo (servono entrambe le sessioni),
  ma è il binding di difesa-in-profondità della migrazione 0028 non enforceato.
- **Fix proposto:** `if (consumed.contributorId !== resolved.contributor.id)` → 400 generico.

### P3-3. `userHandle` del challenge di login memorizzato ma mai confrontato
- **File:** `db/passkeys.ts` (colonna `user_handle`), `drizzle/0028_webauthn_challenges.sql:17-20`
  (promette: "the complete step can double-check the assertion's userHandle against it"),
  `app/api/auth/passkey/login/begin/route.ts:75-79` (store), `login/complete/route.ts:106-115`
  (check solo contro il passkey owner).
- **Problema:** il doppio-check promesso non è implementato: il `user_handle` del challenge non
  viene mai confrontato con quello dell'asserzione. Il check attuale (userHandle → passkey
  owner) è più forte, quindi nessun buco — ma il dato memorizzato è morto e il contratto della
  migrazione non è rispettato. Da allineare (confrontare o rimuovere la colonna).

### P3-4. Anti-abuso "N account usa-e-getta": il write gate alza la barra ma non chiude il farm
- **File:** `app/api/auth/register/route.ts:57` (solo bucket `auth` 10/min per caller),
  `db/confirmations.ts:68-70` (quota 20/40 per ACCOUNT/giorno, 5 per record/giorno),
  `app/lib/confirm-ip-burst.ts` (burst 10/60s per caller).
- **Problema (focus richiesto):** la verifica email rende ogni account del farm costoso (una
  mailbox usa-e-getta), ma un attaccante con N mailbox può creare N account verificati (10/min
  da un IP, nessun cap giornaliero per-IP sul numero di account) e superare le quote
  per-account: es. N×5 conferme/giorno sulla stessa camera, o N report pending che affogano la
  moderazione. Il backstop resta la moderazione manuale + burst per-IP. Rischio accettato e
  coerente con ADR 0020 (il costo è la mailbox), ma non documentato come limite del modello.
- **Fix proposto (decisione di prodotto, non urgente):** cap per-IP sulla registrazione
  (es. N account/24h → 429 oltre) e/o maturazione (delay prima della prima write) e/o quota
  conferme aggregata per-IP in D1. Documentare la scelta in AUTH_OPTIONS/COMMUNITY_PLAN.

### P3-5. Callback OIDC e verify-email non metered
- **File:** `app/api/auth/oidc/[provider]/callback/route.ts` (nessun `authLimit`),
  `app/api/auth/verify-email/route.ts` (idem).
- **Problema:** entrambi sono GET pubblici senza bucket. Impatto basso: il callback consuma
  righe state single-use a TTL 10 min (un flood non accumula nulla di riusabile) e i token di
  verify sono a 256 bit (enumerazione infeasibile). Nota di igiene: un bucket `auth` sul
  callback eviterebbe anche il costo di provider-exchange inutili.

### P3-6. P3 del ciclo 1 ancora aperti (backlog)
P3-1 (`getDb` dead code), P3-5 (`parseCookies` URIError), P3-6 (freshness sweep su GET),
P3-7 (walkPages N-request), P3-9 (docs stale — STATUS.md non cita l'auth), P3-10
(`login_attempts` senza retention R8). Nessuno di sicurezza attiva; da smaltire nel backlog
ordinario (suggerito: P3-5 e P3-10 hanno fix banali, P3-9 assorbe la Fase docs).

---

## Verifica conformità ADR

| ADR | Esito | Note |
|---|---|---|
| **0020** (multi-method auth) | ✅ Conforme (con 2 note) | Tutte le decisioni 1–6 rispettate: 3 metodi → stesso `contributors.id`; verifica email richiesta per le write (gate 401/403); passkey opzionale con fallback + recovery codes; OIDC opt-in senza import email e con merge manuale; schema 0027–0031 con erasure estesa; UX trasparente (risk matrix in Fase E2). **Note:** (a) il budget mail reale è token-based, non send-based, e `email_send_log` è morto (P2-1); (b) l'erasure delle nuove tabelle è CASCADE-only (P2-2). |
| **0013** (accounts/sessions) | ✅ Conforme | PBKDF2 iterations embedded ora onorate nel verify (P1-2 chiuso); TTL unico (P2-2 chiuso); cookie HttpOnly/SameSite=Strict, CSRF double-submit, lockout per-email, anonimo by design invariati. |
| **0016** (lockout) | ✅ Conforme | Lockout applicato anche a OIDC merge (prova password) e recovery; backoff esponenziale a cap; clear on success. |
| **0014/0018** (roles/appeals; verifications) | ✅ Conforme | Bridge contributor→users solo esplicito (P2-3 chiuso); write gate si somma al gate L1 delle conferme; quota conferme in D1; burst per-IP separato. |

---

## Azioni richieste (sintesi)

1. **Linus** — fix P1-1 (reset-request: 429→200 generico, aggiornare il test che pina il 429)
   e P2-1 (unificare il mailer; VERIFY_BASE_URL obbligatorio senza fallback requestOrigin in
   produzione; allineare i docstring). **Grace** — ri-puntare `mailer.test.mjs` sul mailer
   unificato.
2. **Linus + Grace** — P2-2: DELETE esplicite in `eraseContributor` (o `PRAGMA foreign_keys`
   nell'harness) + asserzioni erasure sulle nuove tabelle auth.
3. **Linus** — P3-1 (sweep token scaduti nel cron), P3-2 (binding challenge register),
   P3-3 (userHandle challenge).
4. **Ada** — review dei fix; **CEO** — decisione prodotto su P3-4 (cap per-IP registrazione).
5. Il resto dei P3 nel backlog ordinario.

---

## Punti di forza da mantenere

- **Unica fonte di verità `email_verified_at`** per la write capability, mai derivata da
  `auth_provider`; gate ri-letto a ogni write.
- **Anti-enumeration sistematica** su tutti i body auth (register 400/409 identici, login 401
  generico, recovery 401 generico, passkey 401 generico a ogni layer, verify 400/410 generici) —
  tranne il ramo P1-1 da correggere.
- **Cerimonie WebAuthn reali nei test** (fixture ES256, Fase G): enroll→login→write e
  counter-replay rifiutato sono pinnati, non simulati.
- **Merge OIDC anti-takeover** a prova di lockout e di enumerazione (401 generico anche per
  credenziali valide su merge non di proprietà).
- **Zero email provider persistite**, placeholder non instradabile, `code_verifier` in chiaro
  solo in-flight con TTL 10 min.
- **Migrazioni hand-written + snapshot + journal** allineati fino a 0031, smoke zero-rows.
