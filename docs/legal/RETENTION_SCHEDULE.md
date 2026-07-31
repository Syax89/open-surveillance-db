# Retention schedule

Status: **DRAFT proposal — values to be confirmed by the maintainers and by
external legal review before launch.**

Legal anchors:

- GDPR art. 5(1)(e): personal data must be kept no longer than necessary
  ("storage limitation"); every retention term must be justified and published.
- GDPR art. 17: the right to erasure is exercised on request regardless of this
  schedule (an individual request overrides the default terms below).
- GDPR art. 5(2): the controller must be able to demonstrate compliance.

Scope: every data category the prototype currently stores or is planned to
store (see `docs/DATA_MODEL.md`, `drizzle/*.sql`, `db/cameras.ts`). The
schedule applies to production data. Demo/synthetic records are covered
separately at the bottom.

## Data categories and terms

| # | Data category | Where stored | Retention | Trigger / disposition |
| --- | --- | --- | --- | --- |
| R1 | Pending report, not reviewed (`status = pending`, untouched) | `cameras` | **90 days** from `created_at` | Automatic deletion after 90 days if no review decision was made. |
| R2 | Pending report, reviewed and approved (`pending → verified`) | `cameras` | Tied to the record lifecycle (R3) | Becomes a public record; follows the verification cycle. |
| R3 | Verified public record | `cameras` | While accurate and current; re-verification cycle ≤ **12 months** (proposal) | Periodic re-check (MODERATION.md "Maintain"). If not re-verified, status → `needs_review`; if still not re-verified after **90 days**, the record is removed. Stale records are retired rather than presented as current (DATA_MODEL.md "Data quality rules"). |
| R4 | Rejected report (`status = rejected`) | `cameras` | **30 days** from the rejection decision | Deletion after 30 days (window for internal review of the decision). |
| R5 | Correction / removal request (`correction_requests`, incl. the optional `contact` field) | `correction_requests` | **2 years** from final resolution | Kept for audit and for the data subject's own follow-up; then deleted. `contact` is used only to answer the request and is never published. |
| R6 | Moderation audit events (`moderation_events`; `actor` is a pseudonym) | `moderation_events` | **2 years** from the event | Supports internal accountability (MODERATION.md); then deleted. Suspended (legal hold) if litigation or a supervisory-authority request is pending. |
| R7 | Intake `notes` (free text ≤ 1000 chars) | `cameras.notes` | **2 years** as moderation context | Never published (currently exposed in the public JSON API — boundary bug H3, fix pending in `db/cameras.ts`). After the record leaves the review cycle, notes follow the record's retention. |
| R8 | Evidence (images, media, supporting material) | Not implemented (ARCHITECTURE.md) | Tied to the record it supports; delete **90 days** after the record is removed or the final decision plus appeal window elapses | Never public; least-privilege access; deletion must be automated. To be refined when evidence storage is designed. |
| R9 | Application / operational logs | Logging platform | **12 months** max | Logs must not contain personal data by design (M4: never log emails); aggregate only. |
| R10 | Backups (database) | Backup storage | Max **12 months**; mirror source-data terms where technically feasible | Encrypted; restoration drill exists (DEPLOYMENT.md). |
| R11 | Exported datasets (CSV/GeoJSON, ODbL) | Already-distributed copies | Cannot be recalled | Declared in the privacy notice; future exports exclude removed records; each export is versioned. |

## Notes

- Individual rights override the schedule: art. 17 erasure and art. 21
  objection requests are processed on the normal 1-month track (art. 12(3))
  even if the schedule term has not yet elapsed.
- "Deletion" means irreversible deletion from the database and, where
  technically feasible, from backups; otherwise the data is excluded from all
  future processing and exports.
- Legal hold: any pending litigation, complaint, or supervisory-authority
  inquiry suspends the relevant deletions until the matter is closed. The hold
  and its end date are recorded in the audit log.
- Implementation required before launch: a scheduled deletion job (worker/cron)
  covering R1, R4, R5, R6, R9, R10 and the `needs_review` retirement path in
  R3, plus a deletion audit log.
- The 90/30-day and 12-month values are proposals grounded in the review
  report findings (P1) and in the project's own "Maintain / retire stale
  records" rule; they must be confirmed (or amended) by the maintainers and by
  external legal review before the schedule is published.
