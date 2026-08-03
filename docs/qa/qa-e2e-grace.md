# QA Approfondito #4 — E2E e Qualità (Grace)

- Task: t_56d09899 · Branch: qa/t_56d09899-e2e-quality · HEAD base: 16503a3 (= origin/main)
- Data: 2026-08-03 · Eseguito sul worktree del task (repo condiviso, 3 copie locali)
- Suite completa: **1859/1859 test verdi** (npm test, 89s) · tsc --noEmit: OK · db:smoke: presente in CI

## Sintesi

Ricerca a tutto campo sui journey E2E, test suite, dati demo, migrazioni, build/deploy e
worker runtime. La suite è in ottimo stato (1859 verdi, zero flaky nei run mirati 62/62);
i journey richiesti dal CEO (registrazione→verifica→segnala→moderazione→pubblica,
login→passkey, reset password, correzione→appeal) sono tutti coperti da test reali con D1
in-memory (e2e-journeys, auth-verify-e2e, qa-multiauth-write-gate-e2e, appeals, auth-flow-e2e).

Sono emerse **5 issue concrete** (2 P2, 3 P3), tutte con riproduzione. Le prime due sono
state riprodotte con un test dedicato che esegue il retention sweep REALE contro le
migrazioni reali su D1 in-memory (tests/qa4-retention-gap-repro.test.mjs, verde = comportamento attuale documentato).

---

## Issue 1 — P2: le demo records (R12) non vengono MAI purgate

**Area:** dati demo / retention · **File:** db/retention.ts, docs/legal/RETENTION_SCHEDULE.md

**Descrizione.** RETENTION_SCHEDULE.md R12: "`demo` records — Purged before public launch".
Ma nel codice NON esiste alcun purge R12: il retention sweep filtra solo
pending/rejected/needs_review/stale (R1/R2/R3), mai `status = 'demo'`. La migration
0017_remove_demo_seed elimina i demo *users/reviewers* (@osdb.test) ma NON le demo
*cameras* create da scripts/demo-cameras.sql ('Illustrative record A/B'). Nessuno script di
purge demo esiste in scripts/. Il gate fail-closed `demoRecordsPublic()` (t_d7a4b99b) le
nasconde dalle superfici pubbliche in produzione — bene — ma le righe restano nel D1 di
produzione per sempre se qualcuno ha eseguito `npm run db:seed` (o se un DB dev viene
promosso). In `ENVIRONMENT=development` restano visibili per design.

**Riproduzione (test reale, verde = comportamento attuale):**
```
tests/qa4-retention-gap-repro.test.mjs
  demo cameras rows:    before=1 after=1   ← runRetentionSweep non le tocca
```
(INSERT demo camera → runRetentionSweep(NOW) → la riga sopravvive.)

**Fix proposto.** Aggiungere la R12 al retention sweep (o a una migration pre-lancio):
```
DELETE FROM cameras WHERE status = 'demo'
```
eseguito solo quando `env.ENVIRONMENT !== 'development'` (fail-closed, coerente con
demoRecordsPublic), + conteggio in RetentionSummary e test in retention.test.mjs.
Nota: l'audit 2026-08-02 (AUDIT_REPORT.md:213) ha già "gate demo purge R12 (ada/ken)" come
azione aperta — questo finding la rende concreta con riproduzione.

---

## Issue 2 — P2: email_send_log cresce senza limite (nessuna retention)

**Area:** worker runtime / retention · **File:** db/retention.ts, db/mailer.ts, drizzle/0029_email_send_log.sql

**Descrizione.** `email_send_log` (migration 0029, rate-limit 3 email/h per contributore,
ADR 0020) riceve UNA riga per ogni email inviata (`recordEmailSend`) e l'unico DELETE è la
cascade con `deleteAccount` (db/auth.ts). Il retention sweep copre sessions (R7), token
verify + webauthn challenges (R15) e login_attempts (R16), ma **non** email_send_log:
nessuna R-number la menziona. Un contributore attivo che usa il limite 3/h accumula
~90 righe/mese di puro garbage (il rate-limit conta solo la finestra 1h, righe più vecchie
inutili) finché l'account esiste. Su D1 (storage a pagamento) è una crescita illimitata.

