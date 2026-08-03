# QA FUNZIONALE #1 — Approfondimento API routes, write gate, rate limiting, sessioni

- **Autore:** Linus (Backend/API)
- **Task:** t_894e0cc3 — QA APPROFONDITO #1 FUNZIONALE (CEO: "ci sono ancora tanti bug")
- **Data:** 2026-08-03
- **Commit/revisione analizzata:** main `6b79b16` (working tree con WIP password-policy di un altro worker, non toccato)
- **Test nuovi:** `tests/qa-funzionale-linus.test.mjs` (8 test: 7 rossi = bug riprodotti, 1 verde = contratto sequenziale)
- **Esito:** 7 finding (4 P2, 3 P3) — sopra il minimo di 5 richiesto

## Metodologia

Analisi statica + esecuzione reale su tutto il perimetro richiesto: route API
(auth, cameras, photos, tiles, moderation, appeals, geocode), write gate ADR
0020, rate limiting (binding CF + fallback in-memory), cap per-IP
registrazione, sessioni/CSRF, error handling, edge case, concorrenza,
validazione input. Ogni finding è stato **riprodotto con un test** che gira
contro route reali + moduli db reali + SQL reale (harness e2e/db-runtime su
node:sqlite con le migrazioni Drizzle applicate), seguendo la convenzione
red-before-green già usata da `malformed-json-routes.test.mjs`: i test rossi
documentano il bug, passano solo dopo il fix.

Le race condition non sono interleavable sul D1 sincrono del harness
(node:sqlite serializza): i relativi test verificano il **vincolo strutturale**
(indice UNIQUE, guardia SQL) che il fix introduce — falliscono oggi, passano
col fix.

---

## Riepilogo finding

| # | Severità | Area | File:riga | Sintesi |
|---|----------|------|-----------|---------|
| F1 | P2 | Error handling / sessioni | `app/lib/csrf.ts:43` | Cookie malformato → URIError → 503 (o crash handler) invece di 401 |
| F2 | P2 | Concorrenza / appeals | `db/appeals.ts:203-209` | `duplicate_pending` non atomico: manca UNIQUE parziale su `decision_event_id` |
| F3 | P2 | Concorrenza / appeals | `db/appeals.ts:320-324` | `decideAppeal`: UPDATE senza guardia di stato → double-decision in race |
| F4 | P3 | Error handling / moderation | `app/lib/cache-purge.ts:75` | Fetch CF Purge API senza timeout, atteso inline sul write path |
| F5 | P2 | Privacy / retention | `db/auth.ts:271`, `db/mailer.ts:126`, `db/retention.ts` | `registrations_ip_log` e `email_send_log` mai spazzati (crescita illimitata + hash IP non salati) |
| F6 | P3 | Concorrenza / verifications | `db/confirmations.ts:219-245` | Quota giornaliera/per-record TOCTOU (count-then-insert non atomico) |
| F7 | P3 | Rate limiting / cap per-IP | `app/lib/rate-limit.ts:236-245` | `callerKey` fida di `X-Forwarded-For` spoofabile senza `cf-connecting-ip` |

---

## F1 (P2) — Cookie di sessione malformato: URIError non gestito → 503 / crash

