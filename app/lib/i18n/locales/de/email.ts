/**
 * Transactional email copy — DE translation (see app/lib/email-templates.ts).
 * {SITE} is replaced with the brand name; <strong> is the only markup allowed.
 */
import type { EmailCopy } from "../../../email-templates";

export const de: EmailCopy = {
  greeting: (displayName) => (displayName ? `Hallo ${displayName},` : "Hallo,"),
  divider: "— Deutsch —",
  buttonFallback: "Falls die Schaltfläche nicht funktioniert, kopiere diesen Link und füge ihn in deinen Browser ein:",
  verify: {
    intro:
      "Bitte bestätige, dass diese E-Mail-Adresse dir gehört, damit du bei {SITE} mitmachen kannst. Dieser Link ist <strong>24 Stunden</strong> gültig und kann nur einmal verwendet werden.",
    button: "E-Mail-Adresse bestätigen",
    ignore: "Wenn du kein Konto bei {SITE} erstellt hast, kannst du diese E-Mail ignorieren.",
  },
  reset: {
    intro:
      "Wir haben eine Anfrage zum Zurücksetzen des Passworts für dein {SITE}-Konto erhalten. Dieser Link ist <strong>3 Stunden</strong> gültig und kann nur einmal verwendet werden.",
    button: "Passwort zurücksetzen",
    ignore: "Wenn du kein Zurücksetzen des Passworts angefordert hast, kannst du diese E-Mail ignorieren – dein Passwort bleibt unverändert.",
  },
  accountExists: {
    intro:
      "Jemand hat versucht, mit dieser E-Mail-Adresse ein Konto bei {SITE} zu erstellen. Wenn du das warst: Du hast bereits ein Konto – melde dich an oder setze dein Passwort zurück, falls du es vergessen hast.",
    button: "Anmelden",
    secondaryButton: "Passwort zurücksetzen",
    ignore: "Wenn du das nicht warst, kannst du diese E-Mail ignorieren – es hat sich nichts geändert.",
  },
};
