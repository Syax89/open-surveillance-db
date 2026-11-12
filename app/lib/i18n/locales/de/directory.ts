/**
 * directory — DE translation. Parity-checked against the English pilot
 * bundle (../../directory.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../directory";

export const de: Translation<typeof en> = {
  // Page-level chrome (/directory).
  pageTitle: "Öffentliches Verzeichnis",
  pageIntro:
    "Durchsuche, filtere und sortiere die öffentlichen Einträge ohne Karte. Ein Ergebnis ist nie ein Beweis dafür, dass ein Gebiet nicht überwacht wird.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Verzeichnis wird geladen…",
  navigation: "Navigation des Verzeichnisses",
  homeAria: "OpenSurveillanceDB Startseite",
  useMapInstead: "Stattdessen die Karte nutzen",
  // Directory section (extracted from the home page bundle in F1).
  accessibleDirectory: "Barrierefreies Verzeichnis",
  recordsTitle: "Öffentliche Einträge ohne Karte durchsuchen",
  recordsIntro:
    "Die Suche umfasst dieselben öffentlichen Einträge wie die Karte. Ein Ergebnis ist nie ein Beweis dafür, dass ein Gebiet nicht überwacht wird.",
  // Catalog mode (t_127492f1): the sr-only heading of the results region —
  // keeps the h1 → h2 → h3 ladder on /directory now that the place-search
  // block is a collapsible panel instead of the section heading.
  resultsRegion: "Ergebnisse im Verzeichnis",
  searchDirectory: "Öffentliches Verzeichnis durchsuchen",
  searchPlaceholder: "Name, Typ, Adresse oder Ort",
  searchHelp:
    "Die Einträge werden beim Tippen durchsucht; drücke Enter, um rund um einen Ort zu suchen.",
  filters: "Filter",
  // Catalog mode: data export of the filtered set (issue #409). The
  // downloads are generated client-side from the exact visible records, so
  // EVERY active filter applies (search, type, freshness, state, origin)
  // plus the sort order; the hint below says exactly what the export
  // contains.
  exportCsv: "CSV herunterladen",
  exportGeoJson: "GeoJSON herunterladen",
  exportHint: "Exporte enthalten die Einträge, die die aktuelle Suche und die Filter anzeigen.",
  // Catalog mode (CEO 2026-08-08): the small circular [+] in the results
  // header top-right — a direct shortcut to the report form (/segnala).
  reportCamera: "Kamera melden",
  // Catalog mode (t_f13fcb1c): the visible results header, the active-filter
  // chips, the alphabetical index and the pagination bar.
  activeFilters: "Aktive Filter",
  removeFilter: (label: string) => `Filter entfernen: ${label}`,
  // F1 (mobile usability 2026-10-23): the native filter disclosure summary
  // states how many selections are active — the SAME count as the removable
  // chips, so the closed disclosure still tells the truth. Singular/plural;
  // an all-default state renders no count at all.
  filtersActiveOne: "1 aktiver Filter",
  filtersActiveMany: (count: number) => `${count} aktive Filter`,
  // F1: the chip of a non-default order names the ordering ("Order: Most
  // useful") so it is never read as a restrictive filter.
  filterOrder: (label: string) => `Sortierung: ${label}`,
  alphaIndexTitle: "Alphabetischer Index",
  alphaIndexAria: (letter: string) => `Zu Einträgen mit ${letter} springen`,
  showingRecords: (from: number | string, to: number | string, total: number | string) => `${from}–${to} von ${total} Einträgen`,
  pageOf: (page: number | string, pages: number | string) => `Seite ${page} von ${pages}`,
  previousPage: "Vorherige Seite",
  nextPage: "Nächste Seite",
  // Catalog mode: the place-search panel trigger in the results meta row
  // (the panel itself keeps the historical place-search strings).
  searchNearPlace: "In der Nähe eines Orts suchen…",
  placeHide: "Ortssuche ausblenden",
  cameraType: "Kameratyp",
  allTypes: "Alle Typen",
  freshnessFilter: "Aktualität des Eintrags",
  freshnessAll: "Beliebig",
  freshness7d: "Letzte 7 Tage",
  freshness30d: "Letzte 30 Tage",
  freshness90d: "Letzte 90 Tage",
  orderRecords: "Einträge sortieren",
  alphabetical: "Alphabetisch",
  positionOrder: "Position (Süd nach Nord)",
  // Community ranking (ADR 0021 §10, FASE 3 UI): the three server sort
  // options surface usefulness (weighted likes), freshness (last confirm)
  // and confirmation volume. Same frozen vocabulary as the action widget.
  sortUseful: "Am nützlichsten",
  sortRecent: "Zuletzt bestätigt",
  sortConfirmations: "Meiste Bestätigungen",
  // Confirmation-status filter (?state=, FASE 3 UI): a record's "state"
  // in the directory sense is its community confirmation — never
  // hidden/removed, which are excluded from the public list by design
  // (ADR §6.3).
  stateFilter: "Bestätigungsstatus",
  stateAll: "Beliebig",
  stateConfirmed: "Bestätigt",
  stateNever: "Nie bestätigt",
  advancedFilters: "Weitere Filter",
  advancedFiltersActive: (count: number) => `Weitere Filter · ${count} aktiv`,
  // Import-origin filter (?origin=, FASE C, t_4dbce318): where a record
  // comes from — a community report or an imported public dataset.
  originFilter: "Herkunft",
  originAll: "Beliebig",
  originReports: "Community-Meldungen",
  originImported: "Importierte Daten",
  oneRecordFound: "1 öffentlicher Eintrag gefunden",
  recordsFound: "öffentliche Einträge gefunden",
  // M03: the card shows `record.updated` (record update, not a community
  // confirmation) — the label must say so.
  lastUpdated: "Letzte Aktualisierung",
  showOnMap: "Auf Karte zeigen",
  openRecord: "Eintrag öffnen",
  emptyTitle: "Kein veröffentlichter Eintrag passt zu dieser Suche.",
  emptyBody:
    "Das heißt nicht, dass es in diesem Gebiet keine Kameras gibt. Du kannst die Suche zurücksetzen, die Karte erkunden oder mit einem verifizierten Konto eine Meldung einreichen.",
  clearSearch: "Suche zurücksetzen",
  submitObservation: "Meldung einreichen",
  resetFilters: "Filter zurücksetzen",
  offlineTitle: "Du bist offline",
  offlineBody: "Es werden die zuletzt geladenen Einträge angezeigt.",
  offlineAction: "Erneut versuchen",
  distance: "Entfernung",
  placeSearchTitle: "Nach Ort suchen",
  placeSearchLabel: "Ort, Adresse oder Koordinaten",
  placeSearchPlaceholder: "z. B. Stadtmitte, Hauptstraße oder 45.46420, 9.19000",
  placeSearchHelp:
    "Findet öffentliche Einträge in der Nähe des eingegebenen Orts. Ein Ergebnis ist nie ein Beweis dafür, dass ein Gebiet nicht überwacht wird.",
  placeSearchSubmit: "Suchen",
  placeSearchLoading: "Öffentliche Einträge in der Nähe dieses Orts werden gesucht…",
  placeSearchUnavailable: "Die Suche ist vorübergehend nicht verfügbar. Bitte versuche es gleich noch einmal.",
  placeSearchRateLimited: "Zu viele Suchanfragen. Bitte warte einen Moment und versuche es erneut.",
  placeSearchEmptyQuery: "Gib einen Ort, eine Adresse oder Koordinaten ein, um zu suchen.",
  placeClearResults: "Ergebnisse löschen",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Suchgebiet: in der Nähe von ${area.displayName} (im Umkreis von ${area.radiusLabel})`
      : `Suchgebiet: im Umkreis von ${area.radiusLabel} um ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count === 1 ? "öffentlicher Eintrag" : "öffentliche Einträge"} in der Nähe dieses Orts gefunden`,
  placeNotFoundTitle: "Wir konnten diesen Ort nicht finden.",
  placeNotFoundBody: "Prüfe die Schreibweise oder gib stattdessen Koordinaten ein (Breitengrad, Längengrad).",
  placeEmptyTitle: "In diesem Gebiet wurde kein veröffentlichter Eintrag gefunden.",
  placeEmptyBody:
    "Das bedeutet nur, dass kein öffentlicher Eintrag dieser Datenbank im Suchgebiet liegt. Es ist kein Beweis dafür, dass es dort keine Kameras gibt.",
  placeEmptySubmit: "Meldung einreichen",
  placeEmptyCoverage: "Zu den Grenzen der Datenabdeckung",
  // Data actions footer (t_b98b1734, CEO 2026-08-08): the CSV/GeoJSON
  // downloads live here as small text links next to the data policy link
  // (DirectoryTool — exportCsv/exportGeoJson, filter-aware); same row/font.
  readDataPolicy: "Datenrichtlinie lesen",
  recordId: "Eintrags-ID",
  source: "Quelle",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Beispieldaten",
  demoUpdated: "Demodaten",
  location: "Standort",
  unknown: "Unbekannt",
  manufacturerLabel: "Hersteller",
  observedOnLabel: "Beobachtet am",
  // Load failure (kanban t_e11080eb): the walk could not complete — a
  // transient API error (rate limit, network) must NEVER masquerade as "0
  // public records found". The directory shows this truthful error state
  // with a retry action instead of the empty state.
  loadErrorTitle: "Das Verzeichnis konnte nicht geladen werden.",
  loadErrorBody: "Die öffentlichen Einträge sind noch da — es gibt nur ein vorübergehendes Problem beim Laden. Versuche es erneut oder erkunde die Karte.",
  loadErrorRetry: "Erneut versuchen",
};
