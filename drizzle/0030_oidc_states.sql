-- OIDC external login state — Fase D (migration 0030).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Design (AUTH_OPTIONS.md §4a, Fase D — t_87f24b2d):
--   - `oidc_states` holds the PKCE/state half of an in-flight OIDC
--     authorization request, one row per redirect to the provider:
--       * `state_hash` — SHA-256 of the raw `state` value (never stored in
--         clear, same rule as `sessions.token_hash`, ADR 0013). The raw
--         state is the anti-CSRF nonce the provider echoes back verbatim in
--         the callback, so lookup is a point read on the hash;
--       * `code_verifier` — the PKCE verifier for the S256 challenge sent to
--         the provider. It MUST be recoverable to exchange the authorization
--         code, so it is stored in clear — but it is single-use (the row is
--         consumed atomically) and short-lived (10-minute `expires_at`,
--         served by the `expires_idx` sweep), so a database leak of a
--         verifier is bounded to a dead request window;
--       * `provider` — 'github' | 'google' (validated in code), so the
--         callback can never be replayed against a different provider;
--       * `redirect_to` — where the browser lands after a successful login
--         (defaults to /account in the route); the value is fixed at /start
--         time so an attacker who steals a state row cannot steer the victim
--         to a phishing URL.
--   - `oidc_merge_requests` implements the "email conflict → manual merge"
--     path of Fase D. When the provider's verified email matches an existing
--     password account, the callback does NOT auto-link (that would let an
--     attacker with a GitHub/Google account take over a password account
--     whose email they happen to know). Instead it issues a single-use merge
--     token: the browser lands on /login with the token, the user proves
--     ownership of the existing account with its password, and only then is
--     `auth_provider`/`external_sub` written onto that contributor.
--       * `token_hash` — SHA-256 of the raw merge token (same hashing rule);
--       * `provider` + `external_sub` — the OIDC identity to link, captured
--         at callback time so the merge cannot be redirected to a different
--         provider subject;
--       * `contributor_id` — the existing account the user must prove; the
--         email itself is never copied from the provider into this table
--         (privacy by design: the provider email is only compared in memory
--         at callback time and never persisted — Fase D constraint);
--       * `email_verified` — the provider's assertion about the conflicting
--         email, captured at callback time (a flag, not the address). Once
--         the password is proven, linkExternalIdentity() uses it to set
--         email_verified_at on the existing account when still unverified.
--   - Both tables are single-use (consumed with a conditional UPDATE on
--     `used_at`) and short-lived; no seed rows exist in a fresh database.
--
-- No seed rows: a fresh database must contain zero OIDC states and zero
-- pending merge requests (the migration smoke test enforces this).

CREATE TABLE `oidc_states` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state_hash` text NOT NULL,
	`provider` text NOT NULL,
	`code_verifier` text NOT NULL,
	`redirect_to` text NOT NULL DEFAULT '/account',
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_states_state_hash_unique` ON `oidc_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `oidc_states_expires_idx` ON `oidc_states` (`expires_at`);--> statement-breakpoint

CREATE TABLE `oidc_merge_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`provider` text NOT NULL,
	`external_sub` text NOT NULL,
	`contributor_id` integer NOT NULL,
	`email_verified` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_merge_requests_token_hash_unique` ON `oidc_merge_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `oidc_merge_requests_contributor_idx` ON `oidc_merge_requests` (`contributor_id`);--> statement-breakpoint
CREATE INDEX `oidc_merge_requests_expires_idx` ON `oidc_merge_requests` (`expires_at`);
