/**
 * home — interface strings for the home page only.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 *
 * F1 split (route group (tools)): the home tool sections (map, directory,
 * report, correction) moved to dedicated routes and read their own bundles
 * (`map`, `directory`, `report`, `correction`). This file keeps only the
 * strings the home page itself renders (nav, hero, principles, footer bits
 * used by the home layout).
 */
import type { Translation } from "./types";

export const en = {
  mainNavigation: "Main navigation",
  homeAria: "OpenSurveillanceDB home",
  menu: "Menu",
  exploreMap: "Explore map",
  browseRecords: "Browse records",
  howItWorks: "How it works",
  rules: "Rules",
  manifesto: "Manifesto",
  addCamera: "Add a camera",
  openDatabase: "Open database · community maintained",
  heroTitle: "Public data about public surveillance.",
  heroIntro:
    "OpenSurveillanceDB maps visible surveillance infrastructure in public space. The data is open, sourced and built by people who want to understand the systems around them.",
  exploreTheMap: "Explore the map",
  ourPrinciples: "Our principles",
  prototypeStats: "Prototype database statistics",
  publicRecords: "public records",
  accountsRequired: "accounts required",
  openPrototype: "open prototype",
  visualLabelFirst: "Mapping public space",
  visualLabelSecond: "with public knowledge",
  apiUnavailable:
    "The public API is not available yet, so the prototype is showing illustrative records.",
  civicCommons: "A civic data commons",
  principlesTitle: "Visibility without surveillance.",
  principlesIntro:
    "We document public infrastructure, never camera feeds. Each published record has a source, a status and a way to be corrected.",
  openDefault: "Open by default",
  openDefaultBody:
    "Downloadable data with visible provenance for journalism, research and civic use.",
  privacyFirst: "Privacy first",
  privacyFirstBody:
    "Faces, licence plates and personal information must be removed before publication.",
  moderatedReports: "Moderated reports",
  moderatedReportsBody:
    "New records wait for human review. A report is not made public just because it was submitted.",
} as const;

export const it: Translation<typeof en> = {
  mainNavigation: "Navigazione principale",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  menu: "Menu",
  exploreMap: "Esplora la mappa",
  browseRecords: "Sfoglia i record",
  howItWorks: "Come funziona",
  rules: "Regole",
  manifesto: "Manifesto",
  addCamera: "Aggiungi una telecamera",
  openDatabase: "Database aperto · mantenuto dalla comunità",
  heroTitle: "Dati pubblici sulla sorveglianza pubblica.",
  heroIntro:
    "OpenSurveillanceDB mappa le infrastrutture di sorveglianza visibili nello spazio pubblico. I dati sono aperti, provengono da fonti documentate e sono costruiti da persone che vogliono capire i sistemi che le circondano.",
  exploreTheMap: "Esplora la mappa",
  ourPrinciples: "I nostri principi",
  prototypeStats: "Statistiche del database prototipo",
  publicRecords: "record pubblici",
  accountsRequired: "account richiesti",
  openPrototype: "prototipo aperto",
  visualLabelFirst: "Mappare lo spazio pubblico",
  visualLabelSecond: "con conoscenza pubblica",
  apiUnavailable:
    "L'API pubblica non è ancora disponibile: il prototipo mostra record illustrativi.",
  civicCommons: "Un bene comune civico di dati",
  principlesTitle: "Visibilità senza sorveglianza.",
  principlesIntro:
    "Documentiamo infrastrutture pubbliche, mai feed delle telecamere. Ogni record pubblicato ha una fonte, uno stato e un modo per essere corretto.",
  openDefault: "Aperto per impostazione predefinita",
  openDefaultBody:
    "Dati scaricabili con provenienza visibile per giornalismo, ricerca e uso civico.",
  privacyFirst: "La privacy prima di tutto",
  privacyFirstBody:
    "Volti, targhe e informazioni personali devono essere rimossi prima della pubblicazione.",
  moderatedReports: "Segnalazioni moderate",
  moderatedReportsBody:
    "I nuovi record attendono la revisione umana. Una segnalazione non diventa pubblica solo perché è stata inviata.",
};
