# Operations, infrastructure, and open-source workstream

## Purpose and ownership

This workstream makes OpenSurveillanceDB safe, reproducible, affordable, and
accountable to operate as a public-interest service. It does not authorise a
public launch by itself: the privacy, moderation, data, and product gates in
the development plan remain mandatory.

Before public alpha, maintainers must name:

- an **operations owner** for deployments, availability, backups, and incidents;
- a **security contact** for private vulnerability reports and secret rotation;
- a **data steward** for public exports, retention, and restoration decisions;
- a **community contact** for governance, contributor onboarding, and public
  status updates.

One person may initially cover more than one role, but sensitive production
access must not depend permanently on a single unrecorded individual.

## Operating environments

| Environment | Purpose | Permitted data | Access and publication rules |
| --- | --- | --- | --- |
| Local development | Build and test on a contributor machine | Synthetic or clearly labelled demo data only | No real submissions, evidence, production secrets, or production database copies. |
| Preview / CI | Automated checks for a proposed change | Synthetic data only | Ephemeral where possible; never indexed or presented as the public service. |
| Staging | Exercise release and moderation workflows before production | Synthetic data; exceptionally, tightly controlled test data approved by the data steward | Separate database, storage, credentials, domain/subdomain, and analytics from production. Access limited to the team. |
| Production | Public website, reviewed data, and operational services | Reviewed public records plus private operational data required by policy | Least-privilege access, audited changes, backups, monitoring, and documented incident response. |

Production configuration must never be copied down into local or preview
environments. Environment names, public URLs, ownership, and responsible
contacts belong in an internal or access-controlled operations inventory; only
non-sensitive architecture should be published in the repository.

## Data, migrations, and recovery

The current application uses a D1-compatible database and Drizzle migrations.
The production process must treat a schema change as a data change, not merely
as an application deployment.

### Migration rules

1. Each schema change has a reviewed, committed migration and an explanation of
   its effect on public records, pending submissions, audit data, and retention.
2. Run migrations in CI against an empty database and a representative synthetic
   dataset before staging.
3. Apply and verify migrations in staging before production. Record the migration
   identifier, deployer, time, and any manual follow-up in the release note.
4. Prefer additive, reversible changes. For destructive changes, take a tested
   backup first, publish a maintenance plan, and obtain explicit maintainer
   approval.
5. Do not seed illustrative records in production. Demo content belongs only to
   local, preview, and staging environments.

### Backup and restore standard

- Back up production databases and private evidence storage on a documented
  schedule appropriate to the final host and the volume of changes.
- Encrypt backups and restrict them to the operations and data-steward roles.
- Retain backup copies according to a published operational retention schedule;
  deletion requests must be reflected in later backups within a stated period.
- Test restoration before public alpha and at least quarterly afterwards. The
  test must restore into an isolated environment, check record counts and
  publication boundaries, and destroy the test restore afterwards.
- Keep a short recovery runbook covering database restore, object-storage
  restore, service rollback, emergency record hiding, and contact escalation.

Recovery-point and recovery-time targets must be selected and published before
real data is accepted. A first public-alpha proposal is: no more than 24 hours
of approved-record loss and restoration of the public read service within one
business day. These are targets, not current guarantees.

## Map and OpenStreetMap tile strategy

The local prototype may use `tile.openstreetmap.org` for development and
demonstration with visible attribution. A public service must not assume that
the community tile service is an unlimited production CDN.

Before public alpha, choose and record one sustainable approach:

1. **Compliant hosted provider:** evaluate price, coverage, availability,
   privacy terms, cache policy, attribution requirements, and exit/export path.
2. **Self-hosted map stack:** budget for tile generation, storage, bandwidth,
   updates, monitoring, and an operations owner before committing.
3. **Hybrid strategy:** use a provider initially with documented rate, cost, and
   migration thresholds for moving to self-hosting.

For every option, retain visible OpenStreetMap attribution, respect the current
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/),
avoid bulk prefetching and offline scraping, and send an identifiable referrer
or user agent where the platform supports it. Cache configuration, provider
contract/terms, and a request-volume estimate must be reviewed before launch.

Project records remain a separate database. Do not automatically write
community reports to OpenStreetMap or represent project pins as OSM data.

## Observability and incident response

Monitoring must help maintainers answer whether the public service is working
without creating a hidden surveillance system of its visitors or contributors.

### Collect

- availability, latency, error rate, deployment version, database and storage
  failures, queue depth, and backup status;
- aggregate request and rate-limit events needed to identify abuse or outages;
- audit events for production deployments, role changes, publication decisions,
  emergency hides, exports, and destructive administrative actions.

### Do not collect by default

- full request bodies, camera-report contents, uploaded media, precise visitor
  behaviour, advertising identifiers, or persistent cross-site tracking;
- raw IP addresses beyond the minimum duration and scope required for security
  controls, unless a documented legal/security need is approved.

