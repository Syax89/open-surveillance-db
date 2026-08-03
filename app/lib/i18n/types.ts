/**
 * Shared i18n types + the locale registry.
 *
 * `Translation<T>` maps an English pilot bundle shape onto a target
 * language:
 *  - functions keep their exact signature (e.g. plural formatters);
 *  - string leaves become plain `string` (the translation's wording);
 *  - nested objects recurse, so nested dictionaries (action labels,
 *    reason codes, status maps) are covered by the same parity guarantee.
 *
 * Because it is a mapped type, assigning an object literal typed
 * `Translation<typeof en>` fails `tsc` when a key is missing or when an
 * unknown key is added: English is the canonical key set for every
 * language bundle.
 */

export type Translation<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends string
      ? string
      : Translation<T[K]>;
};

/**
 * Supported interface locales — the SINGLE source of truth for which
 * languages the product speaks (CEO: "sistema lingue facilmente
 * aggiornabile, in caso aggiungiamo altre").
 *
 * Every other hardcoded en/it point derives from this registry:
 *   - `Locale` is the union of the registered codes (no `"en" | "it"`);
 *   - `messages` (i18n/index.ts) is keyed by these codes;
 *   - `legalMessages` (legal/index.ts) is keyed by these codes;
 *   - the LocaleToggle renders one button per entry (no hardcoded buttons);
 *   - server/API locale resolution goes through `resolveLocale` (no
 *     ternary);
 *   - `bcp47` feeds Intl formatters and `lang` attributes (no it-IT/en-GB
 *     ternaries);
 *   - the transactional email copy is typed `Record<Locale, …>` so a new
 *     language forces a copy block there too.
 *
 * English is the default and pilot language (ADR 0007) and MUST stay the
 * first entry: DEFAULT_LOCALE is derived from SUPPORTED_LOCALES[0].
 *
 * Adding a language: see docs/DEVELOPMENT_SETUP.md § "Aggiungere una
 * lingua" (1 bundle file + 1 registry line + tsc parity).
 */
export const SUPPORTED_LOCALES = [
  { code: "en", label: "EN", bcp47: "en-GB" },
  { code: "it", label: "IT", bcp47: "it-IT" },
] as const;

/** The pilot language — always the first registry entry (ADR 0007). */
export const DEFAULT_LOCALE = SUPPORTED_LOCALES[0].code;

/** Union of the registered locale codes ("en" | "it", …). */
export type Locale = (typeof SUPPORTED_LOCALES)[number]["code"];

/** One registry entry: internal code + toggle label + BCP 47 tag. */
export type LocaleInfo = (typeof SUPPORTED_LOCALES)[number];

/**
 * BCP 47 tag per registered locale, for Intl formatters
 * (toLocaleDateString, toLocaleString) and `lang` attributes. Built from
 * the registry so the it-IT/en-GB ternaries disappear: a new locale gets
 * its tag here automatically.
 */
export const LOCALE_BCP47 = Object.fromEntries(
  SUPPORTED_LOCALES.map(({ code, bcp47 }) => [code, bcp47]),
) as Record<Locale, string>;

/** Runtime guard: is `value` a registered locale code? */
export function isLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.some(({ code }) => code === value);
}

/**
 * Resolve an untrusted string (cookie, query param, localStorage) to a
 * locale, falling back to the pilot language for anything unknown or
 * missing. Registry-driven: no `value === "it" ? "it" : "en"` ternary.
 */
export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Cookie name used to persist the interface locale server-side.
 *
 * The client toggle writes the same value to `localStorage` (multi-tab sync,
 * see LocaleProvider) and to this cookie; server components read the cookie
 * to render the correct bundle and <html lang> (SSR/SEO, task t_c36fe96c).
 * The cookie is a pure preference, never a tracker: no personal data.
 *
 * Lives next to the registry so server/API routes can persist the locale
 * without importing the full message bundles (light import path).
 */
export const LOCALE_COOKIE = "opensurveillancedb-locale";
