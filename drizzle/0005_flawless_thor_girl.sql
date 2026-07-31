CREATE INDEX IF NOT EXISTS `cameras_status_idx` ON `cameras` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `correction_requests_status_idx` ON `correction_requests` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `moderation_events_created_at_idx` ON `moderation_events` (`created_at`,`id`);