Set alerts for public endpoint failures, sustained elevated errors, failed
backups, abnormal submission volume, auth failures, storage scanning failures,
and anomalous export traffic. An incident runbook must define severity levels,
initial acknowledgement targets, containment steps, internal decision logging,
and when affected people or the public should be notified. Publish an aggregate
transparency summary after material incidents where doing so does not increase
harm.

## Security, access, and abuse controls

### Secrets and access

- Keep secrets only in the hosting provider's encrypted environment/secret
  store; never commit them, embed them in client bundles, or place them in
  screenshots, issue reports, or demo configuration.
- Maintain a secret inventory with owner, purpose, environment, rotation method,
  and last-rotation date. Rotate immediately on suspected exposure and at a
  scheduled interval.
- Use separate credentials and service accounts per environment. Give each role
  the narrowest access it needs, and remove access promptly when a role ends.
- Require strong multi-factor authentication for production administrators and
  prefer two-person approval for irreversible or high-impact changes.

### Service protections

- Rate-limit public read APIs, report submissions, authentication attempts,
  correction/removal forms, and data exports independently.
- Use layered controls: CDN/edge protection, per-route limits, quotas for
  authenticated high-volume contributors, schema validation, payload-size caps,
  and abuse monitoring.
- Implemented in Wave B: per-route sliding-window limiter
  (`app/lib/rate-limit.ts`), capped JSON body reader and URI guard
  (`app/lib/input-limits.ts`), and hashed abuse alerts with route surge
  detection (`app/lib/abuse-alerts.ts`). Environment knobs and defaults are
  listed in `docs/DEPLOYMENT.md`.
- Public binary routes are metered per caller: photo bytes
  (`GET /api/photos/[id]`, read bucket, default 60/min) and the tile proxy
  (`GET /api/tiles/*`, dedicated bucket, default 60/min, env
  `TILES_RATE_LIMIT_MAX`/`TILES_RATE_LIMIT_WINDOW_SECONDS`) so bulk scraping
  cannot drive unbounded R2 egress or violate the OSMF community tile usage
  policy. Appeal filing and review (`POST/GET /api/appeals`) have their own
  bucket (default 20/min, env
  `APPEAL_RATE_LIMIT_MAX`/`APPEAL_RATE_LIMIT_WINDOW_SECONDS`) so the appeals
  workload is tunable independently of moderation; appeal decisions
  (`PATCH /api/appeals/[id]`) share the moderation bucket (default 30/min) as
  a second layer over the edge gate.
- The in-memory limiter is per-isolate: on a public multi-isolate deployment
  the per-caller counts are not global, so the effective ceiling scales with
  the number of isolates. Before public alpha, evaluate Cloudflare's
  rate-limiting product (or a KV/DO-backed counter) for the critical
  buckets — auth, submissions, and tiles — where a determined caller could
  otherwise spread a burst across isolates. The per-isolate limiter remains
  the correct first layer everywhere and the only one needed for the local
  and staging single-isolate deployments.
- Caller identity is only as trustworthy as the edge that sets it. The
  per-caller buckets key on `cf-connecting-ip` when present (set by
  Cloudflare, unspoofable at the worker) and fall back to the first
  `x-forwarded-for` hop (`app/lib/rate-limit.ts` `callerKey`; the anonymous
  pending-photo quota bucket derives from the same key via
  `app/lib/photo-quota.ts`). On any deployment NOT fronted by Cloudflare a
  client can set arbitrary `x-forwarded-for` values and rotate its key,
  making the per-caller limits and the anonymous photo quota best-effort
  rather than a security boundary. The public API must therefore sit behind
  Cloudflare (or an equivalent trusted edge that overwrites the forwarded
  chain); non-CF deployments (local prototype, LAN, staging behind a plain
  proxy) must terminate at a trusted reverse proxy that strips or
  overwrites client-supplied `x-forwarded-for`, or treat the buckets as
  development conveniences only (see LOCAL_PLAYBOOK.md). This is a
  documented deployment constraint, not a fallback to rely on in
  production.
- Keep pending records, moderator notes, account data, audit detail, and private
  evidence inaccessible from public APIs, search, exports, error messages, and
  logs.
- Before enabling media, isolate object storage; scan uploads, strip EXIF,
  redact required personal data, use short-lived signed access, and enforce
  retention/deletion policies.
- Maintain a private vulnerability disclosure contact as required by
  `SECURITY.md`; do not use public issues for exploit details or personal data.

Security review is a release gate whenever changes affect identity, data
publication, media, storage, permissions, exports, or third-party integrations.

## Continuous integration and releases

Every proposed change should have a visible, repeatable path from review to
release. The minimum CI pipeline before public alpha is:

1. install dependencies from the lockfile;
2. format, lint, type-check, and build the application;
3. run automated tests for validation, publication filtering, permissions, and
   GeoJSON/API contracts as they are added;
