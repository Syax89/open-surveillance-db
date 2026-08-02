-- Mailer (Fase A2, t_4c398006): outbound transactional email log.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Design (ADR 0020 decision 2): verification and password-reset emails are
-- sent through Cloudflare Email Routing (opensurveillancedb.org) — the
-- existing Cloudflare DPA covers the processor, zero new third parties.
-- Re-sends are rate-limited to 3 emails per contributor per hour.
--
-- The rate-limit counter is a dedicated append-only log row per send:
--   - `contributor_id` — the account the email was sent for (FK to
--     contributors, cascade-deleted with the account, ADR 0013 erasure);
--   - `kind` — 'verify' | 'reset' (what the email was for);
--   - `sent_at` — ISO timestamp; the 3/h window counts rows newer than
--     now - 1h for the contributor.
--
-- Privacy-by-design: the log stores NO content, NO recipient address (the
-- address already lives on contributors.email), and NO IP. It only exists
-- to enforce the send limit, so a leak of this table reveals nothing beyond
-- "account X was emailed for kind Y at time T".
--
-- No seed rows: a fresh database must contain zero send-log rows (the
-- migration smoke test enforces this).

CREATE TABLE `email_send_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contributor_id` integer NOT NULL,
	`kind` text NOT NULL,
	`sent_at` text NOT NULL,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `email_send_log_contributor_idx` ON `email_send_log` (`contributor_id`);--> statement-breakpoint
CREATE INDEX `email_send_log_sent_at_idx` ON `email_send_log` (`sent_at`);
