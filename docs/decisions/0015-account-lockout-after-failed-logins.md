# ADR 0015: Per-email account lockout after failed logins

- **Status:** accepted
- **Date:** 2026-08-01
- **Author:** Ken (DevSecOps) on decision of the CEO (Simone)
- **Updates:** ADR 0013-contributor-accounts-and-sessions (the login route
  gains a second, account-scoped brute-force defence layered on top of the
  per-IP rate limit introduced there).

## Context

The contributor-auth endpoints (POST /api/auth/login, POST /api/auth/register)
are protected only by the per-IP `auth` rate-limit bucket (default 10/min per
caller, app/lib/rate-limit.ts). A single caller is throttled, but a
*distributed* attacker — rotating IPs, a NAT with several egresses, or a
botnet — can keep guessing one account's password indefinitely, and the
per-IP bucket never trips because each request comes from a different
source. The generic 401 (db/auth.ts `authenticateContributor`) prevents
account enumeration, but not brute force.

Two questions had to be answered:

1. **Where does the counter live?** D1, Cloudflare KV with TTL, or a Durable
   Object? The project already stores contributor/session state in D1 and
   replays real migrations in the test harness, so a D1 table fits the
   existing data model and test tooling with no new bindings. KV would add a
   binding and eventual-consistency semantics; a DO would add a new runtime
   concept for a single counter. **D1 table it is.**
2. **Hard lock or light backoff?** A per-email lockout is trivially
   triggerable by a third party who knows the address (lockout poisoning):
   five deliberate failures and the legitimate owner is locked out. The task
   asked to weigh a hard block against a light exponential backoff.

## Decision

1. **New `login_attempts` table (migration 0012), keyed by `email_key` = the
   SHA-256 of the normalised email.** The raw address never appears in the
   table nor in any log line — a DB leak cannot map a row back to an address
   without the original. Columns: `failed_count`, `window_start`,
   `locked_until`, `lockout_level`.

2. **Threshold → lockout → 429.** Default policy
   (`AUTH_LOCKOUT_MAX_ATTEMPTS=5`, `AUTH_LOCKOUT_WINDOW_SECONDS=900`,
   `AUTH_LOCKOUT_DURATION_SECONDS=900`, `AUTH_LOCKOUT_MAX_DURATION_SECONDS=7200`):
   five failed logins inside a 15-minute window lock the account for 15
   minutes. Every login for that email answers **429 with Retry-After**
   (before any PBKDF2 work) until the lock expires. The attempt that reaches
   the threshold trips the lock and answers 429 itself.

3. **The lockout applies to unknown emails too.** The route records a failed
   login for *any* submitted email, whether or not a contributor exists, so
   the lockout behaviour is identical for real and fake addresses and cannot
   be used to enumerate accounts. The generic 401 (unknown email / wrong
   password) is unchanged.

4. **Successful login clears the counter.** `clearLoginAttempts` deletes the
   row on success, so a legitimate user who mistypes a couple of times never
   accumulates a lock.

5. **Light exponential backoff instead of an unbounded hard block.** The lock
   duration doubles per *consecutive* lockout (`durationSeconds * 2^level`),
   capped at `AUTH_LOCKOUT_MAX_DURATION_SECONDS`. The counting window is
   re-anchored at the moment the lock trips and extends one full window past
   the lock expiry, so an attacker who resumes as soon as the lock expires
   escalates to a longer lock instead of starting over at zero; after a quiet
   period the level resets. This bounds the damage of lockout poisoning to a
   temporary, self-expiring denial of login — never a permanent block — while
   still making persistent distributed guessing increasingly expensive.

6. **Layered, not replacing.** The per-IP `auth` bucket stays exactly as is;
   the per-email lockout is a second, independent layer. Both must pass.

7. **PII-free logging.** Lockout log lines carry only the `email_key` hash
   (e.g. `POST /api/auth/login rejected: lockout triggered (emailKey <hex>)`),
   never the address.

## Consequences

- **Brute-force resistance:** a distributed attacker can no longer keep
  guessing a single account — every failed login counts against the same
  email regardless of source IP, and after N failures the account answers 429
  until the lock expires.
- **Lockout poisoning is accepted and bounded.** Anyone who knows an email
  can lock its owner out for at most the current backoff duration (15 minutes
  at level 0). The lock is self-expiring, no admin intervention is needed,
  and the exponential cap (2 hours) prevents unbounded escalation. If this
  becomes a real abuse vector in production, options are a CAPTCHA before the
  counter increments or email-notification on lockout; both are out of scope
  for the local prototype.
- **Register is untouched.** Account enumeration on /api/auth/register (the
  409 surface) is tracked separately (t_b1ec48a9); this ADR covers
  password brute force only.
- **Operational knobs:** all four policy values are env-configurable, same
  convention as the rate-limit knobs, so the deployment can tighten or loosen
  the policy without a code change.
