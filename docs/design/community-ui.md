# Community UI — ADR 0021 FASE 3 (record, mappa, directory, segnala)

> Kanban t_b533b254 · design Vera · 2026-08-05
> Dipende da t_a9f23581 (FASE 2 API, PR #299 merged `5a1c392`).
> Branch: `feature/design/t_b533b254-community-ui` (base: `5a1c392`).

## Contesto

Il pivot community (ADR 0021, CEO 2026-08-04) consegna qui la superficie
interattiva: il sito diventa un elenco guidato dalla comunità, senza coda di
moderazione per le nuove segnalazioni. La FASE 2 (API) ha portato i cinque
`camera_community_actions` (like/confirm/gone/problem/privacy), le soglie
trust-weighted, il ranking `?sort=useful` e la cronologia pubblica
`/api/cameras/[id]/events`. Questa fase porta l'interfaccia: widget azioni con
conteggi live e stato login-aware, badge di stato community, banner per i
record ritirati (hidden/removed), timeline pubblica per record, ordinamento e
filtro stato in directory/mappa, messaggio di pubblicazione immediata nel
form segnala, i18n EN+IT completa, a11y e test.

Vincoli rispettati: estetica sobria civic-tech (zero nuove librerie, zero
nuovi token colore — tutto riusa la palette tokenizzata t_be89b99c),
vocabolario ADR congelato ("useful/utile", "confirm/confermo", "no longer
there/non c'è più", "flag/segnala", "privacy"), mai stelle/upvote, mai
attribuzioni pubbliche, mai pesi esposti (ADR §10.2).

## 1. Widget azioni community — record detail e popup mappa

`app/components/CommunityActions.tsx` (nuovo, 200 righe) — UN componente,
due mount:

- **Full (record detail `/records/[id]`)**: cinque bottoni etichettati con
  conteggi live (`Useful: 12 · Confirm: 5 · No longer there: 1 · Flag: 0 ·
  Privacy: 0`), griglia 5 colonne (2 su mobile <560px e nel popup).
- **Compact (popup marker mappa)**: stesso widget, griglia 2×3, montato come
  **root React separata** fuori dall'albero Next (`app/lib/popup-actions.tsx`)
  dentro il nodo `div.osm-popup-community` che `map-popup.ts` genera. Il
  locale è risolto dal popup helper e passato via prop `bundle`; il mount
  avviene su `popupopen` e viene smontato su `popupclose` (niente leak di
  root React in un popup Leaflet distrutto).

**Contratto (ADR §3.2/§3.3/§10.2), il server è l'autorità:**
- una sola azione per (record, contributor): `PUT` upserta/cambia, `PUT` con
  la stessa azione → 409, `DELETE` rimuove;
- stato personale + sessione letti con due fetch no-store
  (`GET /api/cameras/[id]/actions` + `GET /api/auth/me`); l'anonimo vede i
  conteggi e la CTA "Log in or register to take part", mai un bottone
  funzionante (il server risponderebbe 401 — la copy spiega);
- self like/confirm → 403 (self-action gate ADR §3.3), problem/privacy sul
  proprio record permesse (fast hide GDPR-friendly);
- i conteggi sono COUNT DISTINCT (aggregati, mai attribuzione).

**Fix rispetto al WIP precedente**: il widget chiamava `useMessages()` che
esplode fuori dal `LocaleProvider` nel root standalone del popup ("useLocale
must be used within LocaleProvider"). Ora legge `LocaleContext` direttamente
(esportato da `LocaleProvider.tsx`) con fallback `messages.en` quando il
`bundle` prop è passato — stesso contratto, nessun crash.

**a11y**: ogni conteggio è `role="status"` sr-only con la label
("Useful: 12"), il numero visibile è `aria-hidden` (un annuncio per
cambiamento, non cinque regioni al primo paint); `aria-pressed` sull'azione
attiva; errori in `role="alert"`; `aria-label` con l'help testuale di ogni
azione; focus visibile `:focus-visible` a 3px.

## 2. Badge stato community + banner record ritirati

**Badge** (`RecordPageBody.tsx`, ADR §9.1): sotto la topline, riga
informativa di freschezza — mai un cambio di stato:
- nessuna conferma → "Community status: Never confirmed / Mai confermata";
- confermata → "Community status: Confirmed 5 times · Last confirmed: 2
  August 2026" (conteggio conferme + `lastVerifiedAt`);
- `demo` → etichetta di prototipo.

**Banner direct-link** (ADR §6.3): un record `hidden`/`removed` resta
raggiungibile dal proprio link con banner esplicito (`role="note"`):
- `hidden`: "Record hidden / Record nascosto" (ambra, `--offline-*`);
- `removed`: "Reported as no longer present / Segnalato come non più
  presente" (rosso revisione, `--status-review-*`);
- entrambi: body che spiega l'assenza da elenco/mappa, **link alla
  cronologia** (`#record-timeline`), nota che i segnali di inversione
  (confirm / gone) restano aperti — il widget azioni è montato anche sui
  record ritirati;
- niente "View on map" sui record ritirati (non sono su nessuna mappa).

Il resolver del record page (`getCommunityRecordById` in `db/cameras.ts`)
allarga la whitelist SOLO per il dettaglio: `active/demo/hidden/removed`.
Tutte le superfici di elenco (directory, mappa, search, GeoJSON) mantengono
la whitelist pubblica stretta (`isPublicStatus`) — un record ritirato non è
mai elencato, solo raggiungibile per link diretto.

## 3. Cronologia eventi pubblica (timeline)

`RecordPageBody.tsx` + `GET /api/cameras/[id]/events` (cache 300/600):
- la vecchia "change history" (moderazione, attribuita) è sostituita dalla
  timeline pubblica **senza attribuzioni** (ADR §7);
- ogni riga: etichetta semantica localizzata + dettaglio aggregato
  (`Published`, `Confirmed present — 5 people`, `Marked useful — 12
  people`, `Hidden — reason: privacy · 1 person`, `Removed — 3 people`,
  `Flagged as no longer there`, `Restored`, `Triggering actions reset`,
  `History migrated`) + data locale;
- il detail mostra solo count/distinct e reason — mai pesi, mai identità;
- nota a piè lista: "Aggregate public events only — never contributor
  identities, emails or internal notes".

**Fix rispetto al WIP**: le chiavi i18n della timeline usavano camelCase
(`goneFlagged`, `actionConsumed`) mentre il backend emette kebab
(`gone-flagged`, `action-consumed`) — il lookup cadeva sul fallback
"Record updated". Corrette le chiavi EN+IT ai valori kebab esatti del
backend; il label "Flagged as no longer there — 1 person" ora renderizza
(verificato live).

## 4. Directory e mappa — ordinamento per utilità e filtro stato

`use-camera-filters.ts` (settima dimensione URL `?state=`):

- **Sort** (`SORT_ORDERS` esteso): `alphabetical | position | useful |
  recent | confirmations`. Il client ordina con i conteggi esposti
  (`usefulCount`, `confirmCount`, `lastVerifiedAt`) — stessa direzione del
  server (`?sort=useful` pesa i like), mai pesi esposti (ADR §10.2).
  `recent` mette i mai-confermati in coda (nulls last, mirror del server).
- **Filtro stato conferma** (`?state=all|confirmed|never`): predicato client
  su `lastVerifiedAt` — "confirmed" richiede almeno una conferma, "never" la
  esclude. URL-backed, reset incluso, default "all" omesso dall'URL (R2).
- `FiltersBar` riceve `showCommunitySort` + `stateFilter`/`setStateFilter`
  **opzionali**: la home hub resta byte-identica; `/directory` e `/mappa`
  espongono le tre opzioni community nel select "Order records" e il select
  "Confirmation status".

## 5. Form segnala — pubblicazione immediata

- **Route POST** (`app/api/cameras/route.ts`): il report di un contributore
  verificato è inserito direttamente `status='active'` via `createCamera`
  (nuovo writer in `db/cameras.ts`, che apre anche l'evento lifecycle
  `published` nella stessa transazione). Niente `pending`, niente riga di
  coda. Il writer legacy `createPendingCamera` resta intatto per i flussi
  legali (ADR §8) e i suoi test.
- **Copy** (`report.ts`, EN+IT): "Report published — it is now visible in
  the directory and on the map." / "Segnalazione pubblicata — ora è visibile
  nell'elenco e sulla mappa."; bottone "Publish report / Pubblica la
  segnalazione"; testi duplicato/nearby aggiornati ("will be published
  immediately", "the community will check whether this is a duplicate").
- **Home** (`home.ts` EN+IT): card "Report a camera" → "Publish a newly
  observed camera right away."; principio "Community-verified / Verificati
  dalla comunità" (chiave rinominata `communityVerified`) con la nuova copy
  del modello community — niente più "records wait for human review".

## 6. i18n EN+IT completa (tsc parity)

File toccati: `community.ts` (nuovo blocco `actions`), `directory.ts`
(sort/state), `record.ts` (badge/banner/timeline/hideReasons), `report.ts`
(pubblicazione immediata), `status.ts` (label `hidden`), `home.ts`.
`Translation<typeof en>` garantisce la parità: tsc `--noEmit` pulito. Zero
"contributore" nei bundle nuovi (regola QA: "contributor").

## 7. a11y

- `role="status"` (live region) sui conteggi, sr-only; `aria-pressed` sui
  bottoni azione; `role="alert"` per gli errori; banner `role="note"`;
  timeline con `aria-label`; select etichettati; focus visibile.
- Popup mappa: il widget compatto è una root React reale con la stessa
  semantica; il cono di visione resta decorativo (task t_f8b775ec).
- L'utente anonimo non ha mai un bottone "funzionante": i bottoni sono
  `disabled` con la CTA di accesso — il server sarebbe comunque 401.

## 8. Test (render + interazione)

- `tests/client-community-actions.test.mjs` (nuovo, 9 test): anonimo
  (conteggi + CTA, bottoni disabled), sessione attiva (bottoni abilitati,
  aria-pressed), toggle on (PUT + conteggi live), toggle off (DELETE,
  conteggio −1), switch azione, 403 self-action, 409 duplicate, 401
  mid-action (CTA anonima torna), variante compact col bundle pre-risolto.
- `tests/client-record-page.test.mjs` (esteso): badge mai confermata /
  confermata N volte, timeline pubblica, banner hidden/removed con anchor
  cronologia e widget montato, niente "view on map" sui ritirati, loading.
- `tests/client-verify-toggle.test.mjs` (convertito al nuovo wiring):
  interazione CommunityActions DENTRO il record page (PUT con CSRF, DELETE,
  403, 409, dead session fail-open con 401 onesto).
- `tests/url-state-contract.test.mjs` (+2): parse/serialize/round-trip
  `?state=`, sort community in `applyCameraFilters`.
- `tests/status-leak-boundaries.test.mjs`: pattern aggiornato al whitelist
  esplicito `isRecordPageStatus` (mai raw status nel record page).
- `tests/api-cameras.test.mjs` / `api-auth` / `write-gate` / `invalid-inputs`
  / `rate-limit-routes` / `api-confirmations`: stub aggiornati a
  `createCamera` e `getCommunityRecordById`; test "pending report" → test
  della pubblicazione immediata (status active).
- `tests/auth-flow-e2e.test.mjs` (29): nuovo helper `submitPendingCamera`
  (writer legacy) per la macchina di moderazione (che sopravvive per le
  emergenze legali); il test "starts pending" diventa "published immediately
  and appears on every public surface"; nearby/search usa published via
  route + pending via writer; erasure verifica l'evento lifecycle
  `published` al posto dell'audit approve.
- `tests/e2e-journeys.test.mjs`: journey segnala → pubblicazione immediata
  (niente coda, subito in elenco); journey edit → record attivo, l'edit
  dell'owner va in re-moderation (202), foreign 403.
- `tests/client-tools.test.mjs` / `client-field-of-view`: label "Publish
  report" e conferma "Report published".
- `tests/component-smoke.test.mjs`: PublicDirectory ricompattato a 150 righe
  (target refactor) con le nuove props opzionali.

**Suite completa: 2051/2051 verdi, 0 falliti** (rebuild + `node --test`),
tsc pulito, build verde.

## 9. Verifica live (browser reale, serve-preview con D1 locale seminato)

DB preview seminato con dati community fittizi (5 record: 3 active, 1
hidden, 1 removed; 32 azioni; 14 eventi lifecycle) per esercitare ogni
superficie:

- record 3 (active): badge "Confirmed 5 times · Last confirmed: 2 August
  2026", widget 12/5/1/0/0, CTA anonimo, timeline Published → Confirmed
  present — 5 people → Marked useful — 12 people;
- record 6 (hidden): banner "Record hidden" + link cronologia, "Never
  confirmed", reversal signals aperti, niente "View on map";
- record 7 (removed): banner "Reported as no longer present" (EN e IT),
  timeline Published → Flagged as no longer there — 1 person → Removed — 3
  people → Confirmed present — 2 people;
- /directory?sort=useful&state=confirmed: solo i 2 record confermati,
  Piazza (12 like) prima di Via Indipendenza (3 like);
- /directory?sort=useful&state=never (IT): 3 record mai confermati;
- /mappa?focus=3: popup con widget compatto 12/5/1/0/0 + CTA;
- home IT: "Verificati dalla comunità" + card "Pubblica subito una nuova
  telecamera osservata";
- /segnala: copy "Your report is published immediately" (il form è dietro il
  write gate: screenshot della parete login, comportamento coperto dai test
  DOM).

Screenshot (archiviati in `~/osdb-archive/screenshots/design/community-ui/`, 8 PNG, EN+IT).

## 10. Limiti e note

- La moderazione legacy (approve/reject/appeals) sopravvive SOLO per le
  emergenze legali (ADR §8): i suoi test E2E creano i record pending via il
  writer legacy, non più tramite la route POST (che ora pubblica subito).
- `VerificationWidget`/`StarConfirmButton` restano nel repo (componenti
  legacy, account page) ma non sono più montati nel record page: i test
  standalone restano, i test record-detail sono stati convertiti al nuovo
  widget.
- Il seed demo (`scripts/demo-cameras.sql`) non include azioni/eventi: gli
  screenshot usano un DB locale arricchito a mano (non tracciato).
