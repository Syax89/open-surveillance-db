/**
 * Bilingual content for the public legal / information pages
 * (/privacy, /termini, /licenze).
 *
 * Sources (single source of truth, in the repository):
 *   - /privacy  ← docs/legal/PRIVACY_NOTICE.md
 *   - /termini  ← docs/TERMS_OF_USE.md
 *   - /licenze  ← docs/OPEN_SOURCE.md
 *
 * English is canonical (pilot language, docs/decisions/0006-…); the Italian
 * bundle mirrors it and is type-checked against the same `LegalContent`
 * shape, so a missing or extra key fails `tsc`.
 *
 * These pages are web-readable renderings of the pre-launch legal drafts.
 * They deliberately keep the drafts' "not in force" framing — the public
 * launch has not happened yet. Internal-only metadata (owners, checklists,
 * open items) is intentionally omitted from the public pages.
 */
import type { Locale } from "./i18n";

/** One renderable block inside a legal section. */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "note"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalPageContent = {
  /** Small label above the title, e.g. "Privacy". */
  eyebrow: string;
  /** Page <h1>. */
  title: string;
  /** Short lead paragraph under the title. */
  intro: string;
  /** Version / date line, e.g. "Version 0.3 · 31 July 2026". */
  updated: string;
  sections: LegalSection[];
};

export type LegalContent = {
  privacy: LegalPageContent;
  terms: LegalPageContent;
  licenses: LegalPageContent;
};

