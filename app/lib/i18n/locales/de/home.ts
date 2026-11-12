/**
 * home — DE translation. Parity-checked against the English pilot
 * bundle (../../home.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../home";

export const de: Translation<typeof en> = {
  mainNavigation: "Hauptnavigation",
  homeAria: "OpenSurveillanceDB Startseite",
  pageTitle: "Offene Datenbank öffentlicher Überwachungsinfrastruktur",
  pageDescription:
    "OpenSurveillanceDB ist eine zivilgesellschaftliche, nicht-kommerzielle Datenbank sichtbarer öffentlicher Überwachungsinfrastruktur: mit Quellen belegt, von der Community gepflegt und datenschutzorientiert.",
  // QA#2 F1 (axe serious): the scrollable legal tables (/privacy data
  // table) become a focusable region when they overflow — the aria-label
  // tells keyboard users why the region is in the tab order and how to
  // scroll it.
  tableScrollAria: "Tabelle – horizontal scrollen für weitere Spalten",
  menu: "Menü",
  exploreMap: "Karte erkunden",
  browseRecords: "Einträge durchsuchen",
  howItWorks: "So funktioniert’s",
  rules: "Regeln",
  manifesto: "Manifest",
  addCamera: "Kamera hinzufügen",
  contribuisci: "Unterstützen",
  openDatabase: "Offene Datenbank · von der Community gepflegt",
  heroTitle: "Öffentliche Daten über öffentliche Überwachung.",
  heroIntro:
    "OpenSurveillanceDB kartiert sichtbare Überwachungsinfrastruktur im öffentlichen Raum. Die Daten sind offen und werden von der Community zusammengetragen: Menschen tragen bei, was sie beobachten, damit alle die Systeme um sich herum verstehen können.",
  exploreTheMap: "Karte erkunden",
  reportCta: "Kamera melden",
  searchDirectory: "Verzeichnis durchsuchen",
  searchDirectoryPlaceholder: "Nach Name, Typ oder Adresse suchen",
  // Hero address autocomplete (issue #439): the hero search field is
  // progressively enhanced with the shared PlaceAutocomplete primitive.
  // The copy is home-scoped — the /segnala address search keeps its own
  // report-bundle wording.
  // Hero search-as-you-type (2026-11): record suggestions from our own
  // data only; the place lookup (OpenStreetMap) runs only when the last
  // item is chosen, then a chosen place opens the map there.
  suggestLabel: "Vorschläge",
  suggestCount: (count: number) => (count === 1 ? "1 Vorschlag verfügbar" : `${count} Vorschläge verfügbar`),
  suggestCoordinates: (text: string) => `Koordinaten ${text} auf der Karte zeigen`,
  suggestRecordNumber: (id: number) => `Eintrag #${id} öffnen`,
  suggestPlace: (query: string) => `Ort „${query}“ suchen (OpenStreetMap)`,
  searchPlaceLabel: "Ortsvorschläge",
  searchPlaceNoResults: (query: string) => `Keine Ergebnisse für „${query}“`,
  searchPlaceUnavailable: "Die Ortssuche ist vorübergehend nicht verfügbar.",
  searchPlaceRateLimited: (seconds: number) => `Die Ortssuche hat ihr kurzfristiges Anfragelimit erreicht. Versuch es in etwa ${seconds} Sekunden erneut.`,
  searchPlaceAttribution: "Orte © OpenStreetMap-Mitwirkende",
  searchDirectoryHelp:
    "Während du tippst, kommen die Vorschläge nur aus unseren eigenen Einträgen. Enter durchsucht das Verzeichnis; ein Ort wird nur bei OpenStreetMap gesucht, wenn du „Ort suchen“ wählst.",
  statsLabel: "Statistiken der Datenbank",
  publicRecords: "öffentliche Einträge",
  browseFreely: "Kein Konto",
  browseFreelyDetail: "zum Stöbern nötig",
  openData: "Offene Daten",
  openDataDetail: "frei weiterverwendbar",
  trustNote: "Jeder veröffentlichte Eintrag zeigt seine Quelle, seinen Status und einen Weg zur Korrektur.",
  sourcesLink: "Quellen und Methodik ansehen",
  visualLabelFirst: "Öffentlichen Raum kartieren",
  visualLabelSecond: "mit öffentlichem Wissen",
  // MapTeaser (static preview, CTA → /mappa). Zero Leaflet on the hub.
  teaserEyebrow: "Die Karte",
  teaserTitle: "Erkunde die interaktive Karte",
  teaserBody: "Stöbere in der Vollbildkarte – mit Filtern, Exporten und einem per Tastatur bedienbaren Verzeichnis.",
  teaserCta: "Karte öffnen",
  // Four tool cards (grid 2×2 desktop / 1×4 mobile).
  toolsTitle: "Was du tun kannst",
  toolMapTitle: "Karte",
  toolMapBody: "Sieh alle dokumentierten Kameras auf einen Blick.",
  toolDirectoryTitle: "Verzeichnis",
  toolDirectoryBody: "Durchsuche öffentliche Einträge ohne Karte.",
  toolReportTitle: "Kamera melden",
  toolReportBody: "Veröffentliche eine neu beobachtete Kamera sofort.",
  toolCorrectionTitle: "Eintrag korrigieren",
  toolCorrectionBody: "Korrigiere oder aktualisiere einen veröffentlichten Eintrag.",
  civicCommons: "Ein ziviles Daten-Gemeingut",
  principlesTitle: "Sichtbarkeit ohne Überwachung.",
  principlesIntro:
    "Wir dokumentieren öffentliche Infrastruktur, niemals Kamerabilder. Jeder veröffentlichte Eintrag hat eine Quelle, einen Status und eine Möglichkeit zur Korrektur.",
  openDefault: "Standardmäßig offen",
  openDefaultBody:
    "Herunterladbare Daten mit sichtbarer Herkunft für Journalismus, Forschung und zivilgesellschaftliche Nutzung.",
  privacyFirst: "Datenschutz zuerst",
  privacyFirstBody:
    "Gesichter, Kennzeichen und persönliche Informationen müssen vor der Veröffentlichung entfernt werden.",
  communityVerified: "Von der Community geprüft",
  communityVerifiedBody:
    "Meldungen werden sofort veröffentlicht, und die Community hält sie aktuell: Bestätige, was noch da ist, melde, was verschwunden ist, markiere, was nützlich ist.",
  manifestoLink: "Manifest lesen",
};
