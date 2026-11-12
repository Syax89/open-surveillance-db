/**
 * map — ES translation. Parity-checked against the English pilot
 * bundle (../../map.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../map";

export const es: Translation<typeof en> = {
  mapLabel: "Mapa interactivo de OpenStreetMap",
  mapDescription:
    "El mapa muestra las mismas fichas públicas que el directorio accesible de abajo. Puedes usar el directorio para buscar, filtrar y abrir fichas sin usar el mapa.",
  mapDirectoryLink: "Ir al directorio accesible",
  mapFallbackTitle: "El mapa interactivo no está disponible.",
  mapFallbackBody:
    "Aun así puedes buscar, filtrar y abrir todas las fichas públicas desde el directorio accesible, que funciona sin el mapa.",
  // Page-level chrome (/mappa).
  pageTitle: "Mapa interactivo",
  pageIntro:
    "Explora en el mapa las cámaras públicas documentadas. Usa los filtros para acotar la vista; cada marcador abre su ficha pública. Una zona vacía nunca demuestra que no haya cámaras.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Cargando el mapa…",
  // Map tool chrome (t_966254a1, t_11e38eab): no visible tool header — the
  // page starts directly with the map card. The h1 (pageTitle) stays in the
  // DOM as sr-only for a11y; the old "Explore documented cameras" section
  // heading, its coverage note and the "Live prototype" eyebrow were removed
  // with the duplicated header; pageIntro still covers the "an empty area
  // never proves absence" truthfulness contract (SSR metadata + a11y intro).
  // The prototype banner itself was removed (CEO feedback 2026-08-02) — the
  // map is no longer framed as a prototype.
  mapLegendTitle: "Cómo usar el mapa",
  mapLegendMove: "Arrastra el mapa o usa los controles + y − para explorar una zona.",
  mapLegendMarker: "Selecciona un marcador para abrir la ficha pública.",
  mapLegendFilters: "Usa la búsqueda y los filtros de encima del mapa para afinar los resultados.",
  mapLegendList: "Abre el panel lateral para recorrer los puntos de la vista actual.",
  mapLegendAdd: "Haz clic en un lugar vacío del mapa para reportar una cámara allí.",
  // Field-of-view legend entry (usability Batch C2, P1#6): the shaded wedge/
  // circle drawn around directional cameras (lib/field-of-view) carries the
  // SAME fact the marker popup already states as "Field of view: NE 45°"
  // (fovDirection) — surfacing it here lets a sighted user learn what the
  // shape means without opening a popup first.
  mapLegendFov: "Un cono o círculo sombreado alrededor de un marcador indica el campo de visión aproximado de esa cámara.",
  // Grid-aggregation badge legend entry (usability Batch C2, P1#7): at low
  // zoom the numbered .osm-grid-badge replaces individual markers. The badge
  // itself already names its count (gridBadgeLabel/Tooltip/Zoom), but nothing
  // told the user that zooming in splits one badge into separate cameras.
  mapLegendGridBadge: "Un círculo numerado agrupa varias cámaras a este nivel de zoom: acerca el zoom para verlas por separado.",
  mapLegendReport: "Reportar una cámara",
  // Always-visible hint under the map (one line): the empty-click shortcut is
  // otherwise explained ONLY inside the collapsed-by-default .map-legend, so
  // a sighted user could miss it entirely. Deliberately SHORTER than
  // mapLegendAdd — a hint, not the full legend entry.
  mapClickHint: "Haz clic en un lugar vacío para reportar una cámara allí.",
  // Shareable viewport (?lat&lng&zoom): the "Copy link" toolbar button copies
  // the current URL (which carries the map's view) and confirms briefly.
  copyLink: "Copiar enlace",
  copyLinkCopied: "¡Copiado!",
  pickTitle: "Nuevo reporte",
  pickCoordinates: "Coordenadas",
  pickReportHere: "Reportar una cámara aquí",
  recordId: "ID de la ficha",
  source: "Fuente",
  freshness: "Actualidad",
  location: "Ubicación",
  reportIssue: "Reportar un problema",
  loadingRecords: "Cargando la API pública de fichas…",
  unknown: "Desconocido",
  apiUnavailable:
    "La API pública no está accesible temporalmente; los puntos ya cargados siguen disponibles.",
  apiRateLimited: (seconds: number) =>
    `El mapa ha pausado temporalmente las nuevas peticiones de datos para respetar el límite del servicio. Volverá a intentarlo dentro de unos ${seconds} segundos; los puntos ya cargados siguen disponibles.`,
  // Continental viewport: the API answers a decimated sample (one request).
  viewportDecimated:
    "Esta vista presenta solo una selección de las cámaras de la zona. Acerca el zoom para cargar todo el detalle.",
  // Truthful empty state (never a silent map).
  emptyTitle: "Ninguna ficha publicada coincide con esos filtros.",
  emptyBody:
    "Esto no significa que no haya cámaras en la zona. Puedes restablecer los filtros, explorar el directorio o reportar una cámara que hayas observado desde el espacio público.",
  clearSearch: "Borrar filtros",
  offlineTitle: "No tienes conexión",
  offlineBody: "Se muestran las últimas fichas cargadas.",
  offlineAction: "Reintentar",
  // Map place search (privacy pass 2026-11): ONE purpose — find a place,
  // an address, coordinates or a record number. Nothing is sent while
  // typing; Enter (or the button) searches. Coordinates and "#123" are
  // resolved in the browser; only real place names reach our geocoder proxy.
  // Typing no longer filters the points (the directory search does that).
  listSearchLabel: "Buscar un lugar",
  listSearchPlaceholder: "Lugar, dirección, coordenadas o #ficha",
  listSearchHelp:
    "Escribe un lugar, una dirección, unas coordenadas como 41.9068, 12.4808 o un número de ficha como #6302 y pulsa Enter. Los resultados dentro de la vista actual del mapa aparecen primero.",
  // Search-as-you-type (2026-11): suggestions come only from our own
  // records (and the browser itself); the place search (OpenStreetMap)
  // runs only on Enter or the explicit last item.
  suggestLabel: "Sugerencias",
  suggestCount: (count: number) => (count === 1 ? "1 sugerencia disponible" : `${count} sugerencias disponibles`),
  suggestCoordinates: (text: string) => `Ir a las coordenadas ${text}`,
  suggestRecordNumber: (id: number) => `Abrir la ficha #${id}`,
  suggestPlace: (query: string) => `Buscar el lugar «${query}» (OpenStreetMap)`,
  listSearchButton: "Buscar",
  // Visible caption under the field: the privacy promise, in plain words.
  listSearchCaption:
    "Mientras escribes, solo buscamos en nuestras propias fichas. Los lugares se buscan en OpenStreetMap solo cuando pulsas Enter o eliges «Buscar el lugar»; las coordenadas y los números de #ficha nunca salen de tu navegador.",
  // Geocode autocomplete dropdown (t_b9666d09): the listbox under the
  // sidebar search field. Attribution is required by the ODbL for
  // Nominatim-derived place data (see docs/OSM_INTEGRATION.md §8).
  geocodeLabel: "Sugerencias de lugares",
  geocodeNoResults: (query: string) => `No hay resultados para «${query}»`,
  geocodeAttribution: "Lugares © colaboradores de OpenStreetMap",
  geocodeUnavailable: "La búsqueda de lugares no está disponible temporalmente.",
  geocodeRateLimited: (seconds: number) =>
    `La búsqueda de lugares ha alcanzado su límite de peticiones a corto plazo. Inténtalo de nuevo dentro de unos ${seconds} segundos; las coordenadas y los números de #ficha siguen funcionando.`,
  listTitle: "Puntos en la vista actual",
  // Points disclosure row (mobile, ID 2): the WHOLE header row is ONE button
  // carrying ONE compact label — the verb plus the current in-view count. The
  // zero/one/many wording is spelled here (dictionary function, never a
  // concatenation in the component), so a 320px row stays one short line.
  listShowCount: (count: number) => (count === 1 ? "Mostrar 1 punto" : `Mostrar ${count} puntos`),
  listHideCount: (count: number) => (count === 1 ? "Ocultar 1 punto" : `Ocultar ${count} puntos`),
  listMapSyncHelp: "La lista se actualiza al mover o hacer zoom en el mapa: acerca el zoom para acotarla y aléjalo para ampliarla.",
  listCount: (visible: number, total: number) =>
    visible === 0
      ? "No hay puntos en la vista actual"
      : visible === 1
        ? "Se muestra el único punto de la vista actual"
        : visible === total
          ? `Se muestran los ${visible} puntos de la vista actual`
          : `Se muestran ${visible} de ${total} puntos de la vista actual`,
  // Capped points list (perf): the list renders one page at a time; the
  // button appends the next page and a polite live region reports the
  // listed count. The heading count above always reports the full total.
  listShowMore: (next: number, remaining: number) =>
    next === remaining
      ? (remaining === 1 ? "Mostrar el último punto" : `Mostrar los últimos ${remaining} puntos`)
      : `Mostrar ${next} puntos más (${remaining} aún sin listar)`,
  listShownOf: (shown: number, total: number) => `Se listan ${shown} de ${total} puntos de la vista actual`,
  listEmptyInView:
    "No hay puntos documentados en la vista actual. Mueve el mapa o aleja el zoom para explorar más.",
  // Marker popup (t_702c10af): opens on marker click with the record info
  // and its correction/detail links.
  popupDetail: "Abrir ficha",
  // Field-of-view direction row in the marker popup (t_f8b775ec): the
  // textual, accessible equivalent of the decorative map cone.
  fovDirection: "Campo de visión",
  // Import provenance line in the marker popup (FASE C, t_4dbce318):
  // small secondary text at the bottom — the readable source (entity or
  // "Community report") with its licence, and the record's added date.
  popupAdded: "Añadida",
  popupCommunityReport: "Reporte de la comunidad",
  // Pixel-grid aggregation badges (t_26ce96f3, CEO 2026-08-05): at low zoom
  // / high density the map renders one count badge per 48px screen cell
  // instead of thousands of DOM markers. The badge is a button with a
  // count; clicking it zooms in toward the cell centroid. The tooltip and
  // the aria-label carry the same message (the count is the badge text).
  gridBadgeLabel: (count: number) => `${count} cámaras en esta zona: acerca el zoom para verlas`,
  gridBadgeTooltip: (count: number) => `${count} cámaras aquí`,
  gridBadgeZoom: (count: number) => `${count} cámaras: acerca el zoom para verlas por separado`,
  // Geolocation button (t_18259daa, CEO): a floating control stacked ABOVE
  // the zoom buttons shows the user's own position on the map. Everything
  // stays client-side — the position never leaves the browser (privacy by
  // design). aria-pressed carries the on/off state; the marker is a
  // precision dot + accuracy circle, never a camera marker.
  geolocateLabel: "Mostrar mi ubicación",
  geolocateDenied: "Se ha denegado el acceso a la ubicación. Permite el acceso a la ubicación e inténtalo de nuevo.",
  geolocateError: "No se ha podido determinar tu ubicación. Inténtalo de nuevo.",
};
