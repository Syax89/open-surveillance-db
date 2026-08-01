-- Per-email login lockout (P2 security): brute-force defence layered on top
-- of the per-IP `auth` rate-limit bucket. Hand-written migration following
-- the journal convention; applied by `wrangler d1 migrations apply` and
-- replayed by the db-runtime test harness.
--
-- Privacy/safety model (docs/PRIVACY_AND_SAFETY.md, ADR 0015):
--   - one row per normalised email, keyed by the SHA-256 of the normalised
--     email (`email_key`), so the table stores NO PII: a DB leak cannot map
--     a row back to an address without the original;
--   - `failed_count` counts failed logins inside the current counting window
--     (`window_start`); when it reaches the threshold (default 5) the
--     account is locked until `locked_until`, and every login for that
--     email answers 429 with Retry-After until it passes;
--   - `lockout_level` counts consecutive lockouts so the duration backs off
--     exponentially (capped in code) — a hard per-email lockout is
--     triggerable by third parties (lockout poisoning), so the lock is
--     short, self-expiring, and the backoff stays bounded.

CREATE TABLE `login_attempts` (
	`email_key` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`window_start` text NOT NULL,
	`locked_until` text,
	`lockout_level` integer DEFAULT 0 NOT NULL
);
