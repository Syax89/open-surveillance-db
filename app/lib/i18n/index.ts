/**
 * i18n entry point.
 *
 * `messages` maps every `Locale` to its message bundle. English is the
 * pilot language (see `en.ts`): it defines the canonical key set, and the
 * Italian bundle is type-checked against it via `Translation<typeof en>`.
 *
 * Usage in client components:
 *   const { locale } = useLocale();
 *   const t = messages[locale].home;
 */
import { en } from "./en";
import { it } from "./it";
import type { Locale, Translation } from "./types";

export const messages = { en, it } as const;

export type MessageBundle = Translation<typeof en>;
export type { Locale, Translation };
