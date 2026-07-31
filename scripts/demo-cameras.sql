-- Optional demo seed: two clearly labelled fictional camera records.
--
-- This is the ONLY place demo data is created. Nothing at runtime inserts
-- these rows: a fresh `npm run db:migrate` produces an empty database and
-- `npm run dev` starts without seeding. Run `npm run db:seed` explicitly
-- when you want the illustrative pins for manual interface checks.
--
-- Idempotent: each INSERT is guarded by WHERE NOT EXISTS, so re-running the
-- seed never duplicates the demo records.

INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, description, created_at)
SELECT 'Illustrative record A', 'Fixed dome', 41.9004, 12.4936, 'demo', 'Prototype seed', 'Demo data',
       'This marker demonstrates how a verified public record will be presented. It is not a claim about a real camera.',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM cameras WHERE title = 'Illustrative record A');

INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, description, created_at)
SELECT 'Illustrative record B', 'Traffic monitoring', 41.9047, 12.5031, 'demo', 'Prototype seed', 'Demo data',
       'The field of view is deliberately approximate and should never be treated as a record of live activity.',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM cameras WHERE title = 'Illustrative record B');
