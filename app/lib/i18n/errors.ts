/**
 * errors — custom 404 / 500 page strings (t_7eed4601).
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 *
 * Both the 404 (app/not-found.tsx) and the 500 (app/error.tsx) render the
 * same <ErrorPage /> shell; only the status-specific copy differs.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Site navigation",
  homeAria: "OpenSurveillanceDB home",
  // 404 — non-existent route or notFound() (app/not-found.tsx).
  notFoundEyebrow: "404",
  notFoundTitle: "Page not found",
  notFoundSummary:
    "The page you are looking for does not exist or may have been moved. Use the navigation above or head back to the homepage.",
  // 500 — unhandled server error (app/error.tsx).
  serverErrorEyebrow: "500",
  serverErrorTitle: "Something went wrong",
  serverErrorSummary:
    "An unexpected error occurred while serving this page. Please try again, or head back to the homepage.",
  backHome: "Back to the homepage",
  tryAgain: "Try again",
  // Document <title> (WCAG 2.4.2 Page Titled): not-found.tsx exports
  // generateMetadata (SSR); error.tsx is a client boundary, so ErrorPage
  // sets the same titles client-side via document.title.
  notFoundMetaTitle: "Page not found — OpenSurveillanceDB",
  serverErrorMetaTitle: "Something went wrong — OpenSurveillanceDB",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione del sito",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  // 404 — route inesistente o notFound() (app/not-found.tsx).
  notFoundEyebrow: "404",
  notFoundTitle: "Pagina non trovata",
  notFoundSummary:
    "La pagina che stai cercando non esiste o potrebbe essere stata spostata. Usa la navigazione qui sopra oppure torna alla home.",
  // 500 — errore server non gestito (app/error.tsx).
  serverErrorEyebrow: "500",
  serverErrorTitle: "Qualcosa è andato storto",
  serverErrorSummary:
    "Si è verificato un errore imprevisto durante il caricamento di questa pagina. Riprova oppure torna alla home.",
  backHome: "Torna alla home",
  tryAgain: "Riprova",
  // <title> del documento (WCAG 2.4.2 Page Titled): not-found.tsx esporta
  // generateMetadata (SSR); error.tsx è un boundary client, quindi ErrorPage
  // imposta gli stessi titoli lato client via document.title.
  notFoundMetaTitle: "Pagina non trovata — OpenSurveillanceDB",
  serverErrorMetaTitle: "Qualcosa è andato storto — OpenSurveillanceDB",
};
