/**
 * i18n entry point.
 *
 * `messages` maps every `Locale` to its message bundle. English is the
 * pilot language: each domain file (e.g. `home.ts`, `auth.ts`) defines the
 * canonical EN key set for its namespace, and its IT counterpart is
 * type-checked against it via `Translation<typeof en>` (see `types.ts`).
 *
 * The assembled `messages` shape is the public API — client components
 * consume it through `useMessages()`:
 *   const { locale } = useLocale();
 *   const t = messages[locale].home;
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
import { en as footerEn, it as footerIt } from "./footer";
import type { Locale, Translation } from "./types";

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
  footer: footerIt,
};

export const messages = { en, it } as const;

export type MessageBundle = Translation<typeof en>;
export type { Locale, Translation };

/**
 * Cookie name used to persist the interface locale server-side.
 *
 * The client toggle writes the same value to `localStorage` (multi-tab sync,
 * see LocaleProvider) and to this cookie; server components read the cookie
 * to render the correct bundle and <html lang> (SSR/SEO, task t_c36fe96c).
 * The cookie is a pure preference, never a tracker: no personal data.
 */
export const LOCALE_COOKIE = "opensurveillancedb-locale";
