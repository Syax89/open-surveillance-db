# Lawful-basis assessment (outline)

- **Status:** draft outline for pre-launch review (ADR 0002)
- **Owner:** Rosa (Legal & Privacy Officer / privacy contact)
- **Jurisdiction (primary):** European Union — GDPR (EU) 2016/679; Italy — D.Lgs. 196/2003 (Codice Privacy, as amended by D.Lgs. 101/2018)
- **Documents this supports:** PRIVACY_NOTICE.md, PROCESSOR_REGISTER.md

> **Disclaimer:** this document is product guidance / not legal advice. It is a draft for pre-launch review and requires external counsel review before launch.

---

## 1. Preliminary question: is the public dataset personal data at all?

Published camera records describe **infrastructure** (a camera, its kind, its public location), not natural persons. Under GDPR art. 1 and Recital 14 the Regulation does not cover legal persons, and data about inanimate objects or infrastructure is generally **not personal data** (art. 4(1)) — a camera location does not relate to an identified or identifiable natural person. The GDPR therefore does **not** constrain the publication of the dataset itself in most cases.

**The GDPR does apply** to the operational pipeline that supports it, which processes personal data:

1. reports and evidence submitted by contributors (may contain incidental personal data);
2. contributor pseudonymous IDs and submission metadata;
3. correction/takedown requests (requester contact details);
4. moderation records and moderator identities (via ChatGPT sign-in);
5. correspondence with the privacy contact.

This assessment covers those operations. Where a record is republished from an official public source (`source: official`), the source's own legal regime (national transparency law) is checked per record.

## 2. Processing inventory (short)

| Operation | Personal data involved | Basis | Necessity / safeguards |
|-----------|----------------------|-------|------------------------|
| Collect & store reports (pending) | Location, description, optional metadata, notes, pseudonymous ID | 6(1)(f) | Needed to run a community-sourced civic map; pseudonymous IDs; private by default; 90-day retention |
| Moderate (screen/verify/decide) | Report content, evidence, reviewer pseudonym | 6(1)(f) | Two-person review for sensitive records; audit log pseudonymous; never public |
| Publish verified records + exports (ODbL) | Generally **not personal data** (infrastructure) | 6(1)(f) / 6(1)(e) | Per-field opt-in for `manufacturer`/`observedOn`; least-specific location (**~4-decimal default**, decision 2026-07-31); no images until redaction workflow exists |
| Handle correction/takedown requests | Requester contact data | 6(1)(c) + 6(1)(f) | Needed to comply with arts. 15-22; identity verification proportionate |
| Security & abuse prevention | IP-level rate limiting (no logs retained), submissions metadata | 6(1)(f) | No behavioural advertising; rate limiting per H2 |
| Moderator authentication | Email/name via ChatGPT sign-in | 6(1)(f) | Never logged, never stored; session-only (M4) |

## 3. Lawful bases

### 3.1 Publication of verified records — art. 6(1)(f) legitimate interest (primary)

- **Legitimate interest:** civic transparency about visible public surveillance infrastructure; public awareness and accountability of public authorities; enabling communities and journalists to assess the extent of surveillance in public space.
- **Necessity:** the map requires publishing locations of infrastructure that is *already visible to anyone in the street*; no less intrusive means achieves the transparency purpose (generalising locations further would defeat it; the moderation queue and private fields show we do not publish more than needed).
- **Balancing test (LIA):**

| Factor | Assessment |
|--------|-----------|
| Controller/third-party interest | Strong, public-interest purpose (non-commercial, community-governed) |
| Impact on data subjects | **Low**: records concern infrastructure, not persons; no images, plates, faces, private interiors; least-specific coordinates (**~4 decimal places by default**, decision 2026-07-31); per-field opt-in for `manufacturer`/`observedOn`; no live video, no credentials, no operational detail |
| Reasonable expectations | A camera on a public street is observable by anyone; its existence is not private information |
| Safeguards | Human moderation before publication; retention schedule; correction/removal path with SLA; appeals with independent reviewer; no tracking/ads; ODbL licensing |
| Residual risk | Low, provided the safeguards are implemented (see review findings H1-H4) |

- **Conclusion:** legitimate interest is balanced for the publication purpose. Review annually and on any material change (art. 6(1)(f) requires a documented, current balancing test).

### 3.2 Public-interest basis — art. 6(1)(e) (complementary)

Art. 6(1)(e) applies where processing is necessary for a task carried out in the public interest, and art. 6(3) requires a basis in Union or Member State law. A community project is not automatically vested with an official task; therefore:

- 6(1)(e) is **not** the primary basis for community-sourced records;
- it applies where records are republished from **official public sources** (marked `source: official`) under national transparency rules (in Italy, e.g. D.Lgs. 33/2013 for public-administration transparency, checked per record);
- for the dataset as a whole, 6(1)(f) is the anchor; 6(1)(e) is documented as a supporting consideration for official-source records.

> **Note on ADR 0002:** this section updates the earlier statement in `docs/decisions/0002-legal-pre-launch-deliverables.md` that art. 6(1)(e) "is not applicable to a private civic project absent a statutory basis". The ADR is amended accordingly: 6(1)(e) remains unavailable as a *primary* basis for community-sourced records, but is documented as the applicable basis for republication of official-source records where national transparency law provides the art. 6(3) statutory anchor.

### 3.3 Other operations

- Correction/takedown requests: **6(1)(c)** (compliance with arts. 15-22 GDPR) plus 6(1)(f) (running a safe service). Consent (6(1)(a)) is not used for core processing; it may be offered separately for optional contact (currently out of scope).
- No processing relies on 6(1)(b) (no contract with data subjects) or 6(1)(d) (vital interests).

### 3.4 Special categories (art. 9)

Not intentionally collected. Incidental capture in evidence (faces, plates, interiors) is prevented by policy (../MODERATION.md) and enforced by redaction/deletion (RETENTION_SCHEDULE.md R6). If a future feature collects such data, a separate art. 9 assessment is required before implementation.

## 4. Jurisdiction note — Italy (D.Lgs. 196/2003)

- The Codice Privacy applies alongside the GDPR; the norms of adaptation introduced by D.Lgs. 101/2018 (artt. 2-ter ss.) govern public-interest processing and safeguards — relevant for official-source records under 6(1)(e).
- Age of consent for information-society services: 14 years (art. 2-quinquies D.Lgs. 196/2003).
- The *Garante per la protezione dei dati personali* is the supervisory authority for complaints (see PRIVACY_NOTICE.md § 8).
- Other jurisdictions (first 2-3 per ../MODERATION.md M5 playbook) are assessed before accepting records from them; this outline is the template.

## 5. Decision

- **Primary basis for the dataset and its pipeline: art. 6(1)(f)** with the documented LIA in § 3.1; **6(1)(e)** for official-source records; **6(1)(c)** for rights compliance.
- The LIA is a living document: reviewed at launch, annually, and on any material change of purpose, provider, or scope.

## 6. Open items before launch

- [ ] Final legal review per operating jurisdiction (start: IT, DE per ../MODERATION.md M5).
- [x] Controller entity and privacy contact decided (2026-07-31): **Simone Rondina (syax89) / OpenSurveillanceDB — Italy**; `privacy@opensurveillancedb` (mailbox to be provisioned before launch).
- [ ] Record the LIA sign-off in the governance log (ADR 0002).
