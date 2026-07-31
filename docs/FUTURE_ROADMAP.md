# Future roadmap

This roadmap guides OpenSurveillanceDB from a working local prototype to a
carefully operated public-interest project. It is ordered by dependency, not by
calendar date: a phase begins only when its preceding gate has evidence.

## Direction chosen

The project will grow in this order:

```text
Reliable local moderation
  → data quality and accessible public experience
  → reproducible local operations
  → pilot decisions and safeguards
  → limited public alpha
  → multi-city open-data programme
  → Android companion
```

The project will not trade review quality, privacy, or openness for speed.

## Horizon 0 — close the current local cycle

**Purpose:** prove that the existing local moderation loop behaves as designed.

- Exercise approve, reject, and hide with fictional records through the local dashboard.
- Confirm each status has the intended public result: only `verified` is published; `pending`, `rejected`, and `removed` never are.
- Confirm correction requests remain private under every outcome.
- Keep audit events readable, append-only, and absent from public output.

**Exit gate:** a repeatable local acceptance checklist is completed with synthetic data and recorded in the project status.

## Horizon 1 — data quality and lifecycle

**Purpose:** make published records understandable, correctable, and maintainable.

**Implementation update (2026-07-31):** the local prototype now offers safe
type/order filters shared between map and directory, plus a non-blocking
75-metre duplicate warning. The proximity API is derived only from the same
public/demo list as the map; it cannot reveal pending reports. Stale-record and
re-verification lifecycle work is also implemented locally: a verified record
can be marked `needs_review`, which removes it from public output until it is
reverified or removed. A full fictional lifecycle exercise has passed.

**Implementation update (2026-07-31, safe directory filters):** the public
directory now filters by camera category and verification freshness
(`GET /api/cameras?kind=...&freshness=7d|30d|90d`, shared by JSON, GeoJSON, and
CSV). The category filter is a bounded, parameterised equality match; the
freshness windows are an explicit whitelist; verification transitions record
ISO timestamps, with a one-time backfill from the moderation audit trail for
pre-existing prose values; and non-ISO labels (illustrative demo placeholders)
are never matched by a freshness window, in the UI or the API.

### Planned work

- Detect likely duplicates before a contributor submits a new record.
- Add explicit record freshness and re-verification state without publishing stale data as current.
- Add safe category and verification-freshness filters to the public directory.
- Add a reviewed public change summary that omits contributor identities and internal notes.
- Give moderators a local way to associate a correction request with a record outcome.
- Expand tests around each status transition and its public visibility.

**Exit gate:** a fictional duplicate, correction, stale record, and re-verification can each be handled without leaking internal data.

## Horizon 2 — inclusive product maturity

**Purpose:** ensure the web experience works beyond the desktop map view.

**Implementation update (2026-07-31):** English and Italian are now available
across the public page, record detail, and local moderation dashboard. The
choice is stored only on the device and does not affect API data. Broader
translation review and formal accessibility testing remain required. The site
also has a bilingual in-app guide, a skip link, visible focus states,
reduced-motion support, and explicit map-to-directory guidance. A report
location can be selected by map click or valid manual coordinates; either path
uses the same public-only nearby-record check.

### Planned work

- Finish the keyboard and text-list equivalent for every map task.
- Run manual screen-reader, zoom, contrast, and small-screen checks.
- Externalise interface strings and introduce English plus the pilot-area language.
- Make zero-result, coverage, status, and consent language precise and consistent.
- Add a clear accessibility statement and a non-sensitive usability-feedback route.

**Exit gate:** core browse, search, submit, and correction flows meet the published acceptance criteria in [PRODUCT_UX.md](workstreams/PRODUCT_UX.md#acceptance-criteria).

## Horizon 3 — reproducible local operations

**Purpose:** make the system reproducible by contributors before it is exposed to users.

**Implementation update (2026-07-31):** a local playbook documents setup,
synthetic submissions, approve/reject/hide checks, nearby-search validation,
and a cautious reset approach without providing a destructive reset command.

### Planned work

- Document a clean local setup, migration, synthetic fixture, and reset process.
- Run schema migrations from a fresh local database rather than relying on runtime demo setup alone.
- Add a local release checklist and change log.
- Add test coverage for invalid input, public API contracts, and moderation events.
- Create a lightweight data dictionary and versioning policy for future exports.

**Exit gate:** another contributor can reproduce the local prototype, run tests, and understand every public field from documentation alone.

## Horizon 4 — public-pilot decision gate

**Purpose:** decide whether a real, limited pilot is justified. This is a decision phase, not an automatic deployment phase.

### Decisions required

1. Pilot jurisdiction, working languages, and eligible public-camera categories.
2. Organisational steward, maintainers, moderator capacity, and escalation contacts.
3. Final software, documentation, and data licences.
4. Legal/privacy review, correction/removal approach, retention rules, and sensitive-location exclusions.
5. Domain, public repository, hosting region, backup owner, and sustainable OSM tile strategy.
6. Community funding and cost-transparency model consistent with the non-commercial mission.

**Go/no-go gate:** all decisions are published as decision records, and the public-alpha checklists in the workstreams are satisfied. A missing owner or unresolved high-impact question means **no-go**.

## Horizon 5 — limited public alpha

**Purpose:** operate a small, reviewable service in one defined area.

- Publish only reviewed records for the pilot area.
- Invite a limited contributor and moderator group.
- Require authentication and route-level abuse controls for write actions.
- Use staging, backups, restoration drills, monitoring, and a documented incident path.
- Publish privacy notice, terms, moderation policy, data dictionary, accessibility statement, and cost ledger.
- Release versioned reviewed-data exports with visible provenance and licence.

**Success evidence:** predictable moderation turnaround, usable correction path, reliable exports, no unresolved high-severity safety/privacy issue, and sustainable operating load.

## Horizon 6 — multi-city open-data programme

**Purpose:** expand only where local context and review capacity exist.

- Add a city only after local rules, language support, moderators, and operating cost are in place.
- Introduce confidence, provenance, freshness, and change-history standards across locations.
- Publish transparency reports, aggregate quality measures, and reproducible dataset releases.
- Maintain a public decision log and appeal process.

**Exit gate:** expansion does not degrade the quality, timeliness, or accountability proven in the pilot.

## Horizon 7 — Android companion

**Purpose:** make the proven web workflow usable in the field, not create a separate data pipeline.

- Begin with browse/search and a guided draft report.
- Send reports into the same private moderation queue as the website.
- Request only necessary device permissions and apply the same evidence/redaction rules.
- Release source, build instructions, and dependency information openly.

**Gate:** the web workflow is stable, accessible, well-documented, and safely operated before mobile submission is enabled.

## Decision cadence

At the end of every horizon, maintainers should record:

- what was completed and tested;
- what evidence satisfied the gate;
- open risks and deliberate deferrals;
- the next horizon selected; and
- any change to scope, data boundaries, licence, or governance.

This keeps the plan open to contributors while preventing silent scope changes.
