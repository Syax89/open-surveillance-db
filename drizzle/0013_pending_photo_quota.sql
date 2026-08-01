-- Pending-photo quota (audit t_2ee58c08, P2): per-caller anti storage-DoS cap.
--
-- `submitter_key` attributes each photo to the caller's pending-quota bucket:
--   - authenticated uploads: `contributor:<contributor_id>`
--   - anonymous uploads:     `anon:<sha256(caller key)>` (the same hashed
--     caller key the rate limiter uses; NEVER the raw IP — see the privacy
--     pattern in app/lib/abuse-alerts.ts)
--
-- The column is internal bookkeeping: it is not part of the public photo
-- projection (photoColumns), so it never reaches API responses. Only
-- `status = 'pending'` rows count toward the quota — approved and rejected
-- photos leave the cap as soon as a moderator decides them.
--
-- Hand-written migration following the journal convention (like 0011);
-- applied by `wrangler d1 migrations apply` and replayed by the db-runtime
-- test harness. The partial index keeps the quota COUNT/SUM cheap: only
-- pending rows are indexed, and decided photos drop out of it automatically.
ALTER TABLE `photos` ADD COLUMN `submitter_key` text;--> statement-breakpoint
CREATE INDEX `photos_pending_submitter_idx` ON `photos` (`submitter_key`) WHERE `status` = 'pending';
