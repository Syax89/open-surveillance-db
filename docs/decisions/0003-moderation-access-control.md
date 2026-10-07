# ADR 0003: Edge-level access control for the moderation interface

- **Status:** accepted
- **Date:** 2026-07-31
- **Related:** ADR 0001, legal review 2026-07-31 (H1: `/moderation` without authentication)
- **Note:** originally numbered 0002; renumbered to 0003 in PR #8 to resolve the ADR numbering collision with 0002-legal-pre-launch-deliverables.
- **Amendment (2026-10, project owner decision):** real per-moderator login
  via the site's existing contributor session (ADR 0013) is now checked
  BEFORE the Basic/bearer gate and grants the same pass when the session's
  contributor is linked to a `users` row with role moderator+ (ADR 0014).
  See §Session-based moderator login below. The shared-secret gate (Basic/
  bearer) is NOT removed — it stays configured as the fail-closed fallback
  and for machine/ops access (`MODERATION_TOKEN`); this amendment adds a
  path, it replaces nothing.

## Context

The moderation dashboard (`/moderation`) and its API (`/api/moderation`) expose
pending community reports, correction requests, and the moderation audit log —
all private by design (ADR 0001). Until this change nothing required any
authentication: on a public test host anyone could read the queue and record
moderation decisions.

The codebase already contains a ChatGPT-plugin authentication helper
(`app/chatgpt-auth.ts`), but completing that flow requires the ChatGPT plugin
platform and is not available for a plain test hosting.

## Decision

Gate every moderation path at the worker edge (`worker/index.ts`) with HTTP
Basic authentication, and additionally accept a bearer token:

- `MODERATION_USER` / `MODERATION_PASSWORD` — Basic auth, works end-to-end in a
  browser (the dashboard's own `fetch` calls reuse the cached credentials).
- `MODERATION_TOKEN` — optional bearer token for API automation; accepted in
  addition to Basic auth when both are configured.
- **Fail closed:** if no credential is configured, every moderation request
  gets `503`, never a partial or open state. A misconfigured test host cannot
  accidentally expose the queue.

Credential comparison is constant-time. Unauthorized requests get `401` with a
`WWW-Authenticate` challenge so the browser prompts for credentials. Responses
carry `Cache-Control: no-store`.

Why edge-level instead of route-level: it protects the page and the API with
one mechanism, works before any application code runs, and does not require the
client component to manage tokens. The ChatGPT-plugin flow (`chatgpt-auth.ts`)
remains the planned upgrade path for a public launch, where per-moderator
identities and role separation are required.

## Consequences

- Test hosting must set `MODERATION_USER` and `MODERATION_PASSWORD` (and
  optionally `MODERATION_TOKEN`) as worker secrets.
- The moderation dashboard is unusable until credentials are configured —
  intended, fail-closed behaviour.
- A future public launch should replace this shared-secret gate with real
  per-moderator authentication and role-based authorization (see MODERATION.md
  "Moderator safeguards").

## Session-based moderator login (2026-10 amendment)

The "future" upgrade above is now partially live: `requireModerationAuth`
(`worker/index.ts`) checks a live `osdb_session` cookie (ADR 0013) BEFORE
falling through to Basic/bearer. When the session's contributor is linked to
a `users` row (ADR 0014) with role `moderator` or `admin`, the gate passes
and injects that user's own email — real per-moderator login through the
site's existing Google/password sign-in, zero shared secret involved.

- **Still fail-closed, still a fallback, nothing removed.** The Basic/bearer
  configuration requirement (`moderationCredentialsConfigured`) is
  unchanged: a host with zero `MODERATION_*` secrets still gets 503 before
  the session check ever runs. The session path is an EARLIER successful
  exit, not a replacement for the fail-closed floor. A moderator can still
  fall back to Basic auth (or the bearer token, for automation) if their
  session is absent or expired.
- **Every failure mode degrades to "try the next credential", never to a
  denial of its own**: no cookie, undecodable cookie, dead/expired/revoked
  session, no linked `users` row, inactive user, role below moderator, or a
  D1 error during lookup — all of them fall through silently to Basic/
  bearer. A contributor's ordinary session browsing the public site never
  produces a 401/503 from this check; it just doesn't grant the free pass.
- **Provisioning a moderator for this path** is a `users` row
  (`role = 'moderator'` or `'admin'`, `active = 1`) whose `email` matches the
  contributor's `contributors.email` — for an OIDC (Google) account that is
  the non-routable placeholder `oidc.<provider>.<sub>@invalid` already
  stored there (see `db/users.ts`, ADR 0014), not the real address.
- **No new identity-spoofing surface.** The session lookup runs server-side
  against D1 (`findSessionByToken`, the same function the contributor routes
  already use) — a client cannot forge the outcome by sending a header; the
  only client-controlled input is the opaque session token, already hashed
  and compared server-side exactly as ADR 0013 specifies for every other
  session-authenticated route.
