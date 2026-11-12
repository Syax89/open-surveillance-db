/**
 * Transactional email copy — FR translation (see app/lib/email-templates.ts).
 * {SITE} is replaced with the brand name; <strong> is the only markup allowed.
 */
import type { EmailCopy } from "../../../email-templates";

export const fr: EmailCopy = {
  greeting: (displayName) => (displayName ? `Bonjour ${displayName},` : "Bonjour,"),
  divider: "— Français —",
  buttonFallback: "Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :",
  verify: {
    intro:
      "Veuillez confirmer que cette adresse e-mail vous appartient afin de pouvoir commencer à contribuer à {SITE}. Ce lien est valable <strong>24 heures</strong> et ne peut être utilisé qu’une seule fois.",
    button: "Vérifier l’adresse e-mail",
    ignore: "Si vous n’avez pas créé de compte sur {SITE}, vous pouvez ignorer cet e-mail.",
  },
  reset: {
    intro:
      "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte {SITE}. Ce lien est valable <strong>3 heures</strong> et ne peut être utilisé qu’une seule fois.",
    button: "Réinitialiser le mot de passe",
    ignore: "Si vous n’avez pas demandé de réinitialisation du mot de passe, vous pouvez ignorer cet e-mail — votre mot de passe reste inchangé.",
  },
};
