-- Community edit-request coordinates (kanban t_775c8400): a contributor may
-- propose MOVING a published record's camera position, so the edit request
-- stores the proposed latitude/longitude (5-decimal precision, ~1.1 m) exactly
-- like the other proposed_* columns. NULL proposed = column unchanged (same
-- COALESCE model as db/camera-edits.ts and db/moderation.ts moderateCameraEdit).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).

ALTER TABLE `camera_edit_requests` ADD COLUMN `proposed_latitude` real;
--> statement-breakpoint
ALTER TABLE `camera_edit_requests` ADD COLUMN `proposed_longitude` real;
