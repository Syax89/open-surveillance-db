# ADR 0008: Public repository, private security/privacy reporting route, and hosting

- **Status:** accepted
- **Date:** 2026-07-31
- **Author:** Ken (DevSecOps) on decision of the CEO (Simone)
- **Updates:** ADR 0002-legal-pre-launch-deliverables (contact address and
  disclosure commitments are now concrete, not placeholder).

## Context

Wave A of the development plan requires: (1) a public repository — the
repository `Syax89/open-surveillance-db` is already public with CI; (2) a
private route for security/privacy reports distinct from the public
correction form; (3) a hosting decision for the near term.

The previous SECURITY.md stated that "before public launch, the project must
publish a monitored private disclosure address and a response-time
commitment". This ADR records the decision that makes those concrete.

## Decision

1. **Public repository (confirmed).** `github.com/Syax89/open-surveillance-db`
   stays public, with CI (lint, type-check, tests, build, gitleaks, npm
   audit) as the merge gate. Nothing changes in repo visibility.

2. **Private reporting route: SECURITY.md + PGP.** SECURITY.md is the
   private security/privacy reporting route:
   - it publishes the project PGP public key (`Hermes Agent
     <hermes@simone.local>`, RSA 4096, fingerprint
     `993C 105F 654E F8AE 0FF5 50B9 423F F41B FF01 7DF5`, key id
     `423FF41BFF017DF5`) so reporters can encrypt sensitive payloads;
   - it points reporters to **GitHub Private Vulnerability Reporting**
     (confidential advisories, enabled on the repo) for vulnerability
     reports;
   - it states the disclosure policy and response-time commitment (48 h
     first response, 14 days substantive, 24 h emergency content hide —
     aligned with MODERATION_SLA.md);
   - the **correction / request-for-review form** in the app
     (`/#correction`, `app/api/corrections/route.ts`) remains the *public*
     route for record correction/removal and data-subject privacy requests.
   Security reports and privacy requests therefore travel on separate
   channels.

3. **Hosting: local staging now, Cloudflare later.**
   - Current environment: the LAN-only container **LXC 114 `osdb-test`**
     (`192.168.1.201:3000`) is the permanent staging environment (already
     documented in DEPLOYMENT.md).
   - Future production: **Cloudflare Workers + D1** remains the target;
     the domain **opensurveillancedb.org** will be registered when that
     migration starts. Domain registration is not blocking any current
     work.

## Consequences

- Reporters have a monitored, confidential channel (GitHub advisories) plus
  a PGP key for encrypting personal data or evidence — no raw sensitive
  payloads need to cross public channels.
- Public-facing privacy requests keep the existing correction form; the
  moderation queue stays the sink for both.
- The LAN test site remains non-production; no real reports may be loaded
  into it (unchanged from DEPLOYMENT.md).
- When the Workers+D1 migration starts, this ADR should be revisited to
  record the domain and the production contact address (currently
  placeholders in PRIVACY_NOTICE.md).
