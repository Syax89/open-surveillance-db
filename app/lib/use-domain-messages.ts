"use client";

import { useLocale } from "../components/LocaleProvider";
import type { Locale } from "./i18n/types";

/**
 * Typed messages of ONE i18n domain for the current locale (English pilot,
 * Italian parity — ADR 0007).
 *
 * Client components pass the domain's `xxxByLocale` map, imported straight
 * from its domain file:
 *
 *   import { homeByLocale } from "../lib/i18n/home";
 *   const t = useDomainMessages(homeByLocale);
 *
 * Per-domain on purpose (JS size): the aggregated `messages` map
 * (app/lib/i18n/index.ts) holds every domain in every locale (~170 KB);
 * importing it from a "use client" module shipped the whole dictionary on
 * nearly every route. Importing only the domain files a component renders
 * lets Vite split each domain into its own small chunk. Both locales of a
 * domain stay in the chunk because the locale switches client-side
 * without a reload (LocaleProvider). `messages` stays the server-side API
 * (app/lib/server-i18n.ts); tests/i18n-client-imports.test.mjs enforces
 * the split.
 */
export function useDomainMessages<T>(byLocale: Record<Locale, T>): T {
  const { locale } = useLocale();
  return byLocale[locale];
}
