/**
 * rules — DE translation. Parity-checked against the English pilot
 * bundle (../../rules.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../rules";

export const de: Translation<typeof en> = {
  navigation: "Navigation – Regeln",
  homeAria: "OpenSurveillanceDB Startseite",
  map: "Karte",
  directory: "Verzeichnis",
  guide: "Anleitung",
  home: "Start",
  eyebrow: "Teilnahmeregeln",
  title: "Was wir veröffentlichen und wie du helfen kannst.",
  intro:
    "Diese Regeln erklären, was OpenSurveillanceDB dokumentiert und was Beitragende melden dürfen. Sie betreffen Veröffentlichung, Community-Aktionen, Korrekturen und die Weiterverwendung der Daten.",
  reportEyebrow: "Was du melden kannst",
  reportTitle: "Öffentlicher Raum, beobachtet vom öffentlichen Raum aus.",
  reportBody:
    "Dokumentiert werden kann nur sichtbare Überwachungsinfrastruktur in gemeinsam genutzten Räumen. Ein Eintrag ist veröffentlichungsfähig, wenn er einem klaren Zweck der zivilgesellschaftlichen Transparenz dient und keine unnötigen personenbezogenen Daten enthält.",
  eligibleOneTitle: "Öffentliche Straßeninfrastruktur",
  eligibleOneBody:
    "Eine sichtbar montierte Kamera an einer öffentlichen Straße, einem Platz, an der Außenseite eines Bahnhofs oder eines öffentlichen Gebäudes.",
  eligibleTwoTitle: "Öffentlich dokumentierte Verkehrskameras",
  eligibleTwoBody:
    "Eine öffentlich dokumentierte Kamera zur Verkehrsüberwachung, sofern die Veröffentlichung des Eintrags rechtmäßig und sicher ist.",
  eligibleThreeTitle: "Offizielle öffentliche Quellen",
  eligibleThreeBody:
    "Ein Eintrag aus einer offiziellen öffentlichen Quelle, gekennzeichnet mit Quelle und Prüfdatum.",
  neverTitle: "Niemals melden",
  neverBody:
    "Meldungen, die eines der folgenden Elemente enthalten, werden niemals im öffentlichen Datensatz behalten.",
  neverOneTitle: "Privathäuser",
  neverOneBody:
    "Kameras an Wohnhäusern oder private Kameras, einschließlich Türklingeln und Kameras, die auf ein Privathaus gerichtet sind.",
  neverTwoTitle: "Personen und personenbezogene Daten",
  neverTwoBody:
    "Identifizierbare Personen, Kfz-Kennzeichen oder private Innenräume.",
  neverThreeTitle: "Live-Streams und Zugänge",
  neverThreeBody:
    "Live-Videos, Stream-URLs, Zugangsdaten, Netzwerkinformationen oder Steuerungsoberflächen.",
  neverFourTitle: "Sensible Details",
  neverFourBody:
    "Detailliertes Sichtfeld oder betriebliche Fähigkeiten, die ein Sicherheitsrisiko schaffen könnten, oder sensible Orte, an denen eine Veröffentlichung gefährlich sein könnte.",
  beforeSubmittingTitle: "Vor dem Absenden",
  beforeSubmittingBody:
    "Zum Absenden brauchst du ein verifiziertes Konto. Lade keine Personen, Kennzeichen, Privathäuser, Sicherheitslücken oder sensiblen Orte hoch und beschreibe sie nicht. Deine Meldung wird sofort veröffentlicht – stelle also sicher, dass sie unbedenklich öffentlich sein kann.",
  correctionEyebrow: "Korrekturen",
  correctionTitle: "Ein privater Weg, einen Eintrag anzufechten.",
  correctionBody:
    "Alle verifizierten Beitragenden können eine Korrektur beantragen, einen Eintrag anfechten oder einen Schaden melden. Anfragen sind privat, werden von einem Menschen geprüft und ändern die Karte nie automatisch.",
  correctionOneTitle: "Korrektur beantragen",
  correctionOneBody:
    "Ungenaue, veraltete oder doppelte Einträge können zur Prüfung gemeldet werden.",
  correctionTwoTitle: "Datenschutz- oder Sicherheitsanliegen melden",
  correctionTwoBody:
    "Ein Datenschutzanliegen blendet einen Eintrag sofort aus, bis die Community ihn überprüft hat. Rechtliche Notfälle nutzen denselben sofortigen Weg.",
  correctionThreeTitle: "Keine personenbezogenen Daten nötig",
  correctionThreeBody:
    "Beschreibe nur das Nötigste, um das Problem zu identifizieren. Füge keine personenbezogenen Daten, Links zu Live-Streams, Zugangsdaten oder Bilder hinzu.",
  dataEyebrow: "Weiterverwendung der Daten",
  dataTitle: "Offen, wo Offenheit sicher ist.",
  dataBody:
    "Veröffentlichte Einträge stehen als GeoJSON und CSV zur Weiterverwendung und Einsicht bereit. Der öffentliche Datensatz enthält die aktiven Einträge; private Korrekturanfragen sind niemals enthalten.",
  downloadGeoJson: "Öffentliches GeoJSON herunterladen",
  downloadCsv: "Öffentliche CSV herunterladen",
  reuseOneTitle: "Lizenz und Herkunft",
  reuseOneBody:
    "Jeder veröffentlichte Eintrag behält seine Quelle und sein Prüfdatum, und die Daten sind für die offene Weiterverwendung lizenziert.",
  reuseTwoTitle: "Keine betrieblichen Details",
  reuseTwoBody:
    "Exporte sind für zivilgesellschaftliche Analysen, Forschung und kompatible Kartenwerkzeuge gedacht – nicht dafür, Kamerabilder oder sensible betriebliche Informationen zu finden.",
  reuseThreeTitle: "Namensnennung von OpenStreetMap",
  reuseThreeBody:
    "Der Kartenhintergrund wird von den OpenStreetMap-Mitwirkenden bereitgestellt und ist von den Kameraeinträgen dieses Projekts getrennt.",
  footer: "Gebaut für Transparenz, nicht für Tracking.",
};
