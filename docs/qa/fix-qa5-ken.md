# Fix QA Infra/Perf #5 — Ken (DevSecOps)

**Data:** 2026-08-04 · **Task:** t_ab0d4c75 · **Base:** `origin/main`
**Branch:** `fix/qa5-infra-perf-ken` (PR #286)
**Metodo:** fix applicati + test aggiornati, verificati con `npm run lint` (0 errori), `npx tsc --noEmit` (0 errori), `node --test` sui file toccati (39/39 pass), build vinext reale, `scripts/sitemap-check.mjs` end-to-end su Miniflare con D1 in-memory.
**Esito:** 10/10 finding chiusi. Vincolo F3 rispettato: ZERO nuove librerie (niente Leaflet.markercluster, niente supercluster).

## Riepilogo fix

| # | Fix | File principali |
|---|-----|-----------------|
| F1 | Deep link record → endpoint dedicato `GET /api/cameras/[id]` (1 round-trip, no walk client) | `app/lib/use-public-cameras.ts`, `app/api/cameras/[id]/route.ts`, `tests/client-record-page.test.mjs`, `tests/client-verify-toggle.test.mjs` |
| F2 | Facets ricalcolate mai consumate → opt-in `?facets=1` | `app/api/cameras/route.ts` |
| F3 | 3k marker DOM mappa → viewport culling nativo (zero lib) | `app/components/SurveillanceMap.tsx` |
| F4 | Rate-limit tiles 60/min → 240/min con metering post-cache | `app/lib/rate-limit.ts`, `worker/index.ts` (tiles) |
| F5 | 536 KiB JS iniziale → split dizionario i18n EN+IT in chunk on-demand | `app/lib/i18n/index.ts`, `app/lib/i18n/bundles/{en,it}.ts`, `app/lib/use-messages.ts`, 15 componenti |
| F6 | og.png 1,6 MB → 1200x630 palette PNG ~163 KiB + og:image dimensioni/alt + canonical | `public/og.png`, `app/layout.tsx`, `app/(tools)/{directory,mappa}/page.tsx`, `scripts/optimize-og.mjs` |
| F7 | sitemap.xml dinamica (D1, stesso predicato pubblico) + robots.ts con Sitemap condizionale | `app/sitemap.ts`, `app/robots.ts` (rimosso `public/robots.txt`), `scripts/sitemap-check.mjs` |
| F8 | Lighthouse gate: perf/SEO/LCP/CLS come WARN non bloccanti (baseline da stabilizzare) | `lighthouserc.cjs` |
| F9 | Snapshot D1 pre-migrazione + version-id precedente + istruzioni rollback nel deploy | `.github/workflows/deploy.yml` |
| F10 | Backup: schedule non più rosso per design (gate `ENABLE_CF_BACKUP`), copia off-site R2, restore drill trimestrale | `.github/workflows/ops-backup.yml` |

---

## F1 — Deep link record via GET /api/cameras/[id]

`ensureRecord()` ora risolve l'id con UNA fetch all'endpoint dedicato (`app/lib/use-public-cameras.ts:221-254`): cache di modulo prima, walk full-list già in volo poi, altrimenti `/api/cameras/{id}`. 404 = fail-closed (stesso predicato pubblico dell'endpoint). Un deep link su record vecchi passa da `ceil((maxId−id)/500)+1` fetch serializzati a 1, senza bruciare il bucket `READ_LIMITER`.

Test aggiornati: `tests/client-record-page.test.mjs` (mock dedicato, nuovo test "deep link … no client-side paginated walk" che asserisce esattamente 1 fetch), `tests/client-verify-toggle.test.mjs` (mock `/api/cameras/7`).

## F2 — Facets opt-in ?facets=1

Il calcolo `getPublicCameraFacets()` viene eseguito solo quando il client lo richiede esplicitamente (`?facets=1`), non su ogni lettura paginata. Il percorso predefinito (`GET /api/cameras`) non paga più le query facet inutilizzate.

## F3 — Viewport culling marker mappa (vincolo HARD: zero nuove librerie)

Niente Leaflet.markercluster né supercluster: la mappa renderizza solo i marker visibili nel viewport corrente (culling su bounds + LazyLoad al pan/zoom). Il dataset completo non entra più nel DOM (3k+ marker → solo quelli visibili, ~decine). Zero dipendenze aggiunte a `package.json`.

## F4 — Rate-limit tiles dedicato (240/min, metering post-cache)

Soglia tiles alzata a 240/min (zoom/pan interattivo) e il metering avviene DOPO il controllo cache: i tile serviti dalla cache non consumano il bucket. La migrazione ai binding Cloudflare Rate Limiting (già fatta in t_dff3dadf) resta la base; il valore soglia per la famiglia tiles è ora dedicato e separato dalle altre famiglie pubbliche.

## F5 — Split bundle i18n (chunk on-demand)

L'assemblaggio per-locale è migrato in `app/lib/i18n/bundles/{en,it}.ts`; il grafo root importa solo i domain file che renderizza (`common`, `footer`), `useMessages()` (nuovo `app/lib/use-messages.ts`) tira la mappa completa solo nei chunk che traducono davvero sul client. Il dizionario ~150 KB esce dal chunk iniziale. 15 componenti aggiornati all'import corretto.

## F6 — og.png ottimizzato + og:image assoluto + canonical

- `public/og.png`: rigenerato 1200x630 palette PNG (cover-resize + quantizzazione, `scripts/optimize-og.mjs`): **1.626.075 B → 167.060 B** (<300 KB).
- `app/layout.tsx`: `og:image` con width/height/alt; `metadataBase` condizionale su `NEXT_PUBLIC_SITE_URL` (convenzione repo: mai URL assoluti hardcoded/placeholder) → `og:image` assoluto quando il dominio è configurato.
- `app/(tools)/directory/page.tsx` + `app/(tools)/mappa/page.tsx`: `alternates.canonical` → le varianti `?page=&type=&freshness=` (e `?lat=&lng=&z=`) canonicalizzano alla route nuda (no contenuto duplicato).

## F7 — sitemap.xml + robots

- `app/sitemap.ts`: `/sitemap.xml` dinamica, query D1 con lo STESSO `publicCameraPredicate` delle altre letture pubbliche (whitelist status + demo gate ADR 0008), `force-dynamic`. Route statiche pubbliche + `/records/{id}` con lastmod dal row.
- `app/robots.ts`: sostituisce `public/robots.txt` (rimosso); allowlist `/`, disallow `/api/`, `/moderation`, `/appelli`, `/account`, `/records/*/edit`, `/register`, `/login`; direttiva `Sitemap:` emessa SOLO con `NEXT_PUBLIC_SITE_URL` (senza dominio un URL assoluto sarebbe un placeholder).
- Verifica end-to-end: `scripts/sitemap-check.mjs` (Miniflare + D1 in-memory + seed demo) → `/sitemap.xml` 200 con entry `/records/*`, `/robots.txt` 200, `/api/cameras?limit=1` 200.

## F8 — Lighthouse gate esteso a perf/SEO

`lighthouserc.cjs`: in aggiunta al bloccante `categories:accessibility >= 0.95`, ora WARN (non bloccanti, baseline attuale perf 65-77 / LCP 4.1-7.1 s da qa-infra-ken.md F5): `categories:performance >= 0.6`, `categories:seo >= 0.9`, `LCP <= 4.0 s`, `CLS <= 0.1`. Promozione a `error` documentata nel file quando la baseline perf stabilizza.

## F9 — Snapshot D1 pre-migrazione nel deploy

`deploy.yml`: nel run `mode=deploy` — (1) cattura del **version-id precedente** (`wrangler versions list`, parsing difensivo JSON→testuale) PRIMA del deploy, salvato come output + file; (2) **snapshot D1 pre-migrazione** (`wrangler d1 export osdb-production --remote`), cifrato AES-256 con `BACKUP_PASSPHRASE` se configurato, sha256sum, upload come artifact `pre-deploy-<sha>` (30 gg); (3) job summary con il comando di rollback esatto (`npx wrangler rollback <prev-id>`). Permissions `actions: write` aggiunte per l'upload artifact.

## F10 — Backup non più rosso + off-site + restore drill

`ops-backup.yml`: (1) il job notturno viene **skippato** (non rosso) finché `vars.ENABLE_CF_BACKUP != "true"` — il workflow_dispatch manuale procede sempre; (2) copia off-site del dump cifrato sul bucket R2 `opensurveillancedb-photos` (prefisso `d1-backups/`, mai in collisione con le chiavi foto) — il backup non vive più solo sugli artifact GH (30 gg); (3) nuovo job trimestrale **restore drill**: scarica l'ultimo artifact `d1-backup-*`, verifica sha256, decifra, applica su un D1 temporaneo (`osdb-restore-drill-<ts>`), smoke conteggi, cleanup — il restore è provato, non solo ipotizzato.

---

## Verifica

- `npm run lint`: **0 errori** (2 warning pre-esistenti in file non toccati).
- `npx tsc --noEmit`: **0 errori**.
- `node --test tests/client-record-page.test.mjs tests/client-verify-toggle.test.mjs tests/community-i18n.test.mjs tests/component-smoke.test.mjs`: **39/39 pass** (i 13 test rossi della CI PR #286 erano i mock del vecchio walk + asserzioni bundle; aggiornati al contratto F1/F5).
- `npm run build` (vinext): ok.
- `scripts/sitemap-check.mjs`: `/sitemap.xml` 200 con entry records, `/robots.txt` 200, `/api/cameras` 200.
- CI su PR #286 (attesa post-push): Lint/Typecheck/Test/Build + Coverage + Lighthouse + Gitleaks + npm audit + Fresh-DB smoke.

## Note

- `public/robots.txt` rimosso (sostituito da `app/robots.ts`, metadata route Next).
- Helper committati: `scripts/optimize-og.mjs` (rigenerazione og.png riproducibile), `scripts/sitemap-check.mjs` (verifica sitemap/robots end-to-end).
- Lo scratch `.d1test-worker.mjs` è stato eliminato (non committato).
