# Privacy notice

- **Status:** in force — personal open-source project (controller: Simone Rondina, syax89 — not a company); finalised 2026-08-08 and aligned with the current implementation.
- **Legal basis:** GDPR art. 13 (data collected from data subjects) and art. 14 (data not obtained from the data subject, e.g. records sourced from official public sources); D.Lgs. 196/2003 (Codice Privacy, IT) as primary jurisdiction.
- **Version:** 0.15 (2026-08-09) — API access credentials (ADR 0023, write-auth epic): § 3 adds the "API access credentials" category (hash-only storage, throttled last-used, per-key limits, retention R21); new § 3.2 describes API keys (write-only, show-once, revocation); § 7 adds R21 (90-day sweep after revocation/expiry); § 8 extends account erasure to API keys.
- **Decisions applied:** controller entity **Simone Rondina (syax89) / OpenSurveillanceDB — Italy** (2026-07-31); data licence **ODbL 1.0**; published coordinates rounded to **~4 decimal places (~10 m)**; privacy contact `privacy@opensurveillancedb.org` (dedicated, monitored mailbox, active).

> **Disclaimer:** this document is product guidance / not legal advice. It is in force for the pilot jurisdiction (Italy); per-jurisdiction review remains documented for an EU-wide launch.

---

## 1. Who we are (controller)

- **Controller:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy (governance owners in ../GOVERNANCE.md).
- **Privacy contact / data-protection contact:** `privacy@opensurveillancedb.org` *(dedicated, monitored mailbox)* — for any question, data-subject request, or report. Response times: first response within 48 h, substantive response within 14 days.
- **Data protection officer (art. 37 GDPR):** none appointed — the obligation does not apply to this project (no public authority, no large-scale systematic monitoring of data subjects, no large-scale special-category processing; documented in ADR 0017 and DPO_EXCLUSION.md). The privacy contact above serves as the data-protection contact.

## 2. What the service does

OpenSurveillanceDB publishes a public-interest map of **visible, public surveillance infrastructure** (e.g. cameras mounted in public streets, squares, station exteriors), **published immediately from verified contributor accounts** and kept accurate by the community through confirmations, flags and automatic thresholds (ADR 0021). It is a civic-transparency project, not a commercial platform: no behavioural advertising, no tracking, no sale of data.

## 3. What personal data we process

