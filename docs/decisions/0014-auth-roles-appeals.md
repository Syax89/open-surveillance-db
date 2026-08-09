# ADR 0014: Coarse auth roles, route-level authorization, and contributor appeals

- **Status:** accepted
- **Date:** 2026-08-01
- **Author:** Simone Rondina (project owner)
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
- **Amendment (2026-08-02, CEO decision — audit finding 3.1 HIGH):** the
  edge gate no longer covers `POST /api/appeals`. Gating the filing route
  with moderation credentials made appeals unreachable for contributors
  (401/503 before the route-level role check could ever run), so filing now
  authenticates with the ADR 0013 contributor session at the route layer
  (`app/api/appeals/route.ts`: session cookie + same-origin/double-submit
  CSRF, then the `users` role bridge). The moderator-facing surfaces
  (`GET /api/appeals`, `PATCH /api/appeals/:id`) stay behind the edge gate.
  See the amended §Edge identity gate below.

## Context

STATUS gap #2 asks for three things the initial implementation still lacks:

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
development header (`x-osdb-user-email`) are the two identity paths, resolved
against the new `users` table exactly like `app/chatgpt-auth.ts` documents.

## Decision

1. **Identity accounts (`users` table).** `email` unique, `display_name`,
   `role` (`contributor` | `moderator` | `admin`, default `contributor`),
   `active`, `mfa_enabled`, timestamps. A moderator/admin user optionally links
   one `reviewers` row (`reviewers.user_id`) carrying the granular DATA_TRUST
   role. Migration 0009 seeds the five demo reviewer accounts plus a demo
   contributor; all demo rows are development seed and are replaced by
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
3. **Server-derived reviewer identity.** The moderation PATCH never trusts a
   client-chosen `actorId` in production: the acting reviewer is ALWAYS
   derived server-side via `getReviewerByUserId` — a `moderator` acts as their
   own linked reviewer, and an `admin` does the same (no impersonation, the
   append-only audit trail stays attribution-exact). The demo actor selector
   (admin may step in as any reviewer) survives ONLY behind the development
   flag `ENVIRONMENT = "development"`; unset or any other value is treated as
   production and the flag is fail-closed (audit finding t_6b61fc3f). A caller
   with no reviewer profile is rejected 403 before any write. This closes the
   ADR 0009 trade-off where the actor was caller-supplied.
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
- Demo identities in the DB are development-only; provisioning real accounts is
  a public-alpha prerequisite, and the schema already carries the
  expectations (`mfa_enabled`, `active`).
- The `x-osdb-user-email` header is a development trust path: it must be
  stripped or replaced at the edge in any deployment where the caller is not
  the authenticated platform itself.

## Edge identity gate (2026-08-01)

The worker edge (`worker/index.ts`) is the single identity authority. It
closes the spoofing gap where `resolveAuthUser`/`requireRole` trusted
client-supplied identity headers on `/api/appeals` (and, in principle, any
future role-protected route) without a gate:

1. **Strip on every path.** `x-osdb-user-email` is removed from every
   incoming request; the ChatGPT-platform headers (`oai-authenticated-user-email`
   and the `oai-authenticated-user-full-name*` variants) are removed too,
   unless the deployment sets `TRUST_PLATFORM_HEADERS=true` — only valid in a
   real ChatGPT-plugin deployment where the platform gateway, not arbitrary
   clients, sits in front of the worker.
2. **Gate before identity.** The moderation Basic/Bearer gate is extended to
   the moderator-facing appeals routes (`GET /api/appeals`,
   `PATCH /api/appeals/:id`) — the only other role-protected API beside the
   moderation queue. A direct client can no longer reach them with a spoofed
   header: without a valid credential the request is rejected (401), and
   without configured credentials the gate fails closed (503).
   `POST /api/appeals` (filing) is **not** gated here — amended by CEO
   decision 2026-08-02 (audit finding 3.1): filing is a contributor action
   authenticated by the ADR 0013 session at the route layer, and gating it
   with moderation credentials made appeals unreachable for contributors.
3. **Inject server-side.** After a successful gate the worker sets
   `x-osdb-user-email` from `MODERATION_IDENTITY_EMAIL` (the `users.email`
   the credential maps to; `admin@osdb.test` for local development).
   Fail-closed: unset means no identity, so the route layer rejects the
   request (401) — a misconfigured host can never accidentally grant a role.
4. `app/lib/authz.ts` keeps resolving identity from the same headers, which
   are now guaranteed edge-set; its header comment documents the trust model.

A direct client that sends `x-osdb-user-email` / `oai-authenticated-user-email`
never reaches a role-protected route with those values intact: no gate → 401,
gate but spoofed value → value replaced by `MODERATION_IDENTITY_EMAIL`.
Enforced at runtime in `tests/auth-flow-e2e.test.mjs` (edge spoofing suite).

## Integration with ADR 0013 (contributor accounts)

`users` (coarse role identity, this ADR) and `contributors` (public
credentials + sessions, ADR 0013) are deliberately two tables: they answer
different questions — *who may act at which tier* vs *who holds the
credentials to log in*. They are bridged by email at provisioning time: a
registered contributor is mapped onto a `users` row (`role = contributor`,
`active = 1`) when the alpha auth provider is wired in, and a moderator/admin
is provisioned as a `users` row with a linked `reviewers` profile. The
The development trust paths (`oai-authenticated-user-email` /
`x-osdb-user-email`) bypass `contributors` entirely by design: the demo
identities are seed rows in `users`, never credential rows.
