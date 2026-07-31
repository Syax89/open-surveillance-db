-- Wave B (Data & Trust): reviewer roles, moderation queue, attributable audit events.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
--
-- The five named reviewers below are the LOCAL-PROTOTYPE seed (demo mode, per
-- docs/workstreams/DATA_TRUST.md "at least two trained people" rule). They are
-- deliberately prefixed "Demo" and MUST be removed (or replaced by real
-- provisioned accounts) before any public-alpha deployment with
-- authentication; see docs/decisions/0009-reviewer-roles-moderation-queue.md.

CREATE TABLE `reviewers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`mfa_enabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewers_display_name_unique` ON `reviewers` (`display_name`);--> statement-breakpoint
CREATE INDEX `reviewers_role_idx` ON `reviewers` (`role`);--> statement-breakpoint
INSERT INTO `reviewers` (`display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('Demo Intake Reviewer', 'intake_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `reviewers` (`display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('Demo Record Reviewer', 'record_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `reviewers` (`display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('Demo Senior Moderator', 'senior_moderator', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `reviewers` (`display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('Demo Privacy Lead', 'privacy_safety_lead', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `reviewers` (`display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('Demo Administrator', 'administrator', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');--> statement-breakpoint

CREATE TABLE `moderation_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`assignee_id` integer,
	`sensitivity` text DEFAULT 'standard' NOT NULL,
	`requires_second_review` integer DEFAULT 0 NOT NULL,
	`second_reviewer_id` integer,
	`escalation_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `reviewers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`second_reviewer_id`) REFERENCES `reviewers`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_queue_open_unique` ON `moderation_queue` (`entity`,`entity_id`) WHERE state != 'closed';--> statement-breakpoint
CREATE INDEX `moderation_queue_state_idx` ON `moderation_queue` (`state`);--> statement-breakpoint

ALTER TABLE `moderation_events` ADD `reviewer_id` integer REFERENCES `reviewers`(`id`);--> statement-breakpoint
ALTER TABLE `moderation_events` ADD `actor_role` text;--> statement-breakpoint
ALTER TABLE `moderation_events` ADD `recused` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `moderation_events` ADD `escalated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `moderation_events` ADD `second_reviewer_id` integer REFERENCES `reviewers`(`id`);--> statement-breakpoint

-- Audit integrity: the moderation trail is append-only at the database layer.
-- The API exposes no way to update or delete history; these triggers make any
-- attempt fail loudly even from a direct connection.
CREATE TRIGGER IF NOT EXISTS `moderation_events_no_update`
BEFORE UPDATE ON `moderation_events`
BEGIN
	SELECT RAISE(ABORT, 'moderation_events is append-only');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `moderation_events_no_delete`
BEFORE DELETE ON `moderation_events`
BEGIN
	SELECT RAISE(ABORT, 'moderation_events is append-only');
END;
