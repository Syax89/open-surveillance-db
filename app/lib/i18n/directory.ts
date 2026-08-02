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
    "Search, filter and order the reviewed public records without the map. A result is never evidence that an area has no surveillance.",
  navigation: "Directory navigation",
  homeAria: "OpenSurveillanceDB home",
  useMapInstead: "Use the map instead",
  // Directory section (extracted from the home page bundle in F1).
  accessibleDirectory: "Accessible directory",
  recordsTitle: "Browse public records without the map",
  recordsIntro:
    "Search covers the same reviewed records shown on the map. A result is never evidence that an area has no surveillance.",
  searchDirectory: "Search the public directory",
  searchPlaceholder: "Type, source, place or coordinate",
  searchHelp:
    "Only reviewed public records and labelled prototype records appear here.",
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
  oneRecordFound: "1 public record found",
  recordsFound: "public records found",
  lastVerification: "Last verification",
  showOnMap: "Show on map",
  openRecord: "Open record",
  emptyTitle: "No published record matches that search.",
  emptyBody:
    "This does not mean that there are no cameras in the area. You can clear the search, explore the map, or submit a private observation for moderation.",
  clearSearch: "Clear search",
  submitObservation: "Submit a private observation",
  resetFilters: "Reset filters",
  offlineTitle: "You are offline",
  offlineBody: "Showing the last loaded records.",
  offlineAction: "Try again",
  distance: "Distance",
  placeSearchTitle: "Search by place",
  placeSearchLabel: "Locality, address, or coordinates",
  placeSearchPlaceholder: "e.g. Town centre, Via Roma, or 45.46420, 9.19000",
  placeSearchHelp:
    "Finds reviewed public records near the place you enter. A result is never proof that an area has no surveillance.",
  placeSearchSubmit: "Search",
  placeSearchLoading: "Searching reviewed public records near that place…",
  placeSearchUnavailable: "Search is temporarily unavailable. Please try again shortly.",
  placeSearchRateLimited: "Too many searches. Please wait a moment and try again.",
  placeSearchEmptyQuery: "Enter a locality, address, or coordinates to search.",
  placeClearResults: "Clear results",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Search area: near ${area.displayName} (within ${area.radiusLabel})`
      : `Search area: within ${area.radiusLabel} of ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count === 1 ? "reviewed public record" : "reviewed public records"} found near this place`,
  placeNotFoundTitle: "We could not find that place.",
  placeNotFoundBody: "Check the spelling, or enter coordinates (latitude, longitude) instead.",
  placeEmptyTitle: "No published record was found in this area.",
  placeEmptyBody:
    "This means only that no reviewed record in this database falls inside the search area. It is not evidence that no cameras exist there.",
  placeEmptySubmit: "Submit a private observation",
  placeEmptyCoverage: "About data coverage limits",
  recordId: "Record ID",
  source: "Source",
  location: "Location",
  unknown: "Unknown",
  manufacturerLabel: "Manufacturer",
  observedOnLabel: "Observed on",
} as const;

export const it: Translation<typeof en> = {
  // Chrome di pagina (/directory).
  pageTitle: "Elenco pubblico",
  pageIntro:
    "Cerca, filtra e ordina i record pubblici revisionati senza usare la mappa. Un risultato non è mai la prova che un'area non abbia sorveglianza.",
  navigation: "Navigazione elenco",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  useMapInstead: "Usa invece la mappa",
  // Sezione elenco (estratta dal bundle della home nella F1).
  accessibleDirectory: "Elenco accessibile",
  recordsTitle: "Sfoglia i record pubblici senza usare la mappa",
  recordsIntro:
    "La ricerca include gli stessi record revisionati mostrati sulla mappa. Un risultato non prova mai l'assenza di sorveglianza in un'area.",
  searchDirectory: "Cerca nell'elenco pubblico",
  searchPlaceholder: "Tipo, fonte, luogo o coordinate",
  searchHelp:
    "Qui compaiono solo record pubblici revisionati e record prototipo etichettati.",
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
  oneRecordFound: "1 record pubblico trovato",
  recordsFound: "record pubblici trovati",
  lastVerification: "Ultima verifica",
  showOnMap: "Mostra sulla mappa",
  openRecord: "Apri record",
  emptyTitle: "Nessun record pubblicato corrisponde alla ricerca.",
  emptyBody:
    "Questo non significa che nell'area non ci siano telecamere. Puoi cancellare la ricerca, esplorare la mappa o inviare un'osservazione privata per la moderazione.",
  clearSearch: "Cancella ricerca",
  submitObservation: "Invia un'osservazione privata",
  resetFilters: "Azzera i filtri",
  offlineTitle: "Sei offline",
  offlineBody: "Mostriamo gli ultimi record caricati.",
  offlineAction: "Riprova",
  distance: "Distanza",
  placeSearchTitle: "Cerca per luogo",
  placeSearchLabel: "Località, indirizzo o coordinate",
  placeSearchPlaceholder: "es. Centro città, Via Roma, o 45.46420, 9.19000",
  placeSearchHelp:
    "Trova record pubblici revisionati vicino al luogo inserito. Un risultato non è mai la prova che un'area non abbia sorveglianza.",
  placeSearchSubmit: "Cerca",
  placeSearchLoading: "Ricerca dei record pubblici revisionati vicino a questo luogo…",
  placeSearchUnavailable: "La ricerca è temporaneamente non disponibile. Riprova tra poco.",
  placeSearchRateLimited: "Troppe ricerche. Attendi un momento e riprova.",
  placeSearchEmptyQuery: "Inserisci una località, un indirizzo o delle coordinate per cercare.",
  placeClearResults: "Cancella i risultati",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Area di ricerca: vicino a ${area.displayName} (entro ${area.radiusLabel})`
      : `Area di ricerca: entro ${area.radiusLabel} da ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count === 1 ? "record pubblico revisionato" : "record pubblici revisionati"} trovati vicino a questo luogo`,
  placeNotFoundTitle: "Non siamo riusciti a trovare questo luogo.",
  placeNotFoundBody: "Controlla l'ortografia oppure inserisci le coordinate (latitudine, longitudine).",
  placeEmptyTitle: "In questa area non è stato trovato alcun record pubblicato.",
  placeEmptyBody:
    "Questo significa solo che nessun record revisionato di questo database rientra nell'area di ricerca. Non è la prova che lì non ci siano telecamere.",
  placeEmptySubmit: "Invia un'osservazione privata",
  placeEmptyCoverage: "I limiti della copertura dati",
  recordId: "ID record",
  source: "Fonte",
  location: "Posizione",
  unknown: "Sconosciuto",
  manufacturerLabel: "Produttore",
  observedOnLabel: "Data osservata",
};
