-- Coordinate lookup index for the proximity searches (audit gap t_2ee58c08).
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
--
-- findNearbyPublicCameras / searchPublicCamerasNear now pre-filter with a
-- bounding box (latitude BETWEEN ... AND ... AND longitude BETWEEN ... AND ...)
-- before the exact haversine pass in JS. D1 has no spatial index; this
-- composite index makes the box a selective filter instead of a full scan,
-- dropping the candidate set from O(N) to O(box) per request.
CREATE INDEX `cameras_coordinates_idx` ON `cameras` (`latitude`, `longitude`);
