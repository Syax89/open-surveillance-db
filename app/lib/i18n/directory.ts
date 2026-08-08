/**
 * directory — interface strings for the public directory tool (/directory).
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  // Page-level chrome (/directory).
  pageTitle: "Public directory",
  pageIntro:
    "Search, filter and order the public records without the map. A result is never evidence that an area has no surveillance.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Loading the directory…",
  navigation: "Directory navigation",
  homeAria: "OpenSurveillanceDB home",
  useMapInstead: "Use the map instead",
  // Directory section (extracted from the home page bundle in F1).
  accessibleDirectory: "Accessible directory",
  recordsTitle: "Browse public records without the map",
  recordsIntro:
    "Search covers the same public records shown on the map. A result is never evidence that an area has no surveillance.",
  // Catalog mode (t_127492f1): the sr-only heading of the results region —
  // keeps the h1 → h2 → h3 ladder on /directory now that the place-search
  // block is a collapsible panel instead of the section heading.
  resultsRegion: "Directory results",
  searchDirectory: "Search the public directory",
  searchPlaceholder: "Name, type, address or place",
  searchHelp:
    "Search the records as you type, or press Enter to search around a place.",
  filters: "Filters",
  // Catalog mode: data export of the filtered set. The API applies the
  // server-side filters (kind + freshness); q and sort are client-side, so
  // the hint below says exactly what the export contains.
  exportCsv: "Download CSV",
  exportGeoJson: "Download GeoJSON",
  exportHint: "Exports apply the current type and freshness filters.",
  // Catalog mode (CEO 2026-08-08): the small circular [+] in the results
  // header top-right — a direct shortcut to the report form (/segnala).
  reportCamera: "Report a camera",
  // Catalog mode (t_f13fcb1c): the visible results header, the active-filter
  // chips, the alphabetical index and the pagination bar.
  activeFilters: "Active filters",
  removeFilter: (label: string) => `Remove filter: ${label}`,
  alphaIndexTitle: "Alphabetical index",
  alphaIndexAria: (letter: string) => `Jump to records starting with ${letter}`,
  showingRecords: (from: number, to: number, total: number) => `Showing ${from}–${to} of ${total} records`,
  pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,
  previousPage: "Previous page",
  nextPage: "Next page",
  // Catalog mode: the place-search panel trigger in the results meta row
  // (the panel itself keeps the historical place-search strings).
  searchNearPlace: "Search near a place…",
  placeHide: "Hide place search",
  cameraType: "Camera type",
  allTypes: "All types",
  freshnessFilter: "Record freshness",
  freshnessAll: "Any time",
  freshness7d: "Last 7 days",
  freshness30d: "Last 30 days",
  freshness90d: "Last 90 days",
  orderRecords: "Order records",
  alphabetical: "Alphabetical",
  positionOrder: "Position (south to north)",
  // Community ranking (ADR 0021 §10, FASE 3 UI): the three server sort
  // options surface usefulness (weighted likes), freshness (last confirm)
  // and confirmation volume. Same frozen vocabulary as the action widget.
  sortUseful: "Most useful",
  sortRecent: "Recently confirmed",
  sortConfirmations: "Most confirmations",
  // Confirmation-status filter (?state=, FASE 3 UI): a record's "state"
  // in the directory sense is its community confirmation — never
  // hidden/removed, which are excluded from the public list by design
  // (ADR §6.3).
  stateFilter: "Confirmation status",
  stateAll: "Any",
  stateConfirmed: "Confirmed",
  stateNever: "Never confirmed",
  advancedFilters: "More filters",
  advancedFiltersActive: (count: number) => `More filters · ${count} active`,
  // Import-origin filter (?origin=, FASE C, t_4dbce318): where a record
  // comes from — a community report or an imported public dataset.
  originFilter: "Origin",
  originAll: "Any",
  originReports: "Community reports",
  originImported: "Imported data",
  oneRecordFound: "1 public record found",
  recordsFound: "public records found",
  lastVerification: "Last confirmed",
  showOnMap: "Show on map",
  openRecord: "Open record",
  emptyTitle: "No published record matches that search.",
  emptyBody:
    "This does not mean that there are no cameras in the area. You can clear the search, explore the map, or submit a report from a verified account.",
  clearSearch: "Clear search",
  submitObservation: "Submit a report",
  resetFilters: "Reset filters",
  offlineTitle: "You are offline",
  offlineBody: "Showing the last loaded records.",
  offlineAction: "Try again",
  distance: "Distance",
  placeSearchTitle: "Search by place",
  placeSearchLabel: "Locality, address, or coordinates",
  placeSearchPlaceholder: "e.g. Town centre, Via Roma, or 45.46420, 9.19000",
  placeSearchHelp:
    "Finds public records near the place you enter. A result is never proof that an area has no surveillance.",
  placeSearchSubmit: "Search",
  placeSearchLoading: "Searching public records near that place…",
  placeSearchUnavailable: "Search is temporarily unavailable. Please try again shortly.",
  placeSearchRateLimited: "Too many searches. Please wait a moment and try again.",
  placeSearchEmptyQuery: "Enter a locality, address, or coordinates to search.",
  placeClearResults: "Clear results",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Search area: near ${area.displayName} (within ${area.radiusLabel})`
      : `Search area: within ${area.radiusLabel} of ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count === 1 ? "public record" : "public records"} found near this place`,
  placeNotFoundTitle: "We could not find that place.",
  placeNotFoundBody: "Check the spelling, or enter coordinates (latitude, longitude) instead.",
  placeEmptyTitle: "No published record was found in this area.",
  placeEmptyBody:
    "This means only that no public record in this database falls inside the search area. It is not evidence that no cameras exist there.",
  placeEmptySubmit: "Submit a report",
  placeEmptyCoverage: "About data coverage limits",
  // Data actions footer (t_b98b1734, CEO 2026-08-08): the CSV/GeoJSON
  // downloads live here as small text links next to the data policy link
  // (DirectoryTool — exportCsv/exportGeoJson, filter-aware); same row/font.
  readDataPolicy: "Read the data policy",
  recordId: "Record ID",
  source: "Source",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Illustrative seed",
  demoUpdated: "Demo data",
  location: "Location",
  unknown: "Unknown",
  manufacturerLabel: "Manufacturer",
  observedOnLabel: "Observed on",
  // Load failure (kanban t_e11080eb): the walk could not complete — a
  // transient API error (rate limit, network) must NEVER masquerade as "0
  // public records found". The directory shows this truthful error state
  // with a retry action instead of the empty state.
  loadErrorTitle: "The directory could not be loaded.",
  loadErrorBody: "The public records are still there — this is a temporary problem while loading them. Try again, or explore the map.",
  loadErrorRetry: "Try again",
} as const;

export const it: Translation<typeof en> = {
  // Chrome di pagina (/directory).
  pageTitle: "Elenco pubblico",
  pageIntro:
    "Cerca, filtra e ordina i record pubblici senza usare la mappa. Un risultato non è mai la prova che un'area non abbia sorveglianza.",
  // F2 (QA#6): fallback SSR Suspense per il corpo tool client.
  loading: "Caricamento dell'elenco…",
  navigation: "Navigazione elenco",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  useMapInstead: "Usa invece la mappa",
  // Sezione elenco (estratta dal bundle della home nella F1).
  accessibleDirectory: "Elenco accessibile",
  recordsTitle: "Sfoglia i record pubblici senza usare la mappa",
  recordsIntro:
    "La ricerca include gli stessi record pubblici mostrati sulla mappa. Un risultato non prova mai l'assenza di sorveglianza in un'area.",
  // Modalità catalogo (t_127492f1): heading sr-only della regione risultati —
  // mantiene la scala h1 → h2 → h3 su /directory ora che la ricerca per luogo
  // è un pannello collassabile e non più l'heading di sezione.
  resultsRegion: "Risultati dell'elenco",
  searchDirectory: "Cerca nell'elenco pubblico",
  searchPlaceholder: "Nome, tipo, indirizzo o luogo",
  searchHelp:
    "Cerca i record mentre scrivi, oppure premi Invio per cercare intorno a un luogo.",
  filters: "Filtri",
  // Modalità catalogo: export dei dati filtrati. L'API applica i filtri
  // server (tipo + aggiornamento); q e ordinamento restano client, quindi
  // il suggerimento dichiara esattamente cosa contiene l'export.
  exportCsv: "Scarica CSV",
  exportGeoJson: "Scarica GeoJSON",
  exportHint: "Gli export applicano i filtri di tipo e aggiornamento correnti.",
  // Modalità catalogo (CEO 2026-08-08): il piccolo [+] circolare nell'header
  // dei risultati in alto a destra — scorciatoia diretta al modulo di
  // segnalazione (/segnala).
  reportCamera: "Segnala una telecamera",
  // Modalità catalogo (t_f13fcb1c): header risultati visibile, chips dei
  // filtri attivi, indice alfabetico e barra di paginazione.
  activeFilters: "Filtri attivi",
  removeFilter: (label: string) => `Rimuovi filtro: ${label}`,
  alphaIndexTitle: "Indice alfabetico",
  alphaIndexAria: (letter: string) => `Vai ai record che iniziano con ${letter}`,
  showingRecords: (from: number, to: number, total: number) => `Mostrando ${from}–${to} di ${total} record`,
  pageOf: (page: number, pages: number) => `Pagina ${page} di ${pages}`,
  previousPage: "Pagina precedente",
  nextPage: "Pagina successiva",
  // Modalità catalogo: trigger del pannello ricerca-per-luogo nella riga
  // meta dei risultati (il pannello conserva le stringhe storiche).
  searchNearPlace: "Cerca vicino a un luogo…",
  placeHide: "Nascondi ricerca per luogo",
  cameraType: "Tipo di telecamera",
  allTypes: "Tutti i tipi",
  freshnessFilter: "Aggiornamento record",
  freshnessAll: "Sempre",
  freshness7d: "Ultimi 7 giorni",
  freshness30d: "Ultimi 30 giorni",
  freshness90d: "Ultimi 90 giorni",
  orderRecords: "Ordina i record",
  alphabetical: "Alfabetico",
  positionOrder: "Posizione (da sud a nord)",
  // Ranking della community (ADR 0021 §10, FASE 3 UI): le tre opzioni di
  // ordinamento del server esprimono utilità (like pesati), freschezza
  // (ultima conferma) e volume di conferme. Stesso vocabolario congelato
  // del widget azioni.
  sortUseful: "Più utili",
  sortRecent: "Confermate di recente",
  sortConfirmations: "Più conferme",
  // Filtro stato di conferma (?state=, FASE 3 UI): lo "stato" di un record
  // nel senso dell'elenco è la sua conferma community — mai nascosto/rimosso,
  // che per design sono esclusi dall'elenco pubblico (ADR §6.3).
  stateFilter: "Stato di conferma",
  stateAll: "Qualsiasi",
  stateConfirmed: "Confermata",
  stateNever: "Mai confermata",
  advancedFilters: "Altri filtri",
  advancedFiltersActive: (count: number) => `Altri filtri · ${count} attivi`,
  // Filtro origine import (?origin=, FASE C, t_4dbce318): da dove arriva
  // un record — una segnalazione della community o un dataset pubblico
  // importato.
  originFilter: "Origine",
  originAll: "Qualsiasi",
  originReports: "Segnalazioni",
  originImported: "Dati importati",
  oneRecordFound: "1 record pubblico trovato",
  recordsFound: "record pubblici trovati",
  lastVerification: "Ultima conferma",
  showOnMap: "Mostra sulla mappa",
  openRecord: "Apri record",
  emptyTitle: "Nessun record pubblicato corrisponde alla ricerca.",
  emptyBody:
    "Questo non significa che nell'area non ci siano telecamere. Puoi cancellare la ricerca, esplorare la mappa o inviare una segnalazione da un account verificato.",
  clearSearch: "Cancella ricerca",
  submitObservation: "Invia una segnalazione",
  resetFilters: "Azzera i filtri",
  offlineTitle: "Sei offline",
  offlineBody: "Mostriamo gli ultimi record caricati.",
  offlineAction: "Riprova",
  distance: "Distanza",
  placeSearchTitle: "Cerca per luogo",
  placeSearchLabel: "Località, indirizzo o coordinate",
  placeSearchPlaceholder: "es. Centro città, Via Roma, o 45.46420, 9.19000",
  placeSearchHelp:
    "Trova record pubblici vicino al luogo inserito. Un risultato non è mai la prova che un'area non abbia sorveglianza.",
  placeSearchSubmit: "Cerca",
  placeSearchLoading: "Ricerca dei record pubblici vicino a questo luogo…",
  placeSearchUnavailable: "La ricerca è temporaneamente non disponibile. Riprova tra poco.",
  placeSearchRateLimited: "Troppe ricerche. Attendi un momento e riprova.",
  placeSearchEmptyQuery: "Inserisci una località, un indirizzo o delle coordinate per cercare.",
  placeClearResults: "Cancella i risultati",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Area di ricerca: vicino a ${area.displayName} (entro ${area.radiusLabel})`
      : `Area di ricerca: entro ${area.radiusLabel} da ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count === 1 ? "record pubblico" : "record pubblici"} trovati vicino a questo luogo`,
  placeNotFoundTitle: "Non siamo riusciti a trovare questo luogo.",
  placeNotFoundBody: "Controlla l'ortografia oppure inserisci le coordinate (latitudine, longitudine).",
  placeEmptyTitle: "In questa area non è stato trovato alcun record pubblicato.",
  placeEmptyBody:
    "Questo significa solo che nessun record pubblico di questo database rientra nell'area di ricerca. Non è la prova che lì non ci siano telecamere.",
  placeEmptySubmit: "Invia una segnalazione",
  placeEmptyCoverage: "I limiti della copertura dati",
  // Footer azioni dati (t_b98b1734, CEO 2026-08-08): i download CSV/GeoJSON
  // vivono qui come link di testo piccoli accanto al link della politica
  // dati (DirectoryTool — exportCsv/exportGeoJson, filtro-aware); stessa
  // riga/font.
  readDataPolicy: "Leggi la politica dei dati",
  recordId: "ID record",
  source: "Fonte",
  // F4 (QA#6): i record del seed demo hanno marcatori grezzi neutri
  // ("Development seed"/"Demo data" — contratto di test, vedi DATA_DICTIONARY);
  // la presentazione mostra invece queste etichette localizzate.
  demoSource: "Seed illustrativo",
  demoUpdated: "Dato dimostrativo",
  location: "Posizione",
  unknown: "Sconosciuto",
  manufacturerLabel: "Produttore",
  observedOnLabel: "Data osservata",
  // Errore di caricamento (kanban t_e11080eb): il walk non è riuscito — un
  // errore API transitorio (rate limit, rete) non deve MAI mascherarsi da
  // "0 record pubblici trovati". La directory mostra questo stato di errore
  // veritiero con un'azione di riprova invece dello stato vuoto.
  loadErrorTitle: "L'elenco non è stato caricato.",
  loadErrorBody: "I record pubblici ci sono ancora — è un problema temporaneo di caricamento. Riprova oppure esplora la mappa.",
  loadErrorRetry: "Riprova",
};
