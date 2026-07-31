# Pre-launch legal deliverables — index

- **Status:** all documents are **drafts** for pre-launch review; nothing here is a published commitment.
- **Owner:** Rosa (DPO / privacy)
- **Produced from:** review findings P1-P6, M1-M5 in `REVIEW_POLICY_LEGALE_2026-07-31.md` (task t_05d84417).

## Deliverables

| Document | Covers (findings) | Status | Owner |
|----------|-------------------|--------|-------|
| [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) | P1, M3 — retention values (90/30 days, review cycle, 2-year audit, evidence, backups) | Draft | Rosa |
| [PRIVACY_NOTICE.md](PRIVACY_NOTICE.md) | P6, M4 — purposes, bases, rights (arts. 12-22), contact, 1-month response, identity verification | Draft | Rosa |
| [LAWFUL_BASIS.md](LAWFUL_BASIS.md) | P3 — art. 6(1)(f) + LIA balancing test, 6(1)(e) for official sources, IT jurisdiction (D.Lgs. 196/2003) | Draft | Rosa |
| [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) | P5, M4 — Cloudflare (DPA + SCC + EU residency), OpenAI auth (not a processor; never log emails), others | Draft | Rosa |
| [BREACH_PROCEDURE.md](BREACH_PROCEDURE.md) | P2 — arts. 33/34, roles, triage, 72-h notification, data-subject notification, register | Draft | Rosa |
| [MODERATION_SLA.md](MODERATION_SLA.md) | M1, M2, M3 — 24 h emergency hide, 48 h first response, 14-day decision, 30-day hide review, independent appeals | Draft | Rosa |
| [decisions/0002-retention-and-review-cycle.md](decisions/0002-retention-and-review-cycle.md) | ADR — retention values + enforcement | Proposed | Rosa |
| [decisions/0003-processors-and-data-residency.md](decisions/0003-processors-and-data-residency.md) | ADR — processor choice, SCC, EU residency, OpenAI role | Proposed | Rosa |

## How they map to the policy documents

- PRIVACY_AND_SAFETY.md "User rights and accountability" (privacy notice, lawful-basis analysis, retention schedule, correction/removal path, data-access contact, processor register) → all satisfied by drafts above.
- MODERATION.md "Appeals and corrections" + "Moderator safeguards" → MODERATION_SLA.md.
- SECURITY.md "monitored private disclosure address and a response-time commitment" → BREACH_PROCEDURE.md § 2/5 (mailbox to be created at launch).

## Still open (other pre-launch items from the review, not in this task's scope)

- **Terms of use** (review action list #2) — separate drafting task (rosa).
- **DCO / inbound licensing** (O3) — CONTRIBUTING.md update (docs task, marie).
- **ODbL notices in CSV/GeoJSON exports** (O2) — implementation (ada).
- **package.json name/license** (O1) — implementation (ada, with H1-H4 fixes).
- **Retention cron job** (ADR 0002) — implementation (ada).

## Integration

Draft files live in the workspace of task t_dff09a5c. A follow-up task (marie) copies them into `docs/` of the repository and cross-links the policy documents, pending human review of the drafts.
