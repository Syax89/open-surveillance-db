# Terms of use (draft — pre-launch)

- **Status:** draft for pre-launch review — **not in force**. No public service is live yet; these terms are the proposed contract for the public launch. Nothing here is a binding offer or commitment.
- **Owner:** Rosa (Legal & Privacy Officer / privacy contact)
- **Version:** 0.6 (2026-08-02 — **multi-method authentication documented, per ADR 0020 and the AUTH MULTI-METODO roadmap:** new § 3.7 "Authentication methods" — three methods (email+password with verification, passkeys, OIDC via GitHub/Google), email verification required for write access, passkey vendor note, OIDC tracking disclosure and opt-in; § 9 cross-referenced; § 15 open item (OIDC activation gate). Prior version 0.5 (2026-08-01 — privacy contact updated: monitored mailbox active at `privacy@opensurveillancedb.org`; "to be created/provisioned" notes removed from § 1. Prior version 0.4 (2026-08-01 — community system documented, per COMMUNITY_PLAN.md § 5.3 and the legal opinion t_9e11b89b: § 2 scope extended to contributor community features; § 3.4 public profile **opt-in, default private**, no leaderboards/rankings; § 5 new sub-section on **editing contributions** (attribution, moderation, revert); § 5.3 warranties extended to edits; § 6 moderation/edit + appeal; § 8 disclaimer covers "community-edited" records; § 11 removal of incorrect edits. Prior version 0.3 (2026-08-01): photo evidence upload documented — TERMS § 4.1/§ 5.5 describe the active `POST /api/photos` flow — EXIF/XMP/IPTC stripping fail-closed, R2/D1 storage, moderation + redaction gate, retention R6; see `docs/legal/REVIEW_PHOTO_UPLOAD_TERMS_ALIGNMENT_2026-08-01.md`).
- **Decisions applied (2026-07-31, CEO — Wave A):** privacy contact `privacy@opensurveillancedb.org` (dedicated, monitored mailbox); published coordinates rounded to **~4 decimal places (~10 m)** (zone-level precision; exact location private to moderators); verified records on a **12-month renewal** retention cycle (RETENTION_SCHEDULE.md R3).
- **Scope:** the OpenSurveillanceDB web application, public API, data exports and related services ("the Service").
- **Legal framework:** Regulation (EU) 2016/679 (GDPR); D.Lgs. 196/2003 (Codice Privacy, IT, as amended by D.Lgs. 101/2018); mandatory consumer-protection provisions of the user's country of residence continue to apply where the user is a consumer.
- **Related documents:** [PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md), [MODERATION.md](MODERATION.md), [OPEN_SOURCE.md](OPEN_SOURCE.md), [GOVERNANCE.md](../GOVERNANCE.md), ADR 0001; legal deliverables drafted pre-launch: PRIVACY_NOTICE.md, LAWFUL_BASIS.md, RETENTION_SCHEDULE.md, MODERATION_SLA.md, BREACH_PROCEDURE.md.

---

## 1. Who we are

- **Controller / operator:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy (CEO decision 2026-07-31, PRIVACY_NOTICE.md § 1; final legal-entity wording to be confirmed at launch).
- **Contact:** `privacy@opensurveillancedb.org` *(dedicated, monitored mailbox)* for any question, correction, appeal, or privacy request. Response times: MODERATION_SLA.md (S2/S3).

## 2. What these terms cover

1. OpenSurveillanceDB is a **non-commercial, community-governed civic-transparency project** documenting **visible public surveillance infrastructure** (e.g. cameras mounted in public streets, squares, station exteriors). It is free to use: no ads, no behavioural profiling, no sale of data.
2. By using the Service you accept these terms. If you **submit a report**, you additionally accept the submission obligations in § 5. If you use the **community features** — a contributor account, a (private-by-default) profile, verifications of other records, or editing contributions — the corresponding sections (§ 3.4–3.7, § 5.6, § 6) apply. Community features never require providing more data than the account itself (see PRIVACY_NOTICE.md § 3).
3. The Service does not provide video feeds, tracking tools, access to private cameras, or advice on avoiding lawful surveillance.

## 3. Permitted use of the Service

1. **Consultation:** browse the map, the record directory, and individual record pages; search and read the public dataset.
2. **Exports:** download public data via the JSON/CSV/GeoJSON exports and the public API, and reuse it, subject to the ODbL 1.0 licence (§ 7) and to the abuse limits in § 4.
3. **Reports:** submit observations of visible public surveillance infrastructure for human moderation. Reports are never guaranteed to be published (§ 5).
4. **Lawful purposes:** the data may be used for research, journalism, civic advocacy, and any purpose consistent with these terms and with the ODbL 1.0 licence. Browsing the public data never requires an account. Submitting a report or a correction requires a verified contributor account (§ 3.7, ADR 0020); every submission is attributed to it through a **pseudonymous internal ID** — never a real-name requirement (PRIVACY_AND_SAFETY.md). Account data is processed per PRIVACY_NOTICE.md § 3 and RETENTION_SCHEDULE.md R7.
5. **Community profile (opt-in public, private by default).** Contributor accounts include a profile (display name, trust level derived from verified contributions, verifications received, list of contributions). The profile is **private by default** — only you can see it. You may **opt in** to make it public; nothing is published without that explicit choice, and you can switch back to private at any time (PRIVACY_NOTICE.md § 5). Only your chosen display name is ever public — never your real name or email. There is **no public leaderboard or ranking** of contributors: trust levels and verifications are informative indicators, not a ranking (PRIVACY_NOTICE.md § 4; COMMUNITY_PLAN.md § 5.2).
6. **Verifications.** Authenticated contributors may verify (confirm the existence of) published records they have independently observed. One verification per user per record (anti-gaming); verifications carry no free text and are limited to confirming the record. Verifications you give are attributed to your account (PRIVACY_NOTICE.md § 3) and are de-identified if you delete your account (RETENTION_SCHEDULE.md R14); verifications you receive are shown on your profile only if you make it public (§ 3.5).
7. **Authentication methods (multi-method, ADR 0020).** Contributor accounts support **three methods**, and you choose: **(a) email + password** — the baseline, now with **email verification**; **(b) passkeys (WebAuthn)** — optional, passwordless; **(c) OIDC via GitHub or Google** — optional, opt-in. The rules:
   - **Email verification is required for write access.** After registration you must verify the email address (single-use link, 24 h) before you can submit, edit or verify records; until then your session is **read-only**. Verification and password-reset emails are sent through Cloudflare Email Routing with no tracking content. One email address = one account; keep it accessible if you lose your password.
   - **Passkeys.** If you enroll a passkey, the site stores only public-key material; the private key stays on your device. **Vendor note:** *synced* passkeys are backed up through the OS vendor's cloud (Apple/Google/Microsoft) at your choice — the vendor learns you have an account here, the site shares nothing with them, and you control sync. Keep the 10 recovery codes issued at enrollment in a safe place; without them, a lost device may mean losing access to the passkey method (the email+password path remains).
   - **OIDC via GitHub/Google — tracking disclosure.** Signing in with GitHub or Google means **GitHub or Google observes that you sign in to this Service, and your IP address**, at each login; the provider's own terms and privacy policy apply at sign-in. We **do not import your email** from the provider (subject id + verified flag only) and we never merge accounts automatically on an email match — a conflict requires a manual, verified merge. This method is **opt-in and disclosed** (risk matrix on the login page); it is **not yet active** until the OIDC activation gate (DPA + EU–US DPF) passes.
   - You may add, change or remove methods from your account page at any time; deleting your account deletes the data of every method (PRIVACY_NOTICE.md § 7 R15, § 8).

## 4. What you may not do

1. **Submit prohibited content.** The exclusions of MODERATION.md apply to everything you send, including reports, notes, and any future evidence uploads. In particular, do not submit:
   - residential/private cameras, including doorbells and cameras facing a private home;
   - live video, stream URLs, credentials, network information, or control interfaces;
   - detailed field-of-view or operational capability that could create a safety risk;
   - sensitive facilities or locations where publication could materially increase risk;
   - images containing identifiable people, vehicle plates, or private interiors, unless you have safely redacted them **before uploading** and they are necessary — photo evidence uploads are **active** (§ 5.5): images are stripped of EXIF/XMP/IPTC metadata at the boundary (fail-closed) and are never published until a moderator approves them with confirmed redaction;
   - unverifiable allegations about people or organisations;
   - content you are not entitled to share.
2. **Do not include unnecessary personal data.** Reports and notes must not contain personal data that does not serve the public record (data minimisation, PRIVACY_AND_SAFETY.md; LAWFUL_BASIS.md § 3.1).
3. **No abuse:** do not exceed the applicable rate limits, do not scrape the Service beyond reasonable personal use, do not attempt to access non-public records (`pending`, `rejected`, moderation queues, correction requests — ADR 0001), and do not circumvent access controls or use the Service to harass or facilitate harm.
4. **No commercial resale of the Service itself.** Reuse of the *data* under ODbL 1.0 (including commercial reuse) remains permitted; this clause concerns reselling the Service as a product.

## 5. Reports and publication

1. **No guarantee of publication.** Every report enters the database as `pending` (ADR 0001). Trained human moderators screen, verify, and decide per MODERATION.md. A report may be rejected, hidden, or removed at any time; rejected content is never published and is scheduled for deletion 30 days after the rejection decision (RETENTION_SCHEDULE.md R2; automated enforcement is a pre-launch implementation item, see § 15).
2. **What you keep and what you grant.** You retain whatever rights you have in the content you submit. By submitting, you grant the project a non-exclusive, worldwide, royalty-free licence to store and review the report and — **if and only if** the record is verified and published — to publish it and make it available under **ODbL 1.0**, as part of the open database, with attribution to contributors per the ODbL notice. No licence to publish is granted by the mere act of submitting.
3. **Your warranties.** By submitting you confirm that: the content is accurate to the best of your knowledge; you are entitled to share it; it complies with § 4; and you meet the minimum age for using the Service in your jurisdiction (in Italy, 14 years — art. 2-quinquies D.Lgs. 196/2003). **These warranties extend to every edit you make** (§ 5.6): each edit must be accurate to the best of your knowledge, must not introduce prohibited content (§ 4), and must be limited to what the record actually supports.
4. **Verification may be refused.** `source: official` records republished from official public sources follow their own legal regime, checked per record (LAWFUL_BASIS.md § 3.2); community reports are verified against the MODERATION.md publication standard, not against official registers.
5. **Photo evidence.** Reports may include photos (JPEG, PNG or WebP, up to **10 MB and 4096 px per side**). On upload, the service **strips EXIF/XMP/IPTC metadata at the boundary** (fail-closed: if the container cannot be walked safely the upload is rejected — never stored unstripped), verifies the container from magic bytes (never trusting the declared Content-Type), stores the sanitised bytes in object storage (**R2**) with metadata only in the database (**D1**), and keeps every photo **private (`pending`) and never public** until a moderator approves it with `redaction_confirmed = 1` — the moderator must confirm the subject was redacted. Photos follow the record's retention (RETENTION_SCHEDULE.md R6): deleted with the record, hard-deleted immediately if the record is rejected or removed. `storage_key` is never exposed; clients interact with photos by id only.
6. **Editing contributions (community editing).** Published records may be edited by contributors under the two-track edit flow (COMMUNITY_PLAN.md § 2; MODERATION.md "Edit moderation"):
   - **Every edit is attributed and tracked.** Each edit creates an append-only revision (author, timestamp, diff, reason); the author field is de-attributed to `NULL` only if the contributor's account is erased (PRIVACY_NOTICE.md § 7 R14). Record history is never rewritten in place — the public revision history shows what changed, when, and by whom (pseudonymously) (PRIVACY_NOTICE.md § 3, R14).
   - **Edits are moderated.** Edits to verified records go through the moderation gate (pending → review, MODERATION.md "Edit moderation") before becoming public; a moderator may reject, revert, or hide an edit. Edits to `pending` records follow the direct-edit path described in MODERATION.md. Inaccurate or prohibited edits are reverted or removed (§ 11).
   - **Reverts and corrections.** If a published edit turns out to be wrong, the correction path of § 6 applies: the edit can be reverted, the record corrected, and the revision history retains the audit trail.

## 6. Moderation, corrections, appeals

1. Moderation follows MODERATION.md and MODERATION_SLA.md: emergency hides within **24 h**, first response within **48 h**, substantive decision within **14 days**, re-review of temporary hides within **30 days**. The edit-moderation queue (entity `camera_edit`) follows the same rules and SLA as the submission queue (MODERATION.md "Edit moderation").
2. Any person affected by a moderation decision may request correction or removal by writing to `privacy@opensurveillancedb.org` — or, if you are a verified contributor, through the in-app correction form (home page, "Report a problem / correction" section) — within **30 days** of the decision; appeals are decided by a **different reviewer** than the original decision, with escalation to the advisory circle for disputed cases (MODERATION_SLA.md S5/S6). **The same appeal path covers decisions on edits** — including rejection, revert, or hide of a submitted edit — and decisions on published edits later found inaccurate (MODERATION.md "Edit moderation"; ADR 0014).
3. Data-subject rights (access, rectification, erasure, restriction, objection, portability) are described in PRIVACY_NOTICE.md § 7 and exercised through the same contact.

## 7. Licences

1. **Data:** the public database and its exports are licensed under **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** — reuse is permitted, including commercially, provided you attribute the database (attribution text to be finalised at launch) and, if you create a derivative database, you share it under ODbL 1.0. Exports carry the ODbL notice. Illustrative `demo` records are part of the licensed database.
2. **Software:** the application source code is licensed under **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)** (see LICENSE).
3. **Documentation:** project documentation is proposed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
4. **OpenStreetMap:** map background data is used under the OSM/ODbL terms; OSM attribution requirements apply (OSM_INTEGRATION.md).

## 8. Accuracy disclaimer

1. OpenSurveillanceDB is a **civic, community-maintained dataset — not an official record and not a statement of legal fact.** Records may be incomplete, outdated, or inaccurate despite human moderation; publication is deliberately conservative (ADR 0001). **Verified records are community-edited**: contributors may edit published records under § 5.6, and every edit is moderated before publication — but the community-edited nature means accuracy depends on the community and the moderation gate (MODERATION.md "Edit moderation"), not on any official verification.
2. Do not rely on the dataset for safety-critical or official decisions. Verify against official sources (e.g. the relevant public administration) before acting on it. The Service provides information about visible infrastructure only — it is not a directory of every camera, and absence of a record proves nothing.
3. Records from official sources are marked with their source and verification date; community records carry no such guarantee.
4. Published coordinates are rounded to **~4 decimal places (~10 m)** — zone-level precision (decision 2026-07-31, enforced at the public read boundary). The exact location is never published and remains in the private moderation record, visible only to moderators (MODERATION.md, step 4).

## 9. Privacy

Your use of the Service is governed by the privacy notice (PRIVACY_NOTICE.md), the lawful-basis assessment (LAWFUL_BASIS.md), the retention schedule (RETENTION_SCHEDULE.md), and the breach procedure (BREACH_PROCEDURE.md). Key points: no tracking, no behavioural advertising; reports are private while pending; your GDPR rights are exercisable via `privacy@opensurveillancedb.org` within the statutory timelines (art. 12(3) GDPR). **How you authenticate** is described in § 3.7 and PRIVACY_NOTICE.md § 3.1: email verification before write access, passkeys with a vendor note on sync, and OIDC with a tracking disclosure — each method's data is processed per PRIVACY_NOTICE.md § 3 and deleted on account erasure (§ 7 R15).

## 10. Availability and limitation of liability

1. The Service is provided **"as is" and "as available"**, without warranties of accuracy, completeness, availability, or fitness for a particular purpose.
2. To the maximum extent permitted by law, the project and its contributors are **not liable** for any damages — including indirect, incidental, or consequential loss — arising from the use of, or reliance on, the Service or its data. In particular, the project is not liable for decisions made on the basis of the dataset.
3. Nothing in these terms excludes or limits liability that cannot be excluded or limited by law (e.g. fraud, death or personal injury caused by negligence, mandatory consumer-protection rights).
4. The Service is not intended for emergency or safety-critical use; it does not replace official information channels.

## 11. Suspension and removal

1. We may suspend or limit access, or remove content, where necessary to enforce these terms, to protect users or data subjects, or per the moderation policy — aiming to notify the affected person where proportionate and possible.
2. Contributors may request deletion of their `pending` submissions via `privacy@opensurveillancedb.org`; verified published records are subject to the **12-month renewal** retention and review cycle (RETENTION_SCHEDULE.md R3; automated re-verification sweep is a pre-launch implementation item, see § 15) and to the correction path of § 6.
3. **Removal of incorrect edits.** A published edit that is inaccurate, prohibited (§ 4), or no longer supported by the record may be **reverted or removed** through the moderation queue or the correction path (§ 6), without waiting for the 12-month cycle: the revert keeps the audit trail in the revision history (PRIVACY_NOTICE.md § 3, R14) and the record returns to the last accurate state. Where the edit introduced personal data, the erasure path of PRIVACY_NOTICE.md § 8 applies in addition (art. 16/17 GDPR).

## 12. Applicable law and jurisdiction

1. These terms are governed by **EU law and, where applicable, Italian law** — in particular the GDPR and D.Lgs. 196/2003 (Codice Privacy, as amended by D.Lgs. 101/2018).
2. **Disputes:** the courts of the place where the controller is established (Italy) have jurisdiction, **without prejudice** to the right of consumers residing in the EU to bring proceedings in the courts of their own country of residence (Regulation (EU) 1215/2012, Brussels I recast) and to the protection of their mandatory national provisions (Regulation (EC) 593/2008, Rome I). *Final wording to be confirmed at launch.*
3. **Complaints:** you may complain to the competent supervisory authority — in Italy, the *Garante per la protezione dei dati personali* (www.garanteprivacy.it).

## 13. Changes to these terms

1. These terms are versioned and stored in the repository. **Material changes** (purpose, licensing, data publication, governance) require a documented public proposal and a reasonable comment period (GOVERNANCE.md "Decision making" § 4).
2. Non-material changes take effect on publication with a notice (e.g. a prominent update). Continued use of the Service after the effective date constitutes acceptance; where the law requires consent, it will be obtained separately.

## 14. Contact

- **Privacy, corrections, appeals, rights:** `privacy@opensurveillancedb.org` *(dedicated, monitored mailbox)*.
- Moderation/abuse emergencies use the same channel (MODERATION_SLA.md S1: hide within 24 h).

## 15. Pre-launch open items

- [x] Privacy contact decided (2026-07-31) and mailbox active (2026-08-01): `privacy@opensurveillancedb.org` (PRIVACY_NOTICE.md § 1/8).
- [x] Controller entity per CEO decision 2026-07-31: **Simone Rondina (syax89) / OpenSurveillanceDB — Italy** (PRIVACY_NOTICE.md § 1; final legal-entity wording to be confirmed at launch).
- [ ] Final review of the jurisdiction clause for the first operating jurisdictions (LAWFUL_BASIS.md § 6; MODERATION.md M5).
- [ ] Decide and implement the acceptance mechanics (clickwrap on the submission form vs. general browse terms) — implementation owner: Ada.
- [ ] **Retention enforcement (R1/R2/R3/R6):** implement the automated deletion/expiry job (`db/retention.ts` + cron trigger) per RETENTION_SCHEDULE.md § 3 — including photo evidence, whose retention is tied to the record (R6) — implementation owner: Ada; the schedule itself is approved and in force as policy, the code enforcement is pending pre-launch.
- [x] **Photo evidence upload implemented and documented (PR #64):** `POST /api/photos` with size/MIME/dimension caps, magic-byte verification, mandatory EXIF/XMP/IPTC stripping (fail-closed), sanitised bytes in R2 with metadata only in D1, and a moderation/redaction gate (`redaction_confirmed = 1`). TERMS § 4.1/§ 5.5 and PRIVACY_NOTICE § 3/§ 4 updated accordingly (2026-08-01); `docs/legal/REVIEW_PHOTO_UPLOAD_TERMS_ALIGNMENT_2026-08-01.md` records the coherence check.
- [x] **Account erasure endpoint (R7):** implemented and merged (PR #61). Contributor accounts have a self-service `DELETE /api/auth/account` route (ADR 0013, PR #57): the erasure is atomic with de-attribution of attributed reports (`contributor_id = NULL`, so the FK `cameras.contributor_id` never blocks deletion), revokes all sessions, and returns the number of de-attributed reports; the UI entry point is the account page (`/account`). Sessions already expire after 30 days (`AUTH_SESSION_TTL_DAYS`). Tracked in RETENTION_SCHEDULE.md R7.
- [x] **Link the legal documents from the UI:** the published site exposes TERMS_OF_USE.md / PRIVACY_NOTICE.md / OPEN_SOURCE.md as the public pages `/termini`, `/privacy` and `/licenze` (footer links on every page; layout and content sources in `docs/SITEMAP.md`). The repository copies remain canonical.
- [ ] **ADR:** record the adoption of these terms and the inbound data-licensing model (submission → ODbL only upon verification) as a proposed ADR (next free number, per GOVERNANCE.md) — the terms embed a licensing and data-publication decision that material changes require documenting.
- [ ] **Community features (v0.4):** the community clauses (§ 2, § 3.4–3.7, § 5.6, § 6, § 8, § 11) take effect with the community-system rollout (COMMUNITY_PLAN.md). Binding constraints before go-live: public profile strictly **opt-in, default private**; **no public leaderboard/ranking**; edit queue moderated (MODERATION.md "Edit moderation"); erasure extended to profile/verifications/edit authorship and tested before the schema PR merges (RETENTION_SCHEDULE.md R14; PRIVACY_NOTICE.md § 10).
- [ ] **Multi-method auth (v0.6, ADR 0020):** the § 3.7 clauses take effect with the AUTH MULTI-METODO rollout. Binding constraints before go-live: email verification enforced for write access (read-only sessions until verified, Fase B/E1); OIDC **not active** until the activation gate passes (GitHub/Google DPA + EU–US DPF verified, PROCESSOR_REGISTER.md PR5/PR6 flipped from conditional to active — Fase D); passkey enrollment issues recovery codes and keeps the email+password fallback (Fase C); erasure covers the new auth data and is tested before the schema PR merges (RETENTION_SCHEDULE.md R15).

---

*Draft note: the 2026-07-31 Wave A decisions (ODbL 1.0 data licence, ~4-decimal coordinate precision, 12-month retention renewal, privacy contact, controller entity) are applied. Remaining placeholder — jurisdiction wording (§ 12) — must be finalised at launch. This document is a deliverable of the pre-launch legal review (task t_05d84417, action list #2) and is not a published commitment.*
