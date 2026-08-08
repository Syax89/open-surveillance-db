/**
 * English legal content — PILOT LANGUAGE.
 *
 * Web adaptation of the legal documents:
 *   - docs/TERMS_OF_USE.md          → terms
 *   - docs/legal/PRIVACY_NOTICE.md  → privacy
 *   - docs/OPEN_SOURCE.md           → licenses
 *
 * The repository copies of those documents remain the canonical source
 * of record; this file is the presentation layer for the public pages.
 * Inline markup: **bold** and [label](url) (see app/lib/legal/types.ts).
 * Italian mirror: app/lib/legal/it.ts (pinned to the same LegalContent
 * type, so missing/extra keys fail `tsc` — parity per ADR 0007).
 */
import type { LegalContent } from "./types";

export const enLegal: LegalContent = {
  privacy: {
    eyebrow: "Legal · Privacy",
    title: "Privacy notice",
    intro:
      "How OpenSurveillanceDB processes personal data, what we publish, what we never collect, and how you can exercise your rights under the GDPR.",
    versionNote:
      "Version 0.7 — 8 August 2026. Current-state alignment (template-ready): re-synchronised with the canonical PRIVACY_NOTICE v0.13 (docs/legal/PRIVACY_NOTICE.md remains canonical). Community-driven model (ADR 0021): reports publish immediately from verified accounts; § 7 retention enforced by the daily retention sweep; § 3.1 multi-method authentication (email verification, passkeys, OIDC server-gated — ADR 0020); image evidence removed (2026-08-08).",
    sections: [
      {
        heading: "1. Who we are (controller)",
        blocks: [
          {
            type: "paragraph",
            text: "**Controller:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy.",
          },
          {
            type: "paragraph",
            text: "**Privacy contact:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — a dedicated mailbox — for any question, data-subject request or report. First response within 48 hours, substantive response within 14 days.",
          },
        ],
      },
      {
        heading: "2. What the service does",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB publishes a public-interest map of **visible, public surveillance infrastructure** (for example cameras mounted in public streets, squares, station exteriors), published immediately from verified contributor accounts and kept accurate by the community through confirmations, flags and automatic thresholds (ADR 0021). It is a civic-transparency project, not a commercial platform: no behavioural advertising, no tracking, no sale of data.",
          },
        ],
      },
      {
        heading: "3. What personal data we process",
        blocks: [
          {
            type: "paragraph",
            text: "The table below describes the personal data processed by the Service, its source, purpose and legal basis.",
          },
          {
            type: "table",
            caption: "Personal data processed by the Service",
            headers: ["Data", "Source", "Purpose", "Legal basis"],
            rows: [
              [
                "Report content: location, description, optional manufacturer / observation date, private notes",
                "Reporter (data subject)",
                "Build the public record; community accuracy actions",
                "Art. 6(1)(f) GDPR",
              ],
              [
                "Contributor pseudonymous internal ID + submission timestamp",
                "Reporter",
                "Abuse prevention, provenance",
                "Art. 6(1)(f) GDPR",
              ],
              [
                "Contributor account (email, optional display name, password hash)",
                "Contributor (voluntary registration)",
                "Login, attribution of submissions, abuse prevention",
                "Art. 6(1)(f) GDPR — minimising: optional, pseudonymous handle, PBKDF2-SHA256 hashed password, never exposed in API responses",
              ],
              [
                "Session records (hashed token, CSRF token, timestamps)",
                "The project (login)",
                "Keep the contributor logged in; CSRF protection",
                "Art. 6(1)(f) GDPR; token stored only as SHA-256, expires after 30 days or on logout",
              ],
              [
                "Correction / takedown request (contact details the requester provides, e.g. email)",
                "Requester",
                "Exercise of rights, harm reports",
                "Art. 6(1)(c) GDPR (Articles 15–22) and 6(1)(f)",
              ],
              [
                "Community actions on records (action type `like` / `confirm` / `gone` / `problem` / `privacy`, weight snapshot, timestamp)",
                "Contributor (verified account)",
                "Dataset accuracy — community-driven moderation",
                "Art. 6(1)(f) GDPR; one action per user per record (`UNIQUE(camera_id, contributor_id)`), weight snapshot at action time, **aggregates only in public payloads** — never attributed to any profile (ADR 0021 §3/§13)",
              ],
              [
                "OIDC identity attributes (provider, subject id, display name, verified flag — never the email)",
                "GitHub / Google (identity provider — only if you choose that method)",
                "Optional contributor sign-in; account linking to the contributor",
                "Art. 6(1)(f) GDPR; no email imported; the provider observes the sign-in and the IP (§ 5/§ 6)",
              ],
              [
                "Moderation audit entries (decision, reason code, timestamp, reviewer pseudonym)",
                "The project",
                "Accountability; historical appeals closed by migration (ADR 0021 §7)",
                "Art. 6(1)(f) GDPR; never public (aggregate transparency reports only)",
              ],
              [
                "Published records",
                "Published reports / official public sources",
                "The public dataset (ODbL 1.0)",
                "Art. 6(1)(f) / 6(1)(e) GDPR",
              ],
            ],
          },
          {
            type: "note",
            text: "**Records from official public sources:** where a record is republished from an official public source, the data was not obtained from the data subject. Source categories: public registers and transparency portals of public administrations (for example in Italy, D.Lgs. 33/2013 datasets), published public-authority documents, and other publicly accessible official sources. Such records are checked per record under the source's own legal regime.",
          },
          {
            type: "note",
            text: "**Public per-record event history (ADR 0021 § 7):** every community transition (published, confirmed, liked, gone-flagged, hidden, removed, restored) is recorded in a **public lifecycle history without any attribution** — no contributor ids, emails, or IP-derived data in public rows. It is a transparency control of the controller, not a new collection of personal data (aggregates only).",
          },
          {
            type: "note",
            text: "**Voluntary provision:** providing data for a report is **voluntary** — it is neither a statutory nor a contractual requirement. The only consequence of not providing it is that the report cannot be processed. There is no obligation to provide data, and no penalty for declining.",
          },
          {
            type: "note",
            text: "**Special categories (Art. 9 GDPR):** none are intentionally collected. Content that incidentally captures identifiable people, plates or private interiors is redacted or deleted.",
          },
          {
            type: "note",
            text: "**Children:** the service is addressed to adults. In Italy, submitting a report requires the age of consent for information-society services (14 years, art. 2-quinquies D.Lgs. 196/2003); other jurisdictions apply their own age thresholds.",
          },
        ],
      },
      {
        heading: "4. What we do NOT collect or publish",
        blocks: [
          {
            type: "list",
            items: [
              "**No video, live streams, credentials, network information or control interfaces** — the project documents the *existence* of visible surveillance infrastructure, never its output or access.",
              "**No private-home cameras** or cameras pointing into private interiors.",
              "**No personal names, faces, vehicle plates or precise operational details.**",
              "**No coordinates beyond zone-level precision:** published locations are rounded to **~4 decimal places (~10 m)**; the exact location stays in the database and is never published.",
              "**No behavioural advertising, no tracking, no sale of data**, no analytics libraries.",
              "Reports are published immediately from verified accounts and are part of the public dataset from the moment they are submitted. Content that violates the rules is withdrawn by the community or by a legal emergency, and withdrawn content is never re-published.",
            ],
          },
        ],
      },
      {
        heading: "5. Recipients and transfers",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare, Inc.** — hosting and database (Workers + D1). Processor (Art. 28) under the Cloudflare Data Processing Addendum (DPA v6.3, June 2025) incorporating **EU Standard Contractual Clauses (2021/914)**; Cloudflare is certified under the **EU–US Data Privacy Framework**. D1 is configured for EU residency.",
              "**GitHub, Inc. / Google LLC (OIDC identity providers — optional, only if you choose that method).** They are **independent controllers of their own authentication services** (their privacy policies apply at sign-in); no OpenSurveillanceDB data is sent to them — we only receive the identity attributes listed in § 3 (provider, subject id, display name, verified flag; never the email). The provider observes the sign-in and your IP. Never published, never logged.",
              "**Publication itself:** published records become part of a public dataset licensed ODbL 1.0 and may be downloaded or exported (JSON/CSV/GeoJSON). Copies already downloaded cannot be recalled; withdrawn records are excluded from future exports.",
              "No other recipients; no behavioural advertising; no analytics libraries.",
            ],
          },
        ],
      },
      {
        heading: "6. International data transfers",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare:** transfers covered by the Cloudflare DPA incorporating **EU Standard Contractual Clauses (2021/914)**; supplementary measures assessed for US processing (encryption in transit, EU residency for D1).",
              "**OIDC sign-in (GitHub/Google, if you choose that method):** identity attributes (provider, subject id, display name, verified flag) are exchanged with the provider's services at sign-in; the flow is governed by the provider's terms and privacy policy.",
            ],
          },
        ],
      },
      {
        heading: "7. Retention",
        blocks: [
          {
            type: "paragraph",
            text: "Reports are published immediately and stay public while the community keeps confirming them; records withdrawn by the community or by a legal emergency are excluded from public outputs and follow the repository retention schedule (docs/legal/RETENTION_SCHEDULE.md). Correction requests and audit entries: 2 years. Operational logs: up to 12 months (aggregate). Backups: rotated by the provider (up to 30 days point-in-time recovery).",
          },
          {
            type: "paragraph",
            text: "Deletion and expiry rules are enforced automatically by the daily retention sweep (see the retention schedule in the privacy notice); correction requests and audit entries: 2 years. Operational logs: up to 12 months (aggregate). Backups: rotated by the provider (up to 30 days point-in-time recovery).",
          },
        ],
      },
      {
        heading: "8. Your rights (GDPR Articles 15–22)",
        blocks: [
          {
            type: "paragraph",
            text: "You may request, free of charge:",
          },
          {
            type: "list",
            items: [
              "**Access** (Art. 15) — confirmation and copy of your data.",
              "**Rectification** (Art. 16) — correction of inaccurate data.",
              "**Erasure** (Art. 17) — deletion, subject to the exceptions in Art. 17(3) and the retention schedule.",
              "**Restriction** (Art. 18) and **objection** (Art. 21).",
              "**Portability** (Art. 20) — where technically applicable.",
              "No automated decision-making, including profiling, is performed (Art. 22).",
            ],
          },
          {
            type: "paragraph",
            text: "**How to exercise them:** write to [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). To protect data subjects, we may ask you to verify your identity, proportionately to the request.",
          },
          {
            type: "paragraph",
            text: "**Timeline:** we respond within **1 month** (Art. 12(3)); this may be extended by up to 2 further months for complex requests, with notice. If we refuse, we explain why and remind you of your right to complain.",
          },
          {
            type: "paragraph",
            text: "**Complaints:** you may complain to the competent supervisory authority — in Italy, the [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Contact and monitoring",
        blocks: [
          {
            type: "paragraph",
            text: "Privacy contact: [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — first response within 48 hours, substantive response within 14 days.",
          },
          {
            type: "paragraph",
            text: "This notice is reviewed at least annually, or on any material change; the version history is kept in the repository.",
          },
        ],
      },
      {
        heading: "10. Cookies",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB uses a single functional cookie:",
          },
          {
            type: "paragraph",
            text: "**opensurveillancedb-locale** — remembers the language you selected on this device/browser (Italian or English). It is set **only when you change the language**; it is never used to track you.",
          },
          {
            type: "list",
            items: [
              "**Type:** functional — strictly necessary to provide the language preference you explicitly requested",
              "**Purpose:** persist your interface language",
              "**Duration:** 1 year (`max-age=31536000`)",
              "**Content:** none of your data — a plain language code (`it` / `en`)",
              "**Properties:** `SameSite=Lax`, `path=/`, not readable cross-site (no tracking or session surface)",
              "**Legal basis:** art. 122 D.Lgs. 196/2003 (transposing art. 5(3) of Directive 2002/58/EC as amended by 2009/136/EC) — consent is **not** required for cookies strictly necessary to provide a service explicitly requested by the user, so no consent banner is shown.",
              "**Managing it:** you can delete it at any time from your browser settings; without it the interface defaults to the pilot language (English) on this device.",
            ],
          },
          {
            type: "paragraph",
            text: "The same preference is mirrored in your browser's `localStorage` for multi-tab synchronisation. `localStorage` is a browser storage technology, not a cookie, and is never transmitted to our servers.",
          },
          {
            type: "note",
            text: "**Commitment:** if the redesign or any future feature introduces cookies that are not strictly necessary (analytics, advertising, profiling), we will ask for your explicit consent through a banner **before** installing them, in accordance with art. 122 D.Lgs. 196/2003.",
          },
        ],
      },
    ],
  },

  terms: {
    eyebrow: "Legal · Terms of use",
    title: "Terms of use",
    intro:
      "These terms govern the use of OpenSurveillanceDB, the open, community-maintained database of visible public surveillance infrastructure. They apply to the web application, the public API, the data exports and related services (\"the Service\").",
    versionNote:
      "Version 0.5 — 8 August 2026. Current-state alignment (template-ready): re-synchronised with the canonical TERMS_OF_USE v0.8 (docs/TERMS_OF_USE.md remains canonical). § 3.7 authentication disclosure (email verification for write access, passkeys, OIDC — ADR 0020, server-gated); § 5 immediate publication and community actions; § 6 private corrections and the legal-emergency power; image evidence removed (2026-08-08).",
    sections: [
      {
        heading: "1. Who we are",
        blocks: [
          {
            type: "paragraph",
            text: "**Controller / operator:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy.",
          },
          {
            type: "paragraph",
            text: "**Contact:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — a dedicated mailbox — for any question, correction, removal or privacy request. Response times: first response within 48 hours, substantive decision within 14 days.",
          },
        ],
      },
      {
        heading: "2. What these terms cover",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB is a **non-commercial, community-governed civic-transparency project** documenting **visible public surveillance infrastructure** (for example cameras mounted in public streets, squares, station exteriors). It is free to use: no ads, no behavioural profiling, no sale of data.",
              "By using the Service you accept these terms. If you **submit a report**, you additionally accept the submission obligations in section 5.",
              "The Service does not provide video feeds, tracking tools, access to private cameras, or advice on avoiding lawful surveillance.",
            ],
          },
        ],
      },
      {
        heading: "3. Permitted use of the Service",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Consultation:** browse the map, the record directory and individual record pages; search and read the public dataset.",
              "**Exports:** download public data via the JSON/CSV/GeoJSON exports and the public API, and reuse it, subject to the ODbL 1.0 licence (section 7) and to the abuse limits in section 4.",
              "**Reports:** submit observations of visible public surveillance infrastructure. A report from a verified account is **published immediately** and is part of the public dataset from submission (section 5).",
              "**Lawful purposes:** the data may be used for research, journalism, civic advocacy, and any purpose consistent with these terms and with the ODbL 1.0 licence. Browsing the public data never requires an account. Submitting a report or a correction requires a verified contributor account (section 3.5; ADR 0020), and every submission is attributed to it through a **pseudonymous internal ID** — never a real-name requirement.",
              "**Authentication methods (multi-method, ADR 0020).** Contributor accounts support **three methods**, and you choose: **(a) email + password** — the baseline, with **email verification required for write access** (single-use link, 24 h; until you verify, your session is read-only); **(b) passkeys (WebAuthn)** — optional, passwordless; **(c) OIDC via GitHub or Google** — optional, opt-in. The rules:",
            ],
          },
          {
            type: "list",
            items: [
              "**Email verification.** After registration you must verify the email address before you can submit, edit or verify records; until then your session is read-only. Verification and password-reset emails are sent through Cloudflare Email Routing with no tracking content. One email address = one account; keep it accessible if you lose your password.",
              "**Passkeys.** If you enroll a passkey, the site stores only public-key material; the private key stays on your device. **Vendor note:** *synced* passkeys are backed up through the OS vendor's cloud (Apple/Google/Microsoft) at your choice — the vendor learns you have an account here, the site shares nothing with them, and you control sync. Keep the 10 recovery codes issued at enrollment in a safe place; without them, a lost device may mean losing access to the passkey method (the email+password path remains).",
              "**OIDC via GitHub/Google — tracking disclosure.** Signing in with GitHub or Google means **GitHub or Google observes that you sign in to this Service, and your IP address**, at each login; the provider's own terms and privacy policy apply at sign-in. We **do not import your email** from the provider (subject id, display name and verified flag only) and we never merge accounts automatically on an email match — a conflict requires a manual, verified merge. This method is **opt-in and disclosed** (risk matrix on the login page); the buttons are shown only when the operator has activated the provider (credentials configured on this deployment).",
              "You may add, change or remove methods from your account page at any time; deleting your account deletes the data of every method (privacy notice § 7 R15, § 8).",
            ],
          },
        ],
      },
      {
        heading: "4. What you may not do",
        blocks: [
          {
            type: "paragraph",
            text: "**Prohibited content.** The exclusions of the publication rules apply to everything you send, including reports and notes. In particular, do not submit:",
          },
          {
            type: "list",
            items: [
              "residential or private cameras, including doorbells and cameras facing a private home;",
              "live video, stream URLs, credentials, network information, or control interfaces;",
              "detailed field-of-view or operational capability that could create a safety risk;",
              "sensitive facilities or locations where publication could materially increase risk;",
              "unverifiable allegations about people or organisations;",
              "content you are not entitled to share.",
            ],
          },
          {
            type: "paragraph",
            text: "**No unnecessary personal data.** Reports and notes must not contain personal data that does not serve the public record (data minimisation).",
          },
          {
            type: "paragraph",
            text: "**No abuse.** Do not exceed the applicable rate limits, do not scrape the Service beyond reasonable personal use, do not attempt to access non-public records (withdrawn records, correction requests), and do not circumvent access controls or use the Service to harass or facilitate harm.",
          },
          {
            type: "paragraph",
            text: "**No commercial resale of the Service itself.** Reuse of the *data* under ODbL 1.0 (including commercial reuse) remains permitted; this clause concerns reselling the Service as a product.",
          },
        ],
      },
      {
        heading: "5. Reports and publication",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Immediate publication.** A report from a verified contributor is published immediately: it enters the public dataset as soon as it is submitted. There is no review queue and no waiting. The community keeps the directory accurate: records are confirmed, flagged as no longer present, marked useful, or withdrawn through automatic thresholds (ADR 0021). A record can be hidden or removed at any time by enough community signals, or by a legal-emergency decision; withdrawn records stay reachable by direct link with a banner and a public event history, and can be restored by enough confirmations.",
              "**What you keep and what you grant.** You retain whatever rights you have in the content you submit. By submitting, you grant the project a non-exclusive, worldwide, royalty-free licence to store, review and publish the report as part of the open database, made available under **ODbL 1.0**, with attribution to contributors per the ODbL notice. Publication happens at submission, not after an approval step.",
              "**Your warranties.** By submitting you confirm that: the content is accurate to the best of your knowledge; you are entitled to share it; it complies with section 4; and you meet the minimum age for using the Service in your jurisdiction (in Italy, 14 years).",
              "**Community accuracy.** Records republished from official public sources follow their own legal regime, checked per record; community reports are kept accurate by the community's confirmations and flags under the automatic thresholds, not against official registers.",
            ],
          },
        ],
      },
      {
        heading: "6. Community actions, corrections, legal emergencies",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Community actions.** Any verified account can mark a record useful, confirm it is still present, flag it as no longer present, or raise a problem or privacy concern. One account, one active action per record. Automatic thresholds — including a deliberately low privacy threshold — decide when a record is hidden or removed; every transition is recorded in the record's public history without attribution to any profile.",
              "**Corrections.** Any person may request a correction or removal via the private correction form (home page, \"Report a problem / correction\" section) or [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Requests are private, reviewed by a person, and never change the map automatically. Response targets: first response within **48 hours**, substantive response within **14 days**; legal-emergency hides are immediate.",
              "**Legal emergencies.** The only human write power left is the administrator's legal-emergency hide or removal, used when the law requires it and reviewed retrospectively. Administrators cannot restore or un-hide unilaterally: the community consensus of section 5 is the only reversal path.",
              "Data-subject rights (access, rectification, erasure, restriction, objection, portability) are described in the [privacy notice](/privacy) and exercised through the same contact.",
            ],
          },
        ],
      },
      {
        heading: "7. Licences",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Data:** the public database and its exports are licensed under **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** — reuse is permitted, including commercially, provided you attribute the database and, if you create a derivative database, you share it under ODbL 1.0. Exports carry the ODbL notice. Illustrative demo records are part of the licensed database.",
              "**Software:** the application source code is licensed under **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)**.",
              "**Documentation:** project documentation is proposed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).",
              "**OpenStreetMap:** map background data is used under the OSM/ODbL terms; OSM attribution requirements apply.",
            ],
          },
        ],
      },
      {
        heading: "8. Accuracy disclaimer",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB is a **civic, community-maintained dataset — not an official record and not a statement of legal fact.** Records may be incomplete, outdated, or inaccurate despite community maintenance; publication is immediate, not conservative.",
              "Do not rely on the dataset for safety-critical or official decisions. Verify against official sources (for example the relevant public administration) before acting on it. The Service provides information about visible infrastructure only — it is not a directory of every camera, and absence of a record proves nothing.",
              "Records from official sources are marked with their source and verification date; community records carry no such guarantee.",
              "Published coordinates are rounded to **~4 decimal places (~10 m)** — zone-level precision. The exact location is never published and stays in the database.",
            ],
          },
        ],
      },
      {
        heading: "9. Privacy",
        blocks: [
          {
            type: "paragraph",
            text: "Your use of the Service is governed by the [privacy notice](/privacy). Key points: no tracking, no behavioural advertising; reports are public as soon as they are published and private correction requests stay private; your GDPR rights are exercisable via [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) within the statutory timelines (Art. 12(3) GDPR).",
          },
        ],
      },
      {
        heading: "10. Availability and limitation of liability",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "The Service is provided **\"as is\" and \"as available\"**, without warranties of accuracy, completeness, availability, or fitness for a particular purpose.",
              "To the maximum extent permitted by law, the project and its contributors are **not liable** for any damages — including indirect, incidental, or consequential loss — arising from the use of, or reliance on, the Service or its data. In particular, the project is not liable for decisions made on the basis of the dataset.",
              "Nothing in these terms excludes or limits liability that cannot be excluded or limited by law (for example fraud, death or personal injury caused by negligence, mandatory consumer-protection rights).",
              "The Service is not intended for emergency or safety-critical use; it does not replace official information channels.",
            ],
          },
        ],
      },
      {
        heading: "11. Suspension and removal",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "We may suspend or limit access, or remove content, where necessary to enforce these terms, to protect users or data subjects, or under the publication rules — aiming to notify the affected person where proportionate and possible.",
              "Contributors may request deletion of their reports via [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org); published records stay public while the community keeps confirming them, and follow the correction and withdrawal paths of section 6.",
            ],
          },
        ],
      },
      {
        heading: "12. Applicable law and jurisdiction",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "These terms are governed by **EU law and, where applicable, Italian law** — in particular the GDPR and D.Lgs. 196/2003 (Codice Privacy, as amended by D.Lgs. 101/2018).",
              "**Disputes:** the courts of the place where the controller is established (Italy) have jurisdiction, **without prejudice** to the right of consumers residing in the EU to bring proceedings in the courts of their own country of residence and to the protection of their mandatory national provisions.",
              "**Complaints:** you may complain to the competent supervisory authority — in Italy, the [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
            ],
          },
        ],
      },
      {
        heading: "13. Changes to these terms",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "These terms are versioned and stored in the repository. **Material changes** (purpose, licensing, data publication, governance) require a documented public proposal and a reasonable comment period.",
              "Non-material changes take effect on publication with a notice. Continued use of the Service after the effective date constitutes acceptance; where the law requires consent, it will be obtained separately.",
            ],
          },
        ],
      },
      {
        heading: "14. Contact",
        blocks: [
          {
            type: "list",
            items: [
              "**Privacy, corrections, rights:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) (dedicated mailbox).",
              "Legal emergencies and abuse reports use the same channel (immediate hide).",
            ],
          },
        ],
      },
    ],
  },

  licenses: {
    eyebrow: "Legal · Licences",
    title: "Licences",
    intro:
      "How the OpenSurveillanceDB software, documentation and data are licensed, and what that means for reuse.",
    versionNote:
      "Updated 31 July 2026 (data licence decision — ADR 0008) and 5 August 2026 (imported public datasets). The repository copy (docs/OPEN_SOURCE.md) remains canonical.",
    sections: [
      {
        heading: "1. Software",
        blocks: [
          {
            type: "paragraph",
            text: "The application source code is licensed as **AGPL-3.0-or-later**. This keeps modified network-service versions available to the community. See the [LICENSE](https://github.com/Syax89/open-surveillance-db/blob/main/LICENSE) file.",
          },
        ],
      },
      {
        heading: "2. Documentation",
        blocks: [
          {
            type: "paragraph",
            text: "Unless a document says otherwise, project documentation is proposed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Contributors retain credit for their contributions under the repository's normal history.",
          },
        ],
      },
      {
        heading: "3. Database and exports",
        blocks: [
          {
            type: "paragraph",
            text: "The public database and every export format are licensed under **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)**, with clear attribution and share-alike notices (decision of 31 July 2026, [ADR 0008](https://github.com/Syax89/open-surveillance-db/blob/main/docs/decisions/0008-data-licence-precision-retention-contact.md)). Reuse is permitted, including commercially, provided you attribute the database and, if you create a derivative database, you share it under ODbL 1.0.",
          },
          {
            type: "note",
            text: "Imported sources keep their own licence and attribution; the ODbL licence applies to the project's own compilation (see section 6).",
          },
        ],
      },
      {
        heading: "4. OpenStreetMap data",
        blocks: [
          {
            type: "paragraph",
            text: "OpenStreetMap data is available under the [Open Database License](https://www.openstreetmap.org/copyright). Using an OSM map background does not automatically make every project record an OSM contribution. If data is imported from OSM, derived from it, or combined into a derivative database, the project must document the relationship, provide required attribution, and comply with ODbL obligations.",
          },
        ],
      },
      {
        heading: "5. Contributor promise",
        blocks: [
          {
            type: "paragraph",
            text: "Contributors must submit only material they are entitled to share. They grant the project the rights needed to publish accepted code, documentation and data under the relevant project licence. ",
          },
        ],
      },
      {
        heading: "6. Imported public datasets",
        blocks: [
          {
            type: "paragraph",
            text: "The project may integrate public datasets released by public administrations and open-data projects (for example city camera inventories or OpenStreetMap surveillance features). Every integrated source keeps its own licence and attribution: the database licence above applies to the project's own compilation, it never replaces the licence of an individual source. The [Data sources](/fonti) page lists each imported dataset with its source, licence, import date, record count and the required attribution text.",
          },
          {
            type: "note",
            text: "Records imported from a source are marked with their provenance on the record page. They are subject to the same community verification as any other record and are never exempt from review.",
          },
        ],
      },
    ],
  },

  accessibility: {
    eyebrow: "Information · Accessibility",
    title: "Accessibility statement",
    intro:
      "OpenSurveillanceDB is a public-interest civic database. This statement describes our accessibility commitment, our current compliance status, and how you can report a barrier.",
    versionNote:
      "Version 0.2 — 8 August 2026. In force (personal open-source project). The repository copy (docs/ACCESSIBILITY_STATEMENT.md) remains canonical.",
    sections: [
      {
        heading: "1. Commitment",
        blocks: [
          {
            type: "paragraph",
            text: "The core journeys — browse, search, submit, and correct/remove — must be usable with a keyboard, with assistive technology, and on small screens, in the pilot language and in English. The product target is **WCAG 2.2 AA** for the public website, with manual testing by disabled users before the pilot is widened.",
          },
        ],
      },
      {
        heading: "2. Compliance status",
        blocks: [
          {
            type: "paragraph",
            text: "**Partially compliant.** The project implements a meaningful accessibility baseline and runs **automated accessibility checks (Lighthouse ≥ 0.95) on every pull request**; a full WCAG 2.2 A/AA manual conformance audit by users of assistive technology remains planned. Known limitations are listed below.",
          },
        ],
      },
      {
        heading: "3. What is already implemented",
        blocks: [
          {
            type: "list",
            items: [
              "A skip link and main-content target on every page.",
              "Visible keyboard focus states and a logical focus order.",
              "Support for `prefers-reduced-motion` (animations reduced when requested).",
              "A searchable text directory and record-detail pages that work **without map interaction**; map and directory present the same public fields.",
              "Report-location selection by map click **or** validated manual coordinates.",
              "An English/Italian interface with a device-local language preference; the language choice does not affect API data.",
              "A bilingual in-app guide at [/guide](/guide) explaining data states and the publication workflow.",
              "Status information is never conveyed by colour alone (text and icon labels are used).",
            ],
          },
        ],
      },
      {
        heading: "4. Known limitations",
        blocks: [
          {
            type: "list",
            items: [
              "**Map tasks are keyboard-operable.** Map markers are focusable and respond to Enter/Space (popup open/close); the text-list alternative covers browsing and searching records without the map.",
              "**No manual conformance audit yet.** A full manual audit with screen readers, 200% zoom, contrast checking and small-screen devices has not been run; automated checks run on every pull request and the manual audit is planned.",
              "**Some user-visible strings are still defined inline** in components while the interface-string externalisation and pilot-language review are in progress.",
              "**The dedicated feedback page (/feedback) is not offered yet.** Barriers are reported through the channels in section 5.",
            ],
          },
        ],
      },
      {
        heading: "5. Reporting a barrier",
        blocks: [
          {
            type: "paragraph",
            text: "The project provides **non-sensitive usability-feedback channels** so that anyone can report an interface barrier **without creating an account and without providing personal data**. The channels ask only for:",
          },
          {
            type: "list",
            items: [
              "the type of barrier (navigation/keyboard, screen reader, colour/contrast, zoom/layout, other);",
              "a plain-language description of what happened;",
              "an optional URL of the page where the barrier occurred;",
              "an optional contact address, **only if** you want a reply (never required, never used for anything else, and deleted once the exchange is closed).",
            ],
          },
          {
            type: "paragraph",
            text: "Report accessibility barriers through one of these channels:",
          },
          {
            type: "list",
            items: [
              "open an issue on the project repository (public, non-sensitive content only — do not include personal data or private locations);",
              "use the [correction form](/) on the public page for issues related to a specific record;",
              "write to the privacy contact named in the [privacy notice](/privacy): [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org).",
            ],
          },
          {
            type: "paragraph",
            text: "**Response commitment:** feedback is handled with the same targets as correction and takedown requests — an acknowledgement within **48 hours** and a substantive response within **14 days**, in the language of the message when possible.",
          },
        ],
      },
      {
        heading: "6. Review schedule",
        blocks: [
          {
            type: "paragraph",
            text: "This statement is reviewed after every release that changes the interface or the accessibility behaviour; at least quarterly once the service is running; and before any public launch, with the final conformance results and known exceptions recorded here.",
          },
        ],
      },
    ],
  },
};