4. apply migrations to an isolated test database and run relevant integration
   tests;
5. scan dependencies and prevent known secrets from entering the repository;
6. build a versioned, reproducible release artifact and publish its source
   revision.

Release candidates deploy to staging first. A production release needs a named
release owner, a migration and rollback decision, confirmation of backup health,
smoke tests for public and non-public boundaries, and an entry in the changelog.
Tag public releases, publish notable changes in plain language, and maintain a
versioned data-export changelog separately from software releases.

Use protected default branches, required review for changes, and a documented
exception process for urgent security fixes. Emergency changes must be reviewed
retrospectively and recorded in `docs/decisions/`.

## Repository, domain, and community operations

Before public alpha, create a public source repository under an organisation
account—not a personal account alone—and configure:

- the AGPL-3.0-or-later software licence, contributor guidance, code of conduct,
  security policy, issue templates, and discussion space;
- protected branches, maintainer roles, an access review cadence, and a clear
  path for reporting policy or moderation concerns privately;
- an open roadmap, decision records, release notes, and a public status page or
  equivalent incident communication channel;
- a contributor process that explicitly forbids real reports, personal data,
  credentials, and unredacted media in repository issues, tests, screenshots,
  and commits.

Register a domain in the name of the project organisation or a documented
stewardship entity. Enable registrar multi-factor authentication, registry lock
when available, automatic renewal with a monitored payment/contact path, DNS
change logging, and a fallback contact. The canonical domain, service email,
and repository location should be announced only when they are maintained and
ready for public use.

Governance decisions follow `GOVERNANCE.md`. Operational decisions that change
cost, privacy, reliability, licences, public data access, or community power
must be documented publicly unless publication itself would introduce a security
or privacy risk.

## Transparent costs and sustainability

OpenSurveillanceDB will remain free to users, without advertising, profiling,
or paid access. This does not mean infrastructure is cost-free. Maintain a
public, plain-language cost ledger with monthly amounts (or ranges where a
contract requires it), funding source, renewal date, and responsible role for:

- domain and DNS;
- web/API hosting and edge protection;
- database, backups, object storage, and egress;
- map tiles or self-hosted mapping infrastructure;
- email, incident communication, monitoring, and security tooling;
- moderation, accessibility, legal/privacy review, and community support where
  these have direct project costs.

Do not accept funding that gives a donor control over individual records,
moderation decisions, user data, or the project's public-interest mission.
Record material funding, conflicts of interest, and major vendor changes in
governance updates. Set a reserve target or a documented wind-down plan before
the service accumulates material real-world data.

## Public-alpha launch checklist

The operations owner checks and dates each item; the maintainers retain the
evidence in a release record. All items are required unless a public decision
documents why an equivalent control is stronger.

### Service and data

- [ ] Separate local, preview, staging, and production environments exist.
- [ ] Production contains no demo seed data and public endpoints return reviewed
      records only.
- [ ] Migration, backup, restore, rollback, and emergency-hide runbooks are
      written and tested.
- [ ] A restoration drill has succeeded in an isolated environment.
- [ ] Public export versions, provenance, and final data licence are visible.

### Map and infrastructure

- [ ] The tile provider/self-hosted plan is approved, funded, attributable, and
      compliant with its terms and OSM requirements.
- [ ] The production domain is organisation-controlled, renewed, and protected
      by multi-factor authentication.
- [ ] HTTPS, secure headers, least-privilege service access, and environment
      separation are verified.
- [ ] Monitoring, alerting, status communication, and incident contacts have
      been tested.

### Security and privacy

- [ ] Secret inventory, rotation process, access review, and private security
      contact are active.
- [ ] Route-specific rate limits and abuse controls are tested.
- [ ] Pending reports, reviewer data, private evidence, and internal audit detail
      cannot be accessed through public endpoints, exports, logs, or errors.
- [ ] Privacy notice, retention schedule, correction/removal route, and
      jurisdictional review are complete.

### Open-source and community

- [ ] Public repository, licences, contributor guidance, code of conduct,
      security policy, governance, and decision log are published.
- [ ] Initial maintainers, operations owner, moderators, and escalation contacts
      are named or their accountable roles are otherwise publicly documented.
- [ ] Release process, changelog, and public cost ledger are live.
- [ ] A public-alpha scope (jurisdiction, eligibility rules, and exclusions) is
      approved and communicated clearly.

## First decisions to make

1. Choose the hosting platform and confirm the production database, backup, and
   regional data-processing posture.
2. Obtain a map-tile cost/traffic estimate and select a provider or self-hosted
   threshold.
3. Create the project organisation, public repository, and secure domain
   stewardship arrangement.
4. Name initial operational and security contacts, then publish a minimal
   incident and status communication path.
5. Turn this workstream into dated issues or milestones only after the
   public-alpha jurisdiction and moderation capacity are agreed.
