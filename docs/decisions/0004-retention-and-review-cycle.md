# ADR 0004: Retention schedule and review cycle

- **Status:** proposed (draft, awaiting launch review)
- **Date:** 2026-07-31
- **Author:** Rosa (DPO / privacy)
- **Supersedes/updates:** ADR 0002-legal-pre-launch-deliverables, retention-values section (see "Supersession note" below).

## Context

PRIVACY_AND_SAFETY.md commits to a "published retention schedule" but no concrete values exist (review finding P1). GDPR art. 5(1)(e) requires storage limitation; art. 17 requires an erasure path. The moderation audit log also needs a retention target (M3). The hosting backend (Cloudflare D1) has provider-managed backup retention (hourly snapshots 24 h, Time Travel point-in-time recovery 30 days) that sets a technical floor for deletion.

## Decision

Adopt the retention schedule in `docs/legal/RETENTION_SCHEDULE.md`:

- `pending` reports not verified: **90 days** from submission (reset on last moderator activity when clarification was requested);
- `rejected` reports: **30 days** from the rejection decision;
- `verified` records: kept while accurate, with a **re-verification cycle of at least every 12 months**; unverified records move to `needs_review` and are removed after **6 months** unverified;
- correction/takedown requests and moderation audit entries: **2 years** (audit trail);
- evidence: tied to the lifecycle of the record it supports;
- application/operational logs: **≤ 12 months**, aggregate-only (never raw emails or personal data);
- backups: accepted as provider-managed (**24 h hourly snapshots / 30 days PITR**); erasure responses disclose the backup rotation horizon;
- `demo` records: purged before public launch.

Individual rights (art. 17) override the schedule; **legal hold** suspends deletion while litigation, a complaint, or a supervisory-authority inquiry is pending; "deletion" is defined as irreversible deletion, with exclusion from future processing/exports as the fallback where backups make full erasure not yet technically feasible.

Enforcement is automated via a scheduled job (D1/Workers cron) to be implemented by ada (`db/retention.ts` + tests).

## Supersession note

This ADR updates the earlier values proposed in ADR 0002-legal-pre-launch-deliverables:
- `needs_review` removal: **90 days → 6 months** (aligned with the review cycle and the appeal window);
- application/operational logs row: **added** (≤ 12 months, aggregate);
- backups: **12 months → provider-managed 24 h / 30 days PITR** (the R2 export backup does not exist, so a 12-month backup term was not operationally meaningful).

## Consequences

- Contributors and requesters get predictable deletion; the schedule is referenced by the privacy notice.
- The 30-day rejected window and the 14-day substantive-response SLA align with the appeal path (MODERATION_SLA S5).
- A cron job and tests are required before launch (new implementation work).
- The 12-month re-verification cycle is **confirmed as the retention decision (2026-07-31, CEO — see ADR 0007)**; it must still be revisited after the first year of operations with real volumes.
