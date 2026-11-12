/**
 * footer — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Locale, Translation } from "./types";
import { fr } from "./locales/fr/footer";
import { de } from "./locales/de/footer";
import { es } from "./locales/es/footer";
import { pt } from "./locales/pt/footer";

export const en = {
  landmarkLabel: "Site footer",
  // The footer groups the public routes by task. Legal documents remain
  // available in a native disclosure so they are easy to reach without
  // competing with the primary paths through the site.
  navigation: "Site navigation",
  homeAria: "OpenSurveillanceDB home",
  tagline: "An open database of public surveillance cameras, built for transparency, not tracking.",
  toolMap: "Map",
  toolDirectory: "Directory",
  toolReport: "Report",
  toolCorrection: "Correct",
  exploreGroup: "Explore",
  contributeGroup: "Contribute",
  projectGroup: "The project",
  legalGroup: "Legal information",
  manifesto: "Manifesto",
  rules: "Rules",
  moderation: "Moderation",
  apiDocs: "Public API",
  guide: "Guide",
  privacy: "Privacy",
  terms: "Terms of use",
  licenses: "Licenses",
  // The dedicated /fonti page contains both the public-data attribution and
  // the methodology used to collect and correct records.
  sources: "Method & sources",
  faq: "FAQ",
  contact: "Contact",
  accessibility: "Accessibility statement",
  dataLicense: "Database and exports licensed under ODbL 1.0",
  osmAttribution: "Map data © OpenStreetMap contributors",
} as const;

export const it: Translation<typeof en> = {
  landmarkLabel: "Piè di pagina del sito",
  // Il footer raggruppa le route pubbliche per compito. I documenti legali
  // restano disponibili in una disclosure nativa, senza competere con i
  // percorsi principali del sito.
  navigation: "Navigazione del sito",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  tagline: "Un database aperto delle telecamere di sorveglianza pubblica, creato per la trasparenza, non per il tracciamento.",
  toolMap: "Mappa",
  toolDirectory: "Elenco",
  toolReport: "Segnala",
  toolCorrection: "Correggi",
  exploreGroup: "Esplora",
  contributeGroup: "Contribuisci",
  projectGroup: "Il progetto",
  legalGroup: "Informazioni legali",
  manifesto: "Manifesto",
  rules: "Regole",
  moderation: "Moderazione",
  apiDocs: "API pubblica",
  guide: "Guida",
  privacy: "Privacy",
  terms: "Termini d'uso",
  licenses: "Licenze",
  // La pagina /fonti riunisce attribuzione dei dataset pubblici e metodo
  // usato per raccogliere e correggere le segnalazioni.
  sources: "Metodo e fonti",
  faq: "FAQ",
  contact: "Contatti",
  accessibility: "Dichiarazione di accessibilità",
  dataLicense: "Database ed esportazioni concessi in licenza ODbL 1.0",
  osmAttribution: "Dati cartografici © OpenStreetMap contributors",
};

/**
 * This domain only, in every locale — what client components import (via
 * `useDomainMessages`, app/lib/use-messages.ts) instead of the aggregated
 * `messages` map, which would ship EVERY domain in BOTH locales.
 */
export const footerByLocale: Record<Locale, Translation<typeof en>> = { en, it, fr, de, es, pt };
