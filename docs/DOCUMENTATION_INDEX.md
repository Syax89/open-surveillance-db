# Documentation index

Complete inventory of the project documentation. Every document is in
**English**; the user-facing web copy (i18n bundles in `app/lib/i18n/`
and `app/lib/legal/`) remains bilingual EN/IT by design (ADR 0007) and is
**not** listed here.

Status legend: **current** (reflects the implemented state) · **in force**
(legal/operational deliverable) · **binding** (normative design contract) ·
**draft** (design/working note) · **historical** (superseded, kept as
record).

## Root files

| File | Purpose | Status | Language |
| --- | --- | --- | --- |
| [README.md](../README.md) | Project overview: mission, features, quick start, structure, documentation map, owner and contact | current | EN |
| [CHANGELOG.md](../CHANGELOG.md) | Release history (Keep a Changelog format) | current | EN |
| [GOVERNANCE.md](../GOVERNANCE.md) | Governance: roles, named owners (Simone Rondina), decision making, ADR log | current | EN |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution workflow, PR/review rules, design-compliance gate | current | EN |
| [SECURITY.md](../SECURITY.md) | Security policy: scope, private reporting route, PGP key, response commitment | current | EN |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community code of conduct, reporting and enforcement | current | EN |
| [LICENSE](../LICENSE) | Software licence: AGPL-3.0-or-later, copyright Simone Rondina | in force | EN |

## docs/ — top level

| File | Purpose | Status | Language |
| --- | --- | --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture and security boundaries (server runtime, public-data boundary, moderation gate) | current | EN |
| [DATA_MODEL.md](DATA_MODEL.md) | Data model: tables, status lifecycle (ADR 0021), community actions, API contracts | current | EN |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | Every public field and contract, end to end | current | EN |
| [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md) | Design system: tokens, typography, layout, components, states, Dos & Don'ts | binding | EN |
| [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md) | Local setup, migrations, fixtures, i18n add-a-language runbook | current | EN |
| [LOCAL_PLAYBOOK.md](LOCAL_PLAYBOOK.md) | End-to-end local workflow with fictional data and cautious reset policy | current | EN |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment: production build, container, Cloudflare Workers, LXC test host | current | EN |
| [OPERATIONS.md](OPERATIONS.md) | Operations manual: env matrix, monitoring, backup/restore drills, rollback | current | EN |
| [OSM_INTEGRATION.md](OSM_INTEGRATION.md) | OSM tile proxy and geocoder: usage policy, caching, attribution, rate limits | current | EN |
| [MODERATION.md](MODERATION.md) | Moderation: community-driven model (ADR 0021), residual legal-emergency powers, photo-upload removal | current | EN |
| [PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md) | Privacy and safety rules, data-subject rights, contributor accounts | current | EN |
| [TERMS_OF_USE.md](TERMS_OF_USE.md) | Terms of use (canonical versioned document) | in force | EN |
| [ACCESSIBILITY_STATEMENT.md](ACCESSIBILITY_STATEMENT.md) | WCAG 2.2 AA conformance statement, reporting channels, review schedule | in force | EN |
| [OPEN_SOURCE.md](OPEN_SOURCE.md) | Open-source and open-data licensing (AGPL, ODbL, CC BY-SA docs) | current | EN |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Release preparation checklist | current | EN |
| [roadmap.md](roadmap.md) | Consolidated development plan, current state, direction, next steps | current | EN |
| [SITEMAP.md](SITEMAP.md) | Routes and information architecture, per-route specs and contracts | current | EN |

## docs/legal/ — legal deliverables

| File | Purpose | Status | Language |
| --- | --- | --- | --- |
| [README.md](legal/README.md) | Index of the legal folder, status summary, controller identity | current | EN |
| [PRIVACY_NOTICE.md](legal/PRIVACY_NOTICE.md) | Privacy notice (art. 13/14 GDPR): purposes, bases, rights, contact, response times | in force | EN |
| [LAWFUL_BASIS.md](legal/LAWFUL_BASIS.md) | Lawful basis analysis: art. 6(1)(f) + LIA, 6(1)(e) official sources, IT jurisdiction | in force | EN |
| [RETENTION_SCHEDULE.md](legal/RETENTION_SCHEDULE.md) | Retention values per data category (community model, R1–R14), deletion definition | in force | EN |
| [PROCESSOR_REGISTER.md](legal/PROCESSOR_REGISTER.md) | Processor register: Cloudflare, OIDC providers (dormant), OSM; onboarding rule | in force | EN |
| [BREACH_PROCEDURE.md](legal/BREACH_PROCEDURE.md) | Personal-data breach procedure (arts. 33–34): roles, triage, 72-h notification, register | in force | EN |
| [MODERATION_SLA.md](legal/MODERATION_SLA.md) | Moderation service levels: emergency hide, response targets, transparency report | in force | EN |
| [DPO_EXCLUSION.md](legal/DPO_EXCLUSION.md) | GDPR art. 37 assessment: no DPO appointed, accountability, review triggers | in force | EN |
| [US-legal-matrix.md](legal/US-legal-matrix.md) | Working note: legal basis per US state dataset (import licence gate) | in force | EN |
| [LEGAL_DELIVERABLES_INDEX.md](legal/LEGAL_DELIVERABLES_INDEX.md) | Index mapping the legal deliverables to policy requirements and statuses | in force | EN |

## docs/decisions/ — architecture decision records

