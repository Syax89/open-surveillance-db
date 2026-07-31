# Legal pre-launch deliverables

Status: **DRAFT — pre-launch**. These documents are project drafts produced by the
DPO/legal function to satisfy the requirements already declared by the project
policies. They are **not legal advice** and must receive an independent review
by qualified counsel before any public launch (see PRIVACY_AND_SAFETY.md:
"local legal review is required before any public launch").

## Scope

The policies reviewed in [`REVIEW_POLICY_LEGALE_2026-07-31.md`](REVIEW_POLICY_LEGALE_2026-07-31.md)
(findings P1–P6, M1–M5) declare these deliverables as preconditions for launch.
This folder is the **single canonical location** for the pre-launch legal
deliverables (ADR 0002); the full index with finding coverage is in
[`LEGAL_DELIVERABLES_INDEX.md`](LEGAL_DELIVERABLES_INDEX.md).

## Documents

| Document | Status | Covers | Findings |
| --- | --- | --- | --- |
| [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) | Draft proposal | Storage limitation, deletion terms per data category, operational logs, legal hold, deletion definition | P1 |
| [PRIVACY_NOTICE.md](PRIVACY_NOTICE.md) | Draft | Art. 13/14 information, rights (12–22), negative scope, contact, response times | P6 |
| [LAWFUL_BASIS.md](LAWFUL_BASIS.md) | Draft outline | Art. 6 bases per processing category, balancing test, 6(1)(e) for official sources | P3 |
| [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) | Draft | Art. 30 register: Cloudflare, OpenAI auth, OSM; DPA version, SCC, EU–US DPF | P5, M4 |
| [BREACH_PROCEDURE.md](BREACH_PROCEDURE.md) | Draft | Art. 33/34 notification procedure, scenario table | P2 |
| [MODERATION_SLA.md](MODERATION_SLA.md) | Draft proposal | Response targets, appeals, audit log, moderator privacy | M1–M4 |

Decision records: `docs/decisions/0002-legal-pre-launch-deliverables.md`,
`docs/decisions/0004-retention-and-review-cycle.md`,
`docs/decisions/0005-processors-and-data-residency.md`.

## Open items before launch (not owned by this folder)

- Confirm the controller identity and the public privacy contact (DEPLOYMENT.md
  "Preconditions for a public environment").
- Translate the privacy notice into Italian before launch (primary
  jurisdiction; GDPR art. 12(1) "clear and plain language") — see
  PRIVACY_NOTICE.md open items.
- Confirm the SCC version applicable at DPA execution (new-generation SCCs
  announced for adoption in 2025) — see PROCESSOR_REGISTER.md open items.
- External legal review of all six documents.
- Implement the technical enablers the schedule depends on: deletion jobs,
  rate limiting (H2), authenticated moderation (H1), `notes` boundary fix (H3).
