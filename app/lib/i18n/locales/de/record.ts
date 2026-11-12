/**
 * record — DE translation. Parity-checked against the English pilot
 * bundle (../../record.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../record";

export const de: Translation<typeof en> = {
  navigation: "Navigation – Eintrag",
  backToDirectory: "← Zurück zum Verzeichnis",
  loading: "Öffentlicher Eintrag wird geladen…",
  publicRecord: "Öffentlicher Eintrag",
  recordId: "Eintrags-ID",
  source: "Quelle",
  // Creation date (FASE C, t_4dbce318): `cameras.created_at` — when the
  // record entered the database (import or community report). The detail
  // page shows it alongside provenance and the last update.
  addedOn: "Hinzugefügt",
  // M03 (design review 2026-10-22, P1): record.updated is the RECORD's last
  // update (import/edits), never a community confirmation. Labelling it
  // "Last confirmation" produced the contradiction "Never confirmed" +
  // "Last confirmation: 8 August 2026" on imported records. Real
  // confirmations keep their own label (lastConfirmed, from lastVerifiedAt).
  lastUpdated: "Letzte Aktualisierung",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Beispieldaten",
  demoUpdated: "Demodaten",
  generalLocation: "Ungefährer Standort",
  manufacturer: "Hersteller",
  observedOn: "Beobachtet am",
  viewOnMap: "Auf der Karte ansehen",
  reportIssue: "Problem melden",
  recordNote:
    "Diese Seite enthält nur aktive öffentliche Einträge oder klar gekennzeichnete Beispieleinträge. Sie bietet keine Live-Bilder und keine betrieblichen Details zu Kameras.",
  unavailable: "Eintrag nicht verfügbar",
  notFound: "Dieser öffentliche Eintrag wurde nicht gefunden.",
  notFoundDetail:
    "Er wurde möglicherweise entfernt, ist nicht öffentlich, oder der Link ist falsch.",
  browseDirectory: "Verzeichnis durchsuchen",
  offlineTitle: "Du bist offline",
  offlineBody: "Es werden die zuletzt geladenen Einträge angezeigt.",
  offlineAction: "Erneut versuchen",
  loadError: "Der öffentliche Eintrag konnte nicht geladen werden.",
  loadErrorDetail:
    "Der Dienst für Einträge ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.",
  retryLoad: "Erneut versuchen",
  statusFallback: "Status",
  changeHistory: "Änderungsverlauf",
  changeHistoryNote:
    "Dieser Verlauf listet nur öffentliche Ereignisse auf. Er enthält niemals Identitäten von Beitragenden oder interne Notizen.",
  changeHistoryFallback: "Eintrag aktualisiert",
  changeHistoryLabels: {
    approve: "Veröffentlicht",
    "mark-stale": "Als nicht mehr vorhanden gemeldet",
    reverify: "Erneut bestätigt",
    hide: "Ausgeblendet",
  },
  // Contribution edit form (/records/[id]/edit, C6). The page keeps its own
  // field labels here (record.ts is the form bundle per SITEMAP) instead of
  // mixing the report bundle: same per-page isolation rule as statusFilters.
  editTitle: "Titel des Eintrags",
  editTitlePlaceholder: "z. B. Öffentliche Sicherheitskamera",
  editKind: "Kameratyp",
  editKindSelect: "Bitte auswählen",
  editKindOptions: {
    fixedDome: "Feste Dome-Kamera",
    bullet: "Bullet-Kamera",
    ptz: "PTZ",
    trafficReader: "Verkehrs- / Kennzeichenerfassung",
    otherUnknown: "Sonstige / unbekannt",
  },
  editManufacturer: "Hersteller (optional)",
  editManufacturerPlaceholder: "z. B. Name des Herstellers",
  editObservedOn: "Beobachtungsdatum (optional)",
  editAddress: "Ungefähre Adresse (optional)",
  editAddressPlaceholder: "Straße und Ort",
  editAddressResolving: "Adresse wird ermittelt…",
  editNotes: "Was hast du beobachtet?",
  editNotesPlaceholder: "Ausrichtung, Betreiber, sichtbarer Hinweis, Modell…",
  editDescription: "Beschreibung (optional)",
  editDescriptionPlaceholder: "Zusätzlicher Kontext zum Eintrag…",
  editBlockedRemovedTitle: "Dieser Eintrag kann nicht mehr bearbeitet werden",
  editTitleRequired: "Der Titel des Eintrags ist erforderlich.",
  editFieldTooLong: (limit: number) =>
    `Dieses Feld darf höchstens ${limit} Zeichen lang sein.`,
  editObservedOnInvalid: "Gib ein gültiges Datum ein (JJJJ-MM-TT).",
  // Field-of-view direction (t_f8b775ec) — edit form, same pattern as the
  // report form: only for directional kinds, compass slider + "don't know".
  editDirectionTitle: "Richtung des Sichtfelds",
  editDirectionHelp: "Die Kompassrichtung, in die die Kamera zeigt, im Uhrzeigersinn ab Norden (0–359°).",
  editDirectionUnknown: "Ich kenne die Richtung nicht",
  editDirectionDegrees: "Richtung",
  // Camera position (t_775c8400): the interactive map moves the record's
  // position — click the map or type the coordinates; directional kinds
  // with a known bearing draw the field-of-view cone (same geometry as the
  // report mini-map and /mappa).
  editPositionTitle: "Position der Kamera",
  editPositionHelp:
    "Klicke auf die Karte, um die Position der Kamera zu verschieben, oder gib die Koordinaten unten ein. Ziehe bei gerichteten Kameras den runden Griff am Kegel, um die Blickrichtung festzulegen.",
  editPositionMapAria: "Karte – klicke, um die Position der Kamera zu verschieben",
  editLatitude: "Breitengrad",
  editLongitude: "Längengrad",
  editPositionInvalid: "Gib gültige Koordinaten ein (Breitengrad −90 bis 90, Längengrad −180 bis 180).",
  // Record detail fact (t_f8b775ec): "Direction: NE 45°" when the record
  // has a stored bearing (domes and unknown directions omit the row).
  direction: "Richtung",
  // Mini map on the record page (CEO 2026-08-07): a read-only Leaflet
  // display of the camera position and its field-of-view cone/circle —
  // decorative (role="img"), the same facts are textual in the list.
  positionOnMap: "Position auf der Karte",

  // --- Community status badge (ADR 0021 §9, FASE 3 UI): informational
  // freshness line — never a state change. A record with no confirmations
  // shows the neutral "never confirmed" badge; a confirmed one shows the
  // count and the last-confirmed date.
  communityStatus: "Community-Status",
  neverConfirmed: "Nie bestätigt",
  confirmedTimes: (count: number) =>
    count === 1 ? "Einmal bestätigt" : `${count}-mal bestätigt`,
  lastConfirmed: "Zuletzt bestätigt",
  // Import provenance (import pipeline FASE C, t_4dbce318): imported
  // records carry a provenance line next to the community badge — the
  // source dataset (linked) and its licence (linked), never the raw
  // "import:<slug>" internal value.
  importedFrom: "Importiert aus",
  // M05 (design review 2026-10-22): the provenance line above already names
  // the dataset and links its licence, so the facts row states the ORIGIN
  // instead of repeating the full source name a second time.
  importedData: "Importierte Daten",

  // --- Hidden/removed banner (ADR 0021 §6.3, FASE 3 UI): a withdrawn
  // record stays reachable by direct link with an explicit banner; the
  // reversal signals (confirm / gone) stay open, and the public history
  // link is the transparency control.
  hiddenTitle: "Eintrag ausgeblendet",
  hiddenBody:
    "Dieser Eintrag wurde bis zur Überprüfung durch die Community oder aus rechtlichen Gründen zurückgezogen. Er erscheint weder im Verzeichnis noch auf der Karte; du kannst aber weiterhin seine öffentliche Historie lesen und mitmachen.",
  removedTitle: "Als nicht mehr vorhanden gemeldet",
  removedBody:
    "Die Community hat gemeldet, dass diese Kamera nicht mehr da ist. Der Eintrag erscheint weder im Verzeichnis noch auf der Karte; du kannst aber weiterhin seine öffentliche Historie lesen und ihn bestätigen, falls die Kamera wieder da ist.",
  bannerHistoryLink: "Öffentliche Historie ansehen",
  bannerNote: "Die Signale zur Rücknahme (bestätigen, nicht mehr da) bleiben für diesen Eintrag offen.",

  // --- Public per-record event timeline (ADR 0021 §7, FASE 3 UI): the
  // unattributed aggregate history. Labels cover every semantic event type
  // the API can emit; anything unknown falls back to the neutral fallback.
  timeline: "Öffentliche Historie",
  timelineNote:
    "Nur aggregierte öffentliche Ereignisse – niemals Identitäten von Beitragenden, E-Mail-Adressen oder interne Notizen.",
  timelineEmpty: "Noch keine öffentlichen Ereignisse.",
  timelineFallback: "Eintrag aktualisiert",
  timelineLabels: {
    published: "Veröffentlicht",
    confirmed: "Als vorhanden bestätigt",
    liked: "Als nützlich markiert",
    "gone-flagged": "Als nicht mehr vorhanden gemeldet",
    hidden: "Ausgeblendet",
    removed: "Entfernt",
    restored: "Im Verzeichnis wiederhergestellt",
    "action-consumed": "Auslösende Aktionen zurückgesetzt",
    migration: "Historie migriert",
    "setting-changed": "Einstellungen geändert",
  },
  hideReasons: {
    problem: "Grund: gemeldet",
    privacy: "Grund: Datenschutz",
    adminLegal: "Grund: rechtlicher Notfall",
  },
  eventPeople: (count: number) => `${count} ${count === 1 ? "Person" : "Personen"}`,
};
