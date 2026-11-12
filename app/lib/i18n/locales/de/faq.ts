/**
 * faq — DE translation. Parity-checked against the English pilot
 * bundle (../../faq.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../faq";

export const de: Translation<typeof en> = {
  navigation: "Navigation – FAQ",
  homeAria: "OpenSurveillanceDB Startseite",
  map: "Karte",
  directory: "Verzeichnis",
  home: "Start",
  faqLabel: "FAQ",
  contactLabel: "Kontakt",
  eyebrow: "Häufig gestellte Fragen",
  title: "Klare Antworten dazu, wie die Datenbank funktioniert.",
  intro:
    "Kurze Antworten zu Meldungen, Genauigkeit der Karte, Community-Aktionen, Korrekturen und Datenschutz. Für alles, was hier nicht beantwortet wird, nutze das Korrekturformular oder die Kontaktseite.",
  qReport: "Wie melde ich eine Kamera?",
  aReport:
    "Wähle einen ungefähren Standort auf der Karte oder gib Koordinaten ein. Füge dann nur hinzu, was du vom öffentlichen Raum aus beobachten kannst: Typ, Ausrichtung, sichtbarer Hinweis, Hersteller. Gib keine Personen, Kennzeichen, Privathäuser, Zugangsdaten oder Links zu Live-Streams an. Mit einem verifizierten Konto wird deine Meldung sofort veröffentlicht.",
  qAccuracy: "Wie genau ist die Karte?",
  aAccuracy:
    "Die Karte zeigt die aktiven Einträge: Jede Meldung von einem verifizierten Konto erscheint sofort, und die Community hält sie aktuell. Veröffentlichte Koordinaten werden auf etwa vier Nachkommastellen gerundet, also ungefähr 10 Meter. Ein Status beschreibt den aktuellen Stand und ist keine Garantie, dass eine Kamera in Betrieb ist. Ein leeres Gebiet beweist nicht, dass dort keine Kameras vorhanden sind – es zeigt nur, dass dort derzeit kein Eintrag veröffentlicht ist.",
  qCorrect: "Wie korrigiere ich einen Fehler?",
  aCorrect:
    "Nutze das private Korrekturformular oder schreibe an privacy@opensurveillancedb.org. Korrekturanfragen sind privat: Sie ändern die Karte nicht automatisch und sind niemals im öffentlichen Export enthalten. Erste Antwort innerhalb von 48 Stunden; inhaltliche Antwort innerhalb von 14 Tagen.",
  qPrivacy: "Wie steht es um den Datenschutz?",
  aPrivacy:
    "Meldungen sind öffentlich, sobald sie veröffentlicht werden, und enthalten niemals Gesichter, Kennzeichen oder personenbezogene Daten. Private Korrekturanfragen bleiben privat. Verantwortlicher ist Simone Rondina (syax89) / OpenSurveillanceDB, Italien. Betroffenenrechte (Auskunft, Berichtigung, Löschung, Widerspruch) kannst du über privacy@opensurveillancedb.org ausüben.",
  qAccount: "Brauche ich ein Konto?",
  aAccount:
    "Zum Stöbern brauchst du kein Konto. Um eine Meldung einzureichen, eine Korrektur zu senden oder an Community-Aktionen teilzunehmen, ist ein kostenloses, verifiziertes Konto nötig. Damit kannst du deine Meldungen verfolgen, deine Beiträge bearbeiten, Einträge bestätigen und eine Vertrauensstufe aufbauen.",
  qVerifications: "Was sind Bestätigungen?",
  aVerifications:
    "Eine Bestätigung ist eine persönliche Überprüfung, dass eine Kamera am dokumentierten Standort noch existiert. Jedes Konto kann pro Eintrag eine Community-Aktion behalten, sodass die Zahlen verschiedene Personen widerspiegeln. Öffentliche Seiten zeigen nur Gesamtzahlen und die öffentliche Historie des Eintrags – wer einen Eintrag bestätigt oder gemeldet hat, wird nie angezeigt.",
  qEdit: "Kann ich meinen Beitrag bearbeiten?",
  aEdit:
    "Nur die Person, die einen Eintrag eingereicht hat, kann ihn bearbeiten. Eine Änderung an einem bereits öffentlichen Eintrag wird zu einem privaten Vorschlag: Die veröffentlichte Version bleibt sichtbar, bis ein Moderator den Vorschlag übernimmt oder verwirft. Wenn ein Eintrag, den du nicht eingereicht hast, geändert werden muss, nutze das private Korrekturformular – es ändert öffentliche Daten nie von selbst.",
  qLevels: "Was sind Beitragsstufen?",
  aLevels:
    "Vertrauensstufen würdigen genaue Beiträge: Es zählen nur aktive Einträge, mit Schwellen bei 1, 5, 20 und 50 Beiträgen. Stufen sind Anerkennung, kein Wettbewerb – es gibt keine öffentliche Rangliste.",
  qDeleteAccount: "Was passiert mit meinen Bestätigungen, wenn ich mein Konto lösche?",
  aDeleteAccount:
    "Die Löschung des Kontos entfernt die Verbindung zwischen dir und den Community-Daten. Bestätigungen, die du erhalten hast, werden gelöscht; die, die du abgegeben hast, bleiben anonymisiert am Eintrag. Deine veröffentlichten Meldungen bleiben öffentlich, ohne dir zugeordnet zu werden.",
  moreTitle: "Noch Fragen?",
  moreBody:
    "Für Korrekturen, Entfernungen und Datenschutzanfragen nutze das Korrekturformular oder die Kontaktseite.",
  guideCta: "Projektanleitung lesen",
  rulesCta: "Teilnahmeregeln lesen",
  privacyCta: "Details zum Datenschutz lesen",
  contactCta: "Kontaktseite öffnen",
  correctionCta: "Zum Korrekturformular",
  footer: "Gebaut für Transparenz, nicht für Tracking.",
};
