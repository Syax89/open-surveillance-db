# ADR 0009: Reviewer roles, moderation queue, decision reasons, and audit events

- **Status:** accepted
- **Date:** 2026-07-31
- **Author:** Ada (architecture / database)
- **Updates:** ADR 0003-moderation-access-control (named reviewer attribution and
  append-only audit replace the single generic "Local moderator" actor in the
  local prototype); ADR 0004-retention-and-review-cycle (queue workflow state is
  tracked per entity without changing the public status lifecycle).
- **Implementation note (2026-08-01):** the demo-seed removal required by
  decision 1 is implemented by migration `drizzle/0017_remove_demo_seed.sql`
  (the last migration — a fresh DB has zero demo identities, asserted by
  `npm run db:smoke`), and real accounts are provisioned with
  `scripts/provision-alpha-accounts.mjs` (`PROVISION_ACCOUNTS` env) before a
  public environment opens; see docs/DEPLOYMENT.md §Provisioning real accounts.

## Context

Wave B (Data & Trust) implements the moderation workflow in
`docs/workstreams/DATA_TRUST.md`: named reviewer roles with separation of
duties, a per-entity moderation queue, structured decision reasons, and an
immutable audit trail. The previous prototype recorded moderation events with a
generic "Local moderator" actor and no role enforcement, queue state, recusal,
escalation, or two-person review — so the data workstream's go/no-go items
("the moderation queue supports reason codes, recusal, second review for
sensitive cases, and emergency hide/removal"; "record, submission, evidence,
decision, and correction objects are separated with access controls and audit
logging") were unmet.

Real authentication and MFA are out of scope for the local prototype: this ADR
defines the data model and the role→action enforcement so that a future
auth provider can be attached without a schema change.

## Decision

1. **Named reviewers (`reviewers` table).** Roles mirror DATA_TRUST.md:
   `intake_reviewer`, `record_reviewer`, `senior_moderator`,
   `privacy_safety_lead`, `administrator`. `display_name` is unique; `active`
   and `mfa_enabled` are recorded (MFA is enforced only when real
   authentication lands). The five `Demo *` rows are the local-prototype seed
   and are removed/replaced before any public-alpha deployment.
2. **Role→action matrix enforced in the db layer.** `approve` (publishing a
   normal record) is reserved to record reviewers and senior moderators;
   intake reviewers may triage (reject/hide) but never publish; the privacy/
   safety lead owns `hide`/`escalate`; the administrator may only `escalate`.
   The API requires an explicit `actorId` for every decision; unknown, inactive,
   or non-permitted actors are rejected (404/403) before any write.
3. **Moderation queue (`moderation_queue`).** One open row per entity
   (partial unique index on `(entity, entity_id)` where `state != 'closed'`).
   Tracks `assignee_id`, `sensitivity` (standard/sensitive/urgent),
   `requires_second_review`, `second_reviewer_id`, and `escalation_reason`.
   A new row may be opened after the previous one is closed. `cameras.status`
   remains the domain/public state; the queue is workflow state only.
4. **Two-person review.** Sensitive/urgent items (and any item explicitly
   flagged) require a second reviewer for `approve`/`reject`/`reverify`: the
   first reviewer's action is recorded as an intent event, the queue enters
   `second_review`, and the status changes only when a *different* reviewer
   completes the decision (`second_review_same_reviewer` → 409). Emergency
   `hide` intentionally stays single-person (DATA_TRUST.md: emergency hiding
   does not require two reviewers; it is reviewed retrospectively).
5. **Recusal.** A reviewer discloses a conflict by sending `recused: true`;
   the event is recorded with `recused=1` and the record status never changes.
6. **Escalation.** `escalate` requires a mandatory note (the escalation
   reason); the queue enters `escalated` and only a senior moderator or the
   privacy/safety lead may resolve it (all other actions → 403).
7. **Decision reasons.** A bounded, validated reason-code list
   (`moderationReasonCodes` in `db/moderation.ts`, mirror of the suggested
   codes in DATA_TRUST.md) is required on every decision; free text lives in
   `note` and is capped at 500 characters at the API.
8. **Audit events are append-only.** `moderation_events` gains reviewer
   attribution (`reviewer_id`, `actor_role` captured at write time),
   `recused`, `escalated`, and `second_reviewer_id`. Database triggers
   `moderation_events_no_update` / `moderation_events_no_delete` raise
   `ABORT` on any UPDATE/DELETE; the API exposes no mutation endpoint.
9. **Schema via migration only.** The Wave B schema (tables, columns,
   triggers, demo seed) ships as hand-written migration
   `drizzle/0008_wave_b_reviewer_roles.sql`, registered in the Drizzle
   journal (idx 8) following the convention established for the H1/H3
   backfill (0007). No runtime bootstrap or seeding.
10. **Backward compatibility.** Calls without a `context` (legacy tests, the
    freshness sweep) record events with the fixed "Local moderator" actor and
    skip queue/role enforcement, preserving the pre-Wave-B contract.

## Consequences

- Every decision in the local prototype is attributable to a named reviewer
  with a role captured at write time; the audit trail cannot be rewritten at
  the database layer.
- The dashboard exposes an explicit actor selector, queue-state badges, and
  recusal/escalation markers in the history (EN/IT bundles in parity via the
  ADR 0007 translation type).
- The queue/role machinery is ready for real authentication: provisioning a
  real reviewer replaces a demo row, and `mfa_enabled` becomes enforced by the
  auth layer without a migration.
- Trade-off: no authorization is cryptographically enforced in the prototype —
  the API trusts the client-supplied `actorId`. Acceptable for local demo
  mode; the public-alpha auth ticket must make `actorId` server-derived.
