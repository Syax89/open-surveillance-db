# Moderation service-level agreements (SLA)

- **Status:** draft for pre-launch review
- **Owner:** Rosa (DPO / privacy) with the moderation team
- **Implements:** ../MODERATION.md ("Appeals and corrections" + "Moderator safeguards"); review findings M1, M2, M3.
- **Alignment:** response times are compatible with GDPR art. 12(3) (1-month substantive response).

> **Disclaimer:** this document is product guidance / not legal advice. It is a draft for pre-launch review and requires external counsel review before launch.

---

## 1. Definitions

- **Emergency report:** a credible claim of imminent or ongoing harm — e.g. leaked private/sensitive data, dangerous operational detail (live stream, credentials, control interfaces), harassment, or a request that triggers the ../MODERATION.md exclusion rules in a way that makes immediate harm plausible.
- **Standard request:** correction, takedown, appeal, clarification, or information request that is not an emergency.
- **Reviewer:** a trained moderator (../MODERATION.md); for sensitive or disputed records, two-person review is required.

## 2. Targets

| # | Event | Target | Notes |
|---|-------|--------|-------|
| S1 | **Emergency: hide affected content** | **Within 24 h** of the report | The record/evidence is temporarily hidden while reviewed (../MODERATION.md); the reporter gets an acknowledgement in the same window |
| S2 | **First response to any request** (acknowledgement + next step) | **Within 48 h** | Continuous calendar clock from receipt (weekends and holidays included); applies to emergencies, corrections, takedowns, appeals, privacy requests |
| S3 | **Substantive response / decision** | **Within 14 days** | Decision, rationale, and next steps; comfortably inside the art. 12(3) 1-month cap |
| S4 | **Re-review of temporary hides** | **Within 30 days** | Decide: restore, modify, or remove; inform the requester |
| S5 | **Appeal decision** | **Within 14 days** of the appeal | Decided by a **different reviewer than the original decision** (independence, M2) |
| S6 | **Escalation to advisory circle** | Within 14 days of the appeal | For disputed or high-impact appeals (../GOVERNANCE.md) |

## 3. Emergency flow (S1)

1. Report received via the privacy/safety channel (`privacy@opensurveillancedb` — mailbox to be created at launch) or moderation queue.
2. On-duty reviewer hides the content immediately (even before full review — hide first, ask later).
3. Privacy contact notified; severity assessed per BREACH_PROCEDURE.md if personal data is involved.
4. Full review within 30 days (S4): restore, modify (minimise), or remove; requester informed.
5. Decision and reason recorded in the audit log.

## 4. Appeals (S5/S6)

- Any person affected by a moderation decision may appeal via the same channel, within 30 days of the decision (aligned with the rejected-record retention window, RETENTION_SCHEDULE.md R2).
- The appeal is assigned to a reviewer **who did not take the original decision**.
- The appeal decision is recorded with rationale; a second-level escalation to the advisory circle is available for disputed cases.
- Emergency hides are appealable even while hidden (decision to hide, not the final decision).

## 5. Audit log (M3)

Every decision records, at minimum:

- decision (approved / clarify / rejected / escalated / hidden / removed);
- reason code (controlled list: spam, personal-data, prohibited-content, dangerous-detail, duplicate, unverifiable, privacy/safety, obsolete, other);
- timestamp;
- reviewer **pseudonym** (never the raw email; M4);
- appeal status (none / pending / decided).

Retention: 2 years (RETENTION_SCHEDULE.md R5). The log is internal — never exposed through API, exports, or the public site. Public accountability happens through **aggregate transparency reports only** (counts by category/decision, no individual records).

## 6. Measurement and reporting

- The moderation queue tooling tracks: time-to-first-response, time-to-decision, hide duration, appeal turnaround.
- A quarterly transparency report (aggregate: volumes, decisions by reason code, median response times, appeal outcomes) is published by Marie per ../OPEN_SOURCE.md.
- Missed targets are reviewed in the next moderation meeting with corrective actions; persistent misses escalate to the advisory circle.

## 7. Exceptions

- SLA targets may be missed only when a legal/technical blocker is documented (e.g. mailbox outage) or when the privacy contact signs off a temporary pause (e.g. during a breach response).
- No SLA suspension without DPO approval.
