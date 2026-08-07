-- DB-lightening (CEO 2026-08-07): composite index for the map bbox reads.
-- The map fetches ONLY the current viewport (listPublicCamerasInBbox*:
-- `WHERE <public predicate> AND latitude BETWEEN ? AND ? AND longitude
-- BETWEEN ? AND ?`). With thousands of rows the existing coordinate
-- index alone would filter by position and then re-check status on every
-- row in the box; this index lets SQLite walk status-first and only scan
-- the coordinates inside the public set.
CREATE INDEX IF NOT EXISTS `cameras_status_coordinates_idx` ON `cameras` (`status`, `latitude`, `longitude`);
--> statement-breakpoint
