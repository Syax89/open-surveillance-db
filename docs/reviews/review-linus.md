# Review tecnica — open-surveillance-db @ `6f56d22` (main)

**Autore:** Linus (sviluppatore backend/API)
**Data:** 2026-08-02
**Scope:** revisione completa del codice — pattern non DRY, refactoring, prestazioni (bundle, rendering, query DB), debito tecnico, code smell, error handling. Zero nuove librerie richieste dai fix.
**Metodo:** lettura integrale dei 14 moduli `db/*`, dei route handler `app/api/*`, del worker edge (`worker/index.ts`), dei lib condivisi `app/lib/*` e dei componenti client principali. Verifiche statiche (grep) su duplicazioni e pattern. **Nessuna modifica applicata** (review-only).

---

## Sintesi esecutiva

Il codice è complessivamente di **qualità alta**: fail-closed ovunque, commenti ADR/decisione eccellenti, validazione difensiva al confine, anti-gaming ben progettato. Non ho trovato vulnerabilità sfruttabili (P0) né data-loss immediato.

I problemi reali sono di tre famiglie:

1. **Atomicità dei write path di moderazione** (P1) — UPDATE + INSERT audit + UPDATE queue girano come statement separati: in caso di errore/crash a metà il trail audit append-only resta bucato o lo stato è inconsistente. Il codice sa già usare `d1.batch()` (retention, erasure): va esteso ai decision path.
2. **`cameras.updated` usato con doppio significato** (P1) — 15 scritture scrivono stringhe leggibili ("Local moderation: …", "Submitted just now") in un campo che viene anche ordinato (`(status, updated DESC)`) e usato come ancora temporale lato client; la migration 0019 aveva normalizzato tutto a ISO, il codice runtime lo sta di nuovo corrompendo.
3. **Duplicazione diffusa** (P2/P3) — SELECT di colonne cameras ripetuta 7×, `publicCameraPredicate` ricostruita inline 2×, `readCappedBody` 3×, confronto costante 4×, `sha256Hex` 2×, `distanceInMeters` 2×, `readCsrfToken` 3×, boilerplate rate-limit 429 in 16 route. Tutti i fix sono refactor locali, zero nuove dipendenze.

Conteggio per priorità: **P0: 0 · P1: 4 · P2: 17 · P3: 12** (alcuni P2/P3 sono raggruppamenti).

---

## P1 — Da correggere prima (integrità dati / correttezza)

### P1-1 · Write path di moderazione non atomici → rischio audit gap
**File:** `db/moderation.ts:794-855` (moderateCamera), `:1090-1136` (moderateCorrection), `:1281-1325` (moderateCameraEdit), `db/photos.ts:267-293` (moderatePhoto), `db/appeals.ts:175-197` (fileAppeal), `:261-304` (decideAppeal).
**Problema:** ogni decisione esegue UPDATE entità + INSERT `moderation_events` + UPDATE `moderation_queue` come `await` separati, senza transazione. Se il worker muore o uno statement fallisce tra i due, il trail append-only (vincolo di design, trigger in migration 0008) perde l'evento pur avendo cambiato lo stato, o la queue resta aperta con l'entità terminale. È esattamente la classe di inconsistenza che `d1.batch()` (atomico su D1) già risolve in `db/retention.ts:240,306,418` e `db/auth.ts:780`.
**Fix:** avvolgere UPDATE+INSERT event+UPDATE queue in un unico `d1.batch([...])` per decisione. Il read-back `loadCamera(d1, id)!` dopo il RETURNING (righe 714, 738, 767, 994, 1019, 1047, 1202, 1211, 1215, 1242, 1325) diventa inutile: la riga aggiornata è già nel risultato del RETURNING.