**File:riga:** `app/lib/csrf.ts:43` (`cookies[name] = decodeURIComponent(value)` senza try/catch);
`app/api/auth/me/route.ts:30` (readCookie dentro il try → 503);
`app/api/appeals/route.ts:112` (`resolveOptionalContributor` FUORI dal try → eccezione fuori dall'handler).

**Scenario di riproduzione:**
```
GET /api/auth/me
Cookie: osdb_session=%E0%A4%A        (percent-encoding troncato)
```
`decodeURIComponent("%E0%A4%A")` lancia `URIError: URI malformed`:
- su `/api/auth/me` il catch della route risponde **503 "Unable to read the session"** invece del 401 da anonimo;
- su `POST /api/appeals` l'eccezione **esce dall'handler** (500 di framework) perché il resolve è prima del `try`.

**Impatto:** un chiamante anonimo può generare 5xx a piacimento su qualunque route
che risolva la sessione (robustezza, log flooding, status code sbagliato: il
contratto è "nessun cookie / cookie morto = anonimo = 401").

**Fix proposto:**
```ts
// app/lib/csrf.ts parseCookies
try {
  if (name && cookies[name] === undefined) cookies[name] = decodeURIComponent(value);
} catch {
  // percent-encoding malformato: tratta il cookie come assente
}
```
E spostare `resolveOptionalContributor` dentro il `try` in `app/api/appeals/route.ts`.

**Test:** `F1a` (GET /api/auth/me → deve rispondere 401, oggi 503) e `F1b` (POST /api/appeals → non deve lanciare, oggi URIError). **ROSSI.**

---

## F2 (P2) — fileAppeal: `duplicate_pending` non atomico, manca UNIQUE parziale

**File:riga:** `db/appeals.ts:203-209` (SELECT pending → INSERT in due statement
separati); `drizzle/0010_auth_roles_appeals.sql:24-42` (solo `status_idx` e
`entity_idx`, nessun vincolo UNIQUE su `decision_event_id`).

**Scenario di riproduzione:** due `POST /api/appeals` concorrenti con lo stesso
`decisionEventId` (decisione finale): entrambe passano il check `existing`
(nessuna pending visibile), entrambe inseriscono → **due appeal pending sulla
stessa decisione**, due eventi "appeal-filed" nell'audit log. Il 409
`duplicate_pending` documentato è aggirabile in concorrenza e la coda dei
senior moderator si duplica.

**Fix proposto:** migrazione con indice UNIQUE parziale + insert condizionale:
```sql
CREATE UNIQUE INDEX moderation_appeals_pending_decision_unique
  ON moderation_appeals (decision_event_id) WHERE status = 'pending';
```
```ts
// db/appeals.ts: INSERT ... ON CONFLICT DO NOTHING RETURNING id
//   -> nessuna riga tornata = duplicate_pending
```

**Test:** `F2` — deve esistere un indice UNIQUE che copra `decision_event_id`
(PRAGMA index_list/index_info su `moderation_appeals`). **ROSSO.**

---

## F3 (P2) — decideAppeal: UPDATE finale senza guardia di stato atomica

**File:riga:** `db/appeals.ts:320-324` (`UPDATE moderation_appeals SET status=... WHERE id = ?`
senza `AND status IN ('pending','escalated')`); il guard è solo nel SELECT
precedente (riga 288-294). Confronto col pattern dello stesso codebase:
`db/moderation.ts:1022-1025` (`moderateCamera` usa `WHERE id = ? AND status = ?`).

**Scenario di riproduzione:** due `PATCH /api/appeals/[id]` concorrenti dello
stesso appeal: entrambe leggono `pending`, entrambe passano i guard, il batch
gira due volte → last-write-wins (una decisione può ribaltare quella appena
presa), **due eventi di decisione** nell'audit trail, e su `uphold` la coda
viene riaperta due volte. La guardia `not_pending` non è atomica.

**Fix proposto:**
```ts
"UPDATE moderation_appeals SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?
 WHERE id = ? AND status IN ('pending','escalated') RETURNING id"
```
e mappare `changes = 0` → `not_found`/`not_pending`.

**Test:** `F3` — la UPDATE esatta di decideAppeal eseguita su un appeal già
`upheld` deve toccare 0 righe (oggi ne tocca 1: `1 !== 0`). **ROSSO.**

---

## F4 (P3) — purgeCacheTags: fetch senza timeout, atteso inline sul write path

**File:riga:** `app/lib/cache-purge.ts:75` (`fetch(PURGE_API/...)` senza
`AbortSignal.timeout` — tiles e geocode lo usano, questo no);
`app/api/moderation/route.ts:459-482` (`await purgeCacheTags(...)` DOPO che il
batch D1 ha già committato la decisione).

**Scenario di riproduzione:** l'API Cloudflare Cache Purge è lenta/hung (o il
token è valido ma la zona risponde piano): la risposta di moderazione resta
appesa finché il fetch non termina (o il platform timeout). Il D1 ha già
committato la decisione → il moderatore vede un errore e **ritenta**, ma
l'item è già transitato → 404 "Item not found". Caso peggiore proprio sul
takedown privacy/safety (il path più critico).

**Fix proposto:** `signal: AbortSignal.timeout(2500)` sul fetch (pattern già
usato in `tiles` e `geocode`), o fire-and-forget con log.

**Test:** `F4` — fetch stub signal-aware che non risolve mai senza abort;
`Promise.race` con budget 4s: oggi la chiamata non ha signal e resta appesa
(timeout → ROSSO); col fix abortisce entro il budget. **ROSSO.**

---

## F5 (P2) — registrations_ip_log / email_send_log: nessuna retention, hash IP non salati

**File:riga:** `db/auth.ts:271-300` (`recordRegistrationAttempt` inserisce in
`registrations_ip_log`); `db/mailer.ts:126-137` (`recordEmailSend` inserisce in
`email_send_log`); `db/retention.ts:27-32` (la policy R16 copre solo
`login_attempts`; nessuna R-* per le altre due — RETENTION_SCHEDULE.md non le
menziona).

**Scenario di riproduzione:** il cap per-IP (5/24h) e il budget mail (3/h)
contano SOLO le righe dentro la finestra (24h / 1h); le righe più vecchie non
servono più a nulla ma non vengono MAI eliminate:
- `registrations_ip_log`: cresce di una riga per ogni tentativo di
  registrazione, per sempre; conserva SHA-256 **non salati** di caller key (IP)
  — brute-forcable sullo spazio IPv4 → contro la minimizzazione del progetto;
- `email_send_log`: una riga per ogni mail inviata, per sempre.

