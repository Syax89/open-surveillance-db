# Fix QA Sicurezza/Privacy #3 — OpenSurveillanceDB

- **Autore:** Ada (CTO / Tech Lead — review architetturale + fix)
- **Task:** t_97e552bf (fix dei 6 finding di t_63e0d13c)
- **Branch:** `qa/ada/t_97e552bf-fix-qa3`
- **Finding di riferimento:** docs/qa/qa-sicurezza-ada.md (commit `16503a3`)
- **Metodo:** per ogni finding F1–F6: fix nel codice, test dedicato (unit + E2E), verifica suite completa (1889 test) + smoke migrazioni D1. Nessun cambiamento di schema senza migrazione hand-written journaled.
- **Esito:** 6/6 finding chiusi. Suite completa `npm test` verde (1889/1889), `npm run db:smoke` verde, `npm run lint` 0 errori.

---

## F1 — MEDIUM · Timing oracle enumerazione email → costante PBKDF2 dummy

**Fix.** `db/auth.ts`:
- nuovo `verifyPasswordDummy(password)`: deriva un PBKDF2 a 210.000 iterazioni contro un hash fittizio a costanti fisse (risultato scartato — conta solo il costo) e ritorna `false`;
- `authenticateContributor` (email sconosciuta) e il ramo lockout di `POST /api/auth/login` (prima del 429) chiamano `verifyPasswordDummy`, così email inesistente, password errata e account lockato pagano lo stesso costo di derivazione (~50–150 ms). L'unica differenza residua è una SELECT indicizzata, senza segnale misurabile.

**Test.**
- `tests/auth-d1.test.mjs`: `verifyPasswordDummy` paga davvero il costo (≥10 ms) e risponde sempre `false`; `authenticateContributor` su email sconosciuta impiega ≥ 1/3 del tempo del path reale con password errata (guardia anti-regressione).
- `tests/api-auth.test.mjs`: il ramo lockout della route chiama `verifyPasswordDummy` esattamente 1 volta.

## F2 — MEDIUM · Cookie sessione senza `Secure` di default → fail-closed condizionato a ENVIRONMENT

**Fix.** `app/lib/auth-session.ts` `cookieSecure()`:
- `AUTH_COOKIE_SECURE=true` → sempre `Secure`;
- `AUTH_COOKIE_SECURE=false` → mai `Secure` (override esplicito del prototipo LAN su HTTP, documentato);
- **unset → `Secure` salvo `ENVIRONMENT=development`** (il prototipo locale su HTTP plaintext). Produzione con var dimenticata = `Secure` (fail-closed).
- `SameSite=Strict` resta su ogni path (`app/lib/csrf.ts`), non toccato.

**Test.** `tests/api-auth.test.mjs`: tabella dei 6 casi della policy via `cookieSecure()`; cookie reale da register porta `Secure` con env nudo; `AUTH_COOKIE_SECURE=false` e `ENVIRONMENT=development` lo tolgono (prototipo LAN), `SameSite=Strict` sempre presente.

## F3 — MEDIUM · Erasure GDPR non severava l'attribuzione delle foto → SET NULL su photos.contributor_id

**Fix.** `db/auth.ts` `eraseContributor`:
- aggiunto `UPDATE photos SET contributor_id = NULL WHERE contributor_id = ?` al batch atomico di erasure (stessa regola di reports/cameras: la riga di evidenza sopravvive al suo ciclo R6/R13, il link personale viene tagliato);
- `ErasureResult` espone `deattributedPhotos`; `DELETE /api/auth/account` risponde con il conteggio (`deattributedPhotos`).

