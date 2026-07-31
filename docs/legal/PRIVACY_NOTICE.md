# Privacy notice (draft)

Status: **DRAFT — pre-launch.** This document is the draft art. 13 GDPR
information notice. It must be completed with the final controller identity
and contact, reviewed by external counsel, and localized (Italian + English)
before publication. It is product guidance, not legal advice.

---

## 1. Who we are (controller)

OpenSurveillanceDB is an open, non-commercial civic database that documents
**visible public surveillance infrastructure** (cameras mounted in public
spaces). It does not provide video feeds, tracking tools, or advice on
avoiding lawful surveillance.

- Controller: [TO BE CONFIRMED before launch — project maintainers / legal
  entity, see DEPLOYMENT.md "Preconditions for a public environment"].
- Data protection contact (DPO / privacy team): [TO BE CONFIRMED —
  placeholder: privacy@…], one month response time, see section 7.
- Representative: not applicable while the controller is established in the
  EU/EEA.

## 2. What we process, why, and on which legal basis

| Processing | Data | Purpose | Legal basis |
| --- | --- | --- | --- |
| Publishing records of visible public surveillance infrastructure | Record fields in DATA_MODEL.md (`title`, `kind`, generalised location, `description`, `source`, `updated`, `status`; `manufacturer`/`observedOn` only with an explicit per-field moderator opt-in) | Civic transparency about visible surveillance in shared spaces; public research; accountability | Art. 6(1)(f) GDPR — legitimate interest of civic transparency, assessed in LAWFUL_BASIS.md |
| Receiving community reports | Report fields (`title`, `kind`, location, optional `address`, `notes`, optional `manufacturer`, optional `observedOn`; no identity required) | Moderation and verification of submissions; abuse prevention | Art. 6(1)(f) GDPR — legitimate interest in operating a moderated public-interest service |
| Handling correction / removal requests | `correction_requests`: issue type, message, **optional contact** (e.g. email) | Processing rights requests and corrections | Art. 6(1)(c) GDPR (obligations under GDPR arts. 12–22) and 6(1)(f) (managing requests) |
| Moderation | Moderation audit events with **pseudonymous** reviewer identifier; never emails in logs | Accountability, internal audit of decisions | Art. 6(1)(f) GDPR and art. 32 GDPR (security) |
| Service operation | Technical logs (aggregate), rate limiting | Security, availability | Art. 6(1)(f) GDPR |

We do **not** use the data for behavioural advertising, profiling, or automated
decision-making (art. 22 GDPR).

## 3. What we do NOT collect or publish

- No video, live streams, credentials, network information, or control
  interfaces.
- No private-home cameras or cameras pointing into private interiors.
- No personal names, faces, vehicle plates, or precise operational details
  (PRIVACY_AND_SAFETY.md, MODERATION.md).
- Submissions are stored as `pending` and are **never public** until a
  moderator approves them (ADR 0001).

## 4. Where data goes (recipients and transfers)

- **Cloudflare, Inc.** — hosting (Workers) and database (D1). Processor under
  the Cloudflare Data Processing Addendum (DPA v6.3, June 2025), which
  incorporates the EU Standard Contractual Clauses (2021/914); Cloudflare
  participates in the EU–US Data Privacy Framework. D1 data-location
  configuration (location hints / jurisdiction constraints) must be set for
  the EU before production. See PROCESSOR_REGISTER.md.
- **OpenAI** — authentication of moderators ("Sign in with ChatGPT", scaffold
  in `app/chatgpt-auth.ts`): OpenAI receives the moderator's email and full
  name in request headers (`oai-authenticated-user-*`). OpenAI acts under its
  Data Processing Addendum. These headers are **never logged** by the
  application. This flow is not yet wired to any page and must either be
  completed with this privacy review or removed (finding H1).
- **OpenStreetMap Foundation** — map tiles are fetched by the visitor's
  browser directly from OSM servers; OSMF is an independent controller under
  its own privacy policy. The project does not send personal data to OSMF.
- **Public redistribution** — published records are exported under ODbL 1.0.
  Copies already downloaded cannot be recalled; removed records are excluded
  from future exports.

## 5. How long we keep data

Published in the retention schedule: [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md)
(90 days for unreviewed reports, 30 days for rejected reports, verification
cycle for published records, 2 years for correction requests and moderation
audit events, evidence tied to its record).

## 6. Your rights

Under GDPR arts. 15–22 you have the right to:

- **Access** (art. 15) — a copy of the personal data we hold about you.
- **Rectification** (art. 16) — correct inaccurate data, e.g. through the
  correction/request form.
- **Erasure** (art. 17) — ask for deletion of your data.
- **Restriction** (art. 18) — limit processing in the cases listed by the law.
- **Portability** (art. 20) — where the basis is consent or contract (this
  project relies on legitimate interest, so portability is limited).
- **Objection** (art. 21) — object to processing based on legitimate interest;
  we will stop unless we demonstrate compelling legitimate grounds.
- **Lodging a complaint** — with the Italian Data Protection Authority
  (Garante per la protezione dei dati personali, garanteprivacy.it) or the
  supervisory authority of your residence (art. 77 GDPR).

## 7. How to exercise rights and response times

- Use the correction/request form on the site, or contact the privacy contact
  in section 1.
- We may ask for reasonable identity verification when we have doubts about
  your identity (art. 12(6)); we will not ask for more information than
  necessary.
- We respond **within one month** (art. 12(3)), extendable by two further
  months with a notification of the delay.
- Urgent privacy/safety reports: hidden within 24 hours, reviewed promptly
  (MODERATION_SLA.md).

## 8. Security

We apply appropriate technical and organisational measures (art. 32): TLS in
transit, least-privilege access to moderation data, secrets outside source
code, rate limiting and authentication before real submissions (to be
completed — findings H1/H2), pseudonymous reviewer identifiers, and encrypted
backups.

## 9. Changes to this notice

The notice is versioned in the repository (`docs/legal/`). Material changes
are announced in the project changelog before taking effect.

---

### Localization and completion checklist (before launch)

- [ ] Final controller identity and privacy contact (DEPLOYMENT.md precondition).
- [ ] Italian localization of this notice (primary jurisdiction).
- [ ] Independent legal review.
- [ ] Link from the site footer and from the data export notices.
