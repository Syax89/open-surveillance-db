/**
 * community — FR translation. Parity-checked against the English pilot
 * bundle (../../community.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../community";

// French grammar: 0 and 1 take the singular.
const plural = (n: number, one: string, many: string) => (Math.abs(n) < 2 ? one : many);

export const fr: Translation<typeof en> = {
  // --- Trust levels (frozen: NEVER "tiers", "rank", "XP", "points") ---
  trustLevels: "Niveaux de confiance",
  trustLevel: "Niveau de confiance",
  yourTrustLevel: "Votre niveau de confiance",
  levelReached: "Vous avez atteint un nouveau niveau de confiance.",
  seeYourTrustLevel: "Voir votre niveau de confiance",
  badgeLabels: {
    new: "Nouveau contributeur",
    trusted: "Contributeur de confiance",
    experienced: "Contributeur expérimenté",
  },
  levelDescriptions: {
    new: "Vous êtes un nouveau contributeur. Vos signalements sont publiés immédiatement, comme ceux de tout le monde, et vos actions communautaires ont moins de poids tant que vous n’avez pas fait vos preuves.",
    trusted:
      "Vous êtes un contributeur de confiance. Grâce à vos contributions régulières et toujours en ligne, vos actions communautaires ont plus de poids dans les seuils automatiques.",
    experienced:
      "Vous êtes un contributeur expérimenté. Vos contributions exactes et toujours en ligne sont reconnues par la communauté.",
  },
  progressToNextLevel: (count: number) =>
    `${count} ${plural(count, "contribution en ligne", "contributions en ligne")} pour atteindre le niveau de confiance suivant`,

  // --- Verifications (frozen: NEVER "stars", "badges", "upvotes") ---
  verifications: "Vérifications",
  verification: "Vérification",
  addVerification: "Ajouter une vérification",
  verificationCount: (total: number) =>
    `${total} ${plural(total, "vérification", "vérifications")}`,
  verifiedByCommunity: "Vérifiée par la communauté",
  recordHasVerifications: (total: number) =>
    `Cette fiche compte ${total} ${plural(total, "vérification", "vérifications")}`,
  confirmExists: "Confirmer que cette caméra existe",
  verifyHelp:
    "Vous ajoutez une vérification à cette fiche. Cela signifie que vous avez personnellement constaté la présence de la caméra à l’emplacement indiqué.",
  verificationAdded: "Vérification ajoutée",
  removeOwnVerificationTitle: "Retirer votre vérification ?",
  removeOwnVerificationBody:
    "Votre vérification sera retirée de cette fiche. Les autres vérifications éventuelles sont conservées.",
  removeVerification: "Retirer la vérification",
  verificationRemoved: "Vérification retirée",
  reportVerificationAbuse: "Signaler la vérification comme abusive",
  reportAbuseHelp:
    "N’utilisez cette option que si la vérification semble fausse, automatisée ou faite de mauvaise foi.",
  abuseReportSent: "Signalement d’abus envoyé",
  abuseReportThanks: "Merci. Votre signalement a été enregistré.",
  noVerificationsYet: "Aucune vérification pour l’instant",
  notVerifiedByCommunity:
    "Cette fiche n’a pas encore été vérifiée de manière indépendante par la communauté.",
  errorAddVerification: "Impossible d’ajouter votre vérification. Veuillez réessayer.",
  errorRemoveVerification: "Impossible de retirer votre vérification. Veuillez réessayer.",
  errorSelfVerify: "Vous ne pouvez pas vérifier votre propre fiche.",
  errorAlreadyVerified: "Vous avez déjà vérifié cette fiche.",

  // --- Contributor profile / contributions list (C5) ---
  contributions: "Contributions",
  contribution: "Contribution",
  yourContributions: "Vos contributions",
  contributionCount: (total: number) =>
    `${total} ${plural(total, "contribution", "contributions")}`,
  noContributionsYet: "Aucune contribution pour l’instant",
  noContributionsBody: "Vous n’avez encore contribué à aucune fiche.",
  noVerificationsBody:
    "Vous n’avez encore ajouté aucune vérification. Ouvrez une fiche que vous pouvez confirmer pour ajouter la première.",
  contributorProfile: "Profil du contributeur",
  // Contribution status filters: mirror the shared record-status vocabulary
  // (status.ts) deliberately — the profile list keeps its own labels so a
  // page never mixes bundles (same pattern as moderation.ts statusLabels).
  statusFilters: {
    all: "Tous",
    pending: "En modération",
    // Post-0039 the published camera status is "active" — the chip label
    // says "Published" so the filter vocabulary matches the domain.
    active: "Publiées",
    verified: "Vérifiées",
    needs_review: "À vérifier",
    removed: "Supprimées",
    rejected: "Refusées",
    reviewed: "Traitées",
    approved: "Approuvées",
    stale: "Obsolètes",
  },
  errorLoadContributions: "Impossible de charger vos contributions.",
  errorLoadTrustLevel: "Impossible de charger votre niveau de confiance.",
  gateL1Help: "Vous pourrez vérifier des fiches une fois votre première contribution publiée.",
  // Contribution kinds (account page rework 2026-08-08): the three types
  // are visually distinct via inline SVG icon + text label (never colour
  // alone — WCAG 1.4.1), so each row and stats card carries these.
  typeLabels: {
    camera: "Signalement de caméra",
    correction: "Correction",
  },
  // Type filter chips (same look as the status chips; local state, never
  // in the URL — private page).
  typeFilters: {
    all: "Tous les types",
    camera: "Signalements de caméras",
    correction: "Corrections",
  },
  typeFilterLabel: "Filtrer par type",
  // Account summary strip: global counts (independent of the active
  // filters) answering "what do I have in the queue?" at a glance.
  stats: {
    camera: "Signalements de caméras",
    correction: "Corrections",
    inModeration: "En modération",
  },
  statsGroupLabel: "Résumé de vos contributions",
  // Contribution loop CTA: the page is no longer a dead end — it links
  // back into the reporting tools.
  newReportCta: "Signaler une caméra",
  newCorrectionCta: "Proposer une correction",
  // Profile list pagination (F0 canonical contract) + per-filter empty
  // state: the list is the contributor's own, filters are local to the
  // page (never shareable URLs, COMMUNITY_PLAN §2.3).
  noContributionsFiltered: "Aucune contribution ne correspond à ce filtre.",
  previousPage: "Page précédente",
  nextPage: "Page suivante",
  pageOf: (page: number, totalPages: number) => `Page ${page} sur ${totalPages}`,
  contributionsNavigation: "Navigation des contributions",
  contributionStatusFilter: "Filtrer les contributions par statut",
  contributionFilters: "Filtrer les contributions",
  clearContributionFilters: "Effacer les filtres",
  // Anonymous verification gate (C5): the record detail shows the toggle
  // but disables it with this explanatory copy — the server answers 401
  // without a session, so the button never pretends to work.
  loginToVerify: "Connectez-vous pour vérifier cette fiche",

  // --- Contribution editing (C6) ---
  edit: "Modifier",
  editContribution: "Modifier la contribution",
  editYourContribution: "Modifier votre contribution",
  editReviewNotice:
    "Vos modifications seront examinées par un modérateur avant de remplacer la fiche actuelle.",
  saveChanges: "Enregistrer les modifications",
  saveSubmitForReview: "Enregistrer et soumettre à la modération",
  cancel: "Annuler",
  editBlockedRemoved:
    "Cette contribution ne peut pas être modifiée : la fiche a été supprimée ou refusée.",
  errorEditNotOwner: "Vous ne pouvez modifier que vos propres contributions.",
  errorEditConflict: "Une demande de modification pour cette fiche est déjà en cours d’examen.",
  errorEditRateLimit: "Trop de tentatives. Veuillez réessayer dans une minute.",
  editRequestPending: "Une demande de modification pour cette fiche est déjà en cours d’examen.",
  editSaved: "Modifications enregistrées.",
  editSubmitted: "Votre demande de modification a été soumise à la modération.",
  editNoChanges: "Aucune modification n’a été apportée.",
  errorEditRace:
    "Cette fiche a changé depuis son chargement. Actualisez la page et réessayez.",
  errorEditNotFound: "Cette fiche n’est pas disponible pour modification.",
  errorEditGeneric: "Impossible d’enregistrer vos modifications. Veuillez réessayer.",
  editBackToRecord: "Retour à la fiche",
  editLoginTitle: "Connectez-vous pour modifier votre contribution",
  editLoginBody:
    "Vous devez être connecté pour modifier une contribution que vous avez envoyée.",
  editLoginAction: "Se connecter",

  // --- Destructive confirmations ---
  removeVerificationConfirmTitle: "Retirer votre vérification de cette fiche ?",
  cannotBeUndone: "Cette action est irréversible.",
  remove: "Retirer",
  deleteContributionTitle: "Supprimer cette contribution ?",
  deleteContributionBody:
    "La fiche sera retirée du répertoire public. Cette action est irréversible.",
  deleteContribution: "Supprimer la contribution",

  // --- Community actions (ADR 0021 §3, FASE 3 UI): five-action surface on
  // the record detail and the map popup. Vocabulary frozen by the ADR:
  // useful / utile, confirm / confermo ancora presente, no longer there /
  // non c'è più, flag / segnala, privacy / privacy. Counts are aggregates
  // only (never attribution); the anonymous surface shows counts + a
  // register/login call-to-action.
  actions: {
    sectionLabel: "Actions communautaires",
    like: "Utile",
    confirm: "Confirmer",
    gone: "Disparue",
    problem: "Signaler",
    privacy: "Vie privée",
    likeHelp: "Indiquer que cette fiche est utile au répertoire.",
    confirmHelp: "Je confirme que cette caméra est toujours présente à l’emplacement indiqué.",
    goneHelp: "Je pense que cette caméra n’est plus là.",
    problemHelp: "Quelque chose ne va pas dans cette fiche (détails, position, description).",
    privacyHelp: "Cette fiche soulève un problème de vie privée ou juridique.",
    countOf: (label: string, count: number) => `${label} : ${count}`,
    anonymousCta: "Connectez-vous ou inscrivez-vous pour participer",
    anonymousCtaAction: "Se connecter",
    removeYourAction: "Retirer votre action",
    updating: "Mise à jour…",
    errorDuplicate: "Vous avez déjà effectué cette action.",
    errorSelfAction: "Vous ne pouvez pas marquer votre propre signalement comme utile ni le confirmer.",
    errorSessionEnded: "Votre session est terminée. Reconnectez-vous pour participer.",
    errorVerifyRequired: "Vérifiez votre adresse e-mail pour participer aux actions communautaires.",
    errorGeneric: "Impossible de mettre à jour l’action. Réessayez.",
    // Compact toolbar (map popup, redesign t_b7728ad0): the trigger that
    // opens the disclosure with the remaining three actions, and the
    // explicit-copy privacy confirmation (the only action that asks before
    // sending — a privacy report is the GDPR-friendly fast-hide request).
    // The slash form ("Update/report") is deliberate: the trigger sits in a
    // ~90px grid column next to Utile/Conferma — a long label would wrap to
    // three ragged lines at 300px popup width.
    moreActions: "MàJ/signaler",
    moreActionsHelp:
      "Autres actions pour cette fiche : signaler sa disparition, signaler un problème ou soulever une question de vie privée.",
    moreMenuLabel: "Actions de mise à jour ou de signalement",
    privacyConfirmTitle: "Confirmer le signalement de vie privée ?",
    privacyConfirmBody:
      "Un signalement de vie privée demande aux modérateurs de masquer cette fiche. Vous ne pourrez pas l’annuler.",
    privacyConfirmAction: "Signaler un problème de vie privée",
    cancel: "Annuler",
  },
};
