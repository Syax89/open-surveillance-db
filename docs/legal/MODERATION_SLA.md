# Moderation service-level agreements (SLA)

- **Status:** draft for pre-launch review
- **Owner:** Rosa (Legal & Privacy Officer / privacy contact) with the moderation team
- **Implements:** ../MODERATION.md (community-driven model — photo redaction gate + legal-emergency admin actions + private corrections); review findings M1, M2, M3.
- **Alignment:** response times are compatible with GDPR art. 12(3) (1-month substantive response).
- **Community model (ADR 0021, 2026-08-05):** the normal flow has no human moderation — the SLAs below cover the **residual human surfaces only**: the photo redaction gate, legal-emergency admin actions, and the private correction path. The retired-flow SLAs (old S5/S6) are **removed**: the contrary-consensus mechanism of ADR 0021 § 6 replaces them.

> **Disclaimer:** this document is product guidance / not legal advice. It is a draft for pre-launch review and requires external counsel review before launch.

---

## 1. Definitions

- **Emergency:** a credible claim of imminent or ongoing harm — e.g. leaked private/sensitive data, dangerous operational detail (live stream, credentials, control interfaces), harassment, or a situation where the law requires immediate action (legal-emergency hide/remove, ADR 0021 § 8).
- **Standard request:** correction, takedown, clarification, or information request that is not an emergency.
- **Reviewer:** a trained moderator (../MODERATION.md) — acts on the photo redaction gate; the legal-emergency power is reserved to the administrator (ADR 0021 § 8).

## 2. Targets

| # | Event | Target | Notes |
|---|-------|--------|-------|
| S1 | **Legal emergency: hide/remove affected record** | **Within 24 h** of the report | Admin-only, mandatory reason code, single-person by design, reviewed retrospectively (ADR 0021 § 8; ../MODERATION.md); the requester gets an acknowledgement in the same window |
| S2 | **First response to any request** (acknowledgement + next step) | **Within 48 h** | Continuous calendar clock from receipt (weekends and holidays included); applies to emergencies, corrections, takedowns and privacy requests; declared inline in TERMS § 1 and PRIVACY_NOTICE § 9 |
| S3 | **Substantive response / decision** | **Within 14 days** | Decision, rationale, and next steps; comfortably inside the art. 12(3) 1-month cap; declared inline in TERMS § 6.2 |
| S4 | **Retrospective review of legal-emergency actions** | **Within 30 days** | Decide: keep, amend, or (for content the law allows) instruct removal; the record itself is restored only by community consensus (ADR 0021 § 6); the requester is informed |

*Removed from the retired flow: decision-review (old S5) and advisory-circle escalation (old S6) — replaced by contrary consensus (ADR 0021 § 6/§ 7); photo decisions are final at the photo level (../MODERATION.md).*

## 3. Legal-emergency flow (S1)

1. Report received via the privacy/safety channel (`privacy@opensurveillancedb.org` — dedicated, monitored mailbox) or the photo moderation surface.
2. On-duty administrator hides/removes the record immediately (hide first, ask later — even before full review).
3. Privacy contact notified; severity assessed per BREACH_PROCEDURE.md if personal data is involved.
4. Retrospective review within 30 days (S4): keep, amend, or instruct removal; the record is restored only by contrary community consensus (ADR 0021 § 6); requester informed.
5. Decision and reason recorded in the internal audit log and in the public lifecycle history (no attribution, reason `admin-legal`).

## 4. Corrections (S2/S3) and reversal

- **Private corrections:** any person may request a correction or removal via the private correction form or `privacy@opensurveillancedb.org` (TERMS § 6.2). Requests are private, reviewed by a person, and **never change the map automatically**. First response within 48 h (S2), substantive decision within 14 days (S3).
- **Reversal of community transitions:** a withdrawn record (`hidden`/`removed`) is restored only by **contrary consensus** — `confirm` actions meeting the ADR 0021 § 4.4 thresholds (hidden → active: sum ≥ 5, ≥ 3 distinct, privacy cooldown elapsed; removed → active: sum ≥ 3, ≥ 2 distinct). No human decision overrides this; the legal-emergency action is itself reversible only through consensus (ADR 0021 § 6.2).
- **Photo decisions:** final at the photo level; a rejected photo can be re-uploaded (../MODERATION.md).

## 5. Audit log (M3)

Every residual-moderation decision records, at minimum:

- decision (photo-approved / photo-rejected / hidden-admin-legal / removed-admin-legal);
- reason code (controlled list: spam, personal-data, prohibited-content, dangerous-detail, duplicate, unverifiable, privacy/safety, legal-requirement, obsolete, other);
- timestamp;
- reviewer **pseudonym** (never the raw email; M4).

Retention: 2 years (RETENTION_SCHEDULE.md R5). The log is internal — never exposed through API, exports, or the public site. Public accountability happens through **aggregate transparency reports only** (counts by category/decision, no individual records) and through the per-record public lifecycle history (aggregates only, ADR 0021 § 7).

## 6. Measurement and reporting

- The tooling tracks: time-to-first-response and time-to-decision for corrections, hide/remove latency and retrospective-review turnaround for legal emergencies, photo gate throughput.
- A quarterly transparency report (aggregate: volumes, decisions by reason code, median response times, review turnaround) is published by Marie per ../OPEN_SOURCE.md.
- Missed targets are reviewed in the next moderation meeting with corrective actions; persistent misses escalate to the advisory circle (../GOVERNANCE.md).

## 7. Exceptions

- SLA targets may be missed only when a legal/technical blocker is documented (e.g. mailbox outage) or when the privacy contact signs off a temporary pause (e.g. during a breach response).
- No SLA suspension without the privacy/legal owner's approval.
