# QA Report #6 — Copy e contenuti EN/IT (t_0b0fa848)

**QA Engineer:** Marie (OpenSurveillanceDB Ltd.)
**Data:** 2026-08-03
**Base:** `main` @ 16503a3 (fix(ui): IT layout — hero/record h1 leading collide on long Italian headlines, #271)
**PR:** (feature/qa-copy-t_0b0fa848)

---

## 0. Sintesi esecutiva

QA a tutto campo su copy e contenuti, come richiesto dalla CEO ("ci sono ancora
tanti bug, ricerca approfondita, almeno 5 finding"). **6 finding** (1 alto,
3 medio, 2 basso) + 2 note. Il sistema i18n è in ottima salute strutturale
(parità chiavi EN/IT 1160/1160, zero stringhe inglesi residue nel bundle IT,
zero link rotti nell'app e nei docs): i bug reali stanno nelle **contraddizioni
tra copy legale/pubblica e codice implementato**, nei **fallback non localizzati**
e nel **framing "prototype" residuo** rimasto dopo la de-prototypizzazione della
mappa (feedback CEO 2026-08-02).

| # | Severità | Pagina / superficie | Sintesi |
|---|---|---|---|
| F1 | **ALTA** | `/termini` (EN+IT), README, ADR 0020, privacy docs | I Termini promettono segnalazioni anonime; il write-gate richiede un account verificato |
| F2 | MEDIA | `/login`, `/correggi`, `/mappa`, `/directory`, `/reset-password`, `/verify-email` | 6 fallback Suspense "Loading…" hardcoded in inglese |
| F3 | MEDIA | `/moderation`, `/accessibility`, README | Framing "prototype" incoerente dopo la rimozione sulla mappa |
| F4 | MEDIA | `/directory`, `/records/[id]` (record demo) | Valori fact demo hardcoded in inglese ("Prototype seed", "Demo data") in UI italiana |
| F5 | BASSA | `/login`, `/register`, `/moderation` | Nessun document title per-pagina (fallback generico), incoerente con le pagine auth sorelle |
| F6 | BASSA | Home (aria-label/stats) | Key i18n stale `prototypeStats` / `openPrototype` nel bundle home |

**Verdetto:** report consegnato come richiesto; i fix di copy (F1, F3) richiedono
una decisione di prodotto o allineamento ai fatti implementati — vedi §7.

---

## 1. Metodo e copertura

- Confronto strutturale **EN vs IT** su tutti i 19 bundle i18n (`app/lib/i18n/*.ts`,
  1160 foglie per lingua): parità chiavi, valori identici, residui inglesi,
  placeholder, template `{}` letterali, punteggiatura sbilanciata, doppie parole.
- Confronto **EN vs IT** sui bundle legali (`app/lib/legal/en.ts` / `it.ts`, 20
  foglie): stessi controlli.
- **Crawl link**: tutti gli href interni di `app/**` (25 href) risolti contro le
  route reali; tutti i link relativi dei 30+ file markdown di `docs/` + radice
  risolti contro il filesystem.
- **Scan contenuti**: pattern "prototype/dev/soon/beta/launch/TODO/lorem",
  date, doppie parole, spazi prima di punteggiatura, virgolette sbilanciate.
- Verifica incrociata **copy ↔ codice** per le affermazioni fattuali (write-gate,
  seed demo, deploy) con lettura diretta di `app/lib/write-gate.ts`,
  `app/api/cameras/route.ts`, `app/components/tools/SegnalaTool.tsx`,
  `app/lib/records.ts`, `scripts/demo-cameras.sql`, `wrangler.jsonc`.

### Cosa è risultato pulito (nessun finding)

- **Parità chiavi EN/IT perfetta**: 1160/1160 foglie identiche come set, 0
  mancanti, 0 extra (vincolo `Translation<typeof en>` rispettato ovunque).
- **0 valori IT "inglesi"** (score stopword ≥ 3 su 1160 foglie).
- **0 link rotti** nell'app (le 7 "mancate" dello script sono route-group
  `(tools)` — URL-neutrali — o query/asset: `/api/cameras?format=…`,
  `/favicon.svg`).
- **0 link rotti nei docs** (le 2 segnalazioni su `docs/SITEMAP.md` sono esempi
  `[label](url)` dentro code fence).
- **0 refusi grossolani**: nessuna doppia parola, doppio spazio, virgolette o
  parentesi sbilanciate, template `{x}` letterali nei bundle.
- **Seed demo onesto e ben etichettato**: `scripts/demo-cameras.sql` è opt-in
  (`npm run db:seed`), idempotente, con record dichiaratamente fittizi; il
  badge di stato è localizzato (`status.ts`: `demo` → "Record illustrativo").
- **Error page 404/500** (`app/not-found.tsx`, `app/error.tsx`,
  `ErrorPage.tsx`): completamente localizzate, incl. il `<title>` via effect.

---

## 2. Finding dettagliati

### F1 [ALTA] — I Termini d'uso promettono segnalazioni anonime; il write-gate richiede un account verificato

**Pagina:** `/termini` (EN e IT) + documentazione canonica + ADR.
**File:riga (copy che promette l'anonimato):**
- `app/lib/legal/en.ts:316` — *"No account is required to browse **or to
  report**: submissions may be anonymous, or attributed to an optional free
  contributor account…"* (testo renderizzato su `/termini`)
- `app/lib/legal/it.ts:319` — *"Non è richiesto alcun account per navigare
  **né per segnalare**: gli invii possono essere anonimi…"*
- `docs/TERMS_OF_USE.md:29` (copia canonica del repo)
- `docs/PRIVACY_AND_SAFETY.md:21` — *"Browsing and reporting never require an
  account: anonymous submissions remain possible by design"*
- `README.md:39` — *"Anonymous submissions remain possible by design (ADR
  0013)"*
- `docs/decisions/0020-multi-method-authentication.md:63-64` — *"Anonymous
  browsing and reporting remain possible and unchanged (ADR 0013 decision 4)"*
- `docs/legal/PRIVACY_NOTICE.md:36,54` — righe "Contributor (authenticated or
  anonymous)" / "submitted anonymously"

