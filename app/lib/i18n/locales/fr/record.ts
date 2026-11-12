/**
 * record — FR translation. Parity-checked against the English pilot
 * bundle (../../record.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../record";

export const fr: Translation<typeof en> = {
  navigation: "Navigation de la fiche",
  backToDirectory: "← Retour au répertoire",
  loading: "Chargement de la fiche publique…",
  publicRecord: "Fiche publique",
  recordId: "Identifiant de la fiche",
  source: "Source",
  // Creation date (FASE C, t_4dbce318): `cameras.created_at` — when the
  // record entered the database (import or community report). The detail
  // page shows it alongside provenance and the last update.
  addedOn: "Ajoutée le",
  // M03 (design review 2026-10-22, P1): record.updated is the RECORD's last
  // update (import/edits), never a community confirmation. Labelling it
  // "Last confirmation" produced the contradiction "Never confirmed" +
  // "Last confirmation: 8 August 2026" on imported records. Real
  // confirmations keep their own label (lastConfirmed, from lastVerifiedAt).
  lastUpdated: "Dernière mise à jour",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Données d’illustration",
  demoUpdated: "Données de démonstration",
  generalLocation: "Emplacement général",
  manufacturer: "Fabricant",
  observedOn: "Observée le",
  viewOnMap: "Voir sur la carte",
  reportIssue: "Signaler un problème",
  recordNote:
    "Cette page contient uniquement des fiches publiques actives ou des fiches d’illustration clairement identifiées. Elle ne fournit ni flux en direct ni détails opérationnels sur les caméras.",
  unavailable: "Fiche indisponible",
  notFound: "Nous n’avons pas trouvé cette fiche publique.",
  notFoundDetail:
    "Elle a peut-être été supprimée, n’est pas publique, ou le lien est incorrect.",
  browseDirectory: "Parcourir le répertoire",
  offlineTitle: "Vous êtes hors ligne",
  offlineBody: "Affichage des dernières fiches chargées.",
  offlineAction: "Réessayer",
  loadError: "Impossible de charger la fiche publique.",
  loadErrorDetail:
    "Le service des fiches est injoignable pour le moment. Vérifiez votre connexion et réessayez.",
  retryLoad: "Réessayer",
  statusFallback: "Statut",
  changeHistory: "Historique des modifications",
  changeHistoryNote:
    "Cet historique répertorie uniquement les événements publics. Il n’inclut jamais l’identité des contributeurs ni les notes internes.",
  changeHistoryFallback: "Fiche mise à jour",
  changeHistoryLabels: {
    approve: "Publiée",
    "mark-stale": "Signalée comme n’étant plus là",
    reverify: "Vérifiée à nouveau",
    hide: "Masquée",
  },
  // Contribution edit form (/records/[id]/edit, C6). The page keeps its own
  // field labels here (record.ts is the form bundle per SITEMAP) instead of
  // mixing the report bundle: same per-page isolation rule as statusFilters.
  editTitle: "Titre de la fiche",
  editTitlePlaceholder: "ex. Caméra de sécurité publique",
  editKind: "Type de caméra",
  editKindSelect: "Choisissez une option",
  editKindOptions: {
    fixedDome: "Dôme fixe",
    bullet: "Bullet (tube)",
    ptz: "PTZ",
    trafficReader: "Circulation / lecteur de plaques d’immatriculation",
    otherUnknown: "Autre / inconnu",
  },
  editManufacturer: "Fabricant (facultatif)",
  editManufacturerPlaceholder: "ex. nom du fabricant",
  editObservedOn: "Date de l’observation (facultatif)",
  editAddress: "Adresse approximative (facultatif)",
  editAddressPlaceholder: "Rue et ville",
  editAddressResolving: "Recherche de l’adresse…",
  editNotes: "Qu’avez-vous observé ?",
  editNotesPlaceholder: "Orientation, exploitant, panneau d’information visible, modèle…",
  editDescription: "Description (facultatif)",
  editDescriptionPlaceholder: "Contexte supplémentaire sur la fiche…",
  editBlockedRemovedTitle: "Cette fiche ne peut plus être modifiée",
  editTitleRequired: "Le titre de la fiche est obligatoire.",
  editFieldTooLong: (limit: number) =>
    `Ce champ ne doit pas dépasser ${limit} caractères.`,
  editObservedOnInvalid: "Saisissez une date valide (AAAA-MM-JJ).",
  // Field-of-view direction (t_f8b775ec) — edit form, same pattern as the
  // report form: only for directional kinds, compass slider + "don't know".
  editDirectionTitle: "Direction du champ de vision",
  editDirectionHelp: "Le cap vers lequel la caméra est orientée, dans le sens horaire à partir du nord (0–359°).",
  editDirectionUnknown: "Je ne connais pas la direction",
  editDirectionDegrees: "Direction",
  // Camera position (t_775c8400): the interactive map moves the record's
  // position — click the map or type the coordinates; directional kinds
  // with a known bearing draw the field-of-view cone (same geometry as the
  // report mini-map and /mappa).
  editPositionTitle: "Position de la caméra",
  editPositionHelp:
    "Cliquez sur la carte pour déplacer la position de la caméra, ou saisissez les coordonnées ci-dessous. Pour les caméras directionnelles, faites glisser la poignée ronde du cône pour définir la direction de vue.",
  editPositionMapAria: "Carte — cliquez pour déplacer la position de la caméra",
  editLatitude: "Latitude",
  editLongitude: "Longitude",
  editPositionInvalid: "Saisissez des coordonnées valides (latitude de −90 à 90, longitude de −180 à 180).",
  // Record detail fact (t_f8b775ec): "Direction: NE 45°" when the record
  // has a stored bearing (domes and unknown directions omit the row).
  direction: "Direction",
  // Mini map on the record page (CEO 2026-08-07): a read-only Leaflet
  // display of the camera position and its field-of-view cone/circle —
  // decorative (role="img"), the same facts are textual in the list.
  positionOnMap: "Position sur la carte",

  // --- Community status badge (ADR 0021 §9, FASE 3 UI): informational
  // freshness line — never a state change. A record with no confirmations
  // shows the neutral "never confirmed" badge; a confirmed one shows the
  // count and the last-confirmed date.
  communityStatus: "Statut communautaire",
  neverConfirmed: "Jamais confirmée",
  confirmedTimes: (count: number) =>
    `Confirmée ${count} fois`,
  lastConfirmed: "Dernière confirmation",
  // Import provenance (import pipeline FASE C, t_4dbce318): imported
  // records carry a provenance line next to the community badge — the
  // source dataset (linked) and its licence (linked), never the raw
  // "import:<slug>" internal value.
  importedFrom: "Importée depuis",
  // M05 (design review 2026-10-22): the provenance line above already names
  // the dataset and links its licence, so the facts row states the ORIGIN
  // instead of repeating the full source name a second time.
  importedData: "Données importées",

  // --- Hidden/removed banner (ADR 0021 §6.3, FASE 3 UI): a withdrawn
  // record stays reachable by direct link with an explicit banner; the
  // reversal signals (confirm / gone) stay open, and the public history
  // link is the transparency control.
  hiddenTitle: "Fiche masquée",
  hiddenBody:
    "Cette fiche a été retirée dans l’attente d’une vérification par la communauté ou d’une vérification juridique. Elle n’apparaît ni dans le répertoire ni sur la carte ; vous pouvez toujours consulter son historique public et y participer.",
  removedTitle: "Signalée comme n’étant plus présente",
  removedBody:
    "La communauté a signalé que cette caméra n’est plus là. Elle n’apparaît ni dans le répertoire ni sur la carte ; vous pouvez toujours consulter son historique public et la confirmer si elle est de retour.",
  bannerHistoryLink: "Voir l’historique public",
  bannerNote: "Les signaux d’annulation (confirmer, n’est plus là) restent ouverts sur cette fiche.",

  // --- Public per-record event timeline (ADR 0021 §7, FASE 3 UI): the
  // unattributed aggregate history. Labels cover every semantic event type
  // the API can emit; anything unknown falls back to the neutral fallback.
  timeline: "Historique public",
  timelineNote:
    "Événements publics agrégés uniquement — jamais l’identité des contributeurs, leurs e-mails ni les notes internes.",
  timelineEmpty: "Aucun événement public pour l’instant.",
  timelineFallback: "Fiche mise à jour",
  timelineLabels: {
    published: "Publiée",
    confirmed: "Présence confirmée",
    liked: "Indiquée comme utile",
    "gone-flagged": "Signalée comme n’étant plus là",
    hidden: "Masquée",
    removed: "Supprimée",
    restored: "Rétablie dans le répertoire",
    "action-consumed": "Actions déclenchantes réinitialisées",
    migration: "Historique migré",
    "setting-changed": "Paramètres modifiés",
  },
  hideReasons: {
    problem: "motif : signalement",
    privacy: "motif : vie privée",
    adminLegal: "motif : urgence juridique",
  },
  eventPeople: (count: number) => `${count} ${count <= 1 ? "personne" : "personnes"}`,
};
