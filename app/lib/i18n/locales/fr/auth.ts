/**
 * auth — FR translation. Parity-checked against the English pilot
 * bundle (../../auth.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../auth";
import { fr as authNavFr } from "./auth-nav";

export const fr: Translation<typeof en> = {
  // Header auth links (accountAria, accountTitle, login, register) live in
  // the tiny ./auth-nav fragment so the header on every route ships only
  // those labels, not this whole domain; spread here so `auth.*` keeps the
  // same keys for every other consumer.
  ...authNavFr,
  navigation: "Navigation principale",
  homeAria: "Accueil OpenSurveillanceDB",
  loginTitle: "Se connecter",
  registerTitle: "Créer un compte contributeur",
  // F5 (QA#6): per-page metadata for the client auth pages (/login, /register).
  loginMetaDescription:
    "Connectez-vous pour envoyer des signalements et des corrections à la base de données publique OpenSurveillanceDB.",
  registerMetaDescription:
    "Créez un compte contributeur gratuit pour signaler des caméras de surveillance publiques.",
  email: "E-mail",
  password: "Mot de passe",
  displayName: "Nom affiché (facultatif)",
  logout: "Se déconnecter",
  // Moderator/admin shortcut on the account page (ADR 0003 2026-10): shown
  // only when GET /api/auth/me reports a coarse role of moderator+.
  goToModeration: "Aller à la modération",
  noAccount: "Pas encore de compte ?",
  haveAccount: "Vous avez déjà un compte ?",
  createOne: "Créer un compte",
  signIn: "Se connecter plutôt",
  passwordRequirements: "Votre mot de passe doit contenir :",
  passwordRuleLength: "Au moins 10 caractères",
  passwordRuleUppercase: "Une lettre majuscule (A–Z)",
  passwordRuleLowercase: "Une lettre minuscule (a–z)",
  passwordRuleDigit: "Un chiffre (0–9)",
  passwordRuleSpecial: "Un caractère spécial (p. ex. ! @ # $ %)",
  passwordWeak: "Votre mot de passe ne respecte pas les exigences ci-dessus.",
  anonymousNote:
    "Un compte gratuit est nécessaire pour signaler une caméra ; il vous permet aussi de suivre vos propres signalements.",
  privacyNotice: "Politique de confidentialité",
  privacyDetails: "Détails sur la confidentialité",
  termsOfUse: "Conditions d’utilisation",
  registerArt13:
    "Les données de votre compte (e-mail, nom affiché facultatif) sont traitées par le responsable du traitement Simone Rondina / OpenSurveillanceDB sur la base de l’intérêt légitime (art. 6, par. 1, point f) du RGPD) afin de fournir les comptes contributeurs. Information complète :",
  registerArt13Rights: "Vous pouvez exercer vos droits au titre du RGPD (art. 15 à 22) en écrivant à",
  privacyContact: "privacy@opensurveillancedb.org",
  profileSection: "Profil",
  memberSince: "Membre depuis",
  emailLabel: "E-mail",
  displayNameLabel: "Nom affiché",
  submissionsSection: "Vos signalements",
  noSubmissions: "Vous n’avez encore envoyé aucun signalement attribué.",
  submissionStatus: "Statut",
  submissionCreated: "Envoyé",
  loggedOutTitle: "Vous êtes déconnecté",
  loggedOutBody: "Votre session est terminée. Vous pouvez fermer cette fenêtre ou vous reconnecter.",
  errorInvalidCredentials: "Identifiants invalides.",
  errorEmailTaken: "Un compte existe déjà avec cette adresse e-mail.",
  errorGeneric: "Une erreur est survenue. Veuillez réessayer.",
  errorCrossOrigin: "Requête intersite refusée.",
  // Static copy on /login (t_6dc1c96f — CEO feedback 2026-08-03): login is
  // blocked until the email is verified, and the API answers the same generic
  // 401 for every failure (anti-enumeration). This note is shown to everyone,
  // so it never reveals account existence — it just explains, in advance, why
  // a correct password might be rejected right after registering.
  loginVerifyHint:
    "Vous venez de vous inscrire ? Consultez votre boîte de réception pour l’e-mail de vérification : vous ne pourrez vous connecter qu’une fois votre adresse vérifiée.",
  loading: "Chargement…",
  anonymous: "Anonyme",
  notAuthenticatedTitle: "Non connecté",
  notAuthenticatedBody: "Connectez-vous pour voir votre profil et vos signalements attribués.",
  deleteAccountSection: "Supprimer le compte",
  deleteAccountHint:
    "Supprime votre compte et le lien entre vous et vos signalements. Les signalements eux-mêmes restent publiés de façon anonyme.",
  deleteAccountConfirm: "Supprimer définitivement le compte ?",
  deleteAccountConfirmBody:
    "Votre compte et toutes ses sessions seront effacés. Vos signalements restent publiés, sans vous être attribués. Cette action est irréversible.",
  deleteAccount: "Supprimer le compte",
  deletingAccount: "Suppression du compte…",
  deleteAccountCancel: "Annuler",
  accountDeletedTitle: "Compte supprimé",
  accountDeletedBody:
    "Votre compte a été effacé et vous êtes déconnecté. Vos signalements restent publiés sans attribution.",
  errorDeleteAccount: "Impossible de supprimer le compte. Veuillez réessayer.",
  // Display name inline edit (C6/C8 — the only inline-editable profile field).
  displayNameEdit: "Modifier le nom affiché",
  displayNameSave: "Enregistrer",
  displayNameCancel: "Annuler",
  displayNameHelp: "Entre 2 et 60 caractères.",
  displayNameSaved: "Nom affiché enregistré.",
  errorDisplayName: "Le nom affiché doit comporter entre 2 et 60 caractères.",
  errorDisplayNameRateLimit: "Trop de tentatives. Veuillez réessayer dans une minute.",
  errorDisplayNameGeneric: "Impossible d’enregistrer le nom affiché. Veuillez réessayer.",
  // Multi-method auth (Fase E2 — single-tile login): email + password is the
  // primary flow. Passkey and configured OIDC providers remain visible below
  // a localized divider as alternatives within the same auth card.
  methodPassword: "E-mail + mot de passe",
  methodPasskey: "Clé d’accès",
  methodSocialTitle: "Se connecter avec un fournisseur",
  loginOr: "ou",
  loginAlternatives: "Autres moyens de connexion",
  // Passkey login (Fase C).
  passkeyLogin: "Se connecter avec une clé d’accès",
  passkeyEmailOptional: "E-mail du compte (facultatif)",
  passkeyEmailHint:
    "Facultatif : limite la demande aux clés d’accès de ce compte. Laissez vide pour utiliser n’importe quelle clé d’accès enregistrée sur cet appareil.",
  passkeyUnsupported:
    "Ce navigateur ne prend pas en charge les clés d’accès. Utilisez l’e-mail + mot de passe, ou mettez à jour votre navigateur.",
  passkeyErrorBegin: "Impossible de lancer la connexion par clé d’accès. Veuillez réessayer.",
  passkeyErrorFailed: "La vérification de la clé d’accès a échoué. Veuillez réessayer.",
  // Social / OIDC (Fase D, ADR 0020 decision 4 — the disclosure IS the
  // privacy requirement: the provider tracking surface and the EU-US DPF
  // transfer are declared here, on /login).
  oidcGithub: "Continuer avec GitHub",
  oidcGoogle: "Continuer avec Google",
  oidcDisclosure:
    "La connexion via un tiers vous redirige vers le fournisseur, qui apprend ainsi que vous visitez ce site et peut transférer des données hors de l’UE. L’e-mail de votre fournisseur n’est jamais importé ni conservé. Consultez la politique de confidentialité.",
  oidcErrorGeneric: "La connexion via un réseau social a échoué ou a été annulée. Veuillez réessayer.",
  // Manual OIDC merge (email-conflict proof with the account password).
  mergeTitle: "Associer votre compte social",
  mergeIntro:
    "Vous vous êtes connecté avec un fournisseur social, mais un compte existe déjà avec cette adresse e-mail. Prouvez qu’il vous appartient avec son mot de passe pour les associer.",
  mergeSubmit: "Associer les comptes",
  mergeErrorExpired: "Ce lien d’association n’est plus valide. Veuillez réessayer avec le fournisseur.",
  mergeErrorGeneric: "Impossible d’associer les comptes. Veuillez réessayer.",
  // /account passkey management (Fase E2).
  passkeysSection: "Clés d’accès",
  passkeysHint:
    "Ajoutez une clé d’accès pour vous connecter avec votre appareil (biométrie, code PIN ou clé de sécurité) au lieu d’un mot de passe.",
  passkeysEmpty: "Aucune clé d’accès enregistrée pour l’instant.",
  // Disclosure summary count (account rework 2026-08-08).
  passkeySingular: "clé d’accès",
  passkeyPlural: "clés d’accès",
  passkeyAdd: "Ajouter une clé d’accès",
  passkeyAddHelp:
    "Il vous sera demandé de confirmer avec votre appareil. Une fois la clé d’accès ajoutée, vous recevez 10 codes de récupération à usage unique : conservez-les en lieu sûr.",
  passkeyAdded: "Clé d’accès ajoutée.",
  passkeyEnrolledLabel: "Enregistrée le",
  passkeyRemove: "Supprimer",
  passkeyRemoveConfirm: "Supprimer cette clé d’accès ?",
  passkeyRemoveConfirmBody:
    "Cette clé d’accès ne pourra plus servir à vous connecter. Vos autres méthodes de connexion continuent de fonctionner.",
  passkeyRemoveCancel: "Annuler",
  passkeyRemoveBusy: "Suppression…",
  passkeyNotFound: "Cette clé d’accès n’est plus enregistrée.",
  passkeyRemoveError: "Impossible de supprimer la clé d’accès. Veuillez réessayer.",
  passkeyAlreadyEnrolled: "Cette clé d’accès est déjà enregistrée sur votre compte.",
  passkeyEnrollError: "Impossible d’ajouter la clé d’accès. Veuillez réessayer.",
  passkeySessionLost: "Votre session a expiré. Reconnectez-vous et réessayez.",
  passkeyCsrfExpired: "Votre jeton de sécurité a expiré. Actualisez la page et réessayez.",
  passkeysError: "Impossible de charger vos clés d’accès. Veuillez réessayer.",
  // Recovery codes (issued exactly once at passkey enrollment).
  recoveryTitle: "Codes de récupération",
  recoveryBody:
    "Ces 10 codes à usage unique sont le seul moyen de vous connecter si vous perdez votre clé d’accès. Chaque code ne fonctionne qu’une fois. Ils ne sont affichés que maintenant : conservez-les en lieu sûr.",
  recoveryCopy: "Copier les codes",
  recoveryCopied: "Copié.",
  recoverySaved: "Je les ai enregistrés",
  // API keys (epic api-keys, T19 — write API authentication). The /account
  // section sits between passkeys and the danger zone. Private keys unlock
  // WRITE access only: the public read API stays keyless, so reading never
  // needs a key. The raw key is shown exactly once, at creation.
  apiKeysSection: "Clés API",
  apiKeysHint:
    "Les clés privées permettent aux scripts et aux outils d’écrire via l’API sans session de navigateur. La lecture ne nécessite jamais de clé.",
  apiKeyCreate: "Créer une clé API",
  apiKeyNameLabel: "Nom de la clé",
  apiKeyNameHelp:
    "Un court libellé pour reconnaître la clé, p. ex. « Script de synchronisation nocturne ».",
  apiKeyNameRequired: "Donnez un nom à la clé.",
  apiKeyNameTooLong: "Le nom doit comporter 60 caractères au maximum.",
  apiKeyScopeLabel: "Autorisations",
  apiKeyScopeHelp:
    "Choisissez ce que cette clé peut faire. Vous pourrez restreindre les autorisations, mais pas en ajouter par la suite.",
  apiKeyScopeSubmitLabel: "Envoyer des signalements et des corrections",
  apiKeyScopeSubmitGrant: "Permet aux scripts de publier des signalements de caméras et des corrections.",
  apiKeyScopeConfirmLabel: "Confirmer des caméras",
  apiKeyScopeConfirmGrant: "Permet aux scripts de marquer des caméras comme confirmées.",
  apiKeyScopeEditLabel: "Modifier des caméras",
  apiKeyScopeEditGrant: "Permet aux scripts de mettre à jour les détails des caméras via l’endpoint de modification.",
  apiKeyScopeActionLabel: "Actions communautaires",
  apiKeyScopeActionGrant:
    "Permet aux scripts d’effectuer des actions communautaires (utile, disparue, problème, vie privée).",
  apiKeyCreatedLabel: "Créée le",
  apiKeyLastUsedLabel: "Dernière utilisation",
  apiKeyLastUsedNever: "Jamais utilisée",
  apiKeyExpiresLabel: "Expire le",
  apiKeyExpiresNever: "Jamais",
  apiKeyExpiryLabel: "Expiration",
  apiKeyExpiry30: "30 jours",
  apiKeyExpiry90: "90 jours",
  apiKeyExpiry365: "365 jours",
  apiKeyExpiryHelp: "La clé cesse de fonctionner après cette période ; choisissez « Jamais » pour qu’elle n’expire pas. La valeur par défaut correspond à celle de l’API, soit 365 jours.",
  apiKeyScopesLabel: "Autorisations",
  apiKeyStatusLabel: "Statut",
  apiKeyStatusActive: "Active",
  apiKeyStatusRevoked: "Révoquée",
  apiKeyRevoke: "Révoquer",
  apiKeyRevokeConfirm: "Révoquer cette clé ?",
  apiKeyRevokeConfirmBody:
    "Les scripts qui utilisent cette clé échoueront immédiatement avec une erreur 401. Cette action est irréversible : créez une nouvelle clé si nécessaire.",
  apiKeyRevokeCancel: "Annuler",
  apiKeyRevokeBusy: "Révocation…",
  apiKeyRevoked: "Révoquée",
  apiKeyEmptyTitle: "Aucune clé API pour l’instant",
  apiKeyEmptyBody:
    "Créez une clé pour permettre à vos scripts d’envoyer des signalements et des corrections sans vous connecter.",
  apiKeyDocsLink: "Lire la documentation de l’API",
  apiKeyCreateTitle: "Créer une clé API",
  apiKeyCreateBody:
    "La clé n’est affichée qu’une seule fois, lors de sa création. Copiez-la immédiatement : elle n’est pas conservée sur nos serveurs.",
  apiKeyCreateSubmit: "Créer la clé",
  apiKeyCreateCancel: "Annuler",
  apiKeyCreateBusy: "Création…",
  apiKeyRevealTitle: "Votre clé API",
  apiKeyRevealBody:
    "Copiez-la maintenant : c’est la seule fois où la clé complète est affichée. Toute personne disposant de cette clé peut écrire via l’API en votre nom.",
  apiKeyRevealCopy: "Copier la clé",
  apiKeyRevealCopied: "Copié.",
  apiKeyRevealSaved: "Je l’ai enregistrée",
  apiKeyErrorList: "Impossible de charger vos clés API. Veuillez réessayer.",
  apiKeyErrorCreate: "Impossible de créer la clé. Veuillez réessayer.",
  apiKeyErrorRevoke: "Impossible de révoquer la clé. Veuillez réessayer.",
  apiKeyErrorLimit: "Vous avez déjà 5 clés API. Révoquez-en une avant d’en créer une autre.",
  apiKeyErrorSession: "Votre session a expiré. Reconnectez-vous et réessayez.",
  apiKeyErrorCsrf: "Votre jeton de sécurité a expiré. Actualisez la page et réessayez.",
  // Email verification (Fase B UI — design review): /verify-email page and the
  // /account banner. The verification link in the email now lands on a real
  // page (not raw JSON); the page consumes GET /api/auth/verify-email and
  // offers a resend when the token is dead.
  verifyTitle: "Vérifiez votre adresse e-mail",
  verifyChecking: "Vérification de votre lien…",
  verifySuccessTitle: "Adresse e-mail vérifiée",
  verifySuccessBody:
    "Votre adresse e-mail est vérifiée. Vous pouvez maintenant vous connecter et commencer à contribuer.",
  verifyInvalidTitle: "Lien invalide ou expiré",
  verifyInvalidBody:
    "Ce lien de vérification est invalide ou a déjà été utilisé. Vous pouvez demander un nouveau lien.",
  verifyExpiredTitle: "Ce lien n’est plus valide",
  verifyExpiredBody:
    "Ce lien de vérification a déjà été utilisé ou a expiré. Demandez un nouveau lien pour continuer.",
  verifyResend: "Renvoyer l’e-mail de vérification",
  verifyResent: "E-mail de vérification envoyé.",
  verifyResendRateLimited: "Trop d’e-mails envoyés. Veuillez réessayer plus tard.",
  verifyResendError: "Impossible de renvoyer l’e-mail. Veuillez réessayer.",
  verifyLoginToResend: "Connectez-vous pour demander un nouveau lien.",
  verifyGoToAccount: "Aller à votre compte",
  verifyError: "Impossible de vérifier votre adresse e-mail. Veuillez réessayer.",
  // /account verification banner (read from contributor.emailVerifiedAt).
  verifyBannerTitle: "Vérifiez votre adresse e-mail pour contribuer",
  verifyBannerBody:
    "Consultez votre boîte de réception pour le lien de confirmation. Une adresse e-mail vérifiée est requise pour envoyer des signalements et des corrections.",
  verifyBannerResend: "Renvoyer l’e-mail",
  verifyBannerResent: "E-mail de confirmation envoyé.",
  verifyBannerDone: "Adresse e-mail vérifiée : vous pouvez contribuer.",
  // Forgot password (P1-3): entry from /login and the /forgot-password page.
  forgotPassword: "Mot de passe oublié ?",
  forgotTitle: "Réinitialiser votre mot de passe",
  forgotIntro:
    "Saisissez l’adresse e-mail de votre compte et nous vous enverrons un lien de réinitialisation.",
  forgotSubmit: "Envoyer le lien de réinitialisation",
  forgotSent:
    "Si un compte existe pour cette adresse, un lien de réinitialisation est en route. Il expire dans 3 heures. Consultez votre boîte de réception.",
  forgotBackToLogin: "Retour à la connexion",
  // /reset-password page (consumes the single-use token from the email).
  resetTitle: "Définir un nouveau mot de passe",
  resetIntro: "Choisissez un nouveau mot de passe pour votre compte.",
  resetNewPassword: "Nouveau mot de passe",
  resetConfirmPassword: "Répétez le nouveau mot de passe",
  resetMismatch: "Les deux mots de passe ne correspondent pas.",
  resetSubmit: "Changer le mot de passe",
  resetSuccessTitle: "Mot de passe modifié",
  resetSuccessBody:
    "Votre mot de passe a été modifié et toutes les sessions ont été fermées. Connectez-vous avec le nouveau mot de passe.",
  resetInvalid: "Lien de réinitialisation invalide ou expiré.",
  resetExpired:
    "Ce lien de réinitialisation a déjà été utilisé ou a expiré. Demandez-en un nouveau.",
  resetGoToLogin: "Se connecter",
  resetRequestAnother: "Demander un nouveau lien",
  // Login wall on the write tools (P1-2 — design review): anonymous and
  // unverified states replace the form on /segnala and /correggi.
  wallLoginTitle: "Connectez-vous pour contribuer",
  wallLoginBody:
    "Les signalements et les corrections sont publiés par des contributeurs vérifiés. Connectez-vous ou créez un compte pour continuer.",
  wallLogIn: "Se connecter",
  wallCreateAccount: "Créer un compte",
  wallVerifyTitle: "Vérifiez votre adresse e-mail pour contribuer",
  wallVerifyBody:
    "Votre compte n’est pas encore vérifié. Consultez votre boîte de réception pour le lien de confirmation, ou renvoyez-le.",
  wallResend: "Renvoyer l’e-mail de vérification",
  wallResent: "E-mail de vérification envoyé.",
  wallGoToAccount: "Aller à votre compte",
  wallChecking: "Vérification…",
  wallError: "Impossible de vérifier votre session. Veuillez réessayer.",
  // QA#2 F4: the error-wall retry button label (the old ternary rendered
  // t.loading — a truthy string — so the button ALWAYS said "Verify your
  // email" even though its action retries the session check).
  wallRetry: "Réessayer",
  // Per-method privacy disclosure (P1-4 — risk matrix complete, ADR 0020
  // decision 6). Each sign-in method declares its own risk surface; the OIDC
  // disclosure already existed and is kept unchanged.
  methodDisclosureLabel: "Note de confidentialité",
  passwordDisclosure:
    "Votre adresse e-mail est une donnée personnelle, conservée pour faire fonctionner votre compte. Les connexions par mot de passe seul peuvent être ciblées par l’hameçonnage : vérifiez toujours la barre d’adresse avant de saisir votre mot de passe.",
  passkeyDisclosure:
    "La vérification biométrique (empreinte digitale, visage ou code PIN) a lieu sur votre appareil. Si votre clé d’accès est synchronisée via le cloud d’un fournisseur (Apple, Google, Microsoft), celui-ci peut savoir que vous utilisez ce site ; les clés d’accès liées à l’appareil ne sont jamais synchronisées.",
};
