# Privacy notice (draft — pre-launch)

- **Status:** draft for pre-launch review; controller contact details below are placeholders to be finalised at launch.
- **Legal basis:** GDPR art. 13 (data collected from data subjects) and art. 14 (data not obtained from the data subject, e.g. records sourced from official public sources); D.Lgs. 196/2003 (Codice Privacy, IT) as primary jurisdiction.
- **Version:** 0.1 (2026-07-31) — this document is a draft deliverable, not a published notice.

---

## 1. Who we are (controller)

- **Controller:** OpenSurveillanceDB Ltd. — *placeholder entity; community governance to be confirmed before launch (see GOVERNANCE.md).*
- **Privacy contact / data-protection contact:** `privacy@…` *(placeholder address)* — for any question, data-subject request, or report. Response time: see § 8.

## 2. What the service does

OpenSurveillanceDB publishes a public-interest map of **visible, public surveillance infrastructure** (e.g. cameras mounted in public streets, squares, station exteriors), reviewed by trained moderators before publication. It is a civic-transparency project, not a commercial platform: no behavioural advertising, no tracking, no sale of data.

## 3. What personal data we process

| Data | Source | Purpose | Legal basis |
|------|--------|---------|-------------|
| Report content: location, description, optional `manufacturer` / `observedOn`, private `notes` | Reporter (data subject) | Build the public record; moderation queue | art. 6(1)(f) (see LAWFUL_BASIS.md) |
| Contributor pseudonymous internal ID + submission timestamp | Reporter | Abuse prevention, provenance | art. 6(1)(f) |
| Evidence (files/links attached to a report) | Reporter | Verification of the record | art. 6(1)(f); retained private, tied to the record (RETENTION_SCHEDULE R6) |
| Correction / takedown request (contact details the requester provides, e.g. email) | Requester | Exercise of rights, harm reports | art. 6(1)(c) (GDPR arts. 15-22) and 6(1)(f) |
| Moderator identity (email, display name, full name via ChatGPT sign-in) | OpenAI (identity provider) | Authenticate moderators; separate moderation credentials (MODERATION.md) | art. 6(1)(f); **never logged or stored by the application** |
| Moderation audit entries (decision, reason code, timestamp, reviewer **pseudonym**) | The project | Accountability, appeals | art. 6(1)(f); never public (aggregate transparency reports only) |
| Published records | Moderated reports / official public sources | The public dataset (ODbL 1.0) | art. 6(1)(f) / 6(1)(e) — see LAWFUL_BASIS.md |

**Special categories (art. 9 GDPR):** none are intentionally collected. Evidence that incidentally captures identifiable people, plates, or private interiors is redacted or deleted (MODERATION.md; RETENTION_SCHEDULE R6).

**Children:** the service is addressed to adults. In Italy, submitting a report requires the age of consent for information-society services (14 years, art. 2-quinquies D.Lgs. 196/2003); other jurisdictions apply their own age thresholds.

## 4. Recipients and transfers

- **Cloudflare, Inc.** — hosting and database (Workers + D1). Processor (art. 28) under Cloudflare's DPA with EU SCCs; D1 configured for EU residency (`weur` location hint). See PROCESSOR_REGISTER.md.
- **OpenAI (ChatGPT sign-in)** — identity provider for moderators. OpenAI is an **independent controller of its own authentication service** (its privacy policy applies at sign-in); no OpenSurveillanceDB data is sent to OpenAI — we only receive the identity attributes listed in § 3. Never published, never logged.
- **Publication itself:** verified records become part of a public dataset licensed ODbL 1.0 and may be downloaded/exported (JSON/CSV/GeoJSON). This is the purpose of the service, disclosed here.
- No other recipients; no behavioural advertising; no analytics libraries.

## 5. International data transfers (Cap. V GDPR)

- Cloudflare: transfers covered by the Cloudflare DPA incorporating **EU Standard Contractual Clauses**; supplementary measures assessed for US processing (encryption in transit, EU residency for D1). Full assessment in PROCESSOR_REGISTER.md.
- OpenAI sign-in: identity attributes are exchanged with OpenAI's services; the sign-in flow is governed by OpenAI's terms/privacy policy (see above).

## 6. Retention

See the published retention schedule (RETENTION_SCHEDULE.md): pending reports 90 days; rejected 30 days; verified records subject to a review cycle; correction requests and audit entries 2 years; evidence tied to the record; backups rotated by the provider (up to 30 days point-in-time recovery).

## 7. Your rights (GDPR arts. 15-22)

You may request, free of charge:

- **Access** (art. 15) — confirmation and copy of your data.
- **Rectification** (art. 16) — correction of inaccurate data.
- **Erasure** (art. 17) — deletion, subject to the exceptions in art. 17(3) and the retention schedule.
- **Restriction** (art. 18) and **objection** (art. 21).
- **Portability** (art. 20) — where technically applicable.
- No automated decision-making, including profiling, is performed (art. 22).

**How to exercise them:** write to `privacy@…`. To protect data subjects, we may ask you to verify your identity (proportionate to the request, e.g. by confirming details only you could know or providing a copy of an ID for requests about your personal data).

**Timeline:** we respond within **1 month** (art. 12(3)); this may be extended by up to 2 further months for complex requests, with notice. If we refuse, we explain why and remind you of your right to complain.

**Complaints:** you may complain to the competent supervisory authority — in Italy, the *Garante per la protezione dei dati personali* (www.garanteprivacy.it).

## 8. Contact and monitoring

- Privacy contact: `privacy@…` — first response within 48 h, substantive response within 14 days (MODERATION_SLA).
- This notice is reviewed at launch and then at least annually, or on any material change; the version history is kept in the repository.

---

*Draft note: sections 1 and 8 contain placeholder contact data. The final notice requires confirmation of the controller entity, a monitored mailbox, and per-jurisdiction review (see LAWFUL_BASIS.md § 6) before public launch.*
