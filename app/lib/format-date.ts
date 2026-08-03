import type { Locale } from "./i18n";

/**
 * Shared date formatting for the public UI (P2, review-vera-2).
 *
 * The API stores ISO-8601 timestamps (`record.updated`, revision
 * `createdAt`, …); the public pages used to render them raw. This helper
 * formats a parseable ISO value as a localized date (the same long-form
 * style the record history uses) and leaves non-parseable strings — like
 * the prototype seed's "Demo data" — untouched, so no rendering regresses.
 */
export function formatPublicDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale === "it" ? "it-IT" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
