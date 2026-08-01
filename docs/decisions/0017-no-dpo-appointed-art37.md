# ADR 0017: No DPO appointed — documented exclusion under GDPR art. 37(1)

- **Status:** accepted (legal recommendation, 2026-08-01); CEO validation tracked
  on board task t_06c4dc33 — if the CEO opts for a voluntary DPO, this ADR and the
  affected documents are revised
- **Date:** 2026-08-01
- **Author:** Rosa (Legal & Privacy Officer / privacy contact), recording the
  GDPR art. 37 assessment
- **Decision owner:** CEO
- **Related ADRs:** 0008 (data licence, precision, retention, contact), 0011
  (named governance owners)
- **Related docs:** GOVERNANCE.md, `docs/legal/PRIVACY_NOTICE.md` (§ 1),
  `docs/legal/RETENTION_SCHEDULE.md` (§ 3), `docs/legal/PROCESSOR_REGISTER.md`
- **Source of gap:** legal audit task t_1de55bfb (gap 7) — documents referred to
  a "DPO" although no formal appointment existed anywhere in the repository.

## Context

The pre-launch legal audit found that `docs/legal/RETENTION_SCHEDULE.md` § 3
stated "The DPO reviews this schedule annually", and several other live
documents used "DPO" as an owner/approval title (`PROCESSOR_REGISTER.md`,
`MODERATION_SLA.md`, `BREACH_PROCEDURE.md`, document owner headers). No document
named a formally appointed data protection officer, and none of the governance
records (GOVERNANCE.md, ADR 0011) listed a privacy/legal owner at all.

GDPR art. 37(1) makes a DPO mandatory in three cases. None applies to this
project:

1. **Public authority or body (art. 37(1)(a)).** OpenSurveillanceDB is a
   non-commercial, community-governed civic project; the controller is a private
   individual (Simone Rondina / OpenSurveillanceDB — Italy, ADR 0008). It is
   not a public authority and does not exercise public powers. The fact that it
   republishes *some* records from official public sources (`source: official`,
   PRIVACY_NOTICE § 3) does not make it an authority itself.
2. **Regular and systematic monitoring of data subjects on a large scale
   (art. 37(1)(b)).** The core activity documents **infrastructure** — visible
   cameras, their kind, and their public location. As LAWFUL_BASIS.md § 1
   establishes, the published dataset is in large part *not* personal data at
   all (art. 4(1): data about inanimate objects). The personal data actually
   processed is incidental and small-scale: optional pseudonymous contributor
   accounts (ADR 0013), pseudonymous moderation metadata, and correspondence
   with the privacy contact. The project does not track, profile, or observe
   data subjects. Applying the EDPB "large scale" factors (Guidelines on DPOs,
   WP 243 rev.01 — number of data subjects, volume of data, duration,
   geographical extent), none is met at pilot or foreseeable public scale.
3. **Large-scale processing of special categories (art. 9) or criminal data
   (art. 10) (art. 37(1)(c)).** Special categories are **not** intentionally
   collected (PRIVACY_NOTICE § 3); evidence that incidentally captures people,
   plates, or interiors is redacted or deleted on the spot (MODERATION.md,
   RETENTION_SCHEDULE.md R6). No criminal-conviction data is processed.

## Decision

**No DPO is appointed.** The GDPR art. 37(1) obligation does not apply for the
reasons above; the decision is recorded here for accountability (art. 5(2),
art. 24 GDPR).

- The privacy/legal function continues to operate as the **privacy contact /
  data-protection contact**: Rosa (Legal & Privacy Officer), reachable at
  `privacy@opensurveillancedb` (PRIVACY_NOTICE § 1), with the rights,
  retention, breach, and processor procedures documented in `docs/legal/`.
- All "DPO" references in **live** documents are replaced with the functional
  role ("privacy/legal owner", "privacy contact", or "Legal & Privacy
  Officer"). Archived records (ADRs 0004/0005/0008/0010/0011 and the review
  reports of 2026-07-31 / 2026-08-01) are historical and are left unchanged.
- GOVERNANCE.md now names a **Privacy / legal contact (data-protection
  contact): Rosa** — closing the governance gap that the audit flagged in
  parallel.
- A **voluntary DPO (art. 37(4))** was considered and deliberately **not**
  taken: it would add a formally published role with supervisory-authority
  contact obligations that is disproportionate for a pre-launch civic project
  with no production data. It is **revisited at the public-launch gate** if the
  processing profile changes materially (e.g. large-scale account growth or
  special-category processing).

## Consequences

- `docs/legal/RETENTION_SCHEDULE.md` § 3, `PROCESSOR_REGISTER.md`,
  `MODERATION_SLA.md`, `BREACH_PROCEDURE.md`, `LAWFUL_BASIS.md`,
  `LEGAL_DELIVERABLES_INDEX.md`, `docs/legal/README.md`, `docs/TERMS_OF_USE.md`
  and `docs/ACCESSIBILITY_STATEMENT.md` no longer reference a "DPO"; the
  functional role is used instead.
- `PRIVACY_NOTICE.md` § 1 discloses "no DPO appointed" with a pointer to this
  ADR — satisfying the art. 13(1)(b) "where applicable" disclosure without
  inventing a role.
- If the CEO validates the alternative (voluntary DPO), this ADR is revised to
  "accepted (voluntary appointment)", the DPO is named and published, and the
  affected documents are updated accordingly before merge.
