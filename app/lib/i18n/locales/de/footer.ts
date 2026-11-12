/**
 * footer — DE translation. Parity-checked against the English pilot
 * bundle (../../footer.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../footer";

export const de: Translation<typeof en> = {
  landmarkLabel: "Fußzeile der Website",
  // The footer groups the public routes by task. Legal documents remain
  // available in a native disclosure so they are easy to reach without
  // competing with the primary paths through the site.
  navigation: "Website-Navigation",
  homeAria: "OpenSurveillanceDB Startseite",
  tagline: "Eine offene Datenbank öffentlicher Überwachungskameras – für Transparenz, nicht für Tracking.",
  toolMap: "Karte",
  toolDirectory: "Verzeichnis",
  toolReport: "Melden",
  toolCorrection: "Korrigieren",
  exploreGroup: "Entdecken",
  contributeGroup: "Mitmachen",
  projectGroup: "Das Projekt",
  legalGroup: "Rechtliche Hinweise",
  manifesto: "Manifest",
  rules: "Regeln",
  moderation: "Moderation",
  apiDocs: "Öffentliche API",
  guide: "Anleitung",
  privacy: "Datenschutz",
  terms: "Nutzungsbedingungen",
  licenses: "Lizenzen",
  // The dedicated /fonti page contains both the public-data attribution and
  // the methodology used to collect and correct records.
  sources: "Methode & Quellen",
  faq: "FAQ",
  contact: "Kontakt",
  accessibility: "Erklärung zur Barrierefreiheit",
  dataLicense: "Datenbank und Exporte lizenziert unter ODbL 1.0",
  osmAttribution: "Kartendaten © OpenStreetMap-Mitwirkende",
};
