/**
 * contact — DE translation. Parity-checked against the English pilot
 * bundle (../../contact.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../contact";

export const de: Translation<typeof en> = {
  navigation: "Navigation – Kontakt",
  homeAria: "OpenSurveillanceDB Startseite",
  map: "Karte",
  directory: "Verzeichnis",
  home: "Start",
  faqLabel: "FAQ",
  contactLabel: "Kontakt",
  eyebrow: "Kontakt und Verantwortlichkeit",
  title: "Wer dahintersteht und wie du uns erreichst.",
  intro:
    "OpenSurveillanceDB ist eine offene, nicht-kommerzielle, zivilgesellschaftliche Datenbank sichtbarer öffentlicher Überwachungsinfrastruktur. Sie dokumentiert öffentlich sichtbare Geräte; sie bietet niemals Kamerabilder, Tracking-Werkzeuge oder Tipps, wie man rechtmäßiger Überwachung ausweicht.",
  whoTitle: "Wer wir sind",
  whoBody:
    "Ein kleines Team namentlich genannter Freiwilliger betreut das Projekt. Dies sind erste Benennungen für die Pilotphase, keine Behauptung, dass bereits eine vollständige öffentliche Governance besteht.",
  rolesTitle: "Rollen und Verantwortliche",
  rolesIntro: "Die ersten Rollen für die Pilotphase wurden am 2026-07-31 benannt:",
  roleMaintainers: "Maintainer",
  roleMaintainersBody: "Simone (syax89) – Projektverantwortlicher. Nur der Projektverantwortliche kann Codeänderungen mergen.",
  roleOps: "Verantwortlich für den Betrieb",
  roleOpsBody: "Der Maintainer – Hosting, Deployments, Backups.",
  roleData: "Datenverantwortliche",
  roleDataBody: "Die Maintainer – Datenmodell, Qualität und Aufbewahrung.",
  roleSecurity: "Sicherheitskontakt",
  roleSecurityBody: "Der Maintainer – privater Meldeweg in SECURITY.md.",
  roleModeration: "Kontakt für Moderation",
  roleModerationBody: "Der Maintainer.",
  controllerTitle: "Verantwortlicher für die Datenverarbeitung",
  controllerBody:
    "Simone Rondina (syax89) / OpenSurveillanceDB – Italien (Entscheidung vom 2026-07-31; endgültige Bezeichnung der Rechtsperson wird zum Start bestätigt).",
  correctionTitle: "Korrekturen und Entfernung",
  correctionBody:
    "Nutze das private Korrekturformular oder schreibe an den Datenschutzkontakt. Anfragen sind privat, werden von einem Menschen geprüft und niemals veröffentlicht. Antwortziele: erste Antwort innerhalb von 48 Stunden, inhaltliche Antwort innerhalb von 14 Tagen, Ausblenden von Inhalten im Notfall innerhalb von 24 Stunden.",
  correctionForm: "Korrekturformular öffnen",
  correctionEmail: "privacy@opensurveillancedb.org",
  correctionEmailNote:
    "Eigenes, betreutes Postfach.",
  securityTitle: "Sicherheitslücke melden",
  securityBody:
    "Nutze das Verfahren „Private Vulnerability Reporting“ von GitHub. Es erstellt ein vertrauliches Advisory, das nur die Maintainer sehen können. Öffne für eine Sicherheitslücke kein öffentliches Issue.",
  securityAdvisory: "Privates Advisory-Formular öffnen",
  securityPgpTitle: "Sensible Inhalte verschlüsseln",
  securityPgpBody:
    "Verschlüssele Inhalte mit personenbezogenen Daten oder betrieblichen Details mit dem PGP-Schlüssel des Projekts (Fingerprint 04E8 A3EE 7C72 188B D3AF 925D 496C F0BD 4920 D3F7) und füge den Geheimtext dem Advisory bei. Es gelten dieselben Antwortziele wie im Abschnitt zu Korrekturen oben.",
  securityRouteNote:
    "Sicherheitsmeldungen und Datenschutzanfragen laufen über getrennte Kanäle: private Advisories für Sicherheitslücken, das Korrekturformular und der Datenschutzkontakt für Anfragen betroffener Personen.",
  footer: "Gebaut für Transparenz, nicht für Tracking.",
};
