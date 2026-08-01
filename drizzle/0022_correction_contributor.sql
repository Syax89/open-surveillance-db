-- Community corrections attribution (ADR 0018 §6.1, C1): the nullable
-- `correction_requests.contributor_id` column.
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test harness.
-- Declared in db/schema.ts so drizzle-kit generate never re-emits it
-- (convention 0012/0014: hand-written migration + schema declaration together).
--
-- NULL = anonymous report (anonymous reports stay possible, reporter
-- privacy). The column is NEVER ON DELETE CASCADE: de-attribution is explicit
-- in eraseContributor (ADR 0018 §6.2), exactly like `cameras.contributor_id`
-- (ADR 0013). The (contributor_id) index serves the profile's "my
-- corrections" list.

ALTER TABLE `correction_requests` ADD COLUMN `contributor_id` integer REFERENCES `contributors`(`id`);
--> statement-breakpoint
CREATE INDEX `correction_requests_contributor_idx` ON `correction_requests` (`contributor_id`);
