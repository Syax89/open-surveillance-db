/**
 * Public API documentation (CEO 2026-08-07): /api-docs explains what the
 * public read-only API exposes and its per-caller limits. English is the
 * pilot bundle; the IT counterpart is type-checked via Translation.
 *
 * Layout (CEO review 2026-08-07): endpoint cards with method badges and
 * curl-ready examples, a limits grid and a licence section.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Main navigation",
  homeAria: "OpenSurveillanceDB home",
  title: "Public API",
  intro:
    "Every camera in the database is available through a public, read-only API. No API key, no registration: open the endpoints below and the data is yours under the Open Database Licence.",
  readOnlyNote:
    "Read-only by design: submissions, corrections and moderation happen on the website, never through the API. Responses are JSON (except tiles and exports) and coordinates are rounded to ~10 m.",
  endpointsTitle: "Endpoints",
  endpointsIntro:
    "All endpoints accept GET and return JSON (except tiles and exports). Path parameters are shown in {braces}; everything else is a query string parameter.",
  endpointMethod: "Method",
  endpointPath: "Path",
  endpointDescription: "Description",
  endpointExample: "Try it",
  queryParams: "Query parameters",
  endpointParamsNone: "None — the record id is the only input.",
  endpointParamsList:
    "limit (page size, max 2000) · offset (page start) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=west,south,east,north (comma-separated) · kind · freshness. Returns the public cameras inside the viewport — this is what the interactive map uses.",
  endpointParamsExport:
    "format=geojson or format=csv (default geojson). No pagination: the export is the full dataset. Exports are rate-limited more strictly.",
  endpointParamsRecord:
    "Path only. Returns 404 when the record is not publicly current.",
  endpointParamsSearch:
    "q (free text, matched against titles, addresses and kinds). Results are ranked by relevance.",
  endpointParamsNearby:
    "latitude · longitude (decimal degrees, required) · radius (meters, default 100, max 5000). Sorted by distance.",
  endpointParamsRevisions:
    "cameraId (required). Returns the public change history of a record, oldest first.",
  endpointParamsGeocode:
    "q (place name, required). Place autocomplete proxied to OpenStreetMap Nominatim, cached server-side.",
  endpointParamsReverse:
    "lat · lng (required, decimal degrees). Returns the closest address, cached on first lookup.",
  endpointParamsTiles:
    "z (zoom 0-19) · x · y (tile coordinates). Raster tiles proxied from OpenStreetMap.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", example: "/api/cameras?kind=Fixed%20dome&limit=20", description: "Paginated JSON list of all public cameras. The main entry point: filter by kind or freshness, sort, and page through the dataset." },
    bbox: { method: "GET", path: "/api/cameras?bbox=…", example: "/api/cameras?bbox=8.5,47.3,8.6,47.5", description: "All public cameras inside a map viewport, as GeoJSON. This is the endpoint the interactive map calls when you pan and zoom." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", example: "/api/cameras?format=geojson", description: "The complete dataset as GeoJSON — one request, no pagination. Ideal for GIS tools and data analysis." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", example: "/api/cameras?format=csv", description: "The complete dataset as CSV, ready for spreadsheets. Same content as the GeoJSON export, tabular shape." },
    record: { method: "GET", path: "/api/cameras/{id}", example: "/api/cameras/1", description: "One camera record by numeric id, with its full public detail: location, address, verification state and change history." },
    search: { method: "GET", path: "/api/cameras/search?q=…", example: "/api/cameras/search?q=zurich", description: "Text search across titles, addresses and kinds. Fast way to find a specific camera without scanning the map." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=", example: "/api/cameras/nearby?latitude=47.41&longitude=8.57&radius=200", description: "Cameras near a position, sorted by distance. This is the duplicate check the report form uses." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", example: "/api/cameras/revisions?cameraId=1", description: "Public change history of a record: what changed, when, and by whom (anonymous or contributor)." },
    geocode: { method: "GET", path: "/api/geocode?q=…", example: "/api/geocode?q=zurich+hb", description: "Place autocomplete for search boxes, proxied to OpenStreetMap Nominatim. Results are cached, so repeat queries never hit the upstream." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", example: "/api/geocode/reverse?lat=47.4123&lng=8.5709", description: "Closest address for a position — the same lookup that fills the address field in the report form." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", example: "/api/tiles/14/8570/5694.png", description: "OpenStreetMap raster tiles, proxied and cached. Use them to build your own map over the camera data." },
  },
  // API keys (epic api-keys, T19): the write API. The read endpoints above
  // stay keyless — private keys unlock WRITE access only.
  keysTitle: "API keys",
  keysIntro:
    "The endpoints above are read-only and never need a key. Verified contributors can create private keys to write: submit reports and corrections, confirm cameras, edit records and cast community actions from scripts.",
  keysNote:
    "Private keys unlock write access to the API — treat them like a password: never share them or commit them to public repositories.",
  authHeaderTitle: "Authentication",
  authHeaderIntro:
    "Send the key in the Authorization header of the request. A key stays valid until it expires or until you revoke it from your account.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Create your API keys from your account.",
  scopesTitle: "Permissions",
  scopesIntro:
    "Each key is scoped: you choose what it may do, and you can revoke it at any time from your account.",
  scopes: {
    submit: { name: "Submit", grants: "Publish camera reports and corrections." },
    confirm: { name: "Confirm", grants: "Mark cameras as confirmed." },
    edit: { name: "Edit", grants: "Update camera details (owner edits and edit requests)." },
    action: { name: "Community actions", grants: "Cast community actions: useful, gone, problem, privacy." },
  },
  errorsTitle: "Error responses",
  errorsIntro:
    "Write requests fail with a clear status code and a single canonical response shape. Read endpoints keep returning 404 for records that are not publicly current.",
  errors: {
    "400": "Malformed request: a missing or invalid field.",
    "401": "Missing, invalid, expired or revoked key.",
    "403": "The key is valid but does not include the required permission.",
    "404": "Unknown key or record — the API never reveals whether an identifier exists.",
    "409": "Limit reached: too many active keys (max 5) or a conflicting state.",
    "429": "Rate limit exceeded — per key and per IP address.",
    "503": "Service temporarily unavailable.",
  },
  keysLimitsTitle: "Key rate limits",
  keysLimitsIntro:
    "Each key is limited on its own, on top of the per-IP limits above: one script cannot exhaust the shared budget of every other caller from the same address.",
  limitsTitle: "Rate limits",
  limitsIntro:
    "Every endpoint is limited per caller (IP address) over a 60-second window. Limits protect the service and the upstream providers (OpenStreetMap); generous for interactive use, tight for scrapers.",
  limits: {
    read: { name: "List, bbox, record, search", requests: "60 requests / minute" },
    export: { name: "CSV / GeoJSON exports", requests: "10 requests / minute" },
    nearby: { name: "Nearby (duplicate check)", requests: "30 requests / minute" },
    revisions: { name: "Change history", requests: "30 requests / minute" },
    geocode: { name: "Geocoding (forward + reverse)", requests: "30 requests / minute" },
    tiles: { name: "Map tiles", requests: "240 requests / minute" },
  },
  licenseTitle: "Licence and attribution",
  licenseBody:
    "The database and its exports are licensed under the Open Database Licence (ODbL) 1.0: you may share and adapt the data as long as you attribute the source and release any derived database under the same licence.",
  attribution: "Map data and tiles © OpenStreetMap contributors, licensed under ODbL.",
  backToHome: "Back to home",
};

/**
 * Italian bundle. Type-checked against the English key set.
 */
