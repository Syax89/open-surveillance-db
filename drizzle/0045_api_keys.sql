-- Per-contributor private write API keys (EPIC api-keys — T4, decisions D1–D13
-- approved 2026-08-09, docs/decisions/ADR 0022 + /home/simone/.hermes/plans/
-- 2026-08-09_223218-osdb-write-api-keys.md §1.1).
-- Hand-written migration following the journal convention 0012/0014; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Purely ADDITIVE: creates one new table + three indexes, touches no existing
-- row (no backfill) — a fresh DB must contain ZERO rows in api_keys (the
-- migration smoke test enforces this). Never rename/delete 0045 once applied
-- anywhere: wrangler journals by filename (plan §4.1).
--
-- Security model (same rules as db/auth.ts, ADR 0013):
--   - Only the SHA-256 hex of the raw key is stored (`key_hash`, globally
--     UNIQUE via api_keys_key_hash_unique); the raw key (`osdb_` + 32 random
--     bytes base64url, D2) exists in exactly one API response (the mint POST,
--     reveal-once) and is never persisted — a database leak cannot replay it
--     (D3).
--   - `key_prefix` (first 10 chars of the raw key, D2) is the display-only
--     handle; it never authenticates anything (resolution goes through the
--     full hash).
--   - `scopes` is the JSON array of write scopes the key grants (D4):
--     ["submit","confirm","edit","action"] — family-level, default all four
--     at mint, code-validated whitelist (never free-form).
--   - `revoked_at` soft-revokes (D9); `expires_at` (NULL = never, default
--     +365d at mint, D6) hard-expires. Both make a key dead even if its hash
--     leaks.
--   - `last_used_at` is throttled (updated at most every 5 minutes, D7) and
--     ISO-8601 UTC TEXT like every other timestamp in this project (never
--     SQLite `datetime('now')`).
--   - The `contributor_id` FK is ON DELETE CASCADE (account erasure removes
--     the keys — art. 17, D9); the erasure batch in db/auth.ts mirrors the
--     delete because the test harness does not enforce foreign keys (same
--     rule as `sessions` and `camera_community_actions`).
--
-- Indexes:
--   - api_keys_key_hash_unique (UNIQUE on key_hash): point lookup for every
--     authenticated request — hash the presented Bearer token and resolve
--     (constant-time compare in code).
--   - api_keys_contributor_idx (contributor_id): "My keys" list, cap-5 COUNT
--     and the erasure cascade all filter on contributor_id.
--   - api_keys_liveness_idx (revoked_at, expires_at): the R21 retention
--     sweep (90d after revoked/expired) and the gate liveness predicate
--     (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)) both
--     read it.

CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contributor_id` integer NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_contributor_idx` ON `api_keys` (`contributor_id`);--> statement-breakpoint
CREATE INDEX `api_keys_liveness_idx` ON `api_keys` (`revoked_at`, `expires_at`);
