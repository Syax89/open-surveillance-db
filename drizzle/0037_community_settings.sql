-- ADR 0021 community-driven pivot — FASE 1 (kanban t_4a7469bb):
-- tunable community configuration, no deploy (ADR 0021 §5). Every
-- threshold, weight, quota and cooldown of the pivot is a key; `value` is a
-- JSON TEXT blob (a bare JSON number, or an object like `weights.byLevel`).
--
-- This migration CREATES the table AND seeds the ADR's defaults so config
-- and code agree at first boot (the code fallback lives in
-- db/community-settings.ts — DEFAULT_COMMUNITY_SETTINGS — so a missing row
-- can never fail an evaluation). All numbers below are verbatim from
-- ADR 0021 decision 4/5; `rateLimit.actionPerMinute` is not fixed by the
-- ADR, so the seeded value is the operator-tunable default and MUST stay in
-- sync with the code default.
--
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test
-- harness. Declared in db/schema.ts so drizzle-kit generate never re-emits
-- it (convention 0012/0014).

CREATE TABLE `community_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `community_settings` (`key`, `value`, `updated_at`) VALUES
	('weights.byLevel', '{"L0":0.25,"L1":1,"L2":2,"L3":3,"L4":5}', '2026-08-04T00:00:00.000Z'),
	('thresholds.gone', '3', '2026-08-04T00:00:00.000Z'),
	('thresholds.goneMinDistinct', '3', '2026-08-04T00:00:00.000Z'),
	('thresholds.problem', '3', '2026-08-04T00:00:00.000Z'),
	('thresholds.problemMinDistinct', '2', '2026-08-04T00:00:00.000Z'),
	('thresholds.privacy', '1', '2026-08-04T00:00:00.000Z'),
	('thresholds.restoreFromRemoved', '3', '2026-08-04T00:00:00.000Z'),
	('thresholds.restoreFromHidden', '5', '2026-08-04T00:00:00.000Z'),
	('thresholds.restoreMinDistinctFromRemoved', '2', '2026-08-04T00:00:00.000Z'),
	('thresholds.restoreMinDistinctFromHidden', '3', '2026-08-04T00:00:00.000Z'),
	('cooldown.privacyHiddenDays', '7', '2026-08-04T00:00:00.000Z'),
	('quotas.actionsPerDay', '20', '2026-08-04T00:00:00.000Z'),
	('quotas.actionsPerDayTrusted', '40', '2026-08-04T00:00:00.000Z'),
	('quotas.perRecordPerDay', '5', '2026-08-04T00:00:00.000Z'),
	('rateLimit.actionPerMinute', '10', '2026-08-04T00:00:00.000Z');
