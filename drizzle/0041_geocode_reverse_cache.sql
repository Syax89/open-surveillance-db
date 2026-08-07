CREATE TABLE IF NOT EXISTS `geocode_reverse_cache` (
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY (`lat`,`lng`)
);
--> statement-breakpoint
CREATE INDEX `geocode_reverse_cache_lng_idx` ON `geocode_reverse_cache` (`lng`);
