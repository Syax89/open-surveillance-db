/**
 * sources — FR translation. Parity-checked against the English pilot
 * bundle (../../sources.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../sources";

export const fr: Translation<typeof en> = {
  navigation: "Navigation du site",
  homeAria: "Accueil OpenSurveillanceDB",
  eyebrow: "Données · Méthode et sources",
  title: "Méthodologie et sources des données",
  intro:
    "Nous documentons les infrastructures de surveillance publique visibles grâce aux observations de la communauté et à des jeux de données publics sous licence ouverte. Voici comment les données sont collectées, vérifiées et attribuées.",
  methodologyTitle: "Comment fonctionne la base de données",
  methodologyIntro: "La base de données est un registre public de ce qui peut être observé dans l’espace public. Ce n’est pas un système de surveillance en direct et elle ne contient jamais de flux de caméras.",
  scopeTitle: "Périmètre",
  scopeBody: "Nous recensons les équipements visibles dans l’espace public et les informations nécessaires pour les identifier : emplacement, type, orientation lorsqu’elle est connue et source.",
  collectionTitle: "Collecte",
  collectionBody: "Les fiches proviennent des observations de la communauté et de jeux de données publics compatibles. Les données importées conservent leur source, leur licence et leur attribution d’origine.",
  correctionTitle: "Vérification et correction",
  correctionBody: "Chacun peut confirmer qu’une fiche est toujours d’actualité, signaler un problème ou demander une correction. Les corrections sont examinées avant de modifier les données publiques.",
  limitsTitle: "Limites",
  limitsBody: "Une zone vide ne prouve pas l’absence de caméras. Une fiche décrit les meilleures informations disponibles à un moment donné, et les coordonnées publiques sont arrondies pour protéger le contexte.",
  sourcesTitle: "Sources de données importées",
  sourcesIntro: "Chaque jeu de données importé est listé ci-dessous avec son éditeur d’origine, sa licence, sa date d’import, son nombre de fiches et l’attribution requise.",
  // Table / card labels (per-source attribution contract, licence matrix
  // docs/data-sources/licenze-compatibilita.md).
  sourceColumn: "Source",
  licenseColumn: "Licence",
  importedOnColumn: "Importé le",
  recordsColumn: "Fiches",
  attributionColumn: "Attribution",
  recordsCount: (count: number) => `${count.toLocaleString()} ${count <= 1 ? "fiche" : "fiches"}`,
  openSource: "Ouvrir le jeu de données source (nouvelle fenêtre)",
  openLicense: "Ouvrir le texte de la licence (nouvelle fenêtre)",
  // Honest empty state: no committed import batch yet — the page exists and
  // explains itself without inventing sources.
  emptyTitle: "Aucun jeu de données importé pour l’instant",
  emptyBody:
    "Aucun jeu de données public n’a été importé à ce jour. Les signalements de la communauté sont toujours publiés individuellement et ne dépendent jamais de cette page. Dès le premier import, chaque source sera listée ici avec sa licence et son attribution.",
  // Dynamic freshness line: the date is derived from the committed batches
  // at request time (app/fonti/page.tsx), never hardcoded — a static date
  // here would go stale the moment a new import lands (copy-finale rule:
  // the page must always tell the truth about its own content).
  lastUpdatedLabel: "Dernière mise à jour",
  descriptorsNote: "Les descripteurs d’import du dépôt (docs/data-sources/imports/) font foi.",
};
