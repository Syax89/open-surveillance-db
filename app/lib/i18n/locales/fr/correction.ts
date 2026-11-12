/**
 * correction — FR translation. Parity-checked against the English pilot
 * bundle (../../correction.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../correction";

export const fr: Translation<typeof en> = {
  // Page-level chrome (/correggi).
  pageTitle: "Corriger une fiche",
  pageIntro:
    "Les corrections sont privées. Elles ne modifient pas la carte automatiquement et ne sont jamais incluses dans l’export public des données.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Chargement…",
  navigation: "Navigation de la page de correction",
  homeAria: "Accueil OpenSurveillanceDB",
  // Correction section (extracted from the home page bundle in F1).
  accountability: "Responsabilité",
  correctionTitle: "Corriger une fiche ou faire part d’une préoccupation.",
  correctionIntro:
    "Les corrections sont privées. Elles ne modifient pas la carte automatiquement et ne sont jamais incluses dans l’export public des données.",
  urgentConcern: "Problème urgent de vie privée ou de sécurité ?",
  urgentConcernBody:
    "Décrivez uniquement le strict nécessaire pour identifier le problème. N’incluez pas de données personnelles, de liens vers des flux en direct, d’identifiants de connexion ni d’images.",
  stepRecord: "1. Fiche à examiner",
  stepIssue: "2. Décrire le problème",
  stepContact: "3. Contact et envoi",
  relatedRecord: "Fiche publique concernée",
  noSpecificRecord: "Aucune fiche précise / préoccupation générale",
  needsReview: "Qu’est-ce qui doit être examiné ?",
  selectOne: "Choisissez une option",
  // Record-id field (CEO 2026-08-12: "un campo di ricerca per id piuttosto
  // che un menu a discesa"): the related-record field is a plain id input
  // instead of a native <select> with ALL records as options (the
  // ~37k-option menu froze the browser).
  recordIdPlaceholder: "Identifiant de la fiche (ex. 6745)",
  recordIdHelp: "Saisissez l’identifiant public affiché sur la page de la fiche ; une ligne de confirmation apparaît si la fiche existe.",
  recordIdNotFound: (id: number) => `Aucune fiche publique avec l’identifiant ${id}.`,
  recordIdUnavailable: "La recherche de fiche est indisponible pour le moment.",
  recordIdClear: "Effacer la sélection",
  // C4: the select maps 1:1 to the backend issue_type whitelist
  // (inaccurate|missing|removal|abuse|other) — see db/corrections.ts
  // CORRECTION_ISSUE_TYPES. Free text is never accepted for removal/abuse.
  inaccurate: "Informations inexactes",
  missing: "N’est plus présente",
  removal: "Demande de suppression",
  abuse: "Signalement d’abus",
  other: "Autre",
  briefDescription: "Brève description",
  correctionPlaceholder:
    "Expliquez le problème sans inclure de données personnelles ni de détails opérationnels.",
  contactEmail: "E-mail de contact (facultatif)",
  contactPlaceholder: "Seulement si vous souhaitez une réponse",
  correctionConsent:
    "Je comprends que cette demande est privée, examinée par des humains, et qu’elle peut ne pas entraîner de modification automatique.",
  correctionArt13:
    "Les données de la demande et vos coordonnées sont traitées par le responsable du traitement Simone Rondina / OpenSurveillanceDB afin de traiter votre demande, sur la base d’une obligation légale (art. 6(1)(c) RGPD — art. 15-22) et de l’intérêt légitime (art. 6(1)(f)). Notice complète :",
  correctionArt13Rights: "Vous pouvez exercer vos droits au titre du RGPD en écrivant à",
  privacyContact: "privacy@opensurveillancedb.org",
  sendPrivateRequest: "Envoyer la demande privée",
  privacyNotice: "Politique de confidentialité",
  privacyDetails: "Détails sur la confidentialité",
  termsOfUse: "Conditions d’utilisation",
  saveRequestError: "Impossible d’enregistrer la demande",
  correctionSaved: "Demande de correction privée enregistrée sous la référence",
  correctionPrivate: "Elle n’apparaît pas dans le répertoire public.",
  correctionUnavailable: "Le service de correction est indisponible. Veuillez réessayer plus tard.",
  // P1-2 (design review): the write gate answers 401 (no session) and 403
  // (unverified email) with a single canonical body; these map the mid-form
  // session death to localized guidance instead of the raw server string.
  loginRequired:
    "Votre session a expiré. Reconnectez-vous pour envoyer la correction.",
  verifyRequired:
    "Votre adresse e-mail n’est pas encore vérifiée. Vérifiez-la depuis la page de votre compte pour envoyer la correction.",
  // ?record=ID prefill announcement (aria-live).
  recordPreselected: (recordId: number, title: string) =>
    `Fiche ${recordId} présélectionnée : ${title}. Décrivez le problème ci-dessous.`,
};
