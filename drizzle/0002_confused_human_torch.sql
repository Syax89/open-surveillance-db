CREATE TABLE `moderation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`previous_status` text NOT NULL,
	`new_status` text NOT NULL,
	`action` text NOT NULL,
	`reason_code` text NOT NULL,
	`note` text,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
