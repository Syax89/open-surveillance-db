# DPO exclusion — GDPR art. 37(4) assessment and documented decision

- **Status:** in force — personal open-source project, 2026-08-08; decision recorded (2026-08-01) — no DPO appointed, exclusion documented
- **Version:** 1.0 (2026-08-01)
- **Owner:** Rosa (Legal & Privacy Officer / privacy contact)
- **Decision owner:** CEO (validation recorded on board task t_06c4dc33)
- **Legal basis assessed:** GDPR art. 37(1)(a)/(b)/(c) and art. 37(4)
- **Cross-references:** ADR 0017 (`docs/decisions/0017-no-dpo-appointed-art37.md`), PRIVACY_NOTICE.md § 1, GOVERNANCE.md (privacy / legal contact), LAWFUL_BASIS.md § 1, PROCESSOR_REGISTER.md, RETENTION_SCHEDULE.md, BREACH_PROCEDURE.md

> **Disclaimer:** this document is product guidance / not legal advice. The document is in force for the pilot jurisdiction (Italy); per-jurisdiction review remains the documented precondition for an EU-wide launch.

---

## 1. Context (audit gap 7)

The pre-launch legal audit (task t_1de55bfb, gap 7) found that several live
documents referenced a **"DPO"** as owner or approval title
(`RETENTION_SCHEDULE.md` § 3, `PROCESSOR_REGISTER.md`, `MODERATION_SLA.md`,
`BREACH_PROCEDURE.md`, document owner headers) although **no data protection
officer was ever formally appointed** anywhere in the repository, and the
governance records did not list a privacy/legal owner at all (closed in
parallel by ADR 0011 / GOVERNANCE.md).

