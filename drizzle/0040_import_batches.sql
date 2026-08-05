-- FONTI PUBBLICHE — import pipeline FASE A (kanban t_6030d390,
-- docs/data-sources/normalizzazione-pipeline.md §6.2/6.3, Drizzle journal
-- idx 40). Hand-written migration following the journal convention; applied
-- by `wrangler d1 migrations apply` and replayed by the db-runtime test
-- harness. Declared in db/schema.ts so drizzle-kit generate never re-emits
-- it (convention 0012/0014: hand-written migration + schema declaration
-- together).
--
-- Adds the import-provenance layer:
--   1. `import_batches` — one row per import run. `slug` is the unique key
--      ('<dataset>-<year>', lower-kebab) and the tail of every inserted
--      camera's `source` ('import:<slug>' — attribution by construction).
--      Status lifecycle: 'running' → 'committed' | 'failed' | 'rolled_back'
--      (CHECK constraint; the runner and the rollback command own it).
--      The `records_*` counters are the task's "record_count" per outcome,
--      `import_date` its "imported_at", `source_url` its "url",
--      `license`/`license_url` its "licence"/"licence_url".
--   2. `cameras.external_id` — source-native stable id (NULL for community
--      reports). The partial UNIQUE (source, external_id) is the
--      idempotency key: re-running a batch can never double-insert a row.
--   3. `cameras.import_batch_id` — FK to the run that inserted the row;
--      the rollback/attribution handle. No ON DELETE action by design:
--      batch rows are never deleted; rollback deletes *cameras* rows.
--
-- No data backfill: existing rows are community reports and stay NULL on
-- both new columns (design doc §9 — zero behavior change).
--
-- Indexes:
--   - import_batches_slug_unique: the runner's exclusive-lock key (batch
--     exists → abort unless --force).
--   - import_batches_status_idx: rollback/ops lookups by lifecycle state.
--   - cameras_source_external_unique (partial): idempotent upsert.
--   - cameras_import_batch_idx: whole-batch rollback in one indexed DELETE.
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`source_name` text NOT NULL,
	`format` text NOT NULL,
	`license` text NOT NULL,
	`license_url` text,
	`attribution_text` text,
	`source_url` text NOT NULL,
	`import_date` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`records_total` integer DEFAULT 0 NOT NULL,
	`records_inserted` integer DEFAULT 0 NOT NULL,
	`records_skipped_duplicate` integer DEFAULT 0 NOT NULL,
	`records_merged` integer DEFAULT 0 NOT NULL,
	`records_review` integer DEFAULT 0 NOT NULL,
	`records_invalid` integer DEFAULT 0 NOT NULL,
	`source_checksum` text,
	`rollback_payload` text,
	`report` text,
	`notes` text,
	`created_by` text DEFAULT 'import-runner' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text,
	CONSTRAINT "import_batches_status_check" CHECK(status IN ('running', 'committed', 'rolled_back', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_slug_unique` ON `import_batches` (`slug`);--> statement-breakpoint
CREATE INDEX `import_batches_status_idx` ON `import_batches` (`status`);--> statement-breakpoint
ALTER TABLE `cameras` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `cameras` ADD `import_batch_id` integer REFERENCES import_batches(id);--> statement-breakpoint
CREATE UNIQUE INDEX `cameras_source_external_unique` ON `cameras` (`source`,`external_id`) WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cameras_import_batch_idx` ON `cameras` (`import_batch_id`);
