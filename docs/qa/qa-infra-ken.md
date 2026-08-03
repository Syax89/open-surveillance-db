# QA Infra/Perf #5 — Ken (DevSecOps)

**Data:** 2026-08-03 · **Base:** `origin/main` @ `16503a3` (PR #271)
**Metodo:** analisi statica (codice + config), build reale (`npm run build`, vinext), Lighthouse CLI 11.x (Chrome for Testing 151) su preview Miniflare locale (`npm run preview:serve`, identica alla config di `lighthouserc.cjs`), misura bundle da `dist/client`.
**Esito:** 10 finding (2 HIGH, 5 MEDIUM, 3 LOW/MEDIUM) + aree verificate OK.

> Nota metodologica: la preview locale è Miniflare (localhost, rete ~0 ms): i numeri
> Lighthouse di seguito sono quindi **limitati da CPU/JS/bundle**, non dalla rete —
> sul deploy reale (CF edge) si sommano latenza di rete e cold start, non si sottraggono.
> I tempi "reali" di D1/R2/upstream tile su produzione richiedono il monitoraggio
> descritto in F8.

## Riepilogo finding

| # | Severità | Area | Titolo sintetico |
|---|----------|------|------------------|
| F1 | **HIGH** | API latencies | Deep link record: walk client-side paginata (N round-trip), endpoint `/api/cameras/[id]` mai usato |
| F2 | MEDIUM | D1 query | `getPublicCameraFacets()` ricalcolata su OGNI lettura paginata, mai consumata dal client |
| F3 | **HIGH** | Performance/DOM | Mappa renderizza TUTTI i record come marker Leaflet; /mappa, /directory, /correggi scaricano l'intero dataset |
| F4 | MEDIUM | API latencies/tiles | Rate-limit tiles 60/min < interazione zoom normale; metering conta anche i cache hit |
| F5 | MEDIUM | Bundle size/LCP | JS iniziale 536 KiB su ogni pagina; chunk root LocaleProvider = intero dizionario i18n EN+IT (150 KB) |
| F6 | MEDIUM | SEO | og.png 1,6 MB; og:image relativa e NESSUN canonical (URL `?page=` duplicano i contenuti) |
| F7 | LOW/MED | SEO | Nessuna sitemap.xml / direttiva Sitemap in robots.txt |
| F8 | MEDIUM | CI a11y/perf | Lighthouse CI asserisce SOLO accessibility; performance/SEO raccolti ma mai bloccanti (1 run) |
| F9 | MEDIUM | Deploy/backup | Deploy senza snapshot D1 pre-migrazione e senza version-id precedente salvato → rollback manuale |
| F10 | LOW/MED | Backup | ops-backup.yml rosso ogni giorno per design (fase LXC); backup solo su artifact GH 30gg, no copia off-site, restore mai provato |

---

## F1 — HIGH — Deep link record = walk client-side paginata; l'endpoint dedicato non è usato

**File:riga**
- `app/records/[id]/RecordPageBody.tsx:35` — `usePublicCamera(recordId)`
- `app/lib/use-public-cameras.ts:216-242` (`ensureRecord`) e `104-120` (`walkPages`) — walk sequenziale di pagine da 500, ordinate `id DESC`
- `app/api/cameras/[id]/route.ts:14-16` — il commento afferma: *"the page fetches this endpoint instead"* — **falso**: nessun fetch di `/api/cameras/[id]` nel client (grep: solo `usePublicCamera` + probe owner `/api/cameras/[id]/edit`)

**Misurazione**
Ogni deep link a un record **vecchio** (id basso, ordine `id DESC`) richiede `ceil((maxId − id)/500) + 1` fetch serializzati. Su un dataset da 5.000 record: ~10 round-trip; ognuno costa 4 query D1 (COUNT + SELECT + 2 facet, vedi F2) + 1 chiamata al binding rate-limit `READ_LIMITER` (60/min). Un utente che apre 3-4 record vecchi di fila consuma l'intero bucket read e viene 429 sulle pagine successive. Il tutto per un payload che l'endpoint dedicato (già esistente, con `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` a `app/api/cameras/[id]/route.ts:71`) risolverebbe in 1 richiesta.

**Severità:** HIGH (latency, spreco D1, auto-429).

**Fix**
`usePublicCamera` → fetch diretto `GET /api/cameras/${id}` (fallback al walk solo per il caso not-found). Correggere il commento in `[id]/route.ts`. Nota: `ensureRecord` è già strutturato per questo — sostituire `walkPages(signal, id)` con un fetch singolo quando `cachedRecords === null`.

---

## F2 — MEDIUM — Facets ricalcolate a ogni pagina, mai consumate dal client

**File:riga**
- `app/api/cameras/route.ts:161-164` — `Promise.all([listPublicCamerasPage(...), getPublicCameraFacets()])` su **ogni** GET (anche `?limit=1`)
- `db/cameras.ts:343-365` — 2 aggregate full-set: `GROUP BY kind` + `SUM(CASE ...)` sulle finestre freshness
- Client che le scarta: `app/lib/use-public-cameras.ts:73-89` (legge solo `records/total/nextOffset`) e `app/lib/use-public-count.ts:26-34` (il contatore della home usa `?limit=1`)

**Misurazione**
Il contatore hero della home (`usePublicCount`, 1 fetch) costa **4 query D1**: COUNT + SELECT + 2 aggregate facet — per mostrare un numero. Un walk di P pagine (home/directory/mappa/correggi) costa **4P query D1**; le facet (full-scan sugli stessi indici del COUNT) sono ricalcolate a ogni pagina e buttate via: il client calcola i kind con `cameraKindsOf(records)` (client-side), mai dai server facets.

**Severità:** MEDIUM (cresce O(N) col dataset; spreco su ogni richiesta).

**Fix**
Rendere le facet opt-in (`?facets=1`) o eliminarle dal payload JSON di default (nessun consumatore attuale); in alternativa calcolarle solo per `offset=0`. Aggiornare il commento "single round-trip" in `route.ts:165`.

---

## F3 — HIGH — La mappa crea un marker DOM per OGNI record; 3 pagine tool scaricano l'intero dataset

**File:riga**
- `app/components/SurveillanceMap.tsx:248-285` — `cameras.forEach((camera) => L.marker(...))`: ogni record = marker Leaflet con divIcon + tooltip + popup + click handler
- `app/components/tools/MappaTool.tsx:51-56`, `app/components/tools/DirectoryTool.tsx:46-49`, `app/components/tools/CorreggiTool.tsx:27` — tutti e tre chiamano `usePublicCameras()` senza filtri server → walk completo
- `app/lib/use-public-cameras.ts:104-120` — walk fino all'ultima pagina
- Endpoint bbox già esistente e inutilizzato dalla mappa: `app/api/cameras/route.ts:105-131` (`format=geojson&bbox=...`, cached s-maxage=300)

**Misurazione**
N record → N nodi DOM marker. Su un DB civico realistico (migliaia di telecamere): 5.000 marker = 5.000 div con listener — Leaflet degrada già oltre ~1-2k (pan/zoom lenti, memoria alta). Trasferimento: l'intero dataset JSON (~150 B/record) su /mappa, /directory **e /correggi** (quest'ultimo è un form: scarica tutto solo per popolare il selettore record). Lighthouse /mappa: **LCP 7,1 s** (peggiore delle 4 route testate).