**File:riga (realtà implementata):**
- `app/lib/write-gate.ts:11-14` — ogni write che crea/muta dati pubblici
  richiede sessione **VERIFICATA**: `POST /api/cameras`, `POST /api/corrections`,
  `POST /api/photos`, `PUT/DELETE /api/cameras/[id]/confirmation` →
  anonimo **401**, non verificato **403**
- `app/api/cameras/route.ts:201-204` — intake solo per "VERIFIED contributor"
- `app/components/tools/SegnalaTool.tsx:24-26,37` — anonimi/non verificati
  ricevono il `WriteGateWall` (muro login/verifica bilingue) al posto del form

**Contraddizione diretta tra pagine pubbliche:** `/guide` dice il contrario dei
Termini — `app/lib/i18n/guide.ts:81` (EN) / `:214` (IT): *"Submitting a report
or a correction requires a verified contributor account"* / *"Inviare una
segnalazione o una correzione richiede un account verificato."*

**Impatto:** un utente che legge i Termini crede di poter segnalare in
anonimato e si ritrova davanti al muro di login; contraddizione tra documento
legale vincolante e comportamento reale (rischio anche di incoerenza GDPR
sull'informativa).

**Fix (allineare la copy al codice — il gate è una scelta deliberata, Fase E1):**
1. `app/lib/legal/en.ts:316` + `app/lib/legal/it.ts:319`: sostituire con
   *"A verified contributor account is required to submit a report or a
   correction. Browsing the public data never requires an account."* (stesso
   messaggio di `guide.ts`)
2. `docs/TERMS_OF_USE.md:29`, `docs/PRIVACY_AND_SAFETY.md:21`, `README.md:39`:
   idem, citando ADR 0020 (Fase E1) al posto di ADR 0013
3. `docs/decisions/0020-multi-method-authentication.md:63-64`: emendare la
   decisione (l'anonimato resta per la *navigazione*; le segnalazioni richiedono
   account verificato) — o, se la decisione di prodotto è riaprire l'anonimato,
   rimuovere il write-gate: fuori scope di questa QA
4. `docs/legal/PRIVACY_NOTICE.md:36,54`: le righe "anonymous" sulle revisioni
   vanno allineate (oggi ogni write ha un contributor verificato)

---

### F2 [MEDIA] — 6 fallback Suspense "Loading…" hardcoded in inglese

**Pagina:** tutte le pagine che usano `useSearchParams` + le auth pages client.
**File:riga:**
- `app/login/page.tsx:419` — `<Suspense fallback={<p className="loading-note">Loading…</p>}>`
- `app/register/` — nessun fallback (nessun Suspense): ok
- `app/(tools)/correggi/page.tsx:27` — "Loading…"
- `app/(tools)/mappa/page.tsx:28` — "Loading the map…"
- `app/(tools)/directory/page.tsx:30` — "Loading the directory…"
- `app/reset-password/page.tsx:24` — "Loading…"
- `app/verify-email/page.tsx:28` — "Loading…"

**Impatto:** il fallback è renderizzato in SSR **prima** dell'idratazione (e
durante il fetch client): un utente con locale IT vede "Loading…" in inglese.
È esattamente la categoria "coerenza EN/IT in TUTTE le pagine" del task.

