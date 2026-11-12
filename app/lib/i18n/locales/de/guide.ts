/**
 * guide — DE translation. Parity-checked against the English pilot
 * bundle (../../guide.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../guide";

export const de: Translation<typeof en> = {
  navigation: "Navigation der Anleitung",
  homeAria: "OpenSurveillanceDB Startseite",
  map: "Karte",
  directory: "Verzeichnis",
  home: "Start",
  manifesto: "Manifest",
  eyebrow: "Projektanleitung",
  title: "Eine öffentliche Datenbank, mit Sorgfalt gebaut.",
  intro:
    "Diese Anleitung erklärt, was OpenSurveillanceDB dokumentiert und wie du Karte und Verzeichnis nutzt. Sie zeigt auch, wie aus einer Meldung öffentliche Daten werden und was die Datenbank nicht behauptet.",
  exploreMap: "Karte erkunden",
  browseDirectory: "Verzeichnis durchsuchen",
  overviewEyebrow: "Kurzanleitung",
  overviewTitle: "Finde, was du brauchst.",
  overviewPurpose: "Was die Datenbank dokumentiert",
  overviewPublication: "Wie eine Meldung veröffentlicht wird",
  overviewStatuses: "Wie du den Status eines Eintrags liest",
  overviewAccount: "Konten und Beiträge",
  overviewConfirmations: "Bestätigungen und Vertrauen",
  overviewData: "Offene Daten und Exporte",
  missionEyebrow: "Zweck und Grenzen",
  missionTitle: "Sichtbarkeit ohne operative Überwachung.",
  missionBody:
    "OpenSurveillanceDB hilft Menschen, sichtbare Überwachungsinfrastruktur im öffentlichen Raum zu verstehen. Es ist ein zivilgesellschaftliches Verzeichnis öffentlich sichtbarer Anlagen, kein Werkzeug zum Beobachten, Verfolgen oder Umgehen rechtmäßiger Überwachung.",
  missionOneTitle: "Was wir dokumentieren",
  missionOneBody:
    "Sichtbare Kamerainfrastruktur, ungefährer Standort, Typ, Quelle und ein Community-Status.",
  missionTwoTitle: "Was wir nicht erfassen",
  missionTwoBody:
    "Kamerabilder, Zugangsdaten, Details zu Privatwohnungen, operative Schwachstellen, Gesichter, Kennzeichen oder andere personenbezogene Daten.",
  missionThreeTitle: "Was die Karte nicht beweisen kann",
  missionThreeBody:
    "Ein fehlender Eintrag zeigt nicht, dass ein Gebiet frei von Überwachung ist. Er zeigt nur, dass dort derzeit kein Eintrag veröffentlicht ist.",
  cycleEyebrow: "Ein Community-Prozess",
  cycleTitle: "Von der Beobachtung zum öffentlichen Eintrag.",
  cycleBody:
    "Eine Meldung aus einem verifizierten Konto wird sofort zum öffentlichen Eintrag. Danach hält die Community das Verzeichnis aktuell: Was noch da ist, wird bestätigt, was weg ist, wird gemeldet, was nützlich ist, wird markiert.",
  cycleRuleTitle: "Die Veröffentlichung erfolgt sofort.",
  cycleRuleBody:
    "Eine Meldung wird veröffentlicht, sobald eine verifizierte mitwirkende Person sie einreicht. Keine Warteschlange, kein Warten: Für die Genauigkeit sorgt die Community, nicht eine Prüfinstanz.",
  cycleStepsLabel: "Veröffentlichungszyklus",
  submitLabel: "Einreichen",
  submitTitle: "Eine Beobachtung wird eingereicht",
  submitBody:
    "Eine mitwirkende Person wählt einen ungefähren Standort im öffentlichen Raum und fügt eine kurze Beschreibung hinzu. Die Meldung wird sofort veröffentlicht.",
  moderateLabel: "Community",
  moderateTitle: "Die Community hält sie aktuell",
  moderateBody:
    "Andere können bestätigen, dass eine Kamera noch da ist, sie als nicht mehr vorhanden melden, als nützlich markieren oder ein Problem melden. Jede Aktion erfordert ein verifiziertes Konto; Schwellenwerte entscheiden, was sich ändert.",
  publishLabel: "Pflegen",
  publishTitle: "Einträge bleiben aktiv, bis die Community anders entscheidet",
  publishBody:
    "Ein Eintrag verschwindet erst nach genügend Community-Meldungen – oder bei einem rechtlichen Notfall – aus der öffentlichen Liste, und jeder Übergang wird im öffentlichen Verlauf des Eintrags festgehalten.",
  publicationDetailsEyebrow: "Veröffentlichung im Detail",
  publicationDetailsTitle: "Das öffentliche Veröffentlichungsmodell.",
  publicationDetailsSummary: "Detaillierte Veröffentlichungsregeln lesen",
  statusEyebrow: "Einträge lesen",
  statusTitle: "Jeder Status sagt, was der Eintrag belegen kann.",
  statusIntro:
    "Ein Status beschreibt den aktuellen Zustand – keine Garantie, dass eine Kamera aktiv, vollständig oder dauerhaft korrekt erfasst ist.",
  verifiedTitle: "Veröffentlicht und aktiv",
  verifiedBody:
    "Der Eintrag ist öffentlich: Er erscheint auf der Karte, im Verzeichnis und im GeoJSON-Export. Die Community kann jederzeit darauf reagieren.",
  reviewTitle: "Ausgeblendet",
  reviewBody:
    "Der Eintrag wurde bis zu einer Prüfung durch die Community oder aus rechtlichen Gründen zurückgezogen. Er wird nicht gelistet, aber sein öffentlicher Verlauf bleibt sichtbar, und Bestätigungen können ihn zurückbringen.",
  pendingTitle: "Als nicht mehr vorhanden gemeldet",
  pendingBody:
    "Die Community hat gemeldet, dass diese Kamera nicht mehr da ist. Der Eintrag wird nicht gelistet und kann wiederhergestellt werden, wenn Bestätigungen zeigen, dass sie wieder da ist.",
  accountEyebrow: "Dein Konto",
  accountTitle: "Warum ein Konto erstellen?",
  accountBody:
    "Zum Durchsuchen der Daten brauchst du kein Konto. Mit einem Konto kannst du Meldungen einreichen, an Community-Aktionen teilnehmen, deine Beiträge verfolgen und eine Vertrauensstufe aufbauen.",
  accountWhyTitle: "Was dir ein Konto bringt",
  accountWhyBody:
    "Meldungen werden mit deinem Konto verknüpft. Du kannst deine Beiträge bearbeiten, Einträge bestätigen, Probleme melden und deine Vertrauensstufe wachsen sehen.",
  accountHowTitle: "Wie Konten funktionieren",
  accountHowBody:
    "Du registrierst dich mit E-Mail-Adresse und Passwort; das Passwort wird als Hash gespeichert und nie offengelegt. Bevor du veröffentlichen oder an Community-Aktionen teilnehmen kannst, musst du deine E-Mail-Adresse bestätigen. Du kannst demselben Konto auch einen Passkey oder eine Anmeldung über einen Anbieter hinzufügen.",
  accountAnonymousTitle: "Stöbern bleibt offen",
  accountAnonymousBody:
    "Karte, Verzeichnis und Exporte kannst du ohne Konto nutzen. Für Meldungen, Korrekturen oder Community-Aktionen brauchst du ein verifiziertes Konto.",
  editEyebrow: "Einen Beitrag bearbeiten",
  editTitle: "Du kannst deine eigenen Beiträge bearbeiten.",
  editBody:
    "Nur die Person, die einen Eintrag eingereicht hat, kann ihn bearbeiten. Eine Änderung an einem bereits öffentlichen Eintrag wird zu einem privaten Vorschlag: Die veröffentlichte Version bleibt sichtbar, bis die Moderation ihn übernimmt oder verwirft. Für alles andere nutze das private Korrekturformular.",
  editOwnerTitle: "Nur für Urheber",
  editOwnerBody:
    "Du kannst einen Eintrag nur bearbeiten, wenn du ihn eingereicht hast. Einträge anderer lassen sich nicht direkt bearbeiten; melde nötige Änderungen über das private Korrekturformular.",
  editRemoderationTitle: "Änderungen werden zu Vorschlägen",
  editRemoderationBody:
    "Ist ein Eintrag bereits öffentlich, überschreibt eine Änderung ihn nie: Sie wird als privater Vorschlag gespeichert, und die Moderation übernimmt oder verwirft ihn. Die aktuelle öffentliche Version bleibt die ganze Zeit sichtbar.",
  editNotImmediateTitle: "Der Vorschlag bleibt privat",
  editNotImmediateBody:
    "Nur die vorgeschlagene Änderung ist während der Prüfung privat. Der veröffentlichte Eintrag erscheint weiterhin auf der Karte, im Verzeichnis und in den Exporten, bis über den Vorschlag entschieden ist.",
  verifyEyebrow: "Bestätigungen",
  verifyTitle: "Was Bestätigungen bedeuten.",
  verifyBody:
    "Eine Bestätigung ist eine persönliche Prüfung, dass eine Kamera noch am dokumentierten Standort ist. Sie hilft Lesenden, einem Eintrag zu vertrauen, ohne zu verraten, wer bestätigt hat.",
  verifyWhatTitle: "Eine persönliche Prüfung",
  verifyWhatBody:
    "Mit einer Bestätigung erklärst du aus eigener Beobachtung, dass die Kamera noch dort existiert, wo der Eintrag es angibt.",
  verifyOneTitle: "Eine pro Person",
  verifyOneBody:
    "Jedes Konto kann pro Eintrag eine Community-Aktion setzen. Es ist eine Prüfung, kein Beliebtheitswettbewerb: eine Person, ein Signal.",
  verifyFairTitle: "Fair gehalten",
  verifyFairBody:
    "Community-Aktionen erfordern ein verifiziertes Konto, neue Konten zählen weniger als vertrauenswürdige, und Tageslimits verhindern automatisierte oder massenhafte Aktionen. Deinen eigenen Eintrag kannst du nicht bestätigen oder markieren.",
  verifyPrivateTitle: "Nicht öffentlich zugeordnet",
  verifyPrivateBody:
    "Öffentliche Seiten zeigen nur Gesamtzahlen und den öffentlichen Verlauf des Eintrags. Wer einen Eintrag bestätigt oder gemeldet hat, wird nie angezeigt und nie mit einem Profil verknüpft.",
  levelEyebrow: "Vertrauensstufen",
  levelTitle: "Anerkennung, kein Wettbewerb.",
  levelBody:
    "Vertrauensstufen spiegeln wider, wie viele deiner Beiträge im Verzeichnis aktiv sind. Sie sind eine stille Anerkennung genauer Arbeit, keine Rangliste.",
  levelThresholdsTitle: "Stufen und Schwellenwerte",
  levelThresholdsBody:
    "Nur aktive Beiträge zählen. Die Schwellenwerte sind 1, 5, 20 und 50; ausgeblendete oder entfernte Einträge zählen nicht.",
  levelBadgeTitle: "Drei Abzeichen",
  levelBadgeBody:
    "Dein Profil zeigt eines von drei Abzeichen: Neu dabei, Vertrauenswürdig oder Erfahren. Das Abzeichen ist ein Hinweis, nie ein Rang.",
  levelRecognitionTitle: "Keine Bestenliste",
  levelRecognitionBody:
    "Stufen sind persönlich. Es gibt keine öffentliche Rangliste oder Bestenliste, und die Stufe anderer wird nie angezeigt.",
  dataEyebrow: "Offene Daten und Kartengrundlage",
  dataTitle: "Offen, wo Offenheit sicher ist.",
  dataBody:
    "Veröffentlichte Einträge stehen als GeoJSON und CSV zur Weiterverwendung und Prüfung bereit. Der öffentliche Datensatz enthält die aktiven Einträge; private Korrekturanfragen sind nie enthalten.",
  downloadGeoJson: "Öffentliches GeoJSON herunterladen",
  downloadCsv: "Öffentliche CSV herunterladen",
  geoJsonTitle: "Ein wiederverwendbarer öffentlicher Export",
  geoJsonBody:
    "GeoJSON ist ein gängiges Format für Geodaten. Es ist für zivilgesellschaftliche Analysen, Forschung und kompatible Kartenwerkzeuge gedacht – nicht, um Kamerabilder oder sensible operative Informationen zu finden.",
  osmTitle: "OpenStreetMap liefert die Basiskarte",
  osmBody:
    "Der Kartenhintergrund stammt von den OpenStreetMap-Mitwirkenden. Er ist getrennt von den Kameraeinträgen dieses Projekts und erfordert stets eine sichtbare Namensnennung und verantwortungsvolle Nutzung.",
  localLabel: "Projektstatus",
  localTitle: "Ein Projekt in Entwicklung",
  localBody:
    "OpenSurveillanceDB wird aktiv weiterentwickelt. Einträge aus verifizierten Konten werden sofort veröffentlicht und von der Community aktuell gehalten; das Projekt erhebt keinen Anspruch darauf, dass die Daten vollständig, aktuell oder maßgeblich sind.",
  footer: "Für Transparenz, nicht für Tracking.",
};
