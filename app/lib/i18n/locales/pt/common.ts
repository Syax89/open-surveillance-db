/**
 * common — PT translation. Parity-checked against the English pilot
 * bundle (../../common.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../common";

export const pt: Translation<typeof en> = {
  skipLink: "Saltar para o conteúdo principal",
  languageSelection: "Seleção de idioma",
  darkTheme: "Tema escuro",
  // Root-layout metadata (SSR/SEO): the fallback <title>/<description>
  // for every route without its own generateMetadata (home, records, auth
  // pages). Localized via the locale cookie — see ADR 0015.
  metaTitle: "OpenSurveillanceDB — Dados públicos sobre a vigilância pública",
  metaDescription:
    "Uma base de dados aberta, mantida pela comunidade, de câmaras de vigilância públicas.",
  // Tool-route shared nav (F1 route group (tools)): every tool page links
  // the other public tools plus the home — no dead ends between the four
  // tools (docs/FRONTEND_DESIGN.md §2.5). The per-page link SET is chosen by
  // ToolLayout (F3 t_2ca69725); the labels live here so both the tool chrome
  // and (via footer.ts's own copies) the global footer stay in sync.
  toolNavigation: "Navegação das ferramentas",
  exploreViews: "Explorar fichas em",
  toolHomeAria: "Página inicial do OpenSurveillanceDB",
  toolMap: "Mapa",
  toolDirectory: "Diretório",
  toolReport: "Reportar",
  toolCorrection: "Corrigir",
  toolGuide: "Guia",
  toolRules: "Regras",
  toolContact: "Contacto",
  toolHome: "Início",
  // A session write rejected for an EXPIRED/missing CSRF token is a 403 with
  // the very same shape as the domain refusals (write gate, self-action,
  // self-verify, not-owner): the clients read the body marker and show this
  // copy so the contributor is told to refresh instead of receiving advice
  // that does not apply. Same wording as auth.passkeyCsrfExpired.
  csrfExpired: "O teu token de segurança expirou. Atualiza a página e tenta novamente.",
};
