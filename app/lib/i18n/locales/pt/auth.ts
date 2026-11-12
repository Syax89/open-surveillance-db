/**
 * auth — PT translation. Parity-checked against the English pilot
 * bundle (../../auth.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../auth";
import { pt as authNavPt } from "./auth-nav";

export const pt: Translation<typeof en> = {
  // Header auth links (accountAria, accountTitle, login, register) live in
  // the tiny ./auth-nav fragment so the header on every route ships only
  // those labels, not this whole domain; spread here so `auth.*` keeps the
  // same keys for every other consumer.
  ...authNavPt,
  navigation: "Navegação principal",
  homeAria: "Página inicial do OpenSurveillanceDB",
  loginTitle: "Iniciar sessão",
  registerTitle: "Cria uma conta de contribuidor",
  // F5 (QA#6): per-page metadata for the client auth pages (/login, /register).
  loginMetaDescription:
    "Inicia sessão para enviar reportes e correções à base de dados pública OpenSurveillanceDB.",
  registerMetaDescription:
    "Cria uma conta de contribuidor gratuita para reportar câmaras de videovigilância públicas.",
  email: "Email",
  password: "Palavra-passe",
  displayName: "Nome a apresentar (opcional)",
  logout: "Terminar sessão",
  // Moderator/admin shortcut on the account page (ADR 0003 2026-10): shown
  // only when GET /api/auth/me reports a coarse role of moderator+.
  goToModeration: "Ir para a moderação",
  noAccount: "Ainda não tens conta?",
  haveAccount: "Já tens conta?",
  createOne: "Cria uma",
  signIn: "Iniciar sessão",
  passwordRequirements: "A tua palavra-passe deve incluir:",
  passwordRuleLength: "Pelo menos 10 caracteres",
  passwordRuleUppercase: "Uma letra maiúscula (A–Z)",
  passwordRuleLowercase: "Uma letra minúscula (a–z)",
  passwordRuleDigit: "Um número (0–9)",
  passwordRuleSpecial: "Um carácter especial (p. ex. ! @ # $ %)",
  passwordWeak: "A tua palavra-passe não cumpre os requisitos acima.",
  anonymousNote:
    "É necessária uma conta gratuita para reportar uma câmara, e permite-te acompanhar os teus próprios reportes.",
  privacyNotice: "Aviso de privacidade",
  privacyDetails: "Detalhes de privacidade",
  termsOfUse: "Termos de utilização",
  registerArt13:
    "Os dados da tua conta (email, nome a apresentar opcional) são tratados pelo responsável pelo tratamento Simone Rondina / OpenSurveillanceDB com base no interesse legítimo (art. 6.º, n.º 1, al. f) do RGPD) para fornecer contas de contribuidor. Aviso completo:",
  registerArt13Rights: "Podes exercer os teus direitos ao abrigo do RGPD (arts. 15.º-22.º) escrevendo para",
  privacyContact: "privacy@opensurveillancedb.org",
  profileSection: "Perfil",
  memberSince: "Membro desde",
  emailLabel: "Email",
  displayNameLabel: "Nome a apresentar",
  submissionsSection: "Os teus reportes",
  noSubmissions: "Ainda não enviaste nenhum reporte atribuído.",
  submissionStatus: "Estado",
  submissionCreated: "Enviado",
  loggedOutTitle: "Terminaste a sessão",
  loggedOutBody: "A tua sessão terminou. Podes fechar esta janela ou iniciar sessão novamente.",
  errorInvalidCredentials: "Credenciais inválidas.",
  errorEmailTaken: "Já existe uma conta com este email.",
  errorGeneric: "Algo correu mal. Tenta novamente.",
  errorCrossOrigin: "Pedido entre sites rejeitado.",
  // Static copy on /login (t_6dc1c96f — CEO feedback 2026-08-03): login is
  // blocked until the email is verified, and the API answers the same generic
  // 401 for every failure (anti-enumeration). This note is shown to everyone,
  // so it never reveals account existence — it just explains, in advance, why
  // a correct password might be rejected right after registering.
  loginVerifyHint:
    "Acabaste de te registar? Verifica a tua caixa de correio pelo email de verificação — só podes iniciar sessão depois de o teu email estar verificado.",
  loading: "A carregar…",
  anonymous: "Anónimo",
  notAuthenticatedTitle: "Sessão não iniciada",
  notAuthenticatedBody: "Inicia sessão para veres o teu perfil e os teus reportes atribuídos.",
  deleteAccountSection: "Eliminar conta",
  deleteAccountHint:
    "Elimina a tua conta e remove a ligação entre ti e os teus reportes. Os reportes em si continuam publicados de forma anónima.",
  deleteAccountConfirm: "Eliminar a conta definitivamente?",
  deleteAccountConfirmBody:
    "A tua conta e todas as suas sessões serão apagadas. Os teus reportes continuam publicados, sem atribuição a ti. Esta ação não pode ser anulada.",
  deleteAccount: "Eliminar conta",
  deletingAccount: "A eliminar a conta…",
  deleteAccountCancel: "Cancelar",
  accountDeletedTitle: "Conta eliminada",
  accountDeletedBody:
    "A tua conta foi apagada e a tua sessão foi terminada. Os teus reportes continuam publicados sem atribuição.",
  errorDeleteAccount: "Não foi possível eliminar a conta. Tenta novamente.",
  // Display name inline edit (C6/C8 — the only inline-editable profile field).
  displayNameEdit: "Editar nome a apresentar",
  displayNameSave: "Guardar",
  displayNameCancel: "Cancelar",
  displayNameHelp: "Entre 2 e 60 caracteres.",
  displayNameSaved: "Nome a apresentar guardado.",
  errorDisplayName: "O nome a apresentar deve ter entre 2 e 60 caracteres.",
  errorDisplayNameRateLimit: "Demasiadas tentativas. Tenta novamente daqui a um minuto.",
  errorDisplayNameGeneric: "Não foi possível guardar o nome a apresentar. Tenta novamente.",
  // Multi-method auth (Fase E2 — single-tile login): email + password is the
  // primary flow. Passkey and configured OIDC providers remain visible below
  // a localized divider as alternatives within the same auth card.
  methodPassword: "Email + palavra-passe",
  methodPasskey: "Chave de acesso",
  methodSocialTitle: "Iniciar sessão com um fornecedor",
  loginOr: "ou",
  loginAlternatives: "Outras formas de iniciar sessão",
  // Passkey login (Fase C).
  passkeyLogin: "Iniciar sessão com chave de acesso",
  passkeyEmailOptional: "Email da conta (opcional)",
  passkeyEmailHint:
    "Opcional: limita o pedido às chaves de acesso desta conta. Deixa em branco para usar qualquer chave de acesso guardada neste dispositivo.",
  passkeyUnsupported:
    "Este navegador não suporta chaves de acesso. Usa email + palavra-passe ou atualiza o teu navegador.",
  passkeyErrorBegin: "Não foi possível iniciar a sessão com chave de acesso. Tenta novamente.",
  passkeyErrorFailed: "A verificação da chave de acesso falhou. Tenta novamente.",
  // Social / OIDC (Fase D, ADR 0020 decision 4 — the disclosure IS the
  // privacy requirement: the provider tracking surface and the EU-US DPF
  // transfer are declared here, on /login).
  oidcGithub: "Continuar com GitHub",
  oidcGoogle: "Continuar com Google",
  oidcDisclosure:
    "O início de sessão com terceiros envia-te para o fornecedor, que fica a saber que estás a visitar este site e pode transferir dados para fora da UE. O email do teu fornecedor nunca é importado nem guardado. Consulta o aviso de privacidade.",
  oidcErrorGeneric: "O início de sessão social falhou ou foi cancelado. Tenta novamente.",
  // Manual OIDC merge (email-conflict proof with the account password).
  mergeTitle: "Associa a tua conta social",
  mergeIntro:
    "Iniciaste sessão com um fornecedor social, mas já existe uma conta com este email. Prova que é tua com a respetiva palavra-passe para as associar.",
  mergeSubmit: "Associar contas",
  mergeErrorExpired: "Esta ligação de associação já não é válida. Tenta novamente com o fornecedor.",
  mergeErrorGeneric: "Não foi possível associar as contas. Tenta novamente.",
  // /account passkey management (Fase E2).
  passkeysSection: "Chaves de acesso",
  passkeysHint:
    "Adiciona uma chave de acesso para iniciares sessão com o teu dispositivo (biometria, PIN ou chave de segurança) em vez de uma palavra-passe.",
  passkeysEmpty: "Ainda não há chaves de acesso registadas.",
  // Disclosure summary count (account rework 2026-08-08).
  passkeySingular: "chave de acesso",
  passkeyPlural: "chaves de acesso",
  passkeyAdd: "Adicionar chave de acesso",
  passkeyAddHelp:
    "Ser-te-á pedido que confirmes com o teu dispositivo. Quando a chave de acesso for adicionada, recebes 10 códigos de recuperação de utilização única — guarda-os num local seguro.",
  passkeyAdded: "Chave de acesso adicionada.",
  passkeyEnrolledLabel: "Registada",
  passkeyRemove: "Remover",
  passkeyRemoveConfirm: "Remover esta chave de acesso?",
  passkeyRemoveConfirmBody:
    "Esta chave de acesso deixará de poder ser usada para iniciar sessão. Os teus outros métodos de início de sessão continuam a funcionar.",
  passkeyRemoveCancel: "Cancelar",
  passkeyRemoveBusy: "A remover…",
  passkeyNotFound: "Esta chave de acesso já não está registada.",
  passkeyRemoveError: "Não foi possível remover a chave de acesso. Tenta novamente.",
  passkeyAlreadyEnrolled: "Esta chave de acesso já está registada na tua conta.",
  passkeyEnrollError: "Não foi possível adicionar a chave de acesso. Tenta novamente.",
  passkeySessionLost: "A tua sessão expirou. Inicia sessão novamente e tenta outra vez.",
  passkeyCsrfExpired: "O teu token de segurança expirou. Atualiza a página e tenta novamente.",
  passkeysError: "Não foi possível carregar as tuas chaves de acesso. Tenta novamente.",
  // Recovery codes (issued exactly once at passkey enrollment).
  recoveryTitle: "Códigos de recuperação",
  recoveryBody:
    "Estes 10 códigos de utilização única são a única forma de iniciares sessão se perderes a tua chave de acesso. Cada código funciona uma vez. Só são mostrados agora — guarda-os num local seguro.",
  recoveryCopy: "Copiar códigos",
  recoveryCopied: "Copiados.",
  recoverySaved: "Já os guardei",
  // API keys (epic api-keys, T19 — write API authentication). The /account
  // section sits between passkeys and the danger zone. Private keys unlock
  // WRITE access only: the public read API stays keyless, so reading never
  // needs a key. The raw key is shown exactly once, at creation.
  apiKeysSection: "Chaves de API",
  apiKeysHint:
    "As chaves privadas permitem que scripts e ferramentas escrevam na API sem uma sessão de navegador. A leitura nunca precisa de chave.",
  apiKeyCreate: "Criar chave de API",
  apiKeyNameLabel: "Nome da chave",
  apiKeyNameHelp:
    "Uma etiqueta curta para reconheceres a chave, p. ex. “Script de sincronização noturna”.",
  apiKeyNameRequired: "Dá um nome à chave.",
  apiKeyNameTooLong: "O nome deve ter no máximo 60 caracteres.",
  apiKeyScopeLabel: "Permissões",
  apiKeyScopeHelp:
    "Escolhe o que esta chave pode fazer. Podes restringir as permissões; não podes adicionar mais depois.",
  apiKeyScopeSubmitLabel: "Enviar reportes e correções",
  apiKeyScopeSubmitGrant: "Permite que scripts publiquem reportes de câmaras e correções.",
  apiKeyScopeConfirmLabel: "Confirmar câmaras",
  apiKeyScopeConfirmGrant: "Permite que scripts marquem câmaras como confirmadas.",
  apiKeyScopeEditLabel: "Editar câmaras",
  apiKeyScopeEditGrant: "Permite que scripts atualizem os detalhes das câmaras através do endpoint de edição.",
  apiKeyScopeActionLabel: "Ações da comunidade",
  apiKeyScopeActionGrant:
    "Permite que scripts registem ações da comunidade (útil, já não existe, problema, privacidade).",
  apiKeyCreatedLabel: "Criada",
  apiKeyLastUsedLabel: "Última utilização",
  apiKeyLastUsedNever: "Nunca utilizada",
  apiKeyExpiresLabel: "Expira",
  apiKeyExpiresNever: "Nunca",
  apiKeyExpiryLabel: "Validade",
  apiKeyExpiry30: "30 dias",
  apiKeyExpiry90: "90 dias",
  apiKeyExpiry365: "365 dias",
  apiKeyExpiryHelp: "A chave deixa de funcionar após este período; escolhe “Nunca” para não expirar. O valor predefinido aqui corresponde ao predefinido da API, de 365 dias.",
  apiKeyScopesLabel: "Permissões",
  apiKeyStatusLabel: "Estado",
  apiKeyStatusActive: "Ativa",
  apiKeyStatusRevoked: "Revogada",
  apiKeyRevoke: "Revogar",
  apiKeyRevokeConfirm: "Revogar esta chave?",
  apiKeyRevokeConfirmBody:
    "Os scripts que usam esta chave vão falhar imediatamente com um 401. Esta ação não pode ser anulada — cria uma nova chave se precisares.",
  apiKeyRevokeCancel: "Cancelar",
  apiKeyRevokeBusy: "A revogar…",
  apiKeyRevoked: "Revogada",
  apiKeyEmptyTitle: "Ainda não há chaves de API",
  apiKeyEmptyBody:
    "Cria uma chave para permitir que os teus scripts enviem reportes e correções sem iniciar sessão.",
  apiKeyDocsLink: "Lê a documentação da API",
  apiKeyCreateTitle: "Criar uma chave de API",
  apiKeyCreateBody:
    "A chave só é mostrada uma vez, quando é criada. Copia-a imediatamente — não fica guardada nos nossos servidores.",
  apiKeyCreateSubmit: "Criar chave",
  apiKeyCreateCancel: "Cancelar",
  apiKeyCreateBusy: "A criar…",
  apiKeyRevealTitle: "A tua chave de API",
  apiKeyRevealBody:
    "Copia-a agora — é a única vez que a chave completa é mostrada. Qualquer pessoa com esta chave pode escrever na API em teu nome.",
  apiKeyRevealCopy: "Copiar chave",
  apiKeyRevealCopied: "Copiada.",
  apiKeyRevealSaved: "Já a guardei",
  apiKeyErrorList: "Não foi possível carregar as tuas chaves de API. Tenta novamente.",
  apiKeyErrorCreate: "Não foi possível criar a chave. Tenta novamente.",
  apiKeyErrorRevoke: "Não foi possível revogar a chave. Tenta novamente.",
  apiKeyErrorLimit: "Já tens 5 chaves de API. Revoga uma antes de criares outra.",
  apiKeyErrorSession: "A tua sessão expirou. Inicia sessão novamente e tenta outra vez.",
  apiKeyErrorCsrf: "O teu token de segurança expirou. Atualiza a página e tenta novamente.",
  // Email verification (Fase B UI — design review): /verify-email page and the
  // /account banner. The verification link in the email now lands on a real
  // page (not raw JSON); the page consumes GET /api/auth/verify-email and
  // offers a resend when the token is dead.
  verifyTitle: "Verifica o teu email",
  verifyChecking: "A verificar a tua ligação de verificação…",
  verifySuccessTitle: "Email verificado",
  verifySuccessBody:
    "O teu endereço de email está verificado. Já podes iniciar sessão e começar a contribuir.",
  verifyInvalidTitle: "Ligação inválida ou expirada",
  verifyInvalidBody:
    "Esta ligação de verificação é inválida ou já foi utilizada. Podes pedir uma nova ligação.",
  verifyExpiredTitle: "Esta ligação já não é válida",
  verifyExpiredBody:
    "Esta ligação de verificação já foi utilizada ou expirou. Pede uma nova ligação para continuar.",
  verifyResend: "Reenviar email de verificação",
  verifyResent: "Email de verificação enviado.",
  verifyResendRateLimited: "Demasiados emails. Tenta novamente mais tarde.",
  verifyResendError: "Não foi possível reenviar o email. Tenta novamente.",
  verifyLoginToResend: "Inicia sessão para pedir uma nova ligação.",
  verifyGoToAccount: "Ir para a tua conta",
  verifyError: "Não foi possível verificar o teu email. Tenta novamente.",
  // /account verification banner (read from contributor.emailVerifiedAt).
  verifyBannerTitle: "Verifica o teu email para contribuir",
  verifyBannerBody:
    "Procura a ligação de confirmação na tua caixa de correio. É necessário um email verificado para enviar reportes e correções.",
  verifyBannerResend: "Reenviar o email",
  verifyBannerResent: "Email de confirmação enviado.",
  verifyBannerDone: "Email verificado — já podes contribuir.",
  // Forgot password (P1-3): entry from /login and the /forgot-password page.
  forgotPassword: "Esqueceste-te da palavra-passe?",
  forgotTitle: "Repõe a tua palavra-passe",
  forgotIntro:
    "Introduz o endereço de email da tua conta e enviamos-te uma ligação de reposição.",
  forgotSubmit: "Enviar ligação de reposição",
  forgotSent:
    "Se existir uma conta com este email, vais receber uma ligação de reposição. A ligação expira dentro de 3 horas. Verifica a tua caixa de correio.",
  forgotBackToLogin: "Voltar ao início de sessão",
  // /reset-password page (consumes the single-use token from the email).
  resetTitle: "Define uma nova palavra-passe",
  resetIntro: "Escolhe uma nova palavra-passe para a tua conta.",
  resetNewPassword: "Nova palavra-passe",
  resetConfirmPassword: "Repete a nova palavra-passe",
  resetMismatch: "As duas palavras-passe não coincidem.",
  resetSubmit: "Alterar palavra-passe",
  resetSuccessTitle: "Palavra-passe alterada",
  resetSuccessBody:
    "A tua palavra-passe foi alterada e todas as sessões foram terminadas. Inicia sessão com a nova palavra-passe.",
  resetInvalid: "Ligação de reposição inválida ou expirada.",
  resetExpired:
    "Esta ligação de reposição já foi utilizada ou expirou. Pede uma nova.",
  resetGoToLogin: "Iniciar sessão",
  resetRequestAnother: "Pedir uma nova ligação",
  // Login wall on the write tools (P1-2 — design review): anonymous and
  // unverified states replace the form on /segnala and /correggi.
  wallLoginTitle: "Inicia sessão para contribuir",
  wallLoginBody:
    "Os reportes e as correções são publicados por contribuidores verificados. Inicia sessão ou cria uma conta para continuar.",
  wallLogIn: "Iniciar sessão",
  wallCreateAccount: "Criar uma conta",
  wallVerifyTitle: "Verifica o teu email para contribuir",
  wallVerifyBody:
    "A tua conta ainda não está verificada. Procura a ligação de confirmação na tua caixa de correio ou reenvia-a.",
  wallResend: "Reenviar email de verificação",
  wallResent: "Email de verificação enviado.",
  wallGoToAccount: "Ir para a tua conta",
  wallChecking: "A verificar…",
  wallError: "Não foi possível verificar a tua sessão. Tenta novamente.",
  // QA#2 F4: the error-wall retry button label (the old ternary rendered
  // t.loading — a truthy string — so the button ALWAYS said "Verify your
  // email" even though its action retries the session check).
  wallRetry: "Tentar novamente",
  // Per-method privacy disclosure (P1-4 — risk matrix complete, ADR 0020
  // decision 6). Each sign-in method declares its own risk surface; the OIDC
  // disclosure already existed and is kept unchanged.
  methodDisclosureLabel: "Nota de privacidade",
  passwordDisclosure:
    "O teu endereço de email é um dado pessoal e é guardado para gerir a tua conta. Os inícios de sessão apenas com palavra-passe podem ser alvo de phishing — confirma sempre a barra de endereço antes de escreveres a tua palavra-passe.",
  passkeyDisclosure:
    "A verificação biométrica (impressão digital, rosto ou PIN) acontece no teu dispositivo. Se a tua chave de acesso for sincronizada através da nuvem de um fornecedor (Apple, Google, Microsoft), esse fornecedor pode ver que usas este site; as chaves de acesso ligadas ao dispositivo nunca são sincronizadas.",
};