**Nota positiva:** i bundle hanno GIÀ le stringhe localizzate
(`app/lib/i18n/auth.ts:280` `loading: "Caricamento…"`; `map.ts` ha
`loadingRecords`); il bug è solo che le pagine non le usano.

**Fix:** i file `page.tsx` sono server components → usare `getServerMessages()`
per il fallback (stesso pattern già usato per `generateMetadata`):
```tsx
const t = (await getServerMessages()).auth;
<Suspense fallback={<p className="loading-note">{t.loading}</p>}>
```
Aggiungere una chiave `loading` ai bundle `correction`/`directory`/`map` (o
riusare `common`) per `/correggi`, `/directory`, `/mappa`.

---

### F3 [MEDIA] — Framing "prototype" incoerente dopo la de-prototypizzazione della mappa

**Pagina:** `/moderation`, `/accessibility`, README.
**Contesto:** con feedback CEO 2026-08-02 la mappa è stata esplicitamente
de-framata — `app/lib/i18n/map.ts:28-29`: *"The prototype banner itself was
removed (CEO feedback 2026-08-02) — the map is no longer framed as a
prototype."* Eppure altre superfici dicono ancora "prototype":

**File:riga:**
- `app/lib/i18n/moderation.ts:13` — `returnPublic: "Return to public prototype"`
  (IT `:246` — "Torna al prototipo pubblico")
- `app/lib/i18n/moderation.ts:17` — *"This interface is for the local
  prototype only…"* (banner visibile in `/moderation`)
- `app/lib/legal/en.ts:559` — accessibility statement (pagina PUBBLICA
  `/accessibility`): *"Version 0.1 — 1 August 2026. Draft — pre-launch,
  prototype stage…"*
- `app/lib/legal/en.ts:575` — *"The current prototype implements a meaningful
  accessibility baseline…"*
- `README.md:5` — *"Current state: local working prototype…"*; `:15` —
  "## What is in this prototype"; `:85` — *"The prototype is deliberately not a
  public registry yet"*

**Nota di contesto (non è un bug a sé):** il claim "not yet a public registry"
è ancora vero (deploy di test su workers.dev/LXC, `docs/DEPLOYMENT.md:302-307`),
quindi il README non è falso in assoluto — è però **incoerente** con la scelta
di prodotto di non presentare più il prodotto come prototipo.

**Fix (una sola narrativa — raccomandato "pilot", come da `/contatti` e
GOVERNANCE):**
1. `moderation.ts:13,17` (EN+IT): `returnPublic` → "Return to public site" /
   "Torna al sito pubblico"; `intro` → "This interface is for local
   administration only…"
2. `legal/en.ts:559,575`: "Draft — pre-launch, pilot stage"; "The pilot
   implements…"
3. `README.md:5,15,85`: blockquote → "Current state: pilot deployment…"; heading
   "## What is in this pilot" (o "What is implemented")
4. Verificare le copie IT corrispondenti in `legal/it.ts` e nel resto dei docs

---

### F4 [MEDIA] — Valori fact dei record demo hardcoded in inglese (UI italiana)

**Pagina:** `/directory`, `/records/[id]` (e `/mappa` in fallback).
**File:riga:**
- `app/lib/records.ts:47-48,59-60` — seed client:
  `source: "Prototype seed"`, `updated: "Demo data"`
- `scripts/demo-cameras.sql:12,18` — stesso seed per il DB
- `app/lib/format-date.ts:20` — `"Demo data"` non è una data parsabile →
  `formatPublicDate` lo ripassa intatto

**Rendering reale in locale IT** (RecordCard → fact rows da
`directory.ts:105-106` `t.source`/`t.lastVerification`):
- "Fonte: **Prototype seed**"
- "Ultima verifica: **Demo data**"

Il badge di stato è invece localizzato (`app/lib/i18n/status.ts:21` `demo` →
"Record illustrativo"): quindi la card mostra "Record illustrativo" (IT) accanto
a "Prototype seed"/"Demo data" (EN) — incoerenza EN/IT visibile.

