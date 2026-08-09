# Terms of use

- **Status:** in force — personal open-source project (controller: Simone Rondina, syax89 — not a company). The Service is live at the public URL; these terms are the applicable contract.
- **Owner:** Rosa (Legal & Privacy Officer / privacy contact)
- **Version:** 0.8 (2026-08-08) — current-state alignment (template-ready): § 3.7 reflects the implemented multi-method auth (ADR 0020 — OIDC server-gated: buttons shown only when the operator configured the provider); § 5.5 reflects the image-evidence removal (2026-08-08); § 15 open items reflect the implemented retention sweep and OIDC activation.
- **Decisions applied (2026-07-31, CEO — Wave A):** privacy contact `privacy@opensurveillancedb.org` (dedicated, monitored mailbox); published coordinates rounded to **~4 decimal places (~10 m)** (zone-level precision; exact location never published); community-driven publication model (ADR 0021, 2026-08-04).
- **Scope:** the OpenSurveillanceDB web application, public API, data exports and related services ("the Service").
- **Legal framework:** Regulation (EU) 2016/679 (GDPR); D.Lgs. 196/2003 (Codice Privacy, IT, as amended by D.Lgs. 101/2018); mandatory consumer-protection provisions of the user's country of residence continue to apply where the user is a consumer.
- **Related documents:** [PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md), [MODERATION.md](MODERATION.md), [OPEN_SOURCE.md](OPEN_SOURCE.md), [GOVERNANCE.md](../GOVERNANCE.md), ADR 0021; legal deliverables: PRIVACY_NOTICE.md, LAWFUL_BASIS.md, RETENTION_SCHEDULE.md, MODERATION_SLA.md, BREACH_PROCEDURE.md (in `docs/legal/`).

---

## 1. Who we are

- **Controller / operator:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy (PRIVACY_NOTICE.md § 1).
- **Contact:** `privacy@opensurveillancedb.org` *(dedicated, monitored mailbox)* for any question, correction, removal or privacy request. Response times: first response within 48 h, substantive response within 14 days.

## 2. What these terms cover

1. OpenSurveillanceDB is a **non-commercial, community-governed civic-transparency project** documenting **visible public surveillance infrastructure** (e.g. cameras mounted in public streets, squares, station exteriors). It is free to use: no ads, no behavioural profiling, no sale of data.
2. By using the Service you accept these terms. If you **submit a report**, you additionally accept the submission obligations in § 5. If you use the **community features** — a contributor account or community actions on records — the corresponding sections (§ 3, § 6) apply. Community features never require providing more data than the account itself (see PRIVACY_NOTICE.md § 3).
3. The Service does not provide video feeds, tracking tools, access to private cameras, or advice on avoiding lawful surveillance.

## 3. Permitted use of the Service

