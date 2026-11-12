/**
 * auth — ES translation. Parity-checked against the English pilot
 * bundle (../../auth.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../auth";
import { es as authNavEs } from "./auth-nav";

export const es: Translation<typeof en> = {
  // Header auth links (accountAria, accountTitle, login, register) live in
  // the tiny ./auth-nav fragment so the header on every route ships only
  // those labels, not this whole domain; spread here so `auth.*` keeps the
  // same keys for every other consumer.
  ...authNavEs,
  navigation: "Navegación principal",
  homeAria: "Inicio de OpenSurveillanceDB",
  loginTitle: "Iniciar sesión",
  registerTitle: "Crea una cuenta de colaborador",
  // F5 (QA#6): per-page metadata for the client auth pages (/login, /register).
  loginMetaDescription:
    "Inicia sesión para enviar reportes y correcciones a la base de datos pública de OpenSurveillanceDB.",
  registerMetaDescription:
    "Crea una cuenta de colaborador gratuita para reportar cámaras de vigilancia públicas.",
  email: "Correo electrónico",
  password: "Contraseña",
  displayName: "Nombre visible (opcional)",
  logout: "Cerrar sesión",
  // Moderator/admin shortcut on the account page (ADR 0003 2026-10): shown
  // only when GET /api/auth/me reports a coarse role of moderator+.
  goToModeration: "Ir a la moderación",
  noAccount: "¿Aún no tienes cuenta?",
  haveAccount: "¿Ya tienes una cuenta?",
  createOne: "Crea una",
  signIn: "Inicia sesión",
  passwordRequirements: "Tu contraseña debe incluir:",
  passwordRuleLength: "Al menos 10 caracteres",
  passwordRuleUppercase: "Una letra mayúscula (A–Z)",
  passwordRuleLowercase: "Una letra minúscula (a–z)",
  passwordRuleDigit: "Un número (0–9)",
  passwordRuleSpecial: "Un carácter especial (p. ej. ! @ # $ %)",
  passwordWeak: "Tu contraseña no cumple los requisitos anteriores.",
  anonymousNote:
    "Necesitas una cuenta gratuita para reportar una cámara, y te permite seguir tus propios reportes.",
  privacyNotice: "Aviso de privacidad",
  privacyDetails: "Detalles de privacidad",
  termsOfUse: "Condiciones de uso",
  registerArt13:
    "Los datos de tu cuenta (correo electrónico, nombre visible opcional) los trata el responsable del tratamiento Simone Rondina / OpenSurveillanceDB sobre la base del interés legítimo (art. 6.1.f RGPD) para ofrecer cuentas de colaborador. Aviso completo:",
  registerArt13Rights: "Puedes ejercer tus derechos del RGPD (arts. 15-22) escribiendo a",
  privacyContact: "privacy@opensurveillancedb.org",
  profileSection: "Perfil",
  memberSince: "Miembro desde",
  emailLabel: "Correo electrónico",
  displayNameLabel: "Nombre visible",
  submissionsSection: "Tus reportes",
  noSubmissions: "Todavía no has enviado ningún reporte atribuido.",
  submissionStatus: "Estado",
  submissionCreated: "Enviado",
  loggedOutTitle: "Has cerrado sesión",
  loggedOutBody: "Tu sesión ha terminado. Puedes cerrar esta ventana o volver a iniciar sesión.",
  errorInvalidCredentials: "Credenciales no válidas.",
  // Register confirmation: shown after EVERY accepted submit, new address or
  // not — the API answers the same for both (no account enumeration).
  registerCheckEmailTitle: "Revisa tu correo",
  registerCheckEmailBody:
    "Si esta dirección puede usarse, te hemos enviado un correo con el siguiente paso. Revisa tu bandeja de entrada (y la carpeta de spam).",
  errorGeneric: "Algo ha salido mal. Inténtalo de nuevo.",
  errorCrossOrigin: "Solicitud entre sitios rechazada.",
  // Static copy on /login (t_6dc1c96f — CEO feedback 2026-08-03): login is
  // blocked until the email is verified, and the API answers the same generic
  // 401 for every failure (anti-enumeration). This note is shown to everyone,
  // so it never reveals account existence — it just explains, in advance, why
  // a correct password might be rejected right after registering.
  loginVerifyHint:
    "¿Acabas de registrarte? Busca en tu bandeja de entrada el correo de verificación: solo podrás iniciar sesión cuando tu correo esté verificado.",
  loading: "Cargando…",
  anonymous: "Anónimo",
  notAuthenticatedTitle: "No has iniciado sesión",
  notAuthenticatedBody: "Inicia sesión para ver tu perfil y tus reportes atribuidos.",
  deleteAccountSection: "Eliminar cuenta",
  deleteAccountHint:
    "Elimina tu cuenta y el vínculo entre tú y tus reportes. Los reportes en sí siguen publicados de forma anónima.",
  deleteAccountConfirm: "¿Eliminar la cuenta de forma permanente?",
  deleteAccountConfirmBody:
    "Se borrarán tu cuenta y todas sus sesiones. Tus reportes siguen publicados, ya sin atribuírtelos. Esta acción no se puede deshacer.",
  deleteAccount: "Eliminar cuenta",
  deletingAccount: "Eliminando cuenta…",
  deleteAccountCancel: "Cancelar",
  accountDeletedTitle: "Cuenta eliminada",
  accountDeletedBody:
    "Tu cuenta se ha borrado y se ha cerrado tu sesión. Tus reportes siguen publicados sin atribución.",
  errorDeleteAccount: "No se ha podido eliminar la cuenta. Inténtalo de nuevo.",
  // Display name inline edit (C6/C8 — the only inline-editable profile field).
  displayNameEdit: "Editar nombre visible",
  displayNameSave: "Guardar",
  displayNameCancel: "Cancelar",
  displayNameHelp: "Entre 2 y 60 caracteres.",
  displayNameSaved: "Nombre visible guardado.",
  errorDisplayName: "El nombre visible debe tener entre 2 y 60 caracteres.",
  errorDisplayNameRateLimit: "Demasiados intentos. Inténtalo de nuevo dentro de un minuto.",
  errorDisplayNameGeneric: "No se ha podido guardar el nombre visible. Inténtalo de nuevo.",
  // Multi-method auth (Fase E2 — single-tile login): email + password is the
  // primary flow. Passkey and configured OIDC providers remain visible below
  // a localized divider as alternatives within the same auth card.
  methodPassword: "Correo + contraseña",
  methodPasskey: "Llave de acceso",
  methodSocialTitle: "Inicia sesión con un proveedor",
  loginOr: "o",
  loginAlternatives: "Otras formas de iniciar sesión",
  // Passkey login (Fase C).
  passkeyLogin: "Iniciar sesión con llave de acceso",
  passkeyEmailOptional: "Correo de la cuenta (opcional)",
  passkeyEmailHint:
    "Opcional: limita la solicitud a las llaves de acceso de esta cuenta. Déjalo vacío para usar cualquier llave de acceso guardada en este dispositivo.",
  passkeyUnsupported:
    "Este navegador no admite llaves de acceso. Usa correo + contraseña o actualiza tu navegador.",
  passkeyErrorBegin: "No se ha podido iniciar el acceso con llave de acceso. Inténtalo de nuevo.",
  passkeyErrorFailed: "La verificación de la llave de acceso ha fallado. Inténtalo de nuevo.",
  // Social / OIDC (Fase D, ADR 0020 decision 4 — the disclosure IS the
  // privacy requirement: the provider tracking surface and the EU-US DPF
  // transfer are declared here, on /login).
  oidcGithub: "Continuar con GitHub",
  oidcGoogle: "Continuar con Google",
  oidcDisclosure:
    "El inicio de sesión con terceros te redirige al proveedor, que sabrá que visitas este sitio y puede transferir datos fuera de la UE. Nunca importamos ni guardamos el correo de tu proveedor. Consulta el aviso de privacidad.",
  oidcErrorGeneric: "El inicio de sesión social ha fallado o se ha cancelado. Inténtalo de nuevo.",
  // Manual OIDC merge (email-conflict proof with the account password).
  mergeTitle: "Vincula tu cuenta social",
  mergeIntro:
    "Has iniciado sesión con un proveedor social, pero ya existe una cuenta con este correo. Demuestra que es tuya con su contraseña para vincularlas.",
  mergeSubmit: "Vincular cuentas",
  mergeErrorExpired: "Este enlace de vinculación ya no es válido. Vuelve a intentarlo con el proveedor.",
  mergeErrorGeneric: "No se han podido vincular las cuentas. Inténtalo de nuevo.",
  // /account passkey management (Fase E2).
  passkeysSection: "Llaves de acceso",
  passkeysHint:
    "Añade una llave de acceso para iniciar sesión con tu dispositivo (biometría, PIN o llave de seguridad) en lugar de una contraseña.",
  passkeysEmpty: "Aún no tienes llaves de acceso registradas.",
  // Disclosure summary count (account rework 2026-08-08).
  passkeySingular: "llave de acceso",
  passkeyPlural: "llaves de acceso",
  passkeyAdd: "Añadir llave de acceso",
  passkeyAddHelp:
    "Se te pedirá que confirmes con tu dispositivo. Al añadir la llave de acceso recibirás 10 códigos de recuperación de un solo uso: guárdalos en un lugar seguro.",
  passkeyAdded: "Llave de acceso añadida.",
  passkeyEnrolledLabel: "Registrada",
  passkeyRemove: "Quitar",
  passkeyRemoveConfirm: "¿Quitar esta llave de acceso?",
  passkeyRemoveConfirmBody:
    "Ya no podrás usar esta llave de acceso para iniciar sesión. Tus otros métodos de acceso seguirán funcionando.",
  passkeyRemoveCancel: "Cancelar",
  passkeyRemoveBusy: "Quitando…",
  passkeyNotFound: "Esta llave de acceso ya no está registrada.",
  passkeyRemoveError: "No se ha podido quitar la llave de acceso. Inténtalo de nuevo.",
  passkeyAlreadyEnrolled: "Esta llave de acceso ya está registrada en tu cuenta.",
  passkeyEnrollError: "No se ha podido añadir la llave de acceso. Inténtalo de nuevo.",
  passkeySessionLost: "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo.",
  passkeyCsrfExpired: "Tu token de seguridad ha caducado. Recarga la página e inténtalo de nuevo.",
  passkeysError: "No se han podido cargar tus llaves de acceso. Inténtalo de nuevo.",
  // Recovery codes (issued exactly once at passkey enrollment).
  recoveryTitle: "Códigos de recuperación",
  recoveryBody:
    "Estos 10 códigos de un solo uso son la única forma de iniciar sesión si pierdes tu llave de acceso. Cada código funciona una vez. Solo se muestran ahora: guárdalos en un lugar seguro.",
  recoveryCopy: "Copiar códigos",
  recoveryCopied: "Copiados.",
  recoverySaved: "Ya los he guardado",
  // API keys (epic api-keys, T19 — write API authentication). The /account
  // section sits between passkeys and the danger zone. Private keys unlock
  // WRITE access only: the public read API stays keyless, so reading never
  // needs a key. The raw key is shown exactly once, at creation.
  apiKeysSection: "Claves de API",
  apiKeysHint:
    "Las claves privadas permiten que scripts y herramientas escriban en la API sin una sesión de navegador. Para leer nunca hace falta una clave.",
  apiKeyCreate: "Crear clave de API",
  apiKeyNameLabel: "Nombre de la clave",
  apiKeyNameHelp:
    "Una etiqueta breve para reconocer la clave, p. ej. “Script de sincronización nocturna”.",
  apiKeyNameRequired: "Ponle un nombre a la clave.",
  apiKeyNameTooLong: "El nombre debe tener 60 caracteres como máximo.",
  apiKeyScopeLabel: "Permisos",
  apiKeyScopeHelp:
    "Elige lo que puede hacer esta clave. Puedes restringir los permisos; no podrás añadir más después.",
  apiKeyScopeSubmitLabel: "Enviar reportes y correcciones",
  apiKeyScopeSubmitGrant: "Permite a los scripts publicar reportes de cámaras y correcciones.",
  apiKeyScopeConfirmLabel: "Confirmar cámaras",
  apiKeyScopeConfirmGrant: "Permite a los scripts marcar cámaras como confirmadas.",
  apiKeyScopeEditLabel: "Editar cámaras",
  apiKeyScopeEditGrant: "Permite a los scripts actualizar los datos de las cámaras mediante el endpoint de edición.",
  apiKeyScopeActionLabel: "Acciones de la comunidad",
  apiKeyScopeActionGrant:
    "Permite a los scripts realizar acciones de la comunidad (útil, ya no está, problema, privacidad).",
  apiKeyCreatedLabel: "Creada",
  apiKeyLastUsedLabel: "Último uso",
  apiKeyLastUsedNever: "Nunca usada",
  apiKeyExpiresLabel: "Caduca",
  apiKeyExpiresNever: "Nunca",
  apiKeyExpiryLabel: "Caducidad",
  apiKeyExpiry30: "30 días",
  apiKeyExpiry90: "90 días",
  apiKeyExpiry365: "365 días",
  apiKeyExpiryHelp: "La clave deja de funcionar tras este periodo; elige “Nunca” para que no caduque. El valor predeterminado coincide con el de la API: 365 días.",
  apiKeyScopesLabel: "Permisos",
  apiKeyStatusLabel: "Estado",
  apiKeyStatusActive: "Activa",
  apiKeyStatusRevoked: "Revocada",
  apiKeyRevoke: "Revocar",
  apiKeyRevokeConfirm: "¿Revocar esta clave?",
  apiKeyRevokeConfirmBody:
    "Los scripts que usen esta clave fallarán de inmediato con un 401. Esta acción no se puede deshacer: crea una clave nueva si la necesitas.",
  apiKeyRevokeCancel: "Cancelar",
  apiKeyRevokeBusy: "Revocando…",
  apiKeyRevoked: "Revocada",
  apiKeyEmptyTitle: "Aún no tienes claves de API",
  apiKeyEmptyBody:
    "Crea una clave para que tus scripts envíen reportes y correcciones sin iniciar sesión.",
  apiKeyDocsLink: "Lee la documentación de la API",
  apiKeyCreateTitle: "Crear una clave de API",
  apiKeyCreateBody:
    "La clave se muestra una sola vez, al crearla. Cópiala enseguida: no se guarda en nuestros servidores.",
  apiKeyCreateSubmit: "Crear clave",
  apiKeyCreateCancel: "Cancelar",
  apiKeyCreateBusy: "Creando…",
  apiKeyRevealTitle: "Tu clave de API",
  apiKeyRevealBody:
    "Cópiala ahora: es la única vez que se muestra la clave completa. Cualquiera que tenga esta clave puede escribir en la API en tu nombre.",
  apiKeyRevealCopy: "Copiar clave",
  apiKeyRevealCopied: "Copiada.",
  apiKeyRevealSaved: "Ya la he guardado",
  apiKeyErrorList: "No se han podido cargar tus claves de API. Inténtalo de nuevo.",
  apiKeyErrorCreate: "No se ha podido crear la clave. Inténtalo de nuevo.",
  apiKeyErrorRevoke: "No se ha podido revocar la clave. Inténtalo de nuevo.",
  apiKeyErrorLimit: "Ya tienes 5 claves de API. Revoca una antes de crear otra.",
  apiKeyErrorSession: "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo.",
  apiKeyErrorCsrf: "Tu token de seguridad ha caducado. Recarga la página e inténtalo de nuevo.",
  // Email verification (Fase B UI — design review): /verify-email page and the
  // /account banner. The verification link in the email now lands on a real
  // page (not raw JSON); the page consumes GET /api/auth/verify-email and
  // offers a resend when the token is dead.
  verifyTitle: "Verifica tu correo electrónico",
  verifyChecking: "Comprobando tu enlace de verificación…",
  verifySuccessTitle: "Correo verificado",
  verifySuccessBody:
    "Tu dirección de correo está verificada. Ya puedes iniciar sesión y empezar a colaborar.",
  verifyInvalidTitle: "Enlace no válido o caducado",
  verifyInvalidBody:
    "Este enlace de verificación no es válido o ya se ha usado. Puedes solicitar un enlace nuevo.",
  verifyExpiredTitle: "Este enlace ya no es válido",
  verifyExpiredBody:
    "Este enlace de verificación ya se ha usado o ha caducado. Solicita un enlace nuevo para continuar.",
  verifyResend: "Reenviar correo de verificación",
  verifyResent: "Correo de verificación enviado.",
  verifyResendRateLimited: "Demasiados correos. Inténtalo de nuevo más tarde.",
  verifyResendError: "No se ha podido reenviar el correo. Inténtalo de nuevo.",
  verifyLoginToResend: "Inicia sesión para solicitar un enlace nuevo.",
  verifyGoToAccount: "Ir a tu cuenta",
  verifyError: "No se ha podido verificar tu correo. Inténtalo de nuevo.",
  // /account verification banner (read from contributor.emailVerifiedAt).
  verifyBannerTitle: "Verifica tu correo para colaborar",
  verifyBannerBody:
    "Busca en tu bandeja de entrada el enlace de confirmación. Necesitas un correo verificado para enviar reportes y correcciones.",
  verifyBannerResend: "Reenviar el correo",
  verifyBannerResent: "Correo de confirmación enviado.",
  verifyBannerDone: "Correo verificado: ya puedes colaborar.",
  // Forgot password (P1-3): entry from /login and the /forgot-password page.
  forgotPassword: "¿Has olvidado tu contraseña?",
  forgotTitle: "Restablece tu contraseña",
  forgotIntro:
    "Introduce la dirección de correo de tu cuenta y te enviaremos un enlace para restablecerla.",
  forgotSubmit: "Enviar enlace",
  forgotSent:
    "Si existe una cuenta con este correo, el enlace para restablecer la contraseña está en camino. Caduca en 3 horas. Revisa tu bandeja de entrada.",
  forgotBackToLogin: "Volver a iniciar sesión",
  // /reset-password page (consumes the single-use token from the email).
  resetTitle: "Establece una contraseña nueva",
  resetIntro: "Elige una contraseña nueva para tu cuenta.",
  resetNewPassword: "Contraseña nueva",
  resetConfirmPassword: "Repite la contraseña nueva",
  resetMismatch: "Las dos contraseñas no coinciden.",
  resetSubmit: "Cambiar contraseña",
  resetSuccessTitle: "Contraseña cambiada",
  resetSuccessBody:
    "Tu contraseña se ha cambiado y se han cerrado todas las sesiones. Inicia sesión con la contraseña nueva.",
  resetInvalid: "Enlace de restablecimiento no válido o caducado.",
  resetExpired:
    "Este enlace de restablecimiento ya se ha usado o ha caducado. Solicita uno nuevo.",
  resetGoToLogin: "Iniciar sesión",
  resetRequestAnother: "Solicitar un enlace nuevo",
  // Login wall on the write tools (P1-2 — design review): anonymous and
  // unverified states replace the form on /segnala and /correggi.
  wallLoginTitle: "Inicia sesión para colaborar",
  wallLoginBody:
    "Los reportes y las correcciones los publican colaboradores verificados. Inicia sesión o crea una cuenta para continuar.",
  wallLogIn: "Iniciar sesión",
  wallCreateAccount: "Crear una cuenta",
  wallVerifyTitle: "Verifica tu correo para colaborar",
  wallVerifyBody:
    "Tu cuenta aún no está verificada. Busca el enlace de confirmación en tu bandeja de entrada o reenvíalo.",
  wallResend: "Reenviar correo de verificación",
  wallResent: "Correo de verificación enviado.",
  wallGoToAccount: "Ir a tu cuenta",
  wallChecking: "Comprobando…",
  wallError: "No se ha podido comprobar tu sesión. Inténtalo de nuevo.",
  // QA#2 F4: the error-wall retry button label (the old ternary rendered
  // t.loading — a truthy string — so the button ALWAYS said "Verify your
  // email" even though its action retries the session check).
  wallRetry: "Reintentar",
  // Per-method privacy disclosure (P1-4 — risk matrix complete, ADR 0020
  // decision 6). Each sign-in method declares its own risk surface; the OIDC
  // disclosure already existed and is kept unchanged.
  methodDisclosureLabel: "Nota de privacidad",
  passwordDisclosure:
    "Tu dirección de correo es un dato personal y se guarda para gestionar tu cuenta. Los accesos solo con contraseña pueden ser objetivo de phishing: comprueba siempre la barra de direcciones antes de escribir tu contraseña.",
  passkeyDisclosure:
    "La comprobación biométrica (huella, rostro o PIN) se hace en tu dispositivo. Si tu llave de acceso se sincroniza a través de la nube de un proveedor (Apple, Google, Microsoft), ese proveedor puede saber que usas este sitio; las llaves de acceso vinculadas al dispositivo nunca se sincronizan.",
};
