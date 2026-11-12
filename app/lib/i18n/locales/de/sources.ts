/**
 * sources — DE translation. Parity-checked against the English pilot
 * bundle (../../sources.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../sources";

export const de: Translation<typeof en> = {
  navigation: "Website-Navigation",
  homeAria: "OpenSurveillanceDB Startseite",
  eyebrow: "Daten · Methode und Quellen",
  title: "Methodik und Datenquellen",
  intro:
    "Wir dokumentieren sichtbare öffentliche Überwachungsinfrastruktur mithilfe von Beobachtungen aus der Community und offen lizenzierten öffentlichen Datensätzen. Hier erfährst du, wie die Daten erhoben, geprüft und zugeordnet werden.",
  methodologyTitle: "So funktioniert die Datenbank",
  methodologyIntro: "Die Datenbank ist ein öffentliches Verzeichnis dessen, was sich im öffentlichen Raum beobachten lässt. Sie ist kein Live-Überwachungssystem und enthält niemals Kamerabilder.",
  scopeTitle: "Umfang",
  scopeBody: "Wir erfassen sichtbare Geräte im öffentlichen Raum und die Angaben, die zu ihrer Identifizierung nötig sind: Standort, Typ, Ausrichtung (falls bekannt) und Quelle.",
  collectionTitle: "Erhebung",
  collectionBody: "Einträge stammen aus Beobachtungen der Community und aus kompatiblen öffentlichen Datensätzen. Importierte Daten behalten ihre ursprüngliche Quelle, Lizenz und Namensnennung.",
  correctionTitle: "Überprüfung und Korrektur",
  correctionBody: "Alle können bestätigen, dass ein Eintrag noch aktuell ist, ein Problem melden oder eine Korrektur beantragen. Korrekturen werden geprüft, bevor sie öffentliche Daten ändern.",
  limitsTitle: "Grenzen",
  limitsBody: "Ein leeres Gebiet beweist nicht, dass dort keine Kameras vorhanden sind. Ein Eintrag beschreibt die beste zum jeweiligen Zeitpunkt verfügbare Information, und öffentliche Koordinaten werden gerundet, um den Kontext zu schützen.",
  sourcesTitle: "Importierte Datenquellen",
  sourcesIntro: "Jeder importierte Datensatz ist unten mit ursprünglichem Herausgeber, Lizenz, Importdatum, Anzahl der Einträge und erforderlicher Namensnennung aufgeführt.",
  // Table / card labels (per-source attribution contract, licence matrix
  // docs/data-sources/licenze-compatibilita.md).
  sourceColumn: "Quelle",
  licenseColumn: "Lizenz",
  importedOnColumn: "Importiert am",
  recordsColumn: "Einträge",
  attributionColumn: "Namensnennung",
  recordsCount: (count: number) => `${count.toLocaleString()} ${count === 1 ? "Eintrag" : "Einträge"}`,
  openSource: "Quelldatensatz öffnen (neues Fenster)",
  openLicense: "Lizenztext öffnen (neues Fenster)",
  // Honest empty state: no committed import batch yet — the page exists and
  // explains itself without inventing sources.
  emptyTitle: "Noch keine importierten Datensätze",
  emptyBody:
    "Bisher wurde kein öffentlicher Datensatz importiert. Meldungen aus der Community werden immer einzeln veröffentlicht und werden auf dieser Seite nicht aufgeführt. Sobald der erste Import erfolgt, wird hier jede Quelle mit ihrer Lizenz und Namensnennung aufgeführt.",
  // Dynamic freshness line: the date is derived from the committed batches
  // at request time (app/fonti/page.tsx), never hardcoded — a static date
  // here would go stale the moment a new import lands (copy-finale rule:
  // the page must always tell the truth about its own content).
  lastUpdatedLabel: "Zuletzt aktualisiert",
  descriptorsNote: "Maßgeblich bleiben die Import-Deskriptoren im Repository (docs/data-sources/imports/).",
};
