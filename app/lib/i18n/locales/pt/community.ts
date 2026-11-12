/**
 * community — PT translation. Parity-checked against the English pilot
 * bundle (../../community.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../community";

export const pt: Translation<typeof en> = {
  // --- Trust levels (frozen: NEVER "tiers", "rank", "XP", "points") ---
  trustLevels: "Níveis de confiança",
  trustLevel: "Nível de confiança",
  yourTrustLevel: "O teu nível de confiança",
  levelReached: "Alcançaste um novo nível de confiança.",
  seeYourTrustLevel: "Vê o teu nível de confiança",
  badgeLabels: {
    new: "Novo contribuidor",
    trusted: "Contribuidor de confiança",
    experienced: "Contribuidor experiente",
  },
  levelDescriptions: {
    new: "És um novo contribuidor. Os teus reportes são publicados de imediato, como os de toda a gente, e as tuas ações da comunidade têm menos peso até construíres um historial.",
    trusted:
      "És um contribuidor de confiança. As tuas contribuições consistentes e ativas fazem com que as tuas ações da comunidade tenham mais peso nos limiares automáticos.",
    experienced:
      "És um contribuidor experiente. O teu historial de contribuições rigorosas e ativas é reconhecido pela comunidade.",
  },
  progressToNextLevel: (count: number) =>
    `${count} ${count === 1 ? "contribuição ativa" : "contribuições ativas"} para alcançares o próximo nível de confiança`,

  // --- Verifications (frozen: NEVER "stars", "badges", "upvotes") ---
  verifications: "Verificações",
  verification: "Verificação",
  addVerification: "Adicionar uma verificação",
  verificationCount: (total: number) =>
    `${total} ${total === 1 ? "verificação" : "verificações"}`,
  verifiedByCommunity: "Verificada pela comunidade",
  recordHasVerifications: (total: number) =>
    `Esta ficha tem ${total} ${total === 1 ? "verificação" : "verificações"}`,
  confirmExists: "Confirmar que esta ficha existe",
  verifyHelp:
    "Estás a adicionar uma verificação a esta ficha. Isto significa que confirmaste pessoalmente que a câmara está presente no local documentado.",
  verificationAdded: "Verificação adicionada",
  removeOwnVerificationTitle: "Remover a tua verificação?",
  removeOwnVerificationBody:
    "A tua verificação será removida desta ficha. As outras verificações, se existirem, mantêm-se.",
  removeVerification: "Remover verificação",
  verificationRemoved: "Verificação removida",
  reportVerificationAbuse: "Reportar a verificação como abuso",
  reportAbuseHelp:
    "Usa esta opção apenas se a verificação parecer falsa, automatizada ou enviada de má-fé.",
  abuseReportSent: "Reporte de abuso enviado",
  abuseReportThanks: "Obrigado. O teu reporte foi registado.",
  noVerificationsYet: "Ainda sem verificações",
  notVerifiedByCommunity:
    "Esta ficha ainda não foi verificada de forma independente pela comunidade.",
  errorAddVerification: "Não foi possível adicionar a tua verificação. Tenta novamente.",
  errorRemoveVerification: "Não foi possível remover a tua verificação. Tenta novamente.",
  errorSelfVerify: "Não podes verificar a tua própria ficha.",
  errorAlreadyVerified: "Já verificaste esta ficha.",

  // --- Contributor profile / contributions list (C5) ---
  contributions: "Contribuições",
  contribution: "Contribuição",
  yourContributions: "As tuas contribuições",
  contributionCount: (total: number) =>
    `${total} ${total === 1 ? "contribuição" : "contribuições"}`,
  noContributionsYet: "Ainda sem contribuições",
  noContributionsBody: "Ainda não contribuíste com nenhuma ficha.",
  noVerificationsBody:
    "Ainda não adicionaste nenhuma verificação. Visita uma ficha que possas confirmar para adicionares a primeira.",
  contributorProfile: "Perfil de contribuidor",
  // Contribution status filters: mirror the shared record-status vocabulary
  // (status.ts) deliberately — the profile list keeps its own labels so a
  // page never mixes bundles (same pattern as moderation.ts statusLabels).
  statusFilters: {
    all: "Todas",
    pending: "Em moderação",
    // Post-0039 the published camera status is "active" — the chip label
    // says "Published" so the filter vocabulary matches the domain.
    active: "Publicadas",
    verified: "Verificadas",
    needs_review: "A precisar de revisão",
    removed: "Removidas",
    rejected: "Rejeitadas",
    reviewed: "Resolvidas",
    approved: "Aprovadas",
    stale: "Desatualizadas",
  },
  errorLoadContributions: "Não foi possível carregar as tuas contribuições.",
  errorLoadTrustLevel: "Não foi possível carregar o teu nível de confiança.",
  gateL1Help: "Podes verificar fichas depois de a tua primeira contribuição ser publicada.",
  // Contribution kinds (account page rework 2026-08-08): the three types
  // are visually distinct via inline SVG icon + text label (never colour
  // alone — WCAG 1.4.1), so each row and stats card carries these.
  typeLabels: {
    camera: "Reporte de câmara",
    correction: "Correção",
  },
  // Type filter chips (same look as the status chips; local state, never
  // in the URL — private page).
  typeFilters: {
    all: "Todos os tipos",
    camera: "Reportes de câmaras",
    correction: "Correções",
  },
  typeFilterLabel: "Filtrar por tipo",
  // Account summary strip: global counts (independent of the active
  // filters) answering "what do I have in the queue?" at a glance.
  stats: {
    camera: "Reportes de câmaras",
    correction: "Correções",
    inModeration: "Em moderação",
  },
  statsGroupLabel: "Resumo das tuas contribuições",
  // Contribution loop CTA: the page is no longer a dead end — it links
  // back into the reporting tools.
  newReportCta: "Reportar uma câmara",
  newCorrectionCta: "Propor uma correção",
  // Profile list pagination (F0 canonical contract) + per-filter empty
  // state: the list is the contributor's own, filters are local to the
  // page (never shareable URLs, COMMUNITY_PLAN §2.3).
  noContributionsFiltered: "Nenhuma contribuição corresponde a este filtro.",
  previousPage: "Página anterior",
  nextPage: "Página seguinte",
  pageOf: (page: number, totalPages: number) => `Página ${page} de ${totalPages}`,
  contributionsNavigation: "Navegação das contribuições",
  contributionStatusFilter: "Filtrar contribuições por estado",
  contributionFilters: "Filtrar contribuições",
  clearContributionFilters: "Limpar filtros",
  // Anonymous verification gate (C5): the record detail shows the toggle
  // but disables it with this explanatory copy — the server answers 401
  // without a session, so the button never pretends to work.
  loginToVerify: "Inicia sessão para verificar esta ficha",

  // --- Contribution editing (C6) ---
  edit: "Editar",
  editContribution: "Editar contribuição",
  editYourContribution: "Edita a tua contribuição",
  editReviewNotice:
    "As tuas alterações serão revistas por um moderador antes de substituírem a ficha atual.",
  saveChanges: "Guardar alterações",
  saveSubmitForReview: "Guardar e enviar para revisão",
  cancel: "Cancelar",
  editBlockedRemoved:
    "Esta contribuição não pode ser editada: a ficha foi removida ou rejeitada.",
  errorEditNotOwner: "Só podes editar as tuas próprias contribuições.",
  errorEditConflict: "Já existe um pedido de edição desta ficha em revisão.",
  errorEditRateLimit: "Demasiadas tentativas. Tenta novamente daqui a um minuto.",
  editRequestPending: "Já existe um pedido de edição desta ficha em revisão.",
  editSaved: "Alterações guardadas.",
  editSubmitted: "O teu pedido de edição foi enviado para revisão.",
  editNoChanges: "Não foi feita nenhuma alteração.",
  errorEditRace:
    "Esta ficha mudou desde que a carregaste. Atualiza a página e tenta novamente.",
  errorEditNotFound: "Esta ficha não está disponível para edição.",
  errorEditGeneric: "Não foi possível guardar as tuas alterações. Tenta novamente.",
  editBackToRecord: "Voltar à ficha",
  editLoginTitle: "Inicia sessão para editares a tua contribuição",
  editLoginBody:
    "Precisas de ter sessão iniciada para editares uma contribuição que enviaste.",
  editLoginAction: "Iniciar sessão",

  // --- Destructive confirmations ---
  removeVerificationConfirmTitle: "Remover a tua verificação desta ficha?",
  cannotBeUndone: "Esta ação não pode ser anulada.",
  remove: "Remover",
  deleteContributionTitle: "Eliminar esta contribuição?",
  deleteContributionBody:
    "A ficha será removida do diretório público. Esta ação não pode ser anulada.",
  deleteContribution: "Eliminar contribuição",

  // --- Community actions (ADR 0021 §3, FASE 3 UI): five-action surface on
  // the record detail and the map popup. Vocabulary frozen by the ADR:
  // useful / utile, confirm / confermo ancora presente, no longer there /
  // non c'è più, flag / segnala, privacy / privacy. Counts are aggregates
  // only (never attribution); the anonymous surface shows counts + a
  // register/login call-to-action.
  actions: {
    sectionLabel: "Ações da comunidade",
    like: "Útil",
    confirm: "Confirmo",
    gone: "Já não existe",
    problem: "Assinalar",
    privacy: "Privacidade",
    likeHelp: "Marcar esta ficha como útil para o diretório.",
    confirmHelp: "Confirmo que esta ficha continua presente no local documentado.",
    goneHelp: "Creio que esta câmara já não existe.",
    problemHelp: "Há algo de errado com esta ficha (detalhes, posição, descrição).",
    privacyHelp: "Esta ficha levanta uma questão de privacidade ou legal.",
    countOf: (label: string, count: number) => `${label}: ${count}`,
    anonymousCta: "Inicia sessão ou regista-te para participar",
    anonymousCtaAction: "Iniciar sessão",
    removeYourAction: "Remover a tua ação",
    updating: "A atualizar…",
    errorDuplicate: "Já definiste esta ação.",
    errorSelfAction: "Não podes marcar o teu próprio reporte como útil nem confirmá-lo.",
    errorSessionEnded: "A tua sessão terminou. Inicia sessão novamente para participar.",
    errorVerifyRequired: "Verifica o teu email para participares nas ações da comunidade.",
    errorGeneric: "Não foi possível atualizar a ação. Tenta novamente.",
    // Compact toolbar (map popup, redesign t_b7728ad0): the trigger that
    // opens the disclosure with the remaining three actions, and the
    // explicit-copy privacy confirmation (the only action that asks before
    // sending — a privacy report is the GDPR-friendly fast-hide request).
    // The slash form ("Update/report") is deliberate: the trigger sits in a
    // ~90px grid column next to Utile/Conferma — a long label would wrap to
    // three ragged lines at 300px popup width.
    moreActions: "Atualizar/reportar",
    moreActionsHelp:
      "Mais ações para esta ficha: reportar que já não existe, assinalar um problema ou levantar uma questão de privacidade.",
    moreMenuLabel: "Ações de atualização ou reporte",
    privacyConfirmTitle: "Confirmar o reporte de privacidade?",
    privacyConfirmBody:
      "Um reporte de privacidade pede aos revisores que ocultem esta ficha. Não podes anulá-lo.",
    privacyConfirmAction: "Reportar questão de privacidade",
    cancel: "Cancelar",
  },
};
