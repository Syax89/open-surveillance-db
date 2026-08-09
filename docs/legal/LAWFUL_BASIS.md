# Lawful-basis assessment (outline)

- **Status:** in force — personal open-source project, 2026-08-08 (ADR 0002)
- **Owner:** Simone Rondina (project owner / privacy contact)
- **Jurisdiction (primary):** European Union — GDPR (EU) 2016/679; Italy — D.Lgs. 196/2003 (Codice Privacy, as amended by D.Lgs. 101/2018)
- **Documents this supports:** PRIVACY_NOTICE.md, PROCESSOR_REGISTER.md

> **Disclaimer:** this document is product guidance / not legal advice. The document is in force for the pilot jurisdiction (Italy); per-jurisdiction review remains the documented precondition for an EU-wide launch.

---

## 1. Preliminary question: is the public dataset personal data at all?

Published camera records describe **infrastructure** (a camera, its kind, its public location), not natural persons. Under GDPR art. 1 and Recital 14 the Regulation does not cover legal persons, and data about inanimate objects or infrastructure is generally **not personal data** (art. 4(1)) — a camera location does not relate to an identified or identifiable natural person. The GDPR therefore does **not** constrain the publication of the dataset itself in most cases.

**The GDPR does apply** to the operational pipeline that supports it, which processes personal data:

1. reports and evidence submitted by contributors (may contain incidental personal data);
2. contributor pseudonymous IDs and submission metadata;
3. correction/takedown requests (requester contact details);
4. moderation records and moderator identities (verified contributor accounts — email + password, passkey, or OIDC via GitHub/Google);
5. correspondence with the privacy contact.

This assessment covers those operations. Where a record is republished from an official public source (`source: official`), the source's own legal regime (national transparency law) is checked per record.

## 2. Processing inventory (short)

| Operation | Personal data involved | Basis | Necessity / safeguards |
|-----------|----------------------|-------|------------------------|
| Collect & store reports | Location, description, optional metadata, notes, pseudonymous ID | 6(1)(f) | Needed to run a community-sourced civic map; pseudonymous IDs; published immediately from verified accounts (ADR 0021); no time-based record retention |
| Community actions on records (like/confirm/gone/problem/privacy) | Action type, weight snapshot, timestamp | 6(1)(f) | Verified-account gate (ADR 0020); one action per user per record; aggregates only in public payloads (ADR 0021 § 3/§ 7); erasure covers actions (§ 13) |
| Residual human moderation (legal-emergency hide/remove) | Decision, reviewer pseudonym | 6(1)(f) | Legal-emergency actions single-person, reviewed retrospectively (ADR 0021 § 8); audit log pseudonymous; never public |
| Publish records + exports (ODbL) | Generally **not personal data** (infrastructure) | 6(1)(f) / 6(1)(e) | Per-field opt-in for `manufacturer`/`observedOn`; least-specific location (**~4-decimal default**, decision 2026-07-31); no image data (feature removed 2026-08-08) |
| Handle correction/takedown requests | Requester contact data | 6(1)(c) + 6(1)(f) | Needed to comply with arts. 15-22; identity verification proportionate |
| Security & abuse prevention | IP-level rate limiting (no logs retained), submissions metadata | 6(1)(f) | No behavioural advertising; rate limiting per H2 |
| OIDC contributor authentication (GitHub/Google, optional) | Subject id + display name + verified flag — never the email | 6(1)(f) | No email imported (RFC 2606 placeholder); stored only as the account link (provider + subject id) and the account display name; never logged; the provider observes the login + IP (disclosed) |

## 3. Lawful bases

### 3.1 Publication of records — art. 6(1)(f) legitimate interest (primary)

- **Legitimate interest:** civic transparency about visible public surveillance infrastructure; public awareness and accountability of public authorities; enabling communities and journalists to assess the extent of surveillance in public space.
- **Necessity:** the map requires publishing locations of infrastructure that is *already visible to anyone in the street*; no less intrusive means achieves the transparency purpose (generalising locations further would defeat it; the verified-account gate and the automatic safeguards show we do not publish more than needed).
- **Balancing test (LIA):**

| Factor | Assessment |
|--------|-----------|
| Controller/third-party interest | Strong, public-interest purpose (non-commercial, community-governed) |
| Impact on data subjects | **Low**: records concern infrastructure, not persons; no images, plates, faces, private interiors (image evidence removed 2026-08-08 — text metadata only); least-specific coordinates (**~4 decimal places by default**, decision 2026-07-31); per-field opt-in for `manufacturer`/`observedOn`; no live video, no credentials, no operational detail; the public per-record history carries no attribution (aggregates only, ADR 0021 § 7) |
| Reasonable expectations | A camera on a public street is observable by anyone; its existence is not private information |
| Safeguards | **Verified-account write gate** (ADR 0020 — every report and every community action requires a verified contributor account, 401/403 fail-closed); **privacy threshold ≥ 1 → `hidden`** (a single verified privacy action withdraws the record immediately — prudential, reversible only by high-bar consensus + cooldown, ADR 0021 § 4.3); **public per-record event history without attribution** (transparency, ADR 0021 § 7); **erasure covers community actions** (art. 17, ADR 0021 § 13 — actions are deleted atomically with the account); **private corrections** (never change the map automatically, TERMS § 6.2); **no image data** (feature removed 2026-08-08); retention schedule; no tracking/ads; ODbL licensing |
| Residual risk | Low, provided the automatic safeguards are in force and monitored (thresholds tunable via audited admin settings, ADR 0021 § 5) |

