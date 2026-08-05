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
  // The footer nav carries the four public tool routes first, then the
  // institutional pages (F3 t_2ca69725, docs/FRONTEND_DESIGN.md §2.5): the
  // tools are never dead ends and every public surface is reachable from
  // every page. The label is therefore "site navigation", not
  // "institutional pages".
  navigation: "Site navigation",
  homeAria: "OpenSurveillanceDB home",
  tagline: "An open database of public surveillance cameras, built for transparency, not tracking.",
  toolMap: "Map",
  toolDirectory: "Directory",
  toolReport: "Report",
  toolCorrection: "Correct",
  manifesto: "Manifesto",
  rules: "Rules",
  guide: "Guide",
  privacy: "Privacy",
  terms: "Terms of use",
  licenses: "Licenses",
  // Imported public datasets (import pipeline FASE C, t_4dbce318): the
  // footer links the dedicated /fonti page (per-source attribution), NOT
  // the main navigation — institutional pages group, next to Licenses.
  sources: "Data sources",
  faq: "FAQ",
  contact: "Contact",
  accessibility: "Accessibility statement",
  dataLicense: "Database and exports licensed under ODbL 1.0",
  osmAttribution: "Map data © OpenStreetMap contributors",
} as const;

export const it: Translation<typeof en> = {
  landmarkLabel: "Piè di pagina del sito",
  // Il nav del footer porta prima le quattro route tool pubbliche, poi le
  // pagine istituzionali (F3 t_2ca69725, docs/FRONTEND_DESIGN.md §2.5): i
  // tool non sono mai vicoli ciechi e ogni superficie pubblica è raggiungibile
  // da ogni pagina. L'etichetta è quindi "navigazione del sito", non
  // "pagine istituzionali".
  navigation: "Navigazione del sito",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  tagline: "Un database aperto delle telecamere di sorveglianza pubblica, creato per la trasparenza, non per il tracciamento.",
  toolMap: "Mappa",
  toolDirectory: "Elenco",
  toolReport: "Segnala",
  toolCorrection: "Correggi",
  manifesto: "Manifesto",
  rules: "Regole",
  guide: "Guida",
  privacy: "Privacy",
  terms: "Termini d'uso",
  licenses: "Licenze",
  // Dataset pubblici importati (import pipeline FASE C, t_4dbce318): il
  // footer collega la pagina dedicata /fonti (attribuzione per fonte), NON
  // nella navigazione principale — gruppo pagine istituzionali, accanto a
  // Licenze.
  sources: "Fonti dei dati",
  faq: "FAQ",
  contact: "Contatti",
  accessibility: "Dichiarazione di accessibilità",
  dataLicense: "Database ed esportazioni concessi in licenza ODbL 1.0",
  osmAttribution: "Dati cartografici © OpenStreetMap contributors",
};
