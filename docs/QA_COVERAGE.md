# QA Coverage Report

Baseline generata il **2026-08-01** su commit `950e8b2` con
`npm run coverage && npm run coverage:docs`. Suite: 984/984 test PASS, 0 fail.

## Riepilogo (solo codice di produzione, esclusi test/helper/mock/fixture)

| Metrica | Coperto | Totale | % |
|---|---|---|---|
| Righe | 5685 | 5976 | **95.13%** |
| Branch | 1399 | 1514 | 92.40% |
| Funzioni | 236 | 242 | 97.52% |
| Statement | 5685 | 5976 | 95.13% |

## Soglia minima CI

La soglia minima sulle righe è **75%** (default 75, override con `COVERAGE_LINES`).
È applicata dal job `coverage` in `.github/workflows/ci.yml` (`scripts/coverage-docs.mjs --check`):
sotto soglia il job fallisce.

## Moduli a coverage più bassa (priorità per nuovi test)

- `db/users.ts` — righe 82.05% (64/78), branch 75.00%, funzioni 71.43%
- `app/api/auth/logout/route.ts` — righe 82.50% (33/40), branch 60.00%, funzioni 100.00%
- `app/api/auth/me/submissions/route.ts` — righe 83.33% (25/30), branch 50.00%, funzioni 100.00%
- `db/moderation.ts` — righe 88.26% (729/826), branch 93.87%, funzioni 100.00%
- `app/lib/abuse-alerts.ts` — righe 88.73% (126/142), branch 88.46%, funzioni 100.00%
- `app/lib/image-metadata.ts` — righe 89.82% (300/334), branch 92.31%, funzioni 100.00%
- `worker/index.ts` — righe 91.43% (192/210), branch 97.56%, funzioni 76.92%
- `db/cameras.ts` — righe 91.63% (197/215), branch 86.96%, funzioni 92.31%
- `app/api/cameras/search/route.ts` — righe 92.21% (71/77), branch 95.83%, funzioni 100.00%
- `app/api/cameras/route.ts` — righe 92.31% (192/208), branch 98.98%, funzioni 100.00%

## Dettaglio per file

| File (sorgente) | Righe % | Branch % | Funzioni % | Righe coperte/totali |
|---|---|---|---|---|
| `db/users.ts` | 82.05 | 75.00 | 71.43 | 64/78 |
| `app/api/auth/logout/route.ts` | 82.50 | 60.00 | 100.00 | 33/40 |
| `app/api/auth/me/submissions/route.ts` | 83.33 | 50.00 | 100.00 | 25/30 |
| `db/moderation.ts` | 88.26 | 93.87 | 100.00 | 729/826 |
| `app/lib/abuse-alerts.ts` | 88.73 | 88.46 | 100.00 | 126/142 |
| `app/lib/image-metadata.ts` | 89.82 | 92.31 | 100.00 | 300/334 |
| `worker/index.ts` | 91.43 | 97.56 | 76.92 | 192/210 |
| `db/cameras.ts` | 91.63 | 86.96 | 92.31 | 197/215 |
| `app/api/cameras/search/route.ts` | 92.21 | 95.83 | 100.00 | 71/77 |
| `app/api/cameras/route.ts` | 92.31 | 98.98 | 100.00 | 192/208 |
| `app/api/auth/me/route.ts` | 92.86 | 71.43 | 100.00 | 26/28 |
| `app/api/moderation/photos/[id]/route.ts` | 93.75 | 60.00 | 100.00 | 30/32 |
| `app/api/photos/route.ts` | 94.82 | 92.86 | 100.00 | 183/193 |
| `app/api/auth/account/route.ts` | 96.23 | 90.91 | 100.00 | 51/53 |
| `app/api/corrections/route.ts` | 96.43 | 95.83 | 100.00 | 54/56 |
| `db/geocode.ts` | 96.67 | 72.73 | 100.00 | 116/120 |
| `db/appeals.ts` | 97.22 | 80.39 | 100.00 | 210/216 |
| `app/api/auth/register/route.ts` | 97.26 | 95.83 | 100.00 | 71/73 |
| `app/api/auth/login/route.ts` | 97.40 | 95.65 | 100.00 | 75/77 |
| `app/api/tiles/[z]/[x]/[y]/route.ts` | 97.61 | 92.31 | 100.00 | 245/251 |
| `db/retention.ts` | 97.84 | 92.31 | 100.00 | 407/416 |
| `app/api/moderation/route.ts` | 97.97 | 89.47 | 100.00 | 289/295 |
| `app/lib/rate-limit.ts` | 98.09 | 100.00 | 100.00 | 154/157 |
| `app/api/appeals/route.ts` | 98.68 | 92.16 | 100.00 | 149/151 |
| `db/auth.ts` | 99.51 | 91.43 | 100.00 | 409/411 |
| `app/api/appeals/[id]/route.ts` | 100.00 | 97.67 | 100.00 | 121/121 |
| `app/api/cameras/nearby/route.ts` | 100.00 | 100.00 | 100.00 | 54/54 |
| `app/api/cameras/revisions/route.ts` | 100.00 | 94.12 | 100.00 | 58/58 |
| `app/api/photos/[id]/route.ts` | 100.00 | 80.00 | 100.00 | 55/55 |
| `app/lib/auth-route-helpers.ts` | 100.00 | 100.00 | 100.00 | 92/92 |
| `app/lib/auth-session.ts` | 100.00 | 100.00 | 100.00 | 50/50 |
| `app/lib/authz.ts` | 100.00 | 100.00 | 100.00 | 56/56 |
| `app/lib/csrf.ts` | 100.00 | 92.59 | 100.00 | 107/107 |
| `app/lib/data-license.ts` | 100.00 | 100.00 | 100.00 | 11/11 |
| `app/lib/duplicate-detection.ts` | 100.00 | 96.77 | 100.00 | 64/64 |
| `app/lib/guards.ts` | 100.00 | 100.00 | 100.00 | 3/3 |
| `app/lib/input-limits.ts` | 100.00 | 93.75 | 100.00 | 76/76 |
| `app/lib/photo-quota.ts` | 100.00 | 100.00 | 100.00 | 63/63 |
| `app/lib/public-status.ts` | 100.00 | 100.00 | 100.00 | 24/24 |
| `app/lib/records.ts` | 100.00 | 100.00 | 100.00 | 37/37 |
| `app/lib/search.ts` | 100.00 | 100.00 | 100.00 | 93/93 |
| `db/corrections.ts` | 100.00 | 75.00 | 100.00 | 13/13 |
| `db/freshness.ts` | 100.00 | 96.30 | 100.00 | 80/80 |
| `db/photos.ts` | 100.00 | 91.80 | 100.00 | 230/230 |

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
