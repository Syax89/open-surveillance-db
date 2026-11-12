/**
 * faq — FR translation. Parity-checked against the English pilot
 * bundle (../../faq.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../faq";

export const fr: Translation<typeof en> = {
  navigation: "Navigation de la FAQ",
  homeAria: "Accueil OpenSurveillanceDB",
  map: "Carte",
  directory: "Répertoire",
  home: "Accueil",
  faqLabel: "FAQ",
  contactLabel: "Contacts",
  eyebrow: "Questions fréquentes",
  title: "Des réponses claires sur le fonctionnement de la base de données.",
  intro:
    "Des réponses courtes sur les signalements, la précision de la carte, les actions de la communauté, les corrections et la vie privée. Pour tout ce qui n’est pas traité ici, utilisez le formulaire de correction ou la page de contact.",
  qReport: "Comment signaler une caméra ?",
  aReport:
    "Choisissez un emplacement approximatif sur la carte ou saisissez des coordonnées. Ajoutez ensuite uniquement ce que vous pouvez observer depuis l’espace public : type, orientation, panneau d’information visible, fabricant. N’incluez pas de personnes, de plaques d’immatriculation, de logements privés, d’identifiants de connexion ni de liens vers des flux en direct. Depuis un compte vérifié, votre signalement est publié immédiatement.",
  qAccuracy: "Quelle est la précision de la carte ?",
  aAccuracy:
    "La carte affiche les fiches actives : chaque signalement provenant d’un compte vérifié apparaît immédiatement, et la communauté veille à son exactitude. Les coordonnées publiées sont arrondies à environ quatre décimales, soit une dizaine de mètres. Un statut décrit l’état actuel ; il ne garantit pas qu’une caméra est en fonctionnement. Une zone vide ne prouve pas l’absence de caméras — elle indique seulement qu’aucune fiche n’y est actuellement publiée.",
  qCorrect: "Comment corriger une erreur ?",
  aCorrect:
    "Utilisez le formulaire de correction privé ou écrivez à privacy@opensurveillancedb.org. Les demandes de correction sont privées : elles ne modifient pas la carte automatiquement et ne sont jamais incluses dans l’export public. Première réponse sous 48 heures ; réponse sur le fond sous 14 jours.",
  qPrivacy: "Et la vie privée ?",
  aPrivacy:
    "Les signalements sont publics dès leur publication et ne contiennent jamais de visages, de plaques d’immatriculation ni de données personnelles. Les demandes de correction privées restent privées. Le responsable du traitement est Simone Rondina (syax89) / OpenSurveillanceDB, Italie. Les droits des personnes concernées (accès, rectification, effacement, opposition) peuvent être exercés via privacy@opensurveillancedb.org.",
  qAccount: "Ai-je besoin d’un compte ?",
  aAccount:
    "La consultation fonctionne sans compte. Envoyer un signalement, soumettre une correction ou participer aux actions de la communauté nécessite un compte gratuit et vérifié. Avec un compte, vous pouvez suivre vos signalements, modifier vos contributions, confirmer des fiches et gagner un niveau de confiance.",
  qVerifications: "Que sont les confirmations ?",
  aVerifications:
    "Une confirmation est une vérification personnelle qu’une caméra existe toujours à l’emplacement documenté. Chaque compte ne peut conserver qu’une action communautaire par fiche, de sorte que les compteurs reflètent des personnes distinctes. Les pages publiques n’affichent que des compteurs agrégés et l’historique public de la fiche — l’identité des personnes ayant confirmé ou signalé une fiche n’est jamais affichée.",
  qEdit: "Puis-je modifier ma contribution ?",
  aEdit:
    "Seul le contributeur qui a soumis une fiche peut la modifier. Une mise à jour d’une fiche déjà publique devient une proposition privée : la version publiée reste visible jusqu’à ce qu’un modérateur l’applique ou la rejette. Si une fiche que vous n’avez pas soumise doit être modifiée, utilisez le formulaire de correction privé — il ne modifie jamais les données publiques de lui-même.",
  qLevels: "Que sont les niveaux de contributeur ?",
  aLevels:
    "Les niveaux de confiance reconnaissent les contributions exactes : seules les fiches actives comptent, avec des seuils à 1, 5, 20 et 50 contributions. Les niveaux sont une reconnaissance, pas une compétition — il n’existe ni classement public ni tableau des scores.",
  qDeleteAccount: "Que deviennent mes vérifications si je supprime mon compte ?",
  aDeleteAccount:
    "La suppression du compte rompt le lien entre vous et les données de la communauté. Les vérifications que vous avez reçues sont supprimées ; celles que vous avez données restent sur la fiche, désidentifiées. Vos signalements publiés restent publics sans vous être attribués.",
  moreTitle: "D’autres questions ?",
  moreBody:
    "Pour les corrections, les suppressions et les demandes relatives à la vie privée, utilisez le formulaire de correction ou la page de contact.",
  guideCta: "Lire le guide du projet",
  rulesCta: "Lire les règles de participation",
  privacyCta: "Lire les détails sur la confidentialité",
  contactCta: "Ouvrir la page de contact",
  correctionCta: "Aller au formulaire de correction",
  footer: "Conçu pour la transparence, pas pour le pistage.",
};
