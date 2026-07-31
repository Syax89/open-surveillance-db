# Terms of use (draft — pre-launch)

- **Status:** draft for pre-launch review — **not in force**. No public service is live yet; these terms are the proposed contract for the public launch. Nothing here is a binding offer or commitment.
- **Owner:** Rosa (DPO / privacy)
- **Version:** 0.2 (2026-07-31 — re-draft: the v0.1 file was lost from its workspace; content recovered from the session archive and aligned with the Wave A decisions of 2026-07-31)
- **Decisions applied (2026-07-31, CEO — Wave A):** privacy contact `privacy@opensurveillancedb` (dedicated mailbox, to be created at launch); published coordinates rounded to **~4 decimal places (~10 m)** (zone-level precision; exact location private to moderators); verified records on a **12-month renewal** retention cycle (RETENTION_SCHEDULE.md R3).
- **Scope:** the OpenSurveillanceDB web application, public API, data exports and related services ("the Service").
- **Legal framework:** Regulation (EU) 2016/679 (GDPR); D.Lgs. 196/2003 (Codice Privacy, IT, as amended by D.Lgs. 101/2018); mandatory consumer-protection provisions of the user's country of residence continue to apply where the user is a consumer.
- **Related documents:** [PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md), [MODERATION.md](MODERATION.md), [OPEN_SOURCE.md](OPEN_SOURCE.md), [GOVERNANCE.md](../GOVERNANCE.md), ADR 0001; legal deliverables drafted pre-launch: PRIVACY_NOTICE.md, LAWFUL_BASIS.md, RETENTION_SCHEDULE.md, MODERATION_SLA.md, BREACH_PROCEDURE.md.

---

## 1. Who we are

- **Controller / operator:** OpenSurveillanceDB Ltd. — *placeholder entity; community governance to be confirmed before launch (GOVERNANCE.md).*
- **Contact:** `privacy@opensurveillancedb` *(dedicated mailbox — to be created before launch; final domain to be confirmed)* for any question, correction, appeal, or privacy request. Response times: MODERATION_SLA.md (S2/S3).

## 2. What these terms cover

1. OpenSurveillanceDB is a **non-commercial, community-governed civic-transparency project** documenting **visible public surveillance infrastructure** (e.g. cameras mounted in public streets, squares, station exteriors). It is free to use: no ads, no behavioural profiling, no sale of data.
2. By using the Service you accept these terms. If you **submit a report**, you additionally accept the submission obligations in § 5.
3. The Service does not provide video feeds, tracking tools, access to private cameras, or advice on avoiding lawful surveillance.

## 3. Permitted use of the Service

1. **Consultation:** browse the map, the record directory, and individual record pages; search and read the public dataset.
2. **Exports:** download public data via the JSON/CSV/GeoJSON exports and the public API, and reuse it, subject to the ODbL 1.0 licence (§ 7) and to the abuse limits in § 4.
3. **Reports:** submit observations of visible public surveillance infrastructure for human moderation. Reports are never guaranteed to be published (§ 5).
4. **Lawful purposes:** the data may be used for research, journalism, civic advocacy, and any purpose consistent with these terms and with the ODbL 1.0 licence. No account is required to browse; contributions use a **pseudonymous internal ID**, never a real-name requirement (PRIVACY_AND_SAFETY.md).

## 4. What you may not do

1. **Submit prohibited content.** The exclusions of MODERATION.md apply to everything you send, including reports, notes, and any future evidence uploads. In particular, do not submit:
   - residential/private cameras, including doorbells and cameras facing a private home;
   - live video, stream URLs, credentials, network information, or control interfaces;
   - detailed field-of-view or operational capability that could create a safety risk;
   - sensitive facilities or locations where publication could materially increase risk;
   - images containing identifiable people, vehicle plates, or private interiors unless safely redacted and necessary (note: evidence uploads are not enabled yet, OPEN_SOURCE.md);
   - unverifiable allegations about people or organisations;
   - content you are not entitled to share.
