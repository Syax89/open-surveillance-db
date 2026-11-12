/**
 * directory — ES translation. Parity-checked against the English pilot
 * bundle (../../directory.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../directory";

export const es: Translation<typeof en> = {
  // Page-level chrome (/directory).
  pageTitle: "Directorio público",
  pageIntro:
    "Busca, filtra y ordena las fichas públicas sin el mapa. Un resultado nunca demuestra que una zona no tenga vigilancia.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Cargando el directorio…",
  navigation: "Navegación del directorio",
  homeAria: "Inicio de OpenSurveillanceDB",
  useMapInstead: "Usar el mapa",
  // Directory section (extracted from the home page bundle in F1).
  accessibleDirectory: "Directorio accesible",
  recordsTitle: "Consulta las fichas públicas sin el mapa",
  recordsIntro:
    "La búsqueda abarca las mismas fichas públicas que aparecen en el mapa. Un resultado nunca demuestra que una zona no tenga vigilancia.",
  // Catalog mode (t_127492f1): the sr-only heading of the results region —
  // keeps the h1 → h2 → h3 ladder on /directory now that the place-search
  // block is a collapsible panel instead of the section heading.
  resultsRegion: "Resultados del directorio",
  searchDirectory: "Buscar en el directorio público",
  searchPlaceholder: "Nombre, tipo, dirección o lugar",
  searchHelp:
    "Busca en las fichas mientras escribes o pulsa Enter para buscar alrededor de un lugar.",
  filters: "Filtros",
  // Catalog mode: data export of the filtered set (issue #409). The
  // downloads are generated client-side from the exact visible records, so
  // EVERY active filter applies (search, type, freshness, state, origin)
  // plus the sort order; the hint below says exactly what the export
  // contains.
  exportCsv: "Descargar CSV",
  exportGeoJson: "Descargar GeoJSON",
  exportHint: "Las exportaciones incluyen las fichas que muestran la búsqueda y los filtros actuales.",
  // Catalog mode (CEO 2026-08-08): the small circular [+] in the results
  // header top-right — a direct shortcut to the report form (/segnala).
  reportCamera: "Reportar una cámara",
  // Catalog mode (t_f13fcb1c): the visible results header, the active-filter
  // chips, the alphabetical index and the pagination bar.
  activeFilters: "Filtros activos",
  removeFilter: (label: string) => `Quitar filtro: ${label}`,
  // F1 (mobile usability 2026-10-23): the native filter disclosure summary
  // states how many selections are active — the SAME count as the removable
  // chips, so the closed disclosure still tells the truth. Singular/plural;
  // an all-default state renders no count at all.
  filtersActiveOne: "1 filtro activo",
  filtersActiveMany: (count: number) => `${count} filtros activos`,
  // F1: the chip of a non-default order names the ordering ("Order: Most
  // useful") so it is never read as a restrictive filter.
  filterOrder: (label: string) => `Orden: ${label}`,
  alphaIndexTitle: "Índice alfabético",
  alphaIndexAria: (letter: string) => `Ir a las fichas que empiezan por ${letter}`,
  showingRecords: (from: number | string, to: number | string, total: number | string) => `Se muestran ${from}–${to} de ${total} fichas`,
  pageOf: (page: number | string, pages: number | string) => `Página ${page} de ${pages}`,
  previousPage: "Página anterior",
  nextPage: "Página siguiente",
  // Catalog mode: the place-search panel trigger in the results meta row
  // (the panel itself keeps the historical place-search strings).
  searchNearPlace: "Buscar cerca de un lugar…",
  placeHide: "Ocultar la búsqueda por lugar",
  cameraType: "Tipo de cámara",
  allTypes: "Todos los tipos",
  freshnessFilter: "Actualidad de la ficha",
  freshnessAll: "Cualquier fecha",
  freshness7d: "Últimos 7 días",
  freshness30d: "Últimos 30 días",
  freshness90d: "Últimos 90 días",
  orderRecords: "Ordenar fichas",
  alphabetical: "Alfabético",
  positionOrder: "Posición (de sur a norte)",
  // Community ranking (ADR 0021 §10, FASE 3 UI): the three server sort
  // options surface usefulness (weighted likes), freshness (last confirm)
  // and confirmation volume. Same frozen vocabulary as the action widget.
  sortUseful: "Más útiles",
  sortRecent: "Confirmadas recientemente",
  sortConfirmations: "Más confirmaciones",
  // Confirmation-status filter (?state=, FASE 3 UI): a record's "state"
  // in the directory sense is its community confirmation — never
  // hidden/removed, which are excluded from the public list by design
  // (ADR §6.3).
  stateFilter: "Estado de confirmación",
  stateAll: "Cualquiera",
  stateConfirmed: "Confirmadas",
  stateNever: "Nunca confirmadas",
  advancedFilters: "Más filtros",
  advancedFiltersActive: (count: number) => `Más filtros · ${count} ${count === 1 ? "activo" : "activos"}`,
  // Import-origin filter (?origin=, FASE C, t_4dbce318): where a record
  // comes from — a community report or an imported public dataset.
  originFilter: "Origen",
  originAll: "Cualquiera",
  originReports: "Reportes de la comunidad",
  originImported: "Datos importados",
  oneRecordFound: "1 ficha pública encontrada",
  recordsFound: "fichas públicas encontradas",
  // M03: the card shows `record.updated` (record update, not a community
  // confirmation) — the label must say so.
  lastUpdated: "Última actualización",
  showOnMap: "Ver en el mapa",
  openRecord: "Abrir ficha",
  emptyTitle: "Ninguna ficha publicada coincide con esa búsqueda.",
  emptyBody:
    "Esto no significa que no haya cámaras en la zona. Puedes borrar la búsqueda, explorar el mapa o enviar un reporte desde una cuenta verificada.",
  clearSearch: "Borrar búsqueda",
  submitObservation: "Enviar un reporte",
  resetFilters: "Restablecer filtros",
  offlineTitle: "No tienes conexión",
  offlineBody: "Se muestran las últimas fichas cargadas.",
  offlineAction: "Reintentar",
  distance: "Distancia",
  placeSearchTitle: "Buscar por lugar",
  placeSearchLabel: "Localidad, dirección o coordenadas",
  placeSearchPlaceholder: "p. ej. Centro, Calle Mayor o 45.46420, 9.19000",
  placeSearchHelp:
    "Encuentra fichas públicas cerca del lugar que introduzcas. Un resultado nunca demuestra que una zona no tenga vigilancia.",
  placeSearchSubmit: "Buscar",
  placeSearchLoading: "Buscando fichas públicas cerca de ese lugar…",
  placeSearchUnavailable: "La búsqueda no está disponible temporalmente. Inténtalo de nuevo en breve.",
  placeSearchRateLimited: "Demasiadas búsquedas. Espera un momento e inténtalo de nuevo.",
  placeSearchEmptyQuery: "Introduce una localidad, una dirección o unas coordenadas para buscar.",
  placeClearResults: "Borrar resultados",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Zona de búsqueda: cerca de ${area.displayName} (en un radio de ${area.radiusLabel})`
      : `Zona de búsqueda: en un radio de ${area.radiusLabel} de ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count === 1 ? "ficha pública encontrada" : "fichas públicas encontradas"} cerca de este lugar`,
  placeNotFoundTitle: "No hemos encontrado ese lugar.",
  placeNotFoundBody: "Revisa cómo está escrito o introduce unas coordenadas (latitud, longitud).",
  placeEmptyTitle: "No se ha encontrado ninguna ficha publicada en esta zona.",
  placeEmptyBody:
    "Esto solo significa que ninguna ficha pública de esta base de datos se encuentra dentro de la zona de búsqueda. No demuestra que allí no haya cámaras.",
  placeEmptySubmit: "Enviar un reporte",
  placeEmptyCoverage: "Sobre los límites de cobertura de los datos",
  // Data actions footer (t_b98b1734, CEO 2026-08-08): the CSV/GeoJSON
  // downloads live here as small text links next to the data policy link
  // (DirectoryTool — exportCsv/exportGeoJson, filter-aware); same row/font.
  readDataPolicy: "Lee la política de datos",
  recordId: "ID de la ficha",
  source: "Fuente",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Datos de ejemplo",
  communityReportSource: "Reporte de la comunidad",
  demoUpdated: "Datos de demostración",
  location: "Ubicación",
  unknown: "Desconocido",
  manufacturerLabel: "Fabricante",
  observedOnLabel: "Observada el",
  // Load failure (kanban t_e11080eb): the walk could not complete — a
  // transient API error (rate limit, network) must NEVER masquerade as "0
  // public records found". The directory shows this truthful error state
  // with a retry action instead of the empty state.
  loadErrorTitle: "No se ha podido cargar el directorio.",
  loadErrorBody: "Las fichas públicas siguen ahí: es un problema temporal al cargarlas. Inténtalo de nuevo o explora el mapa.",
  loadErrorRetry: "Reintentar",
};
