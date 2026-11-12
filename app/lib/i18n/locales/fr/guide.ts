/**
 * guide — FR translation. Parity-checked against the English pilot
 * bundle (../../guide.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../guide";

export const fr: Translation<typeof en> = {
  navigation: "Navigation du guide",
  homeAria: "Accueil OpenSurveillanceDB",
  map: "Carte",
  directory: "Répertoire",
  home: "Accueil",
  manifesto: "Manifeste",
  eyebrow: "Guide du projet",
  title: "Une base de données publique, construite avec soin.",
  intro:
    "Ce guide explique ce que documente OpenSurveillanceDB et comment utiliser la carte et le répertoire. Il montre aussi comment un signalement devient une donnée publique, et ce que la base de données ne prétend pas établir.",
  exploreMap: "Explorer la carte",
  browseDirectory: "Parcourir le répertoire",
  overviewEyebrow: "Guide rapide",
  overviewTitle: "Trouvez ce qu’il vous faut.",
  overviewPurpose: "Ce que documente la base de données",
  overviewPublication: "Comment un signalement est publié",
  overviewStatuses: "Comment lire le statut des fiches",
  overviewAccount: "Comptes et contributions",
  overviewConfirmations: "Confirmations et confiance",
  overviewData: "Données ouvertes et exports",
  missionEyebrow: "Objectif et limites",
  missionTitle: "De la visibilité, sans surveillance opérationnelle.",
  missionBody:
    "OpenSurveillanceDB aide chacun à comprendre l’infrastructure de surveillance visible dans l’espace public. C’est un registre citoyen des équipements visibles depuis l’espace public, pas un outil pour observer, suivre ou contourner une surveillance légale.",
  missionOneTitle: "Ce que nous documentons",
  missionOneBody:
    "L’infrastructure de caméras visible, sa position approximative, son type, sa source et un statut communautaire.",
  missionTwoTitle: "Ce que nous ne collectons pas",
  missionTwoBody:
    "Flux vidéo, identifiants d’accès, détails sur des domiciles privés, failles opérationnelles, visages, plaques d’immatriculation ou autres données personnelles.",
  missionThreeTitle: "Ce que la carte ne peut pas prouver",
  missionThreeBody:
    "L’absence de fiche ne montre pas qu’une zone est exempte de surveillance. Elle montre seulement qu’aucune fiche n’y est actuellement publiée.",
  cycleEyebrow: "Un processus communautaire",
  cycleTitle: "De l’observation à la fiche publique.",
  cycleBody:
    "Un signalement envoyé depuis un compte vérifié devient immédiatement une fiche publique. La communauté veille ensuite à l’exactitude du répertoire : ce qui est toujours là est confirmé, ce qui a disparu est signalé, ce qui est utile est marqué.",
  cycleRuleTitle: "La publication est immédiate.",
  cycleRuleBody:
    "Un signalement est publié dès qu’un contributeur vérifié l’envoie. Pas de file d’attente, pas de délai : l’exactitude est assurée par la communauté, pas par un relecteur.",
  cycleStepsLabel: "Cycle de publication",
  submitLabel: "Envoi",
  submitTitle: "Une observation est envoyée",
  submitBody:
    "Un contributeur choisit une position approximative dans l’espace public et ajoute une courte description. Le signalement est publié immédiatement.",
  moderateLabel: "Communauté",
  moderateTitle: "La communauté veille à son exactitude",
  moderateBody:
    "Chacun peut confirmer qu’une caméra est toujours là, la signaler comme disparue, la marquer comme utile ou signaler un problème. Chaque action nécessite un compte vérifié ; des seuils déterminent ce qui change.",
  publishLabel: "Suivi",
  publishTitle: "Les fiches restent en ligne tant que la communauté n’en décide pas autrement",
  publishBody:
    "Une fiche ne quitte la liste publique qu’après suffisamment de signalements de la communauté, ou en cas d’urgence juridique, et chaque changement d’état est consigné dans l’historique public de la fiche.",
  publicationDetailsEyebrow: "La publication en détail",
  publicationDetailsTitle: "Le modèle de publication publique.",
  publicationDetailsSummary: "Lire les règles de publication détaillées",
  statusEyebrow: "Lire les fiches",
  statusTitle: "Chaque statut indique ce que la fiche permet d’affirmer.",
  statusIntro:
    "Un statut décrit l’état actuel ; il ne garantit pas qu’une caméra est active, que la fiche est complète ni qu’elle restera exacte.",
  verifiedTitle: "Publiée et en ligne",
  verifiedBody:
    "La fiche est publique : elle apparaît sur la carte, dans le répertoire et dans l’export GeoJSON. La communauté peut agir dessus à tout moment.",
  reviewTitle: "Masquée",
  reviewBody:
    "La fiche a été retirée dans l’attente d’une vérification communautaire ou juridique. Elle n’est pas listée, mais son historique public reste visible et des confirmations peuvent la rétablir.",
  pendingTitle: "Signalée comme disparue",
  pendingBody:
    "La communauté a signalé que cette caméra n’est plus là. La fiche n’est pas listée et peut être rétablie si des confirmations montrent que la caméra est de retour.",
  accountEyebrow: "Votre compte",
  accountTitle: "Pourquoi créer un compte ?",
  accountBody:
    "Consulter les données ne nécessite aucun compte. Avec un compte, vous pouvez envoyer des signalements, participer aux actions communautaires, suivre vos contributions et développer votre niveau de confiance.",
  accountWhyTitle: "Ce qu’un compte vous apporte",
  accountWhyBody:
    "Les signalements sont liés à votre compte. Vous pouvez modifier vos contributions, confirmer des fiches, signaler des problèmes et voir votre niveau de confiance progresser.",
  accountHowTitle: "Comment fonctionnent les comptes",
  accountHowBody:
    "Vous vous inscrivez avec une adresse e-mail et un mot de passe, conservé sous forme de hachage et jamais exposé. La vérification de l’adresse e-mail est obligatoire avant de pouvoir publier ou participer aux actions communautaires. Vous pouvez aussi ajouter une clé d’accès ou une connexion via un réseau social au même compte.",
  accountAnonymousTitle: "La consultation reste ouverte",
  accountAnonymousBody:
    "Vous pouvez explorer la carte, le répertoire et les exports sans compte. Envoyer un signalement, une correction ou participer aux actions communautaires nécessite un compte contributeur vérifié.",
  editEyebrow: "Modifier une contribution",
  editTitle: "Vous pouvez modifier vos propres contributions.",
  editBody:
    "Seul le contributeur qui a envoyé une fiche peut la modifier. Une mise à jour d’une fiche déjà publique devient une proposition privée : la version publiée reste visible jusqu’à ce qu’un modérateur l’applique ou la rejette. Pour tout le reste, utilisez le formulaire de correction privé.",
  editOwnerTitle: "Réservé à l’auteur",
  editOwnerBody:
    "Vous ne pouvez modifier une fiche que si vous l’avez envoyée. Les fiches des autres ne peuvent pas être modifiées directement ; signalez ce qui doit changer via le formulaire de correction privé.",
  editRemoderationTitle: "Les mises à jour deviennent des propositions",
  editRemoderationBody:
    "Lorsqu’une fiche est déjà publique, une modification ne l’écrase jamais : le changement est enregistré comme proposition privée, qu’un modérateur applique ou rejette. La version publique actuelle reste visible pendant tout ce temps.",
  editNotImmediateTitle: "La proposition reste privée",
  editNotImmediateBody:
    "Seul le changement proposé reste privé pendant son examen. La fiche publiée continue d’apparaître sur la carte, dans le répertoire et dans les exports jusqu’à ce qu’une décision soit prise sur la proposition.",
  verifyEyebrow: "Confirmations",
  verifyTitle: "Ce que signifient les confirmations.",
  verifyBody:
    "Une confirmation est une vérification personnelle qu’une caméra est toujours présente à l’emplacement indiqué. Elle aide les lecteurs à se fier à une fiche sans révéler qui l’a confirmée.",
  verifyWhatTitle: "Une vérification personnelle",
  verifyWhatBody:
    "En confirmant, vous déclarez, d’après votre propre observation, que la caméra existe toujours là où la fiche l’indique.",
  verifyOneTitle: "Une par personne",
  verifyOneBody:
    "Chaque compte peut conserver une action communautaire par fiche. C’est une vérification, pas un concours de popularité : une personne, un signal.",
  verifyFairTitle: "Un système équitable",
  verifyFairBody:
    "Les actions communautaires nécessitent un compte vérifié, les nouveaux comptes pèsent moins que les comptes de confiance, et des limites quotidiennes empêchent les actions automatisées ou massives. Vous ne pouvez ni confirmer ni marquer votre propre fiche.",
  verifyPrivateTitle: "Aucune attribution publique",
  verifyPrivateBody:
    "Les pages publiques n’affichent que des totaux et l’historique public de la fiche. Qui a confirmé ou signalé une fiche n’est jamais affiché ni relié à un profil.",
  levelEyebrow: "Niveaux de confiance",
  levelTitle: "De la reconnaissance, pas de la compétition.",
  levelBody:
    "Les niveaux de confiance reflètent le nombre de vos contributions en ligne dans le répertoire. Ils reconnaissent discrètement un travail exact ; ce n’est pas un classement.",
  levelThresholdsTitle: "Niveaux et seuils",
  levelThresholdsBody:
    "Seules les contributions en ligne comptent. Les seuils sont 1, 5, 20 et 50 ; les fiches masquées ou supprimées ne comptent pas.",
  levelBadgeTitle: "Trois badges",
  levelBadgeBody:
    "Votre profil affiche l’un des trois badges : Nouveau contributeur, Contributeur de confiance ou Contributeur expérimenté. Le badge est informatif, jamais un rang.",
  levelRecognitionTitle: "Pas de classement",
  levelRecognitionBody:
    "Les niveaux sont personnels. Il n’existe aucun classement public, et le niveau des autres n’est jamais affiché.",
  dataEyebrow: "Données ouvertes et fond de carte",
  dataTitle: "Ouvert là où l’ouverture est sans danger.",
  dataBody:
    "Les fiches publiées sont disponibles en GeoJSON et en CSV pour la réutilisation et l’examen. Le jeu de données public contient les fiches en ligne ; les demandes de correction privées n’y figurent jamais.",
  downloadGeoJson: "Télécharger le GeoJSON public",
  downloadCsv: "Télécharger le CSV public",
  geoJsonTitle: "Un export public réutilisable",
  geoJsonBody:
    "GeoJSON est un format de données géographiques courant. Il est destiné à l’analyse citoyenne, à la recherche et aux outils cartographiques compatibles, pas à la recherche de flux vidéo ou d’informations opérationnelles sensibles.",
  osmTitle: "OpenStreetMap fournit le fond de carte",
  osmBody:
    "Le fond de carte est fourni par les contributeurs d’OpenStreetMap. Il est distinct des fiches de caméras de ce projet et exige toujours une attribution visible et un usage responsable.",
  localLabel: "État du projet",
  localTitle: "Un projet en cours de développement",
  localBody:
    "OpenSurveillanceDB est en développement actif. Les fiches sont publiées immédiatement depuis des comptes vérifiés et maintenues exactes par la communauté ; le projet ne prétend pas que les données sont complètes, à jour ou officielles.",
  footer: "Conçu pour la transparence, pas pour le pistage.",
};
