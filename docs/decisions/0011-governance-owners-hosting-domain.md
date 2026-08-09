# ADR 0011: Named governance owners, pilot hosting, and future domain

- **Status:** accepted (CEO decision, 2026-07-31)
- **Date:** 2026-07-31
- **Author:** Simone Rondina (project owner), recording the CEO decision
- **Decision owner:** CEO
- **Related ADRs:** 0005 (processors and data residency), 0010 (pilot
  boundary), 0008 (data licence, precision, retention, contact)
- **Related docs:** GOVERNANCE.md, `docs/roadmap.md` (Wave A item 4),
  `docs/DEPLOYMENT.md` (§ Local LXC deployment), `docs/OPERATIONS.md`,
  `docs/legal/PRIVACY_NOTICE.md`

## Context

Two Wave A requirements still lacked owners and an infrastructure decision:

1. **Named owners.** `docs/roadmap.md` requires that "each
   responsibility must have a named, reachable owner before it becomes a
   production dependency", and GOVERNANCE.md ("Before launch") requires naming
   initial maintainers and publishing moderation contacts before the project
   claims those structures exist. Until now the roles existed only as generic
   workstream leads.
2. **Hosting and domain.** The project has a dual footprint: the
   repo-documented Cloudflare Workers/D1 deployment (ADR 0005, a future
   precondition) and the always-on local test site on a LAN-only Proxmox
   container (http://<lan-ip>:3000, per
   `docs/DEPLOYMENT.md` § "Local LXC deployment (current)"). No canonical
   public domain is registered yet; OPS_OPEN.md requires an
   organisation-controlled, protected domain before public alpha.

The CEO decided all three points on 2026-07-31, delegating full authority on
this matter to the project team.

## Decision

1. **Named owners** (CEO nominations, 2026-07-31), each responsibility with
   one reachable owner:

   | Responsibility | Owner(s) |
   | --- | --- |
   | Maintainers (code, releases, infrastructure changes) | **Simone Rondina (Syax89)** |
   | Merge authority | **Simone Rondina (Syax89)** (sole merge authority) |
   | Operations (hosting, deployments, backups) | **Simone Rondina (Syax89)** |
   | Data steward (data model, data quality, retention) | **Simone Rondina (Syax89)** |
   | Security contact | **Simone Rondina (Syax89)** |
   | Moderation contact | **Simone Rondina (Syax89)** |

   One person holds several roles initially, which the execution board
   explicitly allows; each responsibility now has a named, reachable owner.
   The names are mirrored into GOVERNANCE.md and the execution board; this
   ADR is the authoritative decision record.

2. **Pilot hosting: the project's own Proxmox infrastructure, test
   container.** The always-on test site documented in
   `docs/DEPLOYMENT.md` becomes the pilot hosting target. The container stays
   LAN-only, unprivileged, `onboot=1`, with the documented
   systemd unit and update procedure. Data remains in the EU (Italy).
   The Cloudflare Workers/D1 deployment (ADR 0005) is **superseded as the
   pilot runtime** and returns to a future precondition; ADR 0005's processor
   register and PRIVACY_NOTICE § processor section are updated accordingly
   before the pilot hosts any real data.

3. **Future domain: `opensurveillancedb.org`.** Reserved as the canonical
   domain for the public launch. It is **pending acquisition, configuration,
   and announcement**; before it goes live it must be registered in the name of the
   project organisation or a documented stewardship entity, with registrar
   multi-factor authentication, automatic renewal on a monitored payment
   path, DNS change logging, and a fallback contact (repository, domain, and
   community operations). Until then the pilot
   remains reachable on the LXC LAN endpoint only.

## Consequences

- The Wave A gate now has a named owner for every responsibility; item 4 is
  decided (items 3 and 5 tracked on the execution board — item 3 in
  ADR 0008).
- Governance changes flow through GOVERNANCE.md; merge authority rests with
  the project owner; role changes require a new documented decision in this log.
- **Processor picture changes:** with the pilot self-hosted, Cloudflare is no
  longer the runtime processor; ADR 0005, `docs/legal/PROCESSOR_REGISTER.md`,
  and PRIVACY_NOTICE.md must be revised (DPO exclusion, privacy/legal) before launch. GitHub
  (source hosting) and OSMF (tiles) status is unchanged.
- Operations work moves to the LXC environment: the backup/restore drill,
  monitoring, and incident procedures in `docs/OPERATIONS.md` are exercised
  against the test container (ops owner: project owner), and `docs/DEPLOYMENT.md` keeps the LXC
  section as the current environment reference.
- `opensurveillancedb.org` acquisition, DNS/TLS, and the public-alpha
  checklist (OPS_OPEN.md) must be complete before the domain is announced or
  linked from the repository.
