# Architecture Decision Records

This directory records the project's material policy and architectural
decisions. Following [GOVERNANCE.md](../../GOVERNANCE.md) ("Maintainers seek
consensus and record material decisions in `docs/decisions/`") and
[CONTRIBUTING.md](../../CONTRIBUTING.md) ("Decisions should be recorded in
`docs/decisions/` with context, alternatives, and consequences"), every
significant choice is written down here so it does not get buried in code
reviews or lost in chat threads.

## Index

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-public-data-boundary.md) | Separate reviewed public data from submissions | accepted (prototype) | 2026-07-31 |
| [0002](0002-legal-pre-launch-deliverables.md) | Legal pre-launch deliverables (retention, notice, lawful basis, processors) | accepted (deliverables in force) | 2026-07-31 |
| [0003](0003-moderation-access-control.md) | Edge-level access control for the moderation interface | accepted | 2026-07-31 |
| [0004](0004-retention-and-review-cycle.md) | Retention schedule and review cycle | proposed | 2026-07-31 |
| [0005](0005-processors-and-data-residency.md) | Processors and data residency | proposed | 2026-07-31 |
| [0006](0006-non-sensitive-usability-feedback-route.md) | Non-sensitive usability-feedback route | proposed | 2026-07-31 |
| [0007](0007-i18n-externalisation-and-pilot-language.md) | i18n externalisation and pilot language | accepted | 2026-07-31 |
| [0008](0008-data-licence-precision-retention-contact.md) | Data licence, publication precision, retention, and privacy contact | accepted (CEO decision) | 2026-07-31 |
| [0009](0009-reviewer-roles-moderation-queue.md) | Reviewer roles, moderation queue, decision reasons, and audit events | accepted | 2026-07-31 |
| [0010](0010-pilot-jurisdiction-languages-eligibility.md) | Pilot jurisdiction, working languages, and eligible infrastructure | accepted (CEO decision) | 2026-07-31 |
| [0011](0011-governance-owners-hosting-domain.md) | Named governance owners, pilot hosting, and future domain | accepted (CEO decision) | 2026-07-31 |
| [0012](0012-public-repo-security-disclosure-and-hosting.md) | Public repository, private security/privacy reporting route, and hosting | accepted | 2026-07-31 |
| [0013](0013-contributor-accounts-and-sessions.md) | Contributor accounts and sessions | accepted | 2026-08-01 |
| [0014](0014-auth-roles-appeals.md) | Coarse auth roles, route-level authorization, and contributor appeals | accepted | 2026-08-01 |
| [0015](0015-locale-persistence-cookie-ssr.md) | Locale persistence — cookie + SSR, deep-link route | accepted | 2026-08-01 |
| [0016](0016-account-lockout-after-failed-logins.md) | Per-email account lockout after failed logins | accepted | 2026-08-01 |
| [0017](0017-no-dpo-appointed-art37.md) | No DPO appointed — documented exclusion under GDPR art. 37(1) | accepted (legal recommendation) | 2026-08-01 |
| [0018](0018-community-verifications-trust-levels-editing.md) | Community verifications, trust levels and contribution editing | accepted | 2026-08-01 |
| [0019](0019-pre-submit-duplicate-confirmation-gate.md) | Pre-submit duplicate confirmation gate | accepted | 2026-08-02 |
| [0020](0020-multi-method-authentication.md) | Multi-method authentication (email+password with verification, passkeys, OIDC) | accepted | 2026-08-02 |
| [0021](0021-community-driven-pivot.md) | Community-driven pivot — immediate publication, community actions, automatic state transitions | accepted (CEO decision) | 2026-08-04 |

Status values follow the headers in each ADR: `proposed` (draft, pending
review) and `accepted` (decision recorded; `CEO decision` marks decisions made
by the CEO and recorded by the project owner).

## Process

1. **Propose.** Open a discussion for any material design choice (see
   [CONTRIBUTING.md](../../CONTRIBUTING.md) — "Open a discussion for material
   design choices").
2. **Draft.** Copy [`_template.md`](_template.md) to the next free number,
   e.g. `0015-kebab-case-title.md`, and fill in Context, Decision,
   Consequences, and Alternatives.
3. **Review.** Open a PR with the ADR. Maintainers seek consensus
   ([GOVERNANCE.md](../../GOVERNANCE.md) § Decision making); privacy,
   security, and safety objections pause the decision until addressed.
4. **Merge.** The PR is merged (the project owner is the sole merge
   authority) and the numbered file lands in `docs/decisions/`. The ADR is
   now part of the project's recorded history.

## Conventions

- **Numbering.** Use the next free number. Never renumber existing ADRs —
  the collision in ADR 0003 is a historical exception, not a pattern.
- **Filename.** `NNNN-kebab-case-title.md`, matching the ADR title.
- **Amendments.** Add an `## Update (YYYY-MM-DD)` section to the existing
  file (see ADR 0013) or, when the change is broad, write a new ADR and
  reference it from the old one with the `Updates:` field (see ADR 0014).
- **Titles and statuses.** Keep the one-line title imperative and specific;
  set `Status` to `proposed` while the decision is under review and change it
  to `accepted` on merge.
