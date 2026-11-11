// Import the locale registry from ./i18n/types (constants only) — NOT from
// ./i18n, whose index pulls every language's full message bundle into each
// chunk that merely formats a date.
import { DEFAULT_LOCALE, LOCALE_BCP47, type Locale } from "./i18n/types";

/**
 * Shared date formatting for the public UI (P2, review round 2).
 *
 * The API stores ISO-8601 timestamps (`record.updated`, revision
 * `createdAt`, …); the public pages used to render them raw. This helper
 * formats a parseable ISO value as a localized date (the same long-form
 * style the record history uses) and leaves non-parseable strings — like
 * the prototype seed's "Demo data" — untouched, so no rendering regresses.
 *
 * The BCP 47 tag comes from the locale registry (LOCALE_BCP47 built from
 * SUPPORTED_LOCALES): no hardcoded it-IT/en-GB ternary, and a new
 * language gets its tag automatically.
 *
 * Performance: `Date#toLocaleDateString` builds a fresh Intl.DateTimeFormat
 * on EVERY call (measured ~93 ms for 2,000 popups on a phone vs ~1 ms with a
 * reused formatter). One formatter is cached per BCP 47 tag — the options
 * are fixed, so the tag alone is the cache key.
 */
// timeZone UTC: the record page is now server-rendered (Worker = UTC) and
// hydrated in the visitor's browser. Without a fixed zone the same value
// formats to a different calendar day on either side (e.g. a date-only
// "2026-03-05" is 4 March in New York; 23:30Z is 6 March in Rome) → a
// hydration text mismatch and a full client re-render. The stored values are
// calendar days / UTC timestamps, so UTC is also the correct reading.
const PUBLIC_DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
const formatters = new Map<string, Intl.DateTimeFormat>();

/** The cached long-date formatter for a locale (exported for the reuse test). */
export function publicDateFormatter(locale: Locale): Intl.DateTimeFormat {
  const tag = LOCALE_BCP47[locale] ?? LOCALE_BCP47[DEFAULT_LOCALE];
  let formatter = formatters.get(tag);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(tag, PUBLIC_DATE_OPTIONS);
    formatters.set(tag, formatter);
  }
  return formatter;
}

export function formatPublicDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return publicDateFormatter(locale).format(date);
}
