# QA Sicurezza/Privacy #3 — OpenSurveillanceDB

- **Autore:** Ada (CTO / Tech Lead — review architetturale)
- **Task:** t_63e0d13c (QA approfondito sicurezza/privacy, CEO: "ci sono ancora tanti bug, ricerca approfondita, ALMENO 5 finding")
- **Commit analizzato:** `16503a3` (main, 2026-08-03)
- **Metodo:** revisione statica mirata su auth (sessioni, token, CSRF, timing, enumeration), passkey/WebAuthn, OIDC, recovery, erasure GDPR, retention, log, security headers/CSP, XSS/SSRF/injection, rate limiting, D1 query, R2 exposure, moderazione (impersonation/escalation). Nessuna modifica al codice.
- **Esito:** 6 finding (0 critici, 0 high, 4 medium, 2 medium-basso). Nessun vulnerability critica: la base auth/CSRF/write-gate è solida. I finding sono principalmente **default fail-open**, **retention/erasure incomplete** e **attribuibilità della moderazione**.

---

## F1 — MEDIUM · Timing oracle: enumerazione email via tempo di risposta al login

**File:riga:** `db/auth.ts:350-352` (`authenticateContributor`); chiamato da `app/api/auth/login/route.ts:93`

```
350  const contributor = await findContributorByEmail(email);
351  if (!contributor) return null;          // <-- risposta immediata
352  const valid = await verifyPassword(password, contributor.passwordHash);
```

**Descrizione.** Il body di risposta è anti-enumeration (401 generico identico per email sconosciuta, password errata, account non verificato), ma il **tempo** di risposta no: per un'email non registrata il codice ritorna subito (riga 351) senza eseguire alcun PBKDF2; per un'email registrata paga 210.000 iterazioni PBKDF2-SHA256 (~50–150 ms). Il timing è un canale laterale che rivela quali email esistono. Nota: la route applica il gate di verifica *dopo* il PBKDF2 proprio per non aggiungere segnale temporale (commento a route.ts:36-40), ma il PBKDF2 stesso è il segnale per l'esistenza dell'email.

**Attacco riproducibile.**
```bash
for e in user1@x.com user2@x.com ...; do
  curl -s -o /dev/null -w "%{time_total} $e\n" -X POST https://HOST/api/auth/login \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$e\",\"password\":\"WrongPass-12345!\"}"
done
```
Le email con `time_total` nettamente superiore (~100 ms+) sono registrate. L'AUTH_LIMITER (10/min per IP) rallenta ma non impedisce: un dizionario di 100 email richiede ~10 minuti da un IP, o pochi minuti da più IP (l'enumerazione non tocca il lockout per-email, che scatta solo sui fallimenti conteggiati).

**Impatto.** L'enumerazione alimenta phishing mirato, spam e **lockout poisoning mirato** (ADR 0016 accetta il poisoning come "bounded", ma per farlo serve conoscere l'email della vittima — F1 la fornisce).

**Fix.**
1. Quando l'email non esiste, eseguire comunque un PBKDF2 dummy a parità di costo (hash fittizio precomputato, stesso formato `pbkdf2$iter$salt$hash`) prima di rispondere.
2. Il ramo lockout (route.ts:84-91, 429 prima di qualsiasi hashing) ha lo stesso problema: applicare lo stesso dummy-hash per le email inesistenti, oppure verificare il lockout dopo il PBKDF2 dummy.

---

## F2 — MEDIUM · Cookie di sessione senza `Secure` di default; nessun HSTS; produzione attuale su HTTP

**File:riga:**
- `app/lib/auth-session.ts:34-36` — `cookieSecure()` ritorna `true` **solo** se `AUTH_COOKIE_SECURE === "true"`, default `false`
- `app/lib/csrf.ts:86` — l'attributo `Secure` è omesso quando `options.secure` è false
- `worker/index.ts:211-215` — HSTS deliberatamente non impostato; il sito è servito su HTTP plaintext (LXC 114)
- `wrangler.jsonc` — **nessun `vars` con `AUTH_COOKIE_SECURE`**: il default del codice è anche il valore di produzione finché l'operatore non lo imposta come secret/var

