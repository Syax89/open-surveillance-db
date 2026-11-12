/**
 * rules — FR translation. Parity-checked against the English pilot
 * bundle (../../rules.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../rules";

export const fr: Translation<typeof en> = {
  navigation: "Navigation des règles",
  homeAria: "Accueil OpenSurveillanceDB",
  map: "Carte",
  directory: "Répertoire",
  guide: "Guide",
  home: "Accueil",
  eyebrow: "Règles de participation",
  title: "Ce que nous publions, et comment vous pouvez aider.",
  intro:
    "Ces règles expliquent ce que documente OpenSurveillanceDB et ce que les contributeurs peuvent signaler. Elles portent sur la publication, les actions de la communauté, les corrections et la réutilisation des données.",
  reportEyebrow: "Ce que vous pouvez signaler",
  reportTitle: "L’espace public, observé depuis l’espace public.",
  reportBody:
    "Seules les infrastructures de surveillance visibles dans les espaces partagés peuvent être documentées. Une fiche est publiable lorsqu’elle répond à un objectif clair de transparence citoyenne et ne contient aucune donnée personnelle superflue.",
  eligibleOneTitle: "Infrastructures de voirie publique",
  eligibleOneBody:
    "Une caméra visiblement installée dans une rue, sur une place, à l’extérieur d’une gare ou d’un bâtiment public.",
  eligibleTwoTitle: "Caméras de circulation documentées publiquement",
  eligibleTwoBody:
    "Une caméra de surveillance du trafic documentée publiquement, lorsque la publication de la fiche est licite et sans danger.",
  eligibleThreeTitle: "Sources publiques officielles",
  eligibleThreeBody:
    "Une fiche issue d’une source publique officielle, accompagnée de sa source et de sa date de vérification.",
  neverTitle: "Ne jamais signaler",
  neverBody:
    "Les signalements contenant l’un des éléments suivants ne sont jamais conservés dans le jeu de données public.",
  neverOneTitle: "Logements privés",
  neverOneBody:
    "Caméras résidentielles ou privées, y compris les sonnettes vidéo et les caméras orientées vers un logement privé.",
  neverTwoTitle: "Personnes et données personnelles",
  neverTwoBody:
    "Personnes identifiables, plaques d’immatriculation ou intérieurs privés.",
  neverThreeTitle: "Flux en direct et accès",
  neverThreeBody:
    "Vidéo en direct, URL de flux, identifiants de connexion, informations réseau ou interfaces de contrôle.",
  neverFourTitle: "Détails sensibles",
  neverFourBody:
    "Champ de vision détaillé ou capacités opérationnelles susceptibles de créer un risque pour la sécurité, ou lieux sensibles dont la publication pourrait être dangereuse.",
  beforeSubmittingTitle: "Avant d’envoyer",
  beforeSubmittingBody:
    "L’envoi nécessite un compte contributeur vérifié. N’envoyez ni ne décrivez de personnes, de plaques d’immatriculation, de logements privés, de failles de sécurité ou de lieux sensibles. Votre signalement est publié immédiatement : assurez-vous qu’il peut être rendu public sans danger.",
  correctionEyebrow: "Corrections",
  correctionTitle: "Un moyen privé de contester une fiche.",
  correctionBody:
    "Tout contributeur vérifié peut demander une correction, contester une fiche ou signaler un préjudice. Les demandes sont privées, examinées par une personne et ne modifient jamais la carte automatiquement.",
  correctionOneTitle: "Demander une correction",
  correctionOneBody:
    "Les fiches inexactes, obsolètes ou en double peuvent être signalées pour examen.",
  correctionTwoTitle: "Signaler un problème de vie privée ou de sécurité",
  correctionTwoBody:
    "Un signalement relatif à la vie privée masque immédiatement une fiche, dans l’attente d’une vérification par la communauté. Les urgences juridiques suivent la même procédure immédiate.",
  correctionThreeTitle: "Aucune donnée personnelle nécessaire",
  correctionThreeBody:
    "Décrivez uniquement le strict nécessaire pour identifier le problème. N’incluez pas de données personnelles, de liens vers des flux en direct, d’identifiants de connexion ni d’images.",
  dataEyebrow: "Réutilisation des données",
  dataTitle: "Ouvert là où l’ouverture est sans danger.",
  dataBody:
    "Les fiches publiées sont disponibles aux formats GeoJSON et CSV pour la réutilisation et la consultation. Le jeu de données public contient les fiches actives ; les demandes de correction privées n’y sont jamais incluses.",
  downloadGeoJson: "Télécharger le GeoJSON public",
  downloadCsv: "Télécharger le CSV public",
  reuseOneTitle: "Licence et provenance",
  reuseOneBody:
    "Chaque fiche publiée conserve sa source et sa date de vérification, et les données sont placées sous une licence de réutilisation ouverte.",
  reuseTwoTitle: "Aucun détail opérationnel",
  reuseTwoBody:
    "Les exports sont destinés à l’analyse citoyenne, à la recherche et aux outils cartographiques compatibles — pas à la recherche de flux de caméras ni d’informations opérationnelles sensibles.",
  reuseThreeTitle: "Attribution à OpenStreetMap",
  reuseThreeBody:
    "Le fond de carte est fourni par les contributeurs d’OpenStreetMap et est distinct des fiches de caméras de ce projet.",
  footer: "Conçu pour la transparence, pas pour le pistage.",
};
