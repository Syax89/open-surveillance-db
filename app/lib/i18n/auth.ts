/**
 * auth — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Main navigation",
  homeAria: "OpenSurveillanceDB home",
  accountAria: "Your account",
  loginTitle: "Log in",
  registerTitle: "Create a contributor account",
  accountTitle: "Your account",
  // F5 (QA#6): per-page metadata for the client auth pages (/login, /register).
  loginMetaDescription:
    "Log in to submit reports and corrections to the OpenSurveillanceDB public database.",
  registerMetaDescription:
    "Create a free contributor account to report public surveillance cameras.",
  email: "Email",
  password: "Password",
  displayName: "Display name (optional)",
  login: "Log in",
  register: "Create account",
  logout: "Log out",
  noAccount: "No account yet?",
  haveAccount: "Already have an account?",
  createOne: "Create one",
  signIn: "Log in instead",
  passwordRequirements: "Your password must include:",
  passwordRuleLength: "At least 10 characters",
  passwordRuleUppercase: "An uppercase letter (A–Z)",
  passwordRuleLowercase: "A lowercase letter (a–z)",
  passwordRuleDigit: "A number (0–9)",
  passwordRuleSpecial: "A special character (e.g. ! @ # $ %)",
  passwordWeak: "Your password does not meet the requirements above.",
  anonymousNote:
    "A free account is required to report a camera, and it lets you track your own reports.",
  privacyNotice: "Privacy notice",
  termsOfUse: "Terms of use",
  registerArt13:
    "Your account data (email, optional display name) is processed by the controller Simone Rondina / OpenSurveillanceDB on the basis of legitimate interest (art. 6(1)(f) GDPR) to provide contributor accounts. Full notice:",
  registerArt13Rights: "You can exercise your GDPR rights (arts. 15-22) by writing to",
  privacyContact: "privacy@opensurveillancedb.org",
  profileSection: "Profile",
  memberSince: "Member since",
  emailLabel: "Email",
  displayNameLabel: "Display name",
  submissionsSection: "Your reports",
  noSubmissions: "You have not submitted any attributed reports yet.",
  submissionStatus: "Status",
  submissionCreated: "Submitted",
  loggedOutTitle: "You are logged out",
  loggedOutBody: "Your session has ended. You can close this window or log in again.",
  errorInvalidCredentials: "Invalid credentials.",
  errorEmailTaken: "An account with this email already exists.",
  errorGeneric: "Something went wrong. Please try again.",
  errorCrossOrigin: "Cross-site request rejected.",
  // Static copy on /login (t_6dc1c96f — CEO feedback 2026-08-03): login is
  // blocked until the email is verified, and the API answers the same generic
  // 401 for every failure (anti-enumeration). This note is shown to everyone,
  // so it never reveals account existence — it just explains, in advance, why
  // a correct password might be rejected right after registering.
  loginVerifyHint:
    "Just registered? Check your inbox for the verification email — you can sign in only once your email is verified.",
  loading: "Loading…",
  anonymous: "Anonymous",
  notAuthenticatedTitle: "Not logged in",
  notAuthenticatedBody: "Log in to see your profile and your attributed reports.",
  deleteAccountSection: "Delete account",
  deleteAccountHint:
    "Deletes your account and removes the link between you and your reports. The reports themselves stay published anonymously.",
  deleteAccountConfirm: "Delete account permanently?",
  deleteAccountConfirmBody:
    "Your account and all its sessions will be erased. Your reports stay published, no longer attributed to you. This cannot be undone.",
  deleteAccount: "Delete account",
  deletingAccount: "Deleting account…",
  deleteAccountCancel: "Cancel",
  accountDeletedTitle: "Account deleted",
  accountDeletedBody:
    "Your account has been erased and you are logged out. Your reports remain published without attribution.",
  errorDeleteAccount: "Unable to delete the account. Please try again.",
  // Display name inline edit (C6/C8 — the only inline-editable profile field).
  displayNameEdit: "Edit display name",
  displayNameSave: "Save",
  displayNameCancel: "Cancel",
  displayNameHelp: "Between 2 and 60 characters.",
  displayNameSaved: "Display name saved.",
  errorDisplayName: "The display name must be between 2 and 60 characters.",
  errorDisplayNameRateLimit: "Too many attempts. Please try again in a minute.",
  errorDisplayNameGeneric: "Could not save the display name. Please try again.",
  // Multi-method auth (Fase E2 — Vera design): method selector on /login.
  methodSelectorLabel: "Choose how to sign in",
  methodPassword: "Email + password",
  methodPasskey: "Passkey",
  methodSocial: "Social sign-in",
  // Passkey login (Fase C).
  passkeyLogin: "Sign in with passkey",
  passkeyEmailOptional: "Account email (optional)",
  passkeyEmailHint:
    "Optional: narrows the prompt to this account's passkeys. Leave it empty to use any passkey saved on this device.",
  passkeyUnsupported:
    "This browser does not support passkeys. Use email + password, or update your browser.",
  passkeyErrorBegin: "Unable to start passkey sign-in. Please try again.",
  passkeyErrorFailed: "Passkey verification failed. Please try again.",
  // Social / OIDC (Fase D, ADR 0020 decision 4 — the disclosure IS the
  // privacy requirement: the provider tracking surface and the EU-US DPF
  // transfer are declared here, on /login).
  oidcGithub: "Continue with GitHub",
  oidcGoogle: "Continue with Google",
  oidcDisclosure:
    "Third-party sign-in sends you to the provider, which learns that you are visiting this site and may transfer data outside the EU. Your provider email is never imported or stored. See the privacy notice.",
  oidcErrorGeneric: "Social sign-in failed or was cancelled. Please try again.",
  // Manual OIDC merge (email-conflict proof with the account password).
  mergeTitle: "Link your social account",
  mergeIntro:
    "You signed in with a social provider, but an account with this email already exists. Prove you own it with its password to link them.",
  mergeSubmit: "Link accounts",
  mergeErrorExpired: "This merge link is no longer valid. Please try again with the provider.",
  mergeErrorGeneric: "Unable to link the accounts. Please try again.",
  // /account passkey management (Fase E2).
  passkeysSection: "Passkeys",
  passkeysHint:
    "Add a passkey to sign in with your device (biometrics, PIN or security key) instead of a password.",
  passkeysEmpty: "No passkeys enrolled yet.",
  passkeyAdd: "Add passkey",
  passkeyAddHelp:
    "You will be asked to confirm with your device. When the passkey is added you receive 10 one-time recovery codes — store them somewhere safe.",
  passkeyAdded: "Passkey added.",
  passkeyEnrolledLabel: "Enrolled",
  passkeyRemove: "Remove",
  passkeyRemoveConfirm: "Remove this passkey?",
  passkeyRemoveConfirmBody:
    "This passkey can no longer be used to sign in. Your other sign-in methods keep working.",
  passkeyRemoveCancel: "Cancel",
  passkeyRemoveBusy: "Removing…",
  passkeyNotFound: "This passkey is no longer enrolled.",
  passkeyRemoveError: "Unable to remove the passkey. Please try again.",
  passkeyAlreadyEnrolled: "This passkey is already enrolled on your account.",
  passkeyEnrollError: "Unable to add the passkey. Please try again.",
  passkeySessionLost: "Your session has expired. Log in again and retry.",
  passkeyCsrfExpired: "Your security token expired. Refresh the page and try again.",
  passkeysError: "Unable to load your passkeys. Please try again.",
  // Recovery codes (issued exactly once at passkey enrollment).
  recoveryTitle: "Recovery codes",
  recoveryBody:
    "These 10 one-time codes are the only way to sign in if you lose your passkey. Each code works once. They are shown only now — store them somewhere safe.",
  recoveryCopy: "Copy codes",
  recoveryCopied: "Copied.",
  recoverySaved: "I saved them",
  // Email verification (Fase B UI — Vera design): /verify-email page and the
  // /account banner. The verification link in the email now lands on a real
  // page (not raw JSON); the page consumes GET /api/auth/verify-email and
  // offers a resend when the token is dead.
  verifyTitle: "Verify your email",
  verifyChecking: "Checking your verification link…",
  verifySuccessTitle: "Email verified",
  verifySuccessBody:
    "Your email address is verified. You can now log in and start contributing.",
  verifyInvalidTitle: "Invalid or expired link",
  verifyInvalidBody:
    "This verification link is invalid or has already been used. You can request a new link.",
  verifyExpiredTitle: "This link is no longer valid",
  verifyExpiredBody:
    "This verification link has already been used or has expired. Request a new link to continue.",
  verifyResend: "Resend verification email",
  verifyResent: "Verification email sent.",
  verifyResendRateLimited: "Too many emails. Please try again later.",
  verifyResendError: "Unable to resend the email. Please try again.",
  verifyLoginToResend: "Log in to request a new link.",
  verifyGoToAccount: "Go to your account",
  verifyError: "Unable to verify your email. Please try again.",
  // /account verification banner (read from contributor.emailVerifiedAt).
  verifyBannerTitle: "Verify your email to contribute",
  verifyBannerBody:
    "Check your inbox for the confirmation link. A verified email is required to submit reports and corrections.",
  verifyBannerResend: "Resend the email",
  verifyBannerResent: "Confirmation email sent.",
  verifyBannerDone: "Email verified — you can contribute.",
  // Forgot password (P1-3): entry from /login and the /forgot-password page.
  forgotPassword: "Forgot password?",
  forgotTitle: "Reset your password",
  forgotIntro:
    "Enter the email address of your account and we will send you a reset link.",
  forgotSubmit: "Send reset link",
  forgotSent:
    "If an account exists for this email, a reset link is on its way. The link expires in 3 hours. Check your inbox.",
  forgotBackToLogin: "Back to log in",
  // /reset-password page (consumes the single-use token from the email).
  resetTitle: "Set a new password",
  resetIntro: "Choose a new password for your account.",
  resetNewPassword: "New password",
  resetConfirmPassword: "Repeat the new password",
  resetMismatch: "The two passwords do not match.",
  resetSubmit: "Change password",
  resetSuccessTitle: "Password changed",
  resetSuccessBody:
    "Your password has been changed and every session was closed. Log in with the new password.",
  resetInvalid: "Invalid or expired reset link.",
  resetExpired:
    "This reset link has already been used or has expired. Request a new one.",
  resetGoToLogin: "Log in",
  resetRequestAnother: "Request a new link",
  // Login wall on the write tools (P1-2 — Vera design): anonymous and
  // unverified states replace the form on /segnala and /correggi.
  wallLoginTitle: "Log in to contribute",
  wallLoginBody:
    "Reports and corrections are published by verified contributors. Log in or create an account to continue.",
  wallLogIn: "Log in",
  wallCreateAccount: "Create an account",
  wallVerifyTitle: "Verify your email to contribute",
  wallVerifyBody:
    "Your account is not verified yet. Check your inbox for the confirmation link, or resend it.",
  wallResend: "Resend verification email",
  wallResent: "Verification email sent.",
  wallGoToAccount: "Go to your account",
  wallChecking: "Checking…",
  wallError: "Unable to check your session. Please try again.",
  // Per-method privacy disclosure (P1-4 — risk matrix complete, ADR 0020
  // decision 6). Each sign-in method declares its own risk surface; the OIDC
  // disclosure already existed and is kept unchanged.
  methodDisclosureLabel: "Privacy note",
  passwordDisclosure:
    "Your email address is personal data and is stored to run your account. Password-only logins can be targeted by phishing — always check the address bar before typing your password.",
  passkeyDisclosure:
    "The biometric check (fingerprint, face or PIN) happens on your device. If your passkey is synced through a vendor cloud (Apple, Google, Microsoft), that vendor can see that you use this site; device-bound passkeys are never synced.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione principale",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  accountAria: "Il tuo account",
  loginTitle: "Accedi",
  registerTitle: "Crea un account per contribuire",
  accountTitle: "Il tuo account",
  // F5 (QA#6): metadata per pagina per le pagine auth client (/login, /register).
  loginMetaDescription:
    "Accedi per inviare segnalazioni e correzioni al database pubblico OpenSurveillanceDB.",
  registerMetaDescription:
    "Crea un account gratuito per contribuire al database delle telecamere di sorveglianza pubbliche.",
  email: "Email",
  password: "Password",
  displayName: "Nome visualizzato (facoltativo)",
  login: "Accedi",
  register: "Crea account",
  logout: "Esci",
  noAccount: "Non hai ancora un account?",
  haveAccount: "Hai già un account?",
  createOne: "Crea un account",
  signIn: "Accedi invece",
  passwordRequirements: "La password deve contenere:",
  passwordRuleLength: "Almeno 10 caratteri",
  passwordRuleUppercase: "Una lettera maiuscola (A–Z)",
  passwordRuleLowercase: "Una lettera minuscola (a–z)",
  passwordRuleDigit: "Un numero (0–9)",
  passwordRuleSpecial: "Un carattere speciale (es. ! @ # $ %)",
  passwordWeak: "La password non rispetta i requisiti sopra indicati.",
  anonymousNote:
    "Per segnalare una telecamera serve un account gratuito, che ti permette anche di tenere traccia delle tue segnalazioni.",
  privacyNotice: "Informativa privacy",
  termsOfUse: "Termini d’uso",
  registerArt13:
    "I dati del tuo account (email, eventuale nome visualizzato) sono trattati dal titolare Simone Rondina / OpenSurveillanceDB su base di interesse legittimo (art. 6(1)(f) GDPR) per fornire gli account dei contributori. Informativa completa:",
  registerArt13Rights: "Puoi esercitare i diritti previsti dagli artt. 15-22 GDPR scrivendo a",
  privacyContact: "privacy@opensurveillancedb.org",
  profileSection: "Profilo",
  memberSince: "Iscritto dal",
  emailLabel: "Email",
  displayNameLabel: "Nome visualizzato",
  submissionsSection: "Le tue segnalazioni",
  noSubmissions: "Non hai ancora inviato segnalazioni attribuite.",
  submissionStatus: "Stato",
  submissionCreated: "Inviata",
  loggedOutTitle: "Hai effettuato il logout",
  loggedOutBody: "La sessione è terminata. Puoi chiudere questa finestra o accedere di nuovo.",
  errorInvalidCredentials: "Credenziali non valide.",
  errorEmailTaken: "Esiste già un account con questa email.",
  errorGeneric: "Qualcosa è andato storto. Riprova.",
  errorCrossOrigin: "Richiesta cross-site rifiutata.",
  // Testo statico su /login (t_6dc1c96f — feedback CEO 2026-08-03): l'accesso
  // è bloccato finché l'email non è verificata, e l'API risponde con lo stesso
  // 401 generico per ogni errore (anti-enumeration). La nota è mostrata a
  // tutti, quindi non rivela mai l'esistenza di un account — spiega solo, in
  // anticipo, perché una password corretta può essere rifiutata subito dopo
  // la registrazione.
  loginVerifyHint:
    "Ti sei appena registrato? Controlla la casella di posta: puoi accedere solo dopo aver verificato l'email con il link che ti abbiamo inviato.",
  loading: "Caricamento…",
  anonymous: "Anonimo",
  notAuthenticatedTitle: "Non hai effettuato l'accesso",
  notAuthenticatedBody: "Accedi per vedere il tuo profilo e le tue segnalazioni attribuite.",
  deleteAccountSection: "Elimina account",
  deleteAccountHint:
    "Elimina il tuo account e rimuove il collegamento tra te e le tue segnalazioni. Le segnalazioni restano pubblicate in forma anonima.",
  deleteAccountConfirm: "Eliminare definitivamente l'account?",
  deleteAccountConfirmBody:
    "L'account e tutte le sue sessioni verranno cancellati. Le tue segnalazioni restano pubblicate, senza più attribuzione a te. Questa azione non può essere annullata.",
  deleteAccount: "Elimina account",
  deletingAccount: "Eliminazione in corso…",
  deleteAccountCancel: "Annulla",
  accountDeletedTitle: "Account eliminato",
  accountDeletedBody:
    "Il tuo account è stato cancellato e hai effettuato il logout. Le tue segnalazioni restano pubblicate senza attribuzione.",
  errorDeleteAccount: "Impossibile eliminare l'account. Riprova.",
  // Modifica inline del nome visualizzato (C6/C8 — l'unico campo profilo
  // modificabile inline).
  displayNameEdit: "Modifica nome visualizzato",
  displayNameSave: "Salva",
  displayNameCancel: "Annulla",
  displayNameHelp: "Tra 2 e 60 caratteri.",
  displayNameSaved: "Nome visualizzato salvato.",
  errorDisplayName: "Il nome visualizzato deve essere tra 2 e 60 caratteri.",
  errorDisplayNameRateLimit: "Troppi tentativi. Riprova tra un minuto.",
  errorDisplayNameGeneric: "Non è stato possibile salvare il nome visualizzato. Riprova.",
  // Autenticazione multi-metodo (Fase E2 — design Vera): selettore su /login.
  methodSelectorLabel: "Scegli come accedere",
  methodPassword: "Email e password",
  methodPasskey: "Passkey",
  methodSocial: "Accesso tramite social",
  // Accesso con passkey (Fase C).
  passkeyLogin: "Accedi con passkey",
  passkeyEmailOptional: "Email dell'account (facoltativa)",
  passkeyEmailHint:
    "Facoltativa: limita la richiesta alle passkey di questo account. Lascia vuoto per usare qualsiasi passkey salvata su questo dispositivo.",
  passkeyUnsupported:
    "Questo browser non supporta le passkey. Usa email + password oppure aggiorna il browser.",
  passkeyErrorBegin: "Impossibile avviare l'accesso con passkey. Riprova.",
  passkeyErrorFailed: "Verifica della passkey non riuscita. Riprova.",
  // Accesso social / OIDC (Fase D, ADR 0020 decisione 4 — la disclosure È
  // il requisito privacy: la superficie di tracciamento del fornitore e il
  // trasferimento UE-USA DPF vengono dichiarati qui, su /login).
  oidcGithub: "Continua con GitHub",
  oidcGoogle: "Continua con Google",
  oidcDisclosure:
    "L'accesso con un fornitore terzo ti porta sul sito del fornitore, che viene a conoscenza della tua visita e potrebbe trasferire dati fuori dall'UE. La tua email presso il fornitore non viene mai importata né salvata. Vedi l'informativa privacy.",
  oidcErrorGeneric: "Accesso social non riuscito o annullato. Riprova.",
  // Merge OIDC manuale (prova con la password dell'account esistente).
  mergeTitle: "Collega il tuo account social",
  mergeIntro:
    "Hai effettuato l'accesso con un fornitore social, ma esiste già un account con questa email. Dimostra che è tuo inserendo la password per collegarli.",
  mergeSubmit: "Collega gli account",
  mergeErrorExpired: "Questo link di collegamento non è più valido. Riprova con il fornitore.",
  mergeErrorGeneric: "Impossibile collegare gli account. Riprova.",
  // Gestione passkey su /account (Fase E2).
  passkeysSection: "Passkey",
  passkeysHint:
    "Aggiungi una passkey per accedere con il tuo dispositivo (impronta, PIN o chiave di sicurezza) invece della password.",
  passkeysEmpty: "Nessuna passkey registrata.",
  passkeyAdd: "Aggiungi passkey",
  passkeyAddHelp:
    "Ti verrà chiesto di confermare con il tuo dispositivo. Quando la passkey viene aggiunta ricevi 10 codici di recupero monouso: conservali in un luogo sicuro.",
  passkeyAdded: "Passkey aggiunta.",
  passkeyEnrolledLabel: "Registrata",
  passkeyRemove: "Rimuovi",
  passkeyRemoveConfirm: "Rimuovere questa passkey?",
  passkeyRemoveConfirmBody:
    "Questa passkey non potrà più essere usata per accedere. Gli altri metodi di accesso continuano a funzionare.",
  passkeyRemoveCancel: "Annulla",
  passkeyRemoveBusy: "Rimozione…",
  passkeyNotFound: "Questa passkey non è più registrata.",
  passkeyRemoveError: "Impossibile rimuovere la passkey. Riprova.",
  passkeyAlreadyEnrolled: "Questa passkey è già registrata sul tuo account.",
  passkeyEnrollError: "Impossibile aggiungere la passkey. Riprova.",
  passkeySessionLost: "La sessione è scaduta. Accedi di nuovo e riprova.",
  passkeyCsrfExpired: "Il token di sicurezza è scaduto. Ricarica la pagina e riprova.",
  passkeysError: "Impossibile caricare le tue passkey. Riprova.",
  // Codici di recupero (emessi una sola volta alla registrazione della passkey).
  recoveryTitle: "Codici di recupero",
  recoveryBody:
    "Questi 10 codici monouso sono l'unico modo per accedere se perdi la passkey. Ogni codice vale una volta. Vengono mostrati solo ora: conservali in un luogo sicuro.",
  recoveryCopy: "Copia i codici",
  recoveryCopied: "Copiati.",
  recoverySaved: "Li ho salvati",
  // Verifica email (UI Fase B — design Vera): pagina /verify-email e banner
  // su /account. Il link nella email ora atterra su una pagina vera (non JSON
  // grezzo); la pagina consuma GET /api/auth/verify-email e offre il re-invio
  // quando il token è morto.
  verifyTitle: "Verifica la tua email",
  verifyChecking: "Verifica del link in corso…",
  verifySuccessTitle: "Email verificata",
  verifySuccessBody:
    "Il tuo indirizzo email è verificato. Ora puoi accedere e iniziare a contribuire.",
  verifyInvalidTitle: "Link non valido o scaduto",
  verifyInvalidBody:
    "Questo link di verifica non è valido o è già stato usato. Puoi richiedere un nuovo link.",
  verifyExpiredTitle: "Questo link non è più valido",
  verifyExpiredBody:
    "Questo link di verifica è già stato usato o è scaduto. Richiedi un nuovo link per continuare.",
  verifyResend: "Invia di nuovo l'email di verifica",
  verifyResent: "Email di verifica inviata.",
  verifyResendRateLimited: "Troppe email. Riprova più tardi.",
  verifyResendError: "Impossibile inviare di nuovo l'email. Riprova.",
  verifyLoginToResend: "Accedi per richiedere un nuovo link.",
  verifyGoToAccount: "Vai al tuo account",
  verifyError: "Impossibile verificare la tua email. Riprova.",
  // Banner di verifica su /account (letto da contributor.emailVerifiedAt).
  verifyBannerTitle: "Verifica la tua email per contribuire",
  verifyBannerBody:
    "Controlla la casella di posta: il link di conferma è arrivato via email. Per inviare segnalazioni e correzioni è necessaria un'email verificata.",
  verifyBannerResend: "Invia di nuovo l'email",
  verifyBannerResent: "Email di conferma inviata.",
  verifyBannerDone: "Email verificata — puoi contribuire.",
  // Password dimenticata (P1-3): ingresso da /login e pagina /forgot-password.
  forgotPassword: "Password dimenticata?",
  forgotTitle: "Reimposta la password",
  forgotIntro:
    "Inserisci l'email del tuo account: ti invieremo un link per reimpostare la password.",
  forgotSubmit: "Invia il link di reset",
  forgotSent:
    "Se esiste un account per questa email, il link di reset è in arrivo. Il link scade tra 3 ore. Controlla la casella di posta.",
  forgotBackToLogin: "Torna all'accesso",
  // Pagina /reset-password (consuma il token monouso dell'email).
  resetTitle: "Imposta una nuova password",
  resetIntro: "Scegli una nuova password per il tuo account.",
  resetNewPassword: "Nuova password",
  resetConfirmPassword: "Ripeti la nuova password",
  resetMismatch: "Le due password non coincidono.",
  resetSubmit: "Cambia password",
  resetSuccessTitle: "Password cambiata",
  resetSuccessBody:
    "La tua password è stata cambiata e tutte le sessioni sono state chiuse. Accedi con la nuova password.",
  resetInvalid: "Link di reset non valido o scaduto.",
  resetExpired:
    "Questo link di reset è già stato usato o è scaduto. Richiedine uno nuovo.",
  resetGoToLogin: "Accedi",
  resetRequestAnother: "Richiedi un nuovo link",
  // Login wall sui tool di scrittura (P1-2 — design Vera): gli stati anonimo
  // e non verificato sostituiscono il modulo su /segnala e /correggi.
  wallLoginTitle: "Accedi per contribuire",
  wallLoginBody:
    "Segnalazioni e correzioni sono pubblicate da contributor verificati. Accedi o crea un account per continuare.",
  wallLogIn: "Accedi",
  wallCreateAccount: "Crea un account",
  wallVerifyTitle: "Verifica la tua email per contribuire",
  wallVerifyBody:
    "Il tuo account non è ancora verificato. Controlla la casella di posta per il link di conferma, oppure invialo di nuovo.",
  wallResend: "Invia di nuovo l'email di verifica",
  wallResent: "Email di verifica inviata.",
  wallGoToAccount: "Vai al tuo account",
  wallChecking: "Verifica in corso…",
  wallError: "Impossibile verificare la sessione. Riprova.",
  // Disclosure privacy per metodo (P1-4 — matrice rischi completa, ADR 0020
  // decisione 6). Ogni metodo dichiara la propria superficie di rischio; la
  // disclosure OIDC esisteva già e resta invariata.
  methodDisclosureLabel: "Nota sulla privacy",
  passwordDisclosure:
    "Il tuo indirizzo email è un dato personale ed è conservato per gestire il tuo account. Gli accessi con sola password possono essere presi di mira dal phishing: controlla sempre la barra degli indirizzi prima di digitare la password.",
  passkeyDisclosure:
    "Il controllo biometrico (impronta, volto o PIN) avviene sul tuo dispositivo. Se la passkey è sincronizzata tramite il cloud del fornitore (Apple, Google, Microsoft), quel fornitore può vedere che usi questo sito; le passkey legate al dispositivo non vengono mai sincronizzate.",
};
