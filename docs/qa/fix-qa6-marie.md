# Fix QA#6 — Copy e contenuti EN/IT (t_9467ee7f)

**Worker:** Marie (OpenSurveillanceDB Ltd.)
**Data:** 2026-08-04
**Base:** `main` @ 137e64d
**Branch:** `fix/qa6-copy-t_9467ee7f`
**Origine finding:** `docs/qa/qa-copy-marie.md` (t_0b0fa848)

---

## Sintesi

Applicati i fix per tutti i **6 finding** del QA#6 (1 alta, 3 media, 2 bassa).
Le scelte di copy seguono la direzione del task: **write-gate = fatto implementato**
(F1, allineamento al codice, non riapertura dell'anonimato) e **framing unico
"project / site"** (F3), coerente con la de-prototipizzazione della mappa
(CEO feedback 2026-08-02).

## Fix applicati

### F1 [ALTA] — Termini d'uso promettevano segnalazioni anonime (falso, write gate)

La copy legale ora dichiara il comportamento reale: *browsing senza account,
**segnalazioni e correzioni con account contributore verificato** (ADR 0020,
write gate Fase E1 — anonimo 401, non verificato 403)*.

| File | Modifica |
|---|---|
| `app/lib/legal/en.ts` / `it.ts` | Sezione "Lawful purposes"/"Finalità lecite": rimosso "no account required to report / anonymous submissions"; nuovo testo con "verified contributor account (section 3.7; ADR 0020)" |
| `docs/TERMS_OF_USE.md` | § 1.4 idem (copia canonica); § 6.2 il form in-app è ora "se sei un contributore verificato" |
| `docs/PRIVACY_AND_SAFETY.md` | Riscritto claim anonimato: browsing anonimo sì, write richiede account verificato; `contributor_id` NULL solo via de-attribuzione R7 |
| `docs/legal/PRIVACY_NOTICE.md` | Tabella § 3 e § 3.1: "Contributor (authenticated or anonymous)" → "authenticated"; allineati edit-history e write-gate |
| `docs/decisions/0013-contributor-accounts-and-sessions.md` | Emendato: la decisione 4 (anonymous submissions) è **superseded per le write**; anonimo resta per browsing |
| `docs/decisions/0020-multi-method-authentication.md` | Emendato: "Anonymous browsing remains possible... Reporting and every other write now require a verified contributor account (decision 2, write gate Fase E1)"; rimosso claim "civic mission (anonymous...)" |
| `README.md` | Riga account: "A verified contributor account is required to submit reports or corrections (ADR 0020); browsing the public data never requires an account." (sostituisce "Anonymous submissions remain possible by design (ADR 0013)") |

### F2 [MEDIA] — 6 fallback "Loading…" hardcoded in inglese

Tutti i fallback Suspense sono ora localizzati via `getServerMessages()` (SSR,
risolti dal cookie locale): niente più "Loading…" inglese per utenti IT.

| File | Prima | Dopo |
|---|---|---|
| `app/login/page.tsx` | `<p>Loading…</p>` | `<p>{t.loading}</p>` (bundle `auth`, key già esistente) |
| `app/(tools)/correggi/page.tsx` | "Loading…" | `{t.loading}` — nuova key `correction.loading` |
| `app/(tools)/mappa/page.tsx` | "Loading the map…" | `{t.loading}` — nuova key `map.loading` |
| `app/(tools)/directory/page.tsx` | "Loading the directory…" | `{t.loading}` — nuova key `directory.loading` |
| `app/reset-password/page.tsx` | "Loading…" | `{t.loading}` (bundle `auth`) |
| `app/verify-email/page.tsx` | "Loading…" | `{t.loading}` (bundle `auth`) |

Chiavi aggiunte EN/IT: `correction.loading`, `map.loading`, `directory.loading`.
Parità chiavi verificata (script): 7 bundle toccati, 0 mismatch.

### F3 [MEDIA] — Framing "prototype" incoerente → "project / site"

| File | Modifica |
|---|---|
| `app/lib/i18n/moderation.ts` (EN+IT) | `returnPublic`: "Return to public prototype" → "Return to public site" / "Torna al sito pubblico"; `intro`: "local prototype only" → "local administration only" |
| `app/lib/legal/en.ts` / `it.ts` | Accessibility: "pre-launch, prototype stage" → "pre-launch, project stage"; "current prototype implements" → "current project implements"; "prototype boundaries" (guida /guide) → "moderation workflow" |
| `docs/ACCESSIBILITY_STATEMENT.md` (EN+IT) | Allineata la copia canonica (status, "local project", heading, "alternative channels (current project)", guida /guide) |
| `README.md` | "Current state: local working prototype" → "local project deployment"; "## What is in this prototype" → "## What is implemented"; "not linked from the public prototype" → "public site"; "The prototype is deliberately" → "The project is deliberately" |

### F4 [MEDIA] — Valori fact demo hardcoded in inglese (UI italiana)

Scelta (raccomandata dal QA): **i dati restano grezzi, la presentazione è
localizzata**. I seed (`records.ts`, `demo-cameras.sql`) mantengono i marcatori
neutri; ogni render mostra le nuove chiavi localizzate quando `status === "demo"`:

| File | Modifica |
|---|---|
| `app/lib/i18n/record.ts` (EN+IT) | Nuove key `demoSource` ("Illustrative seed"/"Seed illustrativo"), `demoUpdated` ("Demo data"/"Dato dimostrativo") |
| `app/lib/i18n/directory.ts` (EN+IT) | Idem (bundle usato da card e catalogo) |
| `app/records/[id]/RecordPageBody.tsx` | Fonte/Ultima verifica → `demoSource`/`demoUpdated` per record demo |
| `app/components/home/PublicDirectory.tsx` | Idem su card home + risultati place search |
| `app/components/tools/DirectoryCatalog.tsx` | Idem su `mainFacts` e righe place-active |
| `app/lib/i18n/record.ts` | `recordNote`: "clearly labelled prototype data" → "clearly labelled illustrative records" (EN+IT) |
| `app/lib/i18n/directory.ts` | `searchHelp`: "labelled prototype records" → "labelled illustrative records" (EN+IT) |

### F5 [BASSA] — /login, /register, /moderation senza meta description

Le tre route erano client component (niente `generateMetadata`). Refactor a
**thin server shell** (pattern già usato da /account, /forgot-password): il
body client è estratto in `LoginPageBody.tsx` / `RegisterPageBody.tsx` (nuovi),
la shell esporta `generateMetadata` con title + description localizzati.

| File | Modifica |
|---|---|
| `app/login/page.tsx` | Server shell: `title = loginTitle`, `description = loginMetaDescription`, `robots: noindex`; Suspense fallback localizzato |
| `app/login/LoginPageBody.tsx` | (nuovo) body client estratto, codice invariato |
| `app/register/page.tsx` | Server shell: `title = registerTitle`, `description = registerMetaDescription`, `robots: noindex` |
| `app/register/RegisterPageBody.tsx` | (nuovo) body client estratto, codice invariato |
| `app/moderation/page.tsx` | `generateMetadata`: `title = moderation.title`, `description = moderation.intro`, `robots: noindex` |
| `app/lib/i18n/auth.ts` (EN+IT) | Nuove key `loginMetaDescription`, `registerMetaDescription` |

### F6 [BASSA] — Key i18n stale "prototype" in home

| File | Modifica |
|---|---|
| `app/lib/i18n/home.ts` (EN+IT) | `prototypeStats` → `statsLabel`; `openPrototype` → `openSourceLabel` |
| `app/components/home/Hero.tsx` | `aria-label={t.statsLabel}`; `{t.openSourceLabel}` |

Nessun cambiamento visibile; nessun uso residuo delle vecchie chiavi (verificato
con grep).

---

## Verifiche eseguite

| Verifica | Esito |
|---|---|
| Parità chiavi EN/IT (7 bundle toccati: auth, correction, directory, home, map, moderation, record) | ✅ 0 mismatch (script su `app/lib/i18n/*.ts`) |
| Parità foglie bundle legali (en.ts/it.ts) | ✅ 144/144 |
| Frasi chiave F1/F3 presenti in EN e IT (legal) | ✅ 4/4 per lingua |
| Usi residui `prototypeStats`/`openPrototype` | ✅ 0 |
| Rendering `camera.source` non guardato per demo | ✅ solo `CameraQueueItem` (interfaccia admin locale, fonte grezza voluta) |
| Seed demo grezzo (`records.ts`, `demo-cameras.sql`) | ✅ invariato di proposito (presentazione localizzata) |

## Note

- **N1** (title record EN-template) non toccato: fuori scope dei 6 finding.
- **N2** (commenti "prototype" nel codice): da ripulire quando si toccano quei
  file, come da raccomandazione QA.
- Il frammento in `CameraQueueItem.tsx` (`camera.source || t.communityReport`)
  resta grezzo: è la coda di moderazione (admin locale), non una superficie
  pubblica EN/IT.
