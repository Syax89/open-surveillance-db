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
  // Map tool chrome (t_966254a1): the tool has ONE header (pageTitle) —
  // the old "Explore documented cameras" section heading and its coverage
  // note were removed with the duplicated header; pageIntro already covers
  // the "an empty area never proves absence" truthfulness contract.
  livePrototype: "Live prototype",
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
  // Viewport-synced sidebar list (/mappa redesign, t_702c10af): the left
  // column shows only the points inside the current map view.
  listSearchLabel: "Filter the points in the current view",
  listSearchPlaceholder: "Search by title, address or type",
  listSearchHelp:
    "The list shows only the points inside the current map view. Searching filters those points by title, address or type; moving or zooming the map updates the list.",
  listTitle: "Points in the current view",
  listMapSyncHelp: "The list updates as you move or zoom the map: zoom in to narrow it, zoom out to widen it.",
  listCount: (visible: number, total: number) =>
    visible === 0
      ? "No points in the current view"
      : visible === total
        ? `Showing all ${visible} points in the current view`
        : `Showing ${visible} of ${total} points in the current view`,
  listEmptyInView:
    "No documented points in the current view. Move the map or zoom out to explore more.",
  // Marker popup (t_702c10af): opens on marker click with the record info
  // and its correction/detail links.
  popupDetail: "Open record",
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
  // Chrome del tool mappa (t_966254a1): il tool ha UN solo header (pageTitle)
  // — il vecchio heading di sezione "Esplora le telecamere documentate" e la
  // sua nota di copertura sono stati rimossi con l'header duplicato;
  // pageIntro copre già il contratto di veridicità "un'area vuota non
  // dimostra l'assenza di telecamere".
  livePrototype: "Prototipo attivo",
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
  // Elenco laterale sincronizzato col viewport (redesign /mappa, t_702c10af):
  // la colonna sinistra mostra solo i punti dentro la vista corrente.
  listSearchLabel: "Filtra i punti nella vista corrente",
  listSearchPlaceholder: "Cerca per titolo, indirizzo o tipo",
  listSearchHelp:
    "L'elenco mostra solo i punti dentro la vista corrente della mappa. La ricerca filtra quei punti per titolo, indirizzo o tipo; spostando o zoomando la mappa l'elenco si aggiorna.",
  listTitle: "Punti nella vista corrente",
  listMapSyncHelp:
    "L'elenco si aggiorna mentre muovi o zoomi la mappa: ingrandendo si restringe, rimpicciolendo si allarga.",
  listCount: (visible: number, total: number) =>
    visible === 0
      ? "Nessun punto nella vista corrente"
      : visible === total
        ? `Mostrati tutti i ${visible} punti nella vista corrente`
        : `Mostrati ${visible} di ${total} punti nella vista corrente`,
  listEmptyInView:
    "Nessun punto documentato nella vista corrente. Sposta la mappa o rimpicciolisci per esplorare di più.",
  // Popup del segnaposto (t_702c10af): si apre al clic sul marker con le
  // informazioni del record e i link a correzione/dettaglio.
  popupDetail: "Apri il record",
};
