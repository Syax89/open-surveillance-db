/**
 * Shared i18n types.
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

/** Supported interface locales. English is the default and pilot language. */
export type Locale = "en" | "it";
