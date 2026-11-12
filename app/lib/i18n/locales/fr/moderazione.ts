/**
 * moderazione — FR translation. Parity-checked against the English pilot
 * bundle (../../moderazione.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../moderazione";

export const fr: Translation<typeof en> = {
  navigation: "Navigation de la page publication",
  homeAria: "Accueil OpenSurveillanceDB",
  map: "Carte",
  directory: "Répertoire",
  home: "Accueil",
  eyebrow: "Comment fonctionne la publication",
  title: "Publié immédiatement, tenu à jour par la communauté.",
  intro:
    "Chaque signalement provenant d’un compte vérifié est publié immédiatement, sur la carte, dans le répertoire et dans les exports. Cette page explique la vie d’une fiche, comment la communauté veille à son exactitude, et les seuils automatiques qui déterminent quand une fiche est retirée ou rétablie.",
  correctionCta: "Demander une correction",
  exploreMapCta: "Explorer la carte",
  flowEyebrow: "La vie d’une fiche",
  flowTitle: "De l’observation à la fiche publique.",
  flowBody:
    "Un signalement est public dès qu’il est envoyé par un compte vérifié. Il n’y a ni file d’attente ni délai : la communauté veille à l’exactitude du répertoire dès la première minute.",
  stepReceiveTitle: "Envoyer",
  stepReceiveBody: "Un contributeur vérifié envoie une observation faite depuis l’espace public. Le signalement est publié immédiatement.",
  stepScreenTitle: "Publier",
  stepScreenBody: "La fiche apparaît sur la carte, dans le répertoire et dans les exports. Les coordonnées sont arrondies à environ 4 décimales (une dizaine de mètres) ; l’emplacement exact n’est jamais publié.",
  stepVerifyTitle: "Agir",
  stepVerifyBody: "Toute personne disposant d’un compte vérifié peut confirmer que la caméra est toujours là, la signaler comme n’étant plus présente, l’indiquer comme utile ou signaler un problème. Un compte, une action active par fiche.",
  stepMinimiseTitle: "Seuils",
  stepMinimiseBody: "Des seuils automatiques déterminent ce qui change : suffisamment de signalements masquent ou suppriment une fiche, un signalement relatif à la vie privée la masque immédiatement, et suffisamment de confirmations la rétablissent. Aucun compte ne contrôle à lui seul la publication.",
  stepDecideTitle: "Retirer",
  stepDecideBody: "Une fiche suffisamment signalée par la communauté est masquée ou supprimée de la liste publique. Elle reste accessible par lien direct, avec un bandeau et son historique public.",
  stepMaintainTitle: "Rétablir",
  stepMaintainBody: "Une fiche masquée ou supprimée peut revenir grâce à suffisamment de confirmations de la communauté. Chaque transition est consignée dans l’historique public de la fiche.",
  appealsEyebrow: "Corrections et urgences juridiques",
  appealsTitle: "Des demandes privées, un seul pouvoir d’urgence.",
  appealsBody:
    "Les demandes de correction restent privées : elles ne modifient jamais la carte automatiquement et ne sont jamais incluses dans l’export public. Le seul pouvoir d’intervention humaine restant est le masquage pour urgence juridique, utilisé par un administrateur lorsque la loi l’exige.",
  urgentTitle: "Les signalements relatifs à la vie privée sont immédiats",
  urgentBody:
    "Un signalement relatif à la vie privée provenant d’un compte vérifié masque immédiatement une fiche, dans l’attente d’une vérification par la communauté. Les urgences juridiques suivent la même procédure immédiate ; l’annulation nécessite suffisamment de confirmations et un délai de carence.",
  outcomeUpheldTitle: "Masquée",
  outcomeUpheldBody: "Une fiche retirée dans l’attente d’une vérification par la communauté ou d’une vérification juridique. Elle n’est pas listée, mais reste accessible par lien direct avec son historique public.",
  outcomeDismissedTitle: "Supprimée",
  outcomeDismissedBody: "La communauté a signalé que la caméra n’est plus là. Elle n’est pas listée, et des confirmations peuvent la rétablir.",
  outcomeEscalatedTitle: "Rétablie",
  outcomeEscalatedBody: "Suffisamment de confirmations ont ramené la fiche dans la liste publique. Le rétablissement est consigné dans son historique public.",
  slaTitle: "Délais de réponse visés",
  slaBody:
    "Demandes de correction et de retrait : première réponse sous 48 heures, réponse sur le fond sous 14 jours ; les masquages pour urgence juridique sont immédiats. Ces délais sont en vigueur.",
  safeguardsEyebrow: "Garde-fous",
  safeguardsTitle: "Les contre-pouvoirs du modèle communautaire.",
  safeguardsBody: "Le modèle est conçu pour qu’aucun compte ne contrôle à lui seul la publication et que les erreurs restent visibles.",
  safeguardPairTitle: "Comptes vérifiés uniquement",
  safeguardPairBody: "Chaque signalement et chaque action communautaire nécessitent un compte contributeur vérifié — les écritures anonymes sont refusées.",
  safeguardEscalationTitle: "Des seuils automatiques et transparents",
  safeguardEscalationBody: "Les retraits et les rétablissements suivent des seuils publiés, avec un nombre minimal de contributeurs distincts, de sorte qu’un seul compte ne peut jamais décider seul.",
  safeguardCredentialsTitle: "Un historique public et non attribué",
  safeguardCredentialsBody: "Chaque transition est consignée dans l’historique public de la fiche sous forme d’événement agrégé. L’identité des personnes ayant confirmé ou signalé n’est jamais affichée ni liée à un profil.",
  safeguardTrainingTitle: "Consommation et quotas",
  safeguardTrainingBody: "Les actions déclenchantes sont consommées lors d’une transition, et des quotas journaliers empêchent les actions automatisées ou massives.",
  safeguardAuditTitle: "Audit interne et effacement",
  safeguardAuditBody: "Un journal d’audit interne en ajout seul conserve l’attribution complète à des fins de responsabilité, et l’effacement d’un compte supprime ses actions communautaires.",
  notDashboardTitle: "Cette page n’est pas le tableau de bord de modération",
  notDashboardBody:
    "Le tableau de bord de modération est un outil privé, protégé par un contrôle d’accès et jamais lié depuis le site public, réservé aux urgences juridiques et au circuit de correction privé. Cette page explique uniquement le modèle public.",
};
