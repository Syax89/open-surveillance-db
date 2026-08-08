# Legal deliverables

Status: **IN FORCE**. These documents are the legal package of OpenSurveillanceDB,
a **personal, open and collaborative project** (ADR 0021): the controller is the
project owner Simone Rondina (syax89), Italy — not a company (see
PRIVACY_NOTICE.md § 1 and the GDPR art. 37 assessment in DPO_EXCLUSION.md). They
were drafted by the privacy/legal function and reviewed by the project owner
before public launch. **They are not legal advice**; where professional counsel
is required (per-jurisdiction review before an EU-wide launch), that review is
recorded in the version history.

## Scope

The policies reviewed in [`REVIEW_POLICY_LEGALE_2026-07-31.md`](REVIEW_POLICY_LEGALE_2026-07-31.md)
(findings P1–P6, M1–M5) declare these deliverables as preconditions for launch.
This folder is the **single canonical location** for the legal deliverables
(ADR 0002); the full index with finding coverage is in
[`LEGAL_DELIVERABLES_INDEX.md`](LEGAL_DELIVERABLES_INDEX.md).

## Documents

| Document | Status | Covers | Findings |
| --- | --- | --- | --- |
| [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) | In force (implemented) | Storage limitation, deletion terms per data category, operational logs, legal hold, deletion definition | P1 |
| [PRIVACY_NOTICE.md](PRIVACY_NOTICE.md) | In force | Art. 13/14 information, rights (12–22), negative scope, contact, response times | P6 |
| [LAWFUL_BASIS.md](LAWFUL_BASIS.md) | In force | Art. 6 bases per processing category, balancing test, 6(1)(e) for official sources | P3 |
| [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) | In force | Art. 30 register: Cloudflare, OpenAI auth, OSM; DPA version, SCC, EU–US DPF | P5, M4 |
| [BREACH_PROCEDURE.md](BREACH_PROCEDURE.md) | In force | Art. 33/34 notification procedure, scenario table | P2 |
| [MODERATION_SLA.md](MODERATION_SLA.md) | In force (implemented) | Response targets, appeals, audit log, moderator privacy | M1–M4 |
| [DPO_EXCLUSION.md](DPO_EXCLUSION.md) | In force | GDPR art. 37 assessment: no mandatory DPO (art. 37(1) N/A), voluntary DPO declined (art. 37(4)), accountability (arts. 5(2), 24), review triggers | P6, gap 7 |

Decision records: `docs/decisions/0002-legal-pre-launch-deliverables.md`,
`docs/decisions/0004-retention-and-review-cycle.md`,
`docs/decisions/0005-processors-and-data-residency.md`,
`docs/decisions/0017-no-dpo-appointed-art37.md`.

Related documents (outside this folder): the
[accessibility statement](../ACCESSIBILITY_STATEMENT.md) and
[ADR 0006 — non-sensitive usability-feedback route](../decisions/0006-non-sensitive-usability-feedback-route.md)
are product/UX deliverables; they are linked here only for discoverability.

## Open items before launch (not owned by this folder)

- Controller identity decided (2026-07-31): **Simone Rondina (syax89) / OpenSurveillanceDB — Italy**; privacy mailbox `privacy@opensurveillancedb.org` active (DEPLOYMENT.md
  "Preconditions for a public environment").
- Translate the privacy notice into Italian before launch (primary
  jurisdiction; GDPR art. 12(1) "clear and plain language") — see
  PRIVACY_NOTICE.md open items.
- Confirm the SCC version applicable at DPA execution (new-generation SCCs
  announced for adoption in 2025) — see PROCESSOR_REGISTER.md open items.
- External legal review of all six documents.
- Implement the technical enablers the schedule depends on: deletion jobs,
  rate limiting (H2), authenticated moderation (H1), `notes` boundary fix (H3).
