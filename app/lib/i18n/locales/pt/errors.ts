/**
 * errors — PT translation. Parity-checked against the English pilot
 * bundle (../../errors.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../errors";

export const pt: Translation<typeof en> = {
  navigation: "Navegação do site",
  homeAria: "Página inicial do OpenSurveillanceDB",
  // 404 — non-existent route or notFound() (app/not-found.tsx).
  notFoundEyebrow: "404",
  notFoundTitle: "Página não encontrada",
  notFoundSummary:
    "A página que procuras não existe ou pode ter sido movida. Usa a navegação acima ou volta à página inicial.",
  // 500 — unhandled server error (app/error.tsx).
  serverErrorEyebrow: "500",
  serverErrorTitle: "Algo correu mal",
  serverErrorSummary:
    "Ocorreu um erro inesperado ao servir esta página. Tenta novamente ou volta à página inicial.",
  backHome: "Voltar à página inicial",
  tryAgain: "Tentar novamente",
  // Document <title> (WCAG 2.4.2 Page Titled): not-found.tsx exports
  // generateMetadata (SSR); error.tsx is a client boundary, so ErrorPage
  // sets the same titles client-side via document.title.
  notFoundMetaTitle: "Página não encontrada — OpenSurveillanceDB",
  serverErrorMetaTitle: "Algo correu mal — OpenSurveillanceDB",
  // 401/503 — protected-surface gate denial, rendered by the worker edge
  // itself (worker/index.ts renderGateUnavailablePage), not by ErrorPage:
  // the gate must fail closed before any app/React code runs, so this
  // copy is plain data imported into the edge bundle. The eyebrow is the
  // live numeric status (401 or 503), not a fixed string like 404/500.
  serviceUnavailableTitle: "Esta área está temporariamente indisponível",
  serviceUnavailableSummary:
    "Esta parte do site não está acessível de momento. Tenta novamente mais tarde ou volta à página inicial.",
  serviceUnavailableMetaTitle: "Serviço indisponível — OpenSurveillanceDB",
};
