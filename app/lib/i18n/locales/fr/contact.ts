/**
 * contact — FR translation. Parity-checked against the English pilot
 * bundle (../../contact.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../contact";

export const fr: Translation<typeof en> = {
  navigation: "Navigation de la page contacts",
  homeAria: "Accueil OpenSurveillanceDB",
  map: "Carte",
  directory: "Répertoire",
  home: "Accueil",
  faqLabel: "FAQ",
  contactLabel: "Contacts",
  eyebrow: "Contacts et responsabilité",
  title: "Qui gère ce projet, et comment nous joindre.",
  intro:
    "OpenSurveillanceDB est une base de données citoyenne, ouverte et non commerciale des infrastructures de surveillance publique visibles. Elle documente les équipements visibles depuis l’espace public ; elle ne fournit jamais de flux, d’outils de pistage ni de conseils pour échapper à une surveillance légale.",
  whoTitle: "Qui sommes-nous",
  whoBody:
    "Une petite équipe de bénévoles identifiés maintient le projet. Il s’agit de désignations initiales pour la phase pilote, et non de l’affirmation qu’une gouvernance publique complète existe déjà.",
  rolesTitle: "Rôles et responsables",
  rolesIntro: "Les rôles initiaux de la phase pilote ont été attribués le 2026-07-31 :",
  roleMaintainers: "Mainteneurs",
  roleMaintainersBody: "Simone (syax89) — propriétaire du projet. Le propriétaire du projet est la seule personne habilitée à fusionner des modifications du code.",
  roleOps: "Responsable des opérations",
  roleOpsBody: "Le mainteneur — hébergement, déploiements, sauvegardes.",
  roleData: "Responsables des données",
  roleDataBody: "Les mainteneurs — modèle de données, qualité et conservation.",
  roleSecurity: "Contact sécurité",
  roleSecurityBody: "Le mainteneur — canal de signalement privé décrit dans SECURITY.md.",
  roleModeration: "Contact modération",
  roleModerationBody: "Le mainteneur.",
  controllerTitle: "Responsable du traitement",
  controllerBody:
    "Simone Rondina (syax89) / OpenSurveillanceDB — Italie (décision du 2026-07-31 ; la dénomination juridique définitive sera confirmée au lancement).",
  correctionTitle: "Corrections et suppression",
  correctionBody:
    "Utilisez le formulaire de correction privé ou écrivez au contact confidentialité. Les demandes sont privées, examinées par un humain et jamais publiées. Délais visés : première réponse sous 48 heures, réponse sur le fond sous 14 jours, masquage d’urgence d’un contenu sous 24 heures.",
  correctionForm: "Ouvrir le formulaire de correction",
  correctionEmail: "privacy@opensurveillancedb.org",
  correctionEmailNote:
    "Boîte aux lettres dédiée et surveillée.",
  securityTitle: "Signaler une vulnérabilité de sécurité",
  securityBody:
    "Utilisez le dispositif GitHub Private Vulnerability Reporting, qui crée un avis confidentiel visible uniquement par les mainteneurs. N’ouvrez pas d’issue publique pour une vulnérabilité.",
  securityAdvisory: "Ouvrir le formulaire d’avis privé",
  securityPgpTitle: "Chiffrer les contenus sensibles",
  securityPgpBody:
    "Pour les contenus comportant des données personnelles ou des détails opérationnels, chiffrez-les avec la clé PGP du projet (empreinte 04E8 A3EE 7C72 188B D3AF 925D 496C F0BD 4920 D3F7) et joignez le texte chiffré à l’avis. Les délais de réponse sont les mêmes que ceux de la section corrections ci-dessus.",
  securityRouteNote:
    "Les signalements de sécurité et les demandes relatives à la vie privée passent par des canaux distincts : avis privés pour les vulnérabilités, formulaire de correction et contact confidentialité pour les demandes des personnes concernées.",
  footer: "Conçu pour la transparence, pas pour le pistage.",
};
