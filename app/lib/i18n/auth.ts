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
  backHome: "Back to the map",
  loginTitle: "Log in",
  registerTitle: "Create a contributor account",
  accountTitle: "Your account",
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
  passwordHint: "At least 10 characters.",
  anonymousNote:
    "You do not need an account to report a camera. An account lets you track your own reports.",
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
  passkeyLoginHint:
    "Your device will ask you to confirm with a fingerprint, face or PIN. Nothing leaves your device.",
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
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione principale",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  accountAria: "Il tuo account",
  backHome: "Torna alla mappa",
  loginTitle: "Accedi",
  registerTitle: "Crea un account da contributor",
  accountTitle: "Il tuo account",
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
  passwordHint: "Almeno 10 caratteri.",
  anonymousNote:
    "Non serve un account per segnalare una telecamera. Un account ti permette di tenere traccia delle tue segnalazioni.",
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
  methodSocial: "Accesso con social",
  // Accesso con passkey (Fase C).
  passkeyLogin: "Accedi con passkey",
  passkeyEmailOptional: "Email dell'account (facoltativa)",
  passkeyEmailHint:
    "Facoltativa: limita la richiesta alle passkey di questo account. Lascia vuoto per usare qualsiasi passkey salvata su questo dispositivo.",
  passkeyLoginHint:
    "Il dispositivo ti chiederà di confermare con impronta, volto o PIN. Nulla lascia il tuo dispositivo.",
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
};
