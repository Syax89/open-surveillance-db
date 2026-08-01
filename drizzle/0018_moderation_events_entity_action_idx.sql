-- Retention sweep query index + R4 resolution-date anchor (backend gaps from
-- the consolidated PR #87 review, t_ffc829b8).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
--
-- 1. runRetentionSweep (db/retention.ts) resolves the R2 "rejection decision
--    date" with
--      WHERE entity = 'camera' AND action = 'reject'
--      GROUP BY entity_id
--    over the append-only moderation_events audit trail. The existing indexes
--    (moderation_events_created_at_idx (created_at, id), and the 0012
--    (entity, entity_id) lookup) do not serve the action filter, so the query
--    scans the whole audit log once the trail grows (the R2 sweep re-runs it on
--    every daily tick). (entity, action, entity_id) makes the filter an index
--    seek and covers the GROUP BY key without a sort (review t_eed5f080
--    suggestion: widen the index to the group-by column).
--
-- 2. R4 (correction requests) is anchored on the RESOLUTION date, not on
--    created_at: RETENTION_SCHEDULE.md R4 = "2 years, Resolution date" and a
--    created_at anchor purges resolved requests BEFORE the legal floor. The
--    resolved_at column is set by moderateCorrection (db/moderation.ts) when a
--    request reaches a terminal state (approve -> reviewed, reject ->
--    rejected); rows resolved before this migration are backfilled below from
--    their decision event in the audit trail, so the anchor is correct for
--    legacy data too. Backfill is safe: the decision event (entity='correction',
--    action approve/reject) is written in the same flow as the status change,
--    so its created_at IS the resolution date.
--
-- Numbered 0018: main already ships 0017_remove_demo_seed (#115); this
-- migration was previously staged as 0015/0016/0017 but renumbered after the
-- rebase on main (t_0a3a71b0).

ALTER TABLE `correction_requests` ADD COLUMN `resolved_at` text;

UPDATE `correction_requests`
SET `resolved_at` = (
  SELECT MAX(`created_at`)
  FROM `moderation_events`
  WHERE `entity` = 'correction'
    AND `entity_id` = `correction_requests`.`id`
    AND `action` IN ('approve', 'reject')
)
WHERE `status` IN ('reviewed', 'rejected') AND `resolved_at` IS NULL;

CREATE INDEX `moderation_events_entity_action_idx` ON `moderation_events` (`entity`, `action`, `entity_id`);
