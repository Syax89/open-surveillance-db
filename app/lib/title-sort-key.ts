/**
 * Natural (numeric-aware) sort key for camera titles.
 *
 * D1 cannot register custom SQLite collations, so the directory's
 * "alphabetical" order is served from a PRECOMPUTED column,
 * `cameras.title_sort_key` (migration 0046), compared with the default
 * BINARY collation. The key is:
 *
 *   1. ASCII-only case fold (A-Z -> a-z) — the same folding SQLite's NOCASE
 *      applies, so the order stays case-insensitive exactly like the old
 *      `title COLLATE NOCASE`; non-ASCII characters are kept verbatim
 *      (independent of whether the SQLite build has ICU);
 *   2. every run of ASCII digits left-padded with zeros to
 *      TITLE_SORT_DIGIT_WIDTH, so "Telecamera 2" ("telecamera 0000000002")
 *      sorts before "Telecamera 10" ("telecamera 0000000010").
 *
 * Runs longer than the width are kept as-is (numbers past 9,999,999,999 in a
 * title are not a real-world case; they still sort deterministically).
 *
 * KEEP IN SYNC with the two other implementations of this exact function —
 * a parity test (tests/title-sort-key.test.mjs) fails if they ever diverge:
 *   - scripts/import/title-sort-key.mjs (the import runner is plain JS);
 *   - the recursive-CTE backfill in drizzle/0046_cameras_title_sort_key.sql.
 */
export const TITLE_SORT_DIGIT_WIDTH = 10;

export function titleSortKey(title: string): string {
  return title
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[0-9]+/g, (digits) => (digits.length >= TITLE_SORT_DIGIT_WIDTH ? digits : digits.padStart(TITLE_SORT_DIGIT_WIDTH, "0")));
}

/** Comparator matching the server's `ORDER BY title_sort_key ASC, id DESC`. */
export function compareByTitleSortKey(
  first: { title: string; id: number },
  second: { title: string; id: number },
  keyOf: (title: string) => string = titleSortKey,
): number {
  const a = keyOf(first.title);
  const b = keyOf(second.title);
  return a < b ? -1 : a > b ? 1 : second.id - first.id;
}
