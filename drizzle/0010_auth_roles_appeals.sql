CREATE TABLE `moderation_appeals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`decision_event_id` integer NOT NULL,
	`appellant_id` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` integer,
	`decision_note` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`decision_event_id`) REFERENCES `moderation_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appellant_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `reviewers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `moderation_appeals_status_idx` ON `moderation_appeals` (`status`);--> statement-breakpoint
CREATE INDEX `moderation_appeals_entity_idx` ON `moderation_appeals` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'contributor' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`mfa_enabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
ALTER TABLE `moderation_events` ADD `appeal_id` integer REFERENCES moderation_appeals(id);--> statement-breakpoint
ALTER TABLE `reviewers` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint

-- Auth roles (STATUS gap #2): identity accounts with a coarse role and the
-- demo seed. The five reviewer rows seeded by migration 0008 are linked to
-- their user accounts; a demo contributor provides the contributor flow.
-- These rows are the LOCAL-PROTOTYPE seed (demo mode) and MUST be replaced
-- by provisioned accounts before any public-alpha deployment with real
-- authentication; see docs/decisions/0014-auth-roles-appeals.md.
INSERT INTO `users` (`email`, `display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('intake@osdb.test', 'Demo Intake Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `users` (`email`, `display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('record@osdb.test', 'Demo Record Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `users` (`email`, `display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('senior@osdb.test', 'Demo Senior Moderator', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `users` (`email`, `display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('privacy@osdb.test', 'Demo Privacy Lead', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `users` (`email`, `display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('admin@osdb.test', 'Demo Administrator', 'admin', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `users` (`email`, `display_name`, `role`, `active`, `mfa_enabled`, `created_at`, `updated_at`) VALUES ('contributor@osdb.test', 'Demo Contributor', 'contributor', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');--> statement-breakpoint
UPDATE `reviewers` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'intake@osdb.test') WHERE `display_name` = 'Demo Intake Reviewer';--> statement-breakpoint
UPDATE `reviewers` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'record@osdb.test') WHERE `display_name` = 'Demo Record Reviewer';--> statement-breakpoint
UPDATE `reviewers` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'senior@osdb.test') WHERE `display_name` = 'Demo Senior Moderator';--> statement-breakpoint
UPDATE `reviewers` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'privacy@osdb.test') WHERE `display_name` = 'Demo Privacy Lead';--> statement-breakpoint
UPDATE `reviewers` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'admin@osdb.test') WHERE `display_name` = 'Demo Administrator';