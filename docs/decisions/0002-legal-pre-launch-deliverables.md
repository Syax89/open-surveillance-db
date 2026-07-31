# ADR 0002: Legal pre-launch deliverables (retention, notice, lawful basis, processors)

- **Status:** proposed (drafts in `docs/legal/`, pending maintainer review and
  external legal review)
- **Date:** 2026-07-31
- **Parent:** review findings P1–P6, M1–M4 (`REVIEW_POLICY_LEGALE_2026-07-31.md`)

## Context

PRIVACY_AND_SAFETY.md requires, before launch: a privacy notice, a
lawful-basis analysis per jurisdiction, a retention schedule, a
correction/removal path, a data-access contact, and a processor/sub-processor
register. The legal review found these deliverables missing (P1, P3, P5, P6)
and added breach procedure (P2) and moderation SLA items (M1–M4).

## Decisions

1. **Location:** the deliverables live in `docs/legal/` as versioned drafts,
   reviewed through PRs like the rest of the documentation. They are marked
   DRAFT and are not legal advice.
2. **Retention values (proposal):** unreviewed `pending` → 90 days; `rejected`
   → 30 days; verified records → verification cycle (≤ 12 months, remove after
   90 days unreviewed in `needs_review`); correction requests and moderation
   audit events → 2 years; evidence → tied to the record; logs ≤ 12 months;
   backups ≤ 12 months. Individual rights (art. 17) override the schedule;
   legal hold suspends deletion.
3. **Lawful basis:** art. 6(1)(f) legitimate interest (civic transparency) is
   the primary basis for publishing records of visible public infrastructure,
   with a documented balancing test (WP29 Opinion 06/2014); art. 6(1)(e) is
   not applicable to a private civic project absent a statutory basis.
   DPIA (art. 35) recommended before launch.
4. **Processors:** Cloudflare (Workers/D1) under its DPA (EU SCCs 2021/914,
   EU–US DPF) with D1 data-location pinned to the EU for the primary
   jurisdiction; OpenAI (ChatGPT auth for moderators) under the OpenAI DPA,
   with emails/names never logged; OSMF is an independent controller, not a
   processor.
5. **Breach procedure:** art. 33/34 workflow with a scenario table specific to
   this project and a 72-hour notification track.
6. **Moderation SLA:** hide urgent reports ≤ 24 h; first response ≤ 48 h;
   substantive response ≤ 14 days; appeals by an independent moderator.

## Consequences

- Deletion jobs, rate limiting, authenticated moderation, and the `notes`
  boundary fix are technical prerequisites for the schedule (tasks owned by
  the engineering workstream, findings H1–H3).
- The retention values are proposals: the maintainers and external counsel may
  amend them; the ADR and the schedule are updated accordingly.
- The privacy notice must be localized (Italian + English) and the controller
  identity/contact finalized before launch (DEPLOYMENT.md precondition).
- The processor register must be re-archived when DPA annexes change and
  extended for any new processor (e.g. evidence storage) before it goes live.
