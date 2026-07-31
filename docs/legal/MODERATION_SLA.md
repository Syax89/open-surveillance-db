# Moderation service-level agreement (draft)

Status: **DRAFT proposal — to be confirmed by the maintainers before launch.**
Operational targets for responding to reports, correction/removal requests, and
appeals. These targets implement MODERATION.md ("Appeals and corrections") and
the findings M1–M4 of the legal review.

## 1. Response targets

| # | Target | Time | Notes |
| --- | --- | --- | --- |
| S1 | Hide urgent privacy/safety reports | **≤ 24 hours** | A credible report of privacy harm or safety risk makes the record temporarily hidden while reviewed (MODERATION.md). Hide ≠ delete; the record is not publicly visible during review. |
| S2 | First response to a correction/removal request | **≤ 48 hours** | Acknowledgment with expected timeline (business days excluded for counting, documented). |
| S3 | Substantive response / decision on a request | **≤ 14 days** | Compatible with GDPR art. 12(3) (one month, extendable by two, with notice). |
| S4 | Review of temporary hides | **≤ 30 days** | After 30 days a hidden record is either restored, corrected, or removed with a recorded reason. |
| S5 | Appeal decision | **≤ 14 days** | Decided by a moderator **different from the original decision-maker** (M2); escalation to the advisory circle for disputed or sensitive cases (GOVERNANCE.md). |
| S6 | Re-verification cycle for published records | ≤ 12 months | Periodic maintenance per MODERATION.md ("Maintain") and RETENTION_SCHEDULE.md (R3). |

## 2. Audit log (M3)

Every decision records, in `moderation_events` (drizzle migration 0002):

- entity and entity id, previous/new status, action;
- `reason_code` (controlled vocabulary) and optional note;
- `actor`: **pseudonymous moderator identifier only**;
- timestamp.

Retention: 2 years (RETENTION_SCHEDULE.md R6). The audit log is internal;
transparency reporting is published only in aggregate (PRIVACY_AND_SAFETY.md).

## 3. Moderator privacy (M4)

- Moderators are identified by a pseudonymous ID in all logs and audit
  events. Email and full name from the ChatGPT-auth headers are **never**
  stored or logged (see PROCESSOR_REGISTER.md P2).
- Moderation credentials are separate from general contributor accounts
  (MODERATION.md).

## 4. Reporting

- Aggregate statistics (volumes, median response times, hide/restore rates)
  are published periodically without exposing reporters or reviewers
  (PRIVACY_AND_SAFETY.md).
- The SLA is reviewed quarterly; missed targets are recorded and acted on.

## 5. Open items

- Define the appeal intake channel (form or contact) and its routing before
  launch.
- Confirm the "trained moderator" requirement and the jurisdiction playbook
  (finding M5) so the SLA has accountable owners.
