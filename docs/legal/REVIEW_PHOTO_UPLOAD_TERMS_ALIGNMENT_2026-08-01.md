# Check-report — allineamento TERMS/PRIVACY all'upload foto attivo (PR #64)

**Autore:** Rosa (DPO / Legal & Privacy Officer)
**Data:** 2026-08-01
**Oggetto:** allineamento dei documenti pubblici (TERMS_OF_USE.md, PRIVACY_NOTICE.md, OPEN_SOURCE.md, bundle web `app/lib/legal/en|it.ts`) alla funzionalità di photo evidence upload attiva su `main` (STATUS gap #3, PR #64 — commit `3ead75e`).
**Task kanban:** t_9ac86115 (GAP 1+10 dell'audit legale t_1de55bfb)
**Riferimento a monte:** `docs/legal/REVIEW_TERMS_CODE_COHERENCE_2026-08-01.md` riga A2 — scritta su commit `71c510b` quando l'upload non esisteva; **superata** da PR #64.

---

## 1. Sintesi

PR #64 ha reso **attivo** l'upload di foto (`POST /api/photos`), ma i documenti pubblici dichiaravano il contrario ("evidence uploads are not enabled yet"). Nessun blocco legale: la dichiarazione era vera su `71c510b` ed è diventata falsa su `main` da PR #64. Questo PR allinea dichiarazione ↔ pratica (artt. 5(1)(a) e 12 GDPR — trasparenza e correttezza delle informazioni; stesso standard di coerenza del check-report del 2026-08-01).

**Verdetto:** documenti allineati. Nessuna modifica alla logica foto (già implementata e testata in PR #64, non toccata).

---

## 2. Pratica verificata (codice su main, post PR #64)

| Aspetto | Implementazione |
|--------|-----------------|
| Endpoint | `POST /api/photos` (raw body, `app/api/photos/route.ts`) |
| Formati ammessi | JPEG, PNG, WebP — allowlist MIME + verifica container dai magic bytes (mai fidarsi del Content-Type dichiarato) |
| Limiti | ≤ **10 MB** (`DEFAULT_MAX_PHOTO_BYTES = 10 * 1024 * 1024`), ≤ **4096 px per lato** (`DEFAULT_MAX_PHOTO_DIMENSION`); env-tunable (`PHOTO_MAX_BYTES`/`PHOTO_MAX_DIMENSION`) |
| Sanitizzazione | **EXIF/XMP/IPTC strippati al confine, fail-closed**: se il container non può essere percorso in sicurezza l'upload è rifiutato (mai stored non-stripped) — `stripImageMetadata` in `app/lib/image-metadata.ts` |
| Storage | Bytes sanitizzati in **R2** (binding `PHOTOS`, chiave opaca `photos/<uuid>.<ext>`), **metadata only in D1** (`db/photos.ts`) |
| Visibilità | Foto **mai pubbliche** finché un moderatore approva **con `redaction_confirmed = 1`** (`moderatePhoto` rifiuta l'approve senza conferma); serve anche che la camera collegata sia pubblica (`getPublicPhoto`: status `verified`/`demo` + review window); tutto il resto fallisce con 404, `storage_key` mai esposto |
| Retention | Legata al record (RETENTION_SCHEDULE.md **R6**): cancellata col record; hard-delete immediato se il record è rifiutato/rimosso |
| Altro | Rate limiting, CSRF/same-origin per attribuzione, `submissionsDisabled`, 413/415/400/429; GET `/api/photos?cameraId=N` solo foto approvate di camera pubblica (404 altrimenti) |

## 3. Modifiche incluse nel PR

| File | Modifica | Perché |
|------|----------|--------|
| `docs/TERMS_OF_USE.md` | § 4.1: rimossa la nota "evidence uploads are not enabled yet", ora descrive l'upload attivo con redazione pre-upload e gate di moderazione; nuovo **§ 5.5 "Photo evidence"** (formati, limiti 10 MB/4096 px, stripping fail-closed, R2/D1, `redaction_confirmed = 1`, R6, storage key mai esposto); § 15: voce [x] upload implementato/documentato + retention enforcement estesa a R6; version bump 0.2 → 0.3 | La dichiarazione era falsa; i termini devono dichiarare solo ciò che il sistema fa |
| `docs/legal/PRIVACY_NOTICE.md` | § 3: riga "Evidence" riscritta come "Photo evidence" (formati/limiti, stripping, R2/D1, R6, gate redaction); § 4: nuovo bullet negative scope sulle foto mai pubbliche senza moderazione + redaction; § 10: voce [x] disclosure allineata; version bump 0.3 → 0.4 | Trasparenza art. 12 GDPR: l'informativa deve descrivere il trattamento foto effettivo |
| `docs/OPEN_SOURCE.md` | § "Contributor promise": frase "Evidence uploads require … before they are enabled" → upload foto **attivi** con stripping, storage privato, gate di moderazione | Stessa dichiarazione obsoleta citata da TERMS § 4.1 |
| `docs/legal/REVIEW_TERMS_CODE_COHERENCE_2026-08-01.md` | Righe A2/header annotate: audit su `71c510b`, superato da PR #64 (`3ead75e`); rimando al presente check-report | L'audit non può restare "✅ Coerente" su un fatto poi cambiato |
| `docs/legal/REVIEW_PHOTO_UPLOAD_TERMS_ALIGNMENT_2026-08-01.md` | Questo check-report | Deliverable del task |
| `app/lib/legal/en.ts`, `app/lib/legal/it.ts` | Specchio web delle stesse sezioni: terms § 4.1 (rimossa nota obsoleta), terms § 5 (nuovo punto photo evidence), privacy § 3 (riga photo evidence), privacy § 4 (bullet foto), licenses § 5 (upload attivi); versionNote allineate | Le pagine pubbliche `/termini`, `/privacy`, `/licenze` devono dire la stessa cosa dei doc canonici (parità EN/IT via `LegalContent`) |

**Non modificati (intenzionalmente):** logica foto (`app/api/photos`, `db/photos.ts`, `app/lib/image-metadata.ts`), UI copy dell'upload (`app/lib/i18n`), test esistenti — tutto già implementato e verde in PR #64.

## 4. Verifica

- `npx tsc --noEmit` — parità `LegalContent` EN/IT (chiavi identiche) ✅
- `npm run lint` ✅
- `npm test` (build + suite `tests/*.test.mjs`, incl. `legal-pages.test.mjs`, `api-photos.test.mjs`, `photo-ownership.test.mjs`) ✅
- CI GitHub Actions: job `ci` (lint · typecheck · test · build) + `db-migration-smoke` ✅ (atteso 4/4 su main)

## 5. Open items residui (già tracciati, nessuno nuovo)

- **Retention enforcement automatico (R1/R2/R3/R6):** `db/retention.ts` + cron — owner Ada, TERMS § 15.
- Account erasure endpoint (R7) — owner Ada, TERMS § 15.
- Mailbox privacy attiva (`privacy@opensurveillancedb.org`); giurisdizione, SCC version, counsel esterno — PRIVACY_NOTICE § 10.

---

*Documento di revisione: non è consulenza legale; richiede review di un counsel esterno prima del lancio (come da disclaimer in calce ai deliverable).*
