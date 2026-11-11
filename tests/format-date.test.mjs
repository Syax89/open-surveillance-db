/**
 * formatPublicDate perf contract (profiling pass: 2,000 popup dates cost
 * ~93 ms with a fresh Intl.DateTimeFormat per call vs ~1 ms reused):
 *
 *   - the output is byte-identical to the previous toLocaleDateString path
 *     for every supported locale (and the non-ISO / empty passthroughs);
 *   - ONE Intl.DateTimeFormat is constructed per locale and reused;
 *   - the module reads the locale registry from i18n/types, never the i18n
 *     index (which drags every language's message bundle into the chunk).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before } from "node:test";
import { loadDomModule } from "./helpers/dom-harness.mjs";

let formatPublicDate;
let publicDateFormatter;
let SUPPORTED_LOCALES;
let LOCALE_BCP47;

const RealDateTimeFormat = Intl.DateTimeFormat;
let constructed = 0;

before(async () => {
  // Count every construction from here on (the module builds lazily).
  Intl.DateTimeFormat = function CountingDateTimeFormat(...args) {
    constructed += 1;
    return new RealDateTimeFormat(...args);
  };
  Intl.DateTimeFormat.prototype = RealDateTimeFormat.prototype;
  ({ formatPublicDate, publicDateFormatter } = await loadDomModule("app/lib/format-date.mjs"));
  ({ SUPPORTED_LOCALES, LOCALE_BCP47 } = await loadDomModule("app/lib/i18n/types.mjs"));
});

const SAMPLES = ["2026-01-05T10:00:00Z", "2025-12-31", "2024-02-29T23:59:59.000Z"];

test("output is unchanged (same as Date#toLocaleDateString) for every locale", () => {
  for (const { code } of SUPPORTED_LOCALES) {
    for (const value of SAMPLES) {
      const expected = new Date(value).toLocaleDateString(LOCALE_BCP47[code], { day: "numeric", month: "long", year: "numeric" });
      assert.equal(formatPublicDate(value, code), expected, `${code} ${value}`);
    }
  }
  assert.equal(formatPublicDate("Demo data", "en"), "Demo data", "non-parseable strings pass through");
  assert.equal(formatPublicDate("", "en"), "");
  assert.equal(formatPublicDate(null, "en"), "");
  assert.equal(formatPublicDate(undefined, "en"), "");
});

test("one Intl.DateTimeFormat per locale is built and reused across calls", () => {
  const before = constructed;
  for (let i = 0; i < 500; i += 1) {
    for (const { code } of SUPPORTED_LOCALES) formatPublicDate(SAMPLES[i % SAMPLES.length], code);
  }
  assert.equal(constructed - before, 0, "every formatter was already cached by the first test");
  assert.ok(constructed <= SUPPORTED_LOCALES.length, `at most one formatter per locale (built ${constructed})`);
  for (const { code } of SUPPORTED_LOCALES) {
    assert.equal(publicDateFormatter(code), publicDateFormatter(code), `${code}: the same instance is returned`);
  }
});

test("format-date imports the locale constants from i18n/types, not the bundle index", () => {
  const source = readFileSync(new URL("../app/lib/format-date.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\/i18n\/types"/);
  assert.doesNotMatch(source, /from "\.\/i18n"/);
});
