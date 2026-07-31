# Next local sprint: reliable moderation loop

## Decision

The next development cycle will make the existing local moderation workflow
**traceable and testable**. We will not add photos, Android support, public
deployment, accounts, or new map features in this cycle.

The goal is a complete local loop:

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

**Implementation update (2026-07-31):** reasoned decisions, append-only local
events, dashboard history, migration, and contract tests are implemented. A
live fictional rejection flow has also been exercised: the record stayed out
of public output and produced an audit event. Approve and hide are available in
the local dashboard and remain part of the next manual acceptance check.

## Work allocation

| Track | Deliverable | Implementation owner | Depends on |
| --- | --- | --- | --- |
| A — data | `moderation_events` table, migration, append-only event writer | Data/backend agent | Existing queue schema |
| B — reviewer UX | Required decision reason, confirmation state, local event history | Product/UI agent | Track A response shape |
| C — verification | Repeatable fictional-data workflow and API/publication-boundary tests | Test agent | Tracks A and B |
| Coordination | Review contracts, integrate, document status, decide scope cuts | Project director | All tracks |

Tracks A and B may begin in parallel after agreeing the event shape. Track C
starts with the existing tests and expands once the API is stable.

## P0 tickets

### 1. Record moderation decisions as events

**Status: implemented locally.**

Add a separate, append-only `moderation_events` record for every local action.
Minimum fields:

- event ID and timestamp;
- entity type and entity ID;
- previous and new status;
- action (`approve`, `reject`, or `hide`);
- controlled reason code and optional short note;
- local actor label, initially a fixed development value.

Acceptance: a status update and its event are written together; an event cannot
be changed through the normal dashboard action.

### 2. Require a reason before a decision

**Status: implemented locally.**

The dashboard receives a compact reason selector and optional note. Reasons
will include: verified public infrastructure, insufficient evidence, duplicate,
private/sensitive location, inaccurate/outdated, privacy or safety concern, and
other.

Acceptance: a moderator cannot approve, reject, or hide an item without a
reason; the confirmation names the selected action and reason.

### 3. Add local decision history

**Status: implemented locally.**

Show history for a selected pending item after a decision, and provide a
read-only local history view for recently processed items. This is a moderator
tool, never a public record page.

Acceptance: the decision history displays status transition, reason, and time
without appearing in public API, directory, GeoJSON, or map output.

### 4. Test the full fictional workflow

**Status: contract tests implemented; the local rejection path has been run.**

Extend the test suite and local test instructions to prove:

1. a submitted camera starts `pending`;
2. a pending camera is absent from every public representation;
3. approving it creates an event and makes it eligible for public output;
4. rejecting or hiding it creates an event and keeps it non-public;
5. correction requests never appear in a public representation;
6. malformed moderation input cannot change any status.

Acceptance: the suite is repeatable from an empty local database or clearly
reset synthetic state; all tests pass without requiring an internet connection.

## P1 if P0 finishes cleanly

- Duplicate-warning helper for reports near an existing public record.
- Stale-record review state and a simple local re-verification action.
- Filter public directory by safe category and verification freshness.
- Improve small-screen and keyboard checks for the moderation dashboard.

## Explicit deferrals

These items remain outside this sprint so the local workflow does not become
overly broad:

- Sign-in, roles, and multi-person permissions.
- Photo upload, media storage, face/plate redaction, or EXIF handling.
- Public hosting, a public repository, domain registration, or production data.
- Notifications, email, analytics, monetisation, or advertising.
- Android application work.

## Review gate

Before starting the following sprint, the project director will check that the
data model, dashboard behaviour, tests, and [status document](STATUS.md) agree.
If they do not, the discrepancy is fixed before a new feature is added.