**Descrizione.** Il default è **fail-open**: se il deploy dimentica `AUTH_COOKIE_SECURE=true`, i cookie `osdb_session` e `osdb_csrf` viaggiano senza `Secure` e vengono inviati dal browser anche su connessioni HTTP plaintext.

**Attacco riproducibile.** Sullo scenario attuale (prototipo LXC su LAN, HTTP):
```bash
# sulla rete, durante il login di un contributor
tcpdump -i any -A -s0 'tcp port 80' | grep -A2 osdb_session
# replay della sessione catturata
curl -s -H "Cookie: osdb_session=<valore catturato>" https://HOST/api/auth/me
```
→ sessione del contributor (profilo, scritture). In un futuro deploy pubblico, se l'host ascolta anche su :80, un attacco SSL-strip (o semplicemente il downgrade) fa inviare il cookie in chiaro.

**Impatto.** Session hijacking completo del contributor; condiviso con F5, della moderazione.

**Fix.**
1. Secure-by-default: `cookieSecure()` ritorna `true` salvo override esplicito di sviluppo (`AUTH_COOKIE_SECURE=false` solo in `.dev.vars`).
2. HSTS a livello di zona Cloudflare / header rule una volta attivo il dominio pubblico (task t_6148aa6f) + redirect 301 http→https.
3. Guard nel workflow di deploy: fail se `AUTH_COOKIE_SECURE` non è `"true"` in produzione.

---

## F3 — MEDIUM · Erasure GDPR incompleta: `photos.contributor_id` mai reciso

**File:riga:** `db/auth.ts:1170-1215` (`eraseContributor`); route `app/api/auth/account/route.ts:50`

Il batch di erasure:
- de-attribuisce `cameras` (riga 1179) e `correction_requests` (riga 1178) con SET NULL;
- cancella passkeys, recovery codes, token, challenges, OIDC merge, sessioni;
- **NON tocca `photos.contributor_id`** (verificato: nessun `UPDATE photos SET contributor_id` in tutto il repo — solo `camera_id` e `status` in `db/photos.ts:266,314`).

**Descrizione.** Dopo `DELETE /api/auth/account`, le foto caricate dal contributor (pending o approvate) restano attribuite a un id orfano. L'attribuzione è un dato personale (GDPR art. 17): sopravvive alla cancellazione dell'account, in incoerenza col pattern applicato a report e correzioni. Inoltre ogni consumer che risolve `photos.contributor_id` (ownership guard di `linkPhotosToCamera`, moderazione, contributi profilo) incontra un account inesistente.

**Attacco/impatto riproducibile.**
1. Registrare account → caricare foto (`POST /api/photos`) → `DELETE /api/auth/account`.
2. `SELECT id, contributor_id, status FROM photos WHERE contributor_id IS NOT NULL` → righe con `contributor_id` che non esiste più in `contributors`.

