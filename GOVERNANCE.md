# Governance

## Purpose

OpenSurveillanceDB is intended to be a community-governed public-interest project, not a commercial platform. Its governance must protect the mission, users, contributors, and data subjects.

## Proposed structure for public beta

- **Maintainers** review code, security fixes, releases, and infrastructure changes.
- **Moderators** review submissions against the published moderation policy and maintain an audit log of decisions.
- **Community contributors** propose changes, translations, local documentation, and non-sensitive reports.
- **Advisory circle** (privacy, digital-rights, accessibility, and local-community voices) reviews high-impact policy changes.

## Named owners

Initial owners were named by the CEO on 2026-07-31 as part of the Wave A pilot boundary work (execution board, item 4). These are the named, reachable owners for the pilot; where a responsibility is shared, every owner remains accountable.

| Role | Owner(s) |
| --- | --- |
| Maintainers | Simone (syax89) and Ada (CTO). Ada is the sole merge authority: every merge into `main` is performed by Ada. |
| Operations owner | Ken |
| Data stewards | Linus and Grace |
| Security contact | Ken — private reporting route in [SECURITY.md](SECURITY.md) |
| Moderation contact | Grace |
| Privacy / legal contact (data-protection contact) | Rosa (Legal & Privacy Officer) |

These are initial nominations for the pilot, not a claim that the full public governance structure already exists.

## Decision making

1. Proposals are discussed publicly where safe to do so.
2. Maintainers seek consensus and record material decisions in [`docs/decisions/`](docs/decisions/README.md) (ADR log with index and template).
3. Privacy, security, and safety objections pause a decision until they are addressed.
4. A change to mission, licensing, data publication, or governance needs a documented public proposal and a reasonable comment period.

## Decision log

Material decisions are recorded as Architecture Decision Records (ADRs) in
[`docs/decisions/`](docs/decisions/):

| ADR | Decision |
| --- | --- |
| [0001](docs/decisions/0001-public-data-boundary.md) | Separate reviewed public data from submissions |
| [0002](docs/decisions/0002-legal-pre-launch-deliverables.md) | Legal pre-launch deliverables (retention, notice, lawful basis, processors) |
| [0003](docs/decisions/0003-moderation-access-control.md) | Edge-level access control for the moderation interface |
| [0004](docs/decisions/0004-retention-and-review-cycle.md) | Retention schedule and review cycle |
| [0005](docs/decisions/0005-processors-and-data-residency.md) | Processors and data residency |
| [0006](docs/decisions/0006-non-sensitive-usability-feedback-route.md) | Non-sensitive usability-feedback route |
| [0007](docs/decisions/0007-i18n-externalisation-and-pilot-language.md) | i18n externalisation and pilot language |
| [0008](docs/decisions/0008-data-licence-precision-retention-contact.md) | Data licence, publication precision, retention, and privacy contact |
| [0009](docs/decisions/0009-reviewer-roles-moderation-queue.md) | Reviewer roles, moderation queue, decision reasons, and audit events |
| [0010](docs/decisions/0010-pilot-jurisdiction-languages-eligibility.md) | Pilot jurisdiction, working languages, and eligible infrastructure |
| [0011](docs/decisions/0011-governance-owners-hosting-domain.md) | Named governance owners, pilot hosting, and future domain |
| [0012](docs/decisions/0012-public-repo-security-disclosure-and-hosting.md) | Public repository, private security/privacy reporting route, and hosting |
| [0013](docs/decisions/0013-contributor-accounts-and-sessions.md) | Contributor accounts and sessions |
| [0014](docs/decisions/0014-auth-roles-appeals.md) | Coarse auth roles, route-level authorization, and contributor appeals |

## Before launch

Initial maintainers and the moderation contact are now named above (2026-07-31).
The launch prerequisites that earlier versions of this section listed as still
open have since been implemented:

- **Appeal process** — implemented by [ADR 0014](docs/decisions/0014-auth-roles-appeals.md):
  a contributor may contest a final moderation decision via `POST /api/appeals`,
  decided by a senior moderator or administrator who did not make the original
  decision; every appeal transition is recorded in the immutable audit log.
- **Monitored private disclosure address with a response-time commitment** —
  [SECURITY.md](SECURITY.md) provides the GitHub Private Vulnerability Reporting
  route (confidential advisory, visible only to maintainers) and a response-time
  commitment: first response within 48 h, substantive response within 14 days,
  emergency hide of affected content within 24 h. The same route is published on
  the public `/contatti` page; a machine-readable RFC 9116 `security.txt` is
  live at `public/.well-known/security.txt` (PR #79 merged).
- **Publication of governance and reporting contacts on a public surface** — the
  bilingual `/contatti` page publishes the named roles, the data controller, the
  correction e-mail, and the security advisory route.

Still open before launch: **conflict-of-interest rules** for maintainers and
moderators. This document is a starting proposal, not a claim that the full
public governance structure already exists.
