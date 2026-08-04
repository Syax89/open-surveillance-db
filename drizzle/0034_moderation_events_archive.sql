-- QA#3 F6 (t_97e552bf): R5 archival path for the append-only moderation
-- audit trail. moderation_events is append-only by design (migration 0008
-- triggers) and holds moderator free-text `note`s and `actor` display names
-- indefinitely — personal data with no retention (GDPR art. 5(1)(e)). This
-- migration:
--
--   1. adds `moderation_events.archived_at` — the sweep marks a row with it
--      BEFORE deleting it, so the triggers can tell "live row" from
--      "archived row";
--   2. creates `moderation_events_archive`, the 2-year archival store
--      (RETENTION_SCHEDULE R5). The sweep copies ANONYMIZED rows there
--      (note, actor, reviewer_id, second_reviewer_id → NULL; the decision
--      structure — entity, action, statuses, reason code, role, timestamps,
--      appeal link — survives without the WHO or the free-text);
--   3. re-creates the append-only triggers with a WHEN guard so the ONLY
--      permitted mutations are the archival transition itself:
--        UPDATE ... SET archived_at = ?        (NULL → timestamp, the sweep)
--        DELETE ... WHERE archived_at IS NOT NULL (rows already archived)
--      everything else still RAISEs. An archived row is immutable: once
--      archived_at is set, no further UPDATE is allowed, and DELETE is the
--      terminal step of the same atomic batch.
CREATE TABLE `moderation_events_archive` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`previous_status` text NOT NULL,
	`new_status` text NOT NULL,
	`action` text NOT NULL,
	`reason_code` text NOT NULL,
	`note` text,
	`actor` text,
	`reviewer_id` integer,
	`actor_role` text,
	`recused` integer DEFAULT 0 NOT NULL,
	`escalated` integer DEFAULT 0 NOT NULL,
	`second_reviewer_id` integer,
	`appeal_id` integer,
	`created_at` text NOT NULL,
	`archived_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_events_archive_created_at_idx` ON `moderation_events_archive` (`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `moderation_events` ADD `archived_at` text;--> statement-breakpoint
DROP TRIGGER IF EXISTS `moderation_events_no_update`;--> statement-breakpoint
CREATE TRIGGER `moderation_events_no_update`
BEFORE UPDATE ON `moderation_events`
WHEN NEW.archived_at IS NULL OR OLD.archived_at IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'moderation_events is append-only');
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `moderation_events_no_delete`;--> statement-breakpoint
CREATE TRIGGER `moderation_events_no_delete`
BEFORE DELETE ON `moderation_events`
WHEN OLD.archived_at IS NULL
BEGIN
	SELECT RAISE(ABORT, 'moderation_events is append-only');
END;
