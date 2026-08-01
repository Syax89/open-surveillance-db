-- Community trust levels (ADR 0018 §3, C1): the `(contributor_id, status)`
-- index that turns the level COUNT into an index-only seek.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- Level = COUNT(cameras WHERE contributor_id = ? AND status = 'verified') —
-- only verified records count, never pending/rejected/removed. The
-- contributor_id leading column serves the equality filter and status the
-- equality on 'verified', so the whole COUNT is covered by the index.

CREATE INDEX `cameras_contributor_status_idx` ON `cameras` (`contributor_id`, `status`);
