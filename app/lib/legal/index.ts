/**
 * Legal content entry point.
 *
 * `legalMessages` maps every registered `Locale` (SUPPORTED_LOCALES) to
 * its legal content bundle. English is the pilot language (see `en.ts`);
 * the Italian bundle is pinned to the same `LegalContent` type, so `tsc`
 * enforces parity the same way it does for the UI message bundles
 * (ADR 0007).
 *
 * The exported map is DERIVED from the registry (Object.fromEntries over
 * SUPPORTED_LOCALES): it can never drift from the supported-language
 * list. A new language needs its legal bundle (1 file) + a `legalSources`
 * entry here + the registry line — see docs/DEVELOPMENT_SETUP.md §
 * "Aggiungere una lingua".
 *
 * Usage in client components:
 *   const { locale } = useLocale();
 *   <LegalPage content={legalMessages[locale].privacy} />
 */
import { enLegal } from "./en";
import { itLegal } from "./it";
import { SUPPORTED_LOCALES } from "../i18n/types";
import type { Locale } from "../i18n/types";
import type { LegalContent } from "./types";

const legalSources = { en: enLegal, it: itLegal } as const;

/** Legal content keyed exactly by the registry — never by hand. */
export const legalMessages = Object.fromEntries(
  SUPPORTED_LOCALES.map(({ code }) => [code, legalSources[code]]),
) as Record<Locale, LegalContent>;

export type { LegalContent, LegalPageContent, LegalSection, LegalBlock } from "./types";
export type { Locale };
