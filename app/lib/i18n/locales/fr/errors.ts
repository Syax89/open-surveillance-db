/**
 * errors — FR translation. Parity-checked against the English pilot
 * bundle (../../errors.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../errors";

export const fr: Translation<typeof en> = {
  navigation: "Navigation du site",
  homeAria: "Accueil OpenSurveillanceDB",
  // 404 — non-existent route or notFound() (app/not-found.tsx).
  notFoundEyebrow: "404",
  notFoundTitle: "Page introuvable",
  notFoundSummary:
    "La page que vous recherchez n’existe pas ou a peut-être été déplacée. Utilisez la navigation ci-dessus ou revenez à la page d’accueil.",
  // 500 — unhandled server error (app/error.tsx).
  serverErrorEyebrow: "500",
  serverErrorTitle: "Une erreur s’est produite",
  serverErrorSummary:
    "Une erreur inattendue s’est produite lors de l’affichage de cette page. Veuillez réessayer ou revenir à la page d’accueil.",
  backHome: "Retour à la page d’accueil",
  tryAgain: "Réessayer",
  // Document <title> (WCAG 2.4.2 Page Titled): not-found.tsx exports
  // generateMetadata (SSR); error.tsx is a client boundary, so ErrorPage
  // sets the same titles client-side via document.title.
  notFoundMetaTitle: "Page introuvable — OpenSurveillanceDB",
  serverErrorMetaTitle: "Une erreur s’est produite — OpenSurveillanceDB",
  // 401/503 — protected-surface gate denial, rendered by the worker edge
  // itself (worker/index.ts renderGateUnavailablePage), not by ErrorPage:
  // the gate must fail closed before any app/React code runs, so this
  // copy is plain data imported into the edge bundle. The eyebrow is the
  // live numeric status (401 or 503), not a fixed string like 404/500.
  serviceUnavailableTitle: "Cette section est temporairement indisponible",
  serviceUnavailableSummary:
    "Cette partie du site n’est pas accessible pour le moment. Veuillez réessayer plus tard ou revenir à la page d’accueil.",
  serviceUnavailableMetaTitle: "Service indisponible — OpenSurveillanceDB",
};
