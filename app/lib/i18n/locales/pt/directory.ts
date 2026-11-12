/**
 * directory — PT translation. Parity-checked against the English pilot
 * bundle (../../directory.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../directory";

export const pt: Translation<typeof en> = {
  // Page-level chrome (/directory).
  pageTitle: "Diretório público",
  pageIntro:
    "Pesquisa, filtra e ordena as fichas públicas sem o mapa. Um resultado nunca é prova de que uma zona não tem vigilância.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "A carregar o diretório…",
  navigation: "Navegação do diretório",
  homeAria: "Página inicial do OpenSurveillanceDB",
  useMapInstead: "Usar antes o mapa",
  // Directory section (extracted from the home page bundle in F1).
  accessibleDirectory: "Diretório acessível",
  recordsTitle: "Percorre as fichas públicas sem o mapa",
  recordsIntro:
    "A pesquisa abrange as mesmas fichas públicas mostradas no mapa. Um resultado nunca é prova de que uma zona não tem vigilância.",
  // Catalog mode (t_127492f1): the sr-only heading of the results region —
  // keeps the h1 → h2 → h3 ladder on /directory now that the place-search
  // block is a collapsible panel instead of the section heading.
  resultsRegion: "Resultados do diretório",
  searchDirectory: "Pesquisar no diretório público",
  searchPlaceholder: "Nome, tipo, morada ou local",
  searchHelp:
    "Pesquisa as fichas enquanto escreves ou prime Enter para pesquisar à volta de um local.",
  filters: "Filtros",
  // Catalog mode: data export of the filtered set (issue #409). The
  // downloads are generated client-side from the exact visible records, so
  // EVERY active filter applies (search, type, freshness, state, origin)
  // plus the sort order; the hint below says exactly what the export
  // contains.
  exportCsv: "Descarregar CSV",
  exportGeoJson: "Descarregar GeoJSON",
  exportHint: "As exportações incluem as fichas mostradas pela pesquisa e pelos filtros atuais.",
  // Catalog mode (CEO 2026-08-08): the small circular [+] in the results
  // header top-right — a direct shortcut to the report form (/segnala).
  reportCamera: "Reportar uma câmara",
  // Catalog mode (t_f13fcb1c): the visible results header, the active-filter
  // chips, the alphabetical index and the pagination bar.
  activeFilters: "Filtros ativos",
  removeFilter: (label: string) => `Remover filtro: ${label}`,
  // F1 (mobile usability 2026-10-23): the native filter disclosure summary
  // states how many selections are active — the SAME count as the removable
  // chips, so the closed disclosure still tells the truth. Singular/plural;
  // an all-default state renders no count at all.
  filtersActiveOne: "1 filtro ativo",
  filtersActiveMany: (count: number) => `${count} filtros ativos`,
  // F1: the chip of a non-default order names the ordering ("Order: Most
  // useful") so it is never read as a restrictive filter.
  filterOrder: (label: string) => `Ordem: ${label}`,
  alphaIndexTitle: "Índice alfabético",
  alphaIndexAria: (letter: string) => `Ir para as fichas que começam por ${letter}`,
  showingRecords: (from: number | string, to: number | string, total: number | string) => `A mostrar ${from}–${to} de ${total} fichas`,
  pageOf: (page: number | string, pages: number | string) => `Página ${page} de ${pages}`,
  previousPage: "Página anterior",
  nextPage: "Página seguinte",
  // Catalog mode: the place-search panel trigger in the results meta row
  // (the panel itself keeps the historical place-search strings).
  searchNearPlace: "Pesquisar perto de um local…",
  placeHide: "Ocultar pesquisa por local",
  cameraType: "Tipo de câmara",
  allTypes: "Todos os tipos",
  freshnessFilter: "Atualidade da ficha",
  freshnessAll: "Qualquer data",
  freshness7d: "Últimos 7 dias",
  freshness30d: "Últimos 30 dias",
  freshness90d: "Últimos 90 dias",
  orderRecords: "Ordenar fichas",
  alphabetical: "Alfabética",
  positionOrder: "Posição (de sul para norte)",
  // Community ranking (ADR 0021 §10, FASE 3 UI): the three server sort
  // options surface usefulness (weighted likes), freshness (last confirm)
  // and confirmation volume. Same frozen vocabulary as the action widget.
  sortUseful: "Mais úteis",
  sortRecent: "Confirmadas recentemente",
  sortConfirmations: "Mais confirmações",
  // Confirmation-status filter (?state=, FASE 3 UI): a record's "state"
  // in the directory sense is its community confirmation — never
  // hidden/removed, which are excluded from the public list by design
  // (ADR §6.3).
  stateFilter: "Estado de confirmação",
  stateAll: "Qualquer",
  stateConfirmed: "Confirmada",
  stateNever: "Nunca confirmada",
  advancedFilters: "Mais filtros",
  advancedFiltersActive: (count: number) => `Mais filtros · ${count} ${count === 1 ? "ativo" : "ativos"}`,
  // Import-origin filter (?origin=, FASE C, t_4dbce318): where a record
  // comes from — a community report or an imported public dataset.
  originFilter: "Origem",
  originAll: "Qualquer",
  originReports: "Reportes da comunidade",
  originImported: "Dados importados",
  oneRecordFound: "1 ficha pública encontrada",
  recordsFound: "fichas públicas encontradas",
  // M03: the card shows `record.updated` (record update, not a community
  // confirmation) — the label must say so.
  lastUpdated: "Última atualização",
  showOnMap: "Mostrar no mapa",
  openRecord: "Abrir ficha",
  emptyTitle: "Nenhuma ficha publicada corresponde a essa pesquisa.",
  emptyBody:
    "Isto não significa que não existam câmaras na zona. Podes limpar a pesquisa, explorar o mapa ou enviar um reporte a partir de uma conta verificada.",
  clearSearch: "Limpar pesquisa",
  submitObservation: "Enviar um reporte",
  resetFilters: "Repor filtros",
  offlineTitle: "Estás offline",
  offlineBody: "A mostrar as últimas fichas carregadas.",
  offlineAction: "Tentar novamente",
  distance: "Distância",
  placeSearchTitle: "Pesquisar por local",
  placeSearchLabel: "Localidade, morada ou coordenadas",
  placeSearchPlaceholder: "p. ex. Centro da cidade, Rua Augusta ou 45.46420, 9.19000",
  placeSearchHelp:
    "Encontra fichas públicas perto do local que introduzires. Um resultado nunca é prova de que uma zona não tem vigilância.",
  placeSearchSubmit: "Pesquisar",
  placeSearchLoading: "A pesquisar fichas públicas perto desse local…",
  placeSearchUnavailable: "A pesquisa está temporariamente indisponível. Tenta novamente daqui a pouco.",
  placeSearchRateLimited: "Demasiadas pesquisas. Aguarda um momento e tenta novamente.",
  placeSearchEmptyQuery: "Introduz uma localidade, uma morada ou coordenadas para pesquisar.",
  placeClearResults: "Limpar resultados",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Área de pesquisa: perto de ${area.displayName} (num raio de ${area.radiusLabel})`
      : `Área de pesquisa: num raio de ${area.radiusLabel} de ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count === 1 ? "ficha pública encontrada" : "fichas públicas encontradas"} perto deste local`,
  placeNotFoundTitle: "Não conseguimos encontrar esse local.",
  placeNotFoundBody: "Verifica a ortografia ou introduz antes coordenadas (latitude, longitude).",
  placeEmptyTitle: "Não foi encontrada nenhuma ficha publicada nesta zona.",
  placeEmptyBody:
    "Isto significa apenas que nenhuma ficha pública desta base de dados se encontra dentro da área de pesquisa. Não é prova de que ali não existam câmaras.",
  placeEmptySubmit: "Enviar um reporte",
  placeEmptyCoverage: "Sobre os limites de cobertura dos dados",
  // Data actions footer (t_b98b1734, CEO 2026-08-08): the CSV/GeoJSON
  // downloads live here as small text links next to the data policy link
  // (DirectoryTool — exportCsv/exportGeoJson, filter-aware); same row/font.
  readDataPolicy: "Lê a política de dados",
  recordId: "ID da ficha",
  source: "Fonte",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Dados de exemplo ilustrativos",
  demoUpdated: "Dados de demonstração",
  location: "Localização",
  unknown: "Desconhecido",
  manufacturerLabel: "Fabricante",
  observedOnLabel: "Observada em",
  // Load failure (kanban t_e11080eb): the walk could not complete — a
  // transient API error (rate limit, network) must NEVER masquerade as "0
  // public records found". The directory shows this truthful error state
  // with a retry action instead of the empty state.
  loadErrorTitle: "Não foi possível carregar o diretório.",
  loadErrorBody: "As fichas públicas continuam disponíveis — trata-se de um problema temporário ao carregá-las. Tenta novamente ou explora o mapa.",
  loadErrorRetry: "Tentar novamente",
};