- **Conclusion:** legitimate interest is balanced for the publication purpose. The balancing test is current as of 2026-08-05 (community-driven model, ADR 0021); review annually and on any material change (art. 6(1)(f) requires a documented, current balancing test; art. 5(2) accountability).

#### 3.1.1 Community actions — like / confirm / gone / problem / privacy (art. 6(1)(f))

The community-driven model (ADR 0021) processes contributor personal data through **community actions** on records: action type, trust-weight snapshot and timestamp per record (`camera_community_actions`). All are personal data (art. 4(1) — tied to `contributors.id`; pseudonymisation does not exclude identifiability, art. 4(5), Recital 26). The basis is **art. 6(1)(f)** — **never consent** (art. 6(1)(a)): community moderation is a core function of the service, and the imbalance between controller and data subject makes consent an inappropriate basis.

- **Legitimate interest:** community-driven accuracy and freshness of the civic-transparency dataset — the § 3.1 purpose extended to the people who keep the dataset current; automatic, trust-weighted thresholds (ADR 0021 § 4) replace the retired human review queue.
- **Necessity:** no new collection beyond the report itself — actions are minimal by design (one per user per record, whitelisted types, no free text); the weight is a **snapshot of the contributor's existing trust level at action time** (ADR 0021 § 3.4), derived from data already held (level = COUNT over `active` records, ADR 0021 § 12).
- **Balancing test (LIA):**

| Factor | Assessment |
|--------|-----------|
| Controller/third-party interest | Strong: community actions are the mechanism that keeps the public dataset accurate without human review; non-commercial, community-governed |
| Impact on data subjects | **Lower than the pre-pivot community plan** (COMMUNITY_PLAN.md § 5, superseded): **no public profile, no attribution, no edit flow** — public payloads expose **aggregates only** (counts/scores, never who acted — ADR 0021 § 3.5/§ 7); one action per user per record; no free text; actions carry no email, real name or IP-derived data |
| Reasonable expectations | A contributor who acts on records with a verified account can expect only aggregate signals to be visible; the notice states actions are aggregated and never attributed (PRIVACY_NOTICE.md § 3) |
| Safeguards | Verified-account write gate (ADR 0020); one action per user per record (UNIQUE, ADR 0021 § 3); self-action restrictions (no self-like/self-confirm, 403); daily/per-record quotas and IP-hash burst alerts (anti-gaming, ADR 0021 § 11); privacy threshold ≥ 1 → immediate `hidden`, reversible only by high-bar consensus + cooldown; public history without attribution; **erasure (art. 17) deletes the contributor's actions atomically with the account** (ADR 0021 § 13) and the history survives only as aggregates |
| Residual risk | Low, provided the automatic safeguards are in force and monitored; thresholds tunable via audited admin settings (ADR 0021 § 5) |

- **Conclusion:** legitimate interest is balanced for the community-action purposes. The impact is *lower* than the pre-pivot community plan (no public profile, no attribution, no edit flow), so the § 3.1 conclusion — art. 6(1)(f) balanced for the publication purpose — holds **a fortiori** for community actions. Review together with § 3.1 on any material change.

### 3.2 Public-interest basis — art. 6(1)(e) (complementary)

Art. 6(1)(e) applies where processing is necessary for a task carried out in the public interest, and art. 6(3) requires a basis in Union or Member State law. A community project is not automatically vested with an official task; therefore:

- 6(1)(e) is **not** the primary basis for community-sourced records;
- it applies where records are republished from **official public sources** (marked `source: official`) under national transparency rules (in Italy, e.g. D.Lgs. 33/2013 for public-administration transparency, checked per record);
- for the dataset as a whole, 6(1)(f) is the anchor; 6(1)(e) is documented as a supporting consideration for official-source records.

> **Note on ADR 0002:** this section updates the earlier statement in the
> ADR 0002 decision record that art. 6(1)(e) "is not applicable to a private civic project absent a statutory basis". The ADR is amended accordingly: 6(1)(e) remains unavailable as a *primary* basis for community-sourced records, but is documented as the applicable basis for republication of official-source records where national transparency law provides the art. 6(3) statutory anchor.

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
- The LIA is a living document: reviewed annually and on any material change of purpose, provider, or scope.

## 6. Pre-launch checklist (completed)

- [x] Controller entity and privacy contact decided (2026-07-31): **Simone Rondina (syax89) / OpenSurveillanceDB — Italy**; `privacy@opensurveillancedb.org` (mailbox active 2026-08-01).
- [x] LIA sign-off recorded in the governance log (ADR 0002, decision 3 — lawful basis and balancing test).
- [x] Jurisdiction review: the pilot jurisdiction (Italy) is in force (ADR 0010); additional jurisdictions are assessed before accepting records from them (../MODERATION.md M5), with the LIA reviewed on any material change of purpose, provider, or scope — no external counsel review is required for the pilot.
