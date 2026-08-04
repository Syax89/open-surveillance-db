-- ADR 0021 community-driven pivot — FASE 1 (kanban t_4a7469bb): public
-- per-record lifecycle history (transparency, ADR 0021 §7). Semantic,
-- aggregate event types (`published`, `confirmed` (count), `liked` (count),
-- `gone-flagged`, `hidden` (reason + counts), `removed` (counts),
-- `restored` (counts), `action-consumed`, `migration`, `setting-changed`);
-- `detail` carries the threshold counts / reasons as JSON.
--
-- NO actor attribution, ever: public rows never carry contributor ids,
-- emails or IP-derived data (identification risk — ADR 0018 §3.4). The
-- internal attribution stays in the append-only `moderation_events` audit
-- trail; this table is its unattributed public projection. Migration 0039
-- backfills the historical moderation decisions here (`approve` →
-- `published`, `reject` → `removed`, `hide` → `hidden` with reason
-- `admin-legal`) without attribution.
--
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test
-- harness. Declared in db/schema.ts so drizzle-kit generate never re-emits
-- it (convention 0012/0014).

CREATE TABLE `camera_lifecycle_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`camera_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`detail` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`camera_id`) REFERENCES `cameras`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `camera_lifecycle_events_camera_created_idx` ON `camera_lifecycle_events` (`camera_id`,`created_at`);
