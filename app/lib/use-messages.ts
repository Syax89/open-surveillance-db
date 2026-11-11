"use client";

import { useLocale } from "../components/LocaleProvider";
import { messages } from "./i18n";
import type { MessageBundle } from "./i18n";

/**
 * Full message bundle (every domain) for the current locale.
 *
 * @deprecated JS size: this pulls the aggregated two-locale dictionary
 * (~170 KB, every domain) into the chunk of whoever imports it. New and
 * migrated client code uses `useDomainMessages(xxxByLocale)` from
 * ./use-domain-messages, which ships only the domains it renders. The
 * remaining importers are allow-listed in tests/i18n-client-imports.test.mjs
 * (SurveillanceMap, the record pages) pending their migration; the list
 * there may only shrink.
 */
export function useMessages(): MessageBundle {
  const { locale } = useLocale();
  return messages[locale];
}
