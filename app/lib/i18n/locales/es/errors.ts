/**
 * errors — ES translation. Parity-checked against the English pilot
 * bundle (../../errors.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../errors";

export const es: Translation<typeof en> = {
  navigation: "Navegación del sitio",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  // 404 — non-existent route or notFound() (app/not-found.tsx).
  notFoundEyebrow: "404",
  notFoundTitle: "Página no encontrada",
  notFoundSummary:
    "La página que buscas no existe o puede haberse movido. Usa la navegación de arriba o vuelve a la página de inicio.",
  // 500 — unhandled server error (app/error.tsx).
  serverErrorEyebrow: "500",
  serverErrorTitle: "Algo ha salido mal",
  serverErrorSummary:
    "Se ha producido un error inesperado al cargar esta página. Vuelve a intentarlo o regresa a la página de inicio.",
  backHome: "Volver a la página de inicio",
  tryAgain: "Volver a intentarlo",
  // Document <title> (WCAG 2.4.2 Page Titled): not-found.tsx exports
  // generateMetadata (SSR); error.tsx is a client boundary, so ErrorPage
  // sets the same titles client-side via document.title.
  notFoundMetaTitle: "Página no encontrada — OpenSurveillanceDB",
  serverErrorMetaTitle: "Algo ha salido mal — OpenSurveillanceDB",
  // 401/503 — protected-surface gate denial, rendered by the worker edge
  // itself (worker/index.ts renderGateUnavailablePage), not by ErrorPage:
  // the gate must fail closed before any app/React code runs, so this
  // copy is plain data imported into the edge bundle. The eyebrow is the
  // live numeric status (401 or 503), not a fixed string like 404/500.
  serviceUnavailableTitle: "Esta sección no está disponible temporalmente",
  serviceUnavailableSummary:
    "Esta parte del sitio no es accesible en este momento. Vuelve a intentarlo más tarde o regresa a la página de inicio.",
  serviceUnavailableMetaTitle: "Servicio no disponible — OpenSurveillanceDB",
};
