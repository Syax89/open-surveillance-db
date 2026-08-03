# REVIEW TOTALE — Architettura e Design (Ada, CTO)

- **Data:** 2026-08-02
- **Commit verificato:** `6f56d22` (main, HEAD — feat header auth link #215)
- **Metodo:** lettura integrale del codice di produzione (~12.200 righe TS/MJS: `worker/`, `db/*`, `app/api/*`, `app/lib/*`, migrazioni `drizzle/`, workflow CI) + verifica puntuale ADR 0013/0015/0018. Nessuna esecuzione di suite (la review è statica); i riferimenti `file:riga` sono sul commit indicato.
- **Scopo:** solo review — nessuna modifica al codice. Fix proposti per priorità (P0–P3).

---

## Sintesi esecutiva

L'architettura è **solida e coerente con gli ADR**: il confine pubblico/privato è a strati con fonte unica
(`PUBLIC_CAMERA_STATUSES`), il coordinate rounding ~10 m è applicato su ogni superficie pubblica, la
moderazione ha audit trail append-only con trigger SQL, l'anti-gaming vive nel write path D1, l'erasure
è atomica con de-attribuzione esplicita, e l'edge worker è l'unica autorità di identità (anti-spoofing
header). **Non ho trovato falle di sicurezza dati sfruttabili sul percorso pubblico.**

I problemi reali sono **2 bug di correttezza (P1)** — entrambi latenti oggi ma destinati a esplodere —
più un insieme di **incoerenze P2** (rate limiting aggirabile sul deployment non-CF, TTL sessione
divergente, attribuzione appelli spoofabile) e **debito P3** (dead code, paginazione in memoria, risorse
orfane). Nessun P0.

---

## P0 — Nessun item

Non ho trovato vulnerabilità sfruttabili a distanza, secret committati (gitleaks conferma; il `database_id`
in wrangler.jsonc non è un segreto), né violazioni del data boundary pubblico.

---

## P1 — Correttezza (bug latenti che diventano incidenti)

### P1-1. `confirmationCountsFor()` supera il limite D1 di 100 bound parameters
- **File:** `db/confirmations.ts:101-115` (chiamato da `db/cameras.ts:201` in `listPublicCamerasPage` e `:299` in `getPublicCameraById`)
- **Problema:** la query `WHERE cc.camera_id IN (${placeholders})` costruisce un placeholder per ogni id
  passato. `listPublicCamerasPage` accetta fino a `PUBLIC_CAMERAS_PAGE_MAX_LIMIT = 500` record
  (`db/cameras.ts:139-140`), e **il default è 500** (`PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT`). D1 limita i
  bound parameters a **100 per query** — limite documentato nello stesso repo (`db/retention.ts:81-85`,
  `D1_MAX_BOUND_PARAMS = 100`). Con >100 record pubblici, `GET /api/cameras` (default) va in errore D1
  → 503. Il frontend (`app/lib/use-public-cameras.ts:53` `PAGE_LIMIT = 500`) rompe di conseguenza.
  Il bug non emerge nei test perché l'harness D1 in-memory (`tests/helpers/d1-sqlite.mjs`) non applica
  il limite di 100 parametri.
- **Fix proposto:** chunking a 100 come già fatto in `db/moderation.ts:1501-1509`
  (`listCorrectionHistoryForCamera`, `offset += 100`) e in `db/retention.ts:482`; eseguire la query in
  blocchi e unire i risultati in un `Map`.

### P1-2. `verifyPassword()` ignora le iterazioni salvate (viola il contratto ADR 0013)
- **File:** `db/auth.ts:103-116` (riga 106 parsa `iterations`, riga 111 la ignora)
- **Problema:** `verifyPassword` estrae `iterations` dal valore salvato
  (`pbkdf2$<iterations>$<salt>$<hash>`) e lo valida, ma poi chiama
  `derivePasswordKey(password, salt)` **senza passarlo**; `derivePasswordKey` usa la costante globale
  `PBKDF2_ITERATIONS` (`db/auth.ts:89`, oggi 210.000). ADR 0013 (punto 1) promette esplicitamente:
  *"The iteration count is embedded in the stored value … so it can be raised later without a
  migration"*. Oggi il count è identico per tutti gli hash, quindi nulla si rompe; **ma al primo bump
  della costante (es. 310k, come previsto dall'ADR) ogni password esistente diventa invalida** →
  lockout totale di tutti i contributori. La variabile `iterations` è dead code.
- **Fix proposto:** `derivePasswordKey(password, salt, iterations)` e usare il valore parsato dal record
  (`deriveBits({ iterations })`), con fallback alla costante per hash legacy. Aggiungere un test che
  verifichi un hash con iterazioni diverse dalla costante.

---

## P2 — Sicurezza / integrità (deployment-dipendenti o boundary)

### P2-1. Rate limit e quota foto aggirabili via `X-Forwarded-For` fuori da Cloudflare
- **File:** `app/lib/rate-limit.ts:144-154` (`callerKey`), `app/lib/photo-quota.ts:72-78` (`submitterKeyFor`)
- **Problema:** `callerKey` usa `cf-connecting-ip` se presente, altrimenti il **primo hop di
  `x-forwarded-for`**. Sul deployment attuale (LXC LAN, `ops/*.sh`, nessun Cloudflare davanti) un client
  può **spoofare `X-Forwarded-For`** e ruotare identità → aggira ogni bucket (auth 10/min, submit 5/min,
  tiles 60/min) e la quota foto anonime (`anon:<sha256(callerKey)>`). Su Cloudflare il rischio sparisce
  (CF scrive `cf-connecting-ip`), ma il prototipo LAN è esposto. I commenti dichiarano il rate limiter
  "best-effort", ma la spoofabilità non è documentata.
- **Fix proposto:** (a) fuori da CF, ignorare `x-forwarded-for` e usare l'IP del socket se esposto, o
  (b) documentare la mitigazione e richiedere un trusted proxy; (c) opzionale: firmare/hashare anche un
  componente non spoofabile (es. `User-Agent` + IP) per rendere la rotazione meno banale. Minimo:
  nota in `OPS_OPEN.md`/`LOCAL_PLAYBOOK.md`.

### P2-2. TTL sessione incoerente tra DB e cookie
- **File:** `db/auth.ts:457-478` (`createSession`, default `ttlDays = 30` hardcoded a riga 463) +
  `app/api/auth/login/route.ts:94` e `app/api/auth/register/route.ts:84` (chiamano `createSession(id)` senza opzioni)
- **Problema:** il cookie viene emesso con `sessionTtlSeconds(env)` (`app/lib/auth-session.ts:23-27`,
  `AUTH_SESSION_TTL_DAYS`, default 30) ma la riga `sessions.expires_at` è calcolata con **30 giorni
  fissi**. Se l'env imposta `AUTH_SESSION_TTL_DAYS=60`, il cookie promette 60 giorni ma la sessione DB
  scade a 30 → l'utente viene sloggato a metà validità (e viceversa, con 15 il DB tiene righe vive più a
  lungo del cookie). L'ADR 0013 parla di `AUTH_SESSION_TTL_DAYS` come unico knob.
- **Fix proposto:** propagare `sessionTtlSeconds(env)` in `createSession({ ttlDays })` da entrambe le
  route (o passare il TTL in secondi e derivare i giorni).

### P2-3. Attribuzione appelli spoofabile via bridge email contributor→users
- **File:** `app/api/appeals/route.ts:130` (`getUserByEmail(session.contributor.email)`) → `db/appeals.ts:149` (`getUserById(appellantId)`)
- **Problema:** l'appello è attribuito all'utente `users` trovato **per email** con la mail del
  contributor. La registrazione contributor è aperta e senza verifica email (ADR 0013): chiunque può
  registrarsi con `admin@osdb.test` (o l'email di un qualsiasi moderator) e i suoi appeal risulteranno
  attribuiti all'utente admin/moderator nell'audit trail (`moderation_appeals.appellant_id`, display
  name nel queue). Non è escalation di ruolo (il gate è solo `roleAtLeast(contributor)`), ma è
  **spoofing di attribuzione** su un trail che deve essere immutabile e attendibile. ADR 0014/0018
  prevedono il bridge "at provisioning time", non per match email runtime.
- **Fix proposto:** mappare esplicitamente contributor→users (colonna di link o tabella di mapping
  scritta dal provisioning), oppure attribuire gli appelli direttamente a `contributors.id` (ADR 0018
  §1: la community layer vive su contributors) senza attraversare `users`. In attesa del fix: rifiutare
  il filing se l'email del contributor non corrisponde a un utente provvisionato (stesso principio del
  gate edge).

### P2-4. `GET /api/photos` (lista approvate) senza rate limit
- **File:** `app/api/photos/route.ts:195-217` (solo `POST` ha il bucket `submit` a riga 92)
- **Problema:** ogni altra lettura pubblica ha un bucket dedicato (`read`, `export`, `nearby`,
  `revisions`, `tiles`, `geocode`); la lista foto approvate è **l'unica GET pubblica non metered**.
  Espone gli id foto di ogni record pubblico e può essere spazzolata senza costo.
- **Fix proposto:** applicare il bucket `read` (`limitsFor("read", env)`) prima della query, come in
  `GET /api/photos/[id]` (righe 30-44).

---

## P3 — Manutenibilità / scalabilità / igiene

### P3-1. `getDb()` / drizzle runtime mai usati (dead code)
- **File:** `db/index.ts:5-13`; nessun import di `getDb` in `app/`, `db/`, `worker/` (verificato con grep)
- **Problema:** tutte le query sono SQL manuale via `getD1()`. `drizzle-orm` è usato solo per i tipi
  schema (`drizzle-kit`), ma la dipendenza runtime `drizzle` in `db/index.ts` è inutilizzata — YAGNI e
  superficie di mantenimento.
- **Fix proposto:** eliminare `db/index.ts` (o migrare davvero le query a drizzle; la seconda opzione è
  un refactor non giustificato ora).

### P3-2. Paginazione nearby/search in memoria dopo load completo
- **File:** `db/cameras.ts:376-409` (`searchPublicCamerasNearPage`, `findNearbyPublicCamerasPage`)
- **Problema:** entrambe chiamano `searchPublicCamerasNear` che carica **tutti** i candidati del bbox e
  calcola la distanza in JS, poi `slice` per pagina. In una città densa (migliaia di record nel bbox)
  ogni richiesta pagina ricalcola haversine sull'intero set — O(N) per request, e `offset` alto
  rielabora tutto. Il bbox pre-filter aiuta ma non risolve.
- **Fix proposto:** quando il dataset cresce, spostare distanza+ordine in SQL (o almeno LIMIT/OFFSET
  con una subquery) oppure accettare e documentare il costo; per ora è accettabile ai volumi attuali.

### P3-3. Foto R2 scritte prima della riga D1 → oggetti orfani su errore
- **File:** `db/photos.ts:91-115` (`createPendingPhoto`: `env.PHOTOS.put` a riga 92, poi INSERT D1 a riga 96)
- **Problema:** se l'INSERT D1 fallisce (binding assente, constraint), l'oggetto R2 resta orfano; il
  retention sweep parte dalle righe D1 (`db/retention.ts:446-500`), quindi un oggetto senza riga non
  viene mai ripulito.
- **Fix proposto:** invertire l'ordine (INSERT D1, poi `put` R2 con cleanup `delete` nel catch) oppure
  aggiungere un passo di reconciliamento periodico R2 vs D1.

### P3-4. `PATCH /api/auth/me` legge il body senza cap né error handling trasporto
- **File:** `app/api/auth/me/route.ts:87-92` (`request.json()` diretto)
- **Problema:** tutte le altre route usano `readJsonBody` (cap 32 KiB, `PayloadTooLargeError`→413,
  `MalformedJsonError`→400); qui un body gigante/malformato produce un errore generico e nessun limite.
- **Fix proposto:** usare `readJsonBody(request, env)` come le sorelle.

### P3-5. `parseCookies` può lanciare su cookie malformato (URIError)
- **File:** `app/lib/csrf.ts:43` (`decodeURIComponent(value)` non protetto)
- **Problema:** un cookie con percent-encoding invalido (es. `osdb_session=%zz`) lancia `URIError` in
  `readCookie`; `POST /api/appeals` chiama `resolveOptionalContributor` fuori dal try
  (`app/api/appeals/route.ts:112`) → 500 non gestito. Le altre route sono dentro try/catch ma con
  messaggi fuorvianti.
- **Fix proposto:** `try/catch` intorno a `decodeURIComponent` (cookie malformato → scarta il cookie,
  tratta come anonimo).

### P3-6. `runFreshnessSweep` eseguito su GET con side-effect + doppia esecuzione
- **File:** `db/moderation.ts:424` (`listPendingModerationItems` chiama `runFreshnessSweep()`) e
  `db/retention.ts:286` (il cron lo chiama di nuovo lo stesso giorno)
- **Problema:** una GET (`/api/moderation`) scrive sul DB (transizioni `verified→needs_review`+eventi) e
  il cron retention lo riesegue poco dopo; è idempotente per le WHERE, ma è un side-effect su read non
  ovvio e raddoppia le scritture.
- **Fix proposto:** eseguire lo sweep solo dal cron (o su un trigger esplicito), lasciando la GET
  read-only sul boundary di freschezza già applicato in query.

### P3-7. Il client cammina tutte le pagine della lista (N request)
- **File:** `app/lib/use-public-cameras.ts:104-120` (`walkPages` segue `nextOffset` fino alla fine)
- **Problema:** con >500 record pubblici la home/mappa fa N fetch sequenziali da 500. Documentato, ma
  è il punto in cui il paginato server-to-client scala male.
- **Fix proposto:** valutare un endpoint `bbox` lato client per la mappa (già esiste per GeoJSON,
  `db/cameras.ts:352`) e una pagina singola per la directory; tenere il walk solo come fallback.

### P3-8. `listPublicCameras` (export) non popola `confirmationCount` ma il tipo lo dichiara required
- **File:** `db/cameras.ts:97-136` (tipo `PublicCameraRecord` richiede `confirmationCount`, riga 40; il
  map di riga 135 non lo aggiunge) e `:196` (la pagina lo azzera a 0 prima del GROUP BY)
- **Problema:** l'oggetto runtime di `listPublicCameras` ha `confirmationCount: undefined` mentre il
  tipo dice `number`; oggi i consumer (export CSV/GeoJSON) non lo leggono, ma è un type-lie pronto a
  esplodere.
- **Fix proposto:** rendere `confirmationCount` opzionale sul tipo dell'export o popolarlo a 0
  esplicitamente.

### P3-9. Docs stale (confermato anche da AUDIT_REPORT)
- **File:** `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/EXECUTION_BOARD.md`, `docs/SITEMAP.md`,
  `docs/DATA_MODEL.md`, `README.md`
- **Problema:** la documentazione racconta una storia più vecchia del codice (wave community C1–C6 non
  citata, migrazioni 0000–0025 vs 0000–0011, rotte F2–F4 marcate pending quando merged). Nota: il gap
  "snapshot Drizzle 0011–0025 mancanti" dell'AUDIT precedente risulta **risolto** — i file
  `drizzle/meta/00XX_*_snapshot.json` sono tutti presenti fino a 0025.
- **Fix proposto:** riallineare i docs al main attuale (task docs dedicato).

### P3-10. `login_attempts` senza retention dedicata (già noto in AUDIT)
- **File:** `db/schema.ts:171-180` + `db/retention.ts` (R7 copre solo `sessions`)
- **Problema:** righe `login_attempts` per email mai autenticate restano per sempre (crescono col
  tentativo di enumerazione, pur essendo hash-only).
- **Fix proposto:** aggiungere una regola R8 nel sweep (DELETE dove `window_start < now - N giorni`).
- **Risolto (t_aca36902):** regola **R16** in `db/retention.ts` — sweep **bounded** che cancella le righe
  `login_attempts` con `window_start` più vecchio di 30 giorni (`LOGIN_ATTEMPT_RETENTION_DAYS`), in round
  da ≤100 chiavi con cap per run; un lock **attivo** (`locked_until` nel futuro) non viene mai toccato.
  Documentata in RETENTION_SCHEDULE.md (R16), AUDIT_REPORT finding 5 e tests/retention.test.mjs. Nota:
  numerata **R16** (e non R8 come proposto qui) perché **R8 è già assegnata** in RETENTION_SCHEDULE.md alla
  moderator identity — due regole con lo stesso id nel documento legale sarebbero state incoerenti.

---

## Verifica ADR richieste (0013 / 0015 / 0018)

| ADR | Esito | Note |
|---|---|---|
| **0013** (contributor accounts/sessions) | ⚠️ **P1-2** | Contratto PBKDF2 "iterations embedded" violato nel verify; TTL env non propagato (P2-2); il resto (cookie HttpOnly/SameSite=Strict, CSRF double-submit, lockout per-email, erasure atomica con de-attribuzione, anonimo by design) è rispettato. |
| **0015** (locale cookie + SSR) | ✅ Conforme | Cookie `samesite=lax` 1 anno, `/api/locale` con guardie open-redirect complete (no `//`, no backslash, no CRLF/`%0d%0a`), `noindex`, html lang SSR via `getServerLocale`. |
| **0018** (verifications/trust levels/editing) | ✅ Conforme (con nota) | UNIQUE anti-gaming a livello DB, quota giornaliera come COUNT D1 nel write path, level derivato mai denormalizzato, two-track PATCH con whitelist e 404 fail-closed, erasure estesa a confirmations/edit/corrections. **Nota:** la conferma usa `confirmationCountsFor` → colpita da P1-1; l'integrazione appelli (ADR 0014 bridge) ha il difetto P2-3. |

---

## Punti di forza confermati (mantenere)

- **Boundary pubblico a fonte unica:** `PUBLIC_CAMERA_STATUSES` (`app/lib/public-status.ts`) + predica
  condivisa `publicCameraPredicate` su ogni superficie; `roundPublicCoordinate` ovunque; foto fail-closed
  con 404 senza leak di esistenza; storage_key mai esposto.
- **Edge worker come unica autorità di identità:** strip di `x-osdb-user-email`/`oai-*` su ogni path,
  gate moderazione fail-closed (503 senza credenziali), `safeEqual` constant-time, security headers su
  ogni risposta (CSP `unsafe-inline` richiesto da vinext, documentato).
- **Anti-gaming nel write path:** quota conferme come stato D1, non limiter in-memory; UNIQUE
  `(camera_id, contributor_id)`; dedupe correzioni con indici parziali race-safe.
- **Audit trail immutabile:** trigger `moderation_events_no_update/no_delete` in migrazione 0008;
  revisioni pubbliche filtrate (`PUBLIC_LIFECYCLE_ACTIONS`), mai identità.
- **Retention legale non overridabile:** costanti fisse, esclusioni per appeal aperti e legal hold,
  chunking D1 a 100, deletes R2 best-effort dopo il batch D1.
- **CI** con lint+typecheck+test+coverage (soglia 75%)+migration smoke; **security.yml** con gitleaks
  (PR-scoped) e `npm audit` gate su produzione.
- **Nessun pattern pericoloso nel frontend:** zero `dangerouslySetInnerHTML`/`eval`/`innerHTML`.

---

## Azioni richieste (sintesi)

1. **Linus** — fix P1-1 (chunk `confirmationCountsFor`) e P1-2 (iterations nel verify) con test;
   P2-4 (rate limit photos GET).
2. **Linus + Ada** — P2-2 (TTL unico), P2-3 (mapping contributor→users o attribuzione su contributors).
3. **Ken** — P2-1 (documentazione/mitigazione XFF fuori CF) e P3-3 (ordine R2/D1 o reconcile).
4. **Ada** — review dei fix; **Marie** — riallineamento docs (P3-9); **Grace** — test per P1-1/P1-2.
5. Il resto dei P3 può entrare in backlog ordinario.
