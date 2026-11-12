/**
 * report — DE translation. Parity-checked against the English pilot
 * bundle (../../report.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../report";

export const de: Translation<typeof en> = {
  // Page-level chrome (/segnala).
  pageTitle: "Kamera melden",
  pageIntro:
    "Wähle einen Standort auf der Karte oder gib Koordinaten ein und füge dann nur hinzu, was du vom öffentlichen Raum aus beobachten kannst. Deine Meldung wird sofort veröffentlicht.",
  navigation: "Navigation – Meldung",
  homeAria: "OpenSurveillanceDB Startseite",
  // Report section (extracted from the home page bundle in F1).
  contribute: "Mitmachen",
  reportTitle: "Hilf mit, den öffentlichen Raum lesbar zu machen.",
  reportIntro:
    "Wähle einen Standort auf der Karte oder gib Koordinaten ein und füge dann nur hinzu, was du vom öffentlichen Raum aus beobachten kannst. Deine Meldung wird sofort veröffentlicht.",
  beforeSubmitting: "Vor dem Absenden",
  beforeSubmittingBody:
    "Beschreibe keine Personen, Kennzeichen, Privathäuser, Sicherheitslücken oder sensiblen Orte.",
  stepLocation: "1. Standort",
  stepObservation: "2. Was du beobachtet hast",
  stepEvidence: "3. Bestätigen und veröffentlichen",
  selectedPoint: "Gewählter Punkt",
  // Report mini-map (t_ebbe0ea3): click to pick the position, drag the
  // cone's rotation handle to aim the field of view. The manual coordinate
  // fields below stay as the accessible fallback.
  mapAria: "Karte – klicke, um die Position der Kamera zu wählen",
  mapHelp:
    "Klicke auf die Karte, um die Position der Kamera zu wählen. Ziehe bei gerichteten Kameras den runden Griff am Kegel, um die Blickrichtung festzulegen.",
  manualCoordinatesTitle: "Oder Koordinaten eingeben",
  manualCoordinatesHelp:
    "Verwende Dezimalgrad. Der Breitengrad muss zwischen -90 und 90 liegen, der Längengrad zwischen -180 und 180. Ein Komma wird als Dezimaltrennzeichen akzeptiert.",
  latitude: "Breitengrad",
  longitude: "Längengrad",
  useCoordinates: "Diese Koordinaten verwenden",
  // One-tap geolocation (CEO 2026-08-09): the primary way to set a position
  // on a phone, standing in front of the camera. The map and the manual
  // fields stay as the alternatives when the device or the user says no.
  useMyPosition: "Meinen Standort verwenden",
  locatingPosition: "Dein Standort wird ermittelt…",
  // Address search with autocomplete (issue #432): the /segnala location
  // row pairs a debounced place search (same-origin /api/geocode proxy)
  // with the one-tap geolocation button on its right.
  addressSearchLabel: "Adresse suchen",
  addressSearchPlaceholder: "Straße, Ort oder Koordinaten…",
  addressSearchHelp:
    "Gib eine Straße, einen Platz oder Ort ein oder füge Koordinaten ein (z. B. 41.9068, 12.4808) und drücke dann die Eingabetaste oder „Suchen“. Während du tippst, wird nichts gesendet.",
  addressSearchButton: "Suchen",
  addressSearchNoResults: (query: string) => `Keine Orte gefunden für „${query}“.`,
  addressSearchRateLimited: (seconds: number) =>
    `Zu viele Suchanfragen. Versuche es in ${seconds} Sekunde${seconds === 1 ? "" : "n"} noch einmal.`,
  addressSearchUnavailable: "Die Adresssuche ist gerade nicht verfügbar.",
  addressSearchAttribution: "Orte © OpenStreetMap-Mitwirkende",
  geolocationDenied:
    "Die Standortberechtigung wurde verweigert. Wähle den Punkt auf der Karte oder gib die Koordinaten unten ein.",
  geolocationTimeout:
    "Die Ermittlung deines Standorts hat zu lange gedauert. Versuche es noch einmal, wähle den Punkt auf der Karte oder gib die Koordinaten unten ein.",
  geolocationUnavailable:
    "Dein Gerät konnte keinen Standort liefern. Wähle den Punkt auf der Karte oder gib die Koordinaten unten ein.",
  checkingNearby: "Öffentliche Einträge in der Nähe werden geprüft…",
  possibleDuplicate: "Mögliches Duplikat in der Nähe",
  duplicateBody:
    "Diese öffentlichen Einträge liegen innerhalb von 75 Metern. Du kannst trotzdem eine neue Meldung einreichen; sie wird sofort veröffentlicht.",
  metresAway: "m entfernt",
  matchVeryClose: "sehr ähnlicher Treffer",
  matchLikely: "wahrscheinlicher Treffer",
  duplicateGuidance:
    "Wenn es sich um dieselbe Kamera handelt, nutze das Korrekturformular, statt ein Duplikat anzulegen.",
  // Horizon 1 duplicate gate (ADR 0019): a high-strength match must be
  // acknowledged before the report can be stored.
  duplicateConfirmNotice:
    "In der Nähe wurde ein sehr ähnlicher Treffer gefunden. Bestätige, dass es sich um eine andere Kamera handelt, um sie einzureichen, oder nutze das Korrekturformular für den bestehenden Eintrag.",
  duplicateConfirmTitle: "In der Nähe gibt es bereits einen sehr ähnlichen Treffer",
  duplicateConfirmBody:
    "An fast derselben Stelle ist bereits ein Eintrag veröffentlicht. Wenn es dieselbe Kamera ist, nutze das Korrekturformular. Wenn es eine andere Kamera ist, bestätige unten, um sie zu veröffentlichen.",
  duplicateConfirmLabel:
    "Ich bestätige, dass dies eine andere Kamera ist, und möchte sie trotzdem einreichen.",
  nearbyUnavailable:
    "Einträge in der Nähe konnten nicht geprüft werden. Du kannst diese Meldung trotzdem einreichen.",
  recordTitle: "Titel des Eintrags",
  recordTitlePlaceholder: "z. B. Öffentliche Sicherheitskamera",
  selectOne: "Bitte auswählen",
  cameraType: "Kameratyp",
  fixedDome: "Feste Dome-Kamera",
  bullet: "Bullet-Kamera",
  ptz: "PTZ",
  trafficReader: "Verkehrs- / Kennzeichenerfassung",
  otherUnknown: "Sonstige / unbekannt",
  // Field-of-view direction (t_f8b775ec): shown only for directional kinds
  // (never for domes). A compass slider 0-359 with an arrow preview plus a
  // "don't know" option that stores NULL.
  directionTitle: "Richtung des Sichtfelds",
  directionHelp: "Die Kompassrichtung, in die die Kamera zeigt, im Uhrzeigersinn ab Norden (0–359°).",
  directionUnknown: "Ich kenne die Richtung nicht",
  directionDegrees: "Richtung",
  manufacturer: "Hersteller (optional)",
  manufacturerPlaceholder: "z. B. Name des Herstellers",
  observedOn: "Beobachtungsdatum (optional)",
  approximateAddress: "Ungefähre Adresse",
  addressPlaceholder: "Straße und Ort (optional)",
  resolvingAddress: "Adresse wird ermittelt…",
  whatObserved: "Was hast du beobachtet?",
  observedPlaceholder: "Ausrichtung, Betreiber, sichtbarer Hinweis, Modell…",
  reportConsent:
    "Ich bestätige, dass diese Beobachtung vom öffentlichen Raum aus gemacht wurde und keine personenbezogenen Daten enthält.",
  privacyNotice: "Datenschutzerklärung",
  privacyDetails: "Details zum Datenschutz",
  termsOfUse: "Nutzungsbedingungen",
  reportArt13:
    "Die von dir eingegebenen Daten (Standort, Notizen) werden vom Verantwortlichen Simone Rondina / OpenSurveillanceDB auf Grundlage des berechtigten Interesses (Art. 6 Abs. 1 lit. f DSGVO) verarbeitet, um öffentliche Überwachungsinfrastruktur zu dokumentieren. Vollständige Datenschutzerklärung:",
  reportArt13Rights: "Deine Rechte nach der DSGVO (Art. 15–22) kannst du ausüben, indem du schreibst an",
  privacyContact: "privacy@opensurveillancedb.org",
  sendModeration: "Meldung veröffentlichen",
  positionSelected: "Position gewählt",
  nearbyCheckError: "Einträge in der Nähe konnten nicht geprüft werden",
  choosePosition:
    "Wähle vor dem Absenden die ungefähre Position der Kamera auf der Karte oder gib gültige Koordinaten ein.",
  invalidCoordinates:
    "Gib einen gültigen Breitengrad (-90 bis 90) und Längengrad (-180 bis 180) ein.",
  defaultReportTitle: "Meldung einer öffentlichen Kamera",
  unknown: "Unbekannt",
  submitReportError: "Meldung konnte nicht gesendet werden",
  reportSaved:
    "Meldung veröffentlicht – sie ist jetzt im Verzeichnis und auf der Karte sichtbar.",
  reportSavedWithNearby:
    "In der Nähe dieser Position wurden Einträge gefunden – die Community prüft, ob es sich um ein Duplikat handelt.",
  // P1-2 (design review): the write gate (Fase E1) refuses submissions from
  // anonymous (401) and unverified (403) sessions. The login wall gates the
  // form itself; these messages cover a session that dies mid-form.
  loginRequired:
    "Deine Sitzung ist abgelaufen. Melde dich erneut an, um die Meldung einzureichen.",
  verifyRequired:
    "Deine E-Mail-Adresse ist noch nicht bestätigt. Bestätige sie auf deiner Kontoseite, um die Meldung einzureichen.",
  moderationUnavailable:
    "Die Veröffentlichung ist nicht verfügbar. Bitte versuche es später noch einmal.",
};
