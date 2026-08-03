-- Per-IP registration cap — P3-4 (CEO decision, task t_0941036b).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Design (docs/COMMUNITY_PLAN.md §3.3 "Anti-spam / anti-farming livelli"):
--   Account farming = many accounts from one IP. The register route keeps the
--   fast per-caller in-memory `auth` bucket (10/min) for burst control, but a
--   24h rolling cap needs persistent state: `registrations_ip_log` stores one
--   row per registration attempt, keyed by the SHA-256 of the caller key
--   (`cf-connecting-ip`) — NEVER the raw IP (privacy by design, same rule as
--   `photos.submitter_key` and the abuse-alert `callerHash`). The route
--   records the attempt and counts the window in ONE D1 batch (atomic, so
--   concurrent registrations cannot race past a stale count); the request
--   that brings the count to the cap (default 5) answers 429 with a generic
--   anti-enumeration body + Retry-After. Rows older than the window fall out
--   of the COUNT, so the cap resets automatically after 24h without any
--   cleanup job.
--
-- The (ip_hash, created_at) index turns the window COUNT
-- (`WHERE ip_hash = ? AND created_at >= ?`) into an index-only seek.
--
-- Rows older than the window are inert (they stop counting); a retention
-- purge aligned with R16 (login attempts) is a documented follow-up.
--
-- No seed rows: a fresh database must contain zero registration attempts
-- (the migration smoke test enforces this).
CREATE TABLE `registrations_ip_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_hash` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `registrations_ip_log_ip_created_idx` ON `registrations_ip_log` (`ip_hash`, `created_at`);
