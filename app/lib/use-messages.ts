"use client";

import { useLocale } from "../components/LocaleProvider";
import { messages } from "./i18n";
import type { MessageBundle } from "./i18n";

/**
 * Typed message bundle for the current locale (English pilot, Italian parity).
 *
 * Lives OUTSIDE LocaleProvider (F5 qa#5, t_ab0d4c75) so the root layout
 * graph can mount LocaleProvider without pulling the full two-locale
 * dictionary (~150 KB) into the initial JS chunk. Components that render
 * translated strings import `useMessages` from here; the root shell
 * (skip link, footer) imports its domain file directly instead.
 */
export function useMessages(): MessageBundle {
  const { locale } = useLocale();
  return messages[locale];
}