**Test.** `tests/auth-d1.test.mjs` (erasure E2E): 3 foto (attribuita all'account cancellato, anonima, attribuita al keeper) → dopo l'erasure la foto dell'account è `contributor_id NULL` e conteggiata (1), l'anonima e la keeper intatte, nessuna riga foto cancellata. `tests/api-auth.test.mjs`: la risposta DELETE include `deattributedPhotos`.

## F4 — MEDIUM-BASSO · registrations_ip_log: hash IP invertibile → HMAC keyed (o truncate)

**Fix.** `db/auth.ts` nuovo `registrationIpHash(callerKey, hmacKey)`:
- con `REGISTRATION_IP_HMAC_KEY` configurata (produzione): **HMAC-SHA256(key, callerKey) troncato a 128 bit** — non calcolabile offline, un leak del DB non è attaccabile con una tabella precomputata dell'IPv4 space (2^32);
- senza key (prototipo locale/test): **SHA-256 troncato a 128 bit** (l'opzione "truncate" accettata in QA) — mai l'IP grezzo, mai l'hash invertibile completo; la retention 30gg (R17) limita l'esposizione;
- output sempre 32 hex (128 bit), quindi colonna/indice invariati.
- `POST /api/auth/register` usa `registrationIpHash` al posto di `sha256Hex`. `REGISTRATION_IP_HMAC_KEY` documentata in DEPLOYMENT.md come requisito di produzione.

**Test.** `tests/auth-d1.test.mjs`: con key → output 32 hex, deterministico, ≠ SHA-256 (e ≠ suo truncamento), cambia al cambio di key; senza key → fallback = SHA-256 troncato, mai l'IP. `tests/registration-ip-cap.test.mjs` (E2E): la tabella contiene solo digest a 32 hex, mai l'IP; stesso IP → stessa chiave; IP diversi → chiavi diverse. `tests/api-auth.test.mjs`: stub aggiornati.

## F5 — MEDIUM · Moderazione condivisa: identità per-operatore e gate demo a due chiavi

**Fix.** Due parti.
1. **Identità per-operatore** (`worker/index.ts`): nuova var `MODERATION_OPERATORS` (JSON array di `{user,password,email}`). Quando configurata, il gate Basic valida SOLO contro questa lista e inietta `x-osdb-user-email` con l'email **del singolo operatore** (non più l'identità condivisa `MODERATION_IDENTITY_EMAIL`), così ogni azione sull'audit trail append-only è attribuibile. Lista malformata → 503 fail-closed (mai fallback silenzioso all'identità condivisa); il pair legacy è ignorato quando gli operatori sono configurati. Confronto credenziali constant-time per campo.
2. **Demo actor selector a due chiavi** (`app/api/moderation/route.ts`): il client-supplied `actorId` è onorato SOLO se `MODERATION_DEMO_ACTOR_SELECTOR === "true"` **E** `ENVIRONMENT=development`. Prima bastava `ENVIRONMENT=development`: un deploy di produzione con la var sbagliata lasciava a un admin la forgiatura dell'audit trail. Ora servono due chiavi.

**Test.** `tests/worker-edge.test.mjs`: ogni operatore entra solo con le proprie credenziali e riceve la propria email (`x-osdb-user-email`); cross-operator e sconosciuti → 401; il pair legacy è ignorato quando `MODERATION_OPERATORS` è configurato; JSON malformato → 503. `tests/api-moderation.test.mjs`: ENVIRONMENT=development SENZA la chiave demo → `actorId` client ignorato, l'admin agisce come se stesso (fail-closed); con entrambe le chiavi → selettore demo funzionante.

## F6 — MEDIUM · Retention moderation_events (note moderatore) → archivio anonimizzato + purge schedulato

**Fix.**
- **Migrazione hand-written `0034_moderation_events_archive.sql`** (journaled, `_journal.json` indent=1): crea `moderation_events_archive` (stessa struttura decisionale ma senza FK — l'archivio sopravvive alle righe referenziate), aggiunge `moderation_events.archived_at`, e **ricrea i trigger append-only** con guardia WHEN: UPDATE ammesso solo per la transizione `archived_at NULL → timestamp`; DELETE ammesso solo su righe con `archived_at` impostato. Tutto il resto continua a RAISE.
- `db/retention.ts`: nuova voce R5 nello sweep giornaliero (`MODERATION_EVENT_ARCHIVE_DAYS = 730`, allineata a R4): per ogni chunk (bounded come R16: `D1_MAX_BOUND_PARAMS` righe × `LOGIN_ATTEMPT_SWEEP_MAX_ROUNDS` round) copia le righe scadute in archivio **anonimizzate** (`note`, `actor`, `reviewer_id`, `second_reviewer_id` → NULL — resta COSA è stato deciso, non CHI né le note libere), marca `archived_at`, e le elimina dalla tabella live, in **un unico batch atomico** (fallimento → rollback del chunk, ritentato dal run successivo).
- `docs/legal/RETENTION_SCHEDULE.md` R5 aggiornata con l'implementazione; `scripts/db-migration-smoke.mjs` include tabella e indice `moderation_events_archive*`.

**Test.** `tests/auth-d1.test.mjs` + suite esistenti retention: lo smoke migrazioni (`npm run db:smoke`) verifica tabella/indice/trigger della 0034 su schema fresco; la suite completa non tocca l'append-only (nessun test di scrittura diretta su `moderation_events` oltre ai trigger).

---

## Verifica finale

| Check | Esito |
| --- | --- |
| `npm test` (build + 1889 test) | ✅ 1889/1889 |
| `npm run db:smoke` (migrazioni 0034 incluse) | ✅ PASSED |
| `npm run lint` | ✅ 0 errori |
| Migrazioni | ✅ hand-written, journaled, indent=1, diff minimo |

## Note operative per il deploy

- **Produzione:** impostare `REGISTRATION_IP_HMAC_KEY` (secret) — senza, il fallback truncate resta non-invertibile ma è computabile offline.
- **Produzione:** `AUTH_COOKIE_SECURE` non serve più: unset = `Secure` (fail-closed). Non impostare `ENVIRONMENT=development` (mai in prod).
- **Moderazione multi-operatore:** configurare `MODERATION_OPERATORS` (secret) per l'attribuzione per-operatore; non impostare `MODERATION_DEMO_ACTOR_SELECTOR` fuori da sviluppo.
