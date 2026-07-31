CREATE TABLE `correction_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`camera_id` integer,
	`issue_type` text NOT NULL,
	`message` text NOT NULL,
	`contact` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL
);
