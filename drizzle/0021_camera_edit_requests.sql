-- Community contribution editing (ADR 0018 §4, C1 schema part): the
-- `camera_edit_requests` table. C3 owns the two-track PATCH route logic; this
-- migration only creates the per-column diff-whitelist table C1 must ship so
-- the schema is complete for the whole community phase.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Published-record edits never mutate `cameras` directly: they insert a row
-- here with the explicit per-column diff against the editable whitelist
-- (title/kind/address/notes/manufacturer/observedOn/description) plus a
-- `moderation_queue` row (entity `camera_edit`). Approve applies the diff,
-- reject discards it.
--
--   - `status` 'pending' -> 'approved' | 'rejected' (terminal);
--   - the partial unique index (camera_id) WHERE status = 'pending' mirrors
--     `moderation_queue_open_unique`: one open edit-request per camera;
--   - `camera_id` is ON DELETE SET NULL so historical edit requests survive
--     a camera removal while staying auditable;
--   - `decided_by`/`decision_note`/`decided_at` mirror the appeal decision
--     fields; `created_at`/`updated_at` track the request lifecycle.

CREATE TABLE `camera_edit_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`camera_id` integer REFERENCES `cameras`(`id`) ON UPDATE no action ON DELETE set null,
	`contributor_id` integer REFERENCES `contributors`(`id`),
	`proposed_title` text,
	`proposed_kind` text,
	`proposed_address` text,
	`proposed_notes` text,
	`proposed_manufacturer` text,
	`proposed_observed_on` text,
	`proposed_description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` integer REFERENCES `reviewers`(`id`),
	`decision_note` text,
	`decided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `camera_edit_requests_open_unique` ON `camera_edit_requests` (`camera_id`) WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX `camera_edit_requests_contributor_idx` ON `camera_edit_requests` (`contributor_id`);