**Fix.** Aggiungere al batch di `eraseContributor`:
```sql
UPDATE photos SET contributor_id = NULL WHERE contributor_id = ?
```
(le foto restano, ma l'attribuzione è recisa come per i report). Coprire con un test di erasure che includa foto.

---

## F4 — MEDIUM · `registrations_ip_log`: hash IP (PII invertibile) conservati a tempo indeterminato

**File:riga:**
- `db/auth.ts:271-300` — `recordRegistrationAttempt`: INSERT (riga 279) e COUNT (riga 282); l'unico DELETE è il rollback per-id su registrazione fallita (riga 299)
- `db/retention.ts` — la sweep copre R7/R15/R16 (sessioni, token, challenges, `login_attempts`) ma **non `registrations_ip_log`**
- `db/schema.ts:723,732` — tabella + indice `(ip_hash, created_at)`
- `app/lib/rate-limit.ts:362-366` — il commento conferma: "the cap resets automatically without a cleanup job"

**Descrizione.** Ogni tentativo di registrazione lascia una riga `ip_hash` + `created_at` per sempre. `ip_hash` è SHA-256 dell'IP del chiamante: lo spazio degli IPv4 è 2^32, quindi l'hash è **invertibile con una tabella precomputata** — di fatto PII. Nessuna retention definita (GDPR art. 5(1)(e)) e crescita illimitata di D1.

**Attacco/impatto riproducibile.**
```bash
wrangler d1 execute osdb-production --command \
  "SELECT COUNT(*), MIN(created_at) FROM registrations_ip_log"
```
→ righe vecchie di mesi; con un dizionario di IP (es. intervalli della rete) `sha256(ip)` → match con le righe.

**Fix.**
1. Sweep nel cron retention (come R16): cancellare le righe più vecchie della finestra (24h o 30gg) con loop bounded.
2. In alternativa, DELETE dell'ip_hash dopo la COUNT nel register route.
3. Valutare se il dato serva oltre la finestra di 24h del cap.

---

## F5 — MEDIUM · Moderazione: identità unica condivisa (audit non attribuibile) + demo actor selector env-gated

**File:riga:**
- `worker/index.ts:69` — `MODERATION_IDENTITY_EMAIL` è **una** stringa
- `worker/index.ts:280-285` — `injectIdentityAfterGate`: ogni gate riuscito inietta la **stessa** email come `x-osdb-user-email`
- `app/api/moderation/route.ts:393-399` — `if (env.ENVIRONMENT === "development" && auth.user.role === "admin")` → `actorId = payload.context.actorId` (scelto dal client)

**Descrizione.** Il gate edge accetta una sola coppia di credenziali (Basic auth condivisa o bearer unico) e mappa **tutte** le sessioni di moderazione alla stessa identity: `moderation_events` (append-only, con `actor`/`reviewer_id`) non può distinguere due operatori reali → nessun non-ripudio, un moderatore compromesso non è identificabile, ogni azione è impersonabile da chiunque possegga la credenziale condivisa. Inoltre il "demo actor selector" è attivo finché `ENVIRONMENT == "development"`: un deploy di produzione con ENVIRONMENT dimenticato a development permette a un admin di scrivere eventi di moderazione **come qualsiasi reviewer** — esattamente il rischio di corruzione dell'audit trail che il commento a route.ts:393-398 dichiara di voler evitare.

**Attacco riproducibile.**
1. Due operatori con la stessa `MODERATION_USER/PASSWORD`:
   `SELECT actor, reviewer_id, action FROM moderation_events ORDER BY id DESC` → azioni indistinguibili tra loro.
2. Con `ENVIRONMENT=development` e ruolo admin: `PATCH /api/moderation` con `actorId` arbitrario nel body → evento scritto con il `reviewer_id` scelto dall'attaccante.

**Fix.**
1. Produzione: autenticazione per-operatore (una credenziale per reviewer, mappata server-side a `reviewer_id`), non una identity condivisa.
2. Guard di deploy: fallire se `ENVIRONMENT == "development"` in produzione (worker o workflow CI).
3. Rate limiting sul gate edge (oggi assente: la password condivisa è brute-forzabile senza limite).

---

## F6 — MEDIUM · Retention: `moderation_events` (con note di moderazione) conservati a tempo indeterminato

**File:riga:** `db/retention.ts:35-39` ("Deliberately NOT purged here: R5 ... A 2-year archival path requires ... out of scope"); `db/retention.ts:170` (`moderationEventsRetained: 0` è una costante, mai incrementata)

**Descrizione.** La tabella append-only delle decisioni contiene `note` (testo libero del moderatore, potenzialmente con dati personali di segnalato/segnalante), `actor` (display name) e `reviewer_id`, e non ha **alcuna** retention né archiviazione: nessuna cancellazione, nessun archivio a 2 anni come previsto da RETENTION_SCHEDULE R5. GDPR art. 5(1)(e): i dati personali non possono essere conservati oltre il necessario.

**Impatto riproducibile.**
```bash
wrangler d1 execute osdb-production --command \
  "SELECT created_at, actor, note FROM moderation_events ORDER BY id LIMIT 1"
```
→ righe datate all'avvio del progetto, mai toccate dalla sweep giornaliera (il summary riporta sempre 0).

**Fix.** Implementare il percorso di archiviazione a 2 anni previsto da R5: tabella di archivio + migrazione + sweep nel cron, con anonimizzazione di `actor` e politica esplicita per le `note`; aggiornare RETENTION_SCHEDULE.

---

## Punti forti verificati (nessun intervento richiesto)

- **Password:** PBKDF2-SHA256 210k iterazioni, salt per-user, iterazioni embedded nel formato (upgrade senza migrazione), confronto in tempo costante.
- **Sessioni:** solo SHA-256 del token in D1 (32 byte random), TTL DB == cookie Max-Age, revoca su logout/password-reset/erasure.
- **CSRF:** double-submit server-side (token per-sessione confrontato in tempo costante) + `SameSite=Strict` + same-origin check; body unico di write-gate anti-enumeration.
- **Brute force:** AUTH_LIMITER binding CF (10/min per IP) + lockout per-email con escalation esponenziale (ADR 0016).
- **Passkey/WebAuthn:** challenge single-use 10 min (solo hash in D1), verifica firma con origin/rpID fissi da env (default `https://opensurveillancedb.org`, mai dall'Host header), userHandle binding, signature-counter anti-replay.
- **OIDC:** PKCE S256 con verifier single-use in stato, state hashed single-use 10 min, `safeRedirectTarget` (solo path relativi same-origin), `VERIFY_BASE_URL` fisso da env (il vecchio P1-1 token-harvesting via Host header è chiuso), email provider mai persistita.
- **Recovery:** 10 codici da 96 bit, solo hash in D1, single-use atomico, 401 generico, rate limit auth.
- **Erasure:** batch atomico, de-attribuzione esplicita, sessioni/passkey/token/challenges cancellati (gap F3 a parte).
- **Retention sweep:** R1–R16 con esclusione per appeal aperti e legal-hold, batch D1 atomiche, R2 delete best-effort dopo il successo D1.
- **R2:** chiavi `photos/<uuid>` opache, bucket privato, read pubblica fail-closed (approvata + redazione confermata + camera pubblica), CSP `sandbox` sulle foto, rate limit read.
- **Proxy (tiles/geocode):** coordinate e query validati strettamente, URL costruiti con URLSearchParams da base configurata a deploy (no SSRF via input utente), body capped, timeout, cache conforme policy OSMF/Nominatim.
- **Headers:** CSP con `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; HSTS mancante è F2.
- **D1:** prepared statements ovunque (nessuna injection trovata nelle route cameras/search/nearby/corrections); limit/offset clampati al boundary.
- **Log/alert:** abuse-alerts con solo hash del caller, mai IP raw né corpi richiesta.

## Osservazioni minori (non blocking)

1. **OIDC callback GET non metered** (`app/api/auth/oidc/[provider]/callback/route.ts` non chiama `authLimit`, a differenza di `/start`): un attaccante può forzare fetch esterne verso il token endpoint del provider (consumo quota client, rumore). Costo basso; aggiungere `authLimit`.
2. **Lockout poisoning** (5 fallimenti → 15 min, escalation fino a 2h) è accettato e documentato (ADR 0016), ma combinato con F1 (enumerazione email) il DoS mirato su un account diventa banale: valutare un delay/captcha sui login anonimi in produzione.
3. **CSP `script-src 'unsafe-inline'`** è richiesto dal runtime RSC (bootstrap inline) e documentato a `worker/index.ts:196-200`: accettabile, da rivedere periodicamente.
4. **`constantTimeEqual`** ritorna prima sulla lunghezza (`db/auth.ts:68`): trascurabile, lunghezze fisse del formato hash.
5. **`registrations_ip_log` + login falliti per email inesistenti**: `recordFailedLogin` conteggia anche email sconosciute — corretto per anti-enumeration, ma accelera la crescita di `login_attempts`; la sweep R16 (30gg) la tiene sotto controllo.

---

*Tutte le righe citate sono riferite a HEAD `16503a3`. Nessuna modifica al codice: solo questo report.*
