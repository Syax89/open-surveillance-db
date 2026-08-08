# Check-report — R2 photo storage: PROCESSOR_REGISTER + PRIVACY_NOTICE § 5/§ 6

> **SUPERSEDED (2026-08-08):** la funzionalità di photo evidence upload è stata
> **rimossa integralmente** per decisione del CEO — il binding R2 `PHOTOS` non
> esiste più (`wrangler.jsonc`), la tabella `photos` è dropata (migration
> `0043`) e PROCESSOR_REGISTER/PRIVACY_NOTICE sono stati aggiornati alla
> realtà senza foto. Gli oggetti R2 esistenti restano conservati (nessun
> delete sul bucket); questo report resta come record storico al 2026-08-01.

**Autore:** Rosa (DPO / Legal & Privacy Officer)
**Data:** 2026-08-01
**Oggetto:** allineamento di `docs/legal/PROCESSOR_REGISTER.md` e `docs/legal/PRIVACY_NOTICE.md` (§ 5 recipients, § 6 trasferimenti) al fatto che il bucket Cloudflare **R2 `PHOTOS`** è attivo su `main` (PR #64, STATUS gap #3).
**Task kanban:** t_c5a24a92 (GAP 3 dell'audit legale t_1de55bfb)
**Riferimento a monte:** `docs/legal/REVIEW_TERMS_CODE_COHERENCE_2026-08-01.md` — l'audit di coerenza codice↔termini/privacy dichiarava "R2 null"; superato da PR #64 (`3ead75e`).

---

## 1. Sintesi

PR #64 ha reso **attivo** lo storage R2 delle foto (bytes EXIF-stripped in R2, metadata in D1), ma il registro dei processori dichiarava "No R2 in use (`hosting.json` `r2: null`)" e l'informativa menzionava solo Workers + D1. Dichiarare "R2 null" quando R2 è in uso è un **errore materiale** rispetto ad artt. 13(1)(e)/(f), 28 e 30 GDPR: registro e informativa devono riflettere i fornitori e le categorie di dati reali.

**Verdetto:** registro e informativa allineati. Nessuna modifica alla logica foto (già implementata e testata in PR #64). Un solo dato tecnico resta da confermare (regione/giurisdizione del bucket R2 — vedi § 4): è input del CTO (ada), non legale.

---

## 2. Pratica verificata (codice su main, post PR #64)

| Aspetto | Rilievo |
|--------|--------|
| Binding | `wrangler.jsonc` → `r2_buckets: [{ binding: "PHOTOS", bucket_name: "opensurveillancedb-photos" }]` |
| Flusso | `POST /api/photos` → allowlist JPEG/PNG/WebP → limiti ≤10 MB/4096 px → `stripImageMetadata` fail-closed (EXIF/XMP/IPTC) → bytes sanitizzati in R2, **metadata only in D1** (`db/photos.ts`); `storage_key` mai esposto |
| Confine pubblico | Foto mai pubbliche finché moderatore approva con `redaction_confirmed = 1` + camera pubblica (`getPublicPhoto`), altrimenti 404 |
| Retention | Foto legate al record (RETENTION_SCHEDULE.md R6); la cancellazione del record deve includere gli oggetti R2 (job di retention — owner ada, cfr. § 3 di RETENTION_SCHEDULE) |
| File obsoleti | `.openai/hosting.json` **non esiste più nel repo**: era scaffold template leftover ed è stato rimosso (DEPLOYMENT.md); la frase `"r2": null` sopravvive solo come citazione testuale in vecchi doc (riga PR1 pre-PR #64, RETENTION_SCHEDULE.md R10, ADR 0005). Fonte di verità: `wrangler.jsonc` `r2_buckets` |
| Regione bucket | **NON dichiarata** in `wrangler.jsonc`: la giurisdizione/location R2 si imposta a creazione del bucket (CLI/dashboard), non nel binding. Default Cloudflare R2 = distribuzione multi-region senza garanzia di residenza EU; la **jurisdictional restriction EU** è immutabile una volta impostata |

## 3. Modifiche incluse nel PR

| File | Modifica | Perché |
|------|----------|--------|
| `docs/legal/PROCESSOR_REGISTER.md` | **PR1**: servizi + R2 (`PHOTOS`); "Data processed" ora include i bytes foto (EXIF-stripped, ≤10 MB/4096 px) con metadata in D1 e nota che `hosting.json r2: null` è superato da `wrangler.jsonc`; "Transfer & residency": regione R2 non dichiarata → da confermare con il CTO (default multi-region, EU pinning consigliato); DPA esteso esplicitamente a R2 (stesso DPA v6.3/SCC 2021/914/DPF); Status: region pinning (D1 `weur` + R2 jurisdiction). **§ 2 TIA**: supplementary measures includono R2 (solo bytes strippati, retention R6, nessun backup export di D1 su R2 — l'affermazione "R2 null" è superata). **§ 3**: nuovo bullet "Photo storage hygiene" (delezione record ⇒ delezione oggetti R2); bullet residency esteso a R2; bullet backup chiarito (R2 = solo foto attive, non backup target). **§ 4**: nuovo open item "Confirm the R2 photo bucket region/jurisdiction with the CTO (ada)". | Art. 28/30 GDPR: il registro deve riflettere i processori e i dati reali; art. 32: sorveglianza sulla residenza dei dati. |
| `docs/legal/PRIVACY_NOTICE.md` | **§ 5**: bullet Cloudflare esteso (Workers + D1 + **R2** foto, solo bytes strippati, metadata in D1, regione da confermare con il CTO/EU pinning consigliato); **§ 6**: supplementary measures aggiornate con R2; **§ 10**: nuovo open item sulla regione R2; **version** 0.3 → 0.5 (con nota di coordinamento su PR #82 che porta la versione a 0.4 per § 3/§ 4) | Art. 13(1)(e)/(f) GDPR: l'informativa deve elencare i destinatari e i trasferimenti reali; art. 12: informazioni corrette e trasparenti. |
| `docs/legal/REVIEW_R2_REGISTER_PRIVACY_2026-08-01.md` | Questo check-report | Deliverable del task; standard di coerenza già adottato (check-report del 2026-08-01). |

**Non modificati (intenzionalmente):** logica foto, TERMS_OF_USE.md, bundle web `en|it.ts`, RETENTION_SCHEDULE.md (R6/R10 — scope di t_e21c6f11 e PR #84), § 3/§ 4/§ 10 checkbox dell'informativa già trattate da PR #82/#84.

## 4. Open item (input tecnico, owner ada)

- **Regione/giurisdizione del bucket `opensurveillancedb-photos`:** da confermare via `wrangler r2 bucket list` / dashboard Cloudflare. Se i bytes foto sono trattati come dati personali (possono contenere dati incidentali anche dopo stripping/redazione), è raccomandato pinare la **jurisdictional restriction EU**; essendo immutabile a bucket creato, l'eventuale pinning richiede nuovo bucket + migrazione (decisione tecnica di ada). La conferma è richiesta tramite task kanban figlio (assignee ada) e la risposta andrà annotata in PROCESSOR_REGISTER § 4 / PRIVACY_NOTICE § 10 (follow-up PR).

## 5. Note di coordinamento

- `docs/legal/RETENTION_SCHEDULE.md` R10 contiene ancora la frase "R2 is not used (`hosting.json` `r2: null`)": è nel file di competenza di **t_e21c6f11** (retention foto, R6 estesa) — il task estenderà R6 e PRIVACY § 7; la correzione di R10 va inclusa lì (o in una follow-up) con lo stesso criterio: R2 è usato solo per foto, non come target di backup.
- PR #82 (t_9ac86115) e PR #84 (t_5e408bd6) toccano la stessa PRIVACY_NOTICE.md (rispettivamente § 3/§ 4/§ 10 e checkbox § 10) su rami paralleli: conflitti di merge banali sul header version, da risolvere dal reviewer.
- Nessun blocco legale pre-lancio: le dichiarazioni ora corrispondono alla pratica; resta il pinning/verifica regione R2 come open item pre-launch.

---

*Documento di revisione: non è consulenza legale; richiede review di un counsel esterno prima del lancio (come da disclaimer in calce ai deliverable).*
