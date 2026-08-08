# ADR 0010: Pilot jurisdiction, working languages, and eligible infrastructure

- **Status:** accepted (CEO decision, 2026-07-31)
- **Date:** 2026-07-31
- **Author:** Rosa (DPO / privacy), recording the CEO decision
- **Decision owner:** CEO
- **Related ADRs:** 0001 (public data boundary), 0002 (legal pre-launch
  deliverables), 0004 (retention schedule), 0005 (processors and data residency)
- **Related docs:** README, `docs/PRIVACY_AND_SAFETY.md`,
  `docs/workstreams/DATA_TRUST.md`, `docs/roadmap.md` (Wave A items 1–2)

## Context

`docs/roadmap.md` (Wave A) requires, before any public alpha, two
decisions that define the pilot boundary:

1. select one pilot jurisdiction and working languages;
2. confirm which public infrastructure is eligible and which places/details are
   excluded.

Without them the Wave A gate — "there is no ambiguity about what data may enter
the pilot" — cannot be met. The CEO decided both on 2026-07-31, delegating full
authority on this matter to the project team.

## Decision

1. **Pilot jurisdiction: Italy, launching from Ferrara.** The public alpha
   opens only in the Comune di Ferrara as the launch area. The pilot operates
   in municipalities where the project is active; each additional Italian
   municipality requires a documented decision in this log before records from
   it are accepted.

2. **Working languages: Italian and English.** Both are already implemented in
   the interface, record pages, guide, and local moderation dashboard
   (device-local preference; the database and API remain language-neutral).
   Translation review and formal accessibility testing remain future work per
   the execution board.

3. **Eligible infrastructure.** The pilot documents **surveillance cameras
   visible from public space** — public-facing, visible infrastructure —
   consistent with README ("visible public surveillance infrastructure") and
   `docs/PRIVACY_AND_SAFETY.md` ("publish only public-facing, visible
   infrastructure after review").

4. **Excluded infrastructure and details** (never eligible, never published,
   matching the `out_of_scope` reason code in DATA_TRUST.md):
   - **private homes:** doorbell, inward-facing, or any camera monitoring
     private residential property;
   - **live feeds:** stream URLs, credentials, or anything enabling live
     viewing of a camera;
   - **sensitive operational details:** network details, maintenance
     information, access credentials, coverage cones, or mounting details that
     expose how a system operates;
   - **security weaknesses:** any information that could help circumvent,
     disable, or exploit a camera or the surrounding security posture.

5. **Legal coherence.** The Italian legal review confirms the pilot is coherent
   with the existing draft deliverables in `docs/legal/`: GDPR (EU) 2016/679 and
   the Italian Codice della privacy (D.Lgs. 196/2003, as amended by D.Lgs.
   101/2018). The published dataset describes infrastructure (a camera and its
   public location), generally not personal data; the operational pipeline that
   processes personal data is covered by the legitimate-interest assessment
   (art. 6(1)(f)) in `docs/legal/LAWFUL_BASIS.md`, the retention schedule
   (ADR 0004), and the processor register (ADR 0005). The project records
   camera-location metadata, not video footage, so the pilot's metadata-only
   scope stays within that assessment. Deliverable drafts remain DRAFT pending
   external counsel review before launch (ADR 0002).

## Consequences

- The pilot boundary is now unambiguous for Wave A items 1–2: verified records
  in the alpha are limited to eligible public-space surveillance cameras in the
  Comune di Ferrara launch area, published in Italian and English.
- Moderators must reject as `out_of_scope` any report of excluded
  infrastructure (private homes, live feeds, operational details, security
  weaknesses); the reason code already exists in DATA_TRUST.md.
- Expansion beyond Ferrara, or any relaxation of an exclusion, requires a new
  documented decision in this log.
- Wave A items 3–5 (final data licence, named owners, public organisation and
  private reporting route) remain open and are tracked on the execution board;
  partial legal drafts already exist under ADR 0002/0004/0005 and `docs/legal/`.
