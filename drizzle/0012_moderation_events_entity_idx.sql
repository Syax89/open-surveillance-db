-- Audit-trail lookup index (backend gap, AUDIT BACKEND t_2ee58c08).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
--
-- listPublicCameraRevisions(cameraId) (db/moderation.ts) filters the
-- append-only audit trail with
--   WHERE entity = 'camera' AND entity_id = ?
-- and moderateCamera/moderateCorrection repeat the same predicate for the
-- second-reviewer lookup. Before this index the only index on the table was
-- moderation_events_created_at_idx (created_at, id), so every revision read
-- and every second-review check was a full scan of the audit trail.
--
-- The (entity, entity_id) leading order serves both the equality predicate
-- and, via the implicit trailing rowid, the ORDER BY created_at ASC, id ASC
-- done per entity in JS-free SQL (the sort is applied on the small per-entity
-- result set, not the whole table).

CREATE INDEX `moderation_events_entity_idx` ON `moderation_events` (`entity`, `entity_id`);