**Fix proposto:** aggiungere alla policy e allo sweep (speculare a R16):
- `registrations_ip_log`: purge > 30 giorni (`registrationsIpDays: 30`);
- `email_send_log`: purge > 24 ore (il budget ne ha bisogno solo per l'ultima ora);
e documentare entrambe in RETENTION_SCHEDULE.md.

**Test:** `F5` — dopo `runRetentionSweep(NOW)` le righe vecchie di entrambe le
tabelle devono sparire (oggi restano: `1 !== 0`). **ROSSO.**

---

## F6 (P3) — setConfirmation: quota giornaliera/per-record TOCTOU

**File:riga:** `db/confirmations.ts:219-245` (SELECT COUNT → INSERT in due
statement separati; l'UNIQUE `(camera_id, contributor_id)` deduplica solo la
stessa coppia, non le quote).

**Scenario di riproduzione:** con la quota giornaliera a N, due PUT concorrenti
dello stesso contributor su record diversi leggono entrambe `N-1` → entrambe
inseriscono → **N+1 righe** (cap sforato di 1 per ogni race). Stesso discorso
per il per-record cap con account distinti. Overshoot limitato (+1/race) ma la
commentata "daily quota as D1 state inside the write path" non è atomica come
sostiene.

**Fix proposto:** INSERT condizionale con il conteggio in una sola statement
(es. `INSERT ... SELECT ... WHERE (SELECT COUNT(*) ... ) < max` +
`ON CONFLICT DO NOTHING`), oppure re-count post-insert con compensazione
(delete della riga eccedente e risposta quota_exceeded).

**Test:** `F6` — contratto sequenziale con `CONFIRMATIONS_DAILY_MAX=1`: primo
toggle ok, secondo `daily_quota_exceeded` (pin del comportamento che il fix
deve rendere atomico sotto race). **VERDE** (il harness D1 sincrono non può
interleave; la race è documentata qui sopra con il fix).

---

## F7 (P3) — callerKey fida di X-Forwarded-For spoofabile senza cf-connecting-ip

**File:riga:** `app/lib/rate-limit.ts:236-245` (`callerKey`: senza
`cf-connecting-ip` usa il primo hop di `X-Forwarded-For`).

**Scenario di riproduzione:** su una deployment NON dietro l'edge Cloudflare
(es. il prototype LXC 114 servito in HTTP diretto, vedi nota in
`worker/index.ts:211-214`) l'header `X-Forwarded-For` è interamente
controllato dal client: un account-farm ruota l'header a ogni richiesta e
azzera TUTTI i cap per-IP — incluso il **cap registrazione 5/24h** (anti
account-farm, t_0941036b) e i bucket auth/submit/tiles/geocode. In produzione
CF `cf-connecting-ip` è sempre presente e sovrascritto dall'edge, quindi il
rischio è confinato alle deployment non-CF (ma è proprio lì che gira il
prototype).

**Fix proposto:** senza `cf-connecting-ip` non fidarsi di XFF (default
`"unknown"`, bucket unico globale), oppure richiedere un knob esplicito
(`TRUST_XFF=true`) per deployment dietro un proxy affidabile. Nota: il
comportamento attuale è pinnato da `abuse-controls.test.mjs:151-153` — il fix
va coordinato con Ada (cambia un contratto testato).

**Test:** `F7` — 6 registrazioni con `X-Forwarded-For` ruotato (senza
`cf-connecting-ip`): il cap 5/24h deve reggere (oggi tutte e 6 passano:
`201,201,201,201,201,201` → `6 !== 5`). **ROSSO.**

---

## Verifiche senza esito (non bug, documentate per tracciabilità)

- `app/lib/cache-purge.ts:78` — la riga `Authorization: \`Bearer ${token}\``
  è corretta (un rendering precedente sembrava mostrare `***`; verificato con
  `od -c` sul sorgente).
- `db/moderation.ts:894-905` — `secondReviewerId = first?.reviewerId` sembra
  invertito ma è la semantica voluta: `reviewer_id` = attore corrente,
  `second_reviewer_id` = l'altro reviewer della coppia (pinnato da
  `auth-flow-e2e.test.mjs:679`).
- `parseTile` accetta `z/x/y` in notazione `0x…`/`1e…` (Number() coerci)
  ma i range check (0..19, 0..2^z-1) rendono il risultato identico a un tile
  valido: nessuna superficie di abuso.
- OIDC `redirect_to` è validato da `safeRedirectTarget` (solo path relativi
  same-origin, niente `//`/schemi/whitespace) → nessun open redirect.

## Limitazioni

- Le race (F2, F3, F6) non sono riproducibili con il harness D1 sincrono
  (node:sqlite serializza): i test verificano il vincolo strutturale del fix;
  la riproduzione "vera" richiede il deploy D1 reale o un harness con D1
  asincrono.
- F7 dipende dalla topologia di deployment (edge CF presente/assente).
- I 7 test rossi rompono `npm test` finché i fix non atterrano: è il
  comportamento red-before-green voluto (stessa convenzione di
  `malformed-json-routes.test.mjs`). La PR che applica i fix deve includere i
  test.

## File toccati

- `tests/qa-funzionale-linus.test.mjs` (nuovo, 8 test)
- `docs/qa/qa-funzionale-linus.md` (questo report)
