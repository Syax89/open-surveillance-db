// Natural sort key for camera titles — plain-JS twin of
// app/lib/title-sort-key.ts (the import runner cannot import TypeScript).
// See that file for the contract; tests/title-sort-key.test.mjs asserts both
// implementations (and the SQL backfill of migration 0047) agree.

export const TITLE_SORT_DIGIT_WIDTH = 10;

/** @param {string} title */
export function titleSortKey(title) {
  return title
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[0-9]+/g, (digits) => (digits.length >= TITLE_SORT_DIGIT_WIDTH ? digits : digits.padStart(TITLE_SORT_DIGIT_WIDTH, "0")));
}
