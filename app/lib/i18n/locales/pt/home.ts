/**
 * home — PT translation. Parity-checked against the English pilot
 * bundle (../../home.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../home";

export const pt: Translation<typeof en> = {
  mainNavigation: "Navegação principal",
  homeAria: "Página inicial do OpenSurveillanceDB",
  pageTitle: "Base de dados aberta da infraestrutura de vigilância pública",
  pageDescription:
    "O OpenSurveillanceDB é uma base de dados cívica e sem fins comerciais da infraestrutura de vigilância pública visível: com fontes, mantida pela comunidade e com a privacidade em primeiro lugar.",
  // QA#2 F1 (axe serious): the scrollable legal tables (/privacy data
  // table) become a focusable region when they overflow — the aria-label
  // tells keyboard users why the region is in the tab order and how to
  // scroll it.
  tableScrollAria: "Tabela — desliza na horizontal para ver mais colunas",
  menu: "Menu",
  exploreMap: "Explorar o mapa",
  browseRecords: "Consultar fichas",
  howItWorks: "Como funciona",
  rules: "Regras",
  manifesto: "Manifesto",
  addCamera: "Adicionar uma câmara",
  contribuisci: "Contribuir",
  openDatabase: "Base de dados aberta · mantida pela comunidade",
  heroTitle: "Dados públicos sobre a vigilância pública.",
  heroIntro:
    "O OpenSurveillanceDB mapeia a infraestrutura de vigilância visível no espaço público. Os dados são abertos e construídos pela comunidade: as pessoas contribuem com o que observam, para que todos possam compreender os sistemas que as rodeiam.",
  exploreTheMap: "Explorar o mapa",
  reportCta: "Reportar uma câmara",
  searchDirectory: "Pesquisar no diretório",
  searchDirectoryPlaceholder: "Pesquisar por nome, tipo ou morada",
  // Hero address autocomplete (issue #439): the hero search field is
  // progressively enhanced with the shared PlaceAutocomplete primitive.
  // The copy is home-scoped — the /segnala address search keeps its own
  // report-bundle wording.
  searchDirectoryHelp:
    "Pesquisa por nome, tipo ou morada. No diretório, a tecla Enter também pesquisa à volta de um local.",
  statsLabel: "Estatísticas da base de dados",
  publicRecords: "fichas públicas",
  browseFreely: "Sem conta",
  browseFreelyDetail: "necessária para consultar",
  openData: "Dados abertos",
  openDataDetail: "livres para reutilizar",
  trustNote: "Cada ficha publicada mostra a sua fonte, o seu estado e uma forma de a corrigir.",
  sourcesLink: "Ver fontes e metodologia",
  visualLabelFirst: "Mapear o espaço público",
  visualLabelSecond: "com conhecimento público",
  // MapTeaser (static preview, CTA → /mappa). Zero Leaflet on the hub.
  teaserEyebrow: "O mapa",
  teaserTitle: "Explora o mapa interativo",
  teaserBody: "Percorre o mapa em ecrã inteiro, com filtros, exportações e um diretório acessível por teclado.",
  teaserCta: "Abrir o mapa",
  // Four tool cards (grid 2×2 desktop / 1×4 mobile).
  toolsTitle: "O que podes fazer",
  toolMapTitle: "Mapa",
  toolMapBody: "Vê todas as câmaras documentadas num relance.",
  toolDirectoryTitle: "Diretório",
  toolDirectoryBody: "Consulta as fichas públicas sem o mapa.",
  toolReportTitle: "Reportar uma câmara",
  toolReportBody: "Publica de imediato uma câmara que acabaste de observar.",
  toolCorrectionTitle: "Corrigir uma ficha",
  toolCorrectionBody: "Corrige ou atualiza uma ficha publicada.",
  civicCommons: "Um bem comum de dados cívicos",
  principlesTitle: "Visibilidade sem vigilância.",
  principlesIntro:
    "Documentamos infraestrutura pública, nunca transmissões de câmaras. Cada ficha publicada tem uma fonte, um estado e uma forma de ser corrigida.",
  openDefault: "Aberto por defeito",
  openDefaultBody:
    "Dados descarregáveis com proveniência visível para jornalismo, investigação e uso cívico.",
  privacyFirst: "Privacidade em primeiro lugar",
  privacyFirstBody:
    "Rostos, matrículas e informações pessoais têm de ser removidos antes da publicação.",
  communityVerified: "Verificado pela comunidade",
  communityVerifiedBody:
    "Os reportes são publicados de imediato e a comunidade mantém-nos rigorosos: confirma o que ainda lá está, assinala o que desapareceu, marca o que é útil.",
  manifestoLink: "Ler o manifesto",
};
