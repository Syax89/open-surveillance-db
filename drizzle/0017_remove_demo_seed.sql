-- Remove the local-prototype demo identities before any public-alpha
-- deployment with real authentication (ADR 0009 decision 1, ADR 0014
-- decision 1: the "Demo *" reviewers and the @osdb.test demo users "MUST be
-- removed (or replaced by real provisioned accounts) before any public-alpha
-- deployment").
--
-- This is the LAST migration and is deliberately guarded: it deletes ONLY
-- rows that are still the demo seed and have not been repurposed or
-- referenced by real activity.
--
--   1. A demo reviewer linked to a REAL user account has been provisioned in
--      place (ADR 0014: "provisioning a real reviewer replaces a demo row"):
--      the link is kept and the row is NOT deleted.
--   2. A demo reviewer/user referenced by real moderation activity
--      (moderation_queue, the append-only moderation_events audit trail, or
--      moderation_appeals) is NOT deleted — removing it would orphan or
--      corrupt real audit data. On a fresh database nothing references them,
--      so every demo row is removed (the db-migration-smoke test asserts it).
--
-- Real accounts are created with `scripts/provision-alpha-accounts.mjs`
-- (PROVISION_ACCOUNTS env, documented in docs/DEPLOYMENT.md) before the
-- alpha DB is opened to the public.

--> statement-breakpoint
-- 1. Unlink demo reviewer profiles from demo user accounts so the user rows
--    can be deleted without violating reviewers.user_id. Demo reviewers
--    linked to a REAL user keep their link (they are provisioned accounts
--    and are not deleted in step 2).
UPDATE `reviewers`
SET `user_id` = NULL
WHERE `display_name` LIKE 'Demo %'
  AND `user_id` IN (SELECT `id` FROM `users` WHERE `email` LIKE '%@osdb.test');

--> statement-breakpoint
-- 2. Remove demo reviewer profiles that are still pure seed (unlinked or
--    still pointing at a demo user) and are not referenced by any real
--    moderation activity.
DELETE FROM `reviewers`
WHERE `display_name` LIKE 'Demo %'
  AND (
    `user_id` IS NULL
    OR `user_id` IN (SELECT `id` FROM `users` WHERE `email` LIKE '%@osdb.test')
  )
  AND NOT EXISTS (SELECT 1 FROM `moderation_queue` q WHERE q.assignee_id = reviewers.id OR q.second_reviewer_id = reviewers.id)
  AND NOT EXISTS (SELECT 1 FROM `moderation_events` e WHERE e.reviewer_id = reviewers.id OR e.second_reviewer_id = reviewers.id)
  AND NOT EXISTS (SELECT 1 FROM `moderation_appeals` a WHERE a.decided_by = reviewers.id);

--> statement-breakpoint
-- 3. Remove demo user accounts (@osdb.test demo domain) unless referenced by
--    an appeal or by a surviving (real) reviewer profile.
DELETE FROM `users`
WHERE `email` LIKE '%@osdb.test'
  AND NOT EXISTS (SELECT 1 FROM `moderation_appeals` a WHERE a.appellant_id = users.id)
  AND NOT EXISTS (SELECT 1 FROM `reviewers` r WHERE r.user_id = users.id);