**Severità:** HIGH a scala (tool primario; il dataset è destinato a crescere).

**Fix**
- Mappa: marker per viewport via endpoint bbox (`/api/cameras?format=geojson&bbox=...`, già pronto) o clustering (leaflet.markercluster).
- /correggi: il selettore record può usare `GET /api/cameras/search` (paginated, cap 100) invece del walk completo.
- /directory: paginazione server-side reale (oggi è un slice client-side dopo il download totale, `DirectoryCatalog.tsx:128-133`).

---

## F4 — MEDIUM — Rate-limit tiles 60/min sotto l'uso interattivo normale; il metering conta anche i cache hit

**File:riga**
- `wrangler.jsonc:59` — `TILES_LIMITER` `simple.limit: 60, period: 60`
- `app/api/tiles/[z]/[x]/[y]/route.ts:163-180` — metering **prima** della cache lookup (scelta documentata: i cache hit non devono eludere il throttle)
- `app/lib/rate-limit.ts:77-81` — commento: *"60/min is far above what interactive map panning produces per client"* — **errato per lo zoom**
- `app/components/SurveillanceMap.tsx:171-182` — default z13, `maxZoom: 19`, `scrollWheelZoom: true`

**Misurazione**
Viewport 1400×900 px = **24 tile** per vista (math: `(1400/256+1)×(900/256+1)`). Vista iniziale (24) + uno zoom (24 tile nuove) = **48** richieste in pochi secondi; zoom da z13 a z19 = **144** richieste. Ogni richiesta conta verso il binding (anche i cache hit, per design anti-scraping). Con 60/min: un utente che fa 2-3 zoom in un minuto riceve **429 su una parte delle tile → mappa a scacchi** durante l'esplorazione. Il binding è per-location CF, quindi il comportamento varia anche per colo.

