# Roadmap OpenSurveillanceDB

> Documento consolidato (2026-08-08): sostituisce `STATUS.md`, `DEVELOPMENT_PLAN.md`,
> `EXECUTION_BOARD.md`, `FRONTEND_PLAN.md`, `NEXT_SPRINT.md`, `FUTURE_ROADMAP.md`
> (archiviati in `~/osdb-archive/docs-plans/` sul disco dell'operatore).

## Stato attuale (verificato sul container, 2026-08-08)

**Produzione**: app SSR + map-first, DB D1, worker cache letture pubbliche,
deploy automatico a ogni merge su `main` (container LXC 192.168.1.201:3000,
dominio pubblico temporaneo `osdb.syaxhome89.com` dietro CDN).

### Funzionalità live
- **Mappa interattiva** (tile OSM via proxy same-origin, cache ≥7gg, provider
  configurabile — `docs/OSM_INTEGRATION.md`), directory testuale ricercabile,
  dettaglio record, filtri sicuri (tipo + freschezza `7d/30d/90d`).
- **Segnalazioni** anonime o con account: posizione da mappa o coordinate
  manuali, gate anti-duplicato server-enforced (ADR 0019), metadati opzionali
  (produttore, data osservazione) con pubblicazione per-campo a default privato.
- **Correzioni/richieste di revisione** private; **moderazione locale** con
  motivo obbligatorio, nota revisore opzionale, audit append-only; solo
  `verified` è pubblico (`pending/rejected/removed` mai).
- **Account contributore**: email+password (PBKDF2-SHA256), sessioni opache
  hashed, CSRF same-origin, erasure GDPR art. 17 con de-attribuzione;
  **login OIDC GitHub e Google** (registrazione sociale = riuso del pannello
  di login, callback auto-crea account) — ADR 0013/0014/0016/0020.
- **API pubblica**: `/api/cameras` (JSON/GeoJSON/CSV), search, nearby,
  revisions (proiezione privacy-safe), export con attribuzione ODbL;
  `/api-docs` ridisegnata; cache public (fail-open, solo 200, TTL da
  Cache-Control) — `app/lib/public-cache.ts`.
- **i18n**: EN pilota + IT type-checked; register social; pagine statiche
  con pattern `InfoPage`; nessun "contributore" nei bundle (ADR 0007/0021).
- **Accessibilità**: statement draft, skip link, focus treatment,
  reduced-motion, Lighthouse a11y ≥ 0.95 in CI.
- **Import dati**: pipeline `scripts/import/` (adapter per fonte, licence-gate
  fail-closed, dedup cross-source, idempotenza, attribuzione per batch).

### Fonti dati (2026-08-08)
| Fonte | Record | Licenza |
|---|---|---|
| OSM Italia (ODbL) | ~7.9k | ODbL 1.0 |
| OSM Austria / Svizzera / Germania | ~57k potenziali | ODbL 1.0 |
| Milano varchi (ufficiale) | 213 | CC BY 3.0 IT / IODL 2.0 |
| Zurigo Videokameras (ufficiale) | 134 | CC0 |
| Kanton Bern VIDEO (ufficiale, GeoParquet) | 76 | Open use + attribuzione |
| Amburgo Verkehrskameras (ufficiale, OGC API) | 18 | dl-de-by-2.0 |
| GPSO Grand Paris (ufficiale) | 446 | Licence Ouverte 2.0 |
| PVPP Parigi (ufficiale, KML) | 1339 | Licence Ouverte 2.0 |
| Agen (ufficiale) | 123 | ODbL 1.0 |
| DGT Spagna NAP (ufficiale, DATEX2) | 1942 | CC-BY |
| Madrid ZBEDEP+ZBE (ufficiale) | 578 | CC BY 4.0 |
| Barcelona (ufficiale) | 163 | CC BY 4.0 |
| Utrecht Cameraregister (ufficiale, XLSX) | 372 | CC0 |
| Amsterdam VIS (ufficiale, API HAL) | 334 | CC BY 4.0 |

Registro completo con attribuzione: `docs/data-sources/README.md` +
descriptor JSON in `docs/data-sources/imports/`.

## Direzione

```text
Qualità dati e moderazione affidabile
  → esperienza pubblica accessibile
  → operazioni riproducibili
  → decisioni pilota e garanzie
  → alpha pubblica limitata
  → programma multi-città open-data
  → app Android
```

Il progetto non scambia qualità di revisione, privacy o apertura per velocità.

## Prossimi passi (priorità)

1. **HTTPS pubblico stabile**: fix reverse proxy NPM (LXC 103,
   192.168.1.216:81) — serve `proxy_pass` su tutti i path, mai root statica
   per `/node_modules/`; poi valutare DNS-only su Cloudflare. PR #350
   (no-store + dedupe) già mergiata.
2. **Import stato-per-stato**: lanciare gli import OSM AT/CH/DE + fonti
   ufficiali Berna/Amburgo/FR/ES/NL (pipeline pronta, CLI da documentare).
3. **P0 audit backend/SRE** (7 punti) → poi Cloudflare pubblico
   (`opensurveillancedb.org`).
4. **OG-image** col logo aggiornato + sezione "Quick start" curl nel README.
5. **Programma multi-città**: scan altri stati (UK, PT, BE, nord-Europa…),
   geocodifica Parigi BO 2019, chiarire licenza Eindhoven.

## Archivi storici

I documenti di piano/sprint/review/QA sostituiti vivono in
`~/osdb-archive/` (fuori dal repo): `docs-plans/`, `qa-reports/`,
`screenshots/`. I riferimenti nei vecchi report possono puntare a file non
più tracciati; il README e i documenti legali sono la fonte corrente.