### P1-2 · `cameras.updated` scritto con stringhe non-ISO in 15 punti
**File:** `db/cameras.ts:285` (`'Submitted just now'`), `db/moderation.ts:867,870,878,882,891,900` (transizioni `getCameraTransition`), `:1294` (edit applicato), `:1386,1403,1420` (applyCorrectionOutcome), `db/appeals.ts:277`, `db/camera-edits.ts:389`, `db/retention.ts:312`.
**Problema:** `updated` è dichiarato timestamp ISO (migration 0019 ha normalizzato i valori legacy proprio a ISO), ma il codice runtime scrive stringhe descrittive. Conseguenze: (a) l'indice `(status, updated DESC)` (schema.ts:47) ordina lessicograficamente e le righe non-ISO finiscono fuori posto; (b) l'anchor client `lastVerifiedAt ?? updated` in `applyCameraFilters` (use-camera-filters.ts:166) fa `new Date("Local moderation: …")` → `NaN` → il record viene **escluso dal filtro freshness** anche se è verified; (c) l'export CSV/GeoJSON espone valori non-data in un campo nominato `updated`.
**Fix:** rendere `updated` sempre un ISO timestamp (il testo descrittivo è già nell'audit `moderation_events.note`/`action`); in alternativa introdurre una colonna `updated_note` separata e tenere `updated` solo data. Nel frattempo il client dovrebbe usare `lastVerifiedAt ?? (parsable ? updated : undefined)`.

### P1-3 · `createPendingPhoto`: oggetto R2 scritto prima della riga D1 → orfano se l'INSERT fallisce
**File:** `db/photos.ts:91-114`.
**Problema:** `env.PHOTOS.put(...)` (riga 92) avviene **prima** dell'`INSERT` in D1 (riga 96). Se l'INSERT fallisce (constraint, binding) l'oggetto resta in R2 senza riga D1; la retention R6 (db/retention.ts:446-500) pulisce solo oggetti con riga D1, quindi è un **leak permanente**.
**Fix:** invertire l'ordine (INSERT D1 → R2.put → UPDATE `storage_key` se serve) oppure, mantenendo l'ordine attuale, aggiungere `try/catch` sull'INSERT con `await env.PHOTOS.delete(storageKey)` best-effort nel catch. Anche l'ordine PUT→INSERT rende l'endpoint "photo storage" non idempotente su retry.

### P1-4 · Paginazione nearby/search calcolata in memoria sull'intero set
**File:** `db/cameras.ts:376-409` (`searchPublicCamerasNearPage`, `findNearbyPublicCamerasPage`).
**Problema:** entrambe chiamano `searchPublicCamerasNear` (che carica **tutti** i record del bbox e calcola haversine su ognuno) e poi paginano con `records.slice(offset, offset+limit)` e `total = records.length`. Con dataset grandi ogni pagina costa O(box) query + memoria + CPU, e il `total` è il conteggio del bbox (corretto ma costoso da produrre per ogni pagina).
**Fix:** spostare LIMIT/OFFSET (e il calcolo distanza, o almeno il filtro raggio) in SQL, con un COUNT separato per `total`; oppure, se si mantiene il calcolo in JS, aggiungere un cap al candidato set e documentarlo. Inoltre le due funzioni sono **identiche** salvo il default di `limit` (50 vs 25): unificare in una con parametro `defaultLimit`.

---

## P2 — Debito tecnico / DRY / prestazioni

### P2-1 · SELECT colonne `cameras` duplicata 7 volte
**File:** `db/cameras.ts:118,193,258,293,359` (inline, 5×), `db/moderation.ts:267-268` (`cameraColumns`), `db/camera-edits.ts:319-320` (`ownerColumns`).
**Problema:** la stessa proiezione (con i CASE `publish_*`) è riscritta in 7 punti; un cambio colonna richiede 7 modifiche e il rischio di drift è reale (le due costanti differiscono già per `notes`/`contributor_id`).
**Fix:** una sola costante esportata da `db/cameras.ts` (es. `CAMERA_PUBLIC_COLUMNS` e `CAMERA_OWNER_COLUMNS`), riusata da moderation e camera-edits.

### P2-2 · `publicCameraPredicate` ricostruita inline invece di riusare la funzione
**File:** `db/photos.ts:172-184` (`getPublicPhoto`), `db/confirmations.ts:177-183` (`setConfirmation`).
**Problema:** il predicato pubblico (`status IN (…) AND (status='demo' OR review_due_at IS NULL OR review_due_at >= ?)`) è derivato da `PUBLIC_CAMERA_STATUSES` in `db/cameras.ts:79` ma viene riscritto a mano con i placeholder in due altri moduli.
**Fix:** esportare/riusare `publicCameraPredicate` (o un helper che qualifichi le colonne per JOIN, es. `publicCameraPredicate("c")`) nei due punti.

### P2-3 · `countVerifiedCameras` ≡ `verifiedContributionCount`
**File:** `db/auth.ts:697-704` e `db/confirmations.ts:85-92` — stessa identica query (`SELECT COUNT(*) FROM cameras WHERE contributor_id = ? AND status = 'verified'`).
**Fix:** una sola funzione (es. in `db/cameras.ts` o `db/confirmations.ts`), l'altra diventa alias/re-export.

### P2-4 · `readCappedBody` duplicata 3 volte
**File:** `app/api/photos/route.ts:54-79`, `app/api/geocode/route.ts:94-119`, `app/api/tiles/[z]/[x]/[y]/route.ts:81-106`.
**Problema:** stessa funzione (streaming con contatore, cancel al superamento cap) con nomi/errori diversi.
**Fix:** helper condiviso in `app/lib/` (es. `readCappedBody(stream, cap, onTooLarge)`), zero nuove librerie.

### P2-5 · Confronto costante duplicato 4 volte
**File:** `app/lib/csrf.ts:24-31` (`constantTimeEqual`), `db/auth.ts:67-74` (`constantTimeEqual`), `worker/index.ts:108-115` (`safeEqual`).
**Problema:** stessa implementazione constant-time in 3 moduli (il 4º uso è l'import da csrf).
**Fix:** modulo unico (es. `app/lib/constant-time.ts`) importato da tutti, incluso il worker.

### P2-6 · `sha256Hex` duplicato
**File:** `db/auth.ts:55-60` e `app/lib/abuse-alerts.ts:71-76` — identiche.
**Fix:** unico helper in `app/lib/` (o riuso dell'export di auth senza invertire il layering: vedi P2-9).

### P2-7 · `distanceInMeters` duplicato
**File:** `app/lib/search.ts:76-87` (export) e `db/cameras.ts:208` (inline, versione a 4 argomenti).
**Fix:** unica implementazione (la versione `LatLon` di search.ts è già la forma migliore).

### P2-8 · Boilerplate rate-limit 429 ripetuto in 16 route
**File:** 16 route in `app/api/*` (es. `app/api/cameras/route.ts:77-91`, `app/api/cameras/[id]/route.ts:43-57`, `app/api/cameras/[id]/confirmation/route.ts:59-73`, `app/api/geocode/route.ts:220-240`, `app/api/tiles/[z]/[x]/[y]/route.ts:163-180`, `app/api/moderation/route.ts:268-285`).
**Problema:** il blocco `callerKey → checkRateLimit → recordRateLimitBlock → Response 429 + Retry-After` è copiato ovunque (messaggi leggermente diversi per copia-incolla).
**Fix:** helper in `app/lib/rate-limit.ts`: `withRateLimit(request, kind, env, route, handler)` che ritorna `Response | null` e centralizza anche il log; estendere il pattern già esistente `authLimit` (auth-route-helpers.ts:59) e `guardMutation` (confirmation route:48) a tutta la famiglia. Insieme alla sequenza guard `sameOrigin → session → CSRF` (ripetuta in PATCH /api/cameras/[id], POST /api/photos, confirmation) si può costruire un `guardStateChange(request, env, {bucket})` unico.

### P2-9 · Layering invertito: `db/*` importa da `app/lib`
**File:** `db/cameras.ts:2-3` (`duplicate-detection`, `public-status`), `db/freshness.ts:15` (`public-status`), `db/photos.ts:3` (`public-status`), `db/appeals.ts:11` (`rate-limit`).
**Problema:** il layer dati dipende dal layer applicativo; `PUBLIC_CAMERA_STATUSES` (il confine pubblico più importante) vive in `app/` mentre è usato da ogni query db.
**Fix:** spostare le costanti condivise (status pubblici, ecc.) in un modulo neutro (es. `db/constants.ts` o `lib/shared/`) e re-export da `app/lib/public-status.ts` per non toccare i consumer esistenti.

### P2-10 · `runFreshnessSweep`: UPDATE+INSERT evento in loop
**File:** `db/moderation.ts:542-576`.
**Problema:** per ogni record scaduto esegue UPDATE + INSERT evento in sequenza: con N record scaduti sono 2N round-trip seriali.
**Fix:** raggruppare in chunk con `d1.batch([...])` (limite 100 statement/batch, come già fatto in retention).

### P2-11 · Home/directory: walk client di tutte le pagine (500/pagina)
**File:** `app/lib/use-public-cameras.ts:104-145` (`walkPages`, `walkFilteredPages`).
**Problema:** la home scarica l'intero dataset in `ceil(N/500)` richieste seriali per popolare la mappa; a crescita del dataset la prima render degrada.
**Fix:** usare `GET /api/cameras?bbox=…&format=geojson` (già esistente, `listPublicCamerasInBbox`) per il layer marker della mappa e la lista paginata per la directory, mantenendo la cache-modulo per il dettaglio record.

### P2-12 · `deleteR2Objects` seriale
**File:** `db/retention.ts:200-208`.
**Problema:** gli oggetti R2 vengono cancellati uno per uno in un loop `await`.
**Fix:** `await Promise.allSettled(keys.map(key => r2.delete(key)))` mantenendo i conteggi (è uno sweep daily, il guadagno è modesto ma gratis).

### P2-13 · `moderateCameraEdit`: UPDATE con 7 subquery COALESCE sulla stessa riga
**File:** `db/moderation.ts:1281-1295`.
**Problema:** `COALESCE((SELECT proposed_x FROM camera_edit_requests WHERE id = ?), …)` ripetuta 7 volte con lo stesso parametro → 7 scans della stessa riga in un UPDATE.
**Fix:** leggere la riga `camera_edit_requests` una volta (SELECT), costruire l'UPDATE con i valori.

### P2-14 · `listPublicCameraRevisions`: filtro azioni in JS
**File:** `db/moderation.ts:1565-1574`.
**Problema:** SELECT di tutti gli eventi del camera + filtro `PUBLIC_LIFECYCLE_ACTIONS` in memoria (il set è definito a riga 1541).
**Fix:** aggiungere `AND action IN (…)` alla query (il set è statico e piccolo).

### P2-15 · `setConfirmation`: doppia SELECT sulla stessa camera
**File:** `db/confirmations.ts:164-184`.
**Problema:** la prima SELECT (riga 166) carica `contributorId/status/reviewDueAt/lastVerifiedAt`, poi la seconda (riga 178) rifà il public check sulla stessa riga.
**Fix:** unire le due in una sola query con il predicato pubblico.

### P2-16 · `parseCookies`: `decodeURIComponent` senza try/catch
**File:** `app/lib/csrf.ts:43`.
**Problema:** un cookie malformato (`%` troncato, es. `osdb_session=%zz`) fa lanciare `URIError` → 500 su qualunque route che legga cookie (`resolveOptionalContributor`).
**Fix:** `try { decodeURIComponent(value) } catch { value }` (o `return null` per la coppia).

### P2-17 · Allowlist "mirror" duplicate (commenti espliciti "Kept inline")
**File:** `app/api/moderation/route.ts:34-41` (`correctionOutcomeValues` vs `db/moderation.ts:69`), `app/records/[id]/edit/page.tsx:43-51` (`FIELD_LIMITS` vs `db/camera-edits.ts:34`), `:73-79` (`KIND_OPTIONS`).
**Problema:** due sorgenti di verità per gli stessi valori (il commento dice "mirror… so the route validates without importing a runtime value the test harness does not mock"). Se una cambia, l'altra diverge silenziosamente.
**Fix:** importare le costanti dal db layer (il test harness mappa già `db/*` — il motivo del mirror è datato); se il mock è il problema, esportare i valori anche da un modulo neutro.

---

## P3 — Pulizia / manutenibilità

### P3-1 · `drizzle-orm` in `dependencies` ma mai usato a runtime
**File:** `package.json` (dependencies), `db/index.ts` (intero file, `getDb()` mai importato — unico import di `drizzle-orm` runtime è `db/schema.ts:1`, usato solo da drizzle-kit).
**Fix:** spostare `drizzle-orm` in `devDependencies` e rimuovere `db/index.ts` (o documentarlo come entry per un futuro uso reale).

### P3-2 · `geocodeLimits`/`searchLimits`/`appealAppellantLimits` quasi identici
**File:** `app/lib/rate-limit.ts:204-266` — stesso pattern env-override+default, cambiano solo prefix e default.
**Fix:** generare da `limitsFor` con `defaults` (es. `limitsFor("geocode", env, { maxRequests: 30, windowSeconds: 60 })`).

### P3-3 · `envNumber` duplicato + pattern `EnvLike` 31 volte
**File:** `app/lib/abuse-alerts.ts:52`, `db/confirmations.ts:51`; pattern `type EnvLike` in 31 file.
**Fix:** helper condiviso `envNumber(env, key, fallback)` (in un lib neutro) e, se gradito, un type `EnvLike` esportato.

### P3-4 · `isValidCalendarDate` (app/api/cameras/route.ts:42) ≡ `isCalendarDate` (db/camera-edits.ts:218)
**Fix:** unica funzione in un helper date.

### P3-5 · Tipo `GeocodeSuggestion` duplicato
**File:** `app/api/geocode/route.ts:62-68` (export) e `app/components/home/GeocodeSearch.tsx:11-17`.
**Fix:** importare l'export della route (o spostare il tipo in un lib).

### P3-6 · `parseId` duplicato nello stesso file
**File:** `app/api/cameras/[id]/route.ts:35-38` (GET) e `:85-89` (PATCH) — stessa funzione.
**Fix:** una sola funzione nel file.

### P3-7 · Read-back ridondanti dopo RETURNING
**File:** `db/moderation.ts:714,738,767,994,1019,1047,1202,1211,1215,1242,1325` — `loadCamera(d1, id)!` / `loadCorrection` / `loadEditRequestItem` richiamate subito dopo UPDATE…RETURNING che ha già la riga.
**Fix:** usare il valore di ritorno del RETURNING (collegato a P1-1).

### P3-8 · `use-camera-filters.ts` (414 righe) con workaround vinext pesanti
**File:** `app/lib/use-camera-filters.ts` (spec. `applyFilters` :335-362, doppio mirror `committed` + `routerVisibleSearchRef`).
**Problema:** complessità alta per il workaround dell'errore vinext `digest`; `hrefFor` (:296-307) duplica la serializzazione di `stringifyCameraFilters` (:127-137).
**Fix:** quando vinext si stabilizza, riunire i due commit path; nel frattempo riusare `stringifyCameraFilters` per i parametri owned dentro `hrefFor`.

### P3-9 · Contratto debounce geocode vs filtro ?q= in due file
**File:** `app/components/home/GeocodeSearch.tsx:37` (`GEOCODE_DEBOUNCE_MS = 250`) e `app/lib/use-camera-filters.ts:72` (`QUERY_DEBOUNCE_MS = 400`).
**Problema:** l'invariante "250 < 400" (per UX del dropdown, fix t_3c4b188e) è documentato ma vive in due costanti non collegate.
**Fix:** esportare entrambe da un unico modulo con un commento/assert sull'ordinamento.

### P3-10 · `db/geocode.ts` usa AbortController manuale invece di `AbortSignal.timeout`
**File:** `db/geocode.ts:93-94` vs `app/api/geocode/route.ts:269` e `app/api/tiles/…:215` (che usano `AbortSignal.timeout`).
**Fix:** uniformare.

### P3-11 · Error handler "Database unavailable" per qualunque eccezione
**File:** `app/api/cameras/route.ts:167-170`, `app/api/cameras/[id]/route.ts:73-76`, ecc.
**Problema:** ogni errore interno (anche bug di programmazione) risponde 503 "Database unavailable": rende il triage dei 5xx in produzione cieco.
**Fix:** distinguere 503 (binding/DB non disponibile) da 500 (errore interno) con un error type, mantenendo il fail-closed verso il client.

### P3-12 · `freshnessCutoff` (db/cameras.ts:75) vs `freshnessCutoffFor` (use-camera-filters.ts:96)
**Problema:** due implementazioni del calcolo "ora − N giorni" (una per ISO string server, una per ms client). Non identiche ma concettualmente duplicate.
**Fix:** lasciare separate (domini diversi) ma documentare il legame — o condividere la costante giorni.

---

## Punti di forza da preservare (nessuna azione)

- Edge gate fail-closed con constant-time compare, `stripIdentityHeaders` su ogni path e identità iniettata solo dopo il gate (`worker/index.ts`).
- Rate limiting per famiglia (`RouteKind`) ben calibrato e documentato; quota anti-gaming in D1 (non in memoria) per confirmations.
- `publicCameraPredicate` unico per le read pubbliche e `PUBLIC_CAMERA_STATUSES` come sorgente unica del confine pubblico.
- Retention sweep: batch atomici, chunking a 100 parametri, `HOLD_EXCLUSION_SQL`, per-record failure isolation.
- `listPublicCamerasPage` con COUNT + GROUP BY IN per i confirmationCount (niente N+1).
- Lazy import di Leaflet, bbox endpoint per la mappa, cache edge con Cache-Tag e purge fail-open.
- Validazione trasporto (32 KiB body cap, URL cap), MIME sniffing + strip EXIF fail-closed, minimizzazione dati in ogni proiezione pubblica.
- i18n completa (it/en), a11y curata (combobox, alertdialog, aria-live), zero hardcoded copy nei componenti principali.
- Assenza totale di `@ts-ignore`, `any` (solo 3), TODO/FIXME (0): il codice è pulito e i commenti spiegano il perché.

---

## Appendice — numeri

- LOC TS/TSX totali: ~23.770 su 429 file (esclusi node_modules/.git).
- File `db/*`: 14 moduli letti integralmente (schema.ts 467, moderation.ts 1.574, auth.ts 799, …).
- Route API: 24 file in `app/api/*`, 16 usano `checkRateLimit`.
- `"use client"`: 54 componenti/hook.
- Duplicazioni contate: SELECT cameras 7×, `readCappedBody` 3×, constant-time compare 4×, `sha256Hex` 2×, `distanceInMeters` 2×, `readCsrfToken` 3×, `isValidCalendarDate` 2×, `GeocodeSuggestion` 2×, `correctionOutcomeValues` 2×, `envNumber` 2× (pattern `EnvLike` 31×).
