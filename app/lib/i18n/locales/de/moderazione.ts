/**
 * moderazione — DE translation. Parity-checked against the English pilot
 * bundle (../../moderazione.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../moderazione";

export const de: Translation<typeof en> = {
  navigation: "Navigation – Veröffentlichung",
  homeAria: "OpenSurveillanceDB Startseite",
  map: "Karte",
  directory: "Verzeichnis",
  home: "Start",
  eyebrow: "So funktioniert die Veröffentlichung",
  title: "Sofort veröffentlicht, von der Community aktuell gehalten.",
  intro:
    "Jede Meldung von einem verifizierten Konto wird sofort veröffentlicht – auf der Karte, im Verzeichnis und in den Exporten. Diese Seite erklärt, wie ein Eintrag lebt, wie die Community ihn aktuell hält und welche automatischen Schwellen darüber entscheiden, wann ein Eintrag zurückgezogen oder wiederhergestellt wird.",
  correctionCta: "Korrektur beantragen",
  exploreMapCta: "Karte erkunden",
  flowEyebrow: "Das Leben eines Eintrags",
  flowTitle: "Von der Beobachtung zum öffentlichen Eintrag.",
  flowBody:
    "Eine Meldung ist öffentlich, sobald sie von einem verifizierten Konto eingereicht wird. Es gibt keine Warteschlange und keine Wartezeit: Die Community hält das Verzeichnis von der ersten Minute an aktuell.",
  stepReceiveTitle: "Einreichen",
  stepReceiveBody: "Eine verifizierte Person reicht eine Beobachtung aus dem öffentlichen Raum ein. Die Meldung wird sofort veröffentlicht.",
  stepScreenTitle: "Veröffentlichen",
  stepScreenBody: "Der Eintrag erscheint auf der Karte, im Verzeichnis und in den Exporten. Koordinaten werden auf etwa 4 Nachkommastellen gerundet (ungefähr 10 Meter); der genaue Standort wird nie veröffentlicht.",
  stepVerifyTitle: "Handeln",
  stepVerifyBody: "Alle mit einem verifizierten Konto können bestätigen, dass die Kamera noch da ist, sie als nicht mehr vorhanden melden, sie als nützlich markieren oder ein Problem melden. Ein Konto, eine aktive Aktion pro Eintrag.",
  stepMinimiseTitle: "Schwellen",
  stepMinimiseBody: "Automatische Schwellen entscheiden, was sich ändert: Genügend Meldungen blenden einen Eintrag aus oder entfernen ihn, eine Datenschutzmeldung blendet ihn sofort aus, und genügend Bestätigungen bringen ihn zurück. Kein einzelnes Konto kontrolliert die Veröffentlichung.",
  stepDecideTitle: "Zurückziehen",
  stepDecideBody: "Ein Eintrag, den die Community oft genug meldet, wird ausgeblendet oder aus der öffentlichen Liste entfernt. Er bleibt über einen direkten Link erreichbar, mit einem Hinweisbanner und seiner öffentlichen Historie.",
  stepMaintainTitle: "Wiederherstellen",
  stepMaintainBody: "Ein ausgeblendeter oder entfernter Eintrag kann mit genügend Bestätigungen aus der Community zurückkehren. Jeder Übergang wird in der öffentlichen Historie des Eintrags festgehalten.",
  appealsEyebrow: "Korrekturen und rechtliche Notfälle",
  appealsTitle: "Private Anfragen, eine einzige Notfallbefugnis.",
  appealsBody:
    "Korrekturanfragen bleiben privat: Sie ändern die Karte nie automatisch und sind niemals im öffentlichen Export enthalten. Die einzige verbleibende menschliche Schreibbefugnis ist das Ausblenden bei rechtlichen Notfällen, das eine Administratorin oder ein Administrator nutzt, wenn das Gesetz es verlangt.",
  urgentTitle: "Datenschutzmeldungen wirken sofort",
  urgentBody:
    "Ein Datenschutzanliegen von einem verifizierten Konto blendet einen Eintrag sofort aus, bis die Community ihn überprüft hat. Rechtliche Notfälle nutzen denselben sofortigen Weg; die Rücknahme erfordert genügend Bestätigungen und eine Wartezeit.",
  outcomeUpheldTitle: "Ausgeblendet",
  outcomeUpheldBody: "Ein Eintrag, der bis zur Überprüfung durch die Community oder aus rechtlichen Gründen zurückgezogen wurde. Nicht gelistet, aber über einen direkten Link mit seiner öffentlichen Historie erreichbar.",
  outcomeDismissedTitle: "Entfernt",
  outcomeDismissedBody: "Die Community hat gemeldet, dass die Kamera nicht mehr da ist. Der Eintrag ist nicht gelistet, kann aber durch Bestätigungen wiederhergestellt werden.",
  outcomeEscalatedTitle: "Wiederhergestellt",
  outcomeEscalatedBody: "Genügend Bestätigungen haben den Eintrag in die öffentliche Liste zurückgebracht. Die Rücknahme wird in seiner öffentlichen Historie festgehalten.",
  slaTitle: "Antwortziele",
  slaBody:
    "Korrektur- und Löschanfragen: erste Antwort innerhalb von 48 Stunden, inhaltliche Antwort innerhalb von 14 Tagen; Ausblendungen bei rechtlichen Notfällen erfolgen sofort. Diese Ziele gelten verbindlich.",
  safeguardsEyebrow: "Schutzmechanismen",
  safeguardsTitle: "Kontrollen für das Community-Modell.",
  safeguardsBody: "Das Modell ist so aufgebaut, dass kein einzelnes Konto die Veröffentlichung kontrolliert und Fehler sichtbar bleiben.",
  safeguardPairTitle: "Nur verifizierte Konten",
  safeguardPairBody: "Jede Meldung und jede Community-Aktion erfordert ein verifiziertes Konto – anonyme Schreibzugriffe werden abgelehnt.",
  safeguardEscalationTitle: "Automatische, transparente Schwellen",
  safeguardEscalationBody: "Rückzüge und Wiederherstellungen folgen veröffentlichten Schwellen mit Mindestzahlen unterschiedlicher Beitragender, sodass ein einzelnes Konto nie allein entscheiden kann.",
  safeguardCredentialsTitle: "Öffentliche Historie ohne Namen",
  safeguardCredentialsBody: "Jeder Übergang wird in der öffentlichen Historie des Eintrags als aggregiertes Ereignis festgehalten. Wer bestätigt oder gemeldet hat, wird nie angezeigt und nie mit einem Profil verknüpft.",
  safeguardTrainingTitle: "Verbrauch und Kontingente",
  safeguardTrainingBody: "Auslösende Aktionen werden bei einem Übergang verbraucht, und tägliche Kontingente unterbinden automatisierte oder massenhafte Aktionen.",
  safeguardAuditTitle: "Internes Audit und Löschung",
  safeguardAuditBody: "Ein internes, nur erweiterbares Audit-Protokoll bewahrt die vollständige Zuordnung zur Rechenschaft, und die Löschung eines Kontos entfernt dessen Community-Aktionen.",
  notDashboardTitle: "Diese Seite ist nicht das Moderations-Dashboard",
  notDashboardBody:
    "Das Moderations-Dashboard ist ein privates Werkzeug, durch Zugriffskontrolle geschützt und nie von der öffentlichen Website verlinkt; es ist rechtlichen Notfällen und dem privaten Korrekturablauf vorbehalten. Diese Seite erklärt nur das öffentliche Modell.",
};
