# ADR 0014: Coarse auth roles, route-level authorization, and contributor appeals

- **Status:** accepted
- **Date:** 2026-08-01
- **Author:** Ada (architecture / database)
- **Updates:** ADR 0003-moderation-access-control (route-level coarse roles and
  server-derived reviewer identity sit in front of the worker Basic/Bearer
  gate); ADR 0009-reviewer-roles-moderation-queue (the named-reviewer matrix
  stays the granular layer for moderation *actions*, while the new coarse
  `users.role` gates the *routes*; appeals extend the append-only audit log);
  ADR 0013-contributor-accounts-and-sessions (the public credential store
  `contributors` + `sessions` is a separate layer: registration provisions
  credentials, provisioning maps a contributor onto a `users` role identity —
  see the integration note in Consequences).
- **Implementation note (2026-08-01):** the demo-identity removal required by
  decision 1 is implemented by migration `drizzle/0017_remove_demo_seed.sql`
  (the last migration — a fresh DB has zero demo identities, asserted by
  `npm run db:smoke`), and real accounts are provisioned with
  `scripts/provision-alpha-accounts.mjs` (`PROVISION_ACCOUNTS` env) before a
  public environment opens; see docs/DEPLOYMENT.md §Provisioning real accounts.

## Context

STATUS gap #2 asks for three things the local prototype still lacks:

1. **Distinct roles applied to all protected routes.** ADR 0009 introduced
   granular reviewer roles (`intake_reviewer` … `administrator`) enforced in
   the db layer for moderation actions, but every protected route trusted the
   caller's word: the moderation PATCH accepted a client-chosen `actorId`, and
   nothing enforced *who* may read the queue or file an appeal. There was no
   identity account at all.
2. **A complete, immutable audit log.** ADR 0009 made `moderation_events`
   append-only, but appeal activity was not part of the trail.
3. **An appeal workflow.** DATA_TRUST.md promises that a requester who
   disagrees with a decision can appeal, reviewed by a senior moderator who
   did not make the original decision — with no implementation.

Real authentication (OIDC/MFA provisioning) remains a public-alpha ticket; the
ChatGPT-plugin identity header (`oai-authenticated-user-email`) and the local
prototype header (`x-osdb-user-email`) are the two identity paths, resolved
against the new `users` table exactly like `app/chatgpt-auth.ts` documents.

## Decision

1. **Identity accounts (`users` table).** `email` unique, `display_name`,
   `role` (`contributor` | `moderator` | `admin`, default `contributor`),
   `active`, `mfa_enabled`, timestamps. A moderator/admin user optionally links
   one `reviewers` row (`reviewers.user_id`) carrying the granular DATA_TRUST
   role. Migration 0009 seeds the five demo reviewer accounts plus a demo
   contributor; all demo rows are local-prototype seed and are replaced by
   provisioned accounts before public alpha.
2. **Coarse role gates every protected route (`app/lib/authz.ts`).**
   `requireRole(request, minimum)` resolves the caller from
   `oai-authenticated-user-email` or `x-osdb-user-email`, rejects unknown or
   inactive identities with 401, and callers below the tier with 403.
   - `moderator+`: `GET/PATCH /api/moderation`, `GET /api/appeals`,
     `PATCH /api/appeals/:id`;
   - `contributor+`: `POST /api/appeals` (any authenticated user may contest a
     decision);
   - public (no gate): camera submission, correction intake, all public
     read surfaces — per DATA_TRUST.md, no account is required to report or
     to request a correction/removal.
   The worker edge Basic/Bearer gate (ADR 0003) stays as the transport-level
   login for the moderation dashboard; the route gate is the authorization
   layer and works for both identity headers.
3. **Server-derived reviewer identity.** The moderation PATCH no longer trusts
   a client-chosen `actorId`. A `moderator` acts as their own linked reviewer
   (derived via `getReviewerByUserId`); an `admin` may still act as any
   reviewer (the demo actor selector). A moderator with no reviewer profile is
   rejected 403 before any write. This closes the ADR 0009 trade-off where the
   actor was caller-supplied.
4. **Appeals (`moderation_appeals` + `/api/appeals`).** A contributor contests
   a *final* decision event (`previous_status != new_status`; intent events —
   recusals, escalations, second-review steps — cannot be appealed). One
   pending appeal per decision (409 on duplicate). Statuses:
   `pending → upheld | dismissed | escalated`.
   - `uphold`: the decision is reversed — the entity returns to the
     moderation queue (`pending`) for a fresh decision by a different
     reviewer; an upheld appeal never publishes anything by itself.
   - `dismiss`: the original decision stands.
   - `escalate`: routed to the administrator (note required); only an
     administrator may decide an escalated appeal.
   - Deciders are `senior_moderator` or `administrator` reviewer roles
     (derived server-side from the caller's linked reviewer); the reviewer who
     made the original decision is blocked (409).
5. **Appeals join the immutable audit trail.** Every appeal transition writes
   an append-only `moderation_events` row (`action = appeal-filed |
   appeal-uphold | appeal-dismiss | appeal-escalate`) linked via
   `appeal_id`. The public revisions endpoint filters these out
   (`PUBLIC_LIFECYCLE_ACTIONS`): appeals are internal workflow, never
   published, like recusals and escalations.
6. **Schema via migration only.** Hand-written migration
   `drizzle/0009_auth_roles_appeals.sql` (users, moderation_appeals, the
   `reviewers.user_id` / `moderation_events.appeal_id` columns, demo seed),
   registered in the Drizzle journal (idx 9) and snapshot. No runtime
   bootstrap; `scripts/db-migration-smoke.mjs` whitelist extended (tables,
   indexes, seeded row counts).

## Consequences

- Every protected route now has a single authorization chokepoint
  (`requireRole`) and the moderation queue can no longer be read or written by
  an anonymous or contributor-grade caller.
- The contributor appeal path is fully auditable: filing, decision, and
  reversal are all immutable events linked to the appeal row.
- A rejected/approved record can be contested and returned to the queue for a
  fresh review by an independent reviewer; a dismissed appeal changes nothing
  public.
- Demo identities in the DB are prototype-only; provisioning real accounts is
  a public-alpha prerequisite, and the schema already carries the
  expectations (`mfa_enabled`, `active`).
- The `x-osdb-user-email` header is a local-prototype trust path: it must be
  stripped or replaced at the edge in any deployment where the caller is not
  the authenticated platform itself.

## Integration with ADR 0013 (contributor accounts)

`users` (coarse role identity, this ADR) and `contributors` (public
credentials + sessions, ADR 0013) are deliberately two tables: they answer
different questions — *who may act at which tier* vs *who holds the
credentials to log in*. They are bridged by email at provisioning time: a
registered contributor is mapped onto a `users` row (`role = contributor`,
`active = 1`) when the alpha auth provider is wired in, and a moderator/admin
is provisioned as a `users` row with a linked `reviewers` profile. The
prototype trust paths (`oai-authenticated-user-email` /
`x-osdb-user-email`) bypass `contributors` entirely by design: the demo
identities are seed rows in `users`, never credential rows.
