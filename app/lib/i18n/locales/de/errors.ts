/**
 * errors — DE translation. Parity-checked against the English pilot
 * bundle (../../errors.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../errors";

export const de: Translation<typeof en> = {
  navigation: "Website-Navigation",
  homeAria: "OpenSurveillanceDB Startseite",
  // 404 — non-existent route or notFound() (app/not-found.tsx).
  notFoundEyebrow: "404",
  notFoundTitle: "Seite nicht gefunden",
  notFoundSummary:
    "Die gesuchte Seite existiert nicht oder wurde verschoben. Nutze die Navigation oben oder kehre zur Startseite zurück.",
  // 500 — unhandled server error (app/error.tsx).
  serverErrorEyebrow: "500",
  serverErrorTitle: "Etwas ist schiefgelaufen",
  serverErrorSummary:
    "Beim Laden dieser Seite ist ein unerwarteter Fehler aufgetreten. Versuche es bitte noch einmal oder kehre zur Startseite zurück.",
  backHome: "Zurück zur Startseite",
  tryAgain: "Erneut versuchen",
  // Document <title> (WCAG 2.4.2 Page Titled): not-found.tsx exports
  // generateMetadata (SSR); error.tsx is a client boundary, so ErrorPage
  // sets the same titles client-side via document.title.
  notFoundMetaTitle: "Seite nicht gefunden — OpenSurveillanceDB",
  serverErrorMetaTitle: "Etwas ist schiefgelaufen — OpenSurveillanceDB",
  // 401/503 — protected-surface gate denial, rendered by the worker edge
  // itself (worker/index.ts renderGateUnavailablePage), not by ErrorPage:
  // the gate must fail closed before any app/React code runs, so this
  // copy is plain data imported into the edge bundle. The eyebrow is the
  // live numeric status (401 or 503), not a fixed string like 404/500.
  serviceUnavailableTitle: "Dieser Bereich ist vorübergehend nicht verfügbar",
  serviceUnavailableSummary:
    "Dieser Teil der Website ist gerade nicht erreichbar. Versuche es bitte später noch einmal oder kehre zur Startseite zurück.",
  serviceUnavailableMetaTitle: "Dienst nicht verfügbar — OpenSurveillanceDB",
};
