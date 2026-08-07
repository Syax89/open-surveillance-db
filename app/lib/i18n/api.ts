/**
 * Public API documentation (CEO 2026-08-07): /api-docs explains what the
 * public read-only API exposes and its per-caller limits. English is the
 * pilot bundle; the IT counterpart is type-checked via Translation.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Main navigation",
  homeAria: "OpenSurveillanceDB home",
  title: "Public API",
  intro:
    "OpenSurveillanceDB exposes a public, read-only API for the camera database. No API key is required: every endpoint is rate-limited per caller and the data is published under the Open Database Licence.",
  readOnlyNote:
    "The public API is strictly read-only. Submissions, corrections and moderation go through the website, not through the API.",
  endpointsTitle: "Endpoints",
  endpointsIntro:
    "All responses are JSON (except the map tiles and the CSV/GeoJSON exports). Coordinates are rounded to ~10 m for public privacy.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", description: "Paginated JSON list of public cameras. Query: limit, offset, kind, freshness, sort." },
    bbox: { method: "GET", path: "/api/cameras?bbox=west,south,east,north", description: "All public cameras inside a map viewport, as GeoJSON or JSON pages. This is what the interactive map uses." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", description: "Complete dataset as GeoJSON (ODbL). Exports are rate-limited more strictly." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", description: "Complete dataset as CSV (ODbL)." },
    record: { method: "GET", path: "/api/cameras/[id]", description: "One public camera record by numeric id. 404 when the record is not publicly current." },
    search: { method: "GET", path: "/api/cameras/search?q=", description: "Text search over titles, addresses and kinds." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=&radius=", description: "Cameras near a position (duplicate check)." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", description: "Public change history of a record." },
    geocode: { method: "GET", path: "/api/geocode?q=", description: "Place autocomplete, proxied to OpenStreetMap Nominatim (cached)." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", description: "Nearest address for a position (cached on first lookup)." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", description: "OpenStreetMap raster tiles proxied for the map." },
  },
  limitsTitle: "Limits",
  limitsIntro:
    "Every endpoint is rate-limited per caller (IP-based) over a 60-second window. The limits below are the default values.",
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
    "The database and its exports are licensed under the Open Database Licence (ODbL) 1.0. You may share and adapt the data as long as you attribute the source and share any derived database under the same licence.",
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
    "OpenSurveillanceDB espone un'API pubblica e di sola lettura per il database delle telecamere. Non serve alcuna chiave API: ogni endpoint è limitato per chiamante e i dati sono pubblicati sotto licenza Open Database.",
  readOnlyNote:
    "L'API pubblica è strettamente di sola lettura. Segnalazioni, correzioni e moderazione passano dal sito, non dall'API.",
  endpointsTitle: "Endpoint",
  endpointsIntro:
    "Tutte le risposte sono JSON (tranne le tile della mappa e gli export CSV/GeoJSON). Le coordinate sono arrotondate a ~10 m per la privacy pubblica.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", description: "Elenco JSON paginato delle telecamere pubbliche. Parametri: limit, offset, kind, freshness, sort." },
    bbox: { method: "GET", path: "/api/cameras?bbox=ovest,sud,est,nord", description: "Tutte le telecamere pubbliche dentro un viewport della mappa, come GeoJSON o pagine JSON. È ciò che usa la mappa interattiva." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", description: "Dataset completo in GeoJSON (ODbL). Gli export hanno limiti più severi." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", description: "Dataset completo in CSV (ODbL)." },
    record: { method: "GET", path: "/api/cameras/[id]", description: "Una singola telecamera pubblica per id numerico. 404 se il record non è pubblicamente attuale." },
    search: { method: "GET", path: "/api/cameras/search?q=", description: "Ricerca testuale su titoli, indirizzi e tipi." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=&radius=", description: "Telecamere vicino a una posizione (controllo duplicati)." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", description: "Storico pubblico delle modifiche di un record." },
    geocode: { method: "GET", path: "/api/geocode?q=", description: "Autocompletamento luoghi, tramite proxy a OpenStreetMap Nominatim (con cache)." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", description: "Indirizzo più vicino a una posizione (cachato al primo lookup)." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", description: "Tile raster di OpenStreetMap servite dal proxy per la mappa." },
  },
  limitsTitle: "Limiti",
  limitsIntro:
    "Ogni endpoint è limitato per chiamante (basato su IP) su una finestra di 60 secondi. I limiti sotto sono i valori predefiniti.",
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
    "Il database e i suoi export sono rilasciati sotto licenza Open Database (ODbL) 1.0. Puoi condividere e adattare i dati citando la fonte e rilasciando qualsiasi database derivato sotto la stessa licenza.",
  attribution: "Dati e tile della mappa © OpenStreetMap contributors, licenza ODbL.",
  backToHome: "Torna alla home",
};
