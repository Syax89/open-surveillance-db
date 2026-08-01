/**
 * common — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  skipLink: "Skip to main content",
  languageSelection: "Language selection",
  // Root-layout metadata (SSR/SEO): the fallback <title>/<description>
  // for every route without its own generateMetadata (home, records, auth
  // pages). Localized via the locale cookie — see ADR 0015.
  metaTitle: "OpenSurveillanceDB — Public data about public surveillance",
  metaDescription:
    "An open, community-maintained database of public surveillance cameras.",
} as const;

export const it: Translation<typeof en> = {
  skipLink: "Vai al contenuto principale",
  languageSelection: "Selezione lingua",
  // Metadata del layout di root (SSR/SEO): <title>/<description> di
  // fallback per le route senza generateMetadata propria (home, records,
  // pagine di autenticazione). Localizzati via cookie di locale — ADR 0015.
  metaTitle: "OpenSurveillanceDB — Dati pubblici sulla sorveglianza pubblica",
  metaDescription:
    "Un database aperto e mantenuto dalla comunità delle telecamere di sorveglianza pubblica.",
};
