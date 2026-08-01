-- C4 report dedupe (COMMUNITY_PLAN §2.4, A5): one open (pending) correction
-- request per (submitter, target), enforced race-safely at the DB level.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
--   - `correction_requests_open_contributor_unique`: a logged-in reporter can
--     have at most one open report per camera (moderation_queue_open_unique
--     pattern, same as camera_edit_requests 0021);
--   - `correction_requests_open_anon_unique`: at most one open ANONYMOUS
--     report per camera (NULLs are distinct in a plain UNIQUE index, so the
--     partial predicate disambiguates). Anonymous reporters are keyed only
--     by "no contributor_id" — no IP or other identifier is ever stored.
--
-- The application layer (db/corrections.ts createCorrectionRequest) performs
-- the same checks with specific 409 reasons; these indexes make concurrent
-- duplicate submissions land exactly one row (ON CONFLICT DO NOTHING).
-- Targetless reports (camera_id NULL) cannot be deduped per-target and stay
-- allowed; the per-IP `submit` rate bucket bounds them (A4).

CREATE UNIQUE INDEX `correction_requests_open_contributor_unique` ON `correction_requests` (`camera_id`, `contributor_id`) WHERE status = 'pending' AND contributor_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `correction_requests_open_anon_unique` ON `correction_requests` (`camera_id`) WHERE status = 'pending' AND contributor_id IS NULL;
