# QA Report — E2E flusso autenticato auth->submit->moderate->publish (t_ad79286d)

**QA Engineer:** Grace (OpenSurveillanceDB Ltd.)
**Data:** 2026-08-01
**PR:** https://github.com/Syax89/open-surveillance-db/pull/56 (feature/auth-flow-e2e-qa)
**Esito CI:** ✅ 4/4 verde — Lint·Typecheck·Test·Build, Fresh-DB migration smoke, Gitleaks, npm audit

---

## 1. Cosa è stato aggiunto

Due file nuovi (786 righe):

- `tests/helpers/e2e-harness.mjs` — harness E2E che per la prima volta collega le
  **route reali** ai **moduli db reali** su un D1 in-memory fresco (schema applicato
  riproducendo le migrazioni Drizzle reali, come `wrangler d1 migrations apply`).
  Include il transpile runtime del worker edge gate con gli import vinext stubati,
  così l'auth gate viene esercitato a runtime con Request reali (non più solo con
  scansione statica del sorgente).
- `tests/auth-flow-e2e.test.mjs` — 15 test end-to-end del flusso completo.

## 2. Copertura dei 6 punti richiesti

| # | Punto del task | Esito | Test |
|---|---|---|---|
| 1 | Login contributore (auth) | ✅ PASS | 5 test sul worker gate: fail-closed 503 senza credenziali; 401 senza/con Basic errato; pass-through con Basic corretto; bearer token ok/errato; route pubbliche MAI gated |
| 2 | Submit record | ✅ PASS | submit → 201 `pending` → assente da ogni superficie pubblica; presente nella coda moderazione |
| 3 | Moderatore approva/rifiuta | ✅ PASS | approve → `verified` + pubblicato; reject → `rejected` + non pubblicato; matrice ruoli enforce (intake_reviewer non può approvare → 403; reviewer inesistente → 404; inattivo → 403) |
| 4 | Record appare/non appare in pubblico | ✅ PASS | listing pubblico, revisions (404 su non-pubblico), nearby e coordinate search espongono solo `verified` |
| 5 | Appeal contestato e gestito | ✅ PASS | correction privata contestata → escalate con nota obbligatoria → queue `escalated` → non-resolver 403 → senior moderator approva con outcome `marked-stale` → record in `needs_review` e rimosso dal pubblico; + sensitive approval con secondo reviewer (202 → 409 stesso reviewer → verified con reviewer diverso) |
| 6 | Audit events presenti | ✅ PASS | un evento per transizione legale con contesto completo; append-only: UPDATE/DELETE bloccati dai trigger; revisions espone solo campi non-identificativi (mai actor/note) |

## 3. Verifica copertura route (100%)

Test dedicato "E2E suite covers 100% of the API route surface": la suite registra
ogni route+method esercitato e **fallisce se una delle 8 combinazioni manca**:

- `cameras:GET` ✅ `cameras:POST` ✅
- `nearby:GET` ✅
- `search:GET` ✅
- `revisions:GET` ✅
- `corrections:POST` ✅
- `moderation:GET` ✅ `moderation:PATCH` ✅

Tutte le 6 route file coperte al 100%.

## 4. Esiti esecuzione (local, Node 22.22.3)

```
npm test (build + node --test "tests/*.test.mjs")
  # tests 457
  # pass  457
  # fail  0
  # duration ~5s
npx eslint tests/auth-flow-e2e.test.mjs tests/helpers/e2e-harness.mjs → clean
npx tsc --noEmit → clean
npm run db:smoke → PASSED (fresh-DB migration smoke)
```

Baseline pre-esistente: 442 test. Dopo questa PR: **457 test** (+15).

## 5. Anomalie / note

- **Nessuna anomalia funzionale trovata** nel codice testato: tutti i contratti
  (transizioni, ruoli, visibilità, audit, append-only) si comportano come
  documentato in docs/workstreams/DATA_TRUST.md e docs/MODERATION.md.
- Nota di processo: il worker edge gate era coperto solo staticamente
  (regex sul sorgente in publication-boundaries.test.mjs); ora è esercitato a
  runtime. La copertura statica resta come rete di sicurezza.
- Il test "unknown and inactive reviewers" esegue un UPDATE diretto su
  `reviewers` per simulare la disattivazione — legittimo perché la disattivazione
  è operazione di provisioning, non esposta dalle route.
- I fixture non contengono dati personali reali (requisito privacy-and-safety-by-design).

## 6. Raccomandazioni

- PR **mergeable**: CI 4/4 verde, nessun conflitto con main.
- Review finale in carico ad Ada (CTO) come da flusso del progetto.
