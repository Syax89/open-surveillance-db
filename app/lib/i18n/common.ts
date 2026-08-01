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
  // Tool-route shared nav (F1 route group (tools)): every tool page links
  // the other public tools plus the home — no dead ends between the four
  // tools (docs/FRONTEND_DESIGN.md §2.5). The per-page link SET is chosen by
  // ToolLayout (F3 t_2ca69725); the labels live here so both the tool chrome
  // and (via footer.ts's own copies) the global footer stay in sync.
  toolNavigation: "Tool navigation",
  toolHomeAria: "OpenSurveillanceDB home",
  toolMap: "Map",
  toolDirectory: "Directory",
  toolReport: "Report",
  toolCorrection: "Correct",
  toolGuide: "Guide",
  toolRules: "Rules",
  toolContact: "Contact",
  toolHome: "Home",
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
  // Navigazione condivisa delle route tool (F1 route group (tools)): ogni
  // pagina tool collega gli altri tool pubblici più la home — nessun vicolo
  // cieco tra i quattro tool (docs/FRONTEND_DESIGN.md §2.5). Il set di link
  // per pagina è scelto da ToolLayout (F3 t_2ca69725); le label vivono qui
  // così sia la chrome tool sia (via le copie in footer.ts) il footer globale
  // restano allineati.
  toolNavigation: "Navigazione strumenti",
  toolHomeAria: "Pagina iniziale di OpenSurveillanceDB",
  toolMap: "Mappa",
  toolDirectory: "Elenco",
  toolReport: "Segnala",
  toolCorrection: "Correggi",
  toolGuide: "Guida",
  toolRules: "Regole",
  toolContact: "Contatti",
  toolHome: "Home",
};
