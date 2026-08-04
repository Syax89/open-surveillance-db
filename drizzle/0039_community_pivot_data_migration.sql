-- ADR 0021 community-driven pivot — FASE 1 (kanban t_4a7469bb): data
-- migration of the existing model into the community-driven one
-- (ADR 0021 "Data migration plan", Drizzle journal idx 39). Applied by
-- `wrangler d1 migrations apply` as ONE transaction (D1 wraps the file); the
-- statements are ordered so every event INSERT captures the OLD state before
-- the UPDATE that maps it, and every statement is guarded (WHERE / NOT
-- EXISTS) so a partial or repeated application cannot corrupt the data.
--
-- MIGRATION_TS is a fixed literal so the audit trail is deterministic and
-- the migration events are testable; it matches the ADR approval date.
--
-- Steps (ADR 0021 §Data migration plan):
--   1. status map `pending|verified|needs_review|stale → active`,
--      `rejected → removed` (removed/demo untouched) — the pivot publishes
--      the old queue retroactively (the community corrects accuracy from
--      day one; `last_verified_at` stays NULL → "never confirmed" badge);
--   2. every affected record gets ONE public `migration` event
--      (camera_lifecycle_events, detail {from, to}) and the equivalent
--      internal append-only `moderation_events` row (actor 'migration');
--   3. `camera_confirmations → camera_community_actions`: every row becomes
--      an action_type='confirm' with `weight` = the contributor's trust
--      level weight AT MIGRATION TIME (snapshot rule, ADR 0021 §3.4 —
--      weights computed from the post-map `active` count, TRUST_LEVELS
--      thresholds L1=1/L2=5/L3=20/L4=50); then the old table is DROPPED (its
--      UNIQUE is superseded by the new one, ADR 0021 §Data migration 4b);
--   4. pending `moderation_appeals → dismissed` (the contrary-consensus
--      mechanism replaces the appeal flow — nothing is deleted, history
--      preserved, ADR 0021 §7.3) with migration events;
--   5. open `moderation_queue` rows → closed (no reviewer duties in the
--      normal flow) with migration events;
--   6. public-history BACKFILL from `moderation_events`: historical camera
--      decisions map to semantic events WITHOUT attribution
--      (approve → published, reject → removed, hide → hidden reason
--      admin-legal), ADR 0021 §Data migration 4e.

-- 1a. Public migration events for every record whose status will change
-- (captured BEFORE the UPDATEs so `from` is the real old status).
INSERT INTO `camera_lifecycle_events` (`camera_id`, `event_type`, `detail`, `created_at`)
SELECT `id`, 'migration',
	json_object('from', `status`, 'to', CASE `status`
		WHEN 'pending' THEN 'active'
		WHEN 'verified' THEN 'active'
		WHEN 'needs_review' THEN 'active'
		WHEN 'stale' THEN 'active'
		WHEN 'rejected' THEN 'removed'
		ELSE `status` END),
	'2026-08-04T00:00:00.000Z'
FROM `cameras`
WHERE `status` IN ('pending', 'verified', 'needs_review', 'stale', 'rejected');
--> statement-breakpoint
-- 1b. Equivalent internal audit rows (append-only moderation_events;
-- INSERT is allowed — the 0008/0034 triggers only block UPDATE/DELETE).
INSERT INTO `moderation_events` (`entity`, `entity_id`, `previous_status`, `new_status`, `action`, `reason_code`, `note`, `actor`, `created_at`)
SELECT 'camera', `id`, `status`,
	CASE `status`
		WHEN 'pending' THEN 'active'
		WHEN 'verified' THEN 'active'
		WHEN 'needs_review' THEN 'active'
		WHEN 'stale' THEN 'active'
		WHEN 'rejected' THEN 'removed'
		ELSE `status` END,
	'migration', 'community-pivot', NULL, 'migration', '2026-08-04T00:00:00.000Z'