This document records the full GDPR art. 37 assessment that the ADR 0017
decision summarises: why the mandatory-DPO obligation does not apply
(art. 37(1)(a)/(b)/(c)), why a **voluntary DPO under art. 37(4)** was
considered and deliberately not appointed at this stage, and how
accountability (arts. 5(2), 24) is nonetheless discharged. All live "DPO"
references have been replaced with the functional role ("privacy/legal
owner", "privacy contact", "Legal & Privacy Officer"); archived records
(ADRs 0004/0005/0008/0010/0011, review reports of 2026-07-31 / 2026-08-01)
are historical and left unchanged.

## 2. Mandatory appointment — GDPR art. 37(1) not applicable

Art. 37(1) makes a DPO mandatory in three cases. **None applies** to
OpenSurveillanceDB:

**(a) Public authority or body.** The controller is a private individual
(Simone Rondina / OpenSurveillanceDB — Italy, ADR 0008) operating a
non-commercial, community-governed civic project. It is not a public
authority and does not exercise public powers; republishing *some* records
from official public sources (`source: official`, PRIVACY_NOTICE § 3) does
not make the project an authority itself.

**(b) Regular and systematic monitoring of data subjects on a large scale.**
The core activity documents **infrastructure** — visible cameras, their
kind, and their public location. As LAWFUL_BASIS.md § 1 establishes, the
published dataset is in large part *not* personal data at all (art. 4(1):
data about inanimate objects). The personal data actually processed is
incidental and small-scale: optional pseudonymous contributor accounts
(ADR 0013), pseudonymous moderation metadata, and correspondence with the
privacy contact. The project does not track, profile, or observe data
subjects — there is no systematic observation of individuals at any scale,
large or small, and no behavioural analytics (PRIVACY_NOTICE § 4 negative
scope).

**(c) Large-scale processing of special categories (art. 9) or criminal
conviction data (art. 10).** Special categories are **not** intentionally
collected (PRIVACY_NOTICE § 3); evidence that incidentally captures people,
plates, or private interiors is redacted or deleted on the spot
(MODERATION.md, RETENTION_SCHEDULE.md R6). No criminal-conviction data is
processed.

### "Large scale" factors (EDPB Guidelines on DPOs, WP 243 rev.01)

Where art. 37(1)(b)/(c) is assessed, the EDPB guidance lists four factors
for "large scale": number of data subjects; volume of data; duration of the
processing; geographical extent. For OpenSurveillanceDB:

| Factor (WP 243 rev.01) | Assessment at pilot and foreseeable public scale |
|---|---|
| Number of data subjects | Low — voluntary, pseudonymous contributors; no tracking of third parties. Published records concern infrastructure, not persons |
| Volume of data | Low — structured records of camera locations; photo evidence private until moderation and retained max 12 months (R6) |
| Duration | Bounded — retention schedule with fixed terms (R5–R7); no indefinite accumulation |
| Geographical extent | Single pilot deployment, community-governed, non-commercial; no EU-wide or cross-border operation |

None of the factors is satisfied; the processing cannot be described as
large-scale under WP 243 rev.01.

## 3. Voluntary DPO — GDPR art. 37(4) assessment

Art. 37(4) permits (does not require) a controller to appoint a DPO even
when art. 37(1) does not mandate one. **This option was explicitly
considered and deliberately declined for the pre-launch phase.**

Rationale:

- **Disproportionate for the current profile.** A formally published DPO
  carries statutory duties (art. 38(1): direct reporting to the highest
  management level; art. 38(6): no dismissal/penalty for performing the
  role; availability as contact point for data subjects and the
  supervisory authority under art. 38(4)) and a published identity that
  must be communicated to the supervisory authority. For an organisation
  that is a single individual plus AI agents, with **no production data**
  before launch, the formal apparatus adds process without adding
  protection.
- **The function exists anyway.** The art. 37(4) outcome — an independent,
  competent person overseeing data-protection compliance — is already
  delivered through the functional privacy/legal role (see § 4). The
  substantive protection is the same; only the formal designation and the
  supervisory-authority notification differ.
- **Reversible and re-examined.** Non-appointment is not a permanent
  position: it is reviewed at the public-launch gate against explicit
  triggers (§ 5), and any of them flips the decision to a voluntary
  appointment before it becomes necessary.

## 4. Residual accountability — arts. 5(2) and 24 GDPR

Not appointing a DPO does not exempt the controller from accountability.
The project discharges arts. 5(2) and 24 as follows:

- **Functional role:** the privacy/legal function operates as the
  **privacy contact / data-protection contact**: Rosa (Legal & Privacy
  Officer), named in GOVERNANCE.md and reachable at
  `privacy@opensurveillancedb.org` (PRIVACY_NOTICE § 1; dedicated, monitored
  mailbox).
- **Documented procedures:** rights of data subjects (arts. 12–22,
  PRIVACY_NOTICE § 8), retention and deletion (PRIVACY_NOTICE § 7,
  RETENTION_SCHEDULE.md), processors and transfers (PROCESSOR_REGISTER.md), breach notification
  (BREACH_PROCEDURE.md, arts. 33–34), lawful basis and balancing
  (LAWFUL_BASIS.md), moderation and redaction (MODERATION.md,
  MODERATION_SLA.md).
- **Decision record:** this assessment, ADR 0017, and the CEO validation
  (task t_06c4dc33) are the accountability record for the art. 37 decision
  itself — the reason it is documented rather than omitted.
- **Art. 13(1)(b) disclosure:** PRIVACY_NOTICE § 1 discloses "no DPO
  appointed — the obligation does not apply" with a pointer to ADR 0017,
  satisfying the "where applicable" disclosure without inventing a role.

## 5. Review triggers — when this decision is revisited

The exclusion is reviewed at the **public-launch gate** and whenever any of
the following occurs (whichever is earlier). Any trigger met results in a
fresh art. 37 assessment and, if confirmed, a voluntary DPO appointment
under art. 37(4) before the change takes effect:

1. **Scale:** sustained growth of contributor accounts or data-subject
   volume that meets any WP 243 rev.01 "large scale" factor (e.g. a
   significant, non-incidental number of registered users).
2. **New processing purposes:** introduction of tracking, profiling, or
   systematic observation of data subjects (e.g. analytics, behavioural
   features) — even below large scale, this changes the risk profile and
   the art. 37(1)(b) assessment.
3. **Special categories / criminal data (art. 9 / art. 10):** any intended
   collection of special-category or criminal-conviction data, regardless of
   volume (art. 37(1)(c) is not subject to a scale threshold).
4. **Controller status change:** the project (or its operator) becomes a
   public authority or body, or exercises public powers (art. 37(1)(a)).
5. **Formal requirement:** a supervisory authority or a processor
   arrangement requires a named DPO or a different data-protection
   contact.

Trigger owners: Rosa (privacy/legal) proposes the reassessment; the CEO
decides; Ada (CTO) is consulted where processing architecture changes.

## 6. Conclusion

The GDPR art. 37(1) obligation does not apply (no public authority; no
large-scale systematic monitoring; no large-scale special-category or
criminal-data processing — WP 243 rev.01 factors not met). A voluntary DPO
under art. 37(4) was considered and is not appointed pre-launch as it is
disproportionate for the current processing profile; the decision is
revisited at the public-launch gate against the explicit triggers in § 5.
Accountability under arts. 5(2) and 24 is discharged through the functional
privacy/legal role, the documented procedures in `docs/legal/`, and this
decision record.
