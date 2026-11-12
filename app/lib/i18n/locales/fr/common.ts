/**
 * common — FR translation. Parity-checked against the English pilot
 * bundle (../../common.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../common";

export const fr: Translation<typeof en> = {
  skipLink: "Aller au contenu principal",
  languageSelection: "Choix de la langue",
  darkTheme: "Thème sombre",
  // Root-layout metadata (SSR/SEO): the fallback <title>/<description>
  // for every route without its own generateMetadata (home, records, auth
  // pages). Localized via the locale cookie — see ADR 0015.
  metaTitle: "OpenSurveillanceDB — Des données publiques sur la surveillance publique",
  metaDescription:
    "Une base de données ouverte et collaborative des caméras de surveillance publiques.",
  // Tool-route shared nav (F1 route group (tools)): every tool page links
  // the other public tools plus the home — no dead ends between the four
  // tools (docs/FRONTEND_DESIGN.md §2.5). The per-page link SET is chosen by
  // ToolLayout (F3 t_2ca69725); the labels live here so both the tool chrome
  // and (via footer.ts's own copies) the global footer stay in sync.
  toolNavigation: "Navigation des outils",
  exploreViews: "Explorer les fiches sous forme de",
  toolHomeAria: "Accueil OpenSurveillanceDB",
  toolMap: "Carte",
  toolDirectory: "Répertoire",
  toolReport: "Signaler",
  toolCorrection: "Corriger",
  toolGuide: "Guide",
  toolRules: "Règles",
  toolContact: "Contact",
  toolHome: "Accueil",
  // A session write rejected for an EXPIRED/missing CSRF token is a 403 with
  // the very same shape as the domain refusals (write gate, self-action,
  // self-verify, not-owner): the clients read the body marker and show this
  // copy so the contributor is told to refresh instead of receiving advice
  // that does not apply. Same wording as auth.passkeyCsrfExpired.
  csrfExpired: "Votre jeton de sécurité a expiré. Actualisez la page et réessayez.",
};
