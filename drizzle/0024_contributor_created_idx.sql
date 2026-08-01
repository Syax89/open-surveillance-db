-- Community profile contributions list (ADR 0018 §3/§6.1, C2): the
-- (contributor_id, created_at DESC) indexes that turn the profile list
-- `ORDER BY created_at DESC` into an index scan instead of a full table
-- scan.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Today `listContributorSubmissions` runs `WHERE contributor_id = ? ORDER BY
-- created_at DESC LIMIT 50` with no contributor-leading index (full scan).
-- C2 replaces it with a paginated three-table list
-- (cameras / correction_requests / photos, COMMUNITY_PLAN §2.3); each branch
-- filters on contributor_id and orders by created_at DESC, so every branch
-- gets its own leading-contributor composite. correction_requests already
-- carries a (contributor_id) index from migration 0022 — its per-contributor
-- volume is small and the equality seek is enough there. Photos previously
-- had NO contributor index at all (only the pending-quota partial on
-- submitter_key), so the profile "my photos" branch would otherwise be a
-- full scan.

CREATE INDEX `cameras_contributor_created_idx` ON `cameras` (`contributor_id`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `photos_contributor_created_idx` ON `photos` (`contributor_id`, `created_at` DESC);
