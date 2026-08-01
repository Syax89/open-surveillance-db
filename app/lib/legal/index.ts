/**
 * Legal content entry point.
 *
 * `legalMessages` maps every `Locale` to its legal content bundle.
 * English is the pilot language (see `en.ts`); the Italian bundle is
 * pinned to the same `LegalContent` type, so `tsc` enforces parity the
 * same way it does for the UI message bundles (ADR 0007).
 *
 * Usage in client components:
 *   const { locale } = useLocale();
 *   <LegalPage content={legalMessages[locale].privacy} />
 */
import { enLegal } from "./en";
import { itLegal } from "./it";
import type { Locale } from "../i18n/types";

export const legalMessages = { en: enLegal, it: itLegal } as const;

export type { LegalContent, LegalPageContent, LegalSection, LegalBlock } from "./types";
export type { Locale };
