# QA Coverage Report

Baseline generata il **2026-08-02** su commit `7a3bd62` con
`npm run coverage && npm run coverage:docs`. Suite: 1436/1436 test PASS, 0 fail.

## Riepilogo (solo codice di produzione, esclusi test/helper/mock/fixture)

| Metrica | Coperto | Totale | % |
|---|---|---|---|
| Righe | 8144 | 8705 | **93.56%** |
| Branch | 1862 | 2036 | 91.45% |
| Funzioni | 301 | 313 | 96.17% |
| Statement | 8144 | 8705 | 93.56% |

## Soglia minima CI

La soglia minima sulle righe è **75%** (default 75, override con `COVERAGE_LINES`).
È applicata dal job `coverage` in `.github/workflows/ci.yml` (`scripts/coverage-docs.mjs --check`):
sotto soglia il job fallisce.

## Moduli a coverage più bassa (priorità per nuovi test)

- `app/api/auth/me/route.ts` — righe 54.72% (58/106), branch 71.43%, funzioni 50.00%
- `db/camera-edits.ts` — righe 76.45% (263/344), branch 69.33%, funzioni 77.78%
- `db/users.ts` — righe 82.05% (64/78), branch 75.00%, funzioni 71.43%
- `app/api/auth/logout/route.ts` — righe 82.50% (33/40), branch 60.00%, funzioni 100.00%
- `app/api/auth/me/submissions/route.ts` — righe 86.11% (31/36), branch 50.00%, funzioni 100.00%
- `app/api/moderation/corrections/route.ts` — righe 87.18% (68/78), branch 78.57%, funzioni 100.00%
- `db/moderation.ts` — righe 87.37% (955/1093), branch 93.87%, funzioni 100.00%
- `app/api/cameras/[id]/confirmation/route.ts` — righe 88.83% (167/188), branch 87.50%, funzioni 100.00%
- `app/api/cameras/[id]/route.ts` — righe 89.16% (181/203), branch 94.29%, funzioni 100.00%
- `app/lib/image-metadata.ts` — righe 89.82% (300/334), branch 92.31%, funzioni 100.00%

## Dettaglio per file

