# QA Coverage Report

Baseline generata il **2026-08-04** su commit `26e654f` con
`npm run coverage && npm run coverage:docs`. Suite: 1877/1877 test PASS, 0 fail.

## Riepilogo (solo codice di produzione, esclusi test/helper/mock/fixture)

| Metrica | Coperto | Totale | % |
|---|---|---|---|
| Righe | 11879 | 12488 | **95.12%** |
| Branch | 2410 | 2654 | 90.81% |
| Funzioni | 412 | 422 | 97.63% |
| Statement | 11879 | 12488 | 95.12% |

## Soglia minima CI

La soglia minima sulle righe è **75%** (default 75, override con `COVERAGE_LINES`).
È applicata dal job `coverage` in `.github/workflows/ci.yml` (`scripts/coverage-docs.mjs --check`):
sotto soglia il job fallisce.

## Moduli a coverage più bassa (priorità per nuovi test)

- `app/api/auth/verify-email/resend/route.ts` — righe 80.00% (68/85), branch 76.47%, funzioni 100.00%
- `app/api/auth/me/submissions/route.ts` — righe 86.11% (31/36), branch 50.00%, funzioni 100.00%
- `app/api/auth/passkey/register/complete/route.ts` — righe 86.61% (97/112), branch 66.67%, funzioni 100.00%
- `db/moderation.ts` — righe 86.88% (1066/1227), branch 93.22%, funzioni 93.33%
- `app/api/moderation/corrections/route.ts` — righe 87.18% (68/78), branch 78.57%, funzioni 100.00%
- `worker/index.ts` — righe 87.67% (199/227), branch 97.67%, funzioni 76.92%
- `app/api/auth/passkey/login/begin/route.ts` — righe 88.00% (66/75), branch 75.00%, funzioni 100.00%
- `app/api/cameras/[id]/route.ts` — righe 89.16% (181/203), branch 94.29%, funzioni 100.00%
- `app/api/cameras/[id]/confirmation/route.ts` — righe 89.29% (175/196), branch 89.58%, funzioni 100.00%
- `app/lib/image-metadata.ts` — righe 89.82% (300/334), branch 92.31%, funzioni 100.00%

## Dettaglio per file

