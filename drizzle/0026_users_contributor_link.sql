-- Explicit contributor→users identity link (audit t_5ca60ab2, P2): the
-- only attribution path from a contributor session to a `users` role
-- identity. Previously the appeals route bridged the two stores by email
-- equality (getUserByEmail(session.contributor.email)), which is spoofable:
-- anyone could register a contributor account with an email matching an
-- existing `users` row (e.g. a moderator's) and file appeals attributed to
-- that identity. The link is provisioned by ops (provision-alpha-accounts);
-- registration itself never creates a `users` row, so an unprovisioned
-- contributor is 401 on the appeals route.
--
-- Like cameras.contributor_id there is NO ON DELETE action: severance is
-- explicit, inside eraseContributor (UPDATE users SET contributor_id = NULL
-- before the contributor row is deleted), so a role identity is unlinked
-- but never deleted by account erasure.
--
-- Hand-written migration following the journal convention; applied by
-- `wrangler d1 migrations apply` and replayed by the db-runtime test
-- harness. Declared in db/schema.ts so drizzle-kit generate never re-emits
-- it (convention 0012/0014: hand-written migration + schema declaration
-- together).

ALTER TABLE `users` ADD `contributor_id` integer REFERENCES contributors(id);--> statement-breakpoint
CREATE UNIQUE INDEX `users_contributor_id_unique` ON `users` (`contributor_id`);