FROM `cameras`
WHERE `status` IN ('pending', 'verified', 'needs_review', 'stale', 'rejected');
--> statement-breakpoint
-- 1c. The status map itself.
UPDATE `cameras` SET `status` = 'active' WHERE `status` IN ('pending', 'verified', 'needs_review', 'stale');
--> statement-breakpoint
UPDATE `cameras` SET `status` = 'removed' WHERE `status` = 'rejected';
--> statement-breakpoint
-- 2. camera_confirmations → camera_community_actions. The weight is the
-- contributor's trust-level weight at migration time: L0=0.25, L1=1, L2=2,
-- L3=3, L4=5, where the level comes from the contributor's `active` count
-- AFTER the status map (TRUST_LEVELS thresholds 0/1/5/20/50). A contributor
-- with no active records (ac.n NULL) weighs 0.25. `updated_at` mirrors
-- `created_at` (the row's action time is the original confirmation time).
INSERT INTO `camera_community_actions` (`camera_id`, `contributor_id`, `action_type`, `weight`, `created_at`, `updated_at`)
WITH `active_counts` AS (
	SELECT `contributor_id`, COUNT(*) AS `n`
	FROM `cameras`
	WHERE `contributor_id` IS NOT NULL AND `status` = 'active'
	GROUP BY `contributor_id`
)
SELECT `cc`.`camera_id`, `cc`.`contributor_id`, 'confirm',
	CASE
		WHEN `ac`.`n` >= 50 THEN 5
		WHEN `ac`.`n` >= 20 THEN 3
		WHEN `ac`.`n` >= 5 THEN 2
		WHEN `ac`.`n` >= 1 THEN 1
		ELSE 0.25
	END,
	`cc`.`created_at`, `cc`.`created_at`
FROM `camera_confirmations` `cc`
LEFT JOIN `active_counts` `ac` ON `ac`.`contributor_id` = `cc`.`contributor_id`
WHERE NOT EXISTS (
	SELECT 1 FROM `camera_community_actions` `a`
	WHERE `a`.`camera_id` = `cc`.`camera_id` AND `a`.`contributor_id` = `cc`.`contributor_id`
);
--> statement-breakpoint
-- 3. Drop the superseded toggle table (its UNIQUE is replaced by the new
-- one; the history lives on in the migrated actions + events).
DROP TABLE `camera_confirmations`;
--> statement-breakpoint
-- 4a. Pending appeals: public migration event for camera appeals.
INSERT INTO `camera_lifecycle_events` (`camera_id`, `event_type`, `detail`, `created_at`)
SELECT `entity_id`, 'migration', json_object('appeal', 'closed-by-migration'), '2026-08-04T00:00:00.000Z'
FROM `moderation_appeals`
WHERE `status` = 'pending' AND `entity` = 'camera';
--> statement-breakpoint
-- 4b. Pending appeals: internal audit rows.
INSERT INTO `moderation_events` (`entity`, `entity_id`, `previous_status`, `new_status`, `action`, `reason_code`, `note`, `actor`, `created_at`)
SELECT `entity`, `entity_id`, `status`, 'dismissed', 'migration-appeal-close', 'community-pivot', NULL, 'migration', '2026-08-04T00:00:00.000Z'
FROM `moderation_appeals`
WHERE `status` = 'pending';
--> statement-breakpoint
-- 4c. Close the pending appeals (rows kept — history preserved).
UPDATE `moderation_appeals` SET `status` = 'dismissed', `decided_at` = '2026-08-04T00:00:00.000Z' WHERE `status` = 'pending';
--> statement-breakpoint
-- 5a. Open moderation queue: public migration event for camera rows.
INSERT INTO `camera_lifecycle_events` (`camera_id`, `event_type`, `detail`, `created_at`)
SELECT `entity_id`, 'migration', json_object('queue', 'closed-by-migration'), '2026-08-04T00:00:00.000Z'
FROM `moderation_queue`
WHERE `entity` = 'camera' AND `state` != 'closed';
--> statement-breakpoint
-- 5b. Open moderation queue: internal audit rows.
INSERT INTO `moderation_events` (`entity`, `entity_id`, `previous_status`, `new_status`, `action`, `reason_code`, `note`, `actor`, `created_at`)
SELECT `entity`, `entity_id`, `state`, 'closed', 'migration-queue-close', 'community-pivot', NULL, 'migration', '2026-08-04T00:00:00.000Z'
FROM `moderation_queue`
WHERE `state` != 'closed';
--> statement-breakpoint
-- 5c. Close the open queue rows (the partial open_unique index stops
-- covering them once state = 'closed').
UPDATE `moderation_queue` SET `state` = 'closed', `updated_at` = '2026-08-04T00:00:00.000Z' WHERE `state` != 'closed';
--> statement-breakpoint
-- 6. Backfill the public history from the append-only audit trail (no
-- attribution — only semantic aggregate facts are copied). NOT EXISTS
-- guards make the statement idempotent.
INSERT INTO `camera_lifecycle_events` (`camera_id`, `event_type`, `detail`, `created_at`)
SELECT `entity_id`,
	CASE `action`
		WHEN 'approve' THEN 'published'
		WHEN 'reject' THEN 'removed'
		WHEN 'hide' THEN 'hidden'
		WHEN 'remove' THEN 'removed'
	END,
	json_object('from', `previous_status`, 'to', `new_status`,
		'reason', CASE WHEN `action` = 'hide' THEN 'admin-legal' END),
	`created_at`
FROM `moderation_events`
WHERE `entity` = 'camera' AND `action` IN ('approve', 'reject', 'hide', 'remove')
	AND NOT EXISTS (
		SELECT 1 FROM `camera_lifecycle_events` `e`
		WHERE `e`.`camera_id` = `moderation_events`.`entity_id`
			AND `e`.`event_type` = CASE `moderation_events`.`action`
				WHEN 'approve' THEN 'published'
				WHEN 'reject' THEN 'removed'
				WHEN 'hide' THEN 'hidden'
				WHEN 'remove' THEN 'removed'
			END
			AND `e`.`created_at` = `moderation_events`.`created_at`
	);
