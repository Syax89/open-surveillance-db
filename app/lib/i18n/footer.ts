/**
 * footer — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  landmarkLabel: "Site footer",
  navigation: "Institutional pages",
  homeAria: "OpenSurveillanceDB home",
  tagline: "An open database of public surveillance cameras, built for transparency, not tracking.",
  manifesto: "Manifesto",
  rules: "Rules",
  guide: "Guide",
  privacy: "Privacy",
  terms: "Terms of use",
  licenses: "Licenses",
  faq: "FAQ",
  contact: "Contact",
  dataLicense: "Database and exports licensed under ODbL 1.0",
  osmAttribution: "Map data © OpenStreetMap contributors",
} as const;

export const it: Translation<typeof en> = {
  landmarkLabel: "Piè di pagina del sito",
  navigation: "Pagine istituzionali",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  tagline: "Un database aperto delle telecamere di sorveglianza pubblica, creato per la trasparenza, non per il tracciamento.",
  manifesto: "Manifesto",
  rules: "Regole",
  guide: "Guida",
  privacy: "Privacy",
  terms: "Termini d'uso",
  licenses: "Licenze",
  faq: "FAQ",
  contact: "Contatti",
  dataLicense: "Database ed esportazioni concessi in licenza ODbL 1.0",
  osmAttribution: "Dati cartografici © OpenStreetMap contributors",
};
