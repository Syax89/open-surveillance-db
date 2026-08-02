-- Multi-method authentication — Phase A (schema foundation).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Design (docs/AUTH_OPTIONS.md, ADR 0013 — see Fase F for the follow-up ADR):
--   - `contributors` gains three nullable/labelled columns that make the
--     account model provider-aware without touching the existing
--     email+password flow (ADR 0013) and without a third identity layer
--     (COMMUNITY_PLAN §1.4: every login method must produce a
--     `contributors.id`):
--       * `email_verified_at` — ISO timestamp of the verification, NULL while
--         the address is unverified (Fase B gate: zero write sessions before
--         verification; no email infra exists today, so this stays NULL for
--         every existing row);
--       * `auth_provider` — registration method, 'password' | 'passkey' |
--         'github' | 'google' (free text, validated in code; default
--         'password' keeps every legacy row valid without a backfill);
--       * `external_sub` — the OIDC subject for external providers (Fase D),
--         NULL otherwise. Only the subject is stored: the provider email is
--         never persisted (privacy-by-design, Fase D constraint).
--   - `email_verification_tokens` stores only the SHA-256 of the raw
--     verification token — a database leak cannot replay it (same rule as
--     `sessions.token_hash`, ADR 0013). Tokens expire 24h after creation
--     (`expires_at`) and are single-use (`used_at` set on consumption, then
--     the row is dead; lookup + consume is an atomic conditional UPDATE in
--     Fase B). The `expires_at` index serves the expiry sweep.
--   - `passkeys` (WebAuthn, Fase C): only the COSE public key is stored —
--     the private key never leaves the user's authenticator. `credential_id`
--     is globally UNIQUE per relying party; `counter` tracks the signature
--     counter to detect cloned authenticators; `transports` is an optional
--     JSON array (serialised by SimpleWebAuthn) for ceremony hints.
--   - `recovery_codes`: the 10 one-time codes issued at passkey enrollment
--     are stored hashed (SHA-256), one row per code, single-use (`used_at`).
--     A fresh DB must contain ZERO rows in all three new tables (the
--     migration smoke test enforces this).
--
-- No seed rows: a fresh database must contain zero tokens, passkeys and
-- recovery codes (the migration smoke test enforces this).

ALTER TABLE `contributors` ADD `email_verified_at` text;
--> statement-breakpoint
ALTER TABLE `contributors` ADD `auth_provider` text DEFAULT 'password' NOT NULL;
--> statement-breakpoint
ALTER TABLE `contributors` ADD `external_sub` text;
--> statement-breakpoint

CREATE TABLE `email_verification_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contributor_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `email_verification_tokens_token_hash_unique` ON `email_verification_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_verification_tokens_contributor_idx` ON `email_verification_tokens` (`contributor_id`);--> statement-breakpoint
CREATE INDEX `email_verification_tokens_expires_idx` ON `email_verification_tokens` (`expires_at`);--> statement-breakpoint

CREATE TABLE `passkeys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contributor_id` integer NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `passkeys_credential_id_unique` ON `passkeys` (`credential_id`);--> statement-breakpoint
CREATE INDEX `passkeys_contributor_idx` ON `passkeys` (`contributor_id`);--> statement-breakpoint

CREATE TABLE `recovery_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contributor_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_codes_code_hash_unique` ON `recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `recovery_codes_contributor_idx` ON `recovery_codes` (`contributor_id`);
