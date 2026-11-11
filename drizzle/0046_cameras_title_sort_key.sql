-- Natural (numeric-aware) "alphabetical" order for the public directory.
--
-- `ORDER BY title COLLATE NOCASE` is lexicographic: "Telecamera 1, 10, 100,
-- 101, …, 2". D1 cannot register a custom SQLite collation, so the order is
-- served from a precomputed key, `title_sort_key` = titleSortKey(title)
-- (app/lib/title-sort-key.ts): ASCII case fold (A-Z -> a-z, like NOCASE) and
-- every run of ASCII digits left-padded with zeros to 10 characters (runs of
-- 10+ digits are kept as-is). Every write path that writes `title` also
-- writes the key (submissions, owner edits, approved edit requests, import
-- runner); this migration backfills the existing rows with the SAME function
-- implemented as a recursive CTE (tests/title-sort-key.test.mjs asserts the
-- SQL and JS keys match).
--
-- Hand-written body (the column + index are declared in db/schema.ts, so
-- drizzle-kit generate stays a no-op — convention 0012/0014). Never rename
-- or delete 0046 once applied anywhere: wrangler journals by filename.
ALTER TABLE `cameras` ADD `title_sort_key` text;
--> statement-breakpoint
-- Backfill, fast path: titles with no digit and only printable ASCII need no
-- padding, and lower() on ASCII is exactly the A-Z fold (with or without ICU).
UPDATE `cameras` SET `title_sort_key` = lower(`title`)
 WHERE `title` NOT GLOB '*[0-9]*' AND `title` NOT GLOB '*[^ -~]*';
--> statement-breakpoint
-- Backfill, general path: walk the remaining titles one character at a time.
-- `digits` buffers the current digit run; it is flushed (padded) when a
-- non-digit character arrives and once more at the end of the string.
CREATE TABLE `_title_sort_key_backfill` AS
WITH RECURSIVE walk(id, rest, digits, out) AS (
  SELECT id, title, '', '' FROM cameras WHERE title_sort_key IS NULL
  UNION ALL
  SELECT
    id,
    substr(rest, 2),
    CASE WHEN substr(rest, 1, 1) GLOB '[0-9]' THEN digits || substr(rest, 1, 1) ELSE '' END,
    CASE
      WHEN substr(rest, 1, 1) GLOB '[0-9]' THEN out
      ELSE out
        || CASE WHEN digits = '' THEN '' WHEN length(digits) >= 10 THEN digits ELSE substr('0000000000' || digits, -10) END
        || CASE WHEN substr(rest, 1, 1) BETWEEN 'A' AND 'Z' THEN lower(substr(rest, 1, 1)) ELSE substr(rest, 1, 1) END
    END
  FROM walk
  WHERE rest <> ''
)
SELECT
  id,
  out || CASE WHEN digits = '' THEN '' WHEN length(digits) >= 10 THEN digits ELSE substr('0000000000' || digits, -10) END AS sort_key
FROM walk
WHERE rest = '';
--> statement-breakpoint
UPDATE `cameras`
   SET `title_sort_key` = (SELECT sort_key FROM `_title_sort_key_backfill` b WHERE b.id = `cameras`.id)
 WHERE `title_sort_key` IS NULL;
--> statement-breakpoint
DROP TABLE `_title_sort_key_backfill`;
--> statement-breakpoint
-- Safety net for any INSERT that does not supply the key (raw SQL seeds such
-- as scripts/demo-cameras.sql, ad-hoc wrangler d1 execute): fall back to the
-- case-folded title so the row still sorts sensibly instead of first (NULL).
-- Application write paths always supply the full natural key.
CREATE TRIGGER `cameras_title_sort_key_insert_fallback`
AFTER INSERT ON `cameras`
WHEN NEW.`title_sort_key` IS NULL
BEGIN
  UPDATE `cameras` SET `title_sort_key` = lower(NEW.`title`) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE INDEX `cameras_title_sort_key_idx` ON `cameras` (`title_sort_key`, `id` DESC);
