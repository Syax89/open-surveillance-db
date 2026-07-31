# ADR 0002: Legal pre-launch deliverables (retention, notice, lawful basis, processors)

- **Status:** proposed (drafts in `docs/legal/`, pending maintainer review and
  external legal review)
- **Date:** 2026-07-31 (updated 2026-07-31 by PR #8 legal-review consolidation)
- **Parent:** review findings P1–P6, M1–M5 (`docs/legal/REVIEW_POLICY_LEGALE_2026-07-31.md`,
  committed to the repository)
- **Related ADRs:** 0004 (retention values and enforcement), 0005 (processors
  and data residency) — these record the detailed decisions; this ADR is the
  umbrella decision for the deliverables.

## Context

PRIVACY_AND_SAFETY.md requires, before launch: a privacy notice, a
lawful-basis analysis per jurisdiction, a retention schedule, a
correction/removal path, a data-access contact, and a processor/sub-processor
register. The legal review found these deliverables missing (P1, P3, P5, P6)
and added breach procedure (P2) and moderation SLA items (M1–M4).

## Decisions

1. **Location:** the deliverables live in `docs/legal/` as versioned drafts,
   reviewed through PRs like the rest of the documentation. They are marked
   DRAFT and are not legal advice. This is the **single canonical location**;
   earlier draft copies at the repository root were removed in PR #8.
2. **Retention values (proposal):** adopted in ADR 0004 and
   `docs/legal/RETENTION_SCHEDULE.md`: unreviewed `pending` → 90 days;
   `rejected` → 30 days; verified records → verification cycle (≤ 12 months,
   remove after **6 months** unreviewed in `needs_review`); correction requests
   and moderation audit events → 2 years; evidence → tied to the record;
   operational logs → ≤ 12 months, aggregate-only; backups → provider-managed
   (**24 h hourly snapshots / 30 days PITR**). Individual rights (art. 17)
   override the schedule; legal hold suspends deletion. *(Updated in PR #8:
   `needs_review` removal 90 days → 6 months; backups ≤ 12 months →
   provider-managed PITR; operational-logs row added.)*
3. **Lawful basis:** art. 6(1)(f) legitimate interest (civic transparency) is
   the primary basis for publishing records of visible public infrastructure,
   with a documented balancing test (WP29 Opinion 06/2014); art. 6(1)(e) is
   **not** the primary basis for community-sourced records, but applies to
   republication of records from **official public sources** where national
   transparency law provides the art. 6(3) statutory anchor (see
   `docs/legal/LAWFUL_BASIS.md` § 3.2). DPIA (art. 35) recommended before
   launch.
4. **Processors:** Cloudflare (Workers/D1) under its DPA (**v6.3, June 2025**;
   EU SCCs 2021/914, EU–US DPF) with D1 data-location pinned to the EU for the
   primary jurisdiction; OpenAI (ChatGPT auth for moderators) under the OpenAI
   DPA, with emails/names never logged; OSMF is an independent controller, not
   a processor. Open item: confirm the SCC version applicable at DPA execution
   (new-generation SCCs announced for adoption in 2025) — see ADR 0005.
5. **Breach procedure:** art. 33/34 workflow with a scenario table specific to
   this project and a 72-hour notification track.
6. **Moderation SLA:** hide urgent reports ≤ 24 h; first response ≤ 48 h
   (continuous clock); substantive response ≤ 14 days; appeals by an
   independent moderator.

## Consequences

- Deletion jobs, rate limiting, authenticated moderation, and the `notes`
  boundary fix are technical prerequisites for the schedule (tasks owned by
  the engineering workstream, findings H1–H3).
- The retention values are proposals: the maintainers and external counsel may
  amend them; the ADR and the schedule are updated accordingly.
- The privacy notice must be localized (Italian + English, per GDPR art. 12(1))
  and the controller identity/contact finalized before launch (DEPLOYMENT.md
  precondition).
- The processor register must be re-archived when DPA annexes change and
  extended for any new processor (e.g. evidence storage) before it goes live.
- The review document `REVIEW_POLICY_LEGALE_2026-07-31.md` is committed to the
  repository so the P1–P6/M1–M5/H1–H6 finding codes used across the drafts are
  resolvable.
