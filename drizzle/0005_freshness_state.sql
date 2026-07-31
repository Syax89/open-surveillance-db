ALTER TABLE `cameras` ADD `last_verified_at` text;
ALTER TABLE `cameras` ADD `review_due_at` text;
ALTER TABLE `cameras` ADD `review_interval_months` integer DEFAULT 12 NOT NULL;
