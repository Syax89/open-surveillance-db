# Pre-launch legal deliverables — index

- **Status:** all documents are **drafts** for pre-launch review; nothing here is a published commitment.
- **Owner:** Rosa (DPO / privacy)
- **Decisions applied (2026-07-31, CEO — recorded in ADR 0008, docs task t_0b3d47e2):** controller entity **Simone Rondina (syax89) / OpenSurveillanceDB (Italy)**; data licence **ODbL 1.0** (software stays as in the repository: AGPL-3.0-or-later in LICENSE + package.json — note: the CEO decision cited "MIT already present", which does not match the repository; confirmation requested, see task t_e4bfcfbc); publication precision **~4 decimal places (~10 m)** with exact detail private to moderators; retention **12 months with renewal**; correction/removal contact **`privacy@opensurveillancedb`** (mailbox to be created at launch) + private form.
- **Location:** canonical folder for pre-launch legal deliverables: `docs/legal/` (per ADR 0002).
- **Produced from:** review findings P1-P6, M1-M5 in [`REVIEW_POLICY_LEGALE_2026-07-31.md`](REVIEW_POLICY_LEGALE_2026-07-31.md) (committed to the repository with this index; task t_05d84417).

## Deliverables

| Document | Covers (findings) | Status | Owner |
|----------|-------------------|--------|-------|
| [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) | P1, M3 — retention values (90/30 days, **12-month renewal review cycle** — decided 2026-07-31, 2-year audit, evidence, backups, operational logs), legal hold, deletion definition | Draft | Rosa |
| [PRIVACY_NOTICE.md](PRIVACY_NOTICE.md) | P6, M4 — purposes, bases, rights (arts. 12-22), negative scope, contact, 1-month response, identity verification | Draft | Rosa |
| [LAWFUL_BASIS.md](LAWFUL_BASIS.md) | P3 — art. 6(1)(f) + LIA balancing test, 6(1)(e) for official sources, IT jurisdiction (D.Lgs. 196/2003) | Draft | Rosa |
| [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) | P5, M4 — Cloudflare (DPA v6.3 + SCC + EU residency + EU–US DPF), OpenAI auth (not a processor; never log emails), others | Draft | Rosa |
| [BREACH_PROCEDURE.md](BREACH_PROCEDURE.md) | P2 — arts. 33/34, roles, triage, 72-h notification, data-subject notification, register | Draft | Rosa |
| [MODERATION_SLA.md](MODERATION_SLA.md) | M1, M2, M3 — 24 h emergency hide, 48 h first response, 14-day decision, 30-day hide review, independent appeals | Draft | Rosa |
| [decisions/0004-retention-and-review-cycle.md](../decisions/0004-retention-and-review-cycle.md) | ADR — retention values + enforcement | Proposed | Rosa |
| [decisions/0005-processors-and-data-residency.md](../decisions/0005-processors-and-data-residency.md) | ADR — processor choice, SCC, EU residency, OpenAI role | Proposed | Rosa |
| [REVIEW_TERMS_CODE_COHERENCE_2026-08-01.md](REVIEW_TERMS_CODE_COHERENCE_2026-08-01.md) | STATUS gap #4 — final coherence check: TERMS_OF_USE v0.2 / PRIVACY_NOTICE v0.3 vs. implemented practices (auth, upload, retention, correction) | Delivered (PR) | Rosa |

## How they map to the policy documents

- PRIVACY_AND_SAFETY.md "User rights and accountability" (privacy notice, lawful-basis analysis, retention schedule, correction/removal path, data-access contact, processor register) → all satisfied by drafts above.
- MODERATION.md "Appeals and corrections" + "Moderator safeguards" → MODERATION_SLA.md.
- SECURITY.md "monitored private disclosure address and a response-time commitment" → BREACH_PROCEDURE.md § 2/5 (mailbox to be created at launch).

## Still open (other pre-launch items from the review, not in this task's scope)

- **Terms of use** — **delivered**: `../TERMS_OF_USE.md` v0.2 exists in the repository (PR #49, re-drafted by task t_49f0041f); final coherence review in this folder's REVIEW_TERMS_CODE_COHERENCE_2026-08-01.md (STATUS gap #4). Remaining: acceptance mechanics, jurisdiction wording, UI links — tracked in TERMS § 15.
- **Software licence confirmation** — the CEO decision note cites "MIT already present", but the repository carries **AGPL-3.0-or-later** (LICENSE, package.json — review finding O1, implemented in PR #8). Confirmation needed: keep AGPL or switch to MIT.
- **DCO / inbound licensing** (O3) — CONTRIBUTING.md update (docs task, marie).
- **ODbL notices in CSV/GeoJSON exports** (O2) — implementation (ada).
- **package.json name/license** (O1) — implementation (ada, with H1-H4 fixes).
- **Retention cron job** (ADR 0004) — implementation (ada).
- **Italian localization of the privacy notice** (art. 12(1)) — see PRIVACY_NOTICE.md open items.
- **SCC version at DPA execution** — see PROCESSOR_REGISTER.md open items.

## Related documents (not legal deliverables)

For discoverability only: the
[accessibility statement](../ACCESSIBILITY_STATEMENT.md) and
[ADR 0006 — non-sensitive usability-feedback route](../decisions/0006-non-sensitive-usability-feedback-route.md)
are product/UX deliverables owned by the product workstream, not part of the
pre-launch legal review.

## Consolidation note

This folder (`docs/legal/`) is the **single canonical location** for pre-launch legal deliverables. Earlier draft copies at the repository root (`docs/PRIVACY_NOTICE.md`, `docs/LAWFUL_BASIS.md`, `docs/PROCESSOR_REGISTER.md`, `docs/RETENTION_SCHEDULE.md`, `docs/BREACH_PROCEDURE.md`, `docs/MODERATION_SLA.md`, and this index) were removed as part of the legal-review consolidation (PR #8); the ADR 0002 and `README.md` in this folder are updated accordingly.
