/**
 * i18n entry point.
 *
 * `messages` maps every registered `Locale` (SUPPORTED_LOCALES) to its
 * message bundle. English is the pilot language: each domain file (e.g.
 * `home.ts`, `auth.ts`) defines the canonical EN key set for its
 * namespace, and its IT counterpart is type-checked against it via
 * `Translation<typeof en>` (see `types.ts`).
 *
 * The assembled `messages` shape is the public API — client components
 * consume it through `useMessages()`:
 *   const { locale } = useLocale();
 *   const t = messages[locale].home;
 *
 * `messages` is DERIVED from the registry (Object.fromEntries over
 * SUPPORTED_LOCALES): it can never drift from the supported-language
 * list. Adding a language = one bundle + one registry line (+ the
 * mechanical import/entry below) — see docs/DEVELOPMENT_SETUP.md §
 * "Aggiungere una lingua".
 *
 * Bundle splitting (F5 qa#5, t_ab0d4c75): the two per-locale assemblies
 * live in `./bundles/{en,it}.ts`. The ROOT layout graph must NOT import
 * `messages` (both locales, every domain): it imports only the domain
 * files it renders (`common` in LocaleProvider, `footer` in SiteFooter),
 * so the ~150 KB dictionary leaves the initial JS chunk. `useMessages()`
 * (app/lib/use-messages.ts) pulls the full map into the chunks that
 * actually translate on the client.
 */
import { en } from "./bundles/en";
import { it } from "./bundles/it";
import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  isLocale,
  resolveLocale,
  type Locale,
  type LocaleInfo,
  type Translation,
} from "./types";

/**
 * Per-language assembled bundles, keyed by locale code. `en` is the pilot
 * and defines the canonical shape; `it` is parity-checked against it.
 * A new language's bundle (single file, `Translation<typeof en>`) is
 * attached here with one import + one line — the registry line in
 * types.ts is what actually announces it to the product.
 */
const bundleSources = { en, it } as const;

/** Messages keyed exactly by the registry — never by hand. */
export const messages = Object.fromEntries(
  SUPPORTED_LOCALES.map(({ code }) => [code, bundleSources[code]]),
) as Record<Locale, MessageBundle>;

export type MessageBundle = Translation<typeof en>;
export type { Locale, LocaleInfo, Translation };
export { DEFAULT_LOCALE, LOCALE_BCP47, LOCALE_COOKIE, SUPPORTED_LOCALES, isLocale, resolveLocale };