**Severità:** MEDIUM (degradazione UX sul tool principale; niente fallback visivo per le tile 429 — l'`X-Tile-Cache`/status non è gestito da Leaflet).

**Fix**
- Alzare il binding a ~240/min (le soglie finali sono comunque da siglare con Ada, commento in `wrangler.jsonc:51`), oppure
- spostare il metering **dopo** `cache.match` (contare solo i miss) — il rischio scraping upstream resta coperto perché i miss coincidono con i fetch upstream reali; aggiornare il commento `rate-limit.ts:77-81`.

---

## F5 — MEDIUM — 536 KiB di JS iniziale su ogni pagina; chunk root LocaleProvider = intero i18n EN+IT

**File:riga**
- `app/components/LocaleProvider.tsx:5` — `import { messages } from "../lib/i18n"` (client component montato nel **root layout**)
- `app/lib/i18n/index.ts:14-79` — `messages = { en, it }`: **tutti e 18 i domini × 2 lingue** (inclusi moderation/legal/record/auth, inutili sulle pagine pubbliche)
- Output build: `dist/client/assets/LocaleProvider-*.js` **149.760 B raw / 43,6 KB gz** (misurato su `origin/main` @ 16503a3)

**Misurazione (Lighthouse, preview locale, 4x CPU — mobile)**
| Route | Perf | FCP | LCP | CLS | JS totale |
|---|---|---|---|---|---|
| `/` | 77 | 4,1 s | 4,1 s | 0 | 536 KiB |
| `/directory` | 73 | 4,5 s | 4,5 s | 0 | 569 KiB |
| `/mappa` | 65 | 4,4 s | **7,1 s** | 0 | 937 KiB |
| `/records/1` | 72 | 4,1 s | 4,9 s | 0.001 | 712 KiB |

Breakdown LCP home: TTFB 452 ms (11%), **Render Delay 3.650 ms (89%)** — tutte le risorse arrivano entro ~62 ms (`network-requests`); il ritardo è parse/eval JS del grafo del root chunk (framework 190 KB + LocaleProvider 150 KB + index 87 KB) sul main thread prima del primo paint. `mainthread-work-breakdown` 0,9 s reali ≈ 3,6 s throttled. La home è SSR-pura: il contenuto LCP (h1 hero) è nell'HTML, ma il paint attende i bootstrap RSC.

**Severità:** MEDIUM (budget LCP rotto su tutte le route; il gate CI non lo cattura — vedi F8).

**Fix**
- Splittare i18n: `import()` dinamico della sola locale attiva (il toggle client ne carica l'altra on-demand); i domini moderation/legal/record escono dal chunk root (import server-only o route-scoped).
- `vite.config.ts` non ha `manualChunks`: valutare split del runtime React e del dizionario.
- Verificare i 2 `<script>` inline RSC in `<head>` (presenti nell'HTML emesso) per async/defer dove possibile.

---

## F6 — MEDIUM — og.png 1,6 MB; og:image relativa e nessun canonical → URL duplicati

**File:riga**
- `public/og.png` — **1.626.075 B, 1672×941** (PNG RGB, non interlacciato)
- `app/layout.tsx:26-36` — `openGraph.images: ["/og.png"]` e `twitter.images` (relativo); `app/layout.tsx:21-23` — `metadataBase` solo se `NEXT_PUBLIC_SITE_URL` è settato
- HTML emesso (curl su preview): `<meta property="og:image" content="/og.png"/>` — **relativa**, e **nessun `<link rel="canonical">`**
- URL duplicati: paginazione/filtri in URL su `app/lib/use-camera-filters.ts:138-141` (`?page=`), `DirectoryCatalog.tsx:281-287` (pagination bar)

**Misurazione**
1,6 MB è ~5-10× il peso raccomandato per un'OG image (target ≤ 300 KB, 1200×630) → preview social lente su mobile. Senza canonical, `/directory?page=2&type=...` e `/directory` espongono lo stesso contenuto a URL diversi → rischio contenuto duplicato su Google. Senza `metadataBase` (assente finché il dominio pubblico non è attivo, `docs/DEPLOYMENT.md:422`) non esiste alcun URL assoluto canonico nei meta.

**Severità:** MEDIUM (SEO/social).

**Fix**
- Ricomprimere `og.png` → ~200-300 KB (PNG-8 quantizzato o WebP, 1200×630).
- `metadataBase` sempre settato al dominio pubblico e `alternates.canonical` esplicito su /directory (e /mappa con `?focus=`).

---

## F7 — LOW/MED — Nessuna sitemap.xml / direttiva Sitemap

**File:riga**
- `public/robots.txt:27` — *"Sitemap: to be added once a public domain exists"* — direttiva assente
- Nessun `app/sitemap.ts` / `app/sitemap.xml` (verificato: `find app -name "sitemap*"` → vuoto); branch `docs/sitemap-f2f3c5` contiene solo doc

**Misurazione**
Nessuna sitemap servita; la scoperta dei `/records/[id]` dinamici (client-rendered, `RecordPageBody.tsx`) dipende solo dai link interni. Sitemap è il canale più economico per far indicizzare i record pubblici.

**Severità:** LOW-MEDIUM (pre-lancio, ma costo minimo).

**Fix**
`app/sitemap.ts` con route statiche + pagina per ogni id pubblico (dataset bounded; va allineata al predicate pubblico di `db/cameras.ts` e al gate demo ADR 0008) + riga `Sitemap:` in robots.txt una volta fisso il dominio.

---

## F8 — MEDIUM — Lighthouse CI: gate solo su accessibility; performance/SEO mai bloccanti

**File:riga**
- `lighthouserc.cjs:78-83` — unica assertion: `categories:accessibility >= 0.95`
- `lighthouserc.cjs:70` — `numberOfRuns: 1`
- `.github/workflows/lighthouse.yml:36-70` — job su ogni PR/push a main

**Misurazione**
I punteggi performance attuali (65-77 sulle 4 route chiave, F5) **non farebbero fallire nulla**: una regressione di bundle di +100 KB, un LCP che raddoppia o un CLS che sfora passano il gate. Il task CEO chiede LCP/CLS come oggetto di QA: oggi sono raccolti ma non asseriti.

**Severità:** MEDIUM (debito perf silenzioso).

**Fix**
Aggiungere assertion non-bloccanti (`warn`) su `categories:performance >= 0.6`, `largest-contentful-paint <= 4.0s`, `cumulative-layout-shift <= 0.1`; promuovere a `error` dopo un baseline stabile. `numberOfRuns: 3` con mediana per ridurre il rumore.

---

## F9 — MEDIUM — Deploy senza snapshot D1 pre-migrazione e senza version-id precedente salvato

**File:riga**
- `.github/workflows/deploy.yml:113-129` — `wrangler d1 migrations apply --remote` → `wrangler deploy` → `wrangler versions list | head -8` (solo stdout, non salvato)
- Docs: `docs/OPERATIONS.md §5.1` — *"always record the version-id in the release changelog/issue"* (non eseguito dal workflow)
- `ops-backup.yml` è schedulato a parte alle 02:00 UTC (`ops-backup.yml:17`) — un deploy in qualsiasi altro momento **non ha snapshot pre-modifica**

**Misurazione**
Una migrazione distruttiva (es. DELETE/RENAME) applicata dal deploy lascia il D1 senza snapshot dello stesso run: il restore è quello di ieri (backup 02:00), con perdita di un giorno di dati. Il rollback worker (`wrangler rollback`) è manuale e richiede di scavare nei log del run per trovare il version-id precedente.

**Severità:** MEDIUM (restore manuale + perdita dati possibile).

**Fix**
- Salvare il version-id precedente in `GITHUB_OUTPUT` + artifact (o commento sul run) prima di `wrangler deploy`;
- step opzionale di snapshot: `wrangler d1 export osdb-production --remote --output=pre-deploy-<sha>.sql` (cifrato) nel run di deploy;
- print nel job summary del comando di rollback esatto.

---

## F10 — LOW/MED — Backup: workflow rosso ogni giorno per design in fase LXC; singola location, restore mai provato

**File:riga**
- `.github/workflows/ops-backup.yml:15-18` (schedule daily 02:00 UTC) e `43-52` (guard: `exit 1` se mancano i secrets CF)
- Fase attuale: ambiente attivo LXC 114 self-hosted (`deploy.yml:10-13`, `ops-backup.yml:10-13`) → il job fallisce ogni notte da quando esiste, per design
- Backup LXC: `ops/backup-lxc114.sh:14` — cron **sul host** (02:30), fuori da CI, non visibile nel repo
- `ops-backup.yml:104-112` — artifact GH `retention-days: 30`, unica location; nessuna copia off-site (R2 disponibile, binding già in `wrangler.jsonc:29-34`)
- Verifica restore: solo presenza 3 tabelle + conteggi baseline (`ops-backup.yml:67-86`) — **nessun drill di restore**

**Misurazione**
Nessun alert differenzia il fallimento "atteso" (secrets assenti) da un vero guasto del dump; i backup vivono solo come artifact GitHub (30 gg, persi se l'account/repo ha un problema); il restore non è mai stato esercitato in modo automatizzato.

**Severità:** LOW/MEDIUM (igiene ops; gap reale: copia off-site + drill restore).

**Fix**
- Gate dello schedule su `vars.ENABLE_CF_BACKUP` (disattivo durante la fase LXC → niente run rossi);
- step di upload del dump cifrato su R2 (bucket `opensurveillancedb-photos` o bucket dedicato);
- job trimestrale di restore-drill su un D1 temporaneo (`wrangler d1 execute` del dump cifrato → smoke sui conteggi).

---

## Aree verificate OK (nessun finding)

- **Security headers:** applicati globalmente dal worker edge a ogni risposta (`worker/index.ts:216-251`), con `no-store` dove serve; CSP calibrato (no `unsafe-eval`, `frame-ancestors 'none'`); asset statici passano comunque dal worker (i `_headers` in `dist/client` aggiungono solo l'immutable cache sugli hash). HSTS volutamente assente finché non c'è il dominio pubblico (documentato, `worker/index.ts:211-215`).
- **N+1 su D1:** assente nei punti caldi: conteggi verifica in una `GROUP BY IN` (`db/cameras.ts:222-225`, `db/confirmations.ts`), paginazione nearby in SQL (`db/cameras.ts:434-484`), write path in batch (`db/photos.ts:311-327`). Il "N+1" reale è **client-side** (F1/F3).
- **Tile proxy:** TTL 7 gg minimo, cap 2 MiB, timeout 5 s, validazione z/x/y (`app/api/tiles/[z]/[x]/[y]/route.ts:35-48`) — solido (limite F4 a parte).
- **R2/photos:** bytes mai serviti senza approved+redaction+camera public (`db/photos.ts:195-219`); cleanup orfani su fallimento D1 (`db/photos.ts:127-143`).
- **Scroll/overflow:** nessun overflow orizzontale a livello pagina: tabelle legali e indice A-Z hanno i propri `overflow-x:auto` (`app/globals.css:472,726`), map sidebar `overflow-y:auto` (`globals.css:827`), layout map responsive (`globals.css:409,816,885-891`).
- **a11y:** Lighthouse reale: **100/100 su tutte e 4 le route** (gate CI 0.95 confermato rispettato con margine).

## Appendice — dati grezzi Lighthouse (preview locale, mobile 4x CPU)

```
route        perf  a11y  seo  bp   FCP      LCP      CLS    TBT   JS tot
/            77    100   100  96   4.1s     4.1s     0      10ms  536 KiB
/directory   73    100   100  96   4.5s     4.5s     0      ~     569 KiB
/mappa       65    100   100  93   4.4s     7.1s     0      ~     937 KiB
/records/1   72    100   100  96   4.1s     4.9s     0.001  ~     712 KiB
```
Bundle (raw, `dist/client/assets`): framework 189.734 B · LocaleProvider 149.760 B · leaflet 148.818 B (lazy) · index 87.143 B · CSS 77.487 B · totale JS 757 KB.
