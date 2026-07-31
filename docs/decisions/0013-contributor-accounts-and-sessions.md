# ADR 0013: Contributor accounts and sessions

- **Status:** accepted
- **Date:** 2026-08-01
- **Author:** Linus (Backend) on decision of the CEO (Simone)
- **Updates:** ADR 0009-reviewer-roles-moderation-queue (the reviewer roles stay
  separate from the contributor role introduced here; a contributor is a
  *reporter*, not a reviewer).

## Context

STATUS.md gap #1 (and EXECUTION_BOARD Wave B "Authentication/roles") asks for
contributor accounts so that people who submit camera reports can be
identified. The project's privacy posture ("privacy and safety by design",
ADR 0002/0008) requires that any identity mechanism be *minimising*: no
tracking, no live feeds, and no identity data beyond what is strictly needed.

Two questions had to be answered before writing code:

1. **Which authentication mechanism?** Email+password, magic link, or
   delegated OAuth? The site is a small civic database running on Cloudflare
   Workers + D1 with no mail infrastructure. OAuth adds third-party
   dependencies (and thus tracking surface) for no current need; magic links
   require an outbound mailer that does not exist yet.
2. **Is authentication required to submit reports?** The site explicitly
   accepts anonymous public observations; forcing an account to report would
   exclude the very people the project exists for (witnesses who do not want
   to be identified).

## Decision

1. **Email + password, PBKDF2-SHA256.** Passwords are hashed with salted
   PBKDF2-HMAC-SHA256 at 210,000 iterations (OWASP 2023 recommendation). The
   iteration count is embedded in the stored value
   (`pbkdf2$<iterations>$<saltB64>$<hashB64>`) so it can be raised later
   without a migration. Emails are normalised (trim + lowercase) and stored
   under a unique index. No plaintext password ever leaves the TLS connection,
   and the hash format never appears in API responses.

2. **Session = opaque random token, stored hashed.** The browser cookie
   (`osdb_session`, 32 random bytes base64url) is only ever stored as its
   SHA-256 in `sessions`, so a database leak cannot replay live sessions.
   Sessions expire after 30 days (`AUTH_SESSION_TTL_DAYS`) and are revoked on
   logout. The cookie is `HttpOnly; SameSite=Strict; Path=/`; `Secure` is off
   by default because the LAN staging prototype runs over plain HTTP, and is
   enabled with `AUTH_COOKIE_SECURE=true` in production (HTTPS precondition).

3. **CSRF = double-submit with per-session token.** Each session generates a
   random CSRF token stored in `sessions.csrf_token` and echoed in a
   *non-HttpOnly* cookie (`osdb_csrf`). Every state-changing request that
   carries a live session must echo it in the `X-CSRF-Token` header
   (compared in constant time) and must be same-origin. Anonymous requests
   (no session) are not CSRF-gated — there is no identity to protect — but
   still pass the same-origin check on the mutating routes. Rate limiting
   (`AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_SECONDS`, default
   10/min per key on `/api/auth/login` and `/api/auth/register`) protects the
   credential endpoints.

4. **Anonymous submissions remain possible, by design.** `cameras.contributor_id`
   is `NULL` unless the logged-in contributor submitted the report. The
   requirement "solo i contributori autenticati possono inviare segnalazioni"
   is interpreted as *attribution*: a live session adds the contributor's id
   to the report; its absence just means the report is anonymous. Requiring
   an account to report would contradict the project's public-observation
   mission and ADR 0008's data-minimisation posture. Moderation (reviewer
   roles, ADR 0009) stays separate: contributors get no moderation powers.

5. **What a contributor can do.** Register (`/register`), log in/out
   (`/login`, `/account`), see their profile and the list of reports they
   submitted (`/api/auth/me`, `/api/auth/me/submissions`). Display name is
   optional and purely cosmetic. There is no email verification and no
   password reset yet: both need an outbound mailer (new dependency) and are
   tracked as follow-up work.

## Consequences

- Contributors get a minimising identity: one email, an optional display
  name, and the timestamps. No real names, no location tracking, no third
  parties.
- Report attribution is opt-in by construction: submit while logged in and
  the report is linked; log out first and it is anonymous. Nothing retro-
  attributing anonymous reports is possible (their `contributor_id` is NULL).
- Password hashing is deliberately slow (210k PBKDF2 iterations ≈ tens of ms
  per login) — acceptable for a low-traffic civic site, and the cost is
  confined to login/register, not page views.
- The `Secure` cookie flag must be enabled at the same time HTTPS is
  introduced; until then, session cookies travel in cleartext on the LAN
  staging host (unchanged from ADR 0012: staging is non-production).
- Future work: email verification, password reset, and (if ever needed) an
  option to convert a *named* submission to anonymous — each requires the
  mailer decision first.