1. **Consultation:** browse the map, the record directory, and individual record pages; search and read the public dataset.
2. **Exports:** download public data via the JSON/CSV/GeoJSON exports and the public API, and reuse it, subject to the ODbL 1.0 licence (§ 7) and to the abuse limits in § 4.
3. **Reports:** submit observations of visible public surveillance infrastructure. A report from a verified account is **published immediately** and is part of the public dataset from submission (§ 5).
4. **Lawful purposes:** the data may be used for research, journalism, civic advocacy, and any purpose consistent with these terms and with the ODbL 1.0 licence. Browsing the public data never requires an account. Submitting a report or a correction requires a verified contributor account (§ 3.5, ADR 0020); every submission is attributed to it through a **pseudonymous internal ID** — never a real-name requirement (PRIVACY_AND_SAFETY.md). Account data is processed per PRIVACY_NOTICE.md § 3 and RETENTION_SCHEDULE.md R7.
5. **Community actions.** Authenticated contributors may act on published records — mark them useful, confirm they are still present, flag them as no longer present, or raise a problem or privacy concern. One active action per record per contributor; actions feed automatic thresholds that decide when a record is hidden or removed (ADR 0021; § 6). Community actions are aggregated in public payloads and are **never attributed to any profile** (PRIVACY_NOTICE.md § 3).
6. **Public record history.** Every community transition is recorded in the record's **public per-record event history** (published, confirmed, liked, gone-flagged, hidden, removed, restored) — a transparency record without attribution, shown on the record page (ADR 0021 § 7; PRIVACY_NOTICE.md § 3).
7. **Authentication methods (multi-method, ADR 0020).** Contributor accounts support **three methods**, and you choose: **(a) email + password** — the baseline, with **email verification required for write access**; **(b) passkeys (WebAuthn)** — optional, passwordless; **(c) OIDC via GitHub or Google** — optional, opt-in, **server-gated: the buttons are shown only when the operator has configured the provider on this deployment**. The rules:
   - **Email verification is required for write access.** After registration you must verify the email address (single-use link, 24 h) before you can submit reports or act on records (community actions); until then your session is **read-only**. Verification and password-reset emails are sent through Cloudflare Email Routing with no tracking content. One email address = one account; keep it accessible if you lose your password.
   - **Passkeys.** If you enroll a passkey, the site stores only public-key material; the private key stays on your device. **Vendor note:** *synced* passkeys are backed up through the OS vendor's cloud (Apple/Google/Microsoft) at your choice — the vendor learns you have an account here, the site shares nothing with them, and you control sync. Keep the 10 recovery codes issued at enrollment in a safe place; without them, a lost device may mean losing access to the passkey method (the email+password path remains).
   - **OIDC via GitHub/Google — tracking disclosure.** Signing in with GitHub or Google means **GitHub or Google observes that you sign in to this Service, and your IP address**, at each login; the provider's own terms and privacy policy apply at sign-in. We **do not import your email** from the provider (subject id + verified flag only) and we never merge accounts automatically on an email match — a conflict requires a manual, verified merge. This method is **opt-in and disclosed** (risk matrix on the login page); the buttons are shown only when the operator has activated the provider (credentials configured on this deployment, PROCESSOR_REGISTER.md PR4/PR5).
   - You may add, change or remove methods from your account page at any time; deleting your account deletes the data of every method (PRIVACY_NOTICE.md § 7 R15, § 8).

## 4. What you may not do

1. **Submit prohibited content.** The exclusions of the publication rules apply to everything you send, including reports and notes. In particular, do not submit:
   - residential/private cameras, including doorbells and cameras facing a private home;
   - live video, stream URLs, credentials, network information, or control interfaces;
   - detailed field-of-view or operational capability that could create a safety risk;
   - sensitive facilities or locations where publication could materially increase risk;
   - images containing identifiable people, vehicle plates, or private interiors (no image submission exists — reports are text metadata only; image evidence was removed on 2026-08-08);
   - unverifiable allegations about people or organisations;
   - content you are not entitled to share.
2. **Do not include unnecessary personal data.** Reports and notes must not contain personal data that does not serve the public record (data minimisation, PRIVACY_AND_SAFETY.md; LAWFUL_BASIS.md § 3.1).
3. **No abuse:** do not exceed the applicable rate limits, do not scrape the Service beyond reasonable personal use, do not attempt to access non-public records (withdrawn records, correction requests — ADR 0021), and do not circumvent access controls or use the Service to harass or facilitate harm.
4. **No commercial resale of the Service itself.** Reuse of the *data* under ODbL 1.0 (including commercial reuse) remains permitted; this clause concerns reselling the Service as a product.

## 5. Reports and publication

1. **Immediate publication.** A report from a verified contributor is published immediately: it enters the public dataset as soon as it is submitted. There is no review queue and no waiting. The community keeps the directory accurate: records are confirmed, flagged as no longer present, marked useful, or withdrawn through automatic thresholds (ADR 0021). A record can be hidden or removed at any time by enough community signals, or by a legal-emergency decision; withdrawn records stay reachable by direct link with a banner and a public event history, and can be restored by enough confirmations.
2. **What you keep and what you grant.** You retain whatever rights you have in the content you submit. By submitting, you grant the project a non-exclusive, worldwide, royalty-free licence to store, review and publish the report as part of the open database, made available under **ODbL 1.0**, with attribution to contributors per the ODbL notice. Publication happens at submission, not after an approval step.
3. **Your warranties.** By submitting you confirm that: the content is accurate to the best of your knowledge; you are entitled to share it; it complies with § 4; and you meet the minimum age for using the Service in your jurisdiction (in Italy, 14 years — art. 2-quinquies D.Lgs. 196/2003).
4. **Community accuracy.** `source: official` records republished from official public sources follow their own legal regime, checked per record (LAWFUL_BASIS.md § 3.2); community reports are kept accurate by the community's confirmations and flags under the automatic thresholds, not against official registers.
5. **Image evidence (removed).** Reports are **text metadata only**. The image-evidence feature (intake, storage, moderation/redaction gate) was **removed entirely on 2026-08-08** (CEO decision — "troppo rischioso e troppo esoso di spazio"). No image is accepted or stored; existing objects from the retired feature are **retained without deletion** (RETENTION_SCHEDULE.md R13, historical).