**Fix:**
1. Sostituire i valori seed con marcatori neutrali localizzati: es. rendere
   `source` un'etichetta via bundle (nuova chiave tipo `demoSource:
   "Seed illustrativo"` / `demoUpdated: "Dato dimostrativo"`), oppure
2. localizzare i valori in `records.ts` + `demo-cameras.sql` con un campo
   `locale` — più invasivo; la via 1 è preferibile (i dati restano grezzi, la
   presentazione è localizzata, coerente con la filosofia del progetto).

---

### F5 [BASSA] — `/login`, `/register`, `/moderation` senza document title per-pagina

**Pagina:** `/login`, `/register`, `/moderation`.
**File:riga:**
- `app/login/page.tsx` — nessuna `generateMetadata` (client component, non può
  esportarla)
- `app/register/page.tsx` — idem
- `app/moderation/page.tsx` — idem (wrapper di `ModerationDashboard`)

**Impatto:** la tab del browser mostra il title generico di root
(`common.metaTitle`, `app/lib/i18n/common.ts:16` — "OpenSurveillanceDB — Public
data about public surveillance") mentre le pagine sorelle auth
(`/account` `:15`, `/forgot-password` `:17`, `/reset-password` `:17`,
`/verify-email` `:21`) hanno title dedicati e localizzati. Incoerenza
"titoli/meta" e UX debole (due tab di login indistinguibili).

**Fix:** pattern già usato in `ErrorPage.tsx:42-44` — impostare
`document.title` client-side da bundle localizzato (`auth.loginTitle` /
`auth.registerTitle` / `moderation.title`), oppure estrarre una shell server
per queste route (più invasivo).

---

### F6 [BASSA] — Key i18n stale "prototype" nel bundle home

**Pagina:** Home (aria-label delle stats e stat "open source").
**File:riga:**
- `app/lib/i18n/home.ts:33` — `prototypeStats: "Database statistics"`
  (IT `:86` — "Statistiche del database")
- `app/lib/i18n/home.ts:36` — `openPrototype: "open source"` (IT `:89`)
- Uso: `app/components/home/Hero.tsx:24` — `aria-label={t.prototypeStats}` e
  stat `<dt>100%</dt><dd>{t.openPrototype}</dd>`

**Impatto:** nessuno funzionale (le etichette mostrate sono corrette), ma i nomi
delle chiavi sono residui del framing "prototype" rimosso (stesso tema di F3):
`prototypeStats` etichetta statistiche reali del database; `openPrototype`
etichetta "open source". Chi mantiene i bundle legge "prototype" dove non c'è.

**Fix:** rinominare le chiavi (`statsLabel` / `openSourceLabel`) con un piccolo
codemod su `home.ts` + `Hero.tsx`; nessun cambiamento visibile. In alternativa,
se si vuole evitare churn, documentare la deroga in un commento.

---

## 3. Note (non finding)

- **N1 — Title record EN-template:** `app/records/[id]/page.tsx:25` genera
  `Record #${id} — OpenSurveillanceDB` per tutte le lingue. Accettabile perché
  "Record" è un prestito d'uso comune anche in italiano, ma non è localizzato;
  se si vuole la parità totale, estrarre il prefisso nel bundle `record.ts`.
- **N2 — Categorie "prototype" nei commenti di codice:** decine di riferimenti
  "prototype" in commenti (`app/lib/authz.ts`, `app/lib/cache-purge.ts`,
  `auth-session.ts`, `passkey.ts`, ecc.) descrivono il comportamento locale.
  Non visibili all'utente; da ripulire solo quando si toccano quei file.

---

## 4. Esiti delle verifiche (prove)

| Verifica | Esito |
|---|---|
| Parità chiavi EN/IT (19 bundle, 1160 foglie) | ✅ 0 mancanti / 0 extra |
| Valori identici EN/IT | 33, tutti legittimi (nomi propri, email, "Home", "FAQ", "404"…) |
| Valori IT "inglesi" (stopword ≥ 3) | ✅ 0 |
| Placeholder / stale markers nei bundle | ✅ 0 reali (solo "temporaneamente non disponibile" legittimi) |
| Parità legale EN/IT (20 foglie) | ✅ perfetta, 0 identici, 0 inglesi |
| Link interni app (25 href) | ✅ tutti risolvibili (route-group `(tools)` + query/asset) |
| Link relativi docs (30+ file md) | ✅ 0 rotti |
| Doppie parole / spazi / punteggiatura | ✅ 0 |
| Seed demo | ✅ opt-in, idempotente, etichettato; badge stato localizzato |
| Error page 404/500 | ✅ localizzate incl. `<title>` |

---

## 5. Raccomandazioni

1. **F1 è il fix prioritario** (documento legale ≠ comportamento reale): aprire
   un task dedicato copy+legal; serve l'ok della CEO sulla direzione (allineare
   la copy al gate — raccomandato — oppure riaprire le segnalazioni anonime).
2. **F2** è un fix meccanico a basso rischio: può essere accorpato al prossimo
   pass UI.
3. **F3** richiede una decisione di framing (pilot vs prototype) poi un
   allineamento unico su README, legal, moderation.
4. **F4-F6** sono refusi di coerenza: fix rapidi in PR di copy.

Report consegnato come richiesto: **6 finding** con file:riga, pagina,
severità e fix proposto. I fix di copy (F1, F3) restano in attesa di conferma
di prodotto prima di essere applicati.
