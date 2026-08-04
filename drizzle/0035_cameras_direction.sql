-- Camera field-of-view direction (CEO directive 2026-08-04, kanban
-- t_1b08fe12): `cameras.direction` is the compass bearing in degrees
-- (0-359, clockwise from north; NULL = non-directional / unknown) of a
-- DIRECTIONAL camera, so the map layer can draw a field-of-view triangle.
-- Dome cameras (canonical kind value 'Fixed dome') are never directional
-- and always store NULL — the map renders them circular.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- `camera_edit_requests.proposed_direction` mirrors the editable whitelist
-- for the published-record edit path (ADR 0018 §4): a contributor may
-- propose a direction change and a moderator applies the diff on approve.
-- NULL proposed = column unchanged (same COALESCE model as the other
-- proposed_* columns; the dome rule is re-applied at apply time so a diff
-- that turns the record into a dome always stores NULL).

ALTER TABLE `cameras` ADD COLUMN `direction` integer;
--> statement-breakpoint
ALTER TABLE `camera_edit_requests` ADD COLUMN `proposed_direction` integer;
