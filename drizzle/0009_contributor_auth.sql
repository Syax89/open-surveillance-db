-- Contributor accounts and sessions (STATUS gap #1, docs/decisions/0013).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
--
-- Design (see docs/decisions/0013-contributor-accounts-and-sessions.md):
--   - `contributors` stores a normalised lowercase email (unique) and a
--     PBKDF2-SHA256 password hash (`pbkdf2$<iterations>$<saltB64>$<hashB64>`).
--     `display_name` is an optional public handle.
--   - `sessions` stores only the SHA-256 of the raw session token plus the
--     per-session CSRF token, so a database leak cannot replay live sessions.
--     A session is valid until `expires_at` unless revoked earlier.
--   - `cameras.contributor_id` optionally attributes a report to the logged-in
--     contributor who submitted it. Anonymous submissions remain possible by
--     design (NULL); attribution is a per-report opt-in convenience, not a
--     gate (ADR 0013).
--
-- No seed rows: a fresh database must contain zero contributors (the
-- migration smoke test enforces this).

CREATE TABLE `contributors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `contributors_email_unique` ON `contributors` (`email`);--> statement-breakpoint

CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contributor_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_contributor_idx` ON `sessions` (`contributor_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint

ALTER TABLE `cameras` ADD `contributor_id` integer REFERENCES `contributors`(`id`);