export const it: Translation<typeof en> = {
  navigation: "Navigazione principale",
  homeAria: "OpenSurveillanceDB home",
  title: "API pubblica",
  intro:
    "Ogni telecamera del database è disponibile tramite un'API pubblica e di sola lettura. Nessuna chiave, nessuna registrazione: apri gli endpoint qui sotto e i dati sono tuoi, sotto licenza Open Database.",
  readOnlyNote:
    "Di sola lettura per design: segnalazioni, correzioni e moderazione avvengono sul sito, mai tramite API. Le risposte sono JSON (tranne tile ed export) e le coordinate sono arrotondate a ~10 m.",
  endpointsTitle: "Endpoint",
  endpointsIntro:
    "Tutti gli endpoint accettano GET e restituiscono JSON (tranne tile ed export). I parametri di percorso sono tra {graffe}; tutto il resto è un parametro della query string.",
  endpointMethod: "Metodo",
  endpointPath: "Percorso",
  endpointDescription: "Descrizione",
  endpointExample: "Provalo",
  queryParams: "Parametri",
  endpointParamsNone: "Nessuno — l'id del record è l'unico input.",
  endpointParamsList:
    "limit (dimensione pagina, max 2000) · offset (inizio pagina) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=ovest,sud,est,nord (separati da virgola) · kind · freshness. Restituisce le telecamere pubbliche dentro il viewport — è ciò che usa la mappa interattiva.",
  endpointParamsExport:
    "format=geojson oppure format=csv (predefinito geojson). Niente paginazione: l'export è il dataset completo. Gli export hanno limiti più severi.",
  endpointParamsRecord:
    "Solo percorso. Restituisce 404 quando il record non è pubblicamente attuale.",
  endpointParamsSearch:
    "q (testo libero, confrontato con titoli, indirizzi e tipi). I risultati sono ordinati per rilevanza.",
  endpointParamsNearby:
    "latitude · longitude (gradi decimali, obbligatori) · radius (metri, predefinito 100, max 5000). Ordinati per distanza.",
  endpointParamsRevisions:
    "cameraId (obbligatorio). Restituisce lo storico pubblico delle modifiche di un record, dalla più vecchia.",
  endpointParamsGeocode:
    "q (nome del luogo, obbligatorio). Autocompletamento luoghi tramite proxy a OpenStreetMap Nominatim, cachato lato server.",
  endpointParamsReverse:
    "lat · lng (obbligatori, gradi decimali). Restituisce l'indirizzo più vicino, cachato al primo lookup.",
  endpointParamsTiles:
    "z (zoom 0-19) · x · y (coordinate della tile). Tile raster servite dal proxy di OpenStreetMap.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", example: "/api/cameras?kind=Fixed%20dome&limit=20", description: "Elenco JSON paginato di tutte le telecamere pubbliche. Il punto di ingresso principale: filtra per tipo o freschezza, ordina e sfoglia il dataset." },
    bbox: { method: "GET", path: "/api/cameras?bbox=…", example: "/api/cameras?bbox=8.5,47.3,8.6,47.5", description: "Tutte le telecamere pubbliche dentro un viewport della mappa, come GeoJSON. È l'endpoint che la mappa interattiva chiama quando fai pan e zoom." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", example: "/api/cameras?format=geojson", description: "Il dataset completo come GeoJSON — una richiesta, niente paginazione. Ideale per tool GIS e analisi dati." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", example: "/api/cameras?format=csv", description: "Il dataset completo come CSV, pronto per i fogli di calcolo. Stesso contenuto dell'export GeoJSON, forma tabellare." },
    record: { method: "GET", path: "/api/cameras/{id}", example: "/api/cameras/1", description: "Una telecamera per id numerico, con tutti i dettagli pubblici: posizione, indirizzo, stato di verifica e storico modifiche." },
    search: { method: "GET", path: "/api/cameras/search?q=…", example: "/api/cameras/search?q=zurich", description: "Ricerca testuale su titoli, indirizzi e tipi. Il modo rapido per trovare una telecamera senza scorrere la mappa." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=", example: "/api/cameras/nearby?latitude=47.41&longitude=8.57&radius=200", description: "Telecamere vicine a una posizione, ordinate per distanza. È il controllo duplicati che usa il modulo di segnalazione." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", example: "/api/cameras/revisions?cameraId=1", description: "Storico pubblico delle modifiche di un record: cosa è cambiato, quando e da chi (anonimo o persona registrata)." },
    geocode: { method: "GET", path: "/api/geocode?q=…", example: "/api/geocode?q=zurich+hb", description: "Autocompletamento luoghi per i campi di ricerca, tramite proxy a OpenStreetMap Nominatim. I risultati sono cachati: le query ripetute non toccano mai l'upstream." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", example: "/api/geocode/reverse?lat=47.4123&lng=8.5709", description: "Indirizzo più vicino a una posizione — la stessa ricerca che compila il campo indirizzo nel modulo di segnalazione." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", example: "/api/tiles/14/8570/5694.png", description: "Tile raster di OpenStreetMap, servite dal proxy con cache. Usale per costruire la tua mappa sopra i dati delle telecamere." },
  },
  // Chiavi API (epic api-keys, T19): le API di scrittura. Gli endpoint di
  // lettura qui sopra restano senza chiave — le chiavi private sbloccano
  // SOLO la scrittura.
  keysTitle: "Chiavi API",
  keysIntro:
    "Gli endpoint qui sopra sono di sola lettura e non richiedono mai una chiave. Chi ha un account verificato può creare chiavi private per scrivere: inviare segnalazioni e correzioni, confermare le telecamere, modificare i record ed esprimere azioni della community dagli script.",
  keysNote:
    "Le chiavi private sbloccano l'accesso in scrittura all'API — trattale come una password: non condividerle mai e non salvarle nei repository pubblici.",
  authHeaderTitle: "Autenticazione",
  authHeaderIntro:
    "Invia la chiave nell'header Authorization della richiesta. La chiave resta valida fino alla scadenza o finché non la revochi dal tuo account.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Crea le tue chiavi API dal tuo account.",
  scopesTitle: "Permessi",
  scopesIntro:
    "Ogni chiave ha permessi limitati: scegli cosa può fare e puoi revocarla in qualsiasi momento dal tuo account.",
  scopes: {
    submit: { name: "Invia", grants: "Pubblica segnalazioni e correzioni." },
    confirm: { name: "Conferma", grants: "Conferma le telecamere." },
    edit: { name: "Modifica", grants: "Aggiorna i dettagli delle telecamere (modifiche del proprietario e richieste di modifica)." },
    action: { name: "Azioni della community", grants: "Esprimi azioni della community: utile, non c'è più, problema, privacy." },
  },
  errorsTitle: "Risposte di errore",
  errorsIntro:
    "Le richieste di scrittura falliscono con un codice di stato chiaro e una forma di risposta canonica unica. Gli endpoint di lettura continuano a rispondere 404 per i record non più pubblici.",
  errors: {
    "400": "Richiesta malformata: campo mancante o non valido.",
    "401": "Chiave mancante, non valida, scaduta o revocata.",
    "403": "La chiave è valida ma non include il permesso richiesto.",
    "404": "Chiave o record sconosciuto — l'API non rivela mai se un identificatore esiste.",
    "409": "Limite raggiunto: troppe chiavi attive (max 5) o stato in conflitto.",
    "429": "Limite di velocità superato — per chiave e per indirizzo IP.",
    "503": "Servizio temporaneamente non disponibile.",
  },
  keysLimitsTitle: "Limiti delle chiavi",
  keysLimitsIntro:
    "Ogni chiave ha un proprio limite, in aggiunta ai limiti per IP qui sopra: uno script non può esaurire il budget condiviso degli altri chiamanti dello stesso indirizzo.",
  limitsTitle: "Limiti di velocità",
  limitsIntro:
    "Ogni endpoint è limitato per chiamante (indirizzo IP) su una finestra di 60 secondi. I limiti proteggono il servizio e i provider upstream (OpenStreetMap); generosi per l'uso interattivo, stretti per gli scraper.",
  limits: {
    read: { name: "Lista, bbox, record, ricerca", requests: "60 richieste / minuto" },
    export: { name: "Export CSV / GeoJSON", requests: "10 richieste / minuto" },
    nearby: { name: "Vicine (controllo duplicati)", requests: "30 richieste / minuto" },
    revisions: { name: "Storico modifiche", requests: "30 richieste / minuto" },
    geocode: { name: "Geocoding (forward + reverse)", requests: "30 richieste / minuto" },
    tiles: { name: "Tile della mappa", requests: "240 richieste / minuto" },
  },
  licenseTitle: "Licenza e attribuzione",
  licenseBody:
    "Il database e i suoi export sono rilasciati sotto licenza Open Database (ODbL) 1.0: puoi condividere e adattare i dati citando la fonte e rilasciando qualsiasi database derivato sotto la stessa licenza.",
  attribution: "Dati e tile della mappa © OpenStreetMap contributors, licenza ODbL.",
  backToHome: "Torna alla home",
};
