-- One-time data backfill: verification freshness must be a comparable ISO
-- timestamp for the public directory filters to be meaningful.
--
-- Before this migration, local moderation wrote prose labels into `updated`
-- for verified records ("Local moderation: approved and verified"). Recover
-- the real verification moment from the append-only moderation audit trail
-- (moderation_events.created_at), falling back to the record creation time.
-- Demo records keep their explicit "Demo data" label: they are illustrative
-- and the public freshness filter excludes non-ISO values by design.
--
-- Idempotent: after a run every `verified` row carries an ISO value, so the
-- WHERE clause no longer matches. Guarded on sqlite_master so a fresh database
-- where the runtime-created audit table does not exist yet is unaffected.

UPDATE cameras
SET updated = COALESCE(
  (SELECT MAX(me.created_at)
     FROM moderation_events me
    WHERE me.entity = 'camera'
      AND me.entity_id = cameras.id
      AND me.new_status = 'verified'
      AND me.action IN ('approve', 'reverify')),
  cameras.created_at
)
WHERE cameras.status = 'verified'
  AND cameras.updated NOT GLOB '[0-9][0-9][0-9][0-9]-*'
  AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'moderation_events');