export const legalEn: LegalContent = {
  privacy: {
    eyebrow: "Privacy",
    title: "Privacy notice",
    intro:
      "How OpenSurveillanceDB processes personal data when you browse the map, submit a report, or contact us.",
    updated: "Version 0.3 · 31 July 2026 (pre-launch draft)",
    sections: [
      {
        heading: "1. Who we are (controller)",
        blocks: [
          {
            kind: "p",
            text: "The controller is Simone Rondina (syax89) / OpenSurveillanceDB, Italy. The named governance owners are listed in GOVERNANCE.md in the repository.",
          },
          {
            kind: "p",
            text: "Privacy contact: privacy@opensurveillancedb — for any question, data-subject request, or report. The monitored mailbox will be provisioned before the address is published at launch.",
          },
        ],
      },
      {
        heading: "2. What the service does",
        blocks: [
          {
            kind: "p",
            text: "OpenSurveillanceDB publishes a public-interest map of visible, public surveillance infrastructure (for example cameras mounted in public streets, squares, and station exteriors). Records are reviewed by trained moderators before publication. It is a civic-transparency project, not a commercial platform: no behavioural advertising, no tracking, no sale of data.",
          },
        ],
      },
      {
        heading: "3. What personal data we process",
        blocks: [
          {
            kind: "p",
            text: "The table below summarises the data processed, its source, its purpose, and the legal basis.",
          },
          {
            kind: "table",
            headers: ["Data", "Source", "Purpose", "Legal basis"],
            rows: [
              [
                "Report content: location, description, optional manufacturer / observedOn, private notes",
                "Reporter (data subject)",
                "Build the public record; moderation queue",
                "art. 6(1)(f) GDPR",
              ],
              [
                "Contributor pseudonymous internal ID + submission timestamp",
                "Reporter",
                "Abuse prevention, provenance",
                "art. 6(1)(f) GDPR",
              ],
              [
                "Contributor account (email, optional display name, password hash)",
                "Contributor (voluntary registration)",
                "Login, attribution of submissions, abuse prevention",
                "art. 6(1)(f) GDPR — optional, pseudonymous handle, PBKDF2-SHA256 hashed password, never exposed in API responses",
              ],
              [
                "Session records (hashed token, CSRF token, timestamps)",
                "The project (login)",
                "Keep the contributor logged in; CSRF protection",
                "art. 6(1)(f) GDPR; token stored only as SHA-256, expires after 30 days or on logout",
              ],
              [
                "Evidence (files/links attached to a report)",
                "Reporter",
                "Verification of the record",
                "art. 6(1)(f) GDPR; retained private, tied to the record",
              ],
              [
                "Correction / takedown request (contact details you provide, e.g. email)",
                "Requester",
                "Exercise of rights, harm reports",
                "art. 6(1)(c) (arts. 15–22) and 6(1)(f) GDPR",
              ],
              [
                "Moderator identity (email, display name, full name via ChatGPT sign-in)",
                "OpenAI (identity provider)",
                "Authenticate moderators; separate moderation credentials",
                "art. 6(1)(f) GDPR; never logged or stored by the application",
              ],
              [
                "Moderation audit entries (decision, reason code, timestamp, reviewer pseudonym)",
                "The project",
                "Accountability, appeals",
                "art. 6(1)(f) GDPR; never public (aggregate transparency reports only)",
              ],
              [
                "Published records",
                "Moderated reports / official public sources",
                "The public dataset (ODbL 1.0)",
                "art. 6(1)(f) / 6(1)(e) GDPR",
              ],
            ],
          },
          {
            kind: "p",
            text: "Records from official public sources (art. 14(2)(f) GDPR): where a record is republished from an official public source (source: official), the data was not obtained from the data subject. Sources include public registers and transparency portals of public administrations (in Italy, D.Lgs. 33/2013 datasets), published public-authority documents, and other publicly accessible official sources. Such records are checked per record under the source's own legal regime.",
          },
          {
            kind: "p",
            text: "Voluntary provision (art. 13(2)(e) GDPR): providing data for a report is voluntary — it is neither a statutory nor a contractual requirement. The only consequence of not providing it is that the report cannot be processed. There is no obligation to provide data, and no penalty for declining.",
          },
          {
            kind: "p",
            text: "Special categories (art. 9 GDPR): none are intentionally collected. Evidence that incidentally captures identifiable people, plates, or private interiors is redacted or deleted.",
          },
          {
            kind: "p",
            text: "Children: the service is addressed to adults. In Italy, submitting a report requires the age of consent for information-society services (14 years, art. 2-quinquies D.Lgs. 196/2003); other jurisdictions apply their own age thresholds.",
          },
        ],
      },
      {
        heading: "4. What we do NOT collect or publish",
        blocks: [
          {
            kind: "list",
            items: [
              "No video, live streams, credentials, network information, or control interfaces — we document the existence of visible surveillance infrastructure, never its output or access.",
              "No private-home cameras or cameras pointing into private interiors.",
              "No personal names, faces, vehicle plates, or precise operational details.",
              "No coordinates beyond zone-level precision: published locations are rounded to about 4 decimal places (~10 m); the exact location stays in the private moderation record, visible only to moderators.",
              "No behavioural advertising, no tracking, no sale of data, no analytics libraries.",
              "Submissions are stored as pending and are never public until a moderator approves them. Rejected content is never published.",
            ],
          },
        ],
      },
      {
        heading: "5. Recipients and transfers",
        blocks: [
          {
            kind: "p",
            text: "Cloudflare, Inc. — hosting and database (Workers + D1). Processor (art. 28 GDPR) under the Cloudflare Data Processing Addendum (DPA v6.3, June 2025) incorporating EU Standard Contractual Clauses (2021/914); Cloudflare is certified under the EU–US Data Privacy Framework. D1 is configured for EU residency (weur location hint).",
          },
          {
            kind: "p",
            text: "OpenAI (ChatGPT sign-in) — identity provider for moderators. OpenAI is an independent controller of its own authentication service (its privacy policy applies at sign-in); no OpenSurveillanceDB data is sent to OpenAI — we only receive the identity attributes listed in § 3. Never published, never logged.",
          },
          {
            kind: "p",
            text: "Publication itself — verified records become part of a public dataset licensed ODbL 1.0 and may be downloaded or exported (JSON/CSV/GeoJSON). This is the purpose of the service, disclosed here. Copies already downloaded cannot be recalled; removed records are excluded from future exports.",
          },
          {
            kind: "p",
            text: "No other recipients; no behavioural advertising; no analytics libraries.",
          },
        ],
      },
      {
        heading: "6. International data transfers",
        blocks: [
          {
            kind: "p",
            text: "Cloudflare: transfers are covered by the Cloudflare DPA incorporating EU Standard Contractual Clauses (2021/914), with supplementary measures assessed for US processing (encryption in transit, EU residency for D1).",
          },
          {
            kind: "p",
            text: "OpenAI sign-in: identity attributes are exchanged with OpenAI's services; the sign-in flow is governed by OpenAI's terms and privacy policy.",
          },
        ],
      },
      {
        heading: "7. Retention",
        blocks: [
          {
            kind: "p",
            text: "Pending reports are kept for 90 days; rejected content for 30 days; verified records follow a 12-month renewal review cycle; correction requests and audit entries for 2 years; evidence is tied to the record; operational logs up to 12 months (aggregate); backups are rotated by the provider (up to 30 days point-in-time recovery). Automated enforcement of the deletion/expiry rules is a pre-launch implementation item; until then the schedule is applied by the moderation workflow. See RETENTION_SCHEDULE.md in the repository for details.",
          },
        ],
      },
      {
        heading: "8. Your rights (GDPR arts. 15–22)",
        blocks: [
          {
            kind: "p",
            text: "You may request, free of charge:",
          },
          {
            kind: "list",
            items: [
              "Access (art. 15) — confirmation and a copy of your data.",
              "Rectification (art. 16) — correction of inaccurate data.",
              "Erasure (art. 17) — deletion, subject to the exceptions in art. 17(3) and the retention schedule.",
              "Restriction (art. 18) and objection (art. 21).",
              "Portability (art. 20) — where technically applicable.",
              "No automated decision-making, including profiling, is performed (art. 22).",
            ],
          },
          {
            kind: "p",
            text: "How to exercise them: write to privacy@opensurveillancedb. To protect data subjects, we may ask you to verify your identity in a way proportionate to the request.",
          },
          {
            kind: "p",
            text: "Timeline: we respond within one month (art. 12(3) GDPR); this may be extended by up to two further months for complex requests, with notice. If we refuse, we explain why and remind you of your right to complain.",
          },
          {
            kind: "p",
            text: "Complaints: you may complain to the competent supervisory authority — in Italy, the Garante per la protezione dei dati personali (www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Contact and monitoring",
        blocks: [
          {
            kind: "p",
            text: "Privacy contact: privacy@opensurveillancedb — first response within 48 hours, substantive response within 14 days.",
          },
          {
            kind: "p",
            text: "This notice is reviewed at launch and then at least annually, or on any material change; the version history is kept in the repository.",
          },
        ],
      },
    ],
  },
  terms: {
    eyebrow: "Terms of use",
    title: "Terms of use",
    intro:
      "The terms that apply when you browse OpenSurveillanceDB, use its public data, or submit a report.",
    updated: "Version 0.2 · 31 July 2026 (pre-launch draft)",
    sections: [
      {
        heading: "1. Who we are",
        blocks: [
          {
            kind: "p",
            text: "OpenSurveillanceDB is operated by Simone Rondina (syax89) / OpenSurveillanceDB, Italy — a non-commercial, community-governed civic-transparency project documenting visible public surveillance infrastructure. Contact: privacy@opensurveillancedb.",
          },
        ],
      },
      {
        heading: "2. What these terms cover",
        blocks: [
          {
            kind: "list",
            items: [
              "OpenSurveillanceDB is a non-commercial, community-governed civic-transparency project documenting visible public surveillance infrastructure (e.g. cameras mounted in public streets, squares, station exteriors). It is free to use: no ads, no behavioural profiling, no sale of data.",
              "By using the Service you accept these terms. If you submit a report, you additionally accept the submission obligations in § 5.",
              "The Service does not provide video feeds, tracking tools, access to private cameras, or advice on avoiding lawful surveillance.",
            ],
          },
        ],
      },
      {
        heading: "3. Permitted use of the Service",
        blocks: [
          {
            kind: "list",
            items: [
              "Consultation: browse the map, the record directory, and individual record pages; search and read the public dataset.",
              "Exports: download public data via the JSON/CSV/GeoJSON exports and the public API, and reuse it, subject to the ODbL 1.0 licence (§ 7) and to the abuse limits in § 4.",
              "Reports: submit observations of visible public surveillance infrastructure for human moderation. Reports are never guaranteed to be published (§ 5).",
              "Lawful purposes: the data may be used for research, journalism, civic advocacy, and any purpose consistent with these terms and with the ODbL 1.0 licence. No account is required to browse or to report: submissions may be anonymous, or attributed to an optional free contributor account (email + pseudonymous display name). Contributions use a pseudonymous internal ID, never a real-name requirement.",
            ],
          },
        ],
      },
      {
        heading: "4. What you may not do",
        blocks: [
          {
            kind: "p",
            text: "Submit prohibited content. The exclusions of the moderation policy apply to everything you send, including reports, notes, and any future evidence uploads. In particular, do not submit:",
          },
          {
            kind: "list",
            items: [
              "residential/private cameras, including doorbells and cameras facing a private home;",
              "live video, stream URLs, credentials, network information, or control interfaces;",
              "detailed field-of-view or operational capability that could create a safety risk;",
              "sensitive facilities or locations where publication could materially increase risk;",
              "images containing identifiable people, vehicle plates, or private interiors unless safely redacted and necessary;",
              "unverifiable allegations about people or organisations;",
              "content you are not entitled to share.",
            ],
          },
          {
            kind: "p",
            text: "Do not include unnecessary personal data. Reports and notes must not contain personal data that does not serve the public record (data minimisation).",
          },
          {
            kind: "p",
            text: "No abuse: do not exceed the applicable rate limits, do not scrape the Service beyond reasonable personal use, do not attempt to access non-public records (pending, rejected, moderation queues, correction requests), and do not circumvent access controls or use the Service to harass or facilitate harm.",
          },
          {
            kind: "p",
            text: "No commercial resale of the Service itself. Reuse of the data under ODbL 1.0 (including commercial reuse) remains permitted; this clause concerns reselling the Service as a product.",
          },
        ],
      },
      {
        heading: "5. Reports and publication",
        blocks: [
          {
            kind: "list",
            items: [
              "No guarantee of publication. Every report enters the database as pending. Trained human moderators screen, verify, and decide per the moderation policy. A report may be rejected, hidden, or removed at any time; rejected content is never published and is scheduled for deletion 30 days after the rejection decision.",
              "What you keep and what you grant. You retain whatever rights you have in the content you submit. By submitting, you grant the project a non-exclusive, worldwide, royalty-free licence to store and review the report and — if and only if the record is verified and published — to publish it and make it available under ODbL 1.0, as part of the open database, with attribution to contributors. No licence to publish is granted by the mere act of submitting.",
              "Your warranties. By submitting you confirm that: the content is accurate to the best of your knowledge; you are entitled to share it; it complies with § 4; and you meet the minimum age for using the Service in your jurisdiction (in Italy, 14 years — art. 2-quinquies D.Lgs. 196/2003).",
              "Verification may be refused. Records republished from official public sources (source: official) follow their own legal regime, checked per record; community reports are verified against the publication standard of the moderation policy, not against official registers.",
            ],
          },
        ],
      },
      {
        heading: "6. Moderation, corrections, appeals",
        blocks: [
          {
            kind: "p",
            text: "Moderation follows the published moderation policy and service levels: emergency hides within 24 hours, first response within 48 hours, substantive decision within 14 days, re-review of temporary hides within 30 days.",
          },
          {
            kind: "p",
            text: "Any person affected by a moderation decision may request correction or removal via the in-app correction form (home page, “Report a problem / correction” section) or privacy@opensurveillancedb within 30 days of the decision; appeals are decided by a different reviewer than the original decision.",
          },
          {
            kind: "p",
            text: "Data-subject rights (access, rectification, erasure, restriction, objection, portability) are described in the privacy notice and exercised through the same contact.",
          },
        ],
      },
      {
        heading: "7. Licences",
        blocks: [
          {
            kind: "list",
            items: [
              "Data: the public database and its exports are licensed under ODbL 1.0 — reuse is permitted, including commercially, provided you attribute the database and, if you create a derivative database, you share it under ODbL 1.0. Exports carry the ODbL notice. Illustrative demo records are part of the licensed database.",
              "Software: the application source code is licensed under AGPL-3.0-or-later (see LICENSE).",
              "Documentation: project documentation is proposed under CC BY-SA 4.0.",
              "OpenStreetMap: map background data is used under the OSM/ODbL terms; OSM attribution requirements apply.",
            ],
          },
          {
            kind: "p",
            text: "See the licences page for the full breakdown.",
          },
        ],
      },
      {
        heading: "8. Accuracy disclaimer",
        blocks: [
          {
            kind: "p",
            text: "OpenSurveillanceDB is a civic, community-maintained dataset — not an official record and not a statement of legal fact. Records may be incomplete, outdated, or inaccurate despite human moderation; publication is deliberately conservative.",
          },
          {
            kind: "p",
            text: "Do not rely on the dataset for safety-critical or official decisions. Verify against official sources before acting on it. The Service provides information about visible infrastructure only — it is not a directory of every camera, and the absence of a record proves nothing.",
          },
          {
            kind: "p",
            text: "Records from official sources are marked with their source and verification date; community records carry no such guarantee.",
          },
          {
            kind: "p",
            text: "Published coordinates are rounded to about 4 decimal places (~10 m) — zone-level precision. The exact location is never published and remains in the private moderation record, visible only to moderators.",
          },
        ],
      },
      {
        heading: "9. Privacy",
        blocks: [
          {
            kind: "p",
            text: "Your use of the Service is governed by the privacy notice. Key points: no tracking, no behavioural advertising; reports are private while pending; your GDPR rights are exercisable via privacy@opensurveillancedb within the statutory timelines (art. 12(3) GDPR).",
          },
        ],
      },
      {
        heading: "10. Availability and limitation of liability",
        blocks: [
          {
            kind: "list",
            items: [
              "The Service is provided “as is” and “as available”, without warranties of accuracy, completeness, availability, or fitness for a particular purpose.",
              "To the maximum extent permitted by law, the project and its contributors are not liable for any damages — including indirect, incidental, or consequential loss — arising from the use of, or reliance on, the Service or its data. In particular, the project is not liable for decisions made on the basis of the dataset.",
              "Nothing in these terms excludes or limits liability that cannot be excluded or limited by law (e.g. fraud, death or personal injury caused by negligence, mandatory consumer-protection rights).",
              "The Service is not intended for emergency or safety-critical use; it does not replace official information channels.",
            ],
          },
        ],
      },
      {
        heading: "11. Suspension and removal",
        blocks: [
          {
            kind: "p",
            text: "We may suspend or limit access, or remove content, where necessary to enforce these terms, to protect users or data subjects, or per the moderation policy — aiming to notify the affected person where proportionate and possible.",
          },
          {
            kind: "p",
            text: "Contributors may request deletion of their pending submissions via privacy@opensurveillancedb; verified published records are subject to the 12-month renewal retention and review cycle and to the correction path of § 6.",
          },
        ],
      },
      {
        heading: "12. Applicable law and jurisdiction",
        blocks: [
          {
            kind: "p",
            text: "These terms are governed by EU law and, where applicable, Italian law — in particular the GDPR and D.Lgs. 196/2003 (Codice Privacy, as amended by D.Lgs. 101/2018).",
          },
          {
            kind: "p",
            text: "Disputes: the courts of the place where the controller is established (Italy) have jurisdiction, without prejudice to the right of consumers residing in the EU to bring proceedings in the courts of their own country of residence (Regulation (EU) 1215/2012, Brussels I recast) and to the protection of their mandatory national provisions (Regulation (EC) 593/2008, Rome I). Final wording to be confirmed at launch.",
          },
          {
            kind: "p",
            text: "Complaints: you may complain to the competent supervisory authority — in Italy, the Garante per la protezione dei dati personali (www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "13. Changes to these terms",
        blocks: [
          {
            kind: "p",
            text: "These terms are versioned and stored in the repository. Material changes (purpose, licensing, data publication, governance) require a documented public proposal and a reasonable comment period.",
          },
          {
            kind: "p",
            text: "Non-material changes take effect on publication with a notice. Continued use of the Service after the effective date constitutes acceptance; where the law requires consent, it will be obtained separately.",
          },
        ],
      },
      {
        heading: "14. Contact",
        blocks: [
          {
            kind: "p",
            text: "Privacy, corrections, appeals, rights: privacy@opensurveillancedb (dedicated mailbox — to be created before launch; final domain to be confirmed).",
          },
          {
            kind: "p",
            text: "Moderation/abuse emergencies use the same channel (hide within 24 hours).",
          },
        ],
      },
      {
        heading: "15. Pre-launch status",
        blocks: [
          {
            kind: "note",
            text: "These terms are proposed for the public launch and are not yet in force: no public service is live yet and nothing here is a binding offer or commitment. Acceptance mechanics, automated retention enforcement, and the account-erasure endpoint are still being implemented before launch.",
          },
        ],
      },
    ],
  },
  licenses: {
    eyebrow: "Licences",
    title: "Open source and data licensing",
    intro:
      "How the software, the documentation, and the public database of OpenSurveillanceDB are licensed.",
    updated: "Decided 31 July 2026 · ADR 0008 (pre-launch)",
    sections: [
      {
        heading: "Software",
        blocks: [
          {
            kind: "p",
            text: "The application source code is licensed as AGPL-3.0-or-later. This keeps modified network-service versions available to the community. See LICENSE in the repository.",
          },
        ],
      },
      {
        heading: "Documentation",
        blocks: [
          {
            kind: "p",
            text: "Unless a document says otherwise, project documentation is proposed under CC BY-SA 4.0. Contributors retain credit for their contributions under the repository's normal history.",
          },
        ],
      },
      {
        heading: "Database and exports",
        blocks: [
          {
            kind: "p",
            text: "The public database needs an explicit licence before it contains real records. Decided 31 July 2026 (ADR 0008): the database and every export format are licensed under ODbL 1.0, with clear attribution and share-alike notices. This choice must still be checked against jurisdictional rules, source terms, and the final data model before public beta.",
          },
        ],
      },
      {
        heading: "OpenStreetMap data",
        blocks: [
          {
            kind: "p",
            text: "OpenStreetMap data is available under the Open Database Licence. Using an OSM map background does not automatically make every project record an OSM contribution. If data is imported from OSM, derived from it, or combined into a derivative database, the project must document the relationship, provide required attribution, and comply with ODbL obligations.",
          },
        ],
      },
      {
        heading: "Contributor promise",
        blocks: [
          {
            kind: "p",
            text: "Contributors must submit only material they are entitled to share. They grant the project the rights needed to publish accepted code, documentation, and data under the relevant project licence. Evidence uploads require a separate, explicit contribution and privacy flow before they are enabled.",
          },
        ],
      },
      {
        heading: "Pre-launch status",
        blocks: [
          {
            kind: "note",
            text: "The data licence (ODbL 1.0) was decided on 31 July 2026 and applies from public launch; exports carry the ODbL notice.",
          },
        ],
      },
    ],
  },
};

export const legalIt: LegalContent = {
  privacy: {
    eyebrow: "Privacy",
    title: "Informativa sulla privacy",
    intro:
      "Come OpenSurveillanceDB tratta i dati personali quando consulti la mappa, invii una segnalazione o ci contatti.",
    updated: "Versione 0.3 · 31 luglio 2026 (bozza pre-lancio)",
    sections: [
      {
        heading: "1. Chi siamo (titolare del trattamento)",
        blocks: [
          {
            kind: "p",
            text: "Il titolare del trattamento è Simone Rondina (syax89) / OpenSurveillanceDB, Italia. I proprietari nominati della governance sono elencati in GOVERNANCE.md nel repository.",
          },
          {
            kind: "p",
            text: "Contatto privacy: privacy@opensurveillancedb — per qualsiasi domanda, richiesta dell'interessato o segnalazione. La casella monitorata sarà predisposta prima che l'indirizzo venga pubblicato al lancio.",
          },
        ],
      },
      {
        heading: "2. Cosa fa il servizio",
        blocks: [
          {
            kind: "p",
            text: "OpenSurveillanceDB pubblica una mappa di interesse pubblico delle infrastrutture di sorveglianza visibili e pubbliche (ad esempio telecamere installate in strade, piazze e ingressi di stazioni). Le segnalazioni sono esaminate da moderatori formati prima della pubblicazione. È un progetto di trasparenza civica, non una piattaforma commerciale: nessuna pubblicità comportamentale, nessun tracciamento, nessuna vendita di dati.",
          },
        ],
      },
      {
        heading: "3. Quali dati personali trattiamo",
        blocks: [
          {
            kind: "p",
            text: "La tabella seguente riassume i dati trattati, la loro fonte, la finalità e la base giuridica.",
          },
          {
            kind: "table",
            headers: ["Dato", "Fonte", "Finalità", "Base giuridica"],
            rows: [
              [
                "Contenuto della segnalazione: posizione, descrizione, manufacturer / observedOn facoltativi, note private",
                "Segnalante (interessato)",
                "Costruzione del registro pubblico; coda di moderazione",
                "art. 6, par. 1, lett. f) GDPR",
              ],
              [
                "ID interno pseudonimo del contributore + data e ora dell'invio",
                "Segnalante",
                "Prevenzione degli abusi, provenienza",
                "art. 6, par. 1, lett. f) GDPR",
              ],
              [
                "Account del contributore (email, nome visualizzato facoltativo, hash della password)",
                "Contributore (registrazione volontaria)",
                "Accesso, attribuzione delle segnalazioni, prevenzione degli abusi",
                "art. 6, par. 1, lett. f) GDPR — facoltativo, pseudonimo, password hashata PBKDF2-SHA256, mai esposta nelle risposte API",
              ],
              [
                "Record di sessione (token hashato, token CSRF, timestamp)",
                "Il progetto (accesso)",
                "Mantenere l'accesso del contributore; protezione CSRF",
                "art. 6, par. 1, lett. f) GDPR; token conservato solo come SHA-256, scade dopo 30 giorni o al logout",
              ],
              [
                "Prove (file/link allegati a una segnalazione)",
                "Segnalante",
                "Verifica della segnalazione",
                "art. 6, par. 1, lett. f) GDPR; conservate privatamente, legate alla segnalazione",
              ],
              [
                "Richiesta di correzione / rimozione (recapiti forniti dal richiedente, es. email)",
                "Richiedente",
                "Esercizio dei diritti, segnalazioni di danni",
                "art. 6, par. 1, lett. c) (artt. 15–22) e 6, par. 1, lett. f) GDPR",
              ],
              [
                "Identità del moderatore (email, nome visualizzato, nome completo tramite accesso ChatGPT)",
                "OpenAI (fornitore di identità)",
                "Autenticare i moderatori; credenziali di moderazione separate",
                "art. 6, par. 1, lett. f) GDPR; mai registrata o conservata dall'applicazione",
              ],
              [
                "Voci di audit di moderazione (decisione, codice motivazione, timestamp, pseudonimo del revisore)",
                "Il progetto",
                "Responsabilità, ricorsi",
                "art. 6, par. 1, lett. f) GDPR; mai pubbliche (solo report di trasparenza aggregati)",
              ],
              [
                "Segnalazioni pubblicate",
                "Segnalazioni moderate / fonti pubbliche ufficiali",
                "Il dataset pubblico (ODbL 1.0)",
                "art. 6, par. 1, lett. f) / 6, par. 1, lett. e) GDPR",
              ],
            ],
          },
          {
            kind: "p",
            text: "Segnalazioni da fonti pubbliche ufficiali (art. 14, par. 2, lett. f) GDPR): quando una segnalazione è ripubblicata da una fonte pubblica ufficiale (source: official), i dati non sono stati ottenuti dall'interessato. Le fonti comprendono registri pubblici e portali di trasparenza delle pubbliche amministrazioni (in Italia, i dataset del D.Lgs. 33/2013), documenti pubblicati dalle autorità pubbliche e altre fonti ufficiali accessibili al pubblico. Tali segnalazioni sono verificate singolarmente secondo il regime giuridico della fonte.",
          },
          {
            kind: "p",
            text: "Conferimento volontario (art. 13, par. 2, lett. e) GDPR): fornire i dati per una segnalazione è volontario — non è un requisito di legge né contrattuale. L'unica conseguenza del mancato conferimento è che la segnalazione non può essere trattata. Non esiste alcun obbligo di fornire i dati, né alcuna sanzione in caso di rifiuto.",
          },
          {
            kind: "p",
            text: "Categorie particolari (art. 9 GDPR): nessuna viene raccolta intenzionalmente. Le prove che catturano incidentalmente persone identificabili, targhe o interni privati vengono oscurate o cancellate.",
          },
          {
            kind: "p",
            text: "Minori: il servizio è rivolto a persone adulte. In Italia, l'invio di una segnalazione richiede l'età del consenso per i servizi della società dell'informazione (14 anni, art. 2-quinquies D.Lgs. 196/2003); le altre giurisdizioni applicano le proprie soglie di età.",
          },
        ],
      },
      {
        heading: "4. Cosa NON raccogliamo né pubblichiamo",
        blocks: [
          {
            kind: "list",
            items: [
              "Niente video, streaming live, credenziali, informazioni di rete o interfacce di controllo — documentiamo l'esistenza di infrastrutture di sorveglianza visibili, mai il loro output o accesso.",
              "Niente telecamere di abitazioni private o telecamere puntate verso interni privati.",
              "Niente nomi di persone, volti, targhe di veicoli o dettagli operativi precisi.",
              "Nessuna coordinata oltre la precisione di zona: le posizioni pubblicate sono arrotondate a circa 4 decimali (~10 m); la posizione esatta resta nel registro privato di moderazione, visibile solo ai moderatori.",
              "Nessuna pubblicità comportamentale, nessun tracciamento, nessuna vendita di dati, nessuna libreria di analytics.",
              "Le segnalazioni sono conservate come pending e non sono mai pubbliche finché un moderatore non le approva. I contenuti respinti non vengono mai pubblicati.",
            ],
          },
        ],
      },
      {
        heading: "5. Destinatari e trasferimenti",
        blocks: [
          {
            kind: "p",
            text: "Cloudflare, Inc. — hosting e database (Workers + D1). Responsabile del trattamento (art. 28 GDPR) ai sensi del Data Processing Addendum Cloudflare (DPA v6.3, giugno 2025) che incorpora le Clausole Contrattuali Standard UE (2021/914); Cloudflare è certificata nell'ambito dell'EU–US Data Privacy Framework. D1 è configurato per la residenza dei dati nell'UE (location hint weur).",
          },
          {
            kind: "p",
            text: "OpenAI (accesso con ChatGPT) — fornitore di identità per i moderatori. OpenAI è titolare autonomo del proprio servizio di autenticazione (la sua informativa sulla privacy si applica al momento dell'accesso); nessun dato di OpenSurveillanceDB viene inviato a OpenAI — riceviamo solo gli attributi di identità elencati al § 3. Mai pubblicati, mai registrati.",
          },
          {
            kind: "p",
            text: "La pubblicazione stessa — le segnalazioni verificate diventano parte di un dataset pubblico concesso in licenza ODbL 1.0 e possono essere scaricate o esportate (JSON/CSV/GeoJSON). Questa è la finalità del servizio, qui dichiarata. Le copie già scaricate non possono essere richiamate; le segnalazioni rimosse sono escluse dalle esportazioni future.",
          },
          {
            kind: "p",
            text: "Nessun altro destinatario; nessuna pubblicità comportamentale; nessuna libreria di analytics.",
          },
        ],
      },
      {
        heading: "6. Trasferimenti internazionali di dati",
        blocks: [
          {
            kind: "p",
            text: "Cloudflare: i trasferimenti sono coperti dal DPA Cloudflare che incorpora le Clausole Contrattuali Standard UE (2021/914), con misure supplementari valutate per il trattamento negli Stati Uniti (crittografia in transito, residenza UE per D1).",
          },
          {
            kind: "p",
            text: "Accesso con OpenAI: gli attributi di identità sono scambiati con i servizi OpenAI; il flusso di accesso è disciplinato dai termini e dall'informativa sulla privacy di OpenAI.",
          },
        ],
      },
      {
        heading: "7. Conservazione",
        blocks: [
          {
            kind: "p",
            text: "Le segnalazioni pending sono conservate per 90 giorni; i contenuti respinti per 30 giorni; le segnalazioni verificate seguono un ciclo di rinnovo di 12 mesi; le richieste di correzione e le voci di audit per 2 anni; le prove restano legate alla segnalazione; i log operativi fino a 12 mesi (aggregati); i backup sono ruotati dal fornitore (fino a 30 giorni di ripristino point-in-time). L'applicazione automatizzata delle regole di cancellazione/scadenza è un punto aperto pre-lancio; fino ad allora il programma è applicato dal flusso di moderazione. Vedi RETENTION_SCHEDULE.md nel repository per i dettagli.",
          },
        ],
      },
      {
        heading: "8. I tuoi diritti (artt. 15–22 GDPR)",
        blocks: [
          {
            kind: "p",
            text: "Puoi richiedere, gratuitamente:",
          },
          {
            kind: "list",
            items: [
              "Accesso (art. 15) — conferma e copia dei tuoi dati.",
              "Rettifica (art. 16) — correzione dei dati inesatti.",
              "Cancellazione (art. 17) — eliminazione, salve le eccezioni dell'art. 17, par. 3 e il programma di conservazione.",
              "Limitazione (art. 18) e opposizione (art. 21).",
              "Portabilità (art. 20) — ove tecnicamente applicabile.",
              "Nessuna decisione automatizzata, inclusa la profilazione, viene effettuata (art. 22).",
            ],
          },
          {
            kind: "p",
            text: "Come esercitarli: scrivi a privacy@opensurveillancedb. Per proteggere gli interessati, potremmo chiederti di verificare la tua identità in modo proporzionato alla richiesta.",
          },
          {
            kind: "p",
            text: "Tempi: rispondiamo entro un mese (art. 12, par. 3 GDPR); il termine può essere prorogato di altri due mesi per richieste complesse, con comunicazione. In caso di rifiuto, spieghiamo i motivi e ti ricordiamo il diritto di proporre reclamo.",
          },
          {
            kind: "p",
            text: "Reclami: puoi rivolgerti all'autorità di controllo competente — in Italia, il Garante per la protezione dei dati personali (www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Contatti e monitoraggio",
        blocks: [
          {
            kind: "p",
            text: "Contatto privacy: privacy@opensurveillancedb — prima risposta entro 48 ore, risposta sostanziale entro 14 giorni.",
          },
          {
            kind: "p",
            text: "Questa informativa è riesaminata al lancio e poi almeno annualmente, o in occasione di modifiche sostanziali; lo storico delle versioni è conservato nel repository.",
          },
        ],
      },
    ],
  },
  terms: {
    eyebrow: "Termini di utilizzo",
    title: "Termini di utilizzo",
    intro:
      "I termini che si applicano quando consulti OpenSurveillanceDB, utilizzi i suoi dati pubblici o invii una segnalazione.",
    updated: "Versione 0.2 · 31 luglio 2026 (bozza pre-lancio)",
    sections: [
      {
        heading: "1. Chi siamo",
        blocks: [
          {
            kind: "p",
            text: "OpenSurveillanceDB è gestito da Simone Rondina (syax89) / OpenSurveillanceDB, Italia — un progetto di trasparenza civica non commerciale, governato dalla comunità, che documenta le infrastrutture di sorveglianza pubbliche e visibili. Contatto: privacy@opensurveillancedb.",
          },
        ],
      },
      {
        heading: "2. Cosa coprono questi termini",
        blocks: [
          {
            kind: "list",
            items: [
              "OpenSurveillanceDB è un progetto di trasparenza civica non commerciale, governato dalla comunità, che documenta le infrastrutture di sorveglianza pubbliche e visibili (es. telecamere installate in strade, piazze e ingressi di stazioni). È gratuito: niente pubblicità, niente profilazione comportamentale, nessuna vendita di dati.",
              "Utilizzando il Servizio accetti questi termini. Se invii una segnalazione, accetti inoltre gli obblighi di invio del § 5.",
              "Il Servizio non fornisce flussi video, strumenti di tracciamento, accesso a telecamere private né consigli su come eludere la sorveglianza legittima.",
            ],
          },
        ],
      },
      {
        heading: "3. Uso consentito del Servizio",
        blocks: [
          {
            kind: "list",
            items: [
              "Consultazione: navigare la mappa, l'elenco delle segnalazioni e le singole pagine; cercare e leggere il dataset pubblico.",
              "Esportazioni: scaricare i dati pubblici tramite le esportazioni JSON/CSV/GeoJSON e l'API pubblica, e riutilizzarli, nel rispetto della licenza ODbL 1.0 (§ 7) e dei limiti anti-abuso del § 4.",
              "Segnalazioni: inviare osservazioni su infrastrutture di sorveglianza pubbliche e visibili per la moderazione umana. La pubblicazione delle segnalazioni non è mai garantita (§ 5).",
              "Finalità lecite: i dati possono essere utilizzati per ricerca, giornalismo, attivismo civico e qualsiasi finalità coerente con questi termini e con la licenza ODbL 1.0. Non è richiesto alcun account per consultare o segnalare: gli invii possono essere anonimi oppure attribuiti a un account contributore gratuito facoltativo (email + nome visualizzato pseudonimo). I contributi usano un ID interno pseudonimo, mai un requisito di nome reale.",
            ],
          },
        ],
      },
      {
        heading: "4. Cosa non puoi fare",
        blocks: [
          {
            kind: "p",
            text: "Inviare contenuti vietati. Le esclusioni della policy di moderazione si applicano a tutto ciò che invii, incluse segnalazioni, note ed eventuali futuri caricamenti di prove. In particolare, non inviare:",
          },
          {
            kind: "list",
            items: [
              "telecamere residenziali/private, inclusi campanelli video e telecamere puntate verso un'abitazione privata;",
              "video live, URL di streaming, credenziali, informazioni di rete o interfacce di controllo;",
              "dettagli sul campo visivo o sulle capacità operative che potrebbero creare un rischio per la sicurezza;",
              "impianti o luoghi sensibili la cui pubblicazione potrebbe aumentare materialmente il rischio;",
              "immagini con persone identificabili, targhe di veicoli o interni privati, salvo che siano oscurati in sicurezza e necessari;",
              "accuse non verificabili su persone o organizzazioni;",
              "contenuti che non hai il diritto di condividere.",
            ],
          },
          {
            kind: "p",
            text: "Non includere dati personali non necessari. Le segnalazioni e le note non devono contenere dati personali che non servono al registro pubblico (minimizzazione dei dati).",
          },
          {
            kind: "p",
            text: "Niente abusi: non superare i limiti di frequenza applicabili, non fare scraping del Servizio oltre un uso personale ragionevole, non tentare di accedere a dati non pubblici (pending, respinti, code di moderazione, richieste di correzione) e non aggirare i controlli di accesso né usare il Servizio per molestare o facilitare danni.",
          },
          {
            kind: "p",
            text: "Nessuna rivendita commerciale del Servizio stesso. Il riutilizzo dei dati con licenza ODbL 1.0 (incluso quello commerciale) resta consentito; questa clausola riguarda la rivendita del Servizio come prodotto.",
          },
        ],
      },
      {
        heading: "5. Segnalazioni e pubblicazione",
        blocks: [
          {
            kind: "list",
            items: [
              "Nessuna garanzia di pubblicazione. Ogni segnalazione entra nel database come pending. Moderatori umani formati esaminano, verificano e decidono secondo la policy di moderazione. Una segnalazione può essere respinta, nascosta o rimossa in qualsiasi momento; i contenuti respinti non vengono mai pubblicati e sono programmati per la cancellazione 30 giorni dopo la decisione di rigetto.",
              "Cosa conservi e cosa concedi. Conservi tutti i diritti che hai sui contenuti che invii. Con l'invio concedi al progetto una licenza non esclusiva, mondiale, royalty-free per conservare ed esaminare la segnalazione e — solo se e quando la segnalazione è verificata e pubblicata — per pubblicarla e metterla a disposizione con licenza ODbL 1.0, come parte del database aperto, con attribuzione ai contributori. Il semplice invio non concede alcuna licenza di pubblicazione.",
              "Le tue dichiarazioni. Con l'invio confermi che: il contenuto è accurato al meglio delle tue conoscenze; hai il diritto di condividerlo; è conforme al § 4; e hai l'età minima per utilizzare il Servizio nella tua giurisdizione (in Italia, 14 anni — art. 2-quinquies D.Lgs. 196/2003).",
              "La verifica può essere rifiutata. Le segnalazioni ripubblicate da fonti pubbliche ufficiali (source: official) seguono il proprio regime giuridico, verificato singolarmente; le segnalazioni della comunità sono verificate secondo lo standard di pubblicazione della policy di moderazione, non contro registri ufficiali.",
            ],
          },
        ],
      },
      {
        heading: "6. Moderazione, correzioni, ricorsi",
        blocks: [
          {
            kind: "p",
            text: "La moderazione segue la policy di moderazione pubblicata e i livelli di servizio: oscuramenti d'emergenza entro 24 ore, prima risposta entro 48 ore, decisione sostanziale entro 14 giorni, riesame degli oscuramenti temporanei entro 30 giorni.",
          },
          {
            kind: "p",
            text: "Chiunque sia interessato da una decisione di moderazione può richiedere correzione o rimozione tramite il modulo di correzione in-app (home page, sezione “Segnala un problema / correzione”) o scrivendo a privacy@opensurveillancedb entro 30 giorni dalla decisione; i ricorsi sono decisi da un revisore diverso da quello della decisione originaria.",
          },
          {
            kind: "p",
            text: "I diritti dell'interessato (accesso, rettifica, cancellazione, limitazione, opposizione, portabilità) sono descritti nell'informativa sulla privacy e si esercitano tramite lo stesso contatto.",
          },
        ],
      },
      {
        heading: "7. Licenze",
        blocks: [
          {
            kind: "list",
            items: [
              "Dati: il database pubblico e le sue esportazioni sono concessi con licenza ODbL 1.0 — il riutilizzo è consentito, anche commerciale, a condizione di attribuire il database e, se crei un database derivato, di condividerlo con licenza ODbL 1.0. Le esportazioni riportano l'avviso ODbL. Le segnalazioni demo illustrative fanno parte del database concesso in licenza.",
              "Software: il codice sorgente dell'applicazione è concesso con licenza AGPL-3.0-or-later (vedi LICENSE).",
              "Documentazione: la documentazione del progetto è proposta con licenza CC BY-SA 4.0.",
              "OpenStreetMap: i dati di sfondo della mappa sono utilizzati secondo i termini OSM/ODbL; si applicano i requisiti di attribuzione OSM.",
            ],
          },
          {
            kind: "p",
            text: "Consulta la pagina delle licenze per il dettaglio completo.",
          },
        ],
      },
      {
        heading: "8. Disclaimer sull'accuratezza",
        blocks: [
          {
            kind: "p",
            text: "OpenSurveillanceDB è un dataset civico, mantenuto dalla comunità — non un registro ufficiale né una dichiarazione di fatto legale. Le segnalazioni possono essere incomplete, obsolete o inaccurate nonostante la moderazione umana; la pubblicazione è deliberatamente prudente.",
          },
          {
            kind: "p",
            text: "Non affidarti al dataset per decisioni critiche per la sicurezza o ufficiali. Verifica presso fonti ufficiali prima di agire. Il Servizio fornisce informazioni solo sulle infrastrutture visibili — non è un elenco di tutte le telecamere, e l'assenza di una segnalazione non prova nulla.",
          },
          {
            kind: "p",
            text: "Le segnalazioni da fonti ufficiali riportano la fonte e la data di verifica; quelle della comunità non offrono alcuna garanzia del genere.",
          },
          {
            kind: "p",
            text: "Le coordinate pubblicate sono arrotondate a circa 4 decimali (~10 m) — precisione di zona. La posizione esatta non viene mai pubblicata e resta nel registro privato di moderazione, visibile solo ai moderatori.",
          },
        ],
      },
      {
        heading: "9. Privacy",
        blocks: [
          {
            kind: "p",
            text: "Il tuo utilizzo del Servizio è disciplinato dall'informativa sulla privacy. Punti chiave: nessun tracciamento, nessuna pubblicità comportamentale; le segnalazioni sono private finché sono pending; i tuoi diritti GDPR si esercitano scrivendo a privacy@opensurveillancedb entro i termini di legge (art. 12, par. 3 GDPR).",
          },
        ],
      },
      {
        heading: "10. Disponibilità e limitazione di responsabilità",
        blocks: [
          {
            kind: "list",
            items: [
              "Il Servizio è fornito “così com'è” e “come disponibile”, senza garanzie di accuratezza, completezza, disponibilità o idoneità a uno scopo particolare.",
              "Nella misura massima consentita dalla legge, il progetto e i suoi contributori non sono responsabili per alcun danno — inclusa la perdita indiretta, incidentale o consequenziale — derivante dall'uso o dall'affidamento sul Servizio o sui suoi dati. In particolare, il progetto non è responsabile delle decisioni prese sulla base del dataset.",
              "Niente in questi termini esclude o limita la responsabilità che non può essere esclusa o limitata per legge (es. frode, morte o lesioni personali causate da negligenza, diritti imperativi dei consumatori).",
              "Il Servizio non è destinato a un uso di emergenza o critico per la sicurezza; non sostituisce i canali informativi ufficiali.",
            ],
          },
        ],
      },
      {
        heading: "11. Sospensione e rimozione",
        blocks: [
          {
            kind: "p",
            text: "Possiamo sospendere o limitare l'accesso, o rimuovere contenuti, quando necessario per far rispettare questi termini, proteggere utenti o interessati, o secondo la policy di moderazione — cercando di avvisare la persona interessata dove proporzionato e possibile.",
          },
          {
            kind: "p",
            text: "I contributori possono richiedere la cancellazione delle proprie segnalazioni pending scrivendo a privacy@opensurveillancedb; le segnalazioni verificate e pubblicate sono soggette al ciclo di conservazione e riesame con rinnovo di 12 mesi e al percorso di correzione del § 6.",
          },
        ],
      },
      {
        heading: "12. Legge applicabile e giurisdizione",
        blocks: [
          {
            kind: "p",
            text: "Questi termini sono disciplinati dal diritto dell'UE e, ove applicabile, dal diritto italiano — in particolare dal GDPR e dal D.Lgs. 196/2003 (Codice Privacy, come modificato dal D.Lgs. 101/2018).",
          },
          {
            kind: "p",
            text: "Controversie: sono competenti i tribunali del luogo in cui è stabilito il titolare (Italia), fatto salvo il diritto dei consumatori residenti nell'UE di adire i tribunali del proprio paese di residenza (Regolamento (UE) 1215/2012, Bruxelles I bis) e la protezione delle loro disposizioni nazionali inderogabili (Regolamento (CE) 593/2008, Roma I). Formulazione definitiva da confermare al lancio.",
          },
          {
            kind: "p",
            text: "Reclami: puoi rivolgerti all'autorità di controllo competente — in Italia, il Garante per la protezione dei dati personali (www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "13. Modifiche a questi termini",
        blocks: [
          {
            kind: "p",
            text: "Questi termini sono versionati e conservati nel repository. Le modifiche sostanziali (finalità, licenze, pubblicazione dei dati, governance) richiedono una proposta pubblica documentata e un periodo di commento ragionevole.",
          },
          {
            kind: "p",
            text: "Le modifiche non sostanziali entrano in vigore alla pubblicazione con un avviso. Il continuato utilizzo del Servizio dopo la data di efficacia costituisce accettazione; dove la legge richiede il consenso, sarà acquisito separatamente.",
          },
        ],
      },
      {
        heading: "14. Contatti",
        blocks: [
          {
            kind: "p",
            text: "Privacy, correzioni, ricorsi, diritti: privacy@opensurveillancedb (casella dedicata — da creare prima del lancio; dominio definitivo da confermare).",
          },
          {
            kind: "p",
            text: "Le emergenze di moderazione/abuso usano lo stesso canale (oscuramento entro 24 ore).",
          },
        ],
      },
      {
        heading: "15. Stato pre-lancio",
        blocks: [
          {
            kind: "note",
            text: "Questi termini sono proposti per il lancio pubblico e non sono ancora in vigore: nessun servizio pubblico è attivo e nulla qui costituisce un'offerta o un impegno vincolante. I meccanismi di accettazione, l'applicazione automatizzata della conservazione e l'endpoint di cancellazione dell'account sono ancora in fase di implementazione prima del lancio.",
          },
        ],
      },
    ],
  },
  licenses: {
    eyebrow: "Licenze",
    title: "Open source e licenza dei dati",
    intro:
      "Come sono concessi in licenza il software, la documentazione e il database pubblico di OpenSurveillanceDB.",
    updated: "Deciso il 31 luglio 2026 · ADR 0008 (pre-lancio)",
    sections: [
      {
        heading: "Software",
        blocks: [
          {
            kind: "p",
            text: "Il codice sorgente dell'applicazione è concesso con licenza AGPL-3.0-or-later. Questo mantiene disponibili alla comunità le versioni modificate dei servizi di rete. Vedi LICENSE nel repository.",
          },
        ],
      },
      {
        heading: "Documentazione",
        blocks: [
          {
            kind: "p",
            text: "Salvo diversa indicazione in un documento, la documentazione del progetto è proposta con licenza CC BY-SA 4.0. I contributori mantengono il credito per i propri contributi secondo la normale storia del repository.",
          },
        ],
      },
      {
        heading: "Database ed esportazioni",
        blocks: [
          {
            kind: "p",
            text: "Il database pubblico necessita di una licenza esplicita prima di contenere segnalazioni reali. Deciso il 31 luglio 2026 (ADR 0008): il database e ogni formato di esportazione sono concessi con licenza ODbL 1.0, con chiara attribuzione e avvisi share-alike. Questa scelta deve ancora essere verificata rispetto alle regole giurisdizionali, ai termini delle fonti e al modello dati finale prima della beta pubblica.",
          },
        ],
      },
      {
        heading: "Dati OpenStreetMap",
        blocks: [
          {
            kind: "p",
            text: "I dati OpenStreetMap sono disponibili con la Open Database Licence. L'uso di uno sfondo mappa OSM non rende automaticamente ogni segnalazione del progetto un contributo OSM. Se i dati vengono importati da OSM, derivati da esso o combinati in un database derivato, il progetto deve documentare il rapporto, fornire l'attribuzione richiesta e rispettare gli obblighi ODbL.",
          },
        ],
      },
      {
        heading: "Impegno dei contributori",
        blocks: [
          {
            kind: "p",
            text: "I contributori devono inviare solo materiale che hanno il diritto di condividere. Concedono al progetto i diritti necessari per pubblicare codice, documentazione e dati accettati con la licenza di progetto pertinente. I caricamenti di prove richiedono un flusso separato ed esplicito di contributo e privacy prima di essere attivati.",
          },
        ],
      },
      {
        heading: "Stato pre-lancio",
        blocks: [
          {
            kind: "note",
            text: "La licenza dei dati (ODbL 1.0) è stata decisa il 31 luglio 2026 e si applica dal lancio pubblico; le esportazioni riportano l'avviso ODbL.",
          },
        ],
      },
    ],
  },
};

/** Bilingual lookup for the legal pages: legalMessages[locale][page]. */
export const legalMessages: Record<Locale, LegalContent> = {
  en: legalEn,
  it: legalIt,
};
