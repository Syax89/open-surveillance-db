# QA Coverage Report

Baseline generata il **2026-08-01** su commit `d456d77` con
`npm run coverage && npm run coverage:docs`. Suite: 730/730 test PASS, 0 fail.

## Riepilogo (solo codice di produzione, esclusi test/helper/mock/fixture)

| Metrica | Coperto | Totale | % |
|---|---|---|---|
| Righe | 4425 | 4743 | **93.30%** |
| Branch | 1207 | 1332 | 90.62% |
| Funzioni | 200 | 207 | 96.62% |
| Statement | 4425 | 4743 | 93.30% |

## Soglia minima CI

La soglia minima sulle righe è **75%** (default 75, override con `COVERAGE_LINES`).
È applicata dal job `coverage` in `.github/workflows/ci.yml` (`scripts/coverage-docs.mjs --check`):
sotto soglia il job fallisce.

## Moduli a coverage più bassa (priorità per nuovi test)

- `db/users.ts` — righe 82.05% (64/78), branch 75.00%, funzioni 71.43%
- `app/api/auth/logout/route.ts` — righe 82.50% (33/40), branch 60.00%, funzioni 100.00%
- `app/api/cameras/route.ts` — righe 82.66% (143/173), branch 96.47%, funzioni 100.00%
- `app/api/auth/me/submissions/route.ts` — righe 83.33% (25/30), branch 50.00%, funzioni 100.00%
- `app/api/photos/route.ts` — righe 87.12% (142/163), branch 86.00%, funzioni 100.00%
- `db/cameras.ts` — righe 87.83% (101/115), branch 93.94%, funzioni 90.91%
- `db/moderation.ts` — righe 87.97% (709/806), branch 88.20%, funzioni 100.00%
- `app/lib/abuse-alerts.ts` — righe 88.73% (126/142), branch 88.46%, funzioni 100.00%
- `app/lib/image-metadata.ts` — righe 89.82% (300/334), branch 85.34%, funzioni 100.00%
- `app/api/corrections/route.ts` — righe 91.07% (51/56), branch 91.67%, funzioni 100.00%

## Dettaglio per file

