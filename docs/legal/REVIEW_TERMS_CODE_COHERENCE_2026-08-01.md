# Check-report finale — coerenza TERMS_OF_USE v0.2 / PRIVACY_NOTICE vs. codice reale (STATUS gap #4)

> **SUPERSEDED (2026-08-08):** la funzionalità di photo evidence upload è stata
> **rimossa integralmente** per decisione del CEO — i riferimenti all'upload
> (riga A2 e § 4.1/§ 5.5) non descrivono più il sistema. Questo check-report
> resta come record storico dell'audit al commit `71c510b`.
> **Nota aggiuntiva 2026-08-08:** il "ChatGPT sign-in / OpenAI" citato è stato **rimosso** — i provider reali sono **GitHub / Google OIDC** (PRIVACY_NOTICE § 3.1/§ 5/§ 6, PROCESSOR_REGISTER.md PR5/PR6); le righe A1/TERMS su "moderator identity" vanno lette secondo il modello attuale (moderatori = contributor verificati con ruolo, nessun provider separato).

**Autore:** Rosa (DPO / Legal & Privacy Officer)
**Data:** 2026-08-01
**Oggetto:** review finale di coerenza tra i termini pubblici (TERMS_OF_USE.md v0.2, PRIVACY_NOTICE.md v0.3) e le pratiche implementate nel repo `Syax89/open-surveillance-db` @ main (commit 71c510b).
**Task kanban:** t_feb9c666 (STATUS gap #4)
**Nota di aggiornamento (2026-08-01, post-audit):** la riga A2 è **superata** dalla PR #64 (commit `3ead75e`) che ha attivato l'upload foto; l'allineamento dei documenti è trattato nel task t_9ac86115 e verificato in `docs/legal/REVIEW_PHOTO_UPLOAD_TERMS_ALIGNMENT_2026-08-01.md`.

---

## 1. Sintesi

I termini e la privacy notice sono **sostanzialmente coerenti** con il codice su auth, upload e correction. Sono stati trovati e corretti **tre scostamenti**:

1. **Coordinate pubbliche (rischio privacy — CORRETTO):** i termini (TERMS §8.4) e la privacy notice (§4) promettono coordinate pubblicate arrotondate a **~4 decimali (~10 m)**, con posizione esatta visibile solo ai moderatori. Il codice esponeva invece le coordinate **grezze** (lat/long interi dal DB) nel JSON API, CSV, GeoJSON e `toFixed(5)` (~1 m) in tutte le viste pubbliche. **Fix applicato:** `roundPublicCoordinate()` (4 decimali) al confine di lettura pubblico in `db/cameras.ts` (`listPublicCameras`, `getPublicCameraById`); UI pubblica allineata a 4 decimali. La moderation mantiene la posizione esatta (come previsto dai termini).
2. **Retention dichiarata ma non enforceata (rischio informativo — CORRETTO):** i termini presentavano la cancellazione a 30 gg (R2) e il rinnovo 12 mesi (R3) come operativi, ma l'enforcement automatico (`db/retention.ts` + cron) non esiste: RETENTION_SCHEDULE.md §3 lo marca già come follow-up (assignee: Ada). **Fix applicato:** TERMS §5.1, §11.2, §15 e PRIVACY_NOTICE §7 ora qualificano la retention come policy in vigore con enforcement automatico **pre-launch da implementare** (open item tracciato, owner Ada).
3. **Correction/removal form (CONFERMATO):** il form esiste ed è linkato — sezione `#correction` in home page (`app/page.tsx`), collegata da 2 link interni (camera card, duplicate alert) e 1 dalla record page (`/#correction`); POST `/api/corrections` con rate limit, input limits e campo contact. **Fix applicato:** TERMS §6.2 ora cita il form in-app oltre all'email di contatto.

**Verdetto:** i termini sono pronti come draft pre-launch. Nessun blocco legale residuo: le uniche voci aperte sono già tracciate nel §15 (acceptance mechanics, enforcement retention, link UI ai documenti legali — vedi § 4). Verificata anche la coerenza con la **PR #57 (auth contributori, ADR 0013)** — vedi § 2 (A7) e § 4 (item 6).

---

## 2. Matrice di verifica pratica ↔ dichiarazione

| # | Pratica (codice) | Dichiarazione nei termini / privacy | Esito | Note |
|---|------------------|-------------------------------------|-------|------|
| A1 | **Auth moderatori:** `/moderation` e `/api/moderation` gated al worker edge con Basic auth o bearer token, **fail-closed** (nessuna credenziale ⇒ rifiuto); dashboard richiede ChatGPT sign-in (`app/chatgpt-auth.ts`). Identità moderatore mai loggata/stored (R8). | TERMS §4.3 (divieto accesso a queue non pubbliche); PRIVACY_NOTICE §3 (moderator identity via OpenAI, mai stored); RETENTION R8. | ✅ Coerente | Il gate fail-closed impedisce l'esposizione accidentale della queue di moderazione anche su host mal configurati. |
| A2 | **Upload / submit:** `POST /api/cameras` crea solo record `pending` (ADR 0001); **nessun endpoint di photo/evidence upload all'epoca dell'audit (commit 71c510b)**. | TERMS §4.1 ("evidence uploads are not enabled yet"); §5.1 (nessuna garanzia di pubblicazione, ingresso come `pending`). | ✅ Coerente *all'epoca* → ⚠️ **SUPERSEDED 2026-08-01** | **Nota post-audit:** il 2026-08-01 la **PR #64** (commit `3ead75e`, "image upload with secure storage, EXIF stripping, moderation + redaction gate") ha attivato `POST /api/photos`. La dichiarazione "evidence uploads are not enabled yet" era vera su `71c510b`, è **falsa su `main` da PR #64**. Allineamento completato nel task t_9ac86115: TERMS §4.1/§5.5, PRIVACY_NOTICE §3/§4, bundle web `app/lib/legal/en.ts`/`it.ts`, `docs/OPEN_SOURCE.md`. Coherence check aggiornato: `docs/legal/REVIEW_PHOTO_UPLOAD_TERMS_ALIGNMENT_2026-08-01.md`. |
| A3 | **Retention:** nessun job automatico; `db/retention.ts` inesistente; nessun cron trigger in `wrangler.jsonc`; `runFreshnessSweep` esiste ma non è schedulato da nessun handler (`worker/index.ts` ha solo `fetch`). | TERMS §5.1/§11.2 (cancellazione 30 gg, rinnovo 12 mesi); RETENTION_SCHEDULE R1-R3. | ⚠️ → ✅ **Corretto nel PR** | I termini presentavano come operativa una policy non enforceata. Ora §15 traccia l'implementazione (owner Ada) e i termini qualificano lo stato. |
| A4 | **Correction/removal:** form `#correction` in home + `POST /api/corrections` (rate-limited, 400/429/503, input limits, campo contact ≤180 char); coda `correction_requests` in moderation; nessuna esposizione pubblica della coda. | TERMS §6.2 (richiesta via email entro 30 gg); PRIVACY_NOTICE §3 (contact details); RETENTION R4 (2 anni). | ✅ Coerente | Il form è linkato (home: camera card + duplicate alert; record page). TERMS ora citano entrambi i canali. |
| A5 | **Confine pubblico/privato:** `PUBLIC_CAMERA_STATUSES = ["verified","demo"]`; predicate SQL condiviso; `notes` mai esposto; revisioni legate a `getPublicCameraById`; search/nearby passano da `listPublicCameras`. | TERMS §4.3, §8; PRIVACY_NOTICE §4; ADR 0001. | ✅ Coerente | Verificato il predicate condiviso (commenti nel codice + test). |
| A6 | **Precisione coordinate:** DB salva lat/long esatti; il confine pubblico **ora** arrotonda a 4 decimali; moderation legge le colonne raw. | TERMS §8.4 (~4 decimali / ~10 m; esatta solo ai moderatori); PRIVACY_NOTICE §4. | ❌ → ✅ **Corretto nel PR** | Prima del PR: API/UI/esportazioni esponevano coordinate grezze e 5 decimali. Fix in `db/cameras.ts` + UI. |
| A7 | **Auth contributori (PR #57, ADR 0013 — OPEN):** account opzionali email+password (PBKDF2-SHA256 210k iterazioni), sessioni opache hashed (SHA-256, TTL 30 gg), CSRF double-submit; **le segnalazioni anonime restano possibili** (`contributor_id` NULL). Email normalizzata sotto unique index; nessun password hash in API. | TERMS §3.4 (nessun account richiesto, ID pseudonimo); PRIVACY_NOTICE §3; RETENTION R7. | ⚠️ → ✅ **Corretto nel PR** | Gap rilevato: R7 dichiarava "raw contact data of contributors is not collected" e PRIVACY_NOTICE §3 non elencava i dati account. Ora R7 copre account/sessioni (30 gg TTL), §3 ha 2 nuove righe (account, sessioni), TERMS §3.4/§15 aggiornati. Open item rilevato all'audit: **endpoint erasure account** mancante (FK `cameras.contributor_id` senza ON DELETE blocca la cancellazione di un contributor con report attribuiti) — ✅ **RISOLTO in PR #61** (`DELETE /api/auth/account`, de-attribution `contributor_id = NULL`, revoca sessioni; UI `/account`), vedi § 4 item 6. |

---

## 3. Modifiche incluse nel PR

| File | Modifica | Perché |
|------|----------|--------|
| `db/cameras.ts` | Aggiunta `roundPublicCoordinate()` (Math.round(v*1e4)/1e4) applicata in `listPublicCameras` e `getPublicCameraById` | Enforcement della promessa ~10 m al confine pubblico; la moderation (legge colonne raw via `db/moderation.ts`) mantiene la posizione esatta. |
| `app/page.tsx`, `app/records/[id]/page.tsx` | Rendering coordinate record pubblici da 5 a 4 decimali | Coerenza visiva e documentale con la precisione dichiarata. |
| `app/lib/search.ts` | `toFixed(5)` → `toFixed(4)` nell'haystack di ricerca | La ricerca per coordinate deve indicizzare la forma pubblicata (4 decimali). |
| `tests/search-helpers.test.mjs`, `tests/freshness-reverification.test.mjs`, `tests/publication-boundaries.test.mjs` | Aggiornati gli assert sul confine pubblico: il ritorno di `listPublicCameras` è ora `.map()` con `roundPublicCoordinate` su entrambe le coordinate | Gli static source-guard test devono riflettere il nuovo confine di arrotondamento (440/440 pass su main). |
| `docs/TERMS_OF_USE.md` | §5.1/§11.2: retention qualificata (enforcement pre-launch); §6.2: citato il form in-app; §8.4: nota enforcement; §3.4: account opzionali (ADR 0013); §15: 3 nuovi open item (retention enforcement, account erasure, link UI) | I termini devono dichiarare solo ciò che il sistema fa o si è impegnato a fare prima del lancio. |
| `docs/legal/PRIVACY_NOTICE.md` | §3: 2 nuove righe (dati account, sessioni); §4: nota enforcement rounding; §7: nota enforcement retention; §10: open item re-check auth PR | Stessa finalità di coerenza + disclosure dei nuovi dati account (ADR 0013). |
| `docs/legal/RETENTION_SCHEDULE.md` | R7: copre account/sessioni (TTL 30 gg, logout, erasure con de-attribution) | La vecchia R7 ("raw contact data is not collected") era falsa con l'arrivo di PR #57. |
| `docs/legal/REVIEW_TERMS_CODE_COHERENCE_2026-08-01.md` | Questo check-report | Deliverable del task. |

**Non modificati (intenzionalmente):** `app/components/ModerationDashboard.tsx` resta a 5 decimali (i moderatori devono vedere la posizione esatta — TERMS §8.4); gli input utente nel form di segnalazione restano a 5 decimali (il submitter fornisce la posizione che il DB salva esatta per la moderation).

---

## 4. Open items residui (già tracciati, nessuno è un blocco legale)

1. **Acceptance mechanics** (clickwrap vs browse terms) — owner Ada, già in TERMS §15.
2. **Retention enforcement** `db/retention.ts` + cron (R1/R2/R3) — owner Ada, ora esplicito in TERMS §15 e RETENTION_SCHEDULE §3.
3. **Link UI ai documenti legali** (footer TERMS/PRIVACY) — nuovo open item §15: i documenti vivono nel repo; prima del lancio pubblico vanno esposti dal sito.
4. **Giurisdizione** (§12 TERMS) — da finalizzare al lancio, come da nota in calce.
5. **ADR di adozione** dei termini e del modello di licenza in ingresso — da registrare (prossimo numero libero).
6. **Account erasure endpoint (R7)** — ✅ **RISOLTO (2026-08-01, PR #61).** Al momento dell'audit: PR #57 (auth contributori) non aveva una route di cancellazione account e la FK `cameras.contributor_id` (senza ON DELETE) bloccava l'hard delete di un contributor con report attribuiti. **Chiuso da PR #61** (`DELETE /api/auth/account`, GDPR art. 17): erasure atomica con de-attribution (`contributor_id = NULL` via `eraseContributor` in `db/auth.ts`), revoca di tutte le sessioni, risposta con conteggio report de-attribuiti; UI: pagina account (`/account`). TERMS § 15 e RETENTION_SCHEDULE R7 aggiornati di conseguenza (task t_5e408bd6).

Nessuno di questi richiede azione legale immediata: tutti sono item di implementazione/documentazione pre-launch con owner già indicati.

---

## 5. Metodologia

- Confronto manuale tra `docs/TERMS_OF_USE.md` (v0.2), `docs/legal/PRIVACY_NOTICE.md` (v0.3), `docs/legal/RETENTION_SCHEDULE.md`, `docs/decisions/0001..0012` e il codice: `db/cameras.ts`, `db/corrections.ts`, `db/moderation.ts`, `app/api/cameras/route.ts`, `app/api/corrections/route.ts`, `app/api/moderation/route.ts`, `app/api/cameras/{search,nearby,revisions}/route.ts`, `worker/index.ts` (gate auth), `app/chatgpt-auth.ts`, `app/lib/{rate-limit,input-limits,public-status,search}.ts`, `app/page.tsx`, `app/records/[id]/page.tsx`, `app/guide/page.tsx`, `wrangler.jsonc`, `scripts/demo-cameras.sql`.
- Verifica dei link del correction form nella UI (home + record page).
- Base normativa: GDPR (artt. 5, 12, 13, 14, 17, 25), D.Lgs. 196/2003; ODbL 1.0 / AGPL-3.0 / CC BY-SA 4.0 per le licenze.
- Documento di revisione: non è consulenza legale; richiede review di un counsel esterno prima del lancio (come da disclaimer in calce ai deliverable).
