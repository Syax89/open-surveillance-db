# Privacy notice (draft — pre-launch)

- **Status:** draft for pre-launch review; decisions of 2026-07-31 applied (controller entity, data licence ODbL 1.0, coordinate precision ~4 decimals, 12-month retention renewal, privacy contact `privacy@opensurveillancedb`); monitored mailbox to be provisioned before launch.
- **Legal basis:** GDPR art. 13 (data collected from data subjects) and art. 14 (data not obtained from the data subject, e.g. records sourced from official public sources); D.Lgs. 196/2003 (Codice Privacy, IT) as primary jurisdiction.
- **Version:** 0.4 (2026-08-01) — photo evidence row (§ 3) and negative scope (§ 4) aligned with the active upload flow (PR #64): EXIF/XMP/IPTC stripping fail-closed, R2/D1 storage, moderation + redaction gate, retention R6; this document is a draft deliverable, not a published notice.

> **Disclaimer:** this document is product guidance / not legal advice. It is a draft for pre-launch review and requires external counsel review before launch.

---

## 1. Who we are (controller)

- **Controller:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy (decision 2026-07-31; governance owners in ../GOVERNANCE.md).
- **Privacy contact / data-protection contact:** `privacy@opensurveillancedb` *(dedicated mailbox — to be created before launch; final domain to be confirmed)* — for any question, data-subject request, or report. Response time: see § 8.

## 2. What the service does

OpenSurveillanceDB publishes a public-interest map of **visible, public surveillance infrastructure** (e.g. cameras mounted in public streets, squares, station exteriors), reviewed by trained moderators before publication. It is a civic-transparency project, not a commercial platform: no behavioural advertising, no tracking, no sale of data.

## 3. What personal data we process

| Data | Source | Purpose | Legal basis |
|------|--------|---------|-------------|
| Report content: location, description, optional `manufacturer` / `observedOn`, private `notes` | Reporter (data subject) | Build the public record; moderation queue | art. 6(1)(f) (see LAWFUL_BASIS.md) |
| Contributor pseudonymous internal ID + submission timestamp | Reporter | Abuse prevention, provenance | art. 6(1)(f) |
| Contributor account (email, optional display name, password hash) | Contributor (voluntary registration, ADR 0013) | Login, attribution of submissions, abuse prevention | art. 6(1)(f) — minimising: optional, pseudonymous handle, PBKDF2-SHA256 hashed password, never exposed in API responses |
| Session records (hashed token, CSRF token, timestamps) | The project (login) | Keep the contributor logged in; CSRF protection | art. 6(1)(f); token stored only as SHA-256, expires after **30 days** or on logout (RETENTION_SCHEDULE.md R7) |
| Photo evidence (JPEG/PNG/WebP uploads, ≤10 MB / 4096 px) | Reporter | Verification of the record | art. 6(1)(f); EXIF/XMP/IPTC stripped at the boundary (fail-closed), bytes in R2 with metadata only in D1, retained private and tied to the record (RETENTION_SCHEDULE.md R6); never public until a moderator approves with `redaction_confirmed = 1` |
| Correction / takedown request (contact details the requester provides, e.g. email) | Requester | Exercise of rights, harm reports | art. 6(1)(c) (GDPR arts. 15-22) and 6(1)(f) |
| Moderator identity (email, display name, full name via ChatGPT sign-in) | OpenAI (identity provider) | Authenticate moderators; separate moderation credentials (../MODERATION.md) | art. 6(1)(f); **never logged or stored by the application** |
| Moderation audit entries (decision, reason code, timestamp, reviewer **pseudonym**) | The project | Accountability, appeals | art. 6(1)(f); never public (aggregate transparency reports only) |
| Published records | Moderated reports / official public sources | The public dataset (ODbL 1.0) | art. 6(1)(f) / 6(1)(e) — see LAWFUL_BASIS.md |

**Records from official public sources (art. 14(2)(f)):** where a record is republished from an official public source (`source: official`), the data was not obtained from the data subject. The source categories are: public registers and transparency portals of public administrations (e.g. in Italy, D.Lgs. 33/2013 datasets), published public-authority documents, and other publicly accessible official sources. Such records are checked per record under the source's own legal regime (see LAWFUL_BASIS.md § 3.2).

**Voluntary provision (art. 13(2)(e)):** providing data for a report is **voluntary** — it is neither a statutory nor a contractual requirement. The only consequence of not providing it is that the report cannot be processed (or, for optional fields, that the record will carry less detail). There is no obligation to provide data, and no penalty for declining.

**Special categories (art. 9 GDPR):** none are intentionally collected. Evidence that incidentally captures identifiable people, plates, or private interiors is redacted or deleted (../MODERATION.md; RETENTION_SCHEDULE.md R6).

**Children:** the service is addressed to adults. In Italy, submitting a report requires the age of consent for information-society services (14 years, art. 2-quinquies D.Lgs. 196/2003); other jurisdictions apply their own age thresholds.

## 4. What we do NOT collect or publish (negative scope)

- **No video, live streams, credentials, network information, or control interfaces** — the project documents the *existence* of visible surveillance infrastructure, never its output or access.
- **No private-home cameras** or cameras pointing into private interiors.
- **No personal names, faces, vehicle plates, or precise operational details** (../PRIVACY_AND_SAFETY.md, ../MODERATION.md).
- **No coordinates beyond zone-level precision:** published locations are rounded to **~4 decimal places (~10 m)**; the exact location remains in the private moderation record, visible only to moderators (decision 2026-07-31; enforced at the public read boundary — `db/cameras.ts` `roundPublicCoordinate`; see ../MODERATION.md).
- **No behavioural advertising, no tracking, no sale of data**, no analytics libraries.
- **No published photo without moderation and confirmed redaction:** uploaded photos (JPEG/PNG/WebP, ≤10 MB / 4096 px) are stripped of EXIF/XMP/IPTC metadata at the boundary (fail-closed — a container that cannot be walked safely is rejected, never stored unstripped), stored with sanitised bytes in R2 and metadata only in D1, and are **never public** until a moderator approves them with `redaction_confirmed = 1` (../PRIVACY_AND_SAFETY.md; ../MODERATION.md). The storage key is never exposed.
- Submissions are stored as `pending` and are **never public** until a moderator approves them (ADR 0001). Rejected content is never published.

This negative scope strengthens the reasonable expectations of data subjects and is a material input to the art. 6(1)(f) balancing test (LAWFUL_BASIS.md § 3.1).

## 5. Recipients and transfers

- **Cloudflare, Inc.** — hosting and database (Workers + D1). Processor (art. 28) under the Cloudflare Data Processing Addendum (**DPA v6.3, June 2025**) incorporating **EU Standard Contractual Clauses (2021/914)**; Cloudflare is certified under the **EU–US Data Privacy Framework** (additional transfer ground). D1 configured for EU residency (`weur` location hint). See PROCESSOR_REGISTER.md.
- **OpenAI (ChatGPT sign-in)** — identity provider for moderators. OpenAI is an **independent controller of its own authentication service** (its privacy policy applies at sign-in); no OpenSurveillanceDB data is sent to OpenAI — we only receive the identity attributes listed in § 3. Never published, never logged.
- **Publication itself:** verified records become part of a public dataset licensed ODbL 1.0 and may be downloaded/exported (JSON/CSV/GeoJSON). This is the purpose of the service, disclosed here. Copies already downloaded cannot be recalled; removed records are excluded from future exports.
- No other recipients; no behavioural advertising; no analytics libraries.

## 6. International data transfers (Cap. V GDPR)

- Cloudflare: transfers covered by the Cloudflare DPA incorporating **EU Standard Contractual Clauses (2021/914)**; supplementary measures assessed for US processing (encryption in transit, EU residency for D1). Full assessment in PROCESSOR_REGISTER.md.
- OpenAI sign-in: identity attributes are exchanged with OpenAI's services; the sign-in flow is governed by OpenAI's terms/privacy policy (see above).

## 7. Retention

See the published retention schedule (RETENTION_SCHEDULE.md): pending reports 90 days; rejected 30 days; verified records on a **12-month renewal review cycle** (decision 2026-07-31); correction requests and audit entries 2 years; evidence tied to the record; operational logs ≤ 12 months (aggregate); backups rotated by the provider (up to 30 days point-in-time recovery). Automated enforcement of the deletion/expiry rules (R1/R2/R3) is a pre-launch implementation item (RETENTION_SCHEDULE.md § 3); until then the schedule is applied by the moderation workflow.

## 8. Your rights (GDPR arts. 15-22)

You may request, free of charge:

- **Access** (art. 15) — confirmation and copy of your data.
- **Rectification** (art. 16) — correction of inaccurate data.
- **Erasure** (art. 17) — deletion, subject to the exceptions in art. 17(3) and the retention schedule.
- **Restriction** (art. 18) and **objection** (art. 21).
- **Portability** (art. 20) — where technically applicable.
- No automated decision-making, including profiling, is performed (art. 22).

**How to exercise them:** write to `privacy@opensurveillancedb`. To protect data subjects, we may ask you to verify your identity (proportionate to the request, e.g. by confirming details only you could know or providing a copy of an ID for requests about your personal data).

**Timeline:** we respond within **1 month** (art. 12(3)); this may be extended by up to 2 further months for complex requests, with notice. If we refuse, we explain why and remind you of your right to complain.

**Complaints:** you may complain to the competent supervisory authority — in Italy, the *Garante per la protezione dei dati personali* (www.garanteprivacy.it).

## 9. Contact and monitoring

- Privacy contact: `privacy@opensurveillancedb` — first response within 48 h, substantive response within 14 days (MODERATION_SLA.md).
- This notice is reviewed at launch and then at least annually, or on any material change; the version history is kept in the repository.

## 10. Open items before launch

- [x] **Italian localization of this notice** (primary jurisdiction; GDPR art. 12(1) "clear and plain language") — published bilingually (Italian + English) as the public page `/privacy` (web adaptation of this notice; the repository copy remains canonical — see `docs/SITEMAP.md`).
- [x] Data licence: **ODbL 1.0** (decision 2026-07-31).
- [x] Publication precision: coordinates rounded to **~4 decimal places (~10 m)**; exact detail private to moderators (decision 2026-07-31).
- [x] Retention of verified records: **12 months with renewal** (decision 2026-07-31).
- [x] Correction/removal contact: `privacy@opensurveillancedb` + private form (decision 2026-07-31; mailbox to be created at launch).
- [x] Controller entity: **Simone Rondina (syax89) / OpenSurveillanceDB, Italy** (decision 2026-07-31).
- [ ] Provision the monitored mailbox `privacy@opensurveillancedb` (ops) before the address is published (ADR 0008).
- [ ] **Contributor-account processing disclosure:** the account data rows in § 3 and the session/account retention (R7) must be re-checked when the contributor-auth PR (#57, ADR 0013) lands on `main`, and the account-erasure endpoint is implemented (see TERMS § 15 open item).
- [x] **Photo evidence disclosure aligned with the active upload flow (PR #64):** § 3 (photo evidence row) and § 4 (negative scope) now describe EXIF/XMP/IPTC stripping at the boundary (fail-closed), R2 bytes + D1 metadata, the moderation/redaction gate (`redaction_confirmed = 1`), and retention R6. Coherence check: `docs/legal/REVIEW_PHOTO_UPLOAD_TERMS_ALIGNMENT_2026-08-01.md`.
- [ ] Confirm the applicable SCC version at DPA execution (new-generation SCCs announced for adoption in 2025 — see PROCESSOR_REGISTER.md open items).
- [ ] Per-jurisdiction review (see LAWFUL_BASIS.md § 6) and external counsel review.

---

*Draft note: the 2026-07-31 decisions (ODbL 1.0, coordinate precision, 12-month retention renewal, privacy contact, controller entity) are applied. The final notice still requires provisioning of the monitored mailbox, per-jurisdiction review (see LAWFUL_BASIS.md § 6), and external counsel review before public launch.*