| Data | Source | Purpose | Legal basis |
|------|--------|---------|-------------|
| Report content: location, description, optional `manufacturer` / `observedOn`, private `notes` | Reporter (data subject) | Build the public record; community accuracy actions | art. 6(1)(f) (see LAWFUL_BASIS.md) |
| Contributor pseudonymous internal ID + submission timestamp | Reporter | Abuse prevention, provenance | art. 6(1)(f) |
| Contributor account (email, optional display name, password hash) | Contributor (voluntary registration, ADR 0013) | Login, attribution of submissions, abuse prevention | art. 6(1)(f) — minimising: optional, pseudonymous handle, PBKDF2-SHA256 hashed password, never exposed in API responses |
| Session records (hashed token, CSRF token, timestamps) | The project (login) | Keep the contributor logged in; CSRF protection | art. 6(1)(f); token stored only as SHA-256, expires after **30 days** or on logout (RETENTION_SCHEDULE.md R7) |
| Correction / takedown request (contact details the requester provides, e.g. email) | Requester | Exercise of rights, harm reports | art. 6(1)(c) (GDPR arts. 15–22) and 6(1)(f) |
| Community actions on records (action type `like` / `confirm` / `gone` / `problem` / `privacy`, weight snapshot, timestamp) | Contributor (verified account) | Dataset accuracy — community-driven moderation | art. 6(1)(f); one action per user per record (`UNIQUE(camera_id, contributor_id)`), weight snapshot at action time, **aggregates only in public payloads** — never attributed to any profile (ADR 0021 § 3/§ 13) |
| Moderator role (on a verified contributor account — **no separate credentials**; the same authentication methods as any contributor: email + password, passkey, or OIDC via GitHub/Google) | The project | Residual human steps: legal-emergency hide/remove actions (../MODERATION.md) | art. 6(1)(f); never logged or stored by the application; reviewer pseudonym only in audit logs (M4) |
| Moderation audit entries (decision, reason code, timestamp, reviewer **pseudonym**) | The project | Accountability; historical appeals closed by migration (ADR 0021 § 7) | art. 6(1)(f); never public (aggregate transparency reports only) |
| Published records | Published reports / official public sources | The public dataset (ODbL 1.0) | art. 6(1)(f) / 6(1)(e) — see LAWFUL_BASIS.md |
| Email-verification token (SHA-256 hash of a single-use token, 24 h TTL) | The project (verification email sent through Cloudflare Email Routing) | Prove ownership of the email; unlock write access | art. 6(1)(f); stored only as SHA-256, single-use, deleted after use or after 24 h (RETENTION_SCHEDULE.md R15); re-send rate-limited (1 email per 5 minutes per contributor, enforced atomically in D1 — issue #440) |
| Passkey credential (credential_id, COSE public key, sign counter) | Contributor's device (WebAuthn enrollment, optional method) | Passwordless, phishing-resistant login | art. 6(1)(f); public-key material only — no secret ever stored server-side; anti-replay counter; **synced passkeys** are backed up through the OS vendor's cloud (Apple/Google/Microsoft) at the user's choice (§ 3.1); hard-deleted at account erasure (R15) |
| Recovery codes (10, hashed) | The project (issued at passkey enrollment) | Regain access after device loss | art. 6(1)(f); stored only hashed, single-use, replaced on re-enrollment; deleted at account erasure (R15) |
| OIDC identity attributes (provider, `external_sub`, display name, verified flag — **never the email**) | GitHub / Google (identity provider — **only if the contributor chooses that method**, § 3.1; buttons are shown only when the operator has configured the provider, PROCESSOR_REGISTER.md PR4/PR5) | Login via GitHub/Google; account linking to the contributor | art. 6(1)(f); no email imported; the provider observes the login and the IP (§ 3.1/§ 5/§ 6) |
| API access credentials (API keys — SHA-256 hash only, 10-character display prefix, scope list, created/expiry/revocation timestamps, throttled last-used timestamp) | Contributor (verified account — issued from the account page) | Authenticate programmatic **write access** (submit / confirm / edit / action) without a browser session | art. 6(1)(f); **raw key never stored** — shown exactly once at creation (ADR 0023); SHA-256 of the full key, constant-time compare; metadata-only in API responses; per-key **and** per-IP rate limits; max 5 active keys; see § 3.2 and RETENTION_SCHEDULE.md R21 |

**Records from official public sources (art. 14(2)(f)):** where a record is republished from an official public source (`source: official`), the data was not obtained from the data subject. The source categories are: public registers and transparency portals of public administrations (e.g. in Italy, D.Lgs. 33/2013 datasets), published public-authority documents, and other publicly accessible official sources. Such records are checked per record under the source's own legal regime (see LAWFUL_BASIS.md § 3.2).

**Public per-record event history (ADR 0021 § 7):** every community transition (published, confirmed, liked, gone-flagged, hidden, removed, restored) is recorded in a **public lifecycle history without any attribution** — no contributor ids, emails, or IP-derived data in public rows. It is a transparency control of the controller, not a new collection of personal data (aggregates only).

**Voluntary provision (art. 13(2)(e)):** providing data for a report is **voluntary** — it is neither a statutory nor a contractual requirement. The only consequence of not providing it is that the report cannot be processed (or, for optional fields, that the record will carry less detail). There is no obligation to provide data, and no penalty for declining.

**Special categories (art. 9 GDPR):** none are intentionally collected. Records are **text metadata only** — the image-evidence feature was removed (2026-08-08, `photos` table dropped by migration 0043), so there is no media upload at all. Report text that carries incidental personal data (e.g. a name or a plate in the description) violates the content rules and is handled by community moderation and corrections (../MODERATION.md; RETENTION_SCHEDULE.md R6; TERMS § 4).

**Children:** the service is addressed to adults. In Italy, submitting a report requires the age of consent for information-society services (14 years, art. 2-quinquies D.Lgs. 196/2003); other jurisdictions apply their own age thresholds.

### 3.1 How you authenticate — three methods, your choice (ADR 0020)

Contributor accounts can be used with **three authentication methods**. You
choose; none is ever required to **browse** the public data. Submitting a
report or a correction requires a **verified contributor account** (ADR 0020,
write gate — anonymous → 401, unverified → 403). What each implies:

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
   contact details. The buttons are shown **only when the operator has
   configured the provider** on the deployment (server-gated, PROCESSOR_REGISTER.md PR4/PR5); a risk matrix is shown on the login page.

You can change or add methods from your account page; deleting the account
deletes the data of every method (verification tokens, passkeys, recovery
codes, OIDC link) as described in § 7 (R15) and § 8.

### 3.2 API keys — write access for scripts and tools (ADR 0023)

Verified contributors can issue **personal API keys** (up to **5 active** at a
time) from their account page to authenticate programmatic **write access** —
`submit` (reports and corrections), `confirm`, `edit`, `action` — without a
browser session. Read access stays **keyless** (no key, no registration —
unchanged promise of the public read API).

- **Hash only.** Only the **SHA-256 hash** of the full key is stored (unique
  index, constant-time comparison); the raw key (`osdb_` + 32 random bytes,
  base64url) is shown **exactly once** at creation and can never be recovered
  — treat it like a password. A 10-character display prefix lets you recognise
  a key in the account list without exposing it.
- **Metadata only.** The key-management API exposes `name`, prefix, scopes,
  creation/expiry/revocation timestamps and a **throttled last-used timestamp**
  (updated at most every 5 minutes) — never the hash, never the raw key.
- **Lifecycle.** Keys expire after **365 days by default** (optional custom
  expiry at creation) and can be **revoked instantly** from the account page;
  revocation is a soft revoke that stops authentication immediately, with no
  grace period.
- **Per-key limits.** Each key is rate-limited **individually**, additively to
  the per-IP limits — one script cannot exhaust the shared budget, and a key
  can never exercise more than its scope.
- **Erasure (art. 17).** Account erasure hard-deletes **all** keys of the
  account in the same atomic batch (`eraseContributor`); revoked or expired
  keys are swept from storage after **90 days** (RETENTION_SCHEDULE.md R21).
- **Not a tracking device.** API keys are write-only credentials for a
  verified account — never used for profiling, never published, never logged.

## 4. What we do NOT collect or publish (negative scope)

- **No video, live streams, credentials, network information, or control interfaces** — the project documents the *existence* of visible surveillance infrastructure, never its output or access.
- **No private-home cameras** or cameras pointing into private interiors.
- **No personal names, faces, vehicle plates, or precise operational details** (../PRIVACY_AND_SAFETY.md, ../MODERATION.md).
- **No coordinates beyond zone-level precision:** published locations are rounded to **~4 decimal places (~10 m)**; the exact location stays in the database and is never published (decision 2026-07-31; enforced at the public read boundary — `db/cameras.ts` `roundPublicCoordinate`).
- **No behavioural advertising, no tracking, no sale of data**, no analytics libraries.
- **No email imported from OIDC providers.** Even when you sign in with GitHub or Google, we never import or store the email from the provider — the account email always comes from you directly (only the provider's subject id and verified flag are stored; § 3).
- **No image submission.** Image evidence was removed entirely on 2026-08-08 (CEO decision — "troppo rischioso e troppo esoso di spazio"): no image is accepted or stored by the application; records are text metadata only. Existing objects from the retired feature are **retained without deletion** (../PRIVACY_AND_SAFETY.md; ../MODERATION.md).
- **Reports are published immediately** from verified accounts and are part of the public dataset from the moment they are submitted. Content that violates the rules is withdrawn by the community or by a legal emergency, and withdrawn content is never re-published (ADR 0021).
- **No raw API-key material at rest, in transit beyond TLS, or in logs.** API keys are stored as **SHA-256 hashes only**; the raw key exists once, in the single creation response, and is never logged, never accepted in URLs, and never present in cacheable responses (§ 3.2; SECURITY.md scope).

This negative scope strengthens the reasonable expectations of data subjects and is a material input to the art. 6(1)(f) balancing test (LAWFUL_BASIS.md § 3.1).

## 5. Recipients and transfers

- **Cloudflare, Inc.** — hosting, database **and transactional email** (Workers + D1 + **Email Routing** for account verification/password-reset emails). Processor (art. 28) under the Cloudflare Data Processing Addendum (**DPA v6.3, June 2025**) incorporating **EU Standard Contractual Clauses (2021/914)**; Cloudflare is certified under the **EU–US Data Privacy Framework** (additional transfer ground). D1 configured for EU residency (`weur` location hint). **Email Routing** carries only the recipient address and the tokenised verification/reset link, with **zero tracking pixels/links**. See PROCESSOR_REGISTER.md.
- **OpenStreetMap Foundation (Nominatim — nominatim.openstreetmap.org, processor PR6).** Geocoding for the report flow and record pages: forward place-name search (`GET /api/geocode`, up to 5 suggestions) and reverse coordinate→address (`GET /api/geocode/reverse`, report-form prefill). Only the query itself is sent — free-text place/address strings and coordinates rounded to ~4 decimals (~11 m); the reply (display address) is stored in the D1 cache (`geocode_reverse_cache`, migration 0041). **No personal data, no account data, no profiling, requestor data never sent or logged.** Usage respects the Nominatim policy: max **1 req/s**, identifying User-Agent, cache-first so a repeated position never re-queries the network (PROCESSOR_REGISTER.md PR6).
- **GitHub, Inc. / Google LLC (OIDC identity providers — optional, only if you choose that method; buttons shown only when the operator has configured the provider).** If you sign in with GitHub or Google, those providers authenticate you and we receive only the subject id and verified flag (**no email**). **Tracking disclosure:** the provider observes the sign-in and your IP. The provider's own terms and privacy policy apply at sign-in. They are **independent controllers of their own authentication services** — no OpenSurveillanceDB data is sent to them; we only receive the identity attributes listed in § 3. Never published, never logged.
- **Publication itself:** published records become part of a public dataset licensed ODbL 1.0 and may be downloaded/exported (JSON/CSV/GeoJSON). This is the purpose of the service, disclosed here. Copies already downloaded cannot be recalled; withdrawn records are excluded from future exports.
- No other recipients; no behavioural advertising; no analytics libraries.

## 6. International data transfers (Cap. V GDPR)

- Cloudflare: transfers covered by the Cloudflare DPA incorporating **EU Standard Contractual Clauses (2021/914)**; supplementary measures assessed for US processing (encryption in transit, EU residency for D1). Full assessment in PROCESSOR_REGISTER.md.
- **OIDC (GitHub/Google, active where configured):** the identity exchange happens with US-based providers; covered by their DPAs (SCCs) and **EU–US Data Privacy Framework** certification (PROCESSOR_REGISTER.md PR4/PR5). The residual exposure is the provider's own observation of the login event and the caller's IP — disclosed at § 3.1/§ 5 and on the login page.
- **Passkey sync (vendor note):** if you use a *synced* passkey, your credential is backed up through the OS vendor's cloud (Apple/Google/Microsoft). The site performs no transfer of your data to those vendors — only your device's sync service moves the credential at your choice, and you can disable sync at any time (§ 3.1).
- OIDC sign-in (GitHub/Google, if you choose that method): identity attributes (provider, subject id, verified flag) are exchanged with the provider's services at sign-in; the flow is governed by the provider's terms and privacy policy.

## 7. Retention

Reports are published immediately and stay public while the community keeps confirming them; records withdrawn by the community or by a legal emergency are excluded from public outputs and follow the repository retention schedule (RETENTION_SCHEDULE.md). Correction requests and audit entries: **2 years**. Operational logs: up to **12 months** (aggregate). Backups: rotated by the provider (up to **30 days** point-in-time recovery).

The detailed rules remain in the repository retention schedule (RETENTION_SCHEDULE.md), including: **community data (R14)** — community actions follow the account (active → erasure; actions cast on other records are deleted with the contributor, ADR 0021 § 13, and the public lifecycle history keeps only aggregates); **authentication-method data (R15, ADR 0020)** — email-verification tokens 24 hours, reset tokens 3 hours (single-use, deleted on use); passkeys and recovery codes while the account is active, **hard-deleted at account erasure** — nothing survives to link the account to a provider or a device; **failed-login counters (R16)**, per-IP registration-cap log (R17) and the transactional-email log (R18) swept by the retention cron; **demo records (R12)** purged by the retention cron outside development; **legacy `pending` submissions (R19)** hard-deleted 90 days after submission and **legacy `rejected` records (R20)** hard-deleted 30 days after the rejection decision — both skipped while an appeal is open or a legal hold is active (published records are never deleted on a timer, ADR 0021 § 2.2); **API-key data (R21, ADR 0023)** — key hashes and metadata are kept **while the account is active**; **revoked or expired keys are hard-deleted 90 days after revocation/expiry** (enforcement lands with the `api_keys` backend); account erasure hard-deletes **all** keys of the account (art. 17); backups contain hashes only.

The deletion and expiry rules are **enforced automatically by the daily retention sweep** (scheduled in `worker/index.ts`, daily at 03:00 UTC — RETENTION_SCHEDULE.md § 3): the cron deletes expired rows (R12/R16/R17/R18), hard-deletes legacy `pending` submissions 90 days after submission (**R19**) and legacy `rejected` records 30 days after the decision (**R20**, both skipped while an appeal is open or a legal hold is active), archives audit entries at the 2-year mark (R4/R5/R9), and never changes record lifecycle status of published records (community model, ADR 0021 § 2.2). Once the API-key feature ships, revoked/expired keys are hard-deleted 90 days after revocation/expiry (R21, ADR 0023).

## 8. Your rights (GDPR arts. 15–22)

You may request, free of charge:

- **Access** (art. 15) — confirmation and copy of your data.
- **Rectification** (art. 16) — correction of inaccurate data: you may correct your display name, profile settings, and your own submissions; inaccurate record data can be corrected through the private correction path (see TERMS § 6 — corrections are private and never change the map automatically).
- **Erasure** (art. 17) — deletion, subject to the exceptions in art. 17(3) and the retention schedule. **Account erasure covers the account, sessions, your community actions and your API keys** (ADR 0021 § 13; RETENTION_SCHEDULE.md R21): your actions on other records are deleted atomically with the account (art. 17); the record history survives without the link to you, in aggregates only. See RETENTION_SCHEDULE.md R7/R14/R21.
- **Restriction** (art. 18) and **objection** (art. 21).
- **Portability** (art. 20) — where technically applicable.
- No automated decision-making, including profiling, is performed (art. 22). Trust levels are derived automatically from verified contributions, but they are informative indicators with transparent, non-discriminatory criteria — they do not produce legal or similarly significant effects (ADR 0018/0021).

**How to exercise them:** write to `privacy@opensurveillancedb.org`. To protect data subjects, we may ask you to verify your identity (proportionate to the request, e.g. by confirming details only you could know or providing a copy of an ID for requests about your personal data).

**Timeline:** we respond within **1 month** (art. 12(3)); this may be extended by up to 2 further months for complex requests, with notice. If we refuse, we explain why and remind you of your right to complain.

**Complaints:** you may complain to the competent supervisory authority — in Italy, the *Garante per la protezione dei dati personali* (www.garanteprivacy.it).

## 9. Contact and monitoring

- Privacy contact: `privacy@opensurveillancedb.org` — first response within 48 h, substantive response within 14 days.
- This notice is reviewed at least annually, or on any material change; the version history is kept in the repository.

## 10. Cookies

OpenSurveillanceDB uses a single functional cookie:

- **`opensurveillancedb-locale`** — remembers the language you selected on this device/browser (Italian or English). It is set **only when you change the language**; it is never used to track you.
  - **Type:** functional — strictly necessary to provide the language preference you explicitly requested.
  - **Purpose:** persist your interface language.
  - **Duration:** 1 year (`max-age=31536000`).
  - **Content:** none of your data — a plain language code (`it` / `en`).
  - **Properties:** `SameSite=Lax`, `path=/`, not readable cross-site (no tracking or session surface).
  - **Legal basis:** art. 122 D.Lgs. 196/2003 (transposing art. 5(3) of Directive 2002/58/EC as amended by 2009/136/EC) — consent is **not** required for cookies strictly necessary to provide a service explicitly requested by the user, so no consent banner is shown.
  - **Managing it:** you can delete it at any time from your browser settings; without it the interface defaults to the pilot language (English) on this device.

The same preference is mirrored in your browser's `localStorage` for multi-tab synchronisation. `localStorage` is a browser storage technology, not a cookie, and is never transmitted to our servers.

> **Commitment:** if the redesign or any future feature introduces cookies that are not strictly necessary (analytics, advertising, profiling), we will ask for your explicit consent through a banner **before** installing them, in accordance with art. 122 D.Lgs. 196/2003.
