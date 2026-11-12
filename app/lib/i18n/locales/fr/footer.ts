/**
 * footer — FR translation. Parity-checked against the English pilot
 * bundle (../../footer.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../footer";

export const fr: Translation<typeof en> = {
  landmarkLabel: "Pied de page du site",
  // The footer groups the public routes by task. Legal documents remain
  // available in a native disclosure so they are easy to reach without
  // competing with the primary paths through the site.
  navigation: "Navigation du site",
  homeAria: "Accueil OpenSurveillanceDB",
  tagline: "Une base de données ouverte des caméras de surveillance publiques, conçue pour la transparence, pas pour le pistage.",
  toolMap: "Carte",
  toolDirectory: "Répertoire",
  toolReport: "Signaler",
  toolCorrection: "Corriger",
  exploreGroup: "Explorer",
  contributeGroup: "Contribuer",
  projectGroup: "Le projet",
  legalGroup: "Informations légales",
  manifesto: "Manifeste",
  rules: "Règles",
  moderation: "Modération",
  apiDocs: "API publique",
  guide: "Guide",
  privacy: "Confidentialité",
  terms: "Conditions d’utilisation",
  licenses: "Licences",
  // The dedicated /fonti page contains both the public-data attribution and
  // the methodology used to collect and correct records.
  sources: "Méthode et sources",
  faq: "FAQ",
  contact: "Contact",
  accessibility: "Déclaration d’accessibilité",
  dataLicense: "Base de données et exports sous licence ODbL 1.0",
  osmAttribution: "Données cartographiques © contributeurs OpenStreetMap",
};
