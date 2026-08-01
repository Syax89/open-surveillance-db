-- Community verifications (ADR 0018 §2, C1): `camera_confirmations`.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Toggle semantics, one confirmation type per (record, contributor):
--   - the UNIQUE (camera_id, contributor_id) index is the structural
--     anti-gaming layer: one active verification per record+contributor,
--     enforced at the database level (a concurrent double-PUT yields exactly
--     one row, the second answers 409);
--   - ON DELETE CASCADE mirrors the explicit deletion in eraseContributor
--     (ADR 0018 §6.2): the test harness does not enforce foreign keys, so the
--     app layer is the source of truth for erasure;
--   - (contributor_id, created_at) serves the daily-quota COUNT and the
--     per-record cap (ADR 0018 §2.4).

CREATE TABLE `camera_confirmations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`camera_id` integer NOT NULL REFERENCES `cameras`(`id`) ON UPDATE no action ON DELETE cascade,
	`contributor_id` integer NOT NULL REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `camera_confirmations_camera_contributor_unique` ON `camera_confirmations` (`camera_id`, `contributor_id`);
--> statement-breakpoint
CREATE INDEX `camera_confirmations_contributor_created_idx` ON `camera_confirmations` (`contributor_id`, `created_at`);
