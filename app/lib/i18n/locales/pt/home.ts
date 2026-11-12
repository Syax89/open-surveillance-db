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
  // Hero search-as-you-type (2026-11): record suggestions from our own
  // data only; the place lookup (OpenStreetMap) runs only when the last
  // item is chosen, then a chosen place opens the map there.
  suggestLabel: "Sugestões",
  suggestCount: (count: number) => (count === 1 ? "1 sugestão disponível" : `${count} sugestões disponíveis`),
  suggestCoordinates: (text: string) => `Ver as coordenadas ${text} no mapa`,
  suggestRecordNumber: (id: number) => `Abrir a ficha #${id}`,
  suggestPlace: (query: string) => `Procurar o local «${query}» (OpenStreetMap)`,
  searchPlaceLabel: "Sugestões de locais",
  searchPlaceNoResults: (query: string) => `Sem resultados para «${query}»`,
  searchPlaceUnavailable: "A pesquisa de locais está temporariamente indisponível.",
  searchPlaceRateLimited: (seconds: number) => `A pesquisa de locais atingiu o limite temporário de pedidos. Tenta novamente daqui a cerca de ${seconds} segundos.`,
  searchPlaceAttribution: "Locais © colaboradores do OpenStreetMap",
  searchDirectoryHelp:
    "Enquanto escreves, as sugestões vêm só das nossas próprias fichas. Enter pesquisa no diretório; um local só é procurado no OpenStreetMap se escolheres «Procurar o local».",
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
