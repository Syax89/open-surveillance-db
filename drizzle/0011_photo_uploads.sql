-- Photo evidence (STATUS gap #3): D1 metadata only, image bytes in R2.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
--
-- Privacy/safety model (docs/PRIVACY_AND_SAFETY.md, DATA_TRUST.md):
--   - `storage_key` is opaque and never exposed to clients;
--   - `status` gates visibility: only 'approved' photos can be served, and
--     only when `redaction_confirmed = 1` AND the linked camera is public
--     (`cameras.status` + freshness window);
--   - `exif_stripped` records the mandatory intake metadata strip;
--   - `redaction_confirmed` is set by a moderator at approval time.

CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`camera_id` integer,
	`contributor_id` integer,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`exif_stripped` integer DEFAULT 1 NOT NULL,
	`redaction_confirmed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `photos_status_idx` ON `photos` (`status`);--> statement-breakpoint
CREATE INDEX `photos_camera_idx` ON `photos` (`camera_id`);
