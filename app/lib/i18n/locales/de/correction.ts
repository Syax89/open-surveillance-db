/**
 * correction — DE translation. Parity-checked against the English pilot
 * bundle (../../correction.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../correction";

export const de: Translation<typeof en> = {
  // Page-level chrome (/correggi).
  pageTitle: "Eintrag korrigieren",
  pageIntro:
    "Korrekturen sind privat. Sie ändern die Karte nicht automatisch und sind niemals im öffentlichen Datenexport enthalten.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Wird geladen…",
  navigation: "Navigation – Korrektur",
  homeAria: "OpenSurveillanceDB Startseite",
  // Correction section (extracted from the home page bundle in F1).
  accountability: "Verantwortlichkeit",
  correctionTitle: "Korrigiere einen Eintrag oder melde ein Anliegen.",
  correctionIntro:
    "Korrekturen sind privat. Sie ändern die Karte nicht automatisch und sind niemals im öffentlichen Datenexport enthalten.",
  urgentConcern: "Dringendes Datenschutz- oder Sicherheitsanliegen?",
  urgentConcernBody:
    "Beschreibe nur das Nötigste, um das Problem zu identifizieren. Füge keine personenbezogenen Daten, Links zu Live-Streams, Zugangsdaten oder Bilder hinzu.",
  stepRecord: "1. Zu prüfender Eintrag",
  stepIssue: "2. Problem beschreiben",
  stepContact: "3. Kontakt und Absenden",
  relatedRecord: "Betroffener öffentlicher Eintrag",
  noSpecificRecord: "Kein bestimmter Eintrag / allgemeines Anliegen",
  needsReview: "Was soll geprüft werden?",
  selectOne: "Bitte auswählen",
  // Record-id field (CEO 2026-08-12: "un campo di ricerca per id piuttosto
  // che un menu a discesa"): the related-record field is a plain id input
  // instead of a native <select> with ALL records as options (the
  // ~37k-option menu froze the browser).
  recordIdPlaceholder: "Eintrags-ID (z. B. 6745)",
  recordIdHelp: "Gib die öffentliche ID ein, die auf der Seite des Eintrags angezeigt wird; existiert der Eintrag, erscheint eine Bestätigung.",
  recordIdNotFound: (id: number) => `Kein öffentlicher Eintrag mit der ID ${id}.`,
  recordIdUnavailable: "Die Suche nach Einträgen ist gerade nicht verfügbar.",
  recordIdClear: "Auswahl löschen",
  // C4: the select maps 1:1 to the backend issue_type whitelist
  // (inaccurate|missing|removal|abuse|other) — see db/corrections.ts
  // CORRECTION_ISSUE_TYPES. Free text is never accepted for removal/abuse.
  inaccurate: "Ungenaue Angaben",
  missing: "Nicht mehr vorhanden",
  removal: "Antrag auf Entfernung",
  abuse: "Missbrauch melden",
  other: "Sonstiges",
  briefDescription: "Kurze Beschreibung",
  correctionPlaceholder:
    "Erkläre das Problem, ohne personenbezogene Daten oder betriebliche Details anzugeben.",
  contactEmail: "Kontakt-E-Mail (optional)",
  contactPlaceholder: "Nur wenn du eine Antwort möchtest",
  correctionConsent:
    "Mir ist bewusst, dass diese Anfrage privat ist, von Menschen geprüft wird und möglicherweise nicht zu einer automatischen Änderung führt.",
  correctionArt13:
    "Die Daten der Anfrage und deine Kontaktdaten werden vom Verantwortlichen Simone Rondina / OpenSurveillanceDB zur Bearbeitung deiner Anfrage verarbeitet, auf Grundlage einer rechtlichen Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO – Art. 15–22) und des berechtigten Interesses (Art. 6 Abs. 1 lit. f). Vollständige Datenschutzerklärung:",
  correctionArt13Rights: "Deine Rechte nach der DSGVO kannst du ausüben, indem du schreibst an",
  privacyContact: "privacy@opensurveillancedb.org",
  sendPrivateRequest: "Private Anfrage senden",
  privacyNotice: "Datenschutzerklärung",
  privacyDetails: "Details zum Datenschutz",
  termsOfUse: "Nutzungsbedingungen",
  saveRequestError: "Anfrage konnte nicht gespeichert werden",
  correctionSaved: "Private Korrekturanfrage gespeichert mit Referenz",
  correctionPrivate: "Sie wird nicht im öffentlichen Verzeichnis angezeigt.",
  correctionUnavailable: "Der Korrekturdienst ist nicht verfügbar. Bitte versuche es später noch einmal.",
  // P1-2 (design review): the write gate answers 401 (no session) and 403
  // (unverified email) with a single canonical body; these map the mid-form
  // session death to localized guidance instead of the raw server string.
  loginRequired:
    "Deine Sitzung ist abgelaufen. Melde dich erneut an, um die Korrektur zu senden.",
  verifyRequired:
    "Deine E-Mail-Adresse ist noch nicht bestätigt. Bestätige sie auf deiner Kontoseite, um die Korrektur zu senden.",
  // ?record=ID prefill announcement (aria-live).
  recordPreselected: (recordId: number, title: string) =>
    `Eintrag ${recordId} vorausgewählt: ${title}. Beschreibe das Problem unten.`,
};
