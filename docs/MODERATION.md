# Moderation policy

## Publication standard

OpenSurveillanceDB may publish a record only when it documents visible public surveillance infrastructure, has a clear civic-transparency purpose, contains no unnecessary personal data or sensitive operational detail, and has been reviewed by a trained moderator.

## Eligible examples

- A camera visibly mounted in a public street, square, station exterior, or public building exterior.
- A publicly documented traffic-monitoring camera, where publishing the record is lawful and safe.
- A record from an official public source, marked with its source and verification date.

## Exclusions

- Residential/private cameras, including doorbells and cameras facing a private home.
- Live video, stream URLs, credentials, network information, or control interfaces.
- Detailed field-of-view or operational capability that could create a safety risk.
- Sensitive facilities or locations where publication could materially increase risk.
- Images containing identifiable people, vehicle plates, or private interiors unless safely redacted and necessary.
- Unverifiable allegations about people or organisations.

## Review flow

1. **Receive:** create a private `pending` record; acknowledge without promising publication.
2. **Screen:** remove spam, personal data, prohibited content, and dangerous details.
3. **Verify:** assess whether the camera is public, visible, current, and within local policy.
4. **Minimise:** publish the least specific location and metadata that still serves transparency. **Published coordinates are rounded to ~4 decimal places (~10 m, zone level) by default; the exact location stays in the private moderation record, visible only to moderators** (decision 2026-07-31). Optional manufacturer and observation-date values are reviewed individually; approval of the camera does not publish them.
5. **Decide:** approve, request clarification, reject, or escalate; record a reason. When approving a camera, set the publication choice for manufacturer and observation date separately (`publishManufacturer` / `publishObservedOn`), with both choices defaulting to private. Photos attached to the record follow the photo gate: approval requires confirmed redaction (`redaction_confirmed`) — the API rejects an approval without it, fail-closed — and a photo is never public without an individual approval with confirmed redaction (image upload and the moderation/redaction gate landed in [PR #64](https://github.com/Syax89/open-surveillance-db/pull/64)).
6. **Maintain:** re-check periodically and respond to corrections, removal requests, and appeals (see [Appeals and corrections](#appeals-and-corrections)).

## Appeals and corrections

A contributor who disagrees with a recorded moderation decision can challenge it through the implemented appeal workflow ([ADR 0014](decisions/0014-auth-roles-appeals.md), routes `/api/appeals`): file, list, decide. Any authenticated user with at least the `contributor` role may file an appeal (`POST /api/appeals`); moderators and admins list and decide them (`GET /api/appeals`, `PATCH /api/appeals/:id`).

- **File:** contest a *final* decision event (a status change on a camera or correction request). Intent events — recusals, escalations, second-review steps — cannot be appealed. One pending appeal per decision (a duplicate is rejected, 409); the appeal is attributed to the appellant's account and rate-limited.
- **Decide:** an independent senior moderator — never the reviewer who made the original decision (recusal enforced, 409) — decides `uphold`, `dismiss`, or `escalate`. An escalated appeal may only be resolved by the administrator and requires a note explaining the reason. The acting reviewer is derived server-side from the authenticated user's linked reviewer profile.
- **Outcome:** `uphold` reverses the decision — the record returns to the moderation queue (`pending`) for a fresh decision by a different reviewer; an upheld appeal never publishes anything by itself. `dismiss` leaves the original decision standing.
- **Audit:** every appeal transition writes an append-only moderation event (`appeal-filed` / `appeal-uphold` / `appeal-dismiss` / `appeal-escalate`). Appeals, like recusals and escalations, are internal workflow and never appear in the public revision history.

Urgent privacy/safety reports can be temporarily hidden while reviewed (emergency flow, [MODERATION_SLA.md](legal/MODERATION_SLA.md) S1), and decisions and rationale are auditable internally without exposing reporters or reviewers. The public, bilingual page `/moderazione` explains this workflow in plain language. Target response times for requests, appeals, and emergency hides are defined in [MODERATION_SLA.md](legal/MODERATION_SLA.md) — still a draft for pre-launch review, not yet in force; the appeal workflow itself is live in the prototype ([ADR 0014](decisions/0014-auth-roles-appeals.md)).

## Moderator safeguards

- **Coarse role separation on every protected route** (`requireRole`, [ADR 0014](decisions/0014-auth-roles-appeals.md)): the moderation queue and appeal decisions require a `moderator` or `admin` account; any authenticated `contributor` may file an appeal; camera submission, correction intake, and all public read surfaces need no account. Unknown or inactive identities get 401, callers below the required tier 403. The acting reviewer is derived server-side from the authenticated user's linked reviewer profile — never client-chosen.
- **Granular reviewer roles** ([ADR 0009](decisions/0009-reviewer-roles-moderation-queue.md)): a role → action matrix gates moderation actions in the database layer. Intake reviewers may triage (reject, hide, escalate) but never publish; only `record_reviewer` and `senior_moderator` may approve; the administrator may only escalate.
- **Two-person review** for sensitive or disputed records: approve, reject, and reverify decisions on a sensitive/flagged item require a second reviewer. Emergency hides stay single-person so harm can be stopped immediately, but they are reviewed retrospectively ([DATA_TRUST.md](workstreams/DATA_TRUST.md)).
- **Recusal:** the reviewer who made the original decision cannot decide the appeal (409); a moderator with no linked reviewer profile is rejected 403 before any write.
- **Escalation:** a clear escalation route for legal/privacy questions — items and appeals escalate to senior moderators, the privacy/safety lead, or the administrator, and escalation requires a note.
- Separate moderation credentials from general contributor accounts.
- Training for consistent criteria and bias awareness.
- Regular review of published records, reversals, and false-positive patterns.