## 6. Community actions, corrections, legal emergencies

1. **Community actions.** Any verified account can mark a record useful, confirm it is still present, flag it as no longer present, or raise a problem or privacy concern. One account, one active action per record. Automatic thresholds — including a deliberately low privacy threshold — decide when a record is hidden or removed; every transition is recorded in the record's public history without attribution to any profile (ADR 0021).
2. **Corrections.** Any person may request a correction or removal via the private correction form (home page, "Report a problem / correction" section) or `privacy@opensurveillancedb.org`. Requests are private, reviewed by a person, and never change the map automatically. Response targets: first response within **48 hours**, substantive response within **14 days**; legal-emergency hides are immediate.
3. **Legal emergencies.** The only human write power over the **record lifecycle** is the administrator's legal-emergency hide or removal, used when the law requires it and reviewed retrospectively. Administrators cannot restore or un-hide unilaterally: the community consensus of § 5 is the only reversal path (ADR 0021 § 6/§ 8).
4. Data-subject rights (access, rectification, erasure, restriction, objection, portability) are described in PRIVACY_NOTICE.md § 7 and exercised through the same contact.

## 7. Licences

1. **Data:** the public database and its exports are licensed under **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** — reuse is permitted, including commercially, provided you attribute the database and, if you create a derivative database, you share it under ODbL 1.0. Exports carry the ODbL notice. Illustrative `demo` records are part of the licensed database.
2. **Software:** the application source code is licensed under **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)** (see LICENSE).
3. **Documentation:** project documentation is proposed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
4. **OpenStreetMap:** map background data is used under the OSM/ODbL terms; OSM attribution requirements apply (OSM_INTEGRATION.md).

## 8. Accuracy disclaimer

1. OpenSurveillanceDB is a **civic, community-maintained dataset — not an official record and not a statement of legal fact.** Records may be incomplete, outdated, or inaccurate despite community maintenance; publication is immediate, not conservative (ADR 0021).
2. Do not rely on the dataset for safety-critical or official decisions. Verify against official sources (e.g. the relevant public administration) before acting on it. The Service provides information about visible infrastructure only — it is not a directory of every camera, and absence of a record proves nothing.
3. Records from official sources are marked with their source and verification date; community records carry no such guarantee.
4. Published coordinates are rounded to **~4 decimal places (~10 m)** — zone-level precision (decision 2026-07-31, enforced at the public read boundary). The exact location is never published and stays in the database.

## 9. Privacy

Your use of the Service is governed by the privacy notice (PRIVACY_NOTICE.md), the lawful-basis assessment (LAWFUL_BASIS.md), the retention schedule (RETENTION_SCHEDULE.md), and the breach procedure (BREACH_PROCEDURE.md). Key points: no tracking, no behavioural advertising; reports are public as soon as they are published and private correction requests stay private; your GDPR rights are exercisable via `privacy@opensurveillancedb.org` within the statutory timelines (art. 12(3) GDPR). **How you authenticate** is described in § 3.7 and PRIVACY_NOTICE.md § 3.1: email verification before write access, passkeys with a vendor note on sync, and OIDC with a tracking disclosure — each method's data is processed per PRIVACY_NOTICE.md § 3 and deleted on account erasure (§ 7 R15).

## 10. Availability and limitation of liability

1. The Service is provided **"as is" and "as available"**, without warranties of accuracy, completeness, availability, or fitness for a particular purpose.
2. To the maximum extent permitted by law, the project and its contributors are **not liable** for any damages — including indirect, incidental, or consequential loss — arising from the use of, or reliance on, the Service or its data. In particular, the project is not liable for decisions made on the basis of the dataset.
3. Nothing in these terms excludes or limits liability that cannot be excluded or limited by law (e.g. fraud, death or personal injury caused by negligence, mandatory consumer-protection rights).
4. The Service is not intended for emergency or safety-critical use; it does not replace official information channels.

## 11. Suspension and removal

1. We may suspend or limit access, or remove content, where necessary to enforce these terms, to protect users or data subjects, or under the publication rules — aiming to notify the affected person where proportionate and possible.
2. Contributors may request deletion of their reports via `privacy@opensurveillancedb.org`; published records stay public while the community keeps confirming them, and follow the correction and withdrawal paths of § 6 (community actions with automatic thresholds; legal-emergency hides are immediate).

