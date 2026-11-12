/**
 * api — DE translation. Parity-checked against the English pilot
 * bundle (../../api.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../api";

export const de: Translation<typeof en> = {
  navigation: "Hauptnavigation",
  homeAria: "OpenSurveillanceDB Startseite",
  title: "Öffentliche API",
  intro:
    "Jede Kamera in der Datenbank ist über eine öffentliche API verfügbar. Lesen geht ohne Schlüssel und ohne Registrierung: Die Endpunkte unten stehen dir unter der Open Database Licence zur Verfügung. Verifizierte Mitwirkende können mit privaten Schlüsseln auch über die API schreiben.",
  apiNote:
    "Lesen ist bewusst schlüsselfrei: Das Verzeichnis soll ohne Hürden nutzbar sein. Schreiben ist über die API möglich, aber nur mit einem privaten Schlüssel, der für ein verifiziertes Konto ausgestellt wurde. Antworten sind JSON (außer Kacheln und Exporte), Koordinaten sind auf ~10 m gerundet.",
  endpointsTitle: "Lese-Endpunkte",
  endpointsIntro:
    "Alle Lese-Endpunkte akzeptieren GET und liefern JSON (außer Kacheln und Exporte). Pfadparameter stehen in {geschweiften Klammern}; alles andere sind Query-String-Parameter.",
  endpointMethod: "Methode",
  endpointPath: "Pfad",
  endpointDescription: "Beschreibung",
  endpointExample: "Ausprobieren",
  queryParams: "Query-Parameter",
  endpointParamsNone: "Keine — die Eintrags-ID ist die einzige Eingabe.",
  endpointParamsList:
    "limit (Seitengröße, max. 2000) · offset (Seitenanfang) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=west,south,east,north (kommagetrennt) · kind · freshness · count=false. Liefert die öffentlichen Kameras im Kartenausschnitt — genau das nutzt die interaktive Karte. count=false überspringt den COUNT-Scan über die Gesamtmenge und antwortet mit total: null (der Client blättert über nextOffset weiter). Mit format=geojson gelten dieselben Filter kind und freshness, die Box darf höchstens 50 Quadratgrad umfassen (größere Boxen antworten mit 400), und die FeatureCollection enthält höchstens 10.000 Features — gibt es mehr Treffer, enthält sie truncated: true (für den Rest hineinzoomen).",
  endpointParamsExport:
    "format=geojson oder format=csv (Standard: geojson). Keine Paginierung: Der Export ist der vollständige Datensatz. Exporte sind strenger begrenzt.",
  endpointParamsRecord:
    "Nur Pfad. Liefert 404, wenn der Eintrag aktuell nicht öffentlich ist.",
  endpointParamsSearch:
    "q (Freitext, abgeglichen mit Titeln, Adressen und Kameratypen). Ergebnisse sind nach Relevanz sortiert.",
  endpointParamsNearby:
    "latitude · longitude (Dezimalgrad, Pflicht) · radius (Meter, Standard 100, max. 5000). Nach Entfernung sortiert.",
  endpointParamsRevisions:
    "cameraId (Pflicht). Liefert den öffentlichen Änderungsverlauf eines Eintrags, älteste zuerst.",
  endpointParamsGeocode:
    "q (Ortsname, Pflicht). Ortsvorschläge über einen Proxy zu OpenStreetMap Nominatim, serverseitig zwischengespeichert.",
  endpointParamsReverse:
    "lat · lng (Pflicht, Dezimalgrad). Liefert die nächstgelegene Adresse, beim ersten Abruf zwischengespeichert.",
  endpointParamsTiles:
    "z (Zoom 0-19) · x · y (Kachelkoordinaten). Rasterkacheln über einen Proxy von OpenStreetMap.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", example: "/api/cameras?kind=Fixed%20dome&limit=20", description: "Paginierte JSON-Liste aller öffentlichen Kameras. Der zentrale Einstiegspunkt: nach Typ oder Aktualität filtern, sortieren und durch den Datensatz blättern. Mit count=false entfällt der COUNT über die Gesamtmenge (antwortet total: null, blättert über nextOffset)." },
    bbox: { method: "GET", path: "/api/cameras?bbox=…", example: "/api/cameras?bbox=8.5,47.3,8.6,47.5", description: "Alle öffentlichen Kameras in einem Kartenausschnitt, als GeoJSON. Diesen Endpunkt ruft die interaktive Karte beim Verschieben und Zoomen auf." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", example: "/api/cameras?format=geojson", description: "Der vollständige Datensatz als GeoJSON — eine Anfrage, keine Paginierung. Ideal für GIS-Tools und Datenanalyse." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", example: "/api/cameras?format=csv", description: "Der vollständige Datensatz als CSV, bereit für Tabellenkalkulationen. Gleicher Inhalt wie der GeoJSON-Export, in Tabellenform." },
    record: { method: "GET", path: "/api/cameras/{id}", example: "/api/cameras/1", description: "Ein Kameraeintrag per numerischer ID, mit allen öffentlichen Details: Standort, Adresse, Verifizierungsstatus und Änderungsverlauf." },
    search: { method: "GET", path: "/api/cameras/search?q=…", example: "/api/cameras/search?q=zurich", description: "Textsuche über Titel, Adressen und Kameratypen. Der schnelle Weg zu einer bestimmten Kamera, ohne die Karte abzusuchen." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=", example: "/api/cameras/nearby?latitude=47.41&longitude=8.57&radius=200", description: "Kameras in der Nähe einer Position, nach Entfernung sortiert. Das ist die Duplikatprüfung, die das Meldeformular verwendet." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", example: "/api/cameras/revisions?cameraId=1", description: "Öffentlicher Änderungsverlauf eines Eintrags: was sich wann und durch wen geändert hat (anonym oder mitwirkende Person)." },
    geocode: { method: "GET", path: "/api/geocode?q=…", example: "/api/geocode?q=zurich+hb", description: "Ortsvorschläge für Suchfelder, über einen Proxy zu OpenStreetMap Nominatim. Ergebnisse werden zwischengespeichert, wiederholte Anfragen erreichen den Upstream also nie." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", example: "/api/geocode/reverse?lat=47.4123&lng=8.5709", description: "Nächstgelegene Adresse zu einer Position — dieselbe Abfrage, die das Adressfeld im Meldeformular ausfüllt." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", example: "/api/tiles/14/8570/5694.png", description: "OpenStreetMap-Rasterkacheln, über einen Proxy ausgeliefert und zwischengespeichert. Damit kannst du deine eigene Karte über den Kameradaten bauen." },
  },
  // API keys (epic api-keys, T19 + t_10e3585e): the write API. The read
  // endpoints above stay keyless — private keys unlock WRITE access only.
  keysTitle: "API-Schlüssel",
  keysIntro:
    "Verifizierte Mitwirkende können private Schlüssel erstellen, um aus Skripten und Tools zu schreiben: Meldungen und Korrekturen einreichen, Kameras bestätigen, Einträge bearbeiten und Community-Aktionen ausführen. Schlüssel werden in deinem Konto erstellt, einmalig beim Erstellen angezeigt, laufen standardmäßig nach 365 Tagen ab und können jederzeit widerrufen werden; pro Konto sind bis zu 5 aktive Schlüssel möglich.",
  keysNote:
    "Private Schlüssel gewähren Schreibzugriff auf die API — behandle sie wie ein Passwort: niemals teilen, niemals in öffentliche Repositorys committen, niemals loggen. Mit einem geleakten Schlüssel kann jeder in deinem Namen schreiben: Widerrufe ihn und erstelle einen neuen.",
  authHeaderTitle: "Authentifizierung",
  authHeaderIntro:
    "Sende den Schlüssel im Authorization-Header der Anfrage. Ein Schlüssel bleibt gültig, bis er abläuft oder du ihn in deinem Konto widerrufst. Setze den Schlüssel nie in den Query-String: Zugangsdaten in URLs landen in Proxy- und Zugriffslogs sowie in Referer-Headern, und die API lehnt sie mit 400 ab.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Erstelle deine API-Schlüssel in deinem Konto.",
  writeEndpointsTitle: "Schreib-Endpunkte",
  writeEndpointsIntro:
    "Diese Endpunkte ändern öffentliche Daten und erfordern ein verifiziertes Konto. Authentifiziere dich mit einem privaten Schlüssel im Authorization-Header; jeder Endpunkt benötigt den auf seiner Karte angegebenen Scope.",
  scopeRequiredLabel: "Benötigter Scope",
  writeEndpoints: {
    cameras: { method: "POST", path: "/api/cameras", scope: "submit", description: "Eine neue Kamerameldung veröffentlichen." },
    corrections: { method: "POST", path: "/api/corrections", scope: "submit", description: "Eine Korrektur oder einen Löschantrag einreichen." },
    confirmation: { method: "PUT / DELETE", path: "/api/cameras/{id}/confirmation", scope: "confirm", description: "Die Community-Bestätigung einer Kamera setzen oder zurücknehmen." },
    actions: { method: "PUT / DELETE", path: "/api/cameras/{id}/actions", scope: "action", description: "Eine Community-Aktion ausführen oder zurückziehen: nützlich, entfernt, Problem, Datenschutz." },
    edit: { method: "PATCH", path: "/api/cameras/{id}", scope: "edit", description: "Kameradetails aktualisieren — Änderungen durch Eigentümer und Änderungsanfragen." },
  },
  scopesTitle: "Berechtigungen",
  scopesIntro:
    "Jeder Schlüssel ist eingeschränkt: Du legst fest, was er darf, und kannst ihn jederzeit in deinem Konto widerrufen.",
  scopes: {
    submit: { name: "Einreichen", grants: "Kamerameldungen und Korrekturen veröffentlichen.", endpoints: "POST /api/cameras · POST /api/corrections" },
    confirm: { name: "Bestätigen", grants: "Kameras als bestätigt markieren.", endpoints: "PUT/DELETE /api/cameras/{id}/confirmation" },
    edit: { name: "Bearbeiten", grants: "Kameradetails aktualisieren (Änderungen durch Eigentümer und Änderungsanfragen).", endpoints: "PATCH /api/cameras/{id}" },
    action: { name: "Community-Aktionen", grants: "Community-Aktionen ausführen: nützlich, entfernt, Problem, Datenschutz.", endpoints: "PUT/DELETE /api/cameras/{id}/actions" },
  },
  lifecycleTitle: "Lebenszyklus der Schlüssel",
  lifecycleIntro:
    "Schlüssel verwaltest du in deinem Konto. Der vollständige Schlüssel wird genau einmal angezeigt, beim Erstellen: Kopiere ihn sofort — er wird nie auf unseren Servern gespeichert.",
  lifecycle: {
    create: { name: "Erstellen", body: "Schlüssel werden in deinem Konto unter API-Schlüssel erstellt. Die Standard-Gültigkeit beträgt 365 Tage; beim Erstellen kannst du die Berechtigungen einschränken, später aber nie erweitern." },
    reveal: { name: "Einmal angezeigt", body: "Der vollständige Schlüssel erscheint nur im Erstellungsdialog. Danach zeigt das Konto nur noch ein kurzes Präfix (osdb_…)." },
    expire: { name: "Ablauf", body: "Ein Schlüssel funktioniert ab seinem Ablaufdatum nicht mehr (standardmäßig 365 Tage nach Erstellung). Abgelaufene Schlüssel erhalten bei jedem Schreibzugriff 401." },
    revoke: { name: "Widerrufen", body: "Der Widerruf wirkt sofort: Skripte mit diesem Schlüssel schlagen umgehend mit 401 fehl." },
    cap: { name: "Limit", body: "Bis zu 5 aktive Schlüssel pro Konto. Ist das Limit erreicht, lautet die Antwort 409 — widerrufe einen Schlüssel, um Platz zu schaffen." },
  },
  securityTitle: "Sicherheit",
  securityIntro: "API-Schlüssel sind Zugangsdaten zu deinem Konto — behandle sie wie Passwörter.",
  security: {
    queryString: { name: "Nie in URLs", body: "Schlüssel gehören ausschließlich in den Authorization-Header. Ein Schlüssel im Query-String (Parameter api_key, apikey oder key) wird bei Schreibanfragen mit 400 abgelehnt, bevor irgendetwas verarbeitet wird — Zugangsdaten in URLs landen in Proxy- und Zugriffslogs sowie in Referer-Headern." },
    logging: { name: "Schlüssel nie loggen oder teilen", body: "Gib Schlüssel nicht aus, speichere sie nicht in Dateien, die in öffentliche Repositorys committet werden, und füge sie nicht in Bugreports oder Chatnachrichten ein. Wenn ein Schlüssel geleakt wird, widerrufe ihn und erstelle einen neuen." },
    storage: { name: "Gespeichert nur als Hash", body: "Gespeichert wird nur ein SHA-256-Fingerabdruck des Schlüssels. Der vollständige Schlüssel existiert in genau einer Antwort — der beim Erstellen — und kann nicht wiederhergestellt werden." },
  },
  errorsTitle: "Fehlerantworten",
  errorsIntro:
    "Schreibanfragen schlagen mit einem eindeutigen Statuscode und einer einheitlichen, kanonischen Antwortstruktur fehl. Lese-Endpunkte liefern für Einträge, die aktuell nicht öffentlich sind, weiterhin 404.",
  errors: {
    "400": "Fehlerhafte Anfrage: ein fehlendes oder ungültiges Feld oder Zugangsdaten im Query-String.",
    "401": "Fehlender, ungültiger, abgelaufener oder widerrufener Schlüssel.",
    "403": "Der Schlüssel ist gültig, enthält aber nicht die erforderliche Berechtigung.",
    "404": "Eintrag nicht gefunden — die API verrät nie, ob eine Kennung existiert.",
    "409": "Limit erreicht: zu viele aktive Schlüssel (max. 5) oder ein Konfliktzustand.",
    "429": "Ratenlimit überschritten — pro Schlüssel und pro IP-Adresse.",
    "503": "Dienst vorübergehend nicht verfügbar.",
  },
  keysLimitsTitle: "Ratenlimits pro Schlüssel",
  keysLimitsIntro:
    "Jeder Schlüssel ist eigenständig begrenzt, zusätzlich zu den IP-Limits oben: Ein einzelnes Skript kann nicht das gemeinsame Kontingent aller anderen Aufrufer von derselben Adresse aufbrauchen.",
  limitsTitle: "Ratenlimits",
  limitsIntro:
    "Jeder Endpunkt ist pro Aufrufer (IP-Adresse) über ein 60-Sekunden-Fenster begrenzt. Die Limits schützen den Dienst und die Upstream-Anbieter (OpenStreetMap); großzügig für interaktive Nutzung, streng für Scraper.",
  limits: {
    read: { name: "Liste, bbox, Eintrag, Suche", requests: "300 Anfragen / Minute" },
    export: { name: "CSV-/GeoJSON-Exporte", requests: "10 Anfragen / Minute" },
    nearby: { name: "In der Nähe (Duplikatprüfung)", requests: "30 Anfragen / Minute" },
    revisions: { name: "Änderungsverlauf", requests: "30 Anfragen / Minute" },
    geocode: { name: "Geocoding (vorwärts + rückwärts)", requests: "30 Anfragen / Minute" },
    tiles: { name: "Kartenkacheln", requests: "1200 Anfragen / Minute" },
  },
  licenseTitle: "Lizenz und Namensnennung",
  licenseBody:
    "Die Datenbank und ihre Exporte stehen unter der Open Database Licence (ODbL) 1.0: Du darfst die Daten teilen und bearbeiten, solange du die Quelle nennst und jede abgeleitete Datenbank unter derselben Lizenz veröffentlichst.",
  attribution: "Kartendaten und Kacheln © OpenStreetMap-Mitwirkende, lizenziert unter ODbL.",
  backToHome: "Zurück zur Startseite",
};