| File | Decision | Status | Language |
| --- | --- | --- | --- |
| [README.md](decisions/README.md) | ADR log: index, process, conventions | current | EN |
| [_template.md](decisions/_template.md) | ADR template | current | EN |
| [0001](decisions/0001-public-data-boundary.md) | Separate reviewed public data from submissions | accepted (prototype) | EN |
| [0002](decisions/0002-legal-pre-launch-deliverables.md) | Legal pre-launch deliverables | accepted (in force) | EN |
| [0003](decisions/0003-moderation-access-control.md) | Edge-level moderation access control | accepted | EN |
| [0004](decisions/0004-retention-and-review-cycle.md) | Retention schedule and review cycle | proposed | EN |
| [0005](decisions/0005-processors-and-data-residency.md) | Processors and data residency | proposed | EN |
| [0006](decisions/0006-non-sensitive-usability-feedback-route.md) | Non-sensitive usability-feedback route | proposed | EN |
| [0007](decisions/0007-i18n-externalisation-and-pilot-language.md) | i18n externalisation and pilot language | accepted | EN |
| [0008](decisions/0008-data-licence-precision-retention-contact.md) | Data licence, precision, retention, privacy contact | accepted (CEO decision) | EN |
| [0009](decisions/0009-reviewer-roles-moderation-queue.md) | Reviewer roles, moderation queue, reasons, audit | accepted | EN |
| [0010](decisions/0010-pilot-jurisdiction-languages-eligibility.md) | Pilot jurisdiction, languages, eligible infrastructure | accepted (CEO decision) | EN |
| [0011](decisions/0011-governance-owners-hosting-domain.md) | Named owners, pilot hosting, future domain | accepted (CEO decision) | EN |
| [0012](decisions/0012-public-repo-security-disclosure-and-hosting.md) | Public repo, private reporting route, hosting | accepted | EN |
| [0013](decisions/0013-contributor-accounts-and-sessions.md) | Contributor accounts and sessions | accepted | EN |
| [0014](decisions/0014-auth-roles-appeals.md) | Coarse auth roles, route-level authorization, appeals | accepted | EN |
| [0015](decisions/0015-locale-persistence-cookie-ssr.md) | Locale persistence: cookie + SSR, deep-link route | accepted | EN |
| [0016](decisions/0016-account-lockout-after-failed-logins.md) | Per-email account lockout | accepted | EN |
| [0017](decisions/0017-no-dpo-appointed-art37.md) | No DPO appointed (art. 37 exclusion) | accepted (legal recommendation) | EN |
| [0018](decisions/0018-community-verifications-trust-levels-editing.md) | Community verifications, trust levels, editing | accepted | EN |
| [0019](decisions/0019-pre-submit-duplicate-confirmation-gate.md) | Pre-submit duplicate confirmation gate | accepted | EN |
| [0020](decisions/0020-multi-method-authentication.md) | Multi-method authentication (password, passkeys, OIDC) | accepted | EN |
| [0021](decisions/0021-community-driven-pivot.md) | Community-driven pivot: immediate publication, community actions | accepted (CEO decision) | EN |

## docs/data-sources/ — public sources and import pipeline

| File | Purpose | Status | Language |
| --- | --- | --- | --- |
| [README.md](data-sources/README.md) | Workstream index: source registry, licence matrix pointer, import constraints | current | EN |
| [censimento-fonti.md](data-sources/censimento-fonti.md) | Census and ranking of 26 candidate sources with per-source verdicts | current | EN |
| [licenze-compatibilita.md](data-sources/licenze-compatibilita.md) | Licence compatibility matrix → ODbL import, attribution patterns | draft (for review) | EN |
| [normalizzazione-pipeline.md](data-sources/normalizzazione-pipeline.md) | Normalisation and import pipeline design (blueprint for implementation) | draft | EN |
| [keep-fonti-fresh.md](data-sources/keep-fonti-fresh.md) | Runbook to keep `/fonti` aligned with imports (commit convention, verification, recovery) | current | EN |
| [imports/](data-sources/imports/) | One descriptor JSON per source (slug, source, licence, attribution, adapter) | current | data |

## docs/design/

| File | Purpose | Status | Language |
| --- | --- | --- | --- |
| [README.md](design/README.md) | Current map/popup/hero patterns and performance contracts, verified on the code | current | EN |

## Developer docs outside docs/

| File | Purpose | Status | Language |
| --- | --- | --- | --- |
| [scripts/import/README.md](../scripts/import/README.md) | Import pipeline Phase A infrastructure: layout, adapter contract, semantics, usage | current | EN |
| [scripts/import/adapters/README.md](../scripts/import/adapters/README.md) | Import adapters Phase B: per-source contract, current adapters, usage, tests | current | EN |
| [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md) | PR review template: summary, test plan, review checklist, design-compliance gate | current | EN |

## Owner and contact

Every document attributes ownership and contacts to the **project owner**:

- **Simone Rondina** (GitHub: [Syax89](https://github.com/Syax89)) — project
  owner, maintainer, sole merge authority, privacy/legal contact.
- **privacy@opensurveillancedb.org** — the single contact address for
  privacy, data-protection, security disclosure, corrections and any other
  concern (dedicated, monitored mailbox; response targets in
  [MODERATION_SLA.md](legal/MODERATION_SLA.md)).

## Language policy

- All repository documentation is written in **English**.
- The user-facing interface and web copy remain **bilingual EN/IT**
  (`app/lib/i18n/` bundles and `app/lib/legal/`), with structural parity
  enforced at compile time (ADR 0007). Those bundles are product features,
  not documentation, and are intentionally not translated.
- Source/dataset proper names (e.g. "Vidéoprotection", "càmeres",
  "Québec") and the frozen EN/IT terminology pairs in ADR 0021 are kept
  verbatim as citations.
