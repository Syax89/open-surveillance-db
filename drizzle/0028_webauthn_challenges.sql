-- WebAuthn ceremony challenges — multi-method auth Phase C (passkeys).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Design (AUTH_OPTIONS.md §3, ADR 0013 — challenge store in D1 with expiry,
-- per task t_36989e06; the project has no KV binding, so the store lives in
-- D1 and the sweep is a bounded DELETE on `expires_at`):
--   - Only the SHA-256 of the base64url challenge is stored (hex) — a
--     database leak cannot replay a live ceremony (same rule as
--     `sessions.token_hash` and `email_verification_tokens.token_hash`).
--     The raw challenge is returned to the browser inside the WebAuthn
--     options and echoed back in `clientDataJSON`; the consume lookup
--     hashes the echoed value and matches on that.
--   - `kind` separates the two ceremonies: 'register' (session required,
--     bound to `contributor_id`) and 'login' (public; `user_handle`
--     records the discoverable-credential handle or the email flow's
--     target, so the complete step can double-check the assertion's
--     userHandle against it).
--   - `expires_at` = created_at + 10 minutes (WEBAUTHN_CHALLENGE_TTL_MS);
--     the index serves the expiry sweep.
--   - `used_at` makes each challenge single-use: consume is an atomic
--     conditional UPDATE ... WHERE used_at IS NULL (anti-replay).
--   - A fresh DB must contain ZERO rows (the migration smoke test enforces
--     this, like the other auth tables).

CREATE TABLE `webauthn_challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_hash` text NOT NULL,
	`kind` text NOT NULL,
	`contributor_id` integer,
	`user_handle` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `webauthn_challenges_challenge_hash_unique` ON `webauthn_challenges` (`challenge_hash`);--> statement-breakpoint
CREATE INDEX `webauthn_challenges_expires_idx` ON `webauthn_challenges` (`expires_at`);--> statement-breakpoint
CREATE INDEX `webauthn_challenges_contributor_idx` ON `webauthn_challenges` (`contributor_id`);
