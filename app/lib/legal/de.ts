/**
 * German legal content (de-DE).
 *
 * Mirror of the English pilot bundle (app/lib/legal/en.ts), pinned to the
 * same `LegalContent` type, so missing/extra keys fail `tsc` (parity per
 * ADR 0007 — English is the pilot language, German must mirror it).
 *
 * Web adaptation of the legal documents:
 *   - docs/TERMS_OF_USE.md          → terms
 *   - docs/legal/PRIVACY_NOTICE.md  → privacy
 *   - docs/OPEN_SOURCE.md           → licenses
 *
 * The repository copies of those documents remain the canonical source
 * of record; this file is the presentation layer for the public pages.
 * Inline markup: **bold** and [label](url) (see app/lib/legal/types.ts).
 */
import type { LegalContent } from "./types";

export const deLegal: LegalContent = {
  privacy: {
    eyebrow: "Rechtliches · Datenschutz",
    title: "Datenschutzerklärung",
    intro:
      "Wie OpenSurveillanceDB personenbezogene Daten verarbeitet, was wir veröffentlichen, was wir niemals erheben und wie du deine Rechte nach der DSGVO ausüben kannst.",
    versionNote:
      "Version 0.9 — 12. November 2026. § 10 Cookies neu gefasst: Er führt jetzt alle verwendeten Cookies auf (Sprache, Farbschema, Anmeldesitzung und CSRF-Schutz), alle unbedingt erforderlich, daher weiterhin kein Einwilligungsbanner; neu synchronisiert mit der kanonischen PRIVACY_NOTICE v0.16 (docs/legal/PRIVACY_NOTICE.md bleibt maßgeblich).",
    sections: [
      {
        heading: "1. Wer wir sind (Verantwortlicher)",
        blocks: [
          {
            type: "paragraph",
            text: "**Verantwortlicher:** Simone Rondina (syax89) / OpenSurveillanceDB — Italien.",
          },
          {
            type: "paragraph",
            text: "**Datenschutzkontakt:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — ein eigenes Postfach — für alle Fragen, Anträge betroffener Personen oder Meldungen. Erste Antwort innerhalb von 48 Stunden, inhaltliche Antwort innerhalb von 14 Tagen.",
          },
        ],
      },
      {
        heading: "2. Was der Dienst tut",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB veröffentlicht eine Karte im öffentlichen Interesse mit **sichtbarer, öffentlicher Überwachungsinfrastruktur** (zum Beispiel Kameras an öffentlichen Straßen, Plätzen oder an der Außenseite von Bahnhöfen). Die Einträge werden von verifizierten Konten sofort veröffentlicht und von der Community durch Bestätigungen, Meldungen und automatische Schwellen aktuell gehalten (ADR 0021). Es handelt sich um ein Projekt für zivilgesellschaftliche Transparenz, nicht um eine kommerzielle Plattform: keine verhaltensbasierte Werbung, kein Tracking, kein Verkauf von Daten.",
          },
        ],
      },
      {
        heading: "3. Welche personenbezogenen Daten wir verarbeiten",
        blocks: [
          {
            type: "paragraph",
            text: "Die folgende Tabelle beschreibt die vom Dienst verarbeiteten personenbezogenen Daten, ihre Herkunft, ihren Zweck und ihre Rechtsgrundlage.",
          },
          {
            type: "table",
            caption: "Vom Dienst verarbeitete personenbezogene Daten",
            headers: ["Daten", "Herkunft", "Zweck", "Rechtsgrundlage"],
            rows: [
              [
                "Inhalt der Meldung: Standort, Beschreibung, optional Hersteller / Beobachtungsdatum, private Notizen",
                "Meldende Person (betroffene Person)",
                "Erstellung des öffentlichen Eintrags; Community-Aktionen zur Genauigkeit",
                "Art. 6 Abs. 1 lit. f DSGVO",
              ],
              [
                "Pseudonyme interne ID der beitragenden Person + Zeitstempel der Einreichung",
                "Meldende Person",
                "Missbrauchsverhinderung, Herkunftsnachweis",
                "Art. 6 Abs. 1 lit. f DSGVO",
              ],
              [
                "Konto der beitragenden Person (E-Mail, optionaler Anzeigename, Passwort-Hash)",
                "Beitragende Person (freiwillige Registrierung)",
                "Anmeldung, Zuordnung von Einreichungen, Missbrauchsverhinderung",
                "Art. 6 Abs. 1 lit. f DSGVO — Datenminimierung: optionaler, pseudonymer Name, mit PBKDF2-SHA256 gehashtes Passwort, nie in API-Antworten offengelegt",
              ],
              [
                "Sitzungsdaten (gehashtes Token, CSRF-Token, Zeitstempel)",
                "Das Projekt (Anmeldung)",
                "Angemeldet bleiben; CSRF-Schutz",
                "Art. 6 Abs. 1 lit. f DSGVO; Token nur als SHA-256 gespeichert, läuft nach 30 Tagen oder bei Abmeldung ab",
              ],
              [
                "Korrektur- / Löschantrag (von der antragstellenden Person angegebene Kontaktdaten, z. B. E-Mail)",
                "Antragstellende Person",
                "Ausübung von Rechten, Meldungen von Schäden",
                "Art. 6 Abs. 1 lit. c DSGVO (Artikel 15–22) und Art. 6 Abs. 1 lit. f",
              ],
              [
                "Community-Aktionen zu Einträgen (Aktionstyp `like` / `confirm` / `gone` / `problem` / `privacy`, Momentaufnahme der Gewichtung, Zeitstempel)",
                "Beitragende Person (verifiziertes Konto)",
                "Genauigkeit des Datensatzes — von der Community getragene Moderation",
                "Art. 6 Abs. 1 lit. f DSGVO; eine Aktion pro Person und Eintrag (`UNIQUE(camera_id, contributor_id)`), Momentaufnahme der Gewichtung zum Zeitpunkt der Aktion, **in öffentlichen Daten nur aggregiert** — nie einem Profil zugeordnet (ADR 0021 §3/§13)",
              ],
              [
                "OIDC-Identitätsattribute (Anbieter, Subject-ID, Anzeigename, Verifizierungskennzeichen — nie die E-Mail)",
                "GitHub / Google (Identitätsanbieter — nur wenn du diese Methode wählst)",
                "Optionale Anmeldung für Beitragende; Verknüpfung mit dem Konto der beitragenden Person",
                "Art. 6 Abs. 1 lit. f DSGVO; keine E-Mail importiert; der Anbieter sieht die Anmeldung und die IP-Adresse (§ 5/§ 6)",
              ],
              [
                "Einträge im Moderations-Audit (Entscheidung, Begründungscode, Zeitstempel, Pseudonym der prüfenden Person)",
                "Das Projekt",
                "Rechenschaftspflicht; historische Einsprüche durch Migration abgeschlossen (ADR 0021 §7)",
                "Art. 6 Abs. 1 lit. f DSGVO; nie öffentlich (nur aggregierte Transparenzberichte)",
              ],
              [
                "Veröffentlichte Einträge",
                "Veröffentlichte Meldungen / offizielle öffentliche Quellen",
                "Der öffentliche Datensatz (ODbL 1.0)",
                "Art. 6 Abs. 1 lit. f / Art. 6 Abs. 1 lit. e DSGVO",
              ],
            ],
          },
          {
            type: "note",
            text: "**Einträge aus offiziellen öffentlichen Quellen:** Wird ein Eintrag aus einer offiziellen öffentlichen Quelle übernommen, wurden die Daten nicht bei der betroffenen Person erhoben. Kategorien von Quellen: öffentliche Register und Transparenzportale öffentlicher Verwaltungen (zum Beispiel in Italien Datensätze nach D.Lgs. 33/2013), veröffentlichte Dokumente von Behörden und andere öffentlich zugängliche offizielle Quellen. Solche Einträge werden einzeln nach dem für die jeweilige Quelle geltenden Rechtsrahmen geprüft.",
          },
          {
            type: "note",
            text: "**Öffentliche Ereignishistorie pro Eintrag (ADR 0021 § 7):** Jeder Übergang in der Community (veröffentlicht, bestätigt, als nützlich markiert, als nicht mehr vorhanden gemeldet, ausgeblendet, entfernt, wiederhergestellt) wird in einer **öffentlichen Lebenszyklus-Historie ohne jede Zuordnung** festgehalten — keine IDs von Beitragenden, keine E-Mails und keine aus IP-Adressen abgeleiteten Daten in öffentlichen Zeilen. Sie ist ein Transparenzinstrument des Verantwortlichen, keine neue Erhebung personenbezogener Daten (nur Aggregate).",
          },
          {
            type: "note",
            text: "**Freiwillige Bereitstellung:** Die Angabe von Daten für eine Meldung ist **freiwillig** — sie ist weder gesetzlich noch vertraglich vorgeschrieben. Die einzige Folge einer Nichtangabe ist, dass die Meldung nicht bearbeitet werden kann. Es besteht keine Pflicht zur Angabe von Daten und es gibt keine Sanktion bei Verweigerung.",
          },
          {
            type: "note",
            text: "**Besondere Kategorien (Art. 9 DSGVO):** Es werden keine absichtlich erhoben. Einträge bestehen **ausschließlich aus Text-Metadaten** — die Funktion für Bildnachweise wurde entfernt (2026-08-08, Tabelle `photos` durch Migration 0043 gelöscht), sodass es überhaupt keinen Medien-Upload gibt. Meldungstext mit beiläufig enthaltenen personenbezogenen Daten (z. B. ein Name oder ein Kennzeichen in der Beschreibung) verstößt gegen die Inhaltsregeln und wird durch die Community-Moderation und Korrekturen behandelt.",
          },
          {
            type: "note",
            text: "**Kinder:** Der Dienst richtet sich an Erwachsene. In Italien setzt das Einreichen einer Meldung das Mindestalter für die Einwilligung bei Diensten der Informationsgesellschaft voraus (14 Jahre, Art. 2-quinquies D.Lgs. 196/2003); andere Rechtsordnungen wenden ihre eigenen Altersgrenzen an.",
          },
        ],
      },
      {
        heading: "4. Was wir NICHT erheben oder veröffentlichen",
        blocks: [
          {
            type: "list",
            items: [
              "**Keine Videos, Live-Streams, Zugangsdaten, Netzwerkinformationen oder Steuerungsoberflächen** — das Projekt dokumentiert die *Existenz* sichtbarer Überwachungsinfrastruktur, nie deren Aufnahmen oder Zugänge.",
              "**Keine Kameras an Privathäusern** und keine Kameras, die in private Innenräume gerichtet sind.",
              "**Keine Namen, Gesichter, Kfz-Kennzeichen oder genauen betrieblichen Details.**",
              "**Keine Koordinaten, die genauer als auf Zonenebene sind:** Veröffentlichte Standorte werden auf **ca. 4 Nachkommastellen (ca. 10 m)** gerundet; der genaue Standort bleibt in der Datenbank und wird nie veröffentlicht.",
              "**Keine verhaltensbasierte Werbung, kein Tracking, kein Verkauf von Daten**, keine Analysebibliotheken.",
              "Meldungen von verifizierten Konten werden sofort veröffentlicht und sind ab dem Moment der Einreichung Teil des öffentlichen Datensatzes. Inhalte, die gegen die Regeln verstoßen, werden von der Community oder im Rahmen eines rechtlichen Notfalls zurückgezogen, und zurückgezogene Inhalte werden nie erneut veröffentlicht.",
            ],
          },
        ],
      },
      {
        heading: "5. Empfänger und Übermittlungen",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare, Inc.** — Hosting und Datenbank (Workers + D1). Auftragsverarbeiter (Art. 28) auf Grundlage des Cloudflare Data Processing Addendum (DPA v6.3, Juni 2025), das die **EU-Standardvertragsklauseln (2021/914)** einbezieht; Cloudflare ist nach dem **Datenschutzrahmen EU-USA (EU–US Data Privacy Framework)** zertifiziert. D1 ist für die Datenhaltung in der EU konfiguriert.",
              "**OpenStreetMap Foundation (Nominatim — nominatim.openstreetmap.org, Auftragsverarbeiter PR6).** Geocoding für den Meldeablauf und die Seiten der Einträge: Vorwärtssuche nach Ortsnamen (`GET /api/geocode`, bis zu 5 Vorschläge) und Rückwärtssuche Koordinaten→Adresse (`GET /api/geocode/reverse`, Vorbefüllung des Meldeformulars). Gesendet wird nur die Anfrage selbst — Freitext-Orts- bzw. Adressangaben und auf ca. 4 Nachkommastellen (ca. 11 m) gerundete Koordinaten; die Antwort (angezeigte Adresse) wird im D1-Cache (`geocode_reverse_cache`) gespeichert. **Keine personenbezogenen Daten, keine Kontodaten, kein Profiling; Daten der anfragenden Person werden nie gesendet oder protokolliert.** Die Nutzung entspricht der Nominatim-Richtlinie: höchstens **1 Anfrage/s**, identifizierender User-Agent, Cache zuerst.",
              "**GitHub, Inc. / Google LLC (OIDC-Identitätsanbieter — optional, nur wenn du diese Methode wählst).** Sie sind **eigenständige Verantwortliche für ihre eigenen Authentifizierungsdienste** (bei der Anmeldung gelten ihre Datenschutzrichtlinien); es werden keine Daten von OpenSurveillanceDB an sie gesendet — wir erhalten nur die in § 3 aufgeführten Identitätsattribute (Anbieter, Subject-ID, Anzeigename, Verifizierungskennzeichen; nie die E-Mail). Der Anbieter sieht die Anmeldung und deine IP-Adresse. Nie veröffentlicht, nie protokolliert.",
              "**Die Veröffentlichung selbst:** Veröffentlichte Einträge werden Teil eines öffentlichen, unter ODbL 1.0 lizenzierten Datensatzes und können heruntergeladen oder exportiert werden (JSON/CSV/GeoJSON). Bereits heruntergeladene Kopien können nicht zurückgerufen werden; zurückgezogene Einträge sind von künftigen Exporten ausgeschlossen.",
              "Keine weiteren Empfänger; keine verhaltensbasierte Werbung; keine Analysebibliotheken.",
            ],
          },
        ],
      },
      {
        heading: "6. Internationale Datenübermittlungen",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare:** Übermittlungen abgedeckt durch das Cloudflare-DPA, das die **EU-Standardvertragsklauseln (2021/914)** einbezieht; ergänzende Maßnahmen für die Verarbeitung in den USA wurden bewertet (Verschlüsselung bei der Übertragung, Datenhaltung in der EU für D1).",
              "**OIDC-Anmeldung (GitHub/Google, wenn du diese Methode wählst):** Identitätsattribute (Anbieter, Subject-ID, Anzeigename, Verifizierungskennzeichen) werden bei der Anmeldung mit den Diensten des Anbieters ausgetauscht; der Ablauf unterliegt den Nutzungsbedingungen und der Datenschutzrichtlinie des Anbieters.",
            ],
          },
        ],
      },
      {
        heading: "7. Speicherdauer",
        blocks: [
          {
            type: "paragraph",
            text: "Meldungen werden sofort veröffentlicht und bleiben öffentlich, solange die Community sie weiter bestätigt; von der Community oder im Rahmen eines rechtlichen Notfalls zurückgezogene Einträge sind von öffentlichen Ausgaben ausgeschlossen und folgen dem Aufbewahrungsplan im Repository (docs/legal/RETENTION_SCHEDULE.md). Korrekturanträge und Audit-Einträge: 2 Jahre. Betriebsprotokolle: bis zu 12 Monate (aggregiert). Backups: vom Anbieter rotiert (bis zu 30 Tage Wiederherstellung zu einem beliebigen Zeitpunkt).",
          },
          {
            type: "paragraph",
            text: "Die detaillierten Regeln stehen weiterhin im Aufbewahrungsplan im Repository (docs/legal/RETENTION_SCHEDULE.md), darunter: Community-Daten (R14) — Community-Aktionen folgen dem Konto (aktiv → Löschung; Aktionen zu anderen Einträgen werden mit der beitragenden Person gelöscht, ADR 0021 § 13, und die öffentliche Lebenszyklus-Historie behält nur Aggregate); Daten der Authentifizierungsmethoden (R15, ADR 0020) — Tokens zur E-Mail-Bestätigung 24 Stunden, Tokens zum Zurücksetzen 3 Stunden (einmalig verwendbar, bei Verwendung gelöscht); Passkeys und Wiederherstellungscodes, solange das Konto aktiv ist, bei Löschung des Kontos endgültig gelöscht — nichts bleibt erhalten, das das Konto mit einem Anbieter oder einem Gerät verknüpfen könnte; Zähler fehlgeschlagener Anmeldungen (R16), Protokoll der Registrierungsgrenze pro IP (R17) und das Protokoll transaktionaler E-Mails (R18) werden vom Aufbewahrungs-Cron bereinigt; Demo-Einträge (R12) werden außerhalb der Entwicklung vom Aufbewahrungs-Cron entfernt.",
          },
          {
            type: "paragraph",
            text: "Die Lösch- und Ablaufregeln werden automatisch durch die tägliche Aufbewahrungsbereinigung durchgesetzt (geplant in `worker/index.ts`, täglich um 03:00 UTC — RETENTION_SCHEDULE.md § 3): Der Cron löscht abgelaufene Zeilen (R12/R16/R17/R18), löscht Alt-Einreichungen mit Status `pending` 90 Tage nach der Einreichung endgültig (**R19**) und Alt-Einträge mit Status `rejected` 30 Tage nach der Entscheidung (**R20**; beides wird übersprungen, solange ein Einspruch offen oder eine rechtliche Sperre aktiv ist), archiviert Audit-Einträge nach 2 Jahren (R4/R5/R9) und ändert nie den Lebenszyklus-Status veröffentlichter Einträge (Community-Modell, ADR 0021 § 2.2).",
          },
        ],
      },
      {
        heading: "8. Deine Rechte (Artikel 15–22 DSGVO)",
        blocks: [
          {
            type: "paragraph",
            text: "Du kannst kostenlos Folgendes verlangen:",
          },
          {
            type: "list",
            items: [
              "**Auskunft** (Art. 15) — Bestätigung und Kopie deiner Daten.",
              "**Berichtigung** (Art. 16) — Korrektur unrichtiger Daten.",
              "**Löschung** (Art. 17) — vorbehaltlich der Ausnahmen in Art. 17 Abs. 3 und des Aufbewahrungsplans.",
              "**Einschränkung der Verarbeitung** (Art. 18) und **Widerspruch** (Art. 21).",
              "**Datenübertragbarkeit** (Art. 20) — soweit technisch anwendbar.",
              "Es findet keine automatisierte Entscheidungsfindung einschließlich Profiling statt (Art. 22).",
            ],
          },
          {
            type: "paragraph",
            text: "**So übst du sie aus:** Schreibe an [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Zum Schutz der betroffenen Personen können wir dich bitten, deine Identität in einem dem Antrag angemessenen Umfang nachzuweisen.",
          },
          {
            type: "paragraph",
            text: "**Fristen:** Wir antworten innerhalb von **1 Monat** (Art. 12 Abs. 3); bei komplexen Anträgen kann diese Frist mit Mitteilung um bis zu 2 weitere Monate verlängert werden. Lehnen wir ab, erklären wir die Gründe und weisen dich auf dein Beschwerderecht hin.",
          },
          {
            type: "paragraph",
            text: "**Beschwerden:** Du kannst dich bei der zuständigen Aufsichtsbehörde beschweren — in Italien beim [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Kontakt und Überprüfung",
        blocks: [
          {
            type: "paragraph",
            text: "Datenschutzkontakt: [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — erste Antwort innerhalb von 48 Stunden, inhaltliche Antwort innerhalb von 14 Tagen.",
          },
          {
            type: "paragraph",
            text: "Diese Erklärung wird mindestens einmal jährlich oder bei jeder wesentlichen Änderung überprüft; die Versionshistorie wird im Repository geführt.",
          },
        ],
      },
      {
        heading: "10. Cookies",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB verwendet nur die unten aufgeführten Cookies. Alle sind unbedingt erforderlich oder funktional: Sie enthalten keine Tracking-Kennungen, werden nie an Dritte weitergegeben und nicht für Analyse, Werbung oder Profiling verwendet. Deshalb wird kein Einwilligungsbanner angezeigt.",
          },
          {
            type: "table",
            caption: "Von OpenSurveillanceDB gesetzte Cookies",
            headers: ["Cookie", "Zweck", "Wann es gesetzt wird", "Dauer", "Eigenschaften"],
            rows: [
              ["**opensurveillancedb-locale**", "Speichert deine Oberflächensprache (en, it, fr, de, es oder pt). Es wird auch gelesen, wenn du eine Bestätigungs- oder Passwort-Zurücksetzungs-E-Mail anforderst, damit die Nachricht auf Englisch und in deiner Sprache ankommt.", "Wenn du im Sprachmenü eine Sprache wählst oder einen Sprachlink öffnest (/api/locale)", "1 Jahr", "SameSite=Lax, path=/"],
              ["**opensurveillancedb-theme**", "Speichert das helle oder dunkle Farbschema, das du gewählt hast (light / dark). Ohne dieses Cookie folgt die Website deiner Systemeinstellung.", "Wenn du den Design-Schalter benutzt", "1 Jahr", "SameSite=Lax, path=/"],
              ["**osdb_session**", "Hält dich angemeldet: enthält ein zufälliges Sitzungstoken (unsere Server speichern nur dessen Hash).", "Wenn du dich anmeldest oder ein Konto erstellst; wird beim Abmelden gelöscht", "Dauer der Anmeldung (standardmäßig 30 Tage) oder bis du dich abmeldest", "HttpOnly, Secure, SameSite=Strict, path=/"],
              ["**osdb_csrf**", "Schützt die Aktionen, die du angemeldet ausführst, vor websiteübergreifender Anfragefälschung (CSRF): enthält ein zufälliges sitzungsbezogenes Token, das die Seite bei jeder Änderung zurücksendet.", "Zusammen mit osdb_session; wird beim Abmelden gelöscht", "Wie osdb_session", "Secure, SameSite=Strict, path=/; absichtlich für die eigenen Skripte der Website lesbar"],
            ],
          },
          {
            type: "list",
            items: [
              "**Inhalt:** Keines dieser Cookies enthält deinen Namen, deine E-Mail-Adresse oder andere personenbezogene Daten; die beiden Anmelde-Cookies enthalten zufällige Tokens, die außerhalb dieser Website bedeutungslos sind.",
              "**Rechtsgrundlage:** Art. 122 D.Lgs. 196/2003 (zur Umsetzung von Art. 5 Abs. 3 der Richtlinie 2002/58/EG in der durch die Richtlinie 2009/136/EG geänderten Fassung) — für Cookies, die unbedingt erforderlich sind, um einen ausdrücklich von der nutzenden Person gewünschten Dienst bereitzustellen, ist **keine** Einwilligung erforderlich; daher wird kein Einwilligungsbanner angezeigt.",
              "**Verwaltung:** Du kannst sie jederzeit in deinen Browsereinstellungen löschen. Ohne das Sprach-Cookie wird die Oberfläche in der Pilotsprache (Englisch) angezeigt; ohne das Design-Cookie folgt sie deiner Systemeinstellung; wenn du die Anmelde-Cookies löschst, wirst du abgemeldet.",
            ],
          },
          {
            type: "paragraph",
            text: "Die Spracheinstellung wird zur Synchronisierung zwischen mehreren Tabs außerdem im `localStorage` deines Browsers gespiegelt. `localStorage` ist eine Speichertechnologie des Browsers, kein Cookie, und wird nie an unsere Server übertragen.",
          },
          {
            type: "note",
            text: "**Verpflichtung:** Sollte eine künftige Funktion Cookies einführen, die nicht unbedingt erforderlich sind (Analyse, Werbung, Profiling), holen wir **vor** deren Setzen über ein Banner deine ausdrückliche Einwilligung ein, gemäß Art. 122 D.Lgs. 196/2003.",
          },
        ],
      },
    ],
  },

  terms: {
    eyebrow: "Rechtliches · Nutzungsbedingungen",
    title: "Nutzungsbedingungen",
    intro:
      "Diese Bedingungen regeln die Nutzung von OpenSurveillanceDB, der offenen, von der Community gepflegten Datenbank sichtbarer öffentlicher Überwachungsinfrastruktur. Sie gelten für die Webanwendung, die öffentliche API, die Datenexporte und zugehörige Dienste („der Dienst“).",
    versionNote:
      "Version 0.6 — 12. November 2026. § 6.3 aktualisiert: Die Moderation prüft Einträge, die durch Datenschutzmeldungen der Community ausgeblendet wurden; von der Moderation oder der Administration beschlossene Entfernungen werden nie durch Community-Aktionen rückgängig gemacht und können nur per Einspruch angefochten werden (kanonische TERMS_OF_USE v0.10).",
    sections: [
      {
        heading: "1. Wer wir sind",
        blocks: [
          {
            type: "paragraph",
            text: "**Verantwortlicher / Betreiber:** Simone Rondina (syax89) / OpenSurveillanceDB — Italien.",
          },
          {
            type: "paragraph",
            text: "**Kontakt:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — ein eigenes Postfach — für alle Fragen, Korrekturen, Entfernungs- oder Datenschutzanfragen. Antwortzeiten: erste Antwort innerhalb von 48 Stunden, inhaltliche Entscheidung innerhalb von 14 Tagen.",
          },
        ],
      },
      {
        heading: "2. Geltungsbereich dieser Bedingungen",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB ist ein **nicht-kommerzielles, von der Community getragenes Projekt für zivilgesellschaftliche Transparenz**, das **sichtbare öffentliche Überwachungsinfrastruktur** dokumentiert (zum Beispiel Kameras an öffentlichen Straßen, Plätzen oder an der Außenseite von Bahnhöfen). Die Nutzung ist kostenlos: keine Werbung, kein verhaltensbasiertes Profiling, kein Verkauf von Daten.",
              "Mit der Nutzung des Dienstes akzeptierst du diese Bedingungen. Wenn du **eine Meldung einreichst**, akzeptierst du zusätzlich die Pflichten für Einreichungen in Abschnitt 5.",
              "Der Dienst bietet keine Videobilder, keine Tracking-Werkzeuge, keinen Zugang zu privaten Kameras und keine Tipps, wie man rechtmäßiger Überwachung ausweicht.",
            ],
          },
        ],
      },
      {
        heading: "3. Erlaubte Nutzung des Dienstes",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Einsicht:** die Karte, das Verzeichnis der Einträge und einzelne Eintragsseiten durchsuchen; den öffentlichen Datensatz durchsuchen und lesen.",
              "**Exporte:** öffentliche Daten über die Exporte in JSON/CSV/GeoJSON und die öffentliche API herunterladen und weiterverwenden, vorbehaltlich der Lizenz ODbL 1.0 (Abschnitt 7) und der Missbrauchsgrenzen in Abschnitt 4.",
              "**Meldungen:** Beobachtungen sichtbarer öffentlicher Überwachungsinfrastruktur einreichen. Eine Meldung von einem verifizierten Konto wird **sofort veröffentlicht** und ist ab der Einreichung Teil des öffentlichen Datensatzes (Abschnitt 5).",
              "**Rechtmäßige Zwecke:** Die Daten dürfen für Forschung, Journalismus, zivilgesellschaftliches Engagement und alle Zwecke verwendet werden, die mit diesen Bedingungen und der Lizenz ODbL 1.0 vereinbar sind. Für das Durchsuchen der öffentlichen Daten ist nie ein Konto erforderlich. Für das Einreichen einer Meldung oder Korrektur ist ein verifiziertes Konto erforderlich (Abschnitt 3.5; ADR 0020), und jede Einreichung wird ihm über eine **pseudonyme interne ID** zugeordnet — eine Pflicht zum Klarnamen besteht nie.",
              "**Authentifizierungsmethoden (mehrere Methoden, ADR 0020).** Konten von Beitragenden unterstützen **drei Methoden**, und du wählst: **(a) E-Mail + Passwort** — die Grundlage, wobei für **Schreibzugriff eine E-Mail-Bestätigung erforderlich ist** (einmalig verwendbarer Link, 24 h; bis zur Bestätigung ist deine Sitzung schreibgeschützt); **(b) Passkeys (WebAuthn)** — optional, ohne Passwort; **(c) OIDC über GitHub oder Google** — optional, nur auf eigenen Wunsch. Die Regeln:",
            ],
          },
          {
            type: "list",
            items: [
              "**E-Mail-Bestätigung.** Nach der Registrierung musst du die E-Mail-Adresse bestätigen, bevor du Einträge einreichen, bearbeiten oder bestätigen kannst; bis dahin ist deine Sitzung schreibgeschützt. E-Mails zur Bestätigung und zum Zurücksetzen des Passworts werden über Cloudflare Email Routing ohne Tracking-Inhalte versendet. Eine E-Mail-Adresse = ein Konto; halte sie erreichbar, falls du dein Passwort verlierst.",
              "**Passkeys.** Wenn du einen Passkey registrierst, speichert die Website nur Material des öffentlichen Schlüssels; der private Schlüssel bleibt auf deinem Gerät. **Hinweis zu Anbietern:** *Synchronisierte* Passkeys werden nach deiner Wahl über die Cloud des Betriebssystemanbieters (Apple/Google/Microsoft) gesichert — der Anbieter erfährt, dass du hier ein Konto hast, die Website teilt nichts mit ihm, und du kontrollierst die Synchronisierung. Bewahre die 10 bei der Registrierung ausgegebenen Wiederherstellungscodes sicher auf; ohne sie kann ein verlorenes Gerät bedeuten, dass du den Zugang über die Passkey-Methode verlierst (der Weg über E-Mail + Passwort bleibt bestehen).",
              "**OIDC über GitHub/Google — Hinweis zum Tracking.** Wenn du dich mit GitHub oder Google anmeldest, **sieht GitHub bzw. Google bei jeder Anmeldung, dass du dich bei diesem Dienst anmeldest, sowie deine IP-Adresse**; bei der Anmeldung gelten die Nutzungsbedingungen und die Datenschutzrichtlinie des Anbieters. Wir **importieren deine E-Mail nicht** vom Anbieter (nur Subject-ID, Anzeigename und Verifizierungskennzeichen) und führen Konten nie automatisch anhand einer übereinstimmenden E-Mail zusammen — ein Konflikt erfordert eine manuelle, verifizierte Zusammenführung. Diese Methode ist **freiwillig und offengelegt** (Risikomatrix auf der Anmeldeseite); die Schaltflächen werden nur angezeigt, wenn der Betreiber den Anbieter aktiviert hat (Zugangsdaten auf dieser Installation konfiguriert).",
              "Du kannst Methoden jederzeit auf deiner Kontoseite hinzufügen, ändern oder entfernen; die Löschung deines Kontos löscht die Daten aller Methoden (Datenschutzerklärung § 7 R15, § 8).",
            ],
          },
        ],
      },
      {
        heading: "4. Was du nicht tun darfst",
        blocks: [
          {
            type: "paragraph",
            text: "**Verbotene Inhalte.** Die Ausschlüsse der Veröffentlichungsregeln gelten für alles, was du sendest, einschließlich Meldungen und Notizen. Reiche insbesondere Folgendes nicht ein:",
          },
          {
            type: "list",
            items: [
              "Kameras an Wohnhäusern oder private Kameras, einschließlich Türklingeln und Kameras, die auf ein Privathaus gerichtet sind;",
              "Live-Videos, Stream-URLs, Zugangsdaten, Netzwerkinformationen oder Steuerungsoberflächen;",
              "detailliertes Sichtfeld oder betriebliche Fähigkeiten, die ein Sicherheitsrisiko schaffen könnten;",
              "sensible Einrichtungen oder Orte, bei denen eine Veröffentlichung das Risiko erheblich erhöhen könnte;",
              "nicht überprüfbare Behauptungen über Personen oder Organisationen;",
              "Inhalte, die du nicht teilen darfst.",
            ],
          },
          {
            type: "paragraph",
            text: "**Keine unnötigen personenbezogenen Daten.** Meldungen und Notizen dürfen keine personenbezogenen Daten enthalten, die nicht dem öffentlichen Eintrag dienen (Datenminimierung).",
          },
          {
            type: "paragraph",
            text: "**Kein Missbrauch.** Überschreite nicht die geltenden Ratenbegrenzungen, scrape den Dienst nicht über eine angemessene persönliche Nutzung hinaus, versuche nicht, auf nicht öffentliche Einträge zuzugreifen (zurückgezogene Einträge, Korrekturanträge), umgehe keine Zugriffskontrollen und nutze den Dienst nicht, um andere zu belästigen oder Schaden zu ermöglichen.",
          },
          {
            type: "paragraph",
            text: "**Kein kommerzieller Weiterverkauf des Dienstes selbst.** Die Weiterverwendung der *Daten* unter ODbL 1.0 (einschließlich kommerzieller Weiterverwendung) bleibt erlaubt; diese Klausel betrifft den Weiterverkauf des Dienstes als Produkt.",
          },
        ],
      },
      {
        heading: "5. Meldungen und Veröffentlichung",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Sofortige Veröffentlichung.** Eine Meldung von einer verifizierten beitragenden Person wird sofort veröffentlicht: Sie wird Teil des öffentlichen Datensatzes, sobald sie eingereicht ist. Es gibt keine Prüfwarteschlange und keine Wartezeit. Die Community hält das Verzeichnis aktuell: Einträge werden bestätigt, als nicht mehr vorhanden gemeldet, als nützlich markiert oder über automatische Schwellen zurückgezogen (ADR 0021). Ein Eintrag kann jederzeit durch ausreichend viele Community-Signale oder durch eine Entscheidung im rechtlichen Notfall ausgeblendet oder entfernt werden; zurückgezogene Einträge bleiben über einen direkten Link mit einem Hinweisbanner und einer öffentlichen Ereignishistorie erreichbar und können durch ausreichend viele Bestätigungen wiederhergestellt werden.",
              "**Was du behältst und was du einräumst.** Du behältst alle Rechte, die du an den eingereichten Inhalten hast. Mit der Einreichung räumst du dem Projekt eine nicht ausschließliche, weltweite, unentgeltliche Lizenz ein, die Meldung als Teil der offenen Datenbank zu speichern, zu prüfen und zu veröffentlichen, die unter **ODbL 1.0** bereitgestellt wird, mit Namensnennung der Beitragenden gemäß dem ODbL-Hinweis. Die Veröffentlichung erfolgt bei der Einreichung, nicht nach einem Genehmigungsschritt.",
              "**Deine Zusicherungen.** Mit der Einreichung bestätigst du, dass: die Inhalte nach bestem Wissen zutreffend sind; du berechtigt bist, sie zu teilen; sie Abschnitt 4 entsprechen; und du das Mindestalter für die Nutzung des Dienstes in deiner Rechtsordnung erreicht hast (in Italien 14 Jahre).",
              "**Genauigkeit durch die Community.** Aus offiziellen öffentlichen Quellen übernommene Einträge folgen ihrem eigenen Rechtsrahmen und werden einzeln geprüft; Meldungen der Community werden durch Bestätigungen und Meldungen der Community nach den automatischen Schwellen aktuell gehalten, nicht durch Abgleich mit offiziellen Registern.",
            ],
          },
        ],
      },
      {
        heading: "6. Community-Aktionen, Korrekturen, rechtliche Notfälle",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Community-Aktionen.** Jedes verifizierte Konto kann einen Eintrag als nützlich markieren, bestätigen, dass er noch vorhanden ist, ihn als nicht mehr vorhanden melden oder ein Problem bzw. ein Datenschutzanliegen melden. Ein Konto, eine aktive Aktion pro Eintrag. Automatische Schwellen — darunter eine bewusst niedrige Datenschutzschwelle — entscheiden, wann ein Eintrag ausgeblendet oder entfernt wird; jeder Übergang wird ohne Zuordnung zu einem Profil in der öffentlichen Historie des Eintrags festgehalten.",
              "**Korrekturen.** Jede Person kann über das private Korrekturformular (Startseite, Abschnitt „Problem melden / Korrektur“) oder über [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) eine Korrektur oder Entfernung beantragen. Anträge sind privat, werden von einem Menschen geprüft und ändern die Karte nie automatisch. Antwortziele: erste Antwort innerhalb von **48 Stunden**, inhaltliche Antwort innerhalb von **14 Tagen**; Ausblendungen bei rechtlichen Notfällen erfolgen sofort.",
              "**Rechtliche Notfälle und Entscheidungen der Moderation.** Die Administration kann einen Eintrag sofort ausblenden oder entfernen, wenn das Gesetz es verlangt (mit nachträglicher Prüfung), und die Moderation prüft Einträge, die durch Datenschutzmeldungen der Community ausgeblendet wurden, und bestätigt oder hebt das Ausblenden auf. Eine von der Moderation oder der Administration beschlossene Entfernung wird nie durch Community-Aktionen rückgängig gemacht: Sie kann nur über das Einspruchsverfahren angefochten werden.",
              "Die Rechte betroffener Personen (Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Datenübertragbarkeit) sind in der [Datenschutzerklärung](/privacy) beschrieben und werden über denselben Kontakt ausgeübt.",
            ],
          },
        ],
      },
      {
        heading: "7. Lizenzen",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Daten:** Die öffentliche Datenbank und ihre Exporte sind unter **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** lizenziert — die Weiterverwendung ist erlaubt, auch kommerziell, sofern du die Datenbank nennst und eine abgeleitete Datenbank, falls du eine erstellst, unter ODbL 1.0 weitergibst. Exporte enthalten den ODbL-Hinweis. Beispielhafte Demo-Einträge sind Teil der lizenzierten Datenbank.",
              "**Software:** Der Quellcode der Anwendung ist unter **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)** lizenziert.",
              "**Dokumentation:** Die Projektdokumentation wird unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) vorgeschlagen.",
              "**OpenStreetMap:** Die Daten des Kartenhintergrunds werden gemäß den OSM/ODbL-Bedingungen verwendet; es gelten die Namensnennungspflichten von OSM.",
            ],
          },
        ],
      },
      {
        heading: "8. Haftungsausschluss zur Genauigkeit",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB ist ein **zivilgesellschaftlicher, von der Community gepflegter Datensatz — kein amtliches Verzeichnis und keine Feststellung rechtlicher Tatsachen.** Einträge können trotz der Pflege durch die Community unvollständig, veraltet oder ungenau sein; die Veröffentlichung erfolgt sofort, nicht zurückhaltend.",
              "Verlasse dich bei sicherheitskritischen oder amtlichen Entscheidungen nicht auf den Datensatz. Überprüfe die Angaben anhand offizieller Quellen (zum Beispiel der zuständigen öffentlichen Verwaltung), bevor du danach handelst. Der Dienst bietet nur Informationen über sichtbare Infrastruktur — er ist kein Verzeichnis aller Kameras, und das Fehlen eines Eintrags beweist nichts.",
              "Einträge aus offiziellen Quellen sind mit ihrer Quelle und ihrem Prüfdatum gekennzeichnet; Einträge der Community bieten keine solche Gewähr.",
              "Veröffentlichte Koordinaten werden auf **ca. 4 Nachkommastellen (ca. 10 m)** gerundet — Genauigkeit auf Zonenebene. Der genaue Standort wird nie veröffentlicht und bleibt in der Datenbank.",
            ],
          },
        ],
      },
      {
        heading: "9. Datenschutz",
        blocks: [
          {
            type: "paragraph",
            text: "Deine Nutzung des Dienstes unterliegt der [Datenschutzerklärung](/privacy). Die wichtigsten Punkte: kein Tracking, keine verhaltensbasierte Werbung; Meldungen sind öffentlich, sobald sie veröffentlicht werden, und private Korrekturanträge bleiben privat; deine Rechte nach der DSGVO kannst du über [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) innerhalb der gesetzlichen Fristen ausüben (Art. 12 Abs. 3 DSGVO).",
          },
        ],
      },
      {
        heading: "10. Verfügbarkeit und Haftungsbeschränkung",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Der Dienst wird **„wie besehen“ und „wie verfügbar“** bereitgestellt, ohne Gewähr für Richtigkeit, Vollständigkeit, Verfügbarkeit oder Eignung für einen bestimmten Zweck.",
              "Soweit gesetzlich zulässig, **haften** das Projekt und seine Beitragenden **nicht** für Schäden — einschließlich indirekter, zufälliger oder Folgeschäden —, die aus der Nutzung des Dienstes oder seiner Daten oder dem Vertrauen darauf entstehen. Insbesondere haftet das Projekt nicht für Entscheidungen, die auf Grundlage des Datensatzes getroffen werden.",
              "Nichts in diesen Bedingungen schließt eine Haftung aus oder beschränkt sie, die gesetzlich nicht ausgeschlossen oder beschränkt werden kann (zum Beispiel bei Betrug, bei durch Fahrlässigkeit verursachtem Tod oder Personenschaden oder bei zwingenden Verbraucherschutzrechten).",
              "Der Dienst ist nicht für Notfälle oder sicherheitskritische Zwecke bestimmt; er ersetzt keine offiziellen Informationskanäle.",
            ],
          },
        ],
      },
      {
        heading: "11. Sperrung und Entfernung",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Wir können den Zugang sperren oder einschränken oder Inhalte entfernen, wenn dies erforderlich ist, um diese Bedingungen durchzusetzen, Nutzende oder betroffene Personen zu schützen, oder gemäß den Veröffentlichungsregeln — wobei wir anstreben, die betroffene Person zu benachrichtigen, soweit dies verhältnismäßig und möglich ist.",
              "Beitragende können die Löschung ihrer Meldungen über [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) beantragen; veröffentlichte Einträge bleiben öffentlich, solange die Community sie weiter bestätigt, und folgen den Korrektur- und Rückzugswegen nach Abschnitt 6.",
            ],
          },
        ],
      },
      {
        heading: "12. Anwendbares Recht und Gerichtsstand",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Diese Bedingungen unterliegen dem **Recht der EU und, soweit anwendbar, italienischem Recht** — insbesondere der DSGVO und dem D.Lgs. 196/2003 (Codice Privacy, in der durch das D.Lgs. 101/2018 geänderten Fassung).",
              "**Streitigkeiten:** Zuständig sind die Gerichte am Ort der Niederlassung des Verantwortlichen (Italien), **unbeschadet** des Rechts von Verbraucherinnen und Verbrauchern mit Wohnsitz in der EU, vor den Gerichten ihres eigenen Wohnsitzstaates zu klagen, und des Schutzes durch die zwingenden Vorschriften ihres nationalen Rechts.",
              "**Beschwerden:** Du kannst dich bei der zuständigen Aufsichtsbehörde beschweren — in Italien beim [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
            ],
          },
        ],
      },
      {
        heading: "13. Änderungen dieser Bedingungen",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Diese Bedingungen sind versioniert und im Repository gespeichert. **Wesentliche Änderungen** (Zweck, Lizenzierung, Veröffentlichung von Daten, Governance) erfordern einen dokumentierten öffentlichen Vorschlag und eine angemessene Frist für Kommentare.",
              "Unwesentliche Änderungen treten mit ihrer Veröffentlichung und einem Hinweis in Kraft. Die weitere Nutzung des Dienstes nach dem Inkrafttreten gilt als Zustimmung; wo das Gesetz eine Einwilligung verlangt, wird diese gesondert eingeholt.",
            ],
          },
        ],
      },
      {
        heading: "14. Kontakt",
        blocks: [
          {
            type: "list",
            items: [
              "**Datenschutz, Korrekturen, Rechte:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) (eigenes Postfach).",
              "Rechtliche Notfälle und Missbrauchsmeldungen nutzen denselben Kanal (sofortiges Ausblenden).",
            ],
          },
        ],
      },
    ],
  },

  licenses: {
    eyebrow: "Rechtliches · Lizenzen",
    title: "Lizenzen",
    intro:
      "Wie Software, Dokumentation und Daten von OpenSurveillanceDB lizenziert sind und was das für die Weiterverwendung bedeutet.",
    versionNote:
      "Aktualisiert am 31. Juli 2026 (Entscheidung zur Datenlizenz — ADR 0008) und am 5. August 2026 (importierte öffentliche Datensätze). Die Kopie im Repository (docs/OPEN_SOURCE.md) bleibt maßgeblich.",
    sections: [
      {
        heading: "1. Software",
        blocks: [
          {
            type: "paragraph",
            text: "Der Quellcode der Anwendung ist unter **AGPL-3.0-or-later** lizenziert. So bleiben veränderte Versionen, die als Netzwerkdienst betrieben werden, für die Community verfügbar. Siehe die Datei [LICENSE](https://github.com/Syax89/open-surveillance-db/blob/main/LICENSE).",
          },
        ],
      },
      {
        heading: "2. Dokumentation",
        blocks: [
          {
            type: "paragraph",
            text: "Sofern ein Dokument nichts anderes angibt, wird die Projektdokumentation unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) vorgeschlagen. Beitragende werden für ihre Beiträge über die normale Historie des Repositorys genannt.",
          },
        ],
      },
      {
        heading: "3. Datenbank und Exporte",
        blocks: [
          {
            type: "paragraph",
            text: "Die öffentliche Datenbank und alle Exportformate sind unter **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** lizenziert, mit klaren Hinweisen zur Namensnennung und zur Weitergabe unter gleichen Bedingungen (Entscheidung vom 31. Juli 2026, [ADR 0008](https://github.com/Syax89/open-surveillance-db/blob/main/docs/decisions/0008-data-licence-precision-retention-contact.md)). Die Weiterverwendung ist erlaubt, auch kommerziell, sofern du die Datenbank nennst und eine abgeleitete Datenbank, falls du eine erstellst, unter ODbL 1.0 weitergibst.",
          },
          {
            type: "note",
            text: "Importierte Quellen behalten ihre eigene Lizenz und Namensnennung; die ODbL-Lizenz gilt für die eigene Zusammenstellung des Projekts (siehe Abschnitt 6).",
          },
        ],
      },
      {
        heading: "4. OpenStreetMap-Daten",
        blocks: [
          {
            type: "paragraph",
            text: "OpenStreetMap-Daten sind unter der [Open Database License](https://www.openstreetmap.org/copyright) verfügbar. Die Verwendung eines OSM-Kartenhintergrunds macht nicht automatisch jeden Eintrag des Projekts zu einem OSM-Beitrag. Werden Daten aus OSM importiert, davon abgeleitet oder zu einer abgeleiteten Datenbank kombiniert, muss das Projekt die Beziehung dokumentieren, die erforderliche Namensnennung angeben und die Pflichten der ODbL einhalten.",
          },
        ],
      },
      {
        heading: "5. Zusicherung der Beitragenden",
        blocks: [
          {
            type: "paragraph",
            text: "Beitragende dürfen nur Material einreichen, das sie teilen dürfen. Sie räumen dem Projekt die Rechte ein, die nötig sind, um angenommenen Code, Dokumentation und Daten unter der jeweiligen Projektlizenz zu veröffentlichen. ",
          },
        ],
      },
      {
        heading: "6. Importierte öffentliche Datensätze",
        blocks: [
          {
            type: "paragraph",
            text: "Das Projekt kann öffentliche Datensätze integrieren, die von öffentlichen Verwaltungen und Open-Data-Projekten veröffentlicht werden (zum Beispiel städtische Kamerainventare oder Überwachungsobjekte aus OpenStreetMap). Jede integrierte Quelle behält ihre eigene Lizenz und Namensnennung: Die oben genannte Datenbanklizenz gilt für die eigene Zusammenstellung des Projekts und ersetzt nie die Lizenz einer einzelnen Quelle. Die Seite [Datenquellen](/fonti) führt jeden importierten Datensatz mit Quelle, Lizenz, Importdatum, Anzahl der Einträge und dem erforderlichen Text zur Namensnennung auf.",
          },
          {
            type: "note",
            text: "Aus einer Quelle importierte Einträge sind auf der Eintragsseite mit ihrer Herkunft gekennzeichnet. Sie unterliegen derselben Überprüfung durch die Community wie jeder andere Eintrag und sind nie von der Prüfung ausgenommen.",
          },
        ],
      },
    ],
  },

  accessibility: {
    eyebrow: "Informationen · Barrierefreiheit",
    title: "Erklärung zur Barrierefreiheit",
    intro:
      "OpenSurveillanceDB ist eine zivilgesellschaftliche Datenbank im öffentlichen Interesse. Diese Erklärung beschreibt unsere Verpflichtung zur Barrierefreiheit, den aktuellen Stand der Konformität und wie du eine Barriere melden kannst.",
    versionNote:
      "Version 0.2 — 8. August 2026. In Kraft (persönliches Open-Source-Projekt). Die Kopie im Repository (docs/ACCESSIBILITY_STATEMENT.md) bleibt maßgeblich.",
    sections: [
      {
        heading: "1. Verpflichtung",
        blocks: [
          {
            type: "paragraph",
            text: "Die zentralen Abläufe — stöbern, suchen, einreichen und korrigieren/entfernen — müssen mit der Tastatur, mit assistiven Technologien und auf kleinen Bildschirmen nutzbar sein, in der Pilotsprache und auf Englisch. Ziel für die öffentliche Website ist **WCAG 2.2 AA**, mit manuellen Tests durch Menschen mit Behinderungen, bevor der Pilotbetrieb ausgeweitet wird.",
          },
        ],
      },
      {
        heading: "2. Stand der Konformität",
        blocks: [
          {
            type: "paragraph",
            text: "**Teilweise konform.** Das Projekt setzt eine solide Grundausstattung an Barrierefreiheit um und führt **bei jedem Pull Request automatisierte Barrierefreiheitsprüfungen (Lighthouse ≥ 0,95)** durch; eine vollständige manuelle Konformitätsprüfung nach WCAG 2.2 A/AA durch Nutzende assistiver Technologien ist weiterhin geplant. Bekannte Einschränkungen sind unten aufgeführt.",
          },
        ],
      },
      {
        heading: "3. Was bereits umgesetzt ist",
        blocks: [
          {
            type: "list",
            items: [
              "Ein Sprunglink und ein Ziel für den Hauptinhalt auf jeder Seite.",
              "Sichtbare Tastaturfokus-Zustände und eine logische Fokusreihenfolge.",
              "Unterstützung für `prefers-reduced-motion` (Animationen werden auf Wunsch reduziert).",
              "Ein durchsuchbares Textverzeichnis und Detailseiten der Einträge, die **ohne Interaktion mit der Karte** funktionieren; Karte und Verzeichnis zeigen dieselben öffentlichen Felder.",
              "Auswahl des Meldestandorts über eine ausdrückliche Anfrage des Gerätestandorts (wenn die Browserberechtigung erteilt ist), per Klick auf die Karte **oder** über validierte manuelle Koordinaten; die Alternativen Karte/manuelle Eingabe bleiben verfügbar.",
              "Eine englisch-/italienischsprachige Oberfläche mit einer lokal auf dem Gerät gespeicherten Spracheinstellung; die Sprachwahl hat keinen Einfluss auf die API-Daten.",
              "Eine zweisprachige Anleitung in der App unter [/guide](/guide), die die Datenzustände und den Veröffentlichungsablauf erklärt.",
              "Statusinformationen werden nie allein durch Farbe vermittelt (es werden Text- und Symbolbeschriftungen verwendet).",
            ],
          },
        ],
      },
      {
        heading: "4. Bekannte Einschränkungen",
        blocks: [
          {
            type: "list",
            items: [
              "**Kartenfunktionen sind per Tastatur bedienbar.** Kartenmarkierungen sind fokussierbar und reagieren auf Eingabe/Leertaste (Popup öffnen/schließen); die alternative Textliste deckt das Durchsuchen und Suchen von Einträgen ohne Karte ab.",
              "**Noch keine manuelle Konformitätsprüfung.** Eine vollständige manuelle Prüfung mit Screenreadern, 200 % Zoom, Kontrastprüfung und Geräten mit kleinen Bildschirmen wurde noch nicht durchgeführt; automatisierte Prüfungen laufen bei jedem Pull Request, und die manuelle Prüfung ist geplant.",
              "**Einige sichtbare Texte sind noch direkt** in Komponenten definiert, während die Auslagerung der Oberflächentexte und die Überprüfung der Pilotsprache noch laufen.",
              "**Die eigene Feedback-Seite (/feedback) wird noch nicht angeboten.** Barrieren werden über die Kanäle in Abschnitt 5 gemeldet.",
            ],
          },
        ],
      },
      {
        heading: "5. Eine Barriere melden",
        blocks: [
          {
            type: "paragraph",
            text: "Das Projekt bietet **Kanäle für nicht sensibles Feedback zur Benutzbarkeit**, damit alle eine Barriere in der Oberfläche melden können, **ohne ein Konto anzulegen und ohne personenbezogene Daten anzugeben**. Die Kanäle fragen nur nach:",
          },
          {
            type: "list",
            items: [
              "der Art der Barriere (Navigation/Tastatur, Screenreader, Farbe/Kontrast, Zoom/Layout, Sonstiges);",
              "einer Beschreibung des Vorfalls in einfacher Sprache;",
              "optional der URL der Seite, auf der die Barriere aufgetreten ist;",
              "optional einer Kontaktadresse, **nur wenn** du eine Antwort möchtest (nie erforderlich, nie für etwas anderes verwendet und nach Abschluss des Austauschs gelöscht).",
            ],
          },
          {
            type: "paragraph",
            text: "Melde Barrieren über einen dieser Kanäle:",
          },
          {
            type: "list",
            items: [
              "öffne ein Issue im Repository des Projekts (nur öffentliche, nicht sensible Inhalte — gib keine personenbezogenen Daten oder privaten Orte an);",
              "nutze das [Korrekturformular](/) auf der öffentlichen Seite bei Problemen mit einem bestimmten Eintrag;",
              "schreibe an den in der [Datenschutzerklärung](/privacy) genannten Datenschutzkontakt: [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org).",
            ],
          },
          {
            type: "paragraph",
            text: "**Zusage zur Antwort:** Feedback wird mit denselben Zielen bearbeitet wie Korrektur- und Löschanträge — eine Eingangsbestätigung innerhalb von **48 Stunden** und eine inhaltliche Antwort innerhalb von **14 Tagen**, nach Möglichkeit in der Sprache der Nachricht.",
          },
        ],
      },
      {
        heading: "6. Überprüfungsplan",
        blocks: [
          {
            type: "paragraph",
            text: "Diese Erklärung wird nach jeder Veröffentlichung überprüft, die die Oberfläche oder das Verhalten zur Barrierefreiheit ändert; mindestens vierteljährlich, sobald der Dienst in Betrieb ist; und vor jedem öffentlichen Start, wobei die endgültigen Ergebnisse der Konformitätsprüfung und bekannte Ausnahmen hier festgehalten werden.",
          },
        ],
      },
    ],
  },
};
