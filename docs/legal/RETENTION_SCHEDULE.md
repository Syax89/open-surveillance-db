# Retention schedule (operational)

- **Status:** draft for pre-launch review (ADR 0004)
- **Owner:** Rosa (DPO / privacy)
- **Legal basis:** GDPR art. 5(1)(e) (storage limitation), art. 17 (erasure); D.Lgs. 196/2003 (Codice Privacy, IT) as primary jurisdiction; consistent with `../PRIVACY_AND_SAFETY.md` and `../MODERATION.md`.
- **Scope:** all data held by OpenSurveillanceDB, including submissions, moderation data, evidence, correction requests and backups.

> **Disclaimer:** this document is product guidance / not legal advice. It is a draft for pre-launch review and requires external counsel review before launch.

## 1. Retention table

| # | Data category | Retention | Trigger / start | Action at expiry | Notes |
|---|---------------|-----------|-----------------|------------------|-------|
| R1 | `pending` report (non-verified submission) | **90 days** | Submission date; reset on last moderator activity when clarification was requested | Hard delete of the record and its evidence | Covers the moderation queue and the requester's chance to supply clarification. |
| R2 | `rejected` report | **30 days** | Rejection decision | Hard delete of the record and its evidence | Leaves a short appeal window (see MODERATION_SLA.md); rejected content is never public. |
| R3 | `verified` record (published) | **Review cycle (initial proposal: re-verification ≥ every 12 months)** | Date of verification / last re-verification | If not re-verified: `needs_review` → after 6 months unverified → `removed` (record and evidence deleted) | Retention is justified by the public-interest dataset purpose; periodic review keeps data accurate (art. 5(1)(d)) and current. |
| R4 | Correction / takedown request | **2 years** | Resolution date | Archive the entry in the internal audit log, then delete | Accountability trail (art. 5(2)); aligned with the moderation audit log (M3). |
| R5 | Moderation audit log entry (decision, reason code, timestamp, reviewer pseudonym) | **2 years** | Decision time | Delete | Aligned with R4; contains no personal data of reporters; reviewer identities are pseudonymous and never logged as raw emails. |
| R6 | Evidence (files / links supporting a record) | **Tied to the record it supports** | Same lifecycle as R1/R2/R3 | Deleted with the record; hard-deleted immediately if the record is rejected/removed | Evidence containing incidental personal data (e.g. faces, plates, interiors) is redacted or deleted on the spot; never published. |
| R7 | Contributor metadata (pseudonymous internal ID, submission timestamp) | **90 days as pending, then tied to the record** | Submission date | Deleted with the record; on verified records kept as provenance (source, date) as long as the record is public | Pseudonymous by design (GDPR art. 25(1)); raw contact data of contributors is not collected. |
| R8 | Moderator identity (ChatGPT sign-in: email, display name, full name) | **Not stored** | — | — | Used for authentication only; emails are never logged in application logs (M4); audit logs carry a reviewer pseudonym only. |
| R9 | Correspondence with the privacy contact (privacy@…) | **2 years** | Last message date | Delete | Applies to data-subject requests and breach communication. |
| R10 | Backups (Cloudflare D1: hourly automatic backups, Time Travel PITR) | **Provider-managed: 24 h hourly snapshots, 30 days point-in-time recovery** | Continuous | Automatic rotation by the provider | An erasure under art. 17 becomes fully effective at the next backup rotation; the remaining window (max 30 days) is disclosed in the erasure response. R2 is not used (`hosting.json` `r2: null`): no long-term export backups exist. |
| R11 | Application / operational logs | **≤ 12 months** | Log entry creation | Delete; aggregate-only | Logs must not contain personal data by design (M4: never log emails); used for security, availability and abuse prevention; retained in aggregate only. |
| R12 | `demo` records | As long as the prototype needs them | — | Purged before public launch | Fictional, clearly labelled content; not personal data. |

## 2. Erasure requests (art. 17 GDPR)

1. Receive request via `privacy@…` (contact defined in the privacy notice).
2. Verify the requester's identity proportionately (see PRIVACY_NOTICE.md § rights).
3. Assess exceptions: art. 17(3) allows retention where necessary for the public-interest dataset purpose or legal obligations; a minimal, clearly justified retention (e.g. record provenance) may be kept — documented in the correction log.
4. Execute deletion: record, evidence, linked metadata; note that backups rotate within 30 days (R10).
5. Respond within 1 month (art. 12(3)); extendable by 2 months with notice; state the reason for any refusal and the right to complain to the supervisory authority.

**Definition of "deletion".** "Deletion" means irreversible deletion from the database and, where technically feasible, from backups; otherwise the data is excluded from all future processing and exports. The erasure response states which of the two applies.

**Legal hold.** Any pending litigation, complaint, or supervisory-authority inquiry suspends the relevant deletions until the matter is closed. The hold, its scope and its end date are recorded in the audit log (R4/R5).

## 3. Operational enforcement

- Retention rules R1/R2/R3 need automated enforcement: a scheduled job (Cloudflare D1 cron / Workers cron trigger) that flags `pending` > 90 days and `rejected` > 30 days for deletion, and pushes stale `verified` records to `needs_review`. **Follow-up (implementation, assignee: ada):** `db/retention.ts` + cron binding + tests.
- Audit log entries (R4/R5/R9) are archived, not hard-deleted, until the 2-year mark.
- The DPO reviews this schedule annually and on any material change of purpose, provider, or jurisdiction.

## 4. Legal rationale

- Storage limitation (art. 5(1)(e)): every category has an explicit, justified retention and a deletion trigger; nothing is kept "just in case".
- Right to erasure (art. 17): the schedule implements deletion without undue delay and documents exceptions.
- Accountability (art. 5(2)): retention decisions are recorded in ADR 0004 and this schedule.
- Italian Codice Privacy (D.Lgs. 196/2003): no additional national retention mandates apply to this dataset; if official-source records are republished, national transparency rules are checked per record (`source: official`).
