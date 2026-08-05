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
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Loading the map…",
  // Map tool chrome (t_966254a1, t_11e38eab): no visible tool header — the
  // page starts directly with the map card. The h1 (pageTitle) stays in the
  // DOM as sr-only for a11y; the old "Explore documented cameras" section
  // heading, its coverage note and the "Live prototype" eyebrow were removed
  // with the duplicated header; pageIntro still covers the "an empty area
  // never proves absence" truthfulness contract (SSR metadata + a11y intro).
  // The prototype banner itself was removed (CEO feedback 2026-08-02) — the
  // map is no longer framed as a prototype.
  mapHint: "Use “Add here” to place a report at a precise position",
  // Explicit "Add here" mode (popup lifecycle t_33b82720): base map
  // navigation is SILENT — the coordinate picker opens only while this
  // accessible toggle is active.
  mapAddModeLabel: "Add a report on the map",
  mapAddHere: "Add here",
  mapAddModeStop: "Stop adding",
  mapAddHint: "Click the map to place a new report at that position",
  // Map-click report picker (t_6abb96ac): clicking empty map space opens a
  // popup with the click coordinates and a direct link to the /segnala
  // form, pre-filled with that position.
  pickTitle: "New report",
  pickCoordinates: "Coordinates",
  pickReportHere: "Report a camera here",
  recordId: "Record ID",
  source: "Source",
  freshness: "Freshness",
  location: "Location",
  reportIssue: "Report an issue",
  loadingRecords: "Loading the public record API…",
  unknown: "Unknown",
  apiUnavailable:
    "The public API is temporarily unreachable, so the map is showing illustrative records.",
  // Truthful empty state (never a silent map).
  emptyTitle: "No published record matches those filters.",
  emptyBody:
    "This does not mean that there are no cameras in the area. You can reset the filters, browse the directory, or submit a private observation for moderation.",
  clearSearch: "Clear filters",
  offlineTitle: "You are offline",
  offlineBody: "Showing the last loaded records.",
  offlineAction: "Try again",
  // Viewport-synced sidebar list (/mappa redesign, t_702c10af): the left
  // column shows only the points inside the current map view. The search
  // field is DUAL-FUNCTION (t_b9666d09): it filters those points by
  // title/address/type as before AND, while typing, suggests places through
  // the same-origin Nominatim geocoder (/api/geocode) in a dropdown below
  // the field. Selecting a suggestion pans the map to the place; the list
  // then follows the new viewport.
  listSearchLabel: "Filter the points in the current view or search a place",
  listSearchPlaceholder: "Search a place or filter the points in view",
  listSearchHelp:
    "The list shows only the points inside the current map view. Searching filters those points by title, address or type and suggests matching places from OpenStreetMap below the field; picking a place moves the map there.",
  // Geocode autocomplete dropdown (t_b9666d09): the listbox under the
  // sidebar search field. Attribution is required by the ODbL for
  // Nominatim-derived place data (see docs/OSM_INTEGRATION.md §8).
  geocodeLabel: "Place suggestions",
  geocodeNoResults: (query: string) => `No results for “${query}”`,
  geocodeAttribution: "Places © OpenStreetMap contributors",
  geocodeUnavailable: "Place search is temporarily unavailable.",
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
  // Field-of-view direction row in the marker popup (t_f8b775ec): the
  // textual, accessible equivalent of the decorative map cone.
  fovDirection: "Field of view",
  // Import provenance line in the marker popup (FASE C, t_4dbce318):
  // small secondary text at the bottom — the readable source (entity or
  // "Community report") with its licence, and the record's added date.
  popupAdded: "Added",
  popupCommunityReport: "Community report",
  // Pixel-grid aggregation badges (t_26ce96f3, CEO 2026-08-05): at low zoom
  // / high density the map renders one count badge per 48px screen cell
  // instead of thousands of DOM markers. The badge is a button with a
  // count; clicking it zooms in toward the cell centroid. The tooltip and
  // the aria-label carry the same message (the count is the badge text).
  gridBadgeLabel: (count: number) => `${count} cameras in this area — zoom in to see them`,
  gridBadgeTooltip: (count: number) => `${count} cameras here`,
  gridBadgeZoom: (count: number) => `${count} cameras — zoom in to see them individually`,
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
  // F2 (QA#6): fallback SSR Suspense per il corpo tool client.
  loading: "Caricamento della mappa…",
  // Chrome del tool mappa (t_966254a1, t_11e38eab): nessun header visibile —
  // la pagina parte direttamente con la card della mappa. L'h1 (pageTitle)
  // resta nel DOM come sr-only per a11y; il vecchio heading di sezione
  // "Esplora le telecamere documentate", la sua nota di copertura e l'eyebrow
  // "Prototipo attivo" sono stati rimossi con l'header duplicato; pageIntro
  // copre ancora il contratto di veridicità "un'area vuota non dimostra
  // l'assenza di telecamere" (metadata SSR + intro a11y). Il banner di
  // prototipo è stato rimosso (feedback CEO 2026-08-02) — la mappa non è più
  // presentata come prototipo.
  mapHint: "Usa “Aggiungi qui” per posizionare una segnalazione in un punto preciso",
  // Modalità esplicita "Aggiungi qui" (popup lifecycle t_33b82720): la
  // navigazione base della mappa è SILENZIOSA — il selettore delle
  // coordinate si apre solo mentre questo toggle accessibile è attivo.
  mapAddModeLabel: "Aggiungi una segnalazione sulla mappa",
  mapAddHere: "Aggiungi qui",
  mapAddModeStop: "Ferma l'aggiunta",
  mapAddHint: "Clicca sulla mappa per posizionare una nuova segnalazione in quel punto",
  // Selettore segnalazione al clic sulla mappa (t_6abb96ac): cliccando uno
  // spazio vuoto della mappa si apre un popup con le coordinate del clic e
  // un link diretto al modulo /segnala, precompilato con quella posizione.
  pickTitle: "Nuova segnalazione",
  pickCoordinates: "Coordinate",
  pickReportHere: "Segnala una telecamera qui",
  recordId: "ID record",
  source: "Fonte",
  freshness: "Aggiornamento",
  location: "Posizione",
  reportIssue: "Segnala un problema",
  loadingRecords: "Caricamento dell'API dei record pubblici…",
  unknown: "Sconosciuto",
  apiUnavailable:
    "L'API pubblica è temporaneamente non raggiungibile: la mappa mostra record illustrativi.",
  // Stato vuoto truthful (mai una mappa muta).
  emptyTitle: "Nessun record pubblicato corrisponde a questi filtri.",
  emptyBody:
    "Questo non significa che nell'area non ci siano telecamere. Puoi azzerare i filtri, sfogliare l'elenco o inviare un'osservazione privata per la moderazione.",
  clearSearch: "Azzera i filtri",
  offlineTitle: "Sei offline",
  offlineBody: "Mostriamo gli ultimi record caricati.",
  offlineAction: "Riprova",
  // Elenco laterale sincronizzato col viewport (redesign /mappa, t_702c10af):
  // la colonna sinistra mostra solo i punti dentro la vista corrente. Il
  // campo di ricerca è DOPPIA FUNZIONE (t_b9666d09): filtra quei punti per
  // titolo, indirizzo o tipo come prima E, mentre si digita, suggerisce
  // luoghi tramite il geocoder Nominatim same-origin (/api/geocode) in un
  // menu a tendina sotto il campo. Selezionando un suggerimento la mappa si
  // sposta sul luogo; l'elenco segue poi la nuova vista.
  listSearchLabel: "Filtra i punti nella vista corrente o cerca un luogo",
  listSearchPlaceholder: "Cerca un luogo o filtra i punti in vista",
  listSearchHelp:
    "L'elenco mostra solo i punti dentro la vista corrente della mappa. La ricerca filtra quei punti per titolo, indirizzo o tipo e suggerisce luoghi corrispondenti da OpenStreetMap sotto il campo; scegliendo un luogo la mappa si sposta lì.",
  // Menu a tendina del geocoding (t_b9666d09): la listbox sotto il campo di
  // ricerca della sidebar. L'attribuzione è richiesta da ODbL per i dati dei
  // luoghi derivati da Nominatim (vedi docs/OSM_INTEGRATION.md §8).
  geocodeLabel: "Suggerimenti di luoghi",
  geocodeNoResults: (query: string) => `Nessun risultato per “${query}”`,
  geocodeAttribution: "Luoghi © OpenStreetMap contributors",
  geocodeUnavailable: "La ricerca dei luoghi non è al momento disponibile.",
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
  // Riga della direzione del campo visivo nel popup (t_f8b775ec): l'equivalente
  // testuale e accessibile del cono decorativo sulla mappa.
  fovDirection: "Campo visivo",
  // Riga di provenienza import nel popup del segnaposto (FASE C,
  // t_4dbce318): piccolo testo secondario in basso — la fonte leggibile
  // (ente o "Segnalazione della community") con la sua licenza, e la data
  // di aggiunta del record.
  popupAdded: "Aggiunta",
  popupCommunityReport: "Segnalazione della community",
  // Badge di aggregazione a griglia (t_26ce96f3, CEO 2026-08-05): a zoom
  // basso / densità alta la mappa mostra un badge con conteggio per cella
  // di 48px invece di migliaia di marker DOM. Il badge è un pulsante con
  // conteggio; cliccandolo si ingrandisce verso il centro della cella.
  gridBadgeLabel: (count: number) => `${count} telecamere in quest'area — ingrandisci per vederle`,
  gridBadgeTooltip: (count: number) => `${count} telecamere qui`,
  gridBadgeZoom: (count: number) => `${count} telecamere — ingrandisci per vederle singolarmente`,
};
