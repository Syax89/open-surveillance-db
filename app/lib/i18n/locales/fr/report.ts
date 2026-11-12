/**
 * report — FR translation. Parity-checked against the English pilot
 * bundle (../../report.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../report";

export const fr: Translation<typeof en> = {
  // Page-level chrome (/segnala).
  pageTitle: "Signaler une caméra",
  pageIntro:
    "Choisissez un emplacement sur la carte ou saisissez des coordonnées, puis ajoutez uniquement ce que vous pouvez observer depuis l’espace public. Votre signalement est publié immédiatement.",
  navigation: "Navigation de la page de signalement",
  homeAria: "Accueil OpenSurveillanceDB",
  // Report section (extracted from the home page bundle in F1).
  contribute: "Contribuer",
  reportTitle: "Aidez à rendre l’espace public lisible.",
  reportIntro:
    "Choisissez un emplacement sur la carte ou saisissez des coordonnées, puis ajoutez uniquement ce que vous pouvez observer depuis l’espace public. Votre signalement est publié immédiatement.",
  beforeSubmitting: "Avant d’envoyer",
  beforeSubmittingBody:
    "Ne décrivez pas de personnes, de plaques d’immatriculation, de logements privés, de failles de sécurité ni de lieux sensibles.",
  stepLocation: "1. Emplacement",
  stepObservation: "2. Ce que vous avez observé",
  stepEvidence: "3. Confirmer et publier",
  selectedPoint: "Point sélectionné",
  // Report mini-map (t_ebbe0ea3): click to pick the position, drag the
  // cone's rotation handle to aim the field of view. The manual coordinate
  // fields below stay as the accessible fallback.
  mapAria: "Carte — cliquez pour choisir la position de la caméra",
  mapHelp:
    "Cliquez sur la carte pour choisir la position de la caméra. Pour les caméras directionnelles, faites glisser la poignée ronde du cône pour définir la direction de vue.",
  manualCoordinatesTitle: "Ou saisissez des coordonnées",
  manualCoordinatesHelp:
    "Utilisez des degrés décimaux. La latitude doit être comprise entre -90 et 90 ; la longitude entre -180 et 180. La virgule est acceptée comme séparateur décimal.",
  latitude: "Latitude",
  longitude: "Longitude",
  useCoordinates: "Utiliser ces coordonnées",
  // One-tap geolocation (CEO 2026-08-09): the primary way to set a position
  // on a phone, standing in front of the camera. The map and the manual
  // fields stay as the alternatives when the device or the user says no.
  useMyPosition: "Utiliser ma position",
  locatingPosition: "Recherche de votre position…",
  // Address search with autocomplete (issue #432): the /segnala location
  // row pairs a debounced place search (same-origin /api/geocode proxy)
  // with the one-tap geolocation button on its right.
  addressSearchLabel: "Rechercher une adresse",
  addressSearchPlaceholder: "Rue, lieu ou coordonnées…",
  addressSearchHelp:
    "Saisissez une rue, une place ou un lieu, ou collez des coordonnées (ex. 41.9068, 12.4808), puis appuyez sur Entrée ou sur Rechercher. Rien n’est envoyé pendant la saisie.",
  addressSearchButton: "Rechercher",
  addressSearchNoResults: (query: string) => `Aucun lieu trouvé pour « ${query} ».`,
  addressSearchRateLimited: (seconds: number) =>
    `Trop de recherches. Réessayez dans ${seconds} seconde${seconds <= 1 ? "" : "s"}.`,
  addressSearchUnavailable: "La recherche d’adresse est indisponible pour le moment.",
  addressSearchAttribution: "Lieux © contributeurs OpenStreetMap",
  geolocationDenied:
    "L’autorisation de localisation a été refusée. Choisissez le point sur la carte ou saisissez les coordonnées ci-dessous.",
  geolocationTimeout:
    "Votre position a mis trop de temps à arriver. Réessayez, choisissez le point sur la carte ou saisissez les coordonnées ci-dessous.",
  geolocationUnavailable:
    "Votre appareil n’a pas pu fournir de position. Choisissez le point sur la carte ou saisissez les coordonnées ci-dessous.",
  checkingNearby: "Vérification des fiches publiques à proximité…",
  possibleDuplicate: "Doublon possible à proximité",
  duplicateBody:
    "Ces fiches publiques se trouvent à moins de 75 mètres. Vous pouvez tout de même envoyer un nouveau signalement ; il sera publié immédiatement.",
  metresAway: "m de distance",
  matchVeryClose: "correspondance très proche",
  matchLikely: "correspondance probable",
  duplicateGuidance:
    "S’il s’agit de la même caméra, utilisez le formulaire de correction plutôt que de créer un doublon.",
  // Horizon 1 duplicate gate (ADR 0019): a high-strength match must be
  // acknowledged before the report can be stored.
  duplicateConfirmNotice:
    "Une correspondance très proche a été trouvée à proximité. Confirmez qu’il s’agit d’une caméra distincte pour l’envoyer, ou utilisez le formulaire de correction pour la fiche existante.",
  duplicateConfirmTitle: "Une correspondance très proche existe déjà à proximité",
  duplicateConfirmBody:
    "Une fiche est déjà publiée presque au même endroit. S’il s’agit de la même caméra, utilisez le formulaire de correction. S’il s’agit d’une caméra différente, confirmez ci-dessous pour la publier.",
  duplicateConfirmLabel:
    "Je confirme qu’il s’agit d’une caméra distincte et je souhaite tout de même l’envoyer.",
  nearbyUnavailable:
    "Nous n’avons pas pu vérifier les fiches à proximité. Vous pouvez tout de même envoyer ce signalement.",
  recordTitle: "Titre de la fiche",
  recordTitlePlaceholder: "ex. Caméra de sécurité publique",
  selectOne: "Choisissez une option",
  cameraType: "Type de caméra",
  fixedDome: "Dôme fixe",
  bullet: "Bullet (tube)",
  ptz: "PTZ",
  trafficReader: "Circulation / lecteur de plaques d’immatriculation",
  otherUnknown: "Autre / inconnu",
  // Field-of-view direction (t_f8b775ec): shown only for directional kinds
  // (never for domes). A compass slider 0-359 with an arrow preview plus a
  // "don't know" option that stores NULL.
  directionTitle: "Direction du champ de vision",
  directionHelp: "Le cap vers lequel la caméra est orientée, dans le sens horaire à partir du nord (0–359°).",
  directionUnknown: "Je ne connais pas la direction",
  directionDegrees: "Direction",
  manufacturer: "Fabricant (facultatif)",
  manufacturerPlaceholder: "ex. nom du fabricant",
  observedOn: "Date de l’observation (facultatif)",
  approximateAddress: "Adresse approximative",
  addressPlaceholder: "Rue et ville (facultatif)",
  resolvingAddress: "Recherche de l’adresse…",
  whatObserved: "Qu’avez-vous observé ?",
  observedPlaceholder: "Orientation, exploitant, panneau d’information visible, modèle…",
  reportConsent:
    "Je confirme que cette observation a été faite depuis l’espace public et ne contient aucune donnée personnelle.",
  privacyNotice: "Politique de confidentialité",
  privacyDetails: "Détails sur la confidentialité",
  termsOfUse: "Conditions d’utilisation",
  reportArt13:
    "Les données que vous saisissez (emplacement, notes) sont traitées par le responsable du traitement Simone Rondina / OpenSurveillanceDB sur la base de l’intérêt légitime (art. 6(1)(f) RGPD) afin de documenter les infrastructures de surveillance publique. Notice complète :",
  reportArt13Rights: "Vous pouvez exercer vos droits au titre du RGPD (art. 15-22) en écrivant à",
  privacyContact: "privacy@opensurveillancedb.org",
  sendModeration: "Publier le signalement",
  positionSelected: "Position sélectionnée",
  nearbyCheckError: "Impossible de vérifier les fiches à proximité",
  choosePosition:
    "Choisissez la position approximative de la caméra sur la carte ou saisissez des coordonnées valides avant d’envoyer.",
  invalidCoordinates:
    "Saisissez une latitude (de -90 à 90) et une longitude (de -180 à 180) valides.",
  defaultReportTitle: "Signalement de caméra publique",
  unknown: "Inconnu",
  submitReportError: "Impossible d’envoyer le signalement",
  reportSaved:
    "Signalement publié — il est désormais visible dans le répertoire et sur la carte.",
  reportSavedWithNearby:
    "Des fiches ont été trouvées à proximité de cette position — la communauté vérifiera s’il s’agit d’un doublon.",
  // P1-2 (design review): the write gate (Fase E1) refuses submissions from
  // anonymous (401) and unverified (403) sessions. The login wall gates the
  // form itself; these messages cover a session that dies mid-form.
  loginRequired:
    "Votre session a expiré. Reconnectez-vous pour envoyer le signalement.",
  verifyRequired:
    "Votre adresse e-mail n’est pas encore vérifiée. Vérifiez-la depuis la page de votre compte pour envoyer le signalement.",
  moderationUnavailable:
    "La publication est indisponible. Veuillez réessayer plus tard.",
};
