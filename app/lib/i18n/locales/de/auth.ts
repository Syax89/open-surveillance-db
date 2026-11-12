/**
 * auth — DE translation. Parity-checked against the English pilot
 * bundle (../../auth.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../auth";
import { de as authNavDe } from "./auth-nav";

export const de: Translation<typeof en> = {
  // Header auth links (accountAria, accountTitle, login, register) live in
  // the tiny ./auth-nav fragment so the header on every route ships only
  // those labels, not this whole domain; spread here so `auth.*` keeps the
  // same keys for every other consumer.
  ...authNavDe,
  navigation: "Hauptnavigation",
  homeAria: "OpenSurveillanceDB Startseite",
  loginTitle: "Anmelden",
  registerTitle: "Konto zum Mitmachen erstellen",
  // F5 (QA#6): per-page metadata for the client auth pages (/login, /register).
  loginMetaDescription:
    "Melde dich an, um Meldungen und Korrekturen an die öffentliche Datenbank von OpenSurveillanceDB zu senden.",
  registerMetaDescription:
    "Erstelle ein kostenloses Konto, um öffentliche Überwachungskameras zu melden.",
  email: "E-Mail",
  password: "Passwort",
  displayName: "Anzeigename (optional)",
  logout: "Abmelden",
  // Moderator/admin shortcut on the account page (ADR 0003 2026-10): shown
  // only when GET /api/auth/me reports a coarse role of moderator+.
  goToModeration: "Zur Moderation",
  noAccount: "Noch kein Konto?",
  haveAccount: "Du hast schon ein Konto?",
  createOne: "Jetzt erstellen",
  signIn: "Stattdessen anmelden",
  passwordRequirements: "Dein Passwort muss Folgendes enthalten:",
  passwordRuleLength: "Mindestens 10 Zeichen",
  passwordRuleUppercase: "Einen Großbuchstaben (A–Z)",
  passwordRuleLowercase: "Einen Kleinbuchstaben (a–z)",
  passwordRuleDigit: "Eine Ziffer (0–9)",
  passwordRuleSpecial: "Ein Sonderzeichen (z. B. ! @ # $ %)",
  passwordWeak: "Dein Passwort erfüllt die obigen Anforderungen nicht.",
  anonymousNote:
    "Zum Melden einer Kamera brauchst du ein kostenloses Konto. Damit kannst du auch deine eigenen Meldungen verfolgen.",
  privacyNotice: "Datenschutzerklärung",
  privacyDetails: "Details zum Datenschutz",
  termsOfUse: "Nutzungsbedingungen",
  registerArt13:
    "Deine Kontodaten (E-Mail, optionaler Anzeigename) werden vom Verantwortlichen Simone Rondina / OpenSurveillanceDB auf Grundlage des berechtigten Interesses (Art. 6 Abs. 1 lit. f DSGVO) verarbeitet, um Konten für Mitwirkende bereitzustellen. Vollständige Erklärung:",
  registerArt13Rights: "Deine Rechte nach DSGVO (Art. 15–22) kannst du per E-Mail geltend machen an",
  privacyContact: "privacy@opensurveillancedb.org",
  profileSection: "Profil",
  memberSince: "Mitglied seit",
  emailLabel: "E-Mail",
  displayNameLabel: "Anzeigename",
  submissionsSection: "Deine Meldungen",
  noSubmissions: "Du hast noch keine Meldungen unter deinem Namen eingereicht.",
  submissionStatus: "Status",
  submissionCreated: "Eingereicht",
  loggedOutTitle: "Du bist abgemeldet",
  loggedOutBody: "Deine Sitzung ist beendet. Du kannst dieses Fenster schließen oder dich erneut anmelden.",
  errorInvalidCredentials: "Ungültige Anmeldedaten.",
  // Register confirmation: shown after EVERY accepted submit, new address or
  // not — the API answers the same for both (no account enumeration).
  registerCheckEmailTitle: "Sieh in dein Postfach",
  registerCheckEmailBody:
    "Falls diese Adresse verwendet werden kann, haben wir dir eine E-Mail mit dem nächsten Schritt geschickt. Sieh in deinem Posteingang (und im Spam-Ordner) nach.",
  errorGeneric: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  errorCrossOrigin: "Websiteübergreifende Anfrage abgelehnt.",
  // Static copy on /login (t_6dc1c96f — CEO feedback 2026-08-03): login is
  // blocked until the email is verified, and the API answers the same generic
  // 401 for every failure (anti-enumeration). This note is shown to everyone,
  // so it never reveals account existence — it just explains, in advance, why
  // a correct password might be rejected right after registering.
  loginVerifyHint:
    "Gerade registriert? Schau in deinem Postfach nach der Bestätigungs-E-Mail — anmelden kannst du dich erst, wenn deine E-Mail-Adresse bestätigt ist.",
  loading: "Wird geladen…",
  anonymous: "Anonym",
  notAuthenticatedTitle: "Nicht angemeldet",
  notAuthenticatedBody: "Melde dich an, um dein Profil und deine Meldungen zu sehen.",
  deleteAccountSection: "Konto löschen",
  deleteAccountHint:
    "Löscht dein Konto und entfernt die Verknüpfung zwischen dir und deinen Meldungen. Die Meldungen selbst bleiben anonym veröffentlicht.",
  deleteAccountConfirm: "Konto endgültig löschen?",
  deleteAccountConfirmBody:
    "Dein Konto und alle zugehörigen Sitzungen werden gelöscht. Deine Meldungen bleiben veröffentlicht, aber nicht mehr dir zugeordnet. Das lässt sich nicht rückgängig machen.",
  deleteAccount: "Konto löschen",
  deletingAccount: "Konto wird gelöscht…",
  deleteAccountCancel: "Abbrechen",
  accountDeletedTitle: "Konto gelöscht",
  accountDeletedBody:
    "Dein Konto wurde gelöscht und du bist abgemeldet. Deine Meldungen bleiben ohne Namensnennung veröffentlicht.",
  errorDeleteAccount: "Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut.",
  // Display name inline edit (C6/C8 — the only inline-editable profile field).
  displayNameEdit: "Anzeigename bearbeiten",
  displayNameSave: "Speichern",
  displayNameCancel: "Abbrechen",
  displayNameHelp: "Zwischen 2 und 60 Zeichen.",
  displayNameSaved: "Anzeigename gespeichert.",
  errorDisplayName: "Der Anzeigename muss zwischen 2 und 60 Zeichen lang sein.",
  errorDisplayNameRateLimit: "Zu viele Versuche. Bitte versuche es in einer Minute erneut.",
  errorDisplayNameGeneric: "Der Anzeigename konnte nicht gespeichert werden. Bitte versuche es erneut.",
  // Multi-method auth (Fase E2 — single-tile login): email + password is the
  // primary flow. Passkey and configured OIDC providers remain visible below
  // a localized divider as alternatives within the same auth card.
  methodPassword: "E-Mail + Passwort",
  methodPasskey: "Passkey",
  methodSocialTitle: "Mit einem Anbieter anmelden",
  loginOr: "oder",
  loginAlternatives: "Weitere Anmeldemöglichkeiten",
  // Passkey login (Fase C).
  passkeyLogin: "Mit Passkey anmelden",
  passkeyEmailOptional: "E-Mail des Kontos (optional)",
  passkeyEmailHint:
    "Optional: beschränkt die Abfrage auf die Passkeys dieses Kontos. Lass das Feld leer, um einen beliebigen auf diesem Gerät gespeicherten Passkey zu verwenden.",
  passkeyUnsupported:
    "Dieser Browser unterstützt keine Passkeys. Nutze E-Mail + Passwort oder aktualisiere deinen Browser.",
  passkeyErrorBegin: "Die Anmeldung mit Passkey konnte nicht gestartet werden. Bitte versuche es erneut.",
  passkeyErrorFailed: "Die Passkey-Prüfung ist fehlgeschlagen. Bitte versuche es erneut.",
  // Social / OIDC (Fase D, ADR 0020 decision 4 — the disclosure IS the
  // privacy requirement: the provider tracking surface and the EU-US DPF
  // transfer are declared here, on /login).
  oidcGithub: "Weiter mit GitHub",
  oidcGoogle: "Weiter mit Google",
  oidcDisclosure:
    "Bei der Anmeldung über Dritte wirst du zum Anbieter weitergeleitet. Dieser erfährt, dass du diese Website besuchst, und überträgt möglicherweise Daten außerhalb der EU. Die E-Mail-Adresse deines Anbieters wird nie importiert oder gespeichert. Siehe Datenschutzerklärung.",
  oidcErrorGeneric: "Die Anmeldung über den Anbieter ist fehlgeschlagen oder wurde abgebrochen. Bitte versuche es erneut.",
  // Manual OIDC merge (email-conflict proof with the account password).
  mergeTitle: "Anbieterkonto verknüpfen",
  mergeIntro:
    "Du hast dich über einen Anbieter angemeldet, aber es gibt bereits ein Konto mit dieser E-Mail-Adresse. Bestätige mit dessen Passwort, dass es dir gehört, um beide zu verknüpfen.",
  mergeSubmit: "Konten verknüpfen",
  mergeErrorExpired: "Dieser Verknüpfungslink ist nicht mehr gültig. Bitte versuche es erneut über den Anbieter.",
  mergeErrorGeneric: "Die Konten konnten nicht verknüpft werden. Bitte versuche es erneut.",
  // /account passkey management (Fase E2).
  passkeysSection: "Passkeys",
  passkeysHint:
    "Füge einen Passkey hinzu, um dich statt mit Passwort mit deinem Gerät anzumelden (Biometrie, PIN oder Sicherheitsschlüssel).",
  passkeysEmpty: "Noch keine Passkeys eingerichtet.",
  // Disclosure summary count (account rework 2026-08-08).
  passkeySingular: "Passkey",
  passkeyPlural: "Passkeys",
  passkeyAdd: "Passkey hinzufügen",
  passkeyAddHelp:
    "Du wirst gebeten, mit deinem Gerät zu bestätigen. Sobald der Passkey hinzugefügt ist, erhältst du 10 einmalige Wiederherstellungscodes — bewahre sie sicher auf.",
  passkeyAdded: "Passkey hinzugefügt.",
  passkeyEnrolledLabel: "Eingerichtet",
  passkeyRemove: "Entfernen",
  passkeyRemoveConfirm: "Diesen Passkey entfernen?",
  passkeyRemoveConfirmBody:
    "Mit diesem Passkey kannst du dich dann nicht mehr anmelden. Deine anderen Anmeldemethoden funktionieren weiterhin.",
  passkeyRemoveCancel: "Abbrechen",
  passkeyRemoveBusy: "Wird entfernt…",
  passkeyNotFound: "Dieser Passkey ist nicht mehr eingerichtet.",
  passkeyRemoveError: "Der Passkey konnte nicht entfernt werden. Bitte versuche es erneut.",
  passkeyAlreadyEnrolled: "Dieser Passkey ist bereits für dein Konto eingerichtet.",
  passkeyEnrollError: "Der Passkey konnte nicht hinzugefügt werden. Bitte versuche es erneut.",
  passkeySessionLost: "Deine Sitzung ist abgelaufen. Melde dich erneut an und versuche es noch einmal.",
  passkeyCsrfExpired: "Dein Sicherheitstoken ist abgelaufen. Lade die Seite neu und versuche es erneut.",
  passkeysError: "Deine Passkeys konnten nicht geladen werden. Bitte versuche es erneut.",
  // Recovery codes (issued exactly once at passkey enrollment).
  recoveryTitle: "Wiederherstellungscodes",
  recoveryBody:
    "Diese 10 Einmalcodes sind der einzige Weg, dich anzumelden, wenn du deinen Passkey verlierst. Jeder Code funktioniert nur einmal. Sie werden nur jetzt angezeigt — bewahre sie sicher auf.",
  recoveryCopy: "Codes kopieren",
  recoveryCopied: "Kopiert.",
  recoverySaved: "Ich habe sie gespeichert",
  // API keys (epic api-keys, T19 — write API authentication). The /account
  // section sits between passkeys and the danger zone. Private keys unlock
  // WRITE access only: the public read API stays keyless, so reading never
  // needs a key. The raw key is shown exactly once, at creation.
  apiKeysSection: "API-Schlüssel",
  apiKeysHint:
    "Mit privaten Schlüsseln können Skripte und Tools ohne Browsersitzung in die API schreiben. Zum Lesen brauchst du nie einen Schlüssel.",
  apiKeyCreate: "API-Schlüssel erstellen",
  apiKeyNameLabel: "Name des Schlüssels",
  apiKeyNameHelp:
    "Eine kurze Bezeichnung, an der du den Schlüssel erkennst, z. B. „Nächtliches Sync-Skript“.",
  apiKeyNameRequired: "Gib dem Schlüssel einen Namen.",
  apiKeyNameTooLong: "Der Name darf höchstens 60 Zeichen lang sein.",
  apiKeyScopeLabel: "Berechtigungen",
  apiKeyScopeHelp:
    "Wähle, was dieser Schlüssel darf. Du kannst Berechtigungen später einschränken, aber keine hinzufügen.",
  apiKeyScopeSubmitLabel: "Meldungen und Korrekturen einreichen",
  apiKeyScopeSubmitGrant: "Erlaubt Skripten, Kamerameldungen und Korrekturen zu veröffentlichen.",
  apiKeyScopeConfirmLabel: "Kameras bestätigen",
  apiKeyScopeConfirmGrant: "Erlaubt Skripten, Kameras als bestätigt zu markieren.",
  apiKeyScopeEditLabel: "Kameras bearbeiten",
  apiKeyScopeEditGrant: "Erlaubt Skripten, Kameradetails über den Bearbeitungs-Endpunkt zu ändern.",
  apiKeyScopeActionLabel: "Community-Aktionen",
  apiKeyScopeActionGrant:
    "Erlaubt Skripten, Community-Aktionen auszuführen (nützlich, entfernt, Problem, Datenschutz).",
  apiKeyCreatedLabel: "Erstellt",
  apiKeyLastUsedLabel: "Zuletzt genutzt",
  apiKeyLastUsedNever: "Nie genutzt",
  apiKeyExpiresLabel: "Läuft ab",
  apiKeyExpiresNever: "Nie",
  apiKeyExpiryLabel: "Gültigkeit",
  apiKeyExpiry30: "30 Tage",
  apiKeyExpiry90: "90 Tage",
  apiKeyExpiry365: "365 Tage",
  apiKeyExpiryHelp: "Nach diesem Zeitraum funktioniert der Schlüssel nicht mehr; wähle „Nie“ für unbegrenzte Gültigkeit. Die Voreinstellung entspricht dem API-Standard von 365 Tagen.",
  apiKeyScopesLabel: "Berechtigungen",
  apiKeyStatusLabel: "Status",
  apiKeyStatusActive: "Aktiv",
  apiKeyStatusRevoked: "Widerrufen",
  apiKeyRevoke: "Widerrufen",
  apiKeyRevokeConfirm: "Diesen Schlüssel widerrufen?",
  apiKeyRevokeConfirmBody:
    "Skripte mit diesem Schlüssel schlagen sofort mit einem 401 fehl. Das lässt sich nicht rückgängig machen — erstelle bei Bedarf einen neuen Schlüssel.",
  apiKeyRevokeCancel: "Abbrechen",
  apiKeyRevokeBusy: "Wird widerrufen…",
  apiKeyRevoked: "Widerrufen",
  apiKeyEmptyTitle: "Noch keine API-Schlüssel",
  apiKeyEmptyBody:
    "Erstelle einen Schlüssel, damit deine Skripte ohne Anmeldung Meldungen und Korrekturen einreichen können.",
  apiKeyDocsLink: "Zur API-Dokumentation",
  apiKeyCreateTitle: "API-Schlüssel erstellen",
  apiKeyCreateBody:
    "Der Schlüssel wird nur einmal angezeigt, beim Erstellen. Kopiere ihn sofort — er wird nicht auf unseren Servern gespeichert.",
  apiKeyCreateSubmit: "Schlüssel erstellen",
  apiKeyCreateCancel: "Abbrechen",
  apiKeyCreateBusy: "Wird erstellt…",
  apiKeyRevealTitle: "Dein API-Schlüssel",
  apiKeyRevealBody:
    "Kopiere ihn jetzt — nur dieses eine Mal wird der vollständige Schlüssel angezeigt. Wer diesen Schlüssel hat, kann in deinem Namen in die API schreiben.",
  apiKeyRevealCopy: "Schlüssel kopieren",
  apiKeyRevealCopied: "Kopiert.",
  apiKeyRevealSaved: "Ich habe ihn gespeichert",
  apiKeyErrorList: "Deine API-Schlüssel konnten nicht geladen werden. Bitte versuche es erneut.",
  apiKeyErrorCreate: "Der Schlüssel konnte nicht erstellt werden. Bitte versuche es erneut.",
  apiKeyErrorRevoke: "Der Schlüssel konnte nicht widerrufen werden. Bitte versuche es erneut.",
  apiKeyErrorLimit: "Du hast bereits 5 API-Schlüssel. Widerrufe einen, bevor du einen neuen erstellst.",
  apiKeyErrorSession: "Deine Sitzung ist abgelaufen. Melde dich erneut an und versuche es noch einmal.",
  apiKeyErrorCsrf: "Dein Sicherheitstoken ist abgelaufen. Lade die Seite neu und versuche es erneut.",
  // Email verification (Fase B UI — design review): /verify-email page and the
  // /account banner. The verification link in the email now lands on a real
  // page (not raw JSON); the page consumes GET /api/auth/verify-email and
  // offers a resend when the token is dead.
  verifyTitle: "E-Mail-Adresse bestätigen",
  verifyChecking: "Dein Bestätigungslink wird geprüft…",
  verifySuccessTitle: "E-Mail-Adresse bestätigt",
  verifySuccessBody:
    "Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden und mitmachen.",
  verifyInvalidTitle: "Ungültiger oder abgelaufener Link",
  verifyInvalidBody:
    "Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet. Du kannst einen neuen Link anfordern.",
  verifyExpiredTitle: "Dieser Link ist nicht mehr gültig",
  verifyExpiredBody:
    "Dieser Bestätigungslink wurde bereits verwendet oder ist abgelaufen. Fordere einen neuen Link an, um fortzufahren.",
  verifyForgotPasswordHint:
    "Du kannst dich nicht anmelden, um einen neuen Link anzufordern? Nutze „Passwort vergessen?“ mit derselben Adresse: Ein neues Passwort bestätigt auch deine E-Mail.",
  verifyResend: "Bestätigungs-E-Mail erneut senden",
  verifyResent: "Bestätigungs-E-Mail gesendet.",
  verifyResendRateLimited: "Zu viele E-Mails. Bitte versuche es später erneut.",
  verifyResendError: "Die E-Mail konnte nicht erneut gesendet werden. Bitte versuche es erneut.",
  verifyLoginToResend: "Melde dich an, um einen neuen Link anzufordern.",
  verifyGoToAccount: "Zu deinem Konto",
  verifyError: "Deine E-Mail-Adresse konnte nicht bestätigt werden. Bitte versuche es erneut.",
  // /account verification banner (read from contributor.emailVerifiedAt).
  verifyBannerTitle: "Bestätige deine E-Mail-Adresse, um mitzumachen",
  verifyBannerBody:
    "Schau in deinem Postfach nach dem Bestätigungslink. Für Meldungen und Korrekturen brauchst du eine bestätigte E-Mail-Adresse.",
  verifyBannerResend: "E-Mail erneut senden",
  verifyBannerResent: "Bestätigungs-E-Mail gesendet.",
  verifyBannerDone: "E-Mail-Adresse bestätigt — du kannst mitmachen.",
  // Forgot password (P1-3): entry from /login and the /forgot-password page.
  forgotPassword: "Passwort vergessen?",
  forgotTitle: "Passwort zurücksetzen",
  forgotIntro:
    "Gib die E-Mail-Adresse deines Kontos ein, und wir senden dir einen Link zum Zurücksetzen.",
  forgotSubmit: "Link senden",
  forgotSent:
    "Falls ein Konto mit dieser E-Mail-Adresse existiert, ist ein Link zum Zurücksetzen unterwegs. Der Link läuft nach 3 Stunden ab. Schau in dein Postfach.",
  forgotBackToLogin: "Zurück zur Anmeldung",
  // /reset-password page (consumes the single-use token from the email).
  resetTitle: "Neues Passwort festlegen",
  resetIntro: "Wähle ein neues Passwort für dein Konto.",
  resetNewPassword: "Neues Passwort",
  resetConfirmPassword: "Neues Passwort wiederholen",
  resetMismatch: "Die beiden Passwörter stimmen nicht überein.",
  resetSubmit: "Passwort ändern",
  resetSuccessTitle: "Passwort geändert",
  resetSuccessBody:
    "Dein Passwort wurde geändert und alle Sitzungen wurden beendet. Melde dich mit dem neuen Passwort an.",
  resetInvalid: "Ungültiger oder abgelaufener Link zum Zurücksetzen.",
  resetExpired:
    "Dieser Link wurde bereits verwendet oder ist abgelaufen. Fordere einen neuen an.",
  resetGoToLogin: "Anmelden",
  resetRequestAnother: "Neuen Link anfordern",
  // Login wall on the write tools (P1-2 — design review): anonymous and
  // unverified states replace the form on /segnala and /correggi.
  wallLoginTitle: "Melde dich an, um mitzumachen",
  wallLoginBody:
    "Meldungen und Korrekturen werden von verifizierten Mitwirkenden veröffentlicht. Melde dich an oder erstelle ein Konto, um fortzufahren.",
  wallLogIn: "Anmelden",
  wallCreateAccount: "Konto erstellen",
  wallVerifyTitle: "Bestätige deine E-Mail-Adresse, um mitzumachen",
  wallVerifyBody:
    "Dein Konto ist noch nicht bestätigt. Schau in deinem Postfach nach dem Bestätigungslink oder fordere ihn erneut an.",
  wallResend: "Bestätigungs-E-Mail erneut senden",
  wallResent: "Bestätigungs-E-Mail gesendet.",
  wallGoToAccount: "Zu deinem Konto",
  wallChecking: "Wird geprüft…",
  wallError: "Deine Sitzung konnte nicht geprüft werden. Bitte versuche es erneut.",
  // QA#2 F4: the error-wall retry button label (the old ternary rendered
  // t.loading — a truthy string — so the button ALWAYS said "Verify your
  // email" even though its action retries the session check).
  wallRetry: "Erneut versuchen",
  // Per-method privacy disclosure (P1-4 — risk matrix complete, ADR 0020
  // decision 6). Each sign-in method declares its own risk surface; the OIDC
  // disclosure already existed and is kept unchanged.
  methodDisclosureLabel: "Hinweis zum Datenschutz",
  passwordDisclosure:
    "Deine E-Mail-Adresse ist ein personenbezogenes Datum und wird zur Führung deines Kontos gespeichert. Reine Passwort-Anmeldungen können Ziel von Phishing sein — prüfe immer die Adressleiste, bevor du dein Passwort eingibst.",
  passkeyDisclosure:
    "Die biometrische Prüfung (Fingerabdruck, Gesicht oder PIN) erfolgt auf deinem Gerät. Wird dein Passkey über die Cloud eines Anbieters synchronisiert (Apple, Google, Microsoft), kann dieser Anbieter sehen, dass du diese Website nutzt; gerätegebundene Passkeys werden nie synchronisiert.",
};
