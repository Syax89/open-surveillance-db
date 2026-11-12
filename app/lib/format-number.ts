// Constants-only locale registry import (see format-date.ts for why).
import { DEFAULT_LOCALE, LOCALE_BCP47, type Locale } from "./i18n/types";

/**
 * Localized integer formatting for public counts ("6,240 public records").
 * One cached Intl.NumberFormat per BCP 47 tag (same reasoning as
 * format-date.ts). Italian CLDR data uses minimumGroupingDigits=2, so
 * four-digit Italian numbers stay ungrouped ("6240") and five-digit ones
 * group ("12.345"): that is correct Italian typography, not a bug.
 */
const formatters = new Map<string, Intl.NumberFormat>();

export function formatCount(value: number, locale: Locale): string {
  const tag = LOCALE_BCP47[locale] ?? LOCALE_BCP47[DEFAULT_LOCALE];
  let formatter = formatters.get(tag);
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
    formatters.set(tag, formatter);
  }
  return formatter.format(value);
}
