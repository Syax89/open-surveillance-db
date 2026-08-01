/**
 * map — interface strings for the interactive map tool (/mappa).
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  mapLabel: "Interactive OpenStreetMap map",
  mapDescription:
    "The map shows the same public records as the accessible directory below. You can use the directory to search, filter, and open records without using the map.",
  mapDirectoryLink: "Go to the accessible directory",
  mapFallbackTitle: "The interactive map is unavailable.",
  mapFallbackBody:
    "You can still search, filter, and open every public record from the accessible directory, which works without the map.",
  // Page-level chrome (/mappa).
  pageTitle: "Interactive map",
  pageIntro:
    "Explore documented public cameras on the map. Use the filters to narrow the view; every marker opens its public record. An empty area never proves that no cameras are present.",
  // Map section (extracted from the home page bundle in F1).
  livePrototype: "Live prototype",
  mapTitle: "Explore documented cameras",
  osmBaseMap: "OpenStreetMap base map",
  mapCoverageNote:
    "The map shows documented public records only; an empty area does not prove that no cameras are present.",
  prototypeMode: "Prototype mode.",
  prototypeBanner:
    "The base map is real OpenStreetMap data; the two visible camera pins are clearly labelled illustrative records. Click anywhere on the map to select a position for a report.",
  mapHint: "Click the map to choose a report position",
  recordId: "Record ID",
  source: "Source",
  freshness: "Freshness",
  location: "Location",
  reportIssue: "Report an issue",
  loadingRecords: "Loading the public record API…",
  downloadGeoJson: "Download GeoJSON",
  downloadCsv: "Download CSV",
  readDataPolicy: "Read the data policy",
  unknown: "Unknown",
  apiUnavailable:
    "The public API is not available yet, so the prototype is showing illustrative records.",
  // Truthful empty state (never a silent map).
  emptyTitle: "No published record matches those filters.",
  emptyBody:
    "This does not mean that there are no cameras in the area. You can reset the filters, browse the directory, or submit a private observation for moderation.",
  clearSearch: "Clear filters",
  offlineTitle: "You are offline",
  offlineBody: "Showing the last loaded records.",
  offlineAction: "Try again",
} as const;

export const it: Translation<typeof en> = {
  mapLabel: "Mappa interattiva OpenStreetMap",
  mapDescription:
    "La mappa mostra gli stessi record pubblici dell'elenco accessibile sottostante. Puoi usare l'elenco per cercare, filtrare e aprire i record senza usare la mappa.",
  mapDirectoryLink: "Vai all'elenco accessibile",
  mapFallbackTitle: "La mappa interattiva non è disponibile.",
  mapFallbackBody:
    "Puoi comunque cercare, filtrare e aprire ogni record pubblico dall'elenco accessibile, che funziona senza la mappa.",
  // Chrome di pagina (/mappa).
  pageTitle: "Mappa interattiva",
  pageIntro:
    "Esplora le telecamere pubbliche documentate sulla mappa. Usa i filtri per restringere la vista; ogni segnaposto apre il record pubblico. Un'area vuota non dimostra mai l'assenza di telecamere.",
  // Sezione mappa (estratta dal bundle della home nella F1).
  livePrototype: "Prototipo attivo",
  mapTitle: "Esplora le telecamere documentate",
  osmBaseMap: "Mappa di base OpenStreetMap",
  mapCoverageNote:
    "La mappa mostra solo record pubblici documentati; un'area vuota non dimostra che non ci siano telecamere.",
  prototypeMode: "Modalità prototipo.",
  prototypeBanner:
    "La mappa di base usa dati reali di OpenStreetMap; i due pin visibili sono record illustrativi chiaramente etichettati. Fai clic in un punto della mappa per selezionare la posizione di una segnalazione.",
  mapHint: "Fai clic sulla mappa per scegliere la posizione della segnalazione",
  recordId: "ID record",
  source: "Fonte",
  freshness: "Aggiornamento",
  location: "Posizione",
  reportIssue: "Segnala un problema",
  loadingRecords: "Caricamento dell'API dei record pubblici…",
  downloadGeoJson: "Scarica GeoJSON",
  downloadCsv: "Scarica CSV",
  readDataPolicy: "Leggi la politica dei dati",
  unknown: "Sconosciuto",
  apiUnavailable:
    "L'API pubblica non è ancora disponibile: il prototipo mostra record illustrativi.",
  // Stato vuoto truthful (mai una mappa muta).
  emptyTitle: "Nessun record pubblicato corrisponde a questi filtri.",
  emptyBody:
    "Questo non significa che nell'area non ci siano telecamere. Puoi azzerare i filtri, sfogliare l'elenco o inviare un'osservazione privata per la moderazione.",
  clearSearch: "Azzera i filtri",
  offlineTitle: "Sei offline",
  offlineBody: "Mostriamo gli ultimi record caricati.",
  offlineAction: "Riprova",
};
