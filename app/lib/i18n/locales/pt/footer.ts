/**
 * footer — PT translation. Parity-checked against the English pilot
 * bundle (../../footer.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../footer";

export const pt: Translation<typeof en> = {
  landmarkLabel: "Rodapé do site",
  // The footer groups the public routes by task. Legal documents remain
  // available in a native disclosure so they are easy to reach without
  // competing with the primary paths through the site.
  navigation: "Navegação do site",
  homeAria: "Página inicial do OpenSurveillanceDB",
  tagline: "Uma base de dados aberta de câmaras de vigilância públicas, criada para a transparência, não para o rastreamento.",
  toolMap: "Mapa",
  toolDirectory: "Diretório",
  toolReport: "Reportar",
  toolCorrection: "Corrigir",
  exploreGroup: "Explorar",
  contributeGroup: "Contribuir",
  projectGroup: "O projeto",
  legalGroup: "Informação legal",
  manifesto: "Manifesto",
  rules: "Regras",
  moderation: "Moderação",
  apiDocs: "API pública",
  guide: "Guia",
  privacy: "Privacidade",
  terms: "Termos de utilização",
  licenses: "Licenças",
  // The dedicated /fonti page contains both the public-data attribution and
  // the methodology used to collect and correct records.
  sources: "Método e fontes",
  faq: "Perguntas frequentes",
  contact: "Contacto",
  accessibility: "Declaração de acessibilidade",
  dataLicense: "Base de dados e exportações licenciadas ao abrigo da ODbL 1.0",
  osmAttribution: "Dados do mapa © contribuidores do OpenStreetMap",
};