**Riproduzione (test reale, verde = comportamento attuale):**
```
tests/qa4-retention-gap-repro.test.mjs
  email_send_log rows:  before=2 after=2   ← righe di 90 e 400 giorni sopravvivono
  sessions (R7):        before=1 after=0   ← controllo positivo: R7 funziona
```

**Fix proposto.** In db/retention.ts, accanto a R15: sweep TTL-bounded
```
DELETE FROM email_send_log WHERE sent_at < ?   -- now - 90d (o 30d)
```
+ campo `emailSendLogPurged` nel summary + test. Le righe non servono oltre la finestra
rate-limit (1h), quindi anche 30 giorni sono conservativi.

---

## Issue 3 — P2: coerenza "3 copie" del repo rotta — lavoro non committato su route auth

**Area:** processo / repo · **File:** copie locali di open-surveillance-db

**Descrizione.** Le 3 copie locali del repo sono su commit DIVERSE e la copia principale
(~/open-surveillance-db) è su `feature/linus/t_894e0cc3-qa-funzionale` con **17 file
modificati NON committati**, incluse route auth critiche (app/api/auth/login, oidc/merge,
reset-password/confirm, app/lib/auth-route-helpers.ts, app/lib/i18n/auth.ts,
app/register/page.tsx, ResetPasswordBody.tsx + 7 test). Il diff non committato applica il
refactor `isValidPasswordShape` che è **GIÀ su origin/main** (verificato: 16503a3 contiene
`isValidPasswordShape` in login/route.ts:16,76). Quindi: stesso lavoro duplicato a mano su
un branch divergente, non committato → rischio di perdita, conflitti al merge e
incoerenza tra ciò che gira nelle 3 copie.

**Riproduzione:**
```
~/open-surveillance-db:      HEAD da7a32c (feature/linus/...) + 17 file M non committati
~/workspace/open-surveillance-db: HEAD 744984c (più indietro)
worktree t_56d09899:         HEAD 16503a3 (= origin/main)
git diff app/api/auth/login/route.ts  → -isValidPassword +isValidPasswordShape  (duplica #264/#271)
```

**Fix proposto.** Allineare le copie locali a origin/main (fetch + reset del branch feature
o rebase), committare/scartare il lavoro residuo, e aggiungere un check pre-build che
fallisca se il working tree è sporco sui path auth. La regola "3 copie coerenti" andrebbe
esplicitata in docs/DEVELOPMENT_SETUP.md (una sola copia di lavoro attiva per task).

---

## Issue 4 — P3: worker-configuration.d.ts è stale (12 env usate dal codice mancanti)

**Area:** worker runtime / env · **File:** worker-configuration.d.ts vs worker/index.ts (interface Env)

**Descrizione.** Il file dichiara "equivalente a quanto genererebbe `wrangler types`", ma
manca di 12 variabili che l'interface `Env` del worker e il codice leggono davvero:
`MODERATION_USER/PASSWORD/TOKEN/IDENTITY_EMAIL`, `CACHE_PURGE_TOKEN/ZONE_ID`,
`AUTH_SESSION_TTL_DAYS`, `AUTH_COOKIE_SECURE`, `AUTH_RATE_LIMIT_MAX/WINDOW_SECONDS`,
`EMAIL_SEND_LIMIT_MAX/WINDOW_SECONDS`, `TRUST_PLATFORM_HEADERS`. Il typecheck passa SOLO
perché le route leggono env con cast `as EnvLike`/`unknown` (pattern strutturale): chi
scrive codice nuovo che accede a `env.MODERATION_USER` senza cast riceverebbe un errore TS
o nessun autocomplete — e nessun controllo se il nome viene scritto male.

**Riproduzione:**
```
diff tra le chiavi di worker-configuration.d.ts (Env) e worker/index.ts (interface Env):
  mancanti nella d.ts: AUTH_COOKIE_SECURE, AUTH_RATE_LIMIT_*, AUTH_SESSION_TTL_DAYS,
    CACHE_PURGE_*, EMAIL_SEND_LIMIT_*, MODERATION_*, TRUST_PLATFORM_HEADERS
  (tsc --noEmit passa: exit 0 — confermato, il cast lo maschera)
```

