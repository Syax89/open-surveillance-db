# Sprint archive: reliable moderation loop

> **Status: sprint completed — 2026-08-01.** All four P0 tickets shipped on
> `main`, together with every P1 item and most of the items originally listed
> as explicit deferrals (accounts, roles, appeals, photo pipeline). This
> document is kept as the **sprint archive**: it records what was planned, what
> shipped, and what the review gate found. Current project capability is
> tracked in [STATUS.md](STATUS.md), which supersedes this page as the source
> of truth.

## Sprint result

The local moderation loop is now traceable and testable end to end on `main`
(HEAD `4e40aa4`):

- **Append-only moderation events** — `moderation_events` table (migration
  `0008`), write-once at the database layer, with required reason codes and
  optional reviewer note.
- **Reasoned decisions** — the moderation dashboard requires a reason code
  before approve/reject/hide; the API rejects any decision without one.
- **Local decision history** — read-only `recent decisions` view on the
  moderation dashboard; events never appear in any public representation.
- **Fictional-data workflow tests** — automated contract tests cover the
  pending → decision → public/private boundary, plus the local playbook flow
  (`docs/LOCAL_PLAYBOOK.md`).

Beyond the original scope, the sprint's deferrals that shipped since this page
was written are listed under [Implemented after this sprint](#implemented-after-this-sprint).

## Decision

This development cycle made the existing local moderation workflow
**traceable and testable**. It did not add photos, Android support, public
deployment, accounts, or new map features *at the time the sprint was planned*;
accounts and the photo pipeline were subsequently implemented on main and are
no longer deferred (see below).

The goal was a complete local loop:

```text
Private report or correction
  → pending queue
  → reasoned moderator decision
  → immutable local audit event
  → correct public/private result
```

## Definition of done

The sprint is complete when a local maintainer can create a fictional report,
approve/reject/hide it with a reason, inspect its decision history, and verify
that only an approved camera can appear in the public map/API/GeoJSON response.
No real-world data is required for this test.

**Met on 2026-08-01:** reasoned decisions, append-only local events, dashboard
history, migration, and contract tests are implemented on `main`. The fictional
rejection flow has been exercised: the record stayed out of public output and
produced an audit event. Approve, hide, and the full lifecycle (mark for
review, reverify, remove) are available in the local dashboard and covered by
the automated suite (`tests/moderation-events.test.mjs`,
`tests/intake-urgent-hide-workflow.test.mjs`, `tests/freshness-reverification.test.mjs`).

## Work allocation

| Track | Deliverable | Implementation owner | Depends on | Status |
| --- | --- | --- | --- | --- |
| A — data | `moderation_events` table, migration, append-only event writer | Data/backend agent | Existing queue schema | Done (migration `0008`) |
| B — reviewer UX | Required decision reason, confirmation state, local event history | Product/UI agent | Track A response shape | Done (`ModerationDashboard.tsx`) |
| C — verification | Repeatable fictional-data workflow and API/publication-boundary tests | Test agent | Tracks A and B | Done (contract tests on `main`) |
| Coordination | Review contracts, integrate, document status, decide scope cuts | Project director | All tracks | Done (review gate below) |

## P0 tickets

### 1. Record moderation decisions as events

**Status: implemented locally — done on main (2026-08-01).**

A separate, append-only `moderation_events` record is written for every local
action. Minimum fields:

- event ID and timestamp;
- entity type and entity ID;
- previous and new status;
- action (`approve`, `reject`, or `hide`);
- controlled reason code and optional short note;
- local actor label, initially a fixed development value.

Acceptance: a status update and its event are written together; an event cannot
be changed through the normal dashboard action. — **Met:** the table ships in
migration `0008` and is enforced append-only at the database layer
(`db/schema.ts`); `tests/moderation-events.test.mjs` covers the invariant.

### 2. Require a reason before a decision

**Status: implemented locally — done on main (2026-08-01).**

The dashboard receives a compact reason selector and optional note. Reasons
include: verified public infrastructure, insufficient evidence, duplicate,
private/sensitive location, inaccurate/outdated, privacy or safety concern, and
other.

Acceptance: a moderator cannot approve, reject, or hide an item without a
reason; the confirmation names the selected action and reason. — **Met:** the
API validates `reasonCode` against the controlled vocabulary and rejects
missing values; the dashboard renders the selector as `required`.

### 3. Add local decision history

**Status: implemented locally — done on main (2026-08-01).**

Show history for a selected pending item after a decision, and provide a
read-only local history view for recently processed items. This is a moderator
tool, never a public record page.

Acceptance: the decision history displays status transition, reason, and time
without appearing in public API, directory, GeoJSON, or map output. — **Met:**
the dashboard's `recent decisions` section is a read-only, local-only view fed
by `moderation_events`; public surfaces filter out workflow events
(`PUBLIC_LIFECYCLE_ACTIONS`).

### 4. Test the full fictional workflow

**Status: implemented locally — done on main (2026-08-01).**

The test suite and local test instructions prove:

1. a submitted camera starts `pending`;
2. a pending camera is absent from every public representation;
3. approving it creates an event and makes it eligible for public output;
4. rejecting or hiding it creates an event and keeps it non-public;
5. correction requests never appear in a public representation;
6. malformed moderation input cannot change any status.

Acceptance: the suite is repeatable from an empty local database or clearly
reset synthetic state; all tests pass without requiring an internet connection.
— **Met:** contract tests on `main`
(`tests/moderation-events.test.mjs`, `tests/api-moderation.test.mjs`,
`tests/intake-urgent-hide-workflow.test.mjs`) run offline against the in-memory
D1 harness; the local playbook (`docs/LOCAL_PLAYBOOK.md`) documents the
fictional flow.

## P1 if P0 finishes cleanly

All P1 items shipped on main:

- Duplicate-warning helper for reports near an existing public record —
  **done** (non-blocking local duplicate warning).
- Stale-record review state and a simple local re-verification action —
  **done** (mark for review / reverify / remove lifecycle,
  `tests/freshness-reverification.test.mjs`).
- Filter public directory by safe category and verification freshness —
  **done** (whitelisted freshness windows, parameterised SQL).
- Improve small-screen and keyboard checks for the moderation dashboard —
  covered by the Wave C verification checklist
  ([`EXECUTION_BOARD.md`](EXECUTION_BOARD.md), keyboard/screen-reader/mobile
  checks).

## Explicit deferrals

The items below were listed as outside this sprint so the local workflow would
not become overly broad. Most have since shipped on main; only the truly
remaining deferrals are still open.

### Implemented after this sprint

- **Sign-in, roles, and multi-person permissions — implemented.** Contributor
  accounts and sessions (email+password, PBKDF2-SHA256, CSRF) landed in
  [ADR 0013](decisions/0013-contributor-accounts-and-sessions.md) and
  [STATUS.md](STATUS.md) ("contributor accounts and sessions"); coarse
  `contributor`/`moderator`/`admin` roles, server-derived reviewer identity,
  and the contributor appeal workflow landed in
  [ADR 0014](decisions/0014-auth-roles-appeals.md). Real identity provisioning
  (OIDC/MFA) remains a public-alpha prerequisite, not part of this sprint.
- **Photo upload, media storage, and EXIF handling — implemented.** `/api/photos`
  with size/MIME/dimension caps, magic-byte verification, mandatory
  EXIF/XMP/IPTC stripping (fail-closed), sanitised bytes in R2, and a
  moderation/redaction gate: approved photos are served only for public
  cameras, pending/rejected evidence never leaks (PR #64). Explicit
  face/plate-blur tooling is not part of the implementation; the redaction gate
  is the moderation control that keeps unredacted evidence off public surfaces.
- **Public repository — implemented.** The repository
  `Syax89/open-surveillance-db` is public with CI and a private security
  reporting route
  ([ADR 0012](decisions/0012-public-repo-security-disclosure-and-hosting.md)).

### Still deferred

- Public hosting, a public domain, and production data (the local LXC 114
  deployment is the current environment; Cloudflare staging is blocked on a CEO
  decision — see [STATUS.md](STATUS.md)).
- Notifications, email, analytics, monetisation, or advertising.
- Android application work.

## Review gate

Before starting the following sprint, the project director checks that the
data model, dashboard behaviour, tests, and [status document](STATUS.md)
agree. If they do not, the discrepancy is fixed before a new feature is added.

**Gate passed on 2026-08-01** (docs audit, commit `5095a36` onwards):

- **Data model:** `db/schema.ts` carries `moderation_events`,
  `moderation_appeals`, `users`, and `photos` (migrations `0008`–`0011`);
  `docs/DATA_MODEL.md` was re-aligned with the real schema and API routes.
- **Dashboard:** `ModerationDashboard.tsx` requires a reason, shows the
  read-only decision history, and exposes approve/reject/hide — matching the
  API contract.
- **Tests:** moderation, appeal, photo, and boundary suites exist on `main`
  and run offline against the D1 harness — verified 2026-08-01:
  **135/135 tests pass** (moderation-events, api-moderation, appeals,
  intake-urgent-hide-workflow, api-photos).
- **Status:** [STATUS.md](STATUS.md) (reviewed 2026-08-01) lists the sprint
  deliverables under "Implemented locally" and the still-open items under
  "Not yet implemented".

No unresolved discrepancy blocks the next cycle. The board sequence continues
with Wave C — verify the pilot (see [`EXECUTION_BOARD.md`](EXECUTION_BOARD.md)).
