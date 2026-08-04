-- ADR 0021 community-driven pivot — FASE 1 (kanban t_4a7469bb): the
-- community action surface. One action per user per record, enforced at the
-- database level (UNIQUE (camera_id, contributor_id)), with a trust-weighted
-- `weight` snapshot taken at action time (ADR 0021 §3.4 — later level changes
-- never rewrite history, so thresholds stay deterministic and auditable).
--
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration
-- together).
--
-- Indexes:
--   - UNIQUE (camera_id, contributor_id): ONE active action per pair — a
--     switch overwrites the row (ADR 0021 §3.2), never a second row.
--   - (camera_id, action_type): threshold evaluation — one indexed GROUP BY
--     over active actions of the triggering type (COUNT(DISTINCT
--     contributor_id) + SUM(weight), ADR 0021 §4.5).
--   - (contributor_id, created_at): daily-quota counts and erasure.
-- The CHECK constraint pins the five-type whitelist
-- (like / confirm / gone / problem / privacy, ADR 0021 §3) at the schema
-- level; the same whitelist is validated in code in FASE 2.

CREATE TABLE `camera_community_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`camera_id` integer NOT NULL,
	`contributor_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`weight` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`camera_id`) REFERENCES `cameras`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "camera_community_actions_action_type_check" CHECK(action_type IN ('like', 'confirm', 'gone', 'problem', 'privacy'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `camera_community_actions_camera_contributor_unique` ON `camera_community_actions` (`camera_id`,`contributor_id`);--> statement-breakpoint
CREATE INDEX `camera_community_actions_camera_action_idx` ON `camera_community_actions` (`camera_id`,`action_type`);--> statement-breakpoint
CREATE INDEX `camera_community_actions_contributor_created_idx` ON `camera_community_actions` (`contributor_id`,`created_at`);
