# ADR 0007: Data licence, publication precision, retention, and privacy contact

- **Status:** accepted (CEO decision, 2026-07-31)
- **Date:** 2026-07-31
- **Author:** Rosa (DPO / privacy), recording the CEO decision
- **Decision owner:** CEO
- **Related ADRs:** 0002 (legal pre-launch deliverables), 0004 (retention
  schedule), 0005 (processors and data residency), 0006 (pilot boundary)
- **Related docs:** README, `docs/OPEN_SOURCE.md`, `docs/DATA_MODEL.md`,
  `docs/legal/PRIVACY_NOTICE.md`, `docs/legal/RETENTION_SCHEDULE.md`,
  `docs/legal/REVIEW_POLICY_LEGALE_2026-07-31.md` (findings O1, O2, O4),
  `docs/EXECUTION_BOARD.md` (Wave A item 3)

## Context

`docs/EXECUTION_BOARD.md` (Wave A, item 3) requires, before any public alpha:
choose the data licence, the publication precision, the retention approach,
and the correction/removal contact. Without them the Wave A gate — "there is
no ambiguity about what data may enter the pilot" — cannot be met.

The existing documents already point at candidate answers but none is a
decision:

- `docs/OPEN_SOURCE.md` proposes **ODbL 1.0** for the database and exports but
  frames it as "the current proposal", pending a decision;
- the Italian legal review (`REVIEW_POLICY_LEGALE_2026-07-31.md`, finding O2)
  requires the CSV/GeoJSON exports to carry the ODbL attribution/share-alike
  notices (produced-work requirement), and clarifies that `demo` records fall
  inside the ODbL perimeter;
- `docs/DATA_MODEL.md` says coordinates are "rounded where necessary" but
  defines no concrete default precision;
- the retention schedule (ADR 0004) proposes a re-verification cycle of at
  least every 12 months for verified records, still marked as an "initial
  proposal";
- the privacy contact is a placeholder (`privacy@…`) in PRIVACY_NOTICE.md,
  RETENTION_SCHEDULE.md (R9), MODERATION_SLA.md, and BREACH_PROCEDURE.md.

The CEO decided all four points on 2026-07-31, delegating full authority on
this matter to the project team.

## Decision

1. **Data licence: ODbL 1.0** (Open Data Commons Open Database License) for
   the public dataset and for every export format (JSON, CSV, GeoJSON), as
   already anticipated by `docs/OPEN_SOURCE.md`, the privacy notice, and the
   lawful-basis assessment. Exports must carry the ODbL notices required for
   produced works — attribution to the source database and a link to the
   licence — in their metadata/header (legal-review finding O2). The `demo`
   records are inside the ODbL perimeter; they are purged before launch
   (ADR 0004, R12) and never exported to a public audience. Software stays
   AGPL-3.0-or-later and documentation CC BY-SA 4.0 (unchanged,
   `docs/OPEN_SOURCE.md`).

2. **Publication precision: ~4 decimal places by default** for published
   coordinates (approximately 11 m at Ferrara's latitude). Four decimals are
   enough to locate a camera on its street and to verify a record against the
   real world, but coarse enough not to pinpoint exact mounting details or
   private property. Moderators may publish **coarser** values freely; values
   **finer** than 4 decimals require a documented justification in the review
   note (e.g. an official-source record whose precision is part of its
   provenance). Rounding, never truncation, and the published point must stay
   on public space, consistent with `docs/DATA_MODEL.md`
   ("prefer a precise coordinate only when its publication is safe").

3. **Retention: 12 months for verified records.** A verified record is
   retained while accurate and is re-verified at least every 12 months
   (ratifying the initial proposal in ADR 0004, R3); a record that fails its
   re-verification moves to `needs_review` and is removed after 6 months
   unverified. Individual rights (GDPR art. 17) override the schedule, and
   legal hold suspends deletion — both already defined in
   `docs/legal/RETENTION_SCHEDULE.md` § 2.

4. **Correction/removal contact: `privacy@opensurveillancedb`.** This is the
   monitored mailbox for data-subject requests (art. 15–17 GDPR), correction
   and takedown requests for published records, and privacy/security reports
   that prefer a private route. Response commitments follow MODERATION_SLA.md
   (first response ≤ 48 h, substantive response ≤ 14 days); correspondence is
   retained 2 years (RETENTION_SCHEDULE.md, R9). The address replaces the
   `privacy@…` placeholders in PRIVACY_NOTICE.md, RETENTION_SCHEDULE.md,
   MODERATION_SLA.md, and BREACH_PROCEDURE.md.

## Consequences

- **Implementation (ada):** ODbL notices in CSV/GeoJSON exports (O2) and the
  SPDX short-form licence in `package.json` (O1) become pre-launch
  requirements; coordinate rounding to 4 decimals becomes the default in the
  intake/publication pipeline.
- **Docs (marie):** the placeholders in the legal drafts are replaced with
  `privacy@opensurveillancedb`; `docs/OPEN_SOURCE.md` and `docs/DATA_MODEL.md`
  are updated from "proposal"/"where necessary" to the decided defaults.
- **Ops (ken):** the mailbox must be provisioned and its operator named before
  the address is published; the retention cron job required by ADR 0004
  remains a launch precondition.
- **Review:** the 12-month cycle stays an initial value and must be revisited
  after the first year of operations with real volumes (ADR 0004).
- Wave A item 3 is now decided; items 4–5 are tracked on the execution board.
