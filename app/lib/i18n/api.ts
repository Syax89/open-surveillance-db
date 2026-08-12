/**
 * Public API documentation (CEO 2026-08-07): /api-docs explains what the
 * public API exposes, the keyless read endpoints and the private-key write
 * API (epic api-keys, ADR 0023) with its scopes, lifecycle and limits.
 * English is the pilot bundle; the IT counterpart is type-checked via
 * Translation.
 *
 * Layout (CEO review 2026-08-07): endpoint cards with method badges and
 * curl-ready examples, a limits grid and a licence section. The write-API
 * section (t_10e3585e) reuses the same card idiom: write endpoints with
 * their required scope, scope cards, lifecycle and security cards, error
 * cards and the keyed rate-limit note.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Main navigation",
  homeAria: "OpenSurveillanceDB home",
  title: "Public API",
  intro:
    "Every camera in the database is available through a public API. Reading is keyless and needs no registration: the endpoints below are yours under the Open Database Licence. Verified contributors can also write through the API with private keys.",
  apiNote:
    "Keyless by design for reading: the directory stays frictionless to consume. Writing is possible through the API, but only with a private key issued to a verified account. Responses are JSON (except tiles and exports) and coordinates are rounded to ~10 m.",
  endpointsTitle: "Read endpoints",
  endpointsIntro:
    "All read endpoints accept GET and return JSON (except tiles and exports). Path parameters are shown in {braces}; everything else is a query string parameter.",
  endpointMethod: "Method",
  endpointPath: "Path",
  endpointDescription: "Description",
  endpointExample: "Try it",
  queryParams: "Query parameters",
  endpointParamsNone: "None — the record id is the only input.",
  endpointParamsList:
    "limit (page size, max 2000) · offset (page start) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=west,south,east,north (comma-separated) · kind · freshness · count=false. Returns the public cameras inside the viewport — this is what the interactive map uses. count=false skips the full-set COUNT scan and answers total: null (the client walks on nextOffset).",
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
    list: { method: "GET", path: "/api/cameras", example: "/api/cameras?kind=Fixed%20dome&limit=20", description: "Paginated JSON list of all public cameras. The main entry point: filter by kind or freshness, sort, and page through the dataset. Add count=false to skip the full-set COUNT (answers total: null, walks on nextOffset)." },
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
  // API keys (epic api-keys, T19 + t_10e3585e): the write API. The read
  // endpoints above stay keyless — private keys unlock WRITE access only.
  keysTitle: "API keys",
  keysIntro:
    "Verified contributors can create private keys to write from scripts and tools: submit reports and corrections, confirm cameras, edit records and cast community actions. Keys are created in your account, shown once at creation, expire after 365 days by default and can be revoked at any time; each account can hold up to 5 active keys.",
  keysNote:
    "Private keys unlock write access to the API — treat them like a password: never share them, never commit them to public repositories, never log them. A leaked key lets anyone write on your behalf: revoke it and create a new one.",
  authHeaderTitle: "Authentication",
  authHeaderIntro:
    "Send the key in the Authorization header of the request. A key stays valid until it expires or until you revoke it from your account. Never put the key in the query string: credentials in URLs leak into proxy and access logs and Referer headers, and the API rejects them with 400.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Create your API keys from your account.",
  writeEndpointsTitle: "Write endpoints",
  writeEndpointsIntro:
    "These endpoints change public data and require a verified account. Authenticate with a private key in the Authorization header; each endpoint needs the scope shown on its card.",
  scopeRequiredLabel: "Requires scope",
  writeEndpoints: {
    cameras: { method: "POST", path: "/api/cameras", scope: "submit", description: "Publish a new camera report." },
    corrections: { method: "POST", path: "/api/corrections", scope: "submit", description: "Submit a correction or a removal request." },
    confirmation: { method: "PUT / DELETE", path: "/api/cameras/{id}/confirmation", scope: "confirm", description: "Toggle the community confirmation of a camera." },
    actions: { method: "PUT / DELETE", path: "/api/cameras/{id}/actions", scope: "action", description: "Cast or withdraw a community action: useful, gone, problem, privacy." },
    edit: { method: "PATCH", path: "/api/cameras/{id}", scope: "edit", description: "Update camera details — owner edits and edit requests." },
  },
  scopesTitle: "Permissions",
  scopesIntro:
    "Each key is scoped: you choose what it may do, and you can revoke it at any time from your account.",
  scopes: {
    submit: { name: "Submit", grants: "Publish camera reports and corrections.", endpoints: "POST /api/cameras · POST /api/corrections" },
    confirm: { name: "Confirm", grants: "Mark cameras as confirmed.", endpoints: "PUT/DELETE /api/cameras/{id}/confirmation" },
    edit: { name: "Edit", grants: "Update camera details (owner edits and edit requests).", endpoints: "PATCH /api/cameras/{id}" },
    action: { name: "Community actions", grants: "Cast community actions: useful, gone, problem, privacy.", endpoints: "PUT/DELETE /api/cameras/{id}/actions" },
  },
  lifecycleTitle: "Key lifecycle",
  lifecycleIntro:
    "Keys are managed from your account. The full key is shown exactly once, at creation: copy it immediately — it is never stored on our servers.",
  lifecycle: {
    create: { name: "Create", body: "Keys are created in your account, under API keys. The default expiry is 365 days; at creation you can narrow the permissions, never widen them later." },
    reveal: { name: "Shown once", body: "The full key appears only in the creation dialog. Afterwards the account shows only a short prefix (osdb_…)." },
    expire: { name: "Expiry", body: "A key stops working on its expiry date (365 days from creation by default). Expired keys answer 401 on every write." },
    revoke: { name: "Revoke", body: "Revocation takes effect immediately: scripts using the key start failing with 401 at once." },
    cap: { name: "Limit", body: "Up to 5 active keys per account. Reaching the cap answers 409 — revoke a key to make room." },
  },
  securityTitle: "Security",
  securityIntro: "API keys are credentials for your account — handle them like passwords.",
  security: {
    queryString: { name: "Never in URLs", body: "Keys belong in the Authorization header only. A key in the query string (api_key, apikey or key parameters) is rejected with 400 on write requests before any work starts — credentials in URLs leak into proxy and access logs and Referer headers." },
    logging: { name: "Never log or share keys", body: "Do not print keys, store them in files committed to public repositories, or paste them into bug reports and chat messages. If a key leaks, revoke it and create a new one." },
    storage: { name: "Hash only at rest", body: "Only a SHA-256 fingerprint of the key is stored. The full key exists in exactly one response — the creation reply — and cannot be recovered." },
  },
  errorsTitle: "Error responses",
  errorsIntro:
    "Write requests fail with a clear status code and a single canonical response shape. Read endpoints keep returning 404 for records that are not publicly current.",
  errors: {
    "400": "Malformed request: a missing or invalid field, or credentials in the query string.",
    "401": "Missing, invalid, expired or revoked key.",
    "403": "The key is valid but does not include the required permission.",
    "404": "Record not found — the API never reveals whether an identifier exists.",
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
    "Ogni telecamera del database è disponibile tramite un'API pubblica. La lettura non richiede chiavi né registrazione: gli endpoint qui sotto sono tuoi, sotto licenza Open Database. La scrittura via API è disponibile anche per chi ha un account verificato, tramite chiavi private.",
  apiNote:
    "Senza chiavi per design in lettura: la directory resta semplice da consultare. La scrittura via API è possibile, ma solo con una chiave privata emessa per un account verificato. Le risposte sono JSON (tranne tile ed export) e le coordinate sono arrotondate a ~10 m.",
  endpointsTitle: "Endpoint di lettura",
  endpointsIntro:
    "Tutti gli endpoint di lettura accettano GET e restituiscono JSON (tranne tile ed export). I parametri di percorso sono tra {graffe}; tutto il resto è un parametro della query string.",
  endpointMethod: "Metodo",
  endpointPath: "Percorso",
  endpointDescription: "Descrizione",
  endpointExample: "Provalo",
  queryParams: "Parametri",
  endpointParamsNone: "Nessuno — l'id del record è l'unico input.",
  endpointParamsList:
    "limit (dimensione pagina, max 2000) · offset (inizio pagina) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=ovest,sud,est,nord (separati da virgola) · kind · freshness · count=false. Restituisce le telecamere pubbliche dentro il viewport — è ciò che usa la mappa interattiva. count=false salta la COUNT completa e risponde total: null (il client pagina su nextOffset).",
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
  // Chiavi API (epic api-keys, T19 + t_10e3585e): le API di scrittura. Gli
  // endpoint di lettura qui sopra restano senza chiave — le chiavi private
  // sbloccano SOLO la scrittura.
  keysTitle: "Chiavi API",
  keysIntro:
    "Chi ha un account verificato può creare chiavi private per scrivere da script e strumenti: inviare segnalazioni e correzioni, confermare le telecamere, modificare i record ed esprimere azioni della community. Le chiavi si creano dal proprio account, vengono mostrate una sola volta alla creazione, scadono dopo 365 giorni (predefinito) e si possono revocare in qualsiasi momento; ogni account può avere fino a 5 chiavi attive.",
  keysNote:
    "Le chiavi private sbloccano l'accesso in scrittura all'API — trattale come una password: non condividerle, non salvarle nei repository pubblici e non registrarle nei log. Una chiave rubata permette di scrivere a nome tuo: revocala e creane una nuova.",
  authHeaderTitle: "Autenticazione",
  authHeaderIntro:
    "Invia la chiave nell'header Authorization della richiesta. La chiave resta valida fino alla scadenza o finché non la revochi dal tuo account. Non mettere mai la chiave nella query string: le credenziali negli URL finiscono nei log dei proxy e dell'accesso e negli header Referer, e l'API le rifiuta con 400.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Crea le tue chiavi API dal tuo account.",
  writeEndpointsTitle: "Endpoint di scrittura",
  writeEndpointsIntro:
    "Questi endpoint modificano dati pubblici e richiedono un account verificato. Autenticati con una chiave privata nell'header Authorization; ogni endpoint richiede lo scope indicato sulla sua card.",
  scopeRequiredLabel: "Scope richiesto",
  writeEndpoints: {
    cameras: { method: "POST", path: "/api/cameras", scope: "submit", description: "Pubblica una nuova segnalazione di telecamera." },
    corrections: { method: "POST", path: "/api/corrections", scope: "submit", description: "Invia una correzione o una richiesta di rimozione." },
    confirmation: { method: "PUT / DELETE", path: "/api/cameras/{id}/confirmation", scope: "confirm", description: "Attiva o disattiva la conferma della community di una telecamera." },
    actions: { method: "PUT / DELETE", path: "/api/cameras/{id}/actions", scope: "action", description: "Esprimi o ritira un'azione della community: utile, non c'è più, problema, privacy." },
    edit: { method: "PATCH", path: "/api/cameras/{id}", scope: "edit", description: "Aggiorna i dettagli della telecamera — modifiche del proprietario e richieste di modifica." },
  },
  scopesTitle: "Permessi",
  scopesIntro:
    "Ogni chiave ha permessi limitati: scegli cosa può fare e puoi revocarla in qualsiasi momento dal tuo account.",
  scopes: {
    submit: { name: "Invia", grants: "Pubblica segnalazioni e correzioni.", endpoints: "POST /api/cameras · POST /api/corrections" },
    confirm: { name: "Conferma", grants: "Conferma le telecamere.", endpoints: "PUT/DELETE /api/cameras/{id}/confirmation" },
    edit: { name: "Modifica", grants: "Aggiorna i dettagli delle telecamere (modifiche del proprietario e richieste di modifica).", endpoints: "PATCH /api/cameras/{id}" },
    action: { name: "Azioni della community", grants: "Esprimi azioni della community: utile, non c'è più, problema, privacy.", endpoints: "PUT/DELETE /api/cameras/{id}/actions" },
  },
  lifecycleTitle: "Ciclo di vita delle chiavi",
  lifecycleIntro:
    "Le chiavi si gestiscono dal tuo account. La chiave completa viene mostrata una sola volta, alla creazione: copiala subito — non viene mai salvata sui nostri server.",
  lifecycle: {
    create: { name: "Crea", body: "Le chiavi si creano dal proprio account, nella sezione Chiavi API. La scadenza predefinita è 365 giorni; alla creazione puoi restringere i permessi, mai ampliarli in seguito." },
    reveal: { name: "Mostrata una sola volta", body: "La chiave completa appare solo nella finestra di creazione. In seguito l'account mostra solo un breve prefisso (osdb_…)." },
    expire: { name: "Scadenza", body: "Una chiave smette di funzionare alla data di scadenza — 365 giorni dalla creazione, come predefinito. Le chiavi scadute rispondono 401 a ogni scrittura." },
    revoke: { name: "Revoca", body: "La revoca ha effetto immediato: gli script che usano la chiave iniziano a fallire subito con 401." },
    cap: { name: "Limite", body: "Fino a 5 chiavi attive per account. Al raggiungimento del limite la risposta è 409 — revoca una chiave per farne spazio." },
  },
  securityTitle: "Sicurezza",
  securityIntro: "Le chiavi API sono credenziali del tuo account: trattale come password.",
  security: {
    queryString: { name: "Mai negli URL", body: "Le chiavi vanno solo nell'header Authorization. Una chiave nella query string (parametri api_key, apikey o key) viene rifiutata con 400 sulle richieste di scrittura, prima di qualsiasi operazione — le credenziali negli URL finiscono nei log dei proxy e dell'accesso e negli header Referer." },
    logging: { name: "Mai registrare o condividere chiavi", body: "Non stampare le chiavi, non salvarle in file versionati nei repository pubblici e non incollarle in segnalazioni di bug o chat. Se una chiave trapela, revocala e creane una nuova." },
    storage: { name: "Solo impronta in archivio", body: "Viene salvata solo un'impronta SHA-256 della chiave. La chiave completa esiste in una sola risposta — quella di creazione — e non può essere recuperata." },
  },
  errorsTitle: "Risposte di errore",
  errorsIntro:
    "Le richieste di scrittura falliscono con un codice di stato chiaro e una forma di risposta canonica unica. Gli endpoint di lettura continuano a rispondere 404 per i record non più pubblici.",
  errors: {
    "400": "Richiesta malformata: campo mancante o non valido, o credenziali nella query string.",
    "401": "Chiave mancante, non valida, scaduta o revocata.",
    "403": "La chiave è valida ma non include il permesso richiesto.",
    "404": "Record non trovato — l'API non rivela mai se un identificatore esiste.",
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
