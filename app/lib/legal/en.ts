/**
 * English legal content — PILOT LANGUAGE.
 *
 * Web adaptation of the legal drafts:
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
      "Version 0.3 — 31 July 2026. Draft for pre-launch review; the repository copy (docs/legal/PRIVACY_NOTICE.md) remains canonical.",
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
            text: "**Privacy contact:** [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) — a dedicated mailbox, to be created before launch — for any question, data-subject request or report. First response within 48 hours, substantive response within 14 days.",
          },
        ],
      },
      {
        heading: "2. What the service does",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB publishes a public-interest map of **visible, public surveillance infrastructure** (for example cameras mounted in public streets, squares, station exteriors), reviewed by trained moderators before publication. It is a civic-transparency project, not a commercial platform: no behavioural advertising, no tracking, no sale of data.",
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
                "Build the public record; moderation queue",
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
                "Evidence (files/links attached to a report)",
                "Reporter",
                "Verification of the record",
                "Art. 6(1)(f) GDPR; retained private, tied to the record",
              ],
              [
                "Correction / takedown request (contact details the requester provides, e.g. email)",
                "Requester",
                "Exercise of rights, harm reports",
                "Art. 6(1)(c) GDPR (Articles 15–22) and 6(1)(f)",
              ],
              [
                "Moderator identity (email, display name, full name via ChatGPT sign-in)",
                "OpenAI (identity provider)",
                "Authenticate moderators; separate moderation credentials",
                "Art. 6(1)(f) GDPR; never logged or stored by the application",
              ],
              [
                "Moderation audit entries (decision, reason code, timestamp, reviewer pseudonym)",
                "The project",
                "Accountability, appeals",
                "Art. 6(1)(f) GDPR; never public (aggregate transparency reports only)",
              ],
              [
                "Published records",
                "Moderated reports / official public sources",
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
            text: "**Voluntary provision:** providing data for a report is **voluntary** — it is neither a statutory nor a contractual requirement. The only consequence of not providing it is that the report cannot be processed. There is no obligation to provide data, and no penalty for declining.",
          },
          {
            type: "note",
            text: "**Special categories (Art. 9 GDPR):** none are intentionally collected. Evidence that incidentally captures identifiable people, plates or private interiors is redacted or deleted.",
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
              "**No coordinates beyond zone-level precision:** published locations are rounded to **~4 decimal places (~10 m)**; the exact location remains in the private moderation record, visible only to moderators.",
              "**No behavioural advertising, no tracking, no sale of data**, no analytics libraries.",
              "Submissions are stored as pending and are **never public** until a moderator approves them. Rejected content is never published.",
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
              "**OpenAI (ChatGPT sign-in)** — identity provider for moderators. OpenAI is an **independent controller of its own authentication service** (its privacy policy applies at sign-in); no OpenSurveillanceDB data is sent to OpenAI — we only receive the identity attributes listed above. Never published, never logged.",
              "**Publication itself:** verified records become part of a public dataset licensed ODbL 1.0 and may be downloaded or exported (JSON/CSV/GeoJSON). Copies already downloaded cannot be recalled; removed records are excluded from future exports.",
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
              "**OpenAI sign-in:** identity attributes are exchanged with OpenAI's services; the sign-in flow is governed by OpenAI's terms and privacy policy.",
            ],
          },
        ],
      },
      {
        heading: "7. Retention",
        blocks: [
          {
            type: "paragraph",
            text: "Pending reports: 90 days. Rejected reports: 30 days. Verified records: **12-month renewal review cycle**. Correction requests and audit entries: 2 years. Evidence: tied to the record. Operational logs: up to 12 months (aggregate). Backups: rotated by the provider (up to 30 days point-in-time recovery).",
          },
          {
            type: "paragraph",
            text: "Automated enforcement of the deletion and expiry rules is a pre-launch implementation item; until then the schedule is applied by the moderation workflow.",
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
            text: "**How to exercise them:** write to [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb). To protect data subjects, we may ask you to verify your identity, proportionately to the request.",
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
            text: "Privacy contact: [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) — first response within 48 hours, substantive response within 14 days.",
          },
          {
            type: "paragraph",
            text: "This notice is reviewed at launch and then at least annually, or on any material change; the version history is kept in the repository.",
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
      "Version 0.2 — 31 July 2026. Draft for pre-launch review; the repository copy (docs/TERMS_OF_USE.md) remains canonical.",
    sections: [
      {
        heading: "1. Who we are",
        blocks: [
          {
            type: "paragraph",
            text: "**Controller / operator:** Simone Rondina (syax89) / OpenSurveillanceDB — Italy (final legal-entity wording to be confirmed at launch).",
          },
          {
            type: "paragraph",
            text: "**Contact:** [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) — a dedicated mailbox, to be created before launch — for any question, correction, appeal or privacy request. Response times: first response within 48 hours, substantive decision within 14 days.",
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
              "**Reports:** submit observations of visible public surveillance infrastructure for human moderation. Reports are never guaranteed to be published (section 5).",
              "**Lawful purposes:** the data may be used for research, journalism, civic advocacy, and any purpose consistent with these terms and with the ODbL 1.0 licence. No account is required to browse **or to report**: submissions may be anonymous, or attributed to an optional free contributor account (email + pseudonymous display name). Contributions use a **pseudonymous internal ID**, never a real-name requirement.",
            ],
          },
        ],
      },
      {
        heading: "4. What you may not do",
        blocks: [
          {
            type: "paragraph",
            text: "**Prohibited content.** The exclusions of the moderation policy apply to everything you send, including reports, notes and any future evidence uploads. In particular, do not submit:",
          },
          {
            type: "list",
            items: [
              "residential or private cameras, including doorbells and cameras facing a private home;",
              "live video, stream URLs, credentials, network information, or control interfaces;",
              "detailed field-of-view or operational capability that could create a safety risk;",
              "sensitive facilities or locations where publication could materially increase risk;",
              "images containing identifiable people, vehicle plates, or private interiors unless safely redacted and necessary (note: evidence uploads are not enabled yet);",
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
            text: "**No abuse.** Do not exceed the applicable rate limits, do not scrape the Service beyond reasonable personal use, do not attempt to access non-public records (pending, rejected, moderation queues, correction requests), and do not circumvent access controls or use the Service to harass or facilitate harm.",
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
              "**No guarantee of publication.** Every report enters the database as pending. Trained human moderators screen, verify, and decide per the moderation policy. A report may be rejected, hidden, or removed at any time; rejected content is never published and is scheduled for deletion 30 days after the rejection decision.",
              "**What you keep and what you grant.** You retain whatever rights you have in the content you submit. By submitting, you grant the project a non-exclusive, worldwide, royalty-free licence to store and review the report and — **if and only if** the record is verified and published — to publish it and make it available under **ODbL 1.0**, as part of the open database, with attribution to contributors per the ODbL notice. No licence to publish is granted by the mere act of submitting.",
              "**Your warranties.** By submitting you confirm that: the content is accurate to the best of your knowledge; you are entitled to share it; it complies with section 4; and you meet the minimum age for using the Service in your jurisdiction (in Italy, 14 years).",
              "**Verification may be refused.** Records republished from official public sources follow their own legal regime, checked per record; community reports are verified against the moderation publication standard, not against official registers.",
            ],
          },
        ],
      },
      {
        heading: "6. Moderation, corrections, appeals",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Moderation follows the published policy and service levels: emergency hides within **24 hours**, first response within **48 hours**, substantive decision within **14 days**, re-review of temporary hides within **30 days**.",
              "Any person affected by a moderation decision may request correction or removal via the in-app correction form (home page, \"Report a problem / correction\" section) or [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) within **30 days** of the decision. Appeals are decided by a **different reviewer** than the original decision, with escalation for disputed cases.",
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
              "OpenSurveillanceDB is a **civic, community-maintained dataset — not an official record and not a statement of legal fact.** Records may be incomplete, outdated, or inaccurate despite human moderation; publication is deliberately conservative.",
              "Do not rely on the dataset for safety-critical or official decisions. Verify against official sources (for example the relevant public administration) before acting on it. The Service provides information about visible infrastructure only — it is not a directory of every camera, and absence of a record proves nothing.",
              "Records from official sources are marked with their source and verification date; community records carry no such guarantee.",
              "Published coordinates are rounded to **~4 decimal places (~10 m)** — zone-level precision. The exact location is never published and remains in the private moderation record, visible only to moderators.",
            ],
          },
        ],
      },
      {
        heading: "9. Privacy",
        blocks: [
          {
            type: "paragraph",
            text: "Your use of the Service is governed by the [privacy notice](/privacy). Key points: no tracking, no behavioural advertising; reports are private while pending; your GDPR rights are exercisable via [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) within the statutory timelines (Art. 12(3) GDPR).",
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
              "We may suspend or limit access, or remove content, where necessary to enforce these terms, to protect users or data subjects, or per the moderation policy — aiming to notify the affected person where proportionate and possible.",
              "Contributors may request deletion of their pending submissions via [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb); verified published records are subject to the **12-month renewal** retention and review cycle and to the correction path of section 6.",
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
              "**Privacy, corrections, appeals, rights:** [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) (dedicated mailbox — to be created before launch).",
              "Moderation and abuse emergencies use the same channel (hide within 24 hours).",
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
      "Updated 31 July 2026 (data licence decision — ADR 0008). The repository copy (docs/OPEN_SOURCE.md) remains canonical.",
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
            text: "This choice must still be checked against jurisdictional rules, source terms, and the final data model before public beta.",
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
            text: "Contributors must submit only material they are entitled to share. They grant the project the rights needed to publish accepted code, documentation and data under the relevant project licence. Evidence uploads require a separate, explicit contribution and privacy flow before they are enabled.",
          },
        ],
      },
    ],
  },
};