## 12. Applicable law and jurisdiction

1. These terms are governed by **EU law and, where applicable, Italian law** — in particular the GDPR and D.Lgs. 196/2003 (Codice Privacy, as amended by D.Lgs. 101/2018).
2. **Disputes:** the courts of the place where the controller is established (Italy) have jurisdiction, **without prejudice** to the right of consumers residing in the EU to bring proceedings in the courts of their own country of residence (Regulation (EU) 1215/2012, Brussels I recast) and to the protection of their mandatory national provisions (Regulation (EC) 593/2008, Rome I).
3. **Complaints:** you may complain to the competent supervisory authority — in Italy, the *Garante per la protezione dei dati personali* (www.garanteprivacy.it).

## 13. Changes to these terms

1. These terms are versioned and stored in the repository. **Material changes** (purpose, licensing, data publication, governance) require a documented public proposal and a reasonable comment period (GOVERNANCE.md "Decision making" § 4).
2. Non-material changes take effect on publication with a notice (e.g. a prominent update). Continued use of the Service after the effective date constitutes acceptance; where the law requires consent, it will be obtained separately.

## 14. Contact

- **Privacy, corrections, rights:** `privacy@opensurveillancedb.org` *(dedicated, monitored mailbox)*.
- Legal emergencies and abuse reports use the same channel (immediate hide).

## 15. Implementation state

- [x] Privacy contact decided (2026-07-31) and mailbox active (2026-08-01): `privacy@opensurveillancedb.org` (PRIVACY_NOTICE.md § 1/§ 9).
- [x] Controller entity: **Simone Rondina (syax89) / OpenSurveillanceDB — Italy** (PRIVACY_NOTICE.md § 1).
- [x] **Community-driven model reflected (ADR 0021):** § 2/§ 3/§ 4/§ 5/§ 6/§ 8/§ 9/§ 11/§ 14 describe the implemented model — immediate publication, community actions with automatic thresholds, public per-record history without attribution, private corrections, legal emergency as the only human write power over the record lifecycle.
- [x] **Retention enforcement:** implemented and active — the daily retention sweep (`db/retention.ts` + cron binding in `worker/index.ts`, daily 03:00 UTC) enforces R12/R16/R17/R18 and archives audit entries (RETENTION_SCHEDULE.md § 3).
- [x] **Image evidence removed (2026-08-08):** the feature was removed entirely; TERMS § 4.1/§ 5.5 and PRIVACY_NOTICE § 3/§ 4 reflect the removal.
- [x] **Account erasure endpoint (R7):** implemented — self-service `DELETE /api/auth/account` (ADR 0013, PR #57/#61), atomic with de-attribution (`contributor_id = NULL`), revokes all sessions; sessions expire after 30 days (`AUTH_SESSION_TTL_DAYS`). Tracked in RETENTION_SCHEDULE.md R7.
- [x] **Legal documents linked from the UI:** the public pages `/termini`, `/privacy` and `/licenze` expose TERMS_OF_USE.md / PRIVACY_NOTICE.md / OPEN_SOURCE.md (footer links on every page; web adaptation in `app/lib/legal/`). The repository copies remain canonical.
- [x] **Multi-method auth (ADR 0020):** implemented — email verification enforced for write access (read-only sessions until verified), passkeys with 10 recovery codes and the email+password fallback, OIDC via GitHub/Google **server-gated** (buttons shown only when the operator configured the provider; erasure covers the new auth data, RETENTION_SCHEDULE.md R15).
- [x] **Acceptance mechanics (clickwrap):** implemented — the submission and correction forms require an explicit consent checkbox (with links to `/privacy` and `/termini`) before the record or correction can be sent (`ReportForm.tsx`, `CorrectionForm.tsx`); general browse terms apply to the rest of the site.
- [x] **ADR:** the adoption of these terms and the inbound data-licensing model (submission → ODbL at publication) are recorded in ADR 0008 (data licence) and ADR 0021 (community-driven model, which cites these terms).

---

---

*The 2026-07-31 Wave A decisions (ODbL 1.0 data licence, ~4-decimal coordinate precision, privacy contact, controller entity) and the community-driven model (ADR 0021) are applied. These terms are in force and versioned in the repository.*
