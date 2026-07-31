# ADR 0002: Edge-level access control for the moderation interface

- **Status:** accepted
- **Date:** 2026-07-31
- **Related:** ADR 0001, legal review 2026-07-31 (H1: `/moderation` without authentication)

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