| File (sorgente) | Righe % | Branch % | Funzioni % | Righe coperte/totali |
|---|---|---|---|---|
| `app/api/auth/me/route.ts` | 54.72 | 71.43 | 50.00 | 58/106 |
| `db/camera-edits.ts` | 76.45 | 69.33 | 77.78 | 263/344 |
| `db/users.ts` | 82.05 | 75.00 | 71.43 | 64/78 |
| `app/api/auth/logout/route.ts` | 82.50 | 60.00 | 100.00 | 33/40 |
| `app/api/auth/me/submissions/route.ts` | 86.11 | 50.00 | 100.00 | 31/36 |
| `app/api/moderation/corrections/route.ts` | 87.18 | 78.57 | 100.00 | 68/78 |
| `db/moderation.ts` | 87.37 | 93.87 | 100.00 | 955/1093 |
| `app/api/cameras/[id]/confirmation/route.ts` | 88.83 | 87.50 | 100.00 | 167/188 |
| `app/api/cameras/[id]/route.ts` | 89.16 | 94.29 | 100.00 | 181/203 |
| `app/lib/image-metadata.ts` | 89.82 | 92.31 | 100.00 | 300/334 |
| `app/lib/trust-levels.ts` | 89.86 | 100.00 | 66.67 | 62/69 |
| `app/lib/abuse-alerts.ts` | 90.74 | 96.67 | 100.00 | 147/162 |
| `worker/index.ts` | 91.63 | 97.67 | 76.92 | 197/215 |
| `db/cameras.ts` | 91.82 | 85.19 | 94.12 | 292/318 |
| `app/api/moderation/photos/[id]/route.ts` | 93.75 | 60.00 | 100.00 | 30/32 |
| `app/api/cameras/route.ts` | 93.77 | 97.48 | 100.00 | 241/257 |
| `app/api/cameras/search/route.ts` | 93.81 | 97.22 | 100.00 | 91/97 |
| `app/api/cameras/[id]/edit/route.ts` | 93.90 | 85.71 | 100.00 | 77/82 |
| `app/api/photos/route.ts` | 94.82 | 92.86 | 100.00 | 183/193 |
| `app/api/corrections/route.ts` | 95.33 | 92.11 | 100.00 | 102/107 |
| `app/lib/confirm-ip-burst.ts` | 95.83 | 94.44 | 100.00 | 69/72 |
| `app/api/auth/account/route.ts` | 96.23 | 90.91 | 100.00 | 51/53 |
| `db/confirmations.ts` | 96.39 | 84.62 | 90.00 | 160/166 |
| `db/geocode.ts` | 96.85 | 72.73 | 100.00 | 123/127 |
| `db/appeals.ts` | 97.22 | 80.39 | 100.00 | 210/216 |
| `app/api/auth/register/route.ts` | 97.26 | 95.83 | 100.00 | 71/73 |
| `app/api/auth/login/route.ts` | 97.40 | 95.65 | 100.00 | 75/77 |
| `app/api/tiles/[z]/[x]/[y]/route.ts` | 97.61 | 92.31 | 100.00 | 245/251 |
| `app/api/moderation/route.ts` | 97.77 | 90.97 | 100.00 | 351/359 |
| `app/api/appeals/route.ts` | 97.78 | 93.10 | 100.00 | 176/180 |
| `db/retention.ts` | 97.84 | 92.31 | 100.00 | 407/416 |
| `app/api/geocode/route.ts` | 97.96 | 91.21 | 100.00 | 288/294 |
| `app/api/auth/me/contributions/route.ts` | 98.32 | 93.75 | 100.00 | 117/119 |
| `app/lib/rate-limit.ts` | 98.48 | 100.00 | 100.00 | 195/198 |
| `db/auth.ts` | 98.55 | 91.89 | 96.55 | 542/550 |
| `app/api/appeals/[id]/route.ts` | 100.00 | 97.67 | 100.00 | 121/121 |
| `app/api/cameras/nearby/route.ts` | 100.00 | 100.00 | 100.00 | 72/72 |
| `app/api/cameras/revisions/route.ts` | 100.00 | 94.12 | 100.00 | 58/58 |
| `app/api/photos/[id]/route.ts` | 100.00 | 80.00 | 100.00 | 60/60 |
| `app/lib/auth-route-helpers.ts` | 100.00 | 100.00 | 100.00 | 92/92 |
| `app/lib/auth-session.ts` | 100.00 | 100.00 | 100.00 | 50/50 |
| `app/lib/authz.ts` | 100.00 | 100.00 | 100.00 | 56/56 |
| `app/lib/cache-purge.ts` | 100.00 | 82.35 | 100.00 | 81/81 |
| `app/lib/csrf.ts` | 100.00 | 92.59 | 100.00 | 107/107 |
| `app/lib/data-license.ts` | 100.00 | 100.00 | 100.00 | 11/11 |
| `app/lib/duplicate-detection.ts` | 100.00 | 96.97 | 100.00 | 75/75 |
| `app/lib/guards.ts` | 100.00 | 100.00 | 100.00 | 3/3 |
| `app/lib/input-limits.ts` | 100.00 | 93.75 | 100.00 | 76/76 |
| `app/lib/map-viewport.ts` | 100.00 | 100.00 | 100.00 | 52/52 |
| `app/lib/photo-quota.ts` | 100.00 | 100.00 | 100.00 | 63/63 |
| `app/lib/public-status.ts` | 100.00 | 100.00 | 100.00 | 24/24 |
| `app/lib/records.ts` | 100.00 | 100.00 | 100.00 | 37/37 |
| `app/lib/search.ts` | 100.00 | 100.00 | 100.00 | 93/93 |
| `db/corrections.ts` | 100.00 | 100.00 | 100.00 | 81/81 |
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
