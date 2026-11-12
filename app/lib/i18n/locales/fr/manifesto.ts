/**
 * manifesto — FR translation. Parity-checked against the English pilot
 * bundle (../../manifesto.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../manifesto";

export const fr: Translation<typeof en> = {
  navigation: "Navigation du manifeste",
  homeAria: "Accueil OpenSurveillanceDB",
  map: "Carte",
  directory: "Répertoire",
  guide: "Comment ça marche",
  manifesto: "Manifeste",
  home: "Accueil",
  eyebrow: "Manifeste du projet",
  title: "Un manifeste pour un espace public lisible.",
  intro:
    "OpenSurveillanceDB est une base de données citoyenne, ouverte et non commerciale des infrastructures de surveillance publique visibles. Cette page expose la finalité du projet, les principes qui le régissent, les limites qu’il s’impose, et ce qui est — ou n’est pas — publié.",
  exploreMap: "Explorer la carte",
  browseDirectory: "Parcourir le répertoire",
  readGuide: "Lire le guide",
  founderEyebrow: "Le mot du fondateur",
  founderTitle: "La transparence est une condition de l’espace public.",
  founderBody:
    "Ce projet part d’une conviction simple : ce qui observe l’espace public doit aussi être lisible par celles et ceux qui y vivent. Les caméras et les systèmes automatisés qui affectent la vie collective ne peuvent pas être une présence opaque. À mesure que la surveillance se développe — des grands réseaux privés comme Flock Safety aux États-Unis aux débats européens et italiens sur la reconnaissance faciale et la biométrie — le besoin d’une connaissance publique, vérifiable et partagée grandit lui aussi. OpenSurveillanceDB n’est pas contre la sécurité, et n’entend exposer ni les personnes ni les infrastructures vulnérables. C’est un outil non commercial pour rendre visible, dans certaines limites et avec responsabilité, l’infrastructure de surveillance tournée vers l’espace public. Il publie des données sur les caméras, pas des flux ; du contexte, pas des profils ; de la transparence, pas du pistage. Je crois que les données d’intérêt public doivent rester accessibles à la communauté. C’est pourquoi ce projet est ouvert, documenté et construit avec les personnes qui vivent la ville et l’utilisent.",
  founderSignature: "— Simone Rondina, fondateur d’OpenSurveillanceDB",
  missionEyebrow: "Mission",
  missionTitle: "Aider chacun à comprendre les systèmes qui l’entourent.",
  missionBody:
    "Le projet cartographie les infrastructures de caméras visibles dans les espaces partagés, afin que le public puisse voir ce qui est installé à proximité. Il documente uniquement les équipements visibles depuis l’espace public. Ce n’est pas un outil pour observer, pister ou contourner une surveillance légale.",
  missionOneTitle: "Ce que nous documentons",
  missionOneBody:
    "Les infrastructures de caméras visibles, leur emplacement approximatif, leur type, leur source et un statut communautaire.",
  missionTwoTitle: "Ce que nous ne collectons pas",
  missionTwoBody:
    "Flux de caméras, identifiants de connexion, détails sur des logements privés, failles opérationnelles, visages, plaques d’immatriculation ou autres données personnelles.",
  missionThreeTitle: "Ce que les données ne peuvent pas prouver",
  missionThreeBody:
    "L’absence de fiche ne montre pas qu’une zone est exempte de surveillance. Elle indique seulement qu’aucune fiche n’y est actuellement publiée.",
  principlesEyebrow: "Principes",
  principlesTitle: "Libre, ouvert et sûr dès la conception.",
  principlesIntro:
    "Cinq engagements guident chaque décision de ce projet, du modèle de données aux actions de la communauté.",
  principleOneTitle: "Gratuit",
  principleOneBody:
    "Pas de publicité, pas de profilage, pas de fonctionnalités payantes. La base de données et le logiciel sont des biens publics.",
  principleTwoTitle: "Open source",
  principleTwoBody:
    "Le logiciel peut être inspecté, réutilisé et amélioré par la communauté.",
  principleThreeTitle: "Des données ouvertes à la provenance traçable",
  principleThreeBody:
    "La licence et la provenance sont consignées pour chaque fiche publiée, afin que le journalisme, la recherche et les usages citoyens puissent s’y fier.",
  principleFourTitle: "Vie privée et sécurité dès la conception",
  principleFourBody:
    "Pas de caméras de logements privés, pas de détails opérationnels sensibles, pas de liens vers des flux en direct. Les visages et les plaques d’immatriculation sont retirés avant publication.",
  principleFiveTitle: "L’exactitude communautaire d’abord",
  principleFiveBody:
    "Les signalements des comptes vérifiés sont publiés immédiatement. La communauté veille à l’exactitude du répertoire : elle confirme ce qui est toujours là, signale ce qui a disparu et retire ce qui pose problème — selon des seuils automatiques et transparents.",
  nonGoalsEyebrow: "Ce que nous refusons",
  nonGoalsTitle: "Ce que nous ne faisons délibérément pas.",
  nonGoalsBody:
    "Les limites comptent autant que la mission. OpenSurveillanceDB ne deviendra jamais l’un des outils suivants :",
  nonGoalFeedsTitle: "Aucun flux de caméra",
  nonGoalFeedsBody:
    "Nous documentons les équipements, pas les images. Aucun flux, en direct ou enregistré, n’est jamais lié ni affiché.",
  nonGoalTrackingTitle: "Aucun outil de pistage",
  nonGoalTrackingBody:
    "Les données ne peuvent pas servir à observer, suivre ou profiler des personnes dans l’espace public.",
  nonGoalBypassTitle: "Aucun conseil de contournement",
  nonGoalBypassBody:
    "Le projet n’aide personne à échapper à une surveillance légale et ne publie aucune faille opérationnelle.",
  nonGoalPrivateTitle: "Aucune propriété privée",
  nonGoalPrivateBody:
    "Les caméras qui surveillent des logements privés, ainsi que les détails de la vie privée, sont hors du périmètre.",
  publishEyebrow: "Ce que nous publions",
  publishTitle: "Ouvert là où l’ouverture est sans danger.",
  publishBody:
    "Les infrastructures visibles depuis l’espace public entrent dans les données publiques dès qu’elles sont signalées. Chaque fiche est un fait concernant un équipement visible, pas une personne, et reste active jusqu’à ce que la communauté la retire.",
  publishedTitle: "Publié",
  publishedItemOne: "Les infrastructures de caméras visibles et leur emplacement approximatif",
  publishedItemTwo: "Le type, la source et le statut communautaire de chaque fiche",
  publishedItemThree:
    "Des exports GeoJSON et CSV des fiches publiques, avec licence et provenance",
  neverPublishedTitle: "Jamais publié",
  neverPublishedItemOne: "Flux de caméras, identifiants de connexion ou liens vers des images en direct",
  neverPublishedItemTwo: "Visages, plaques d’immatriculation ou toute donnée personnelle",
  neverPublishedItemThree:
    "Détails sur des logements privés, lieux sensibles ou failles opérationnelles",
  neverPublishedItemFour:
    "Les demandes de correction privées, qui n’entrent jamais dans le jeu de données public",
  footerNote: "Conçu pour la transparence, pas pour le pistage.",
};
