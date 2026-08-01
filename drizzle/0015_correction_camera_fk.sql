-- Add the missing FK on correction_requests.camera_id -> cameras.id
-- (audit t_2ee58c08 gap: moderators could associate corrections to
-- non-existent cameras without the database objecting).
--
-- SQLite cannot add a REFERENCES clause to an existing column, so the table
-- is recreated with the constraint (Drizzle's standard sqlite pattern).
-- ON DELETE SET NULL is the conservative retention choice: historical
-- corrections survive the removal of a camera record, simply unlinked.
--
-- Pre-existing orphaned rows (camera_id pointing at deleted/never-existing
-- cameras, produced by the old unconstrained path) are unlinked to NULL
-- before the copy so the migration replays cleanly even with foreign_keys
-- enforcement on a dirty database.
--> statement-breakpoint
UPDATE `correction_requests` SET `camera_id` = NULL WHERE `camera_id` IS NOT NULL AND `camera_id` NOT IN (SELECT `id` FROM `cameras`);
--> statement-breakpoint
CREATE TABLE `new_correction_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`camera_id` integer REFERENCES `cameras`(`id`) ON UPDATE no action ON DELETE set null,
	`issue_type` text NOT NULL,
	`message` text NOT NULL,
	`contact` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`outcome` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `new_correction_requests`(`id`, `camera_id`, `issue_type`, `message`, `contact`, `status`, `outcome`, `created_at`) SELECT `id`, `camera_id`, `issue_type`, `message`, `contact`, `status`, `outcome`, `created_at` FROM `correction_requests`;
--> statement-breakpoint
DROP TABLE `correction_requests`;
--> statement-breakpoint
ALTER TABLE `new_correction_requests` RENAME TO `correction_requests`;
--> statement-breakpoint
CREATE INDEX `correction_requests_status_idx` ON `correction_requests` (`status`);