2. **Do not include unnecessary personal data.** Reports and notes must not contain personal data that does not serve the public record (data minimisation, PRIVACY_AND_SAFETY.md; LAWFUL_BASIS.md § 3.1).
3. **No abuse:** do not exceed the applicable rate limits, do not scrape the Service beyond reasonable personal use, do not attempt to access non-public records (`pending`, `rejected`, moderation queues, correction requests — ADR 0001), and do not circumvent access controls or use the Service to harass or facilitate harm.
4. **No commercial resale of the Service itself.** Reuse of the *data* under ODbL 1.0 (including commercial reuse) remains permitted; this clause concerns reselling the Service as a product.

## 5. Reports and publication

1. **No guarantee of publication.** Every report enters the database as `pending` (ADR 0001). Trained human moderators screen, verify, and decide per MODERATION.md. A report may be rejected, hidden, or removed at any time; rejected content is never published and is deleted after 30 days (RETENTION_SCHEDULE.md R2).
2. **What you keep and what you grant.** You retain whatever rights you have in the content you submit. By submitting, you grant the project a non-exclusive, worldwide, royalty-free licence to store and review the report and — **if and only if** the record is verified and published — to publish it and make it available under **ODbL 1.0**, as part of the open database, with attribution to contributors per the ODbL notice. No licence to publish is granted by the mere act of submitting.
3. **Your warranties.** By submitting you confirm that: the content is accurate to the best of your knowledge; you are entitled to share it; it complies with § 4; and you meet the minimum age for using the Service in your jurisdiction (in Italy, 14 years — art. 2-quinquies D.Lgs. 196/2003).
4. **Verification may be refused.** `source: official` records republished from official public sources follow their own legal regime, checked per record (LAWFUL_BASIS.md § 3.2); community reports are verified against the MODERATION.md publication standard, not against official registers.

## 6. Moderation, corrections, appeals

1. Moderation follows MODERATION.md and MODERATION_SLA.md: emergency hides within **24 h**, first response within **48 h**, substantive decision within **14 days**, re-review of temporary hides within **30 days**.
2. Any person affected by a moderation decision may request correction or removal via `privacy@opensurveillancedb` within **30 days** of the decision; appeals are decided by a **different reviewer** than the original decision, with escalation to the advisory circle for disputed cases (MODERATION_SLA.md S5/S6).
3. Data-subject rights (access, rectification, erasure, restriction, objection, portability) are described in PRIVACY_NOTICE.md § 7 and exercised through the same contact.

## 7. Licences

1. **Data:** the public database and its exports are licensed under **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** — reuse is permitted, including commercially, provided you attribute the database (attribution text to be finalised at launch) and, if you create a derivative database, you share it under ODbL 1.0. Exports carry the ODbL notice. Illustrative `demo` records are part of the licensed database.
2. **Software:** the application source code is licensed under **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)** (see LICENSE).
3. **Documentation:** project documentation is proposed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
4. **OpenStreetMap:** map background data is used under the OSM/ODbL terms; OSM attribution requirements apply (OSM_INTEGRATION.md).

## 8. Accuracy disclaimer

1. OpenSurveillanceDB is a **civic, community-maintained dataset — not an official record and not a statement of legal fact.** Records may be incomplete, outdated, or inaccurate despite human moderation; publication is deliberately conservative (ADR 0001).
2. Do not rely on the dataset for safety-critical or official decisions. Verify against official sources (e.g. the relevant public administration) before acting on it. The Service provides information about visible infrastructure only — it is not a directory of every camera, and absence of a record proves nothing.
3. Records from official sources are marked with their source and verification date; community records carry no such guarantee.
4. Published coordinates are rounded to **~4 decimal places (~10 m)** — zone-level precision (decision 2026-07-31). The exact location is never published and remains in the private moderation record, visible only to moderators (MODERATION.md, step 4).

## 9. Privacy

Your use of the Service is governed by the privacy notice (PRIVACY_NOTICE.md), the lawful-basis assessment (LAWFUL_BASIS.md), the retention schedule (RETENTION_SCHEDULE.md), and the breach procedure (BREACH_PROCEDURE.md). Key points: no tracking, no behavioural advertising; reports are private while pending; your GDPR rights are exercisable via `privacy@opensurveillancedb` within the statutory timelines (art. 12(3) GDPR).

## 10. Availability and limitation of liability

1. The Service is provided **"as is" and "as available"**, without warranties of accuracy, completeness, availability, or fitness for a particular purpose.
2. To the maximum extent permitted by law, the project and its contributors are **not liable** for any damages — including indirect, incidental, or consequential loss — arising from the use of, or reliance on, the Service or its data. In particular, the project is not liable for decisions made on the basis of the dataset.
3. Nothing in these terms excludes or limits liability that cannot be excluded or limited by law (e.g. fraud, death or personal injury caused by negligence, mandatory consumer-protection rights).
4. The Service is not intended for emergency or safety-critical use; it does not replace official information channels.

## 11. Suspension and removal

1. We may suspend or limit access, or remove content, where necessary to enforce these terms, to protect users or data subjects, or per the moderation policy — aiming to notify the affected person where proportionate and possible.
2. Contributors may request deletion of their `pending` submissions via `privacy@opensurveillancedb`; verified published records are subject to the **12-month renewal** retention and review cycle (RETENTION_SCHEDULE.md R3) and to the correction path of § 6.

## 12. Applicable law and jurisdiction

1. These terms are governed by **EU law and, where applicable, Italian law** — in particular the GDPR and D.Lgs. 196/2003 (Codice Privacy, as amended by D.Lgs. 101/2018).
2. **Disputes:** the courts of the place where the controller is established (Italy) have jurisdiction, **without prejudice** to the right of consumers residing in the EU to bring proceedings in the courts of their own country of residence (Regulation (EU) 1215/2012, Brussels I recast) and to the protection of their mandatory national provisions (Regulation (EC) 593/2008, Rome I). *Final wording to be confirmed once the controller entity is fixed (see § 15).*
3. **Complaints:** you may complain to the competent supervisory authority — in Italy, the *Garante per la protezione dei dati personali* (www.garanteprivacy.it).

## 13. Changes to these terms

1. These terms are versioned and stored in the repository. **Material changes** (purpose, licensing, data publication, governance) require a documented public proposal and a reasonable comment period (GOVERNANCE.md "Decision making" § 4).
2. Non-material changes take effect on publication with a notice (e.g. a prominent update). Continued use of the Service after the effective date constitutes acceptance; where the law requires consent, it will be obtained separately.

## 14. Contact

- **Privacy, corrections, appeals, rights:** `privacy@opensurveillancedb` *(dedicated mailbox — to be created before launch; final domain to be confirmed)*.
- Moderation/abuse emergencies use the same channel (MODERATION_SLA.md S1: hide within 24 h).

## 15. Pre-launch open items

- [x] Privacy contact decided (2026-07-31): `privacy@opensurveillancedb` — mailbox to be created before launch, final domain to be confirmed (PRIVACY_NOTICE.md § 1/8).
- [ ] Confirm the controller entity (PRIVACY_NOTICE.md § 1/8; GOVERNANCE.md).
- [ ] Final review of the jurisdiction clause for the first operating jurisdictions (LAWFUL_BASIS.md § 6; MODERATION.md M5).
- [ ] Decide and implement the acceptance mechanics (clickwrap on the submission form vs. general browse terms) — implementation owner: Ada.
- [ ] **ADR:** record the adoption of these terms and the inbound data-licensing model (submission → ODbL only upon verification) as a proposed ADR (next free number, per GOVERNANCE.md) — the terms embed a licensing and data-publication decision that material changes require documenting.

---

*Draft note: the 2026-07-31 Wave A decisions (ODbL 1.0 data licence, ~4-decimal coordinate precision, 12-month retention renewal, privacy contact) are applied. Remaining placeholders — controller entity and jurisdiction wording (§§ 1, 12, 15) — must be finalised at launch. This document is a deliverable of the pre-launch legal review (task t_05d84417, action list #2) and is not a published commitment.*