| File (sorgente) | Righe % | Branch % | Funzioni % | Righe coperte/totali |
|---|---|---|---|---|
| `db/users.ts` | 82.05 | 75.00 | 71.43 | 64/78 |
| `app/api/auth/logout/route.ts` | 82.50 | 60.00 | 100.00 | 33/40 |
| `app/api/cameras/route.ts` | 82.66 | 96.47 | 100.00 | 143/173 |
| `app/api/auth/me/submissions/route.ts` | 83.33 | 50.00 | 100.00 | 25/30 |
| `app/api/photos/route.ts` | 87.12 | 86.00 | 100.00 | 142/163 |
| `db/cameras.ts` | 87.83 | 93.94 | 90.91 | 101/115 |
| `db/moderation.ts` | 87.97 | 88.20 | 100.00 | 709/806 |
| `app/lib/abuse-alerts.ts` | 88.73 | 88.46 | 100.00 | 126/142 |
| `app/lib/image-metadata.ts` | 89.82 | 85.34 | 100.00 | 300/334 |
| `app/api/corrections/route.ts` | 91.07 | 91.67 | 100.00 | 51/56 |
| `app/api/cameras/search/route.ts` | 92.21 | 95.83 | 100.00 | 71/77 |
| `app/api/auth/me/route.ts` | 92.86 | 71.43 | 100.00 | 26/28 |
| `worker/index.ts` | 92.91 | 96.67 | 75.00 | 131/141 |
| `app/api/auth/register/route.ts` | 93.15 | 90.91 | 100.00 | 68/73 |
| `app/api/moderation/route.ts` | 93.17 | 87.22 | 100.00 | 273/293 |
| `app/api/moderation/photos/[id]/route.ts` | 93.75 | 60.00 | 100.00 | 30/32 |
| `app/api/auth/login/route.ts` | 96.00 | 90.00 | 100.00 | 48/50 |
| `app/api/auth/account/route.ts` | 96.23 | 90.91 | 100.00 | 51/53 |
| `app/api/tiles/[z]/[x]/[y]/route.ts` | 96.55 | 95.74 | 100.00 | 168/174 |
| `db/appeals.ts` | 96.86 | 81.25 | 100.00 | 185/191 |
| `db/auth.ts` | 97.11 | 86.00 | 90.00 | 302/311 |
| `app/lib/rate-limit.ts` | 97.56 | 96.00 | 100.00 | 120/123 |
| `app/api/appeals/route.ts` | 98.43 | 93.88 | 100.00 | 125/127 |
| `app/api/appeals/[id]/route.ts` | 100.00 | 97.67 | 100.00 | 121/121 |
| `app/api/cameras/nearby/route.ts` | 100.00 | 100.00 | 100.00 | 51/51 |
| `app/api/cameras/revisions/route.ts` | 100.00 | 94.12 | 100.00 | 56/56 |
| `app/api/photos/[id]/route.ts` | 100.00 | 87.50 | 100.00 | 55/55 |
| `app/lib/auth-route-helpers.ts` | 100.00 | 100.00 | 100.00 | 60/60 |
| `app/lib/auth-session.ts` | 100.00 | 100.00 | 100.00 | 50/50 |
| `app/lib/authz.ts` | 100.00 | 100.00 | 100.00 | 48/48 |
| `app/lib/csrf.ts` | 100.00 | 92.59 | 100.00 | 107/107 |
| `app/lib/data-license.ts` | 100.00 | 100.00 | 100.00 | 11/11 |
| `app/lib/duplicate-detection.ts` | 100.00 | 96.77 | 100.00 | 64/64 |
| `app/lib/guards.ts` | 100.00 | 100.00 | 100.00 | 3/3 |
| `app/lib/input-limits.ts` | 100.00 | 100.00 | 100.00 | 52/52 |
| `app/lib/public-status.ts` | 100.00 | 100.00 | 100.00 | 24/24 |
| `app/lib/records.ts` | 100.00 | 100.00 | 100.00 | 37/37 |
| `app/lib/search.ts` | 100.00 | 100.00 | 100.00 | 93/93 |
| `db/corrections.ts` | 100.00 | 75.00 | 100.00 | 13/13 |
| `db/freshness.ts` | 100.00 | 96.30 | 100.00 | 80/80 |
| `db/photos.ts` | 100.00 | 91.67 | 100.00 | 208/208 |

## Metodologia

- I test transpilano le route `app/api/**`, i moduli `app/lib/*`, `db/*` e `worker/index.ts`
  in alberi temporanei (harness in `tests/helpers/`); con `OSDB_COVERAGE_TREE=1` gli alberi
  restano su disco in `.coverage/trees/` (gitignored) così il reporter Node può attribuire le righe.
- Esclusi dal computo: `tests/**`, helper e mock di test (`cloudflare-workers.mjs`, `db/geocode.mjs`,
  mocks `db/*` dell'albero routes, stub vinext), `node_modules`, bundle `dist/` (build di Next).
- I file transpilati sono rimappati alla sorgente TypeScript (`db-real/cameras.mjs` → `db/cameras.ts`,
  `worker.mjs` → `worker/index.ts`) e le istanze duplicate nei quattro harness sono **unite per
  linea/branch/funzione/statement** (union degli hit): il numero riflette la copertura reale del
  sorgente, non la somma di istanze parziali.
- Il bundle `dist/server/index.js` è escluso: i test pagina lo caricano come modulo ma è output
  di build, non sorgente. I componenti client (`app/components` "use client") non sono quindi
  misurati da questa metrica — copertura a cura dei test di interazione (PR #94).
- Dati grezzi V8: `.coverage/raw/`; report Istanbul: `.coverage/report/`; log run: `.coverage/coverage.txt`.
