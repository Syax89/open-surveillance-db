/**
 * map — DE translation. Parity-checked against the English pilot
 * bundle (../../map.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../map";

export const de: Translation<typeof en> = {
  mapLabel: "Interaktive OpenStreetMap-Karte",
  mapDescription:
    "Die Karte zeigt dieselben öffentlichen Einträge wie das barrierefreie Verzeichnis unten. Über das Verzeichnis kannst du Einträge auch ohne Karte suchen, filtern und öffnen.",
  mapDirectoryLink: "Zum barrierefreien Verzeichnis",
  mapFallbackTitle: "Die interaktive Karte ist nicht verfügbar.",
  mapFallbackBody:
    "Du kannst trotzdem jeden öffentlichen Eintrag im barrierefreien Verzeichnis suchen, filtern und öffnen – es funktioniert ohne Karte.",
  // Page-level chrome (/mappa).
  pageTitle: "Interaktive Karte",
  pageIntro:
    "Entdecke dokumentierte öffentliche Kameras auf der Karte. Mit den Filtern grenzt du die Ansicht ein; jede Markierung öffnet ihren öffentlichen Eintrag. Ein leeres Gebiet beweist nie, dass dort keine Kameras sind.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Karte wird geladen…",
  // Map tool chrome (t_966254a1, t_11e38eab): no visible tool header — the
  // page starts directly with the map card. The h1 (pageTitle) stays in the
  // DOM as sr-only for a11y; the old "Explore documented cameras" section
  // heading, its coverage note and the "Live prototype" eyebrow were removed
  // with the duplicated header; pageIntro still covers the "an empty area
  // never proves absence" truthfulness contract (SSR metadata + a11y intro).
  // The prototype banner itself was removed (CEO feedback 2026-08-02) — the
  // map is no longer framed as a prototype.
  mapLegendTitle: "So nutzt du die Karte",
  mapLegendMove: "Ziehe die Karte oder nutze + und −, um ein Gebiet zu erkunden.",
  mapLegendMarker: "Wähle eine Markierung, um den öffentlichen Eintrag zu öffnen.",
  mapLegendFilters: "Verfeinere die Ergebnisse mit Suche und Filtern über der Karte.",
  mapLegendList: "Öffne die Seitenleiste, um die Punkte im aktuellen Ausschnitt durchzusehen.",
  mapLegendAdd: "Klicke auf eine leere Stelle der Karte, um dort eine Kamera zu melden.",
  // Field-of-view legend entry (usability Batch C2, P1#6): the shaded wedge/
  // circle drawn around directional cameras (lib/field-of-view) carries the
  // SAME fact the marker popup already states as "Field of view: NE 45°"
  // (fovDirection) — surfacing it here lets a sighted user learn what the
  // shape means without opening a popup first.
  mapLegendFov: "Ein schattierter Kegel oder Kreis um eine Markierung zeigt das ungefähre Sichtfeld der Kamera.",
  // Grid-aggregation badge legend entry (usability Batch C2, P1#7): at low
  // zoom the numbered .osm-grid-badge replaces individual markers. The badge
  // itself already names its count (gridBadgeLabel/Tooltip/Zoom), but nothing
  // told the user that zooming in splits one badge into separate cameras.
  mapLegendGridBadge: "Ein Kreis mit Zahl fasst auf dieser Zoomstufe mehrere Kameras zusammen — zoome hinein, um sie einzeln zu sehen.",
  mapLegendReport: "Kamera melden",
  // Always-visible hint under the map (one line): the empty-click shortcut is
  // otherwise explained ONLY inside the collapsed-by-default .map-legend, so
  // a sighted user could miss it entirely. Deliberately SHORTER than
  // mapLegendAdd — a hint, not the full legend entry.
  mapClickHint: "Klicke auf eine leere Stelle, um dort eine Kamera zu melden.",
  // Shareable viewport (?lat&lng&zoom): the "Copy link" toolbar button copies
  // the current URL (which carries the map's view) and confirms briefly.
  copyLink: "Link kopieren",
  copyLinkCopied: "Kopiert!",
  pickTitle: "Neue Meldung",
  pickCoordinates: "Koordinaten",
  pickReportHere: "Hier eine Kamera melden",
  recordId: "Eintrags-ID",
  source: "Quelle",
  freshness: "Aktualität",
  location: "Standort",
  reportIssue: "Problem melden",
  loadingRecords: "Öffentliche Einträge werden geladen…",
  unknown: "Unbekannt",
  apiUnavailable:
    "Die öffentliche API ist vorübergehend nicht erreichbar; bereits geladene Punkte bleiben verfügbar.",
  apiRateLimited: (seconds: number) =>
    `Die Karte pausiert neue Datenanfragen vorübergehend, um das Limit des Dienstes einzuhalten. Neuer Versuch in etwa ${seconds} Sekunden; bereits geladene Punkte bleiben verfügbar.`,
  // Continental viewport: the API answers a decimated sample (one request).
  viewportDecimated:
    "Diese Ansicht zeigt eine Auswahl der Kameras im Gebiet. Zoome hinein, um alle Details zu laden.",
  // Truthful empty state (never a silent map).
  emptyTitle: "Kein veröffentlichter Eintrag passt zu diesen Filtern.",
  emptyBody:
    "Das heißt nicht, dass es in diesem Gebiet keine Kameras gibt. Du kannst die Filter zurücksetzen, das Verzeichnis durchsuchen oder eine Kamera melden, die du vom öffentlichen Raum aus gesehen hast.",
  clearSearch: "Filter zurücksetzen",
  offlineTitle: "Du bist offline",
  offlineBody: "Es werden die zuletzt geladenen Einträge angezeigt.",
  offlineAction: "Erneut versuchen",
  // Map place search (privacy pass 2026-11): ONE purpose — find a place,
  // an address, coordinates or a record number. Nothing is sent while
  // typing; Enter (or the button) searches. Coordinates and "#123" are
  // resolved in the browser; only real place names reach our geocoder proxy.
  // Typing no longer filters the points (the directory search does that).
  listSearchLabel: "Ort finden",
  listSearchPlaceholder: "Ort, Adresse, Koordinaten oder #Eintrag",
  listSearchHelp:
    "Gib einen Ort, eine Adresse, Koordinaten wie 41.9068, 12.4808 oder eine Eintragsnummer wie #6302 ein und drücke Enter. Ergebnisse im aktuellen Kartenausschnitt stehen oben.",
  listSearchButton: "Suchen",
  // Visible caption under the field: the privacy promise, in plain words.
  listSearchCaption:
    "Während du tippst, wird nichts gesendet. Koordinaten und #Eintragsnummern verlassen deinen Browser nie.",
  // Geocode autocomplete dropdown (t_b9666d09): the listbox under the
  // sidebar search field. Attribution is required by the ODbL for
  // Nominatim-derived place data (see docs/OSM_INTEGRATION.md §8).
  geocodeLabel: "Ortsvorschläge",
  geocodeNoResults: (query: string) => `Keine Ergebnisse für „${query}“`,
  geocodeAttribution: "Orte © OpenStreetMap-Mitwirkende",
  geocodeUnavailable: "Die Ortssuche ist vorübergehend nicht verfügbar.",
  geocodeRateLimited: (seconds: number) =>
    `Die Ortssuche hat ihr kurzfristiges Anfragelimit erreicht. Versuche es in etwa ${seconds} Sekunden erneut; Koordinaten und #Eintragsnummern funktionieren weiterhin.`,
  listTitle: "Punkte im aktuellen Ausschnitt",
  // Points disclosure row (mobile, ID 2): the WHOLE header row is ONE button
  // carrying ONE compact label — the verb plus the current in-view count. The
  // zero/one/many wording is spelled here (dictionary function, never a
  // concatenation in the component), so a 320px row stays one short line.
  listShowCount: (count: number) => (count === 1 ? "1 Punkt anzeigen" : `${count} Punkte anzeigen`),
  listHideCount: (count: number) => (count === 1 ? "1 Punkt ausblenden" : `${count} Punkte ausblenden`),
  listMapSyncHelp: "Die Liste aktualisiert sich, wenn du die Karte verschiebst oder zoomst: Hineinzoomen grenzt sie ein, Herauszoomen erweitert sie.",
  listCount: (visible: number, total: number) =>
    visible === 0
      ? "Keine Punkte im aktuellen Ausschnitt"
      : visible === 1
        ? "Der einzige Punkt im aktuellen Ausschnitt"
        : visible === total
          ? `Alle ${visible} Punkte im aktuellen Ausschnitt`
          : `${visible} von ${total} Punkten im aktuellen Ausschnitt`,
  // Capped points list (perf): the list renders one page at a time; the
  // button appends the next page and a polite live region reports the
  // listed count. The heading count above always reports the full total.
  listShowMore: (next: number, remaining: number) =>
    next === remaining
      ? (remaining === 1 ? "Letzten Punkt anzeigen" : `Letzte ${remaining} Punkte anzeigen`)
      : `${next} weitere Punkte anzeigen (${remaining} noch nicht gelistet)`,
  listShownOf: (shown: number, total: number) => `${shown} von ${total} Punkten im aktuellen Ausschnitt gelistet`,
  listEmptyInView:
    "Keine dokumentierten Punkte im aktuellen Ausschnitt. Verschiebe die Karte oder zoome heraus, um mehr zu entdecken.",
  // Marker popup (t_702c10af): opens on marker click with the record info
  // and its correction/detail links.
  popupDetail: "Eintrag öffnen",
  // Field-of-view direction row in the marker popup (t_f8b775ec): the
  // textual, accessible equivalent of the decorative map cone.
  fovDirection: "Sichtfeld",
  // Import provenance line in the marker popup (FASE C, t_4dbce318):
  // small secondary text at the bottom — the readable source (entity or
  // "Community report") with its licence, and the record's added date.
  popupAdded: "Hinzugefügt",
  popupCommunityReport: "Community-Meldung",
  // Pixel-grid aggregation badges (t_26ce96f3, CEO 2026-08-05): at low zoom
  // / high density the map renders one count badge per 48px screen cell
  // instead of thousands of DOM markers. The badge is a button with a
  // count; clicking it zooms in toward the cell centroid. The tooltip and
  // the aria-label carry the same message (the count is the badge text).
  gridBadgeLabel: (count: number) => `${count} Kameras in diesem Gebiet — zoome hinein, um sie zu sehen`,
  gridBadgeTooltip: (count: number) => `${count} Kameras hier`,
  gridBadgeZoom: (count: number) => `${count} Kameras — zoome hinein, um sie einzeln zu sehen`,
  // Geolocation button (t_18259daa, CEO): a floating control stacked ABOVE
  // the zoom buttons shows the user's own position on the map. Everything
  // stays client-side — the position never leaves the browser (privacy by
  // design). aria-pressed carries the on/off state; the marker is a
  // precision dot + accuracy circle, never a camera marker.
  geolocateLabel: "Meinen Standort anzeigen",
  geolocateDenied: "Der Standortzugriff wurde verweigert. Erlaube den Standortzugriff und versuche es erneut.",
  geolocateError: "Dein Standort konnte nicht ermittelt werden. Versuche es erneut.",
};
