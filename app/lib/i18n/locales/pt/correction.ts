/**
 * correction — PT translation. Parity-checked against the English pilot
 * bundle (../../correction.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../correction";

export const pt: Translation<typeof en> = {
  // Page-level chrome (/correggi).
  pageTitle: "Corrigir uma ficha",
  pageIntro:
    "As correções são privadas. Não alteram o mapa automaticamente e nunca são incluídas na exportação pública dos dados.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "A carregar…",
  navigation: "Navegação da correção",
  homeAria: "Página inicial do OpenSurveillanceDB",
  // Correction section (extracted from the home page bundle in F1).
  accountability: "Responsabilização",
  correctionTitle: "Corrige uma ficha ou manifesta uma preocupação.",
  correctionIntro:
    "As correções são privadas. Não alteram o mapa automaticamente e nunca são incluídas na exportação pública dos dados.",
  urgentConcern: "Preocupação urgente de privacidade ou segurança?",
  urgentConcernBody:
    "Descreve apenas o mínimo necessário para identificar o problema. Não incluas dados pessoais, ligações para transmissões em direto, credenciais nem imagens.",
  stepRecord: "1. Ficha a rever",
  stepIssue: "2. Descreve o problema",
  stepContact: "3. Contacto e envio",
  relatedRecord: "Ficha pública relacionada",
  noSpecificRecord: "Nenhuma ficha específica / preocupação geral",
  needsReview: "O que precisa de revisão?",
  selectOne: "Seleciona uma opção",
  // Record-id field (CEO 2026-08-12: "un campo di ricerca per id piuttosto
  // che un menu a discesa"): the related-record field is a plain id input
  // instead of a native <select> with ALL records as options (the
  // ~37k-option menu froze the browser).
  recordIdPlaceholder: "Id da ficha (ex.: 6745)",
  recordIdHelp: "Escreve o id público da ficha indicado na respetiva página; aparece uma linha de confirmação quando a ficha existe.",
  recordIdNotFound: (id: number) => `Não existe nenhuma ficha pública com o id ${id}.`,
  recordIdUnavailable: "A pesquisa de fichas não está disponível de momento.",
  recordIdClear: "Limpar seleção",
  // C4: the select maps 1:1 to the backend issue_type whitelist
  // (inaccurate|missing|removal|abuse|other) — see db/corrections.ts
  // CORRECTION_ISSUE_TYPES. Free text is never accepted for removal/abuse.
  inaccurate: "Informação incorreta",
  missing: "Já não está presente",
  removal: "Pedido de remoção",
  abuse: "Reporte de abuso",
  other: "Outro",
  briefDescription: "Breve descrição",
  correctionPlaceholder:
    "Explica o problema sem incluir dados pessoais nem detalhes operacionais.",
  contactEmail: "Email de contacto (opcional)",
  contactPlaceholder: "Apenas se quiseres uma resposta",
  correctionConsent:
    "Compreendo que este pedido é privado, analisado por pessoas e pode não resultar numa alteração automática.",
  correctionArt13:
    "Os dados do pedido e os teus dados de contacto são tratados pelo responsável pelo tratamento Simone Rondina / OpenSurveillanceDB para gerir o teu pedido, com base no cumprimento de uma obrigação jurídica (art. 6.º, n.º 1, alínea c), do RGPD — arts. 15.º-22.º) e no interesse legítimo (art. 6.º, n.º 1, alínea f)). Informação completa:",
  correctionArt13Rights: "Podes exercer os teus direitos ao abrigo do RGPD escrevendo para",
  privacyContact: "privacy@opensurveillancedb.org",
  sendPrivateRequest: "Enviar pedido privado",
  privacyNotice: "Política de privacidade",
  privacyDetails: "Detalhes de privacidade",
  termsOfUse: "Termos de utilização",
  saveRequestError: "Não foi possível guardar o pedido",
  correctionSaved: "Pedido de correção privado guardado com a referência",
  correctionPrivate: "Não é apresentado no diretório público.",
  correctionUnavailable: "O serviço de correções está indisponível. Tenta novamente mais tarde.",
  // P1-2 (design review): the write gate answers 401 (no session) and 403
  // (unverified email) with a single canonical body; these map the mid-form
  // session death to localized guidance instead of the raw server string.
  loginRequired:
    "A tua sessão terminou. Inicia sessão novamente para enviar a correção.",
  verifyRequired:
    "O teu email ainda não está verificado. Verifica-o na página da tua conta para enviar a correção.",
  // ?record=ID prefill announcement (aria-live).
  recordPreselected: (recordId: number, title: string) =>
    `Ficha ${recordId} pré-selecionada: ${title}. Descreve o problema abaixo.`,
};