**Fix proposto.** Allineare `worker-configuration.d.ts` all'interface Env di worker/index.ts
(aggiungere le 12 chiavi con i commenti), o rigenerarla con `wrangler types` e committare
il risultato. Aggiungere un test che confronta i due set di chiavi (coerenza Env).

---

## Issue 5 — P3: /api/locale senza test (1 route su 38 non coperta)

**Area:** test suite / gap · **File:** app/api/locale/route.ts, tests/

**Descrizione.** Gap analysis scriptata su tutte le 38 route API (scripts/qa-route-gap.mjs):
**solo** `/api/locale` non ha alcun test diretto (`loadRoute("app/api/locale/route.mjs")`
non compare in nessun test). La route ha logica di sicurezza non banale — validazione del
redirect target anti open-redirect (`next.startsWith("/")`, blocca `//host`, backslash,
CRLF e `%0d/%0a`), Set-Cookie del locale, X-Robots-Tag — completamente non testata. Il
client-side toggle è coperto (client-locale-toggle.test.mjs) ma la route server no.

**Riproduzione:**
```
node scripts/qa-route-gap.mjs
  ROUTE SENZA TEST DIRETTI (loadRoute): locale
  total: 38, tested: 37, untested: 1
```

**Fix proposto.** tests/api-locale.test.mjs: GET con `lang=it&next=/guide` → 302 + cookie
+ Location corretto; `lang=xx` → fallback EN; `next=//evil.com`, `next=\evil.com`,
`next=/x%0d%0a` → Location "/"; 414 su URI lunghi. Pattern: api-auth-me-patch.test.mjs.

---

## Verifiche eseguite (tutto campo)

| Area | Esito |
|---|---|
| Journey E2E registrazione→verifica→segnala→moderazione→pubblica | ✅ coperto (e2e-journeys.test.mjs, auth-flow-e2e) |
| login→passkey (enroll→login→write gate) | ✅ qa-multiauth-write-gate-e2e (6 test) |
| reset password (request→confirm→single-use→retry) | ✅ auth-verify-e2e.test.mjs |
| correzione→appeal (file→decide, indipendenza, seniority) | ✅ appeals + api-appeals + auth-flow-e2e:851 |
| Test suite completa | ✅ 1859/1859 verdi · 89s |
| Flaky (timing-based: refetch-loop, tile-proxy, geocode, rate-limit) | ✅ 62/62 verdi (run mirato) |
| Dati demo: gate fail-closed + purge R12 | ⚠️ gate OK (demoRecordsPublic), **purge assente** (Issue 1) |
| Migrazioni Drizzle: journal 33 entry, snapshot per ogni idx, db:smoke in CI | ✅ coerenza journal/file OK |
| Build/deploy: ci.yml (lint+tsc+test+coverage+smoke), deploy.yml dry-run/deploy | ✅; deploy manuale non rilancia db:smoke (accettabile, gate CI a monte) |
| Worker runtime: cron 0 3 * * * (retention+OIDC sweep), bindings ratelimits 4 famiglie, EMAIL, R2, D1 | ✅; gap email_send_log (Issue 2), d.ts stale (Issue 4) |
| Coerenza 3 copie | ❌ main copy con 17 file M non committati, HEAD divergenti (Issue 3) |

## Note minori (non blocking)

- deploy.yml: in modalità deploy applica migrazioni remote senza rilanciare `npm run db:smoke`
  nello stesso workflow (il CI lo fa a monte su ogni PR — rischio basso, ma un gate esplicito
  nel job deploy costerebbe 30s).
- refetch-loop.test.mjs usa `pause()` reali (100/500ms) e tile-proxy un safety timeout 5s:
  passano, ma su runner molto lenti sono il candidato flaky più probabile (osservazione, non
  failure osservata).

## Artefatti

- Report: docs/qa/qa-e2e-grace.md (questo file)
- Riproduzione Issue 1+2: tests/qa4-retention-gap-repro.test.mjs (verde; documenta il
  comportamento attuale — da convertire in test rosso→verde quando i fix saranno applicati)
- Gap analysis route: scripts/qa-route-gap.mjs (QA tooling, non produzione)
