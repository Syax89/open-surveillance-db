/**
 * home — FR translation. Parity-checked against the English pilot
 * bundle (../../home.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../home";

export const fr: Translation<typeof en> = {
  mainNavigation: "Navigation principale",
  homeAria: "Accueil OpenSurveillanceDB",
  pageTitle: "Base de données ouverte des infrastructures de surveillance publique",
  pageDescription:
    "OpenSurveillanceDB est une base de données citoyenne et non commerciale des infrastructures de surveillance publique visibles : sourcée, maintenue par la communauté et respectueuse de la vie privée.",
  // QA#2 F1 (axe serious): the scrollable legal tables (/privacy data
  // table) become a focusable region when they overflow — the aria-label
  // tells keyboard users why the region is in the tab order and how to
  // scroll it.
  tableScrollAria: "Tableau — faites défiler horizontalement pour voir plus de colonnes",
  menu: "Menu",
  exploreMap: "Explorer la carte",
  browseRecords: "Parcourir les fiches",
  howItWorks: "Comment ça marche",
  rules: "Règles",
  manifesto: "Manifeste",
  addCamera: "Ajouter une caméra",
  contribuisci: "Contribuer",
  openDatabase: "Base de données ouverte · maintenue par la communauté",
  heroTitle: "Des données publiques sur la surveillance publique.",
  heroIntro:
    "OpenSurveillanceDB cartographie les infrastructures de surveillance visibles dans l’espace public. Les données sont ouvertes et construites par la communauté : chacun apporte ce qu’il observe, afin que tous puissent comprendre les systèmes qui les entourent.",
  exploreTheMap: "Explorer la carte",
  reportCta: "Signaler une caméra",
  searchDirectory: "Rechercher dans le répertoire",
  searchDirectoryPlaceholder: "Rechercher par nom, type ou adresse",
  // Hero address autocomplete (issue #439): the hero search field is
  // progressively enhanced with the shared PlaceAutocomplete primitive.
  // The copy is home-scoped — the /segnala address search keeps its own
  // report-bundle wording.
  // Hero search-as-you-type (2026-11): record suggestions from our own
  // data only; the place lookup (OpenStreetMap) runs only when the last
  // item is chosen, then a chosen place opens the map there.
  suggestLabel: "Suggestions",
  suggestCount: (count: number) => (count === 1 ? "1 suggestion disponible" : `${count} suggestions disponibles`),
  suggestCoordinates: (text: string) => `Afficher les coordonnées ${text} sur la carte`,
  suggestRecordNumber: (id: number) => `Ouvrir la fiche #${id}`,
  suggestPlace: (query: string) => `Rechercher le lieu « ${query} » (OpenStreetMap)`,
  searchPlaceLabel: "Suggestions de lieux",
  searchPlaceNoResults: (query: string) => `Aucun résultat pour « ${query} »`,
  searchPlaceUnavailable: "La recherche de lieux est temporairement indisponible.",
  searchPlaceRateLimited: (seconds: number) => `La recherche de lieux a atteint sa limite temporaire de requêtes. Réessayez dans environ ${seconds} secondes.`,
  searchPlaceAttribution: "Lieux © contributeurs OpenStreetMap",
  searchDirectoryHelp:
    "Pendant la saisie, les suggestions proviennent uniquement de nos propres fiches. Entrée lance la recherche dans le répertoire ; un lieu n’est recherché sur OpenStreetMap que si vous choisissez « Rechercher le lieu ».",
  statsLabel: "Statistiques de la base de données",
  publicRecords: "fiches publiques",
  browseFreely: "Aucun compte",
  browseFreelyDetail: "nécessaire pour consulter",
  openData: "Données ouvertes",
  openDataDetail: "librement réutilisables",
  trustNote: "Chaque fiche publiée indique sa source, son statut et un moyen de la corriger.",
  sourcesLink: "Voir les sources et la méthodologie",
  visualLabelFirst: "Cartographier l’espace public",
  visualLabelSecond: "avec le savoir public",
  // MapTeaser (static preview, CTA → /mappa). Zero Leaflet on the hub.
  teaserEyebrow: "La carte",
  teaserTitle: "Explorez la carte interactive",
  teaserBody: "Parcourez la carte en plein écran, avec des filtres, des exports et un répertoire accessible au clavier.",
  teaserCta: "Ouvrir la carte",
  // Four tool cards (grid 2×2 desktop / 1×4 mobile).
  toolsTitle: "Ce que vous pouvez faire",
  toolMapTitle: "Carte",
  toolMapBody: "Voyez d’un coup d’œil toutes les caméras documentées.",
  toolDirectoryTitle: "Répertoire",
  toolDirectoryBody: "Parcourez les fiches publiques sans la carte.",
  toolReportTitle: "Signaler une caméra",
  toolReportBody: "Publiez immédiatement une caméra que vous venez d’observer.",
  toolCorrectionTitle: "Corriger une fiche",
  toolCorrectionBody: "Corrigez ou mettez à jour une fiche publiée.",
  civicCommons: "Un commun de données citoyen",
  principlesTitle: "La visibilité sans la surveillance.",
  principlesIntro:
    "Nous documentons les infrastructures publiques, jamais les flux des caméras. Chaque fiche publiée a une source, un statut et un moyen d’être corrigée.",
  openDefault: "Ouvert par défaut",
  openDefaultBody:
    "Des données téléchargeables, à la provenance visible, pour le journalisme, la recherche et les usages citoyens.",
  privacyFirst: "La vie privée d’abord",
  privacyFirstBody:
    "Les visages, les plaques d’immatriculation et les informations personnelles doivent être retirés avant publication.",
  communityVerified: "Vérifié par la communauté",
  communityVerifiedBody:
    "Les signalements sont publiés immédiatement et la communauté veille à leur exactitude : confirmez ce qui est toujours là, signalez ce qui a disparu, indiquez ce qui est utile.",
  manifestoLink: "Lire le manifeste",
};
