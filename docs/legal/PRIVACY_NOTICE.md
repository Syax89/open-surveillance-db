# Privacy notice

- **Status:** in force — personal open-source project (controller: Simone Rondina, syax89 — not a company); finalised 2026-08-08; decisions of 2026-07-31 applied (controller entity, data licence ODbL 1.0, coordinate precision ~4 decimals, privacy contact `privacy@opensurveillancedb.org`); monitored mailbox active. **Community-driven model applied (ADR 0021, 2026-08-04):** reports publish immediately from verified contributor accounts; accuracy is maintained by community actions with automatic thresholds; the public per-record history carries no attribution; private corrections and the legal-emergency power are the only human steps left.
- **Legal basis:** GDPR art. 13 (data collected from data subjects) and art. 14 (data not obtained from the data subject, e.g. records sourced from official public sources); D.Lgs. 196/2003 (Codice Privacy, IT) as primary jurisdiction.
- **Version:** 0.11 (2026-08-05) — **community-driven pivot (ADR 0021):** § 2 rewritten (immediate publication from verified accounts, community accuracy); § 3 table aligned (report content feeds community accuracy actions; verifications → community actions; edit-history row removed; community-profile row removed — the opt-in public profile is not implemented); § 4 negative scope (reports publish immediately; exact location stays in the database, never published); § 5 recipients (published records; withdrawn records excluded from future exports); § 7 retention rewritten on the community model (no pending/rejected/12-month-renewal cycle; records stay public while the community keeps confirming them; withdrawn records excluded from public outputs); § 8 rights aligned with the correction path (private corrections; erasure covers community actions, ADR 0021 § 13); § 10 open items updated. **Follow-up copy fixes (2026-08-05, t_499df642):** § 3.1 auth wording aligned to community actions ("submit reports or act on records"), § 3/§ 5 residual human steps clarified (photo approval acts on the photo's own status, never on the record lifecycle). Prior version 0.10 (2026-08-02) — **multi-method authentication disclosed (ADR 0020, AUTH MULTI-METODO):** new § 3.1 "How you authenticate" (three methods and what each implies — email+password with verification, passkeys, OIDC via GitHub/Google); § 3 new rows (email-verification token, passkey credential, recovery codes, OIDC identity attributes — never the provider email); § 4 negative scope (no email imported from OIDC providers); § 5 recipients (GitHub/Google **conditional** — dormant until OIDC activation, Cloudflare Email Routing under PR1); § 6 transfers (OIDC US providers under DPA + EU–US DPF at activation; passkey-sync vendor note); § 7 retention **R15**; § 10 open item (OIDC activation gate). Prior version 0.9 (2026-08-01): privacy contact updated: monitored mailbox active at `privacy@opensurveillancedb.org` (ADR 0008 resolved; § 1 and § 10 updated — "to be created/provisioned" notes removed). Prior version 0.8 (2026-08-01): community-profile processing disclosed, per the community-system legal opinion (COMMUNITY_PLAN.md § 5): § 3 new rows (community profile, verifications given/received, edit history) on legal basis art. 6(1)(f) — **never consent** (core feature, imbalance art. 6(1)(a)); § 4 clarifies trust levels/verifications are **not** profiling and there is **no public leaderboard/ranking**; § 5 extends the public-as-recipient disclosure to the **opt-in public profile** (default private); § 7 references the new retention rule **R14** (RETENTION_SCHEDULE.md); § 8 makes arts. 16/17/21 explicit for profile/contributions; § 10 open item. Prior version 0.7 (2026-08-01): recipients (§ 5) and international transfers (§ 6) updated: Cloudflare **R2** photo storage added (PR #64), aligned with PROCESSOR_REGISTER.md PR1; R2 bucket region/jurisdiction to be confirmed with the CTO (see § 10). Photo evidence row (§ 3) and negative scope (§ 4) aligned with the active upload flow (PR #64): EXIF/XMP/IPTC stripping fail-closed, R2/D1 storage, moderation + redaction gate. Prior version 0.6 (2026-07-31): § 5 recipients updated with the exact cloud providers (Cloudflare Workers/D1/R2; OpenAI ChatGPT sign-in for moderators) and § 6 transfers; § 10 open items (SCC version, R2 region, controller entity, retention enforcement). Prior version 0.5 (2026-07-31): published-coordinate precision **~4 decimal places (~10 m)** (zone-level; exact location private), retention of verified records **12 months with renewal**, privacy contact decision, controller entity decision, correction/removal contact. Prior version 0.4 (2026-07-31): data licence **ODbL 1.0**; lawful-basis table aligned with LAWFUL_BASIS.md; § 5 recipient "the public (publication itself)" added. Prior version 0.3 (2026-07-31): children (14 years, art. 2-quinquies D.Lgs. 196/2003) and special-category notes; negative scope; DPO exclusion note (ADR 0017). Prior version 0.2 (2026-07-30): photo evidence row; correction request row; first full legal-basis table. Prior version 0.1 (2026-07-29): first draft (controller, scope, retention principles).

> **Disclaimer:** this document is product guidance / not legal advice. The document is in force for the pilot jurisdiction (Italy); per-jurisdiction review remains the documented precondition for an EU-wide launch.

---

## 1. Who we are (controller)

- **Controller:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy (decision 2026-07-31; governance owners in ../GOVERNANCE.md).
- **Privacy contact / data-protection contact:** `privacy@opensurveillancedb.org` *(dedicated, monitored mailbox)* — for any question, data-subject request, or report. Response time: see § 8.
- **Data protection officer (art. 37 GDPR):** none appointed — the obligation does not apply to this project (no public authority, no large-scale systematic monitoring of data subjects, no large-scale special-category processing; documented in ADR 0017). The privacy contact above serves as the data-protection contact.

## 2. What the service does

OpenSurveillanceDB publishes a public-interest map of **visible, public surveillance infrastructure** (e.g. cameras mounted in public streets, squares, station exteriors), **published immediately from verified contributor accounts** and kept accurate by the community through confirmations, flags and automatic thresholds (ADR 0021). It is a civic-transparency project, not a commercial platform: no behavioural advertising, no tracking, no sale of data.

## 3. What personal data we process

| Data | Source | Purpose | Legal basis |
|------|--------|---------|-------------|
| Report content: location, description, optional `manufacturer` / `observedOn`, private `notes` | Reporter (data subject) | Build the public record; community accuracy actions | art. 6(1)(f) (see LAWFUL_BASIS.md) |
| Contributor pseudonymous internal ID + submission timestamp | Reporter | Abuse prevention, provenance | art. 6(1)(f) |
| Contributor account (email, optional display name, password hash) | Contributor (voluntary registration, ADR 0013) | Login, attribution of submissions, abuse prevention | art. 6(1)(f) — minimising: optional, pseudonymous handle, PBKDF2-SHA256 hashed password, never exposed in API responses |
| Session records (hashed token, CSRF token, timestamps) | The project (login) | Keep the contributor logged in; CSRF protection | art. 6(1)(f); token stored only as SHA-256, expires after **30 days** or on logout (RETENTION_SCHEDULE.md R7) |
| Photo evidence (JPEG/PNG/WebP uploads, ≤10 MB / 4096 px) | Reporter | Verification of the record | art. 6(1)(f); EXIF/XMP/IPTC stripped at the boundary (fail-closed), bytes in R2 with metadata only in D1, retained private and tied to the record (RETENTION_SCHEDULE.md R6/R13); never public until a moderator approves with `redaction_confirmed = 1` |
| Correction / takedown request (contact details the requester provides, e.g. email) | Requester | Exercise of rights, harm reports | art. 6(1)(c) (GDPR arts. 15-22) and 6(1)(f) |
| Community actions on records (action type `like` / `confirm` / `gone` / `problem` / `privacy`, weight snapshot, timestamp) | Contributor (verified account) | Dataset accuracy — community-driven moderation | art. 6(1)(f); one action per user per record (`UNIQUE(camera_id, contributor_id)`), weight snapshot at action time, **aggregates only in public payloads** — never attributed to any profile (ADR 0021 § 3/§ 13) |
| Moderator identity (email, display name, full name via ChatGPT sign-in) | OpenAI (identity provider) | Authenticate moderators for the residual human steps: photo redaction approval — which acts on the **photo's own status**, never on the record lifecycle — and legal-emergency actions (../MODERATION.md) | art. 6(1)(f); **never logged or stored by the application** |
| Moderation audit entries (decision, reason code, timestamp, reviewer **pseudonym**) | The project | Accountability; historical appeals closed by migration (ADR 0021 § 7) | art. 6(1)(f); never public (aggregate transparency reports only) |
| Published records | Published reports / official public sources | The public dataset (ODbL 1.0) | art. 6(1)(f) / 6(1)(e) — see LAWFUL_BASIS.md |
| Email-verification token (SHA-256 hash of a single-use token, 24 h TTL) | The project (verification email sent through Cloudflare Email Routing) | Prove ownership of the email; unlock write access | art. 6(1)(f); stored only as SHA-256, single-use, deleted after use or after 24 h (RETENTION_SCHEDULE.md R15); re-send rate-limited (3/h) |
| Passkey credential (credential_id, COSE public key, sign counter) | Contributor's device (WebAuthn enrollment, optional method) | Passwordless, phishing-resistant login | art. 6(1)(f); public-key material only — no secret ever stored server-side; anti-replay counter; **synced passkeys** are backed up through the OS vendor's cloud (Apple/Google/Microsoft) at the user's choice (§ 3.1); hard-deleted at account erasure (R15) |
| Recovery codes (10, hashed) | The project (issued at passkey enrollment) | Regain access after device loss | art. 6(1)(f); stored only hashed, single-use, replaced on re-enrollment; deleted at account erasure (R15) |
| OIDC identity attributes (provider, `external_sub`, verified flag — **never the email**) | GitHub / Google (identity provider — **only if the contributor chooses that method**, § 3.1) | Login via GitHub/Google; account linking to the contributor | art. 6(1)(f); no email imported; the provider observes the login and the IP (§ 3.1/§ 5/§ 6); dormant until the OIDC activation gate (PROCESSOR_REGISTER.md PR5/PR6) |

**Records from official public sources (art. 14(2)(f)):** where a record is republished from an official public source (`source: official`), the data was not obtained from the data subject. The source categories are: public registers and transparency portals of public administrations (e.g. in Italy, D.Lgs. 33/2013 datasets), published public-authority documents, and other publicly accessible official sources. Such records are checked per record under the source's own legal regime (see LAWFUL_BASIS.md § 3.2).

**Public per-record event history (ADR 0021 § 7):** every community transition (published, confirmed, liked, gone-flagged, hidden, removed, restored) is recorded in a **public lifecycle history without any attribution** — no contributor ids, emails, or IP-derived data in public rows. It is a transparency control of the controller, not a new collection of personal data (aggregates only).

**Voluntary provision (art. 13(2)(e)):** providing data for a report is **voluntary** — it is neither a statutory nor a contractual requirement. The only consequence of not providing it is that the report cannot be processed (or, for optional fields, that the record will carry less detail). There is no obligation to provide data, and no penalty for declining.

**Special categories (art. 9 GDPR):** none are intentionally collected. Evidence that incidentally captures identifiable people, plates, or private interiors is redacted or deleted (../MODERATION.md; RETENTION_SCHEDULE.md R6).

**Children:** the service is addressed to adults. In Italy, submitting a report requires the age of consent for information-society services (14 years, art. 2-quinquies D.Lgs. 196/2003); other jurisdictions apply their own age thresholds.

### 3.1 How you authenticate — three methods, your choice (ADR 0020)

Contributor accounts can be used with **three authentication methods**. You
choose; none is ever required to **browse** the public data. Submitting a
report or a correction requires a **verified contributor account** (ADR 0020,
write gate Fase E1 — anonymous → 401, unverified → 403). What each implies:

1. **Email + password (baseline).** The email is collected directly from you
   and used for login and attribution. **Email verification is required for
   write access**: after registration we send a single-use verification email
   (24 h validity) through **Cloudflare Email Routing**
   (`opensurveillancedb.org`) — the email contains only the tokenised link,
   no tracking pixels or links. Until you verify, your session is **read-only**
   (you cannot submit reports or act on records — community actions). Password
   reset uses the same mailer with the same single-use discipline.
2. **Passkeys (WebAuthn, optional).** You can enroll a passkey on your device
   and log in with biometrics/PIN instead of typing a password. The site
   stores only **public-key material** — the private key never leaves your
   device. **Vendor note:** if you use a *synced* passkey (backed up through
   Apple/Google/Microsoft cloud sync), the OS vendor learns that you have an
   account on this site; the site shares nothing with the vendor and you
   control whether sync is on. Device loss is covered by 10 single-use
   recovery codes issued at enrollment.
3. **OIDC via GitHub or Google (optional, opt-in).** You can log in with your
   GitHub or Google account. **Tracking disclosure:** choosing this method
   means GitHub or Google **observes that you sign in to this site, and your
   IP address**, at every login, and your account link is subject to the
   provider's own account security (including their 2FA). The provider's own
   terms and privacy policy apply at sign-in. We deliberately **do not
   import your email** from the provider — we only store the provider's
   subject id and verified flag, so the provider is never a source of your
   contact details. This method is **dormant until the OIDC activation gate**
   (DPA + EU–US Data Privacy Framework verified, PROCESSOR_REGISTER.md
   PR5/PR6) and is disclosed with a risk matrix on the login page.

You can change or add methods from your account page; deleting the account
deletes the data of every method (verification tokens, passkeys, recovery
codes, OIDC link) as described in § 7 (R15) and § 8.

## 4. What we do NOT collect or publish (negative scope)

- **No video, live streams, credentials, network information, or control interfaces** — the project documents the *existence* of visible surveillance infrastructure, never its output or access.
- **No private-home cameras** or cameras pointing into private interiors.
- **No personal names, faces, vehicle plates, or precise operational details** (../PRIVACY_AND_SAFETY.md, ../MODERATION.md).
- **No coordinates beyond zone-level precision:** published locations are rounded to **~4 decimal places (~10 m)**; the exact location stays in the database and is never published (decision 2026-07-31; enforced at the public read boundary — `db/cameras.ts` `roundPublicCoordinate`).
- **No behavioural advertising, no tracking, no sale of data**, no analytics libraries.
- **No email imported from OIDC providers.** Even when you sign in with GitHub or Google, we never import or store the email from the provider — the account email always comes from you directly (only the provider's subject id and verified flag are stored; § 3).
- **No published photo without moderation and confirmed redaction:** uploaded photos (JPEG/PNG/WebP, ≤10 MB / 4096 px) are stripped of EXIF/XMP/IPTC metadata at the boundary (fail-closed — a container that cannot be walked safely is rejected, never stored unstripped), stored with sanitised bytes in R2 and metadata only in D1, and are **never public** until a moderator approves them with `redaction_confirmed = 1` (../PRIVACY_AND_SAFETY.md; ../MODERATION.md). The storage key is never exposed.
- **Reports are published immediately** from verified accounts and are part of the public dataset from the moment they are submitted. Content that violates the rules is withdrawn by the community or by a legal emergency, and withdrawn content is never re-published (ADR 0021).

This negative scope strengthens the reasonable expectations of data subjects and is a material input to the art. 6(1)(f) balancing test (LAWFUL_BASIS.md § 3.1).

## 5. Recipients and transfers

- **Cloudflare, Inc.** — hosting, database, object storage **and transactional email** (Workers + D1 + **R2** for photo evidence + **Email Routing** for account verification/password-reset emails). Processor (art. 28) under the Cloudflare Data Processing Addendum (**DPA v6.3, June 2025**) incorporating **EU Standard Contractual Clauses (2021/914)**; Cloudflare is certified under the **EU–US Data Privacy Framework** (additional transfer ground). D1 configured for EU residency (`weur` location hint). **R2** (`PHOTOS` bucket) stores only **EXIF/XMP/IPTC-stripped photo bytes** (metadata stays in D1); its region/jurisdiction is not declared in the repo config — to be confirmed with the CTO and pinned to the EU if photo evidence is treated as personal data (see PROCESSOR_REGISTER.md § 4 open item). **Email Routing** carries only the recipient address and the tokenised verification/reset link, with **zero tracking pixels/links**. See PROCESSOR_REGISTER.md.
- **GitHub, Inc. / Google LLC (OIDC identity providers — conditional, dormant).** If you **choose** to sign in with GitHub or Google, those providers authenticate you and we receive only the subject id and verified flag (**no email**). **Tracking disclosure:** the provider observes the sign-in and your IP. This method is **dormant until the OIDC activation gate passes** (DPA + EU–US DPF verified; PROCESSOR_REGISTER.md PR5/PR6) — until then no login data flows to them. The provider's own terms and privacy policy apply at sign-in.
- **OpenAI (ChatGPT sign-in)** — identity provider for moderators (the residual human steps: photo redaction approval — on the photo's own status only — and legal-emergency actions). OpenAI is an **independent controller of its own authentication service** (its privacy policy applies at sign-in); no OpenSurveillanceDB data is sent to OpenAI — we only receive the identity attributes listed in § 3. Never published, never logged.
- **Publication itself:** published records become part of a public dataset licensed ODbL 1.0 and may be downloaded/exported (JSON/CSV/GeoJSON). This is the purpose of the service, disclosed here. Copies already downloaded cannot be recalled; withdrawn records are excluded from future exports.
- No other recipients; no behavioural advertising; no analytics libraries.

## 6. International data transfers (Cap. V GDPR)

- Cloudflare: transfers covered by the Cloudflare DPA incorporating **EU Standard Contractual Clauses (2021/914)**; supplementary measures assessed for US processing (encryption in transit, EU residency for D1; **R2 photo storage — region/jurisdiction to be confirmed with the CTO, EU pinning recommended and tracked in PROCESSOR_REGISTER.md § 4 open items**). Full assessment in PROCESSOR_REGISTER.md.
- **OIDC (GitHub/Google, conditional):** if activated (Fase D), the identity exchange happens with US-based providers; covered by their DPAs (SCCs) and **EU–US Data Privacy Framework** certification, verified and recorded before activation (PROCESSOR_REGISTER.md § 2/§ 4 — activation gate). The residual exposure is the provider's own observation of the login event and the caller's IP — disclosed at § 3.1/§ 5 and on the login page.
- **Passkey sync (vendor note):** if you use a *synced* passkey, your credential is backed up through the OS vendor's cloud (Apple/Google/Microsoft). The site performs no transfer of your data to those vendors — only your device's sync service moves the credential at your choice, and you can disable sync at any time (§ 3.1).
- OpenAI sign-in: identity attributes are exchanged with OpenAI's services; the sign-in flow is governed by OpenAI's terms/privacy policy (see above).

## 7. Retention

Reports are published immediately and stay public while the community keeps confirming them; records withdrawn by the community or by a legal emergency are excluded from public outputs and follow the repository retention schedule (RETENTION_SCHEDULE.md). Correction requests and audit entries: **2 years**. Evidence: tied to the record. Operational logs: up to **12 months** (aggregate). Backups: rotated by the provider (up to **30 days** point-in-time recovery).

The detailed rules remain in the repository retention schedule (RETENTION_SCHEDULE.md), including: **community data (R14)** — community actions follow the account (active → erasure; actions cast on other records are deleted with the contributor, ADR 0021 § 13, and the public lifecycle history keeps only aggregates); **authentication-method data (R15, ADR 0020)** — email-verification tokens 24 hours, reset tokens 3 hours (single-use, deleted on use); passkeys and recovery codes while the account is active, **hard-deleted at account erasure** — nothing survives to link the account to a provider or a device; **failed-login counters (R16)**, per-IP registration-cap log (R17) and the transactional-email log (R18) swept by the retention cron. **Photo evidence follows its own lifecycle (R13):** uploads never linked to a report are deleted after **90 days**; rejected photos after **30 days**; approved photos follow the record's retention; deletion always includes the stored image bytes in R2, not only the database row. **Demo records (R12)** are purged by the retention cron outside development.

Automated enforcement of the deletion and expiry rules is a pre-launch implementation item; until then the schedule is applied by the automated retention sweep.

## 8. Your rights (GDPR arts. 15-22)

You may request, free of charge:

- **Access** (art. 15) — confirmation and copy of your data.
- **Rectification** (art. 16) — correction of inaccurate data: you may correct your display name, profile settings, and your own submissions; inaccurate record data can be corrected through the private correction path (see TERMS § 6 — corrections are private and never change the map automatically).
- **Erasure** (art. 17) — deletion, subject to the exceptions in art. 17(3) and the retention schedule. **Account erasure covers the account, sessions and your community actions** (ADR 0021 § 13): your actions on other records are deleted atomically with the account (art. 17); the record history survives without the link to you, in aggregates only. See RETENTION_SCHEDULE.md R7/R14.
- **Restriction** (art. 18) and **objection** (art. 21).
- **Portability** (art. 20) — where technically applicable.
- No automated decision-making, including profiling, is performed (art. 22). Trust levels are derived automatically from verified contributions, but they are informative indicators with transparent, non-discriminatory criteria — they do not produce legal or similarly significant effects (ADR 0018/0021).

**How to exercise them:** write to `privacy@opensurveillancedb.org`. To protect data subjects, we may ask you to verify your identity (proportionate to the request, e.g. by confirming details only you could know or providing a copy of an ID for requests about your personal data).

**Timeline:** we respond within **1 month** (art. 12(3)); this may be extended by up to 2 further months for complex requests, with notice. If we refuse, we explain why and remind you of your right to complain.

**Complaints:** you may complain to the competent supervisory authority — in Italy, the *Garante per la protezione dei dati personali* (www.garanteprivacy.it).

## 9. Contact and monitoring

- Privacy contact: `privacy@opensurveillancedb.org` — first response within 48 h, substantive response within 14 days.
- This notice is reviewed at launch and then at least annually, or on any material change; the version history is kept in the repository.

## 10. Open items before launch

- [x] **Italian localization of this notice** (primary jurisdiction; GDPR art. 12(1) "clear and plain language") — published bilingually (Italian + English) as the public page `/privacy` (web adaptation of this notice; the repository copy remains canonical — see `docs/SITEMAP.md`).
- [x] Data licence: **ODbL 1.0** (decision 2026-07-31).
- [x] Publication precision: coordinates rounded to **~4 decimal places (~10 m)**; exact detail never published (decision 2026-07-31).
- [x] Correction/removal contact: `privacy@opensurveillancedb.org` + private form (decision 2026-07-31; mailbox active 2026-08-01).
- [x] Controller entity: **Simone Rondina (syax89) / OpenSurveillanceDB, Italy** (decision 2026-07-31).
- [x] **Photo evidence retention defined (R13):** pending/orphan uploads 90 days, rejected photos 30 days, approved photos follow the record's retention; deletion includes the R2 image bytes (RETENTION_SCHEDULE.md R13). Enforcement tracked in the retention sweep (`db/retention.ts`).
- [x] Provision the monitored mailbox `privacy@opensurveillancedb.org` (ops) — active since 2026-08-01 (ADR 0008).
- [x] **Contributor-account processing disclosure:** re-checked after PR #57 and PR #61 landed on `main` — the account data rows in § 3 and the session/account retention (R7) match the implementation, and the account-erasure endpoint is implemented (`DELETE /api/auth/account`, de-attribution `contributor_id = NULL`, session revocation; UI entry point: the account page `/account` — see TERMS § 15).
- [x] **Photo evidence disclosure aligned with the active upload flow (PR #64):** § 3 (photo evidence row) and § 4 (negative scope) now describe EXIF/XMP/IPTC stripping at the boundary (fail-closed), R2 bytes + D1 metadata, the moderation/redaction gate (`redaction_confirmed = 1`), and retention R6/R13. Coherence check: `docs/legal/REVIEW_PHOTO_UPLOAD_TERMS_ALIGNMENT_2026-08-01.md`.
- [x] **Community-driven model (ADR 0021) reflected:** § 2, § 3, § 4, § 5, § 7 and § 8 updated to the community model (immediate publication, community actions with automatic thresholds, public history without attribution, private corrections, legal emergency as the only human write power). **Follow-up (aligned, t_499df642):** RETENTION_SCHEDULE.md (R1–R3 rewritten on the community model, no time-based retention; R13/R14 aligned), MODERATION.md and MODERATION_SLA.md rewritten on the residual model (photo gate + legal emergency only), COMMUNITY_PLAN.md marked superseded; DATA_MODEL.md is aligned separately by the CTO (t_e480aa1e).
- [ ] Confirm the applicable SCC version at DPA execution (new-generation SCCs announced for adoption in 2025 — see PROCESSOR_REGISTER.md open items).
- [ ] **Confirm the R2 photo bucket region/jurisdiction with the CTO (ada)** — bucket `opensurveillancedb-photos`; pin an EU jurisdictional restriction if photo evidence is treated as personal data (set at bucket creation, immutable; see PROCESSOR_REGISTER.md § 4). Update § 5/§ 6 and the register once confirmed.
- [ ] **OIDC activation gate (ADR 0020, Fase D):** before GitHub/Google sign-in goes live — execute/verify the GitHub and Google DPAs, verify their **EU–US DPF certifications**, flip PROCESSOR_REGISTER.md PR5/PR6 from conditional to active, re-run the § 6 transfer assessment and update § 3/§ 5/§ 6 wording (the "dormant" notes become active). Until then this notice describes the method as not yet available.
- [ ] Per-jurisdiction review (see LAWFUL_BASIS.md § 6) and external counsel review.

---

*Final note (2026-08-08): the notice is in force for the pilot jurisdiction (Italy). Per-jurisdiction review by qualified counsel remains the documented precondition for an EU-wide launch (see LAWFUL_BASIS.md § 6).*
