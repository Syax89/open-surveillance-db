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
 */
import { en as commonEn, it as commonIt } from "./common";
import { en as mapEn, it as mapIt } from "./map";
import { en as directoryEn, it as directoryIt } from "./directory";
import { en as reportEn, it as reportIt } from "./report";
import { en as correctionEn, it as correctionIt } from "./correction";
import { en as statusEn, it as statusIt } from "./status";
import { en as homeEn, it as homeIt } from "./home";
import { en as guideEn, it as guideIt } from "./guide";
import { en as manifestoEn, it as manifestoIt } from "./manifesto";
import { en as moderazioneEn, it as moderazioneIt } from "./moderazione";
import { en as faqEn, it as faqIt } from "./faq";
import { en as contactEn, it as contactIt } from "./contact";
import { en as rulesEn, it as rulesIt } from "./rules";
import { en as recordEn, it as recordIt } from "./record";
import { en as moderationEn, it as moderationIt } from "./moderation";
import { en as authEn, it as authIt } from "./auth";
import { en as communityEn, it as communityIt } from "./community";
import { en as errorsEn, it as errorsIt } from "./errors";
import { en as footerEn, it as footerIt } from "./footer";
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

export const en = {
  common: commonEn,
  map: mapEn,
  directory: directoryEn,
  report: reportEn,
  correction: correctionEn,
  status: statusEn,
  home: homeEn,
  guide: guideEn,
  manifesto: manifestoEn,
  moderazione: moderazioneEn,
  faq: faqEn,
  contact: contactEn,
  rules: rulesEn,
  record: recordEn,
  moderation: moderationEn,
  auth: authEn,
  community: communityEn,
  errors: errorsEn,
  footer: footerEn,
} as const;

export const it: Translation<typeof en> = {
  common: commonIt,
  map: mapIt,
  directory: directoryIt,
  report: reportIt,
  correction: correctionIt,
  status: statusIt,
  home: homeIt,
  guide: guideIt,
  manifesto: manifestoIt,
  moderazione: moderazioneIt,
  faq: faqIt,
  contact: contactIt,
  rules: rulesIt,
  record: recordIt,
  moderation: moderationIt,
  auth: authIt,
  community: communityIt,
  errors: errorsIt,
  footer: footerIt,
};

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