| File (sorgente) | Righe % | Branch % | Funzioni % | Righe coperte/totali |
|---|---|---|---|---|
| `app/api/auth/verify-email/resend/route.ts` | 80.00 | 76.47 | 100.00 | 68/85 |
| `app/api/auth/me/submissions/route.ts` | 86.11 | 50.00 | 100.00 | 31/36 |
| `app/api/auth/passkey/register/complete/route.ts` | 86.61 | 66.67 | 100.00 | 97/112 |
| `db/moderation.ts` | 86.88 | 93.22 | 93.33 | 1066/1227 |
| `app/api/moderation/corrections/route.ts` | 87.18 | 78.57 | 100.00 | 68/78 |
| `worker/index.ts` | 87.67 | 97.67 | 76.92 | 199/227 |
| `app/api/auth/passkey/login/begin/route.ts` | 88.00 | 75.00 | 100.00 | 66/75 |
| `app/api/cameras/[id]/route.ts` | 89.16 | 94.29 | 100.00 | 181/203 |
| `app/api/cameras/[id]/confirmation/route.ts` | 89.29 | 89.58 | 100.00 | 175/196 |
| `app/lib/image-metadata.ts` | 89.82 | 92.31 | 100.00 | 300/334 |
| `db/camera-edits.ts` | 89.83 | 77.33 | 88.89 | 309/344 |
| `app/lib/trust-levels.ts` | 89.86 | 100.00 | 66.67 | 62/69 |
| `app/api/auth/oidc/merge/route.ts` | 90.27 | 86.21 | 100.00 | 102/113 |
| `app/lib/abuse-alerts.ts` | 90.74 | 96.67 | 100.00 | 147/162 |
| `app/api/auth/passkey/login/complete/route.ts` | 90.78 | 86.96 | 100.00 | 128/141 |
| `app/api/auth/reset-password/confirm/route.ts` | 90.91 | 78.95 | 100.00 | 70/77 |
| `app/api/auth/passkey/register/begin/route.ts` | 91.95 | 57.14 | 100.00 | 80/87 |
| `app/api/auth/verify-email/route.ts` | 92.06 | 75.00 | 100.00 | 58/63 |
| `app/api/auth/recovery/route.ts` | 92.22 | 91.30 | 100.00 | 83/90 |
| `app/api/auth/reset-password/request/route.ts` | 93.26 | 77.78 | 100.00 | 83/89 |
| `app/api/auth/passkey/credentials/route.ts` | 93.67 | 82.14 | 100.00 | 74/79 |
| `app/api/moderation/photos/[id]/route.ts` | 93.75 | 60.00 | 100.00 | 30/32 |
| `app/api/cameras/[id]/edit/route.ts` | 93.90 | 85.71 | 100.00 | 77/82 |
| `app/api/cameras/route.ts` | 93.92 | 96.58 | 100.00 | 247/263 |
| `db/confirmations.ts` | 94.17 | 83.72 | 90.00 | 194/206 |
| `app/api/cameras/search/route.ts` | 94.23 | 97.14 | 100.00 | 98/104 |
| `app/api/auth/oidc/[provider]/start/route.ts` | 95.38 | 81.82 | 100.00 | 62/65 |
| `db/cameras.ts` | 95.39 | 91.18 | 94.74 | 393/412 |
| `app/api/photos/route.ts` | 95.39 | 92.86 | 100.00 | 207/217 |
| `app/lib/confirm-ip-burst.ts` | 95.83 | 94.44 | 100.00 | 69/72 |
| `db/appeals.ts` | 95.89 | 78.33 | 100.00 | 280/292 |
| `app/api/auth/account/route.ts` | 96.23 | 90.91 | 100.00 | 51/53 |
| `app/api/auth/me/route.ts` | 96.52 | 96.55 | 100.00 | 111/115 |
| `app/lib/oidc.ts` | 96.54 | 75.64 | 100.00 | 223/231 |
| `db/geocode.ts` | 96.85 | 72.73 | 100.00 | 123/127 |
| `app/api/appeals/route.ts` | 96.94 | 91.67 | 100.00 | 190/196 |
| `db/retention.ts` | 97.31 | 89.58 | 100.00 | 578/594 |
| `app/api/auth/oidc/[provider]/callback/route.ts` | 97.52 | 96.15 | 100.00 | 118/121 |
| `app/api/tiles/[z]/[x]/[y]/route.ts` | 97.61 | 92.31 | 100.00 | 245/251 |
| `app/api/geocode/route.ts` | 97.99 | 91.11 | 100.00 | 292/298 |
| `app/api/corrections/route.ts` | 98.10 | 94.12 | 100.00 | 103/105 |
| `app/api/auth/login/route.ts` | 98.23 | 100.00 | 100.00 | 111/113 |
| `app/api/auth/me/contributions/route.ts` | 98.32 | 93.75 | 100.00 | 117/119 |
| `app/api/moderation/route.ts` | 98.38 | 91.89 | 100.00 | 364/370 |
| `app/lib/photo-quota.ts` | 98.41 | 90.00 | 100.00 | 62/63 |
| `app/api/auth/register/route.ts` | 98.69 | 96.15 | 100.00 | 151/153 |
| `app/lib/rate-limit.ts` | 99.00 | 100.00 | 100.00 | 296/299 |
| `db/auth.ts` | 99.07 | 92.55 | 97.44 | 854/862 |
| `app/api/appeals/[id]/route.ts` | 100.00 | 97.67 | 100.00 | 121/121 |
| `app/api/auth/logout/route.ts` | 100.00 | 91.67 | 100.00 | 40/40 |
| `app/api/cameras/nearby/route.ts` | 100.00 | 100.00 | 100.00 | 72/72 |
| `app/api/cameras/revisions/route.ts` | 100.00 | 94.12 | 100.00 | 58/58 |
| `app/api/photos/[id]/route.ts` | 100.00 | 80.00 | 100.00 | 60/60 |
| `app/lib/auth-route-helpers.ts` | 100.00 | 100.00 | 100.00 | 141/141 |
| `app/lib/auth-session.ts` | 100.00 | 100.00 | 100.00 | 50/50 |
| `app/lib/authz.ts` | 100.00 | 100.00 | 100.00 | 56/56 |
| `app/lib/cache-purge.ts` | 100.00 | 82.35 | 100.00 | 88/88 |
| `app/lib/csrf.ts` | 100.00 | 92.86 | 100.00 | 117/117 |
| `app/lib/data-license.ts` | 100.00 | 100.00 | 100.00 | 11/11 |
| `app/lib/duplicate-detection.ts` | 100.00 | 96.97 | 100.00 | 75/75 |
| `app/lib/email-templates.ts` | 100.00 | 97.14 | 100.00 | 193/193 |
| `app/lib/guards.ts` | 100.00 | 100.00 | 100.00 | 3/3 |
| `app/lib/i18n/types.ts` | 100.00 | 100.00 | 100.00 | 75/75 |
| `app/lib/input-limits.ts` | 100.00 | 93.75 | 100.00 | 87/87 |
| `app/lib/map-viewport.ts` | 100.00 | 100.00 | 100.00 | 52/52 |
| `app/lib/passkey.ts` | 100.00 | 100.00 | 100.00 | 99/99 |
| `app/lib/password-policy.ts` | 100.00 | 100.00 | 100.00 | 49/49 |
| `app/lib/public-status.ts` | 100.00 | 100.00 | 100.00 | 24/24 |
| `app/lib/records.ts` | 100.00 | 100.00 | 100.00 | 37/37 |
| `app/lib/search.ts` | 100.00 | 100.00 | 100.00 | 93/93 |
| `app/lib/write-gate.ts` | 100.00 | 100.00 | 100.00 | 78/78 |
| `db/corrections.ts` | 100.00 | 100.00 | 100.00 | 81/81 |
| `db/freshness.ts` | 100.00 | 96.30 | 100.00 | 80/80 |
| `db/mailer.ts` | 100.00 | 92.50 | 100.00 | 172/172 |
| `db/oidc.ts` | 100.00 | 85.71 | 100.00 | 212/212 |
| `db/passkeys.ts` | 100.00 | 92.31 | 100.00 | 221/221 |
| `db/photos.ts` | 100.00 | 93.65 | 100.00 | 246/246 |
| `db/users.ts` | 100.00 | 100.00 | 100.00 | 95/95 |

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
