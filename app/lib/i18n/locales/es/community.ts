/**
 * community — ES translation. Parity-checked against the English pilot
 * bundle (../../community.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../community";

export const es: Translation<typeof en> = {
  // --- Trust levels (frozen: NEVER "tiers", "rank", "XP", "points") ---
  trustLevels: "Niveles de confianza",
  trustLevel: "Nivel de confianza",
  yourTrustLevel: "Tu nivel de confianza",
  levelReached: "Has alcanzado un nuevo nivel de confianza.",
  seeYourTrustLevel: "Ver tu nivel de confianza",
  badgeLabels: {
    new: "Nuevo colaborador",
    trusted: "Colaborador de confianza",
    experienced: "Colaborador experimentado",
  },
  levelDescriptions: {
    new: "Eres un nuevo colaborador. Tus reportes se publican de inmediato, como los de todos, y tus acciones de la comunidad tienen menos peso hasta que acumules un historial.",
    trusted:
      "Eres un colaborador de confianza. Tus aportaciones constantes y vigentes hacen que tus acciones de la comunidad tengan más peso en los umbrales automáticos.",
    experienced:
      "Eres un colaborador experimentado. La comunidad reconoce tu historial de aportaciones precisas y vigentes.",
  },
  progressToNextLevel: (count: number) =>
    `${count} ${count === 1 ? "aportación vigente" : "aportaciones vigentes"} para alcanzar el siguiente nivel de confianza`,

  // --- Verifications (frozen: NEVER "stars", "badges", "upvotes") ---
  verifications: "Verificaciones",
  verification: "Verificación",
  addVerification: "Añadir una verificación",
  verificationCount: (total: number) =>
    `${total} ${total === 1 ? "verificación" : "verificaciones"}`,
  verifiedByCommunity: "Verificada por la comunidad",
  recordHasVerifications: (total: number) =>
    `Esta ficha tiene ${total} ${total === 1 ? "verificación" : "verificaciones"}`,
  confirmExists: "Confirmar que esta ficha existe",
  verifyHelp:
    "Vas a añadir una verificación a esta ficha. Esto significa que has confirmado personalmente que la cámara está presente en la ubicación documentada.",
  verificationAdded: "Verificación añadida",
  removeOwnVerificationTitle: "¿Quitar tu verificación?",
  removeOwnVerificationBody:
    "Tu verificación se quitará de esta ficha. Las demás verificaciones, si las hay, se mantienen.",
  removeVerification: "Quitar verificación",
  verificationRemoved: "Verificación quitada",
  reportVerificationAbuse: "Reportar la verificación como abuso",
  reportAbuseHelp:
    "Úsalo solo si la verificación parece falsa, automatizada o enviada de mala fe.",
  abuseReportSent: "Reporte de abuso enviado",
  abuseReportThanks: "Gracias. Tu reporte se ha registrado.",
  noVerificationsYet: "Aún no hay verificaciones",
  notVerifiedByCommunity:
    "La comunidad todavía no ha verificado esta ficha de forma independiente.",
  errorAddVerification: "No se ha podido añadir tu verificación. Inténtalo de nuevo.",
  errorRemoveVerification: "No se ha podido quitar tu verificación. Inténtalo de nuevo.",
  errorSelfVerify: "No puedes verificar tu propia ficha.",
  errorAlreadyVerified: "Ya has verificado esta ficha.",

  // --- Contributor profile / contributions list (C5) ---
  contributions: "Aportaciones",
  contribution: "Aportación",
  yourContributions: "Tus aportaciones",
  contributionCount: (total: number) =>
    `${total} ${total === 1 ? "aportación" : "aportaciones"}`,
  noContributionsYet: "Aún no hay aportaciones",
  noContributionsBody: "Todavía no has aportado ninguna ficha.",
  noVerificationsBody:
    "Todavía no has añadido ninguna verificación. Visita una ficha que puedas confirmar para añadir la primera.",
  contributorProfile: "Perfil de colaborador",
  // Contribution status filters: mirror the shared record-status vocabulary
  // (status.ts) deliberately — the profile list keeps its own labels so a
  // page never mixes bundles (same pattern as moderation.ts statusLabels).
  statusFilters: {
    all: "Todas",
    pending: "En moderación",
    // Post-0039 the published camera status is "active" — the chip label
    // says "Published" so the filter vocabulary matches the domain.
    active: "Publicadas",
    verified: "Verificadas",
    needs_review: "Pendientes de revisión",
    removed: "Eliminadas",
    rejected: "Rechazadas",
    reviewed: "Resueltas",
    approved: "Aprobadas",
    stale: "Desactualizadas",
  },
  errorLoadContributions: "No se han podido cargar tus aportaciones.",
  errorLoadTrustLevel: "No se ha podido cargar tu nivel de confianza.",
  gateL1Help: "Podrás verificar fichas cuando se publique tu primera aportación.",
  // Contribution kinds (account page rework 2026-08-08): the three types
  // are visually distinct via inline SVG icon + text label (never colour
  // alone — WCAG 1.4.1), so each row and stats card carries these.
  typeLabels: {
    camera: "Reporte de cámara",
    correction: "Corrección",
  },
  // Type filter chips (same look as the status chips; local state, never
  // in the URL — private page).
  typeFilters: {
    all: "Todos los tipos",
    camera: "Reportes de cámaras",
    correction: "Correcciones",
  },
  typeFilterLabel: "Filtrar por tipo",
  // Account summary strip: global counts (independent of the active
  // filters) answering "what do I have in the queue?" at a glance.
  stats: {
    camera: "Reportes de cámaras",
    correction: "Correcciones",
    inModeration: "En moderación",
  },
  statsGroupLabel: "Resumen de tus aportaciones",
  // Contribution loop CTA: the page is no longer a dead end — it links
  // back into the reporting tools.
  newReportCta: "Reportar una cámara",
  newCorrectionCta: "Proponer una corrección",
  // Profile list pagination (F0 canonical contract) + per-filter empty
  // state: the list is the contributor's own, filters are local to the
  // page (never shareable URLs, COMMUNITY_PLAN §2.3).
  noContributionsFiltered: "Ninguna aportación coincide con este filtro.",
  previousPage: "Página anterior",
  nextPage: "Página siguiente",
  pageOf: (page: number, totalPages: number) => `Página ${page} de ${totalPages}`,
  contributionsNavigation: "Navegación de aportaciones",
  contributionStatusFilter: "Filtrar aportaciones por estado",
  contributionFilters: "Filtrar aportaciones",
  clearContributionFilters: "Borrar filtros",
  // Anonymous verification gate (C5): the record detail shows the toggle
  // but disables it with this explanatory copy — the server answers 401
  // without a session, so the button never pretends to work.
  loginToVerify: "Inicia sesión para verificar esta ficha",

  // --- Contribution editing (C6) ---
  edit: "Editar",
  editContribution: "Editar aportación",
  editYourContribution: "Edita tu aportación",
  editReviewNotice:
    "Un moderador revisará tus cambios antes de que sustituyan a la ficha actual.",
  saveChanges: "Guardar cambios",
  saveSubmitForReview: "Guardar y enviar a revisión",
  cancel: "Cancelar",
  editBlockedRemoved:
    "Esta aportación no se puede editar: la ficha se eliminó o se rechazó.",
  errorEditNotOwner: "Solo puedes editar tus propias aportaciones.",
  errorEditConflict: "Ya hay una solicitud de edición de esta ficha en revisión.",
  errorEditRateLimit: "Demasiados intentos. Inténtalo de nuevo dentro de un minuto.",
  editRequestPending: "Ya hay una solicitud de edición de esta ficha en revisión.",
  editSaved: "Cambios guardados.",
  editSubmitted: "Tu solicitud de edición se ha enviado a revisión.",
  editNoChanges: "No se ha hecho ningún cambio.",
  errorEditRace:
    "Esta ficha ha cambiado desde que la cargaste. Recarga la página e inténtalo de nuevo.",
  errorEditNotFound: "Esta ficha no está disponible para editarla.",
  errorEditGeneric: "No se han podido guardar tus cambios. Inténtalo de nuevo.",
  editBackToRecord: "Volver a la ficha",
  editLoginTitle: "Inicia sesión para editar tu aportación",
  editLoginBody:
    "Tienes que iniciar sesión para editar una aportación que hayas enviado.",
  editLoginAction: "Iniciar sesión",

  // --- Destructive confirmations ---
  removeVerificationConfirmTitle: "¿Quitar tu verificación de esta ficha?",
  cannotBeUndone: "Esta acción no se puede deshacer.",
  remove: "Quitar",
  deleteContributionTitle: "¿Eliminar esta aportación?",
  deleteContributionBody:
    "La ficha se retirará del directorio público. Esta acción no se puede deshacer.",
  deleteContribution: "Eliminar aportación",

  // --- Community actions (ADR 0021 §3, FASE 3 UI): five-action surface on
  // the record detail and the map popup. Vocabulary frozen by the ADR:
  // useful / utile, confirm / confermo ancora presente, no longer there /
  // non c'è più, flag / segnala, privacy / privacy. Counts are aggregates
  // only (never attribution); the anonymous surface shows counts + a
  // register/login call-to-action.
  actions: {
    sectionLabel: "Acciones de la comunidad",
    like: "Útil",
    confirm: "Confirmo",
    gone: "Ya no está",
    problem: "Señalar",
    privacy: "Privacidad",
    likeHelp: "Marca esta ficha como útil para el directorio.",
    confirmHelp: "Confirmo que esta ficha sigue presente en la ubicación documentada.",
    goneHelp: "Creo que esta cámara ya no está.",
    problemHelp: "Hay algo mal en esta ficha (datos, posición, descripción).",
    privacyHelp: "Esta ficha plantea un problema de privacidad o legal.",
    countOf: (label: string, count: number) => `${label}: ${count}`,
    anonymousCta: "Inicia sesión o regístrate para participar",
    anonymousCtaAction: "Iniciar sesión",
    removeYourAction: "Quitar tu acción",
    updating: "Actualizando…",
    errorDuplicate: "Ya has realizado esta acción.",
    errorSelfAction: "No puedes marcar como útil ni confirmar tu propio reporte.",
    errorSessionEnded: "Tu sesión ha terminado. Vuelve a iniciar sesión para participar.",
    errorVerifyRequired: "Verifica tu correo para participar en las acciones de la comunidad.",
    errorGeneric: "No se ha podido actualizar la acción. Inténtalo de nuevo.",
    // Compact toolbar (map popup, redesign t_b7728ad0): the trigger that
    // opens the disclosure with the remaining three actions, and the
    // explicit-copy privacy confirmation (the only action that asks before
    // sending — a privacy report is the GDPR-friendly fast-hide request).
    // The slash form ("Update/report") is deliberate: the trigger sits in a
    // ~90px grid column next to Utile/Conferma — a long label would wrap to
    // three ragged lines at 300px popup width.
    moreActions: "Actualizar/reportar",
    moreActionsHelp:
      "Más acciones para esta ficha: reporta que ya no está, señala un problema o plantea una cuestión de privacidad.",
    moreMenuLabel: "Acciones de actualización o reporte",
    privacyConfirmTitle: "¿Confirmas el reporte de privacidad?",
    privacyConfirmBody:
      "Un reporte de privacidad pide a los revisores que oculten esta ficha. No podrás deshacerlo.",
    privacyConfirmAction: "Reportar un problema de privacidad",
    cancel: "Cancelar",
  },
};
