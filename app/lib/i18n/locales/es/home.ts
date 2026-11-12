/**
 * home — ES translation. Parity-checked against the English pilot
 * bundle (../../home.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../home";

export const es: Translation<typeof en> = {
  mainNavigation: "Navegación principal",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  pageTitle: "Base de datos abierta de la infraestructura de videovigilancia pública",
  pageDescription:
    "OpenSurveillanceDB es una base de datos cívica y sin ánimo de lucro sobre la infraestructura de videovigilancia pública visible: con fuentes, mantenida por la comunidad y con la privacidad como prioridad.",
  // QA#2 F1 (axe serious): the scrollable legal tables (/privacy data
  // table) become a focusable region when they overflow — the aria-label
  // tells keyboard users why the region is in the tab order and how to
  // scroll it.
  tableScrollAria: "Tabla — desplázate horizontalmente para ver más columnas",
  menu: "Menú",
  exploreMap: "Explorar el mapa",
  browseRecords: "Consultar las fichas",
  howItWorks: "Cómo funciona",
  rules: "Normas",
  manifesto: "Manifiesto",
  addCamera: "Añadir una cámara",
  contribuisci: "Contribuir",
  openDatabase: "Base de datos abierta · mantenida por la comunidad",
  heroTitle: "Datos públicos sobre la videovigilancia pública.",
  heroIntro:
    "OpenSurveillanceDB cartografía la infraestructura de videovigilancia visible en el espacio público. Los datos son abiertos y los construye la comunidad: las personas aportan lo que observan para que todos puedan entender los sistemas que les rodean.",
  exploreTheMap: "Explora el mapa",
  reportCta: "Reporta una cámara",
  searchDirectory: "Buscar en el directorio",
  searchDirectoryPlaceholder: "Busca por nombre, tipo o dirección",
  // Hero address autocomplete (issue #439): the hero search field is
  // progressively enhanced with the shared PlaceAutocomplete primitive.
  // The copy is home-scoped — the /segnala address search keeps its own
  // report-bundle wording.
  // Hero search-as-you-type (2026-11): record suggestions from our own
  // data only; the place lookup (OpenStreetMap) runs only when the last
  // item is chosen, then a chosen place opens the map there.
  suggestLabel: "Sugerencias",
  suggestCount: (count: number) => (count === 1 ? "1 sugerencia disponible" : `${count} sugerencias disponibles`),
  suggestCoordinates: (text: string) => `Ver las coordenadas ${text} en el mapa`,
  suggestRecordNumber: (id: number) => `Abrir la ficha #${id}`,
  suggestPlace: (query: string) => `Buscar el lugar «${query}» (OpenStreetMap)`,
  searchPlaceLabel: "Sugerencias de lugares",
  searchPlaceNoResults: (query: string) => `No hay resultados para «${query}»`,
  searchPlaceUnavailable: "La búsqueda de lugares no está disponible por ahora.",
  searchPlaceRateLimited: (seconds: number) => `La búsqueda de lugares ha alcanzado su límite temporal de solicitudes. Vuelve a intentarlo en unos ${seconds} segundos.`,
  searchPlaceAttribution: "Lugares © colaboradores de OpenStreetMap",
  searchDirectoryHelp:
    "Mientras escribes, las sugerencias vienen solo de nuestras propias fichas. Intro busca en el directorio; un lugar se busca en OpenStreetMap solo si eliges «Buscar el lugar».",
  statsLabel: "Estadísticas de la base de datos",
  publicRecords: "fichas públicas",
  browseFreely: "Sin cuenta",
  browseFreelyDetail: "para consultar",
  openData: "Datos abiertos",
  openDataDetail: "de libre reutilización",
  trustNote: "Cada ficha publicada muestra su fuente, su estado y una vía para corregirla.",
  sourcesLink: "Ver fuentes y metodología",
  visualLabelFirst: "Cartografiando el espacio público",
  visualLabelSecond: "con conocimiento público",
  // MapTeaser (static preview, CTA → /mappa). Zero Leaflet on the hub.
  teaserEyebrow: "El mapa",
  teaserTitle: "Explora el mapa interactivo",
  teaserBody: "Recorre el mapa a pantalla completa, con filtros, exportaciones y un directorio accesible con el teclado.",
  teaserCta: "Abrir el mapa",
  // Four tool cards (grid 2×2 desktop / 1×4 mobile).
  toolsTitle: "Qué puedes hacer",
  toolMapTitle: "Mapa",
  toolMapBody: "Ve de un vistazo todas las cámaras documentadas.",
  toolDirectoryTitle: "Directorio",
  toolDirectoryBody: "Consulta las fichas públicas sin el mapa.",
  toolReportTitle: "Reporta una cámara",
  toolReportBody: "Publica al momento una cámara que acabas de observar.",
  toolCorrectionTitle: "Corrige una ficha",
  toolCorrectionBody: "Corrige o actualiza una ficha publicada.",
  civicCommons: "Un bien común de datos cívicos",
  principlesTitle: "Visibilidad sin vigilancia.",
  principlesIntro:
    "Documentamos infraestructura pública, nunca imágenes de las cámaras. Cada ficha publicada tiene una fuente, un estado y una forma de corregirse.",
  openDefault: "Abierta por defecto",
  openDefaultBody:
    "Datos descargables con procedencia visible para el periodismo, la investigación y el uso cívico.",
  privacyFirst: "La privacidad, primero",
  privacyFirstBody:
    "Los rostros, las matrículas y la información personal deben eliminarse antes de publicar.",
  communityVerified: "Verificada por la comunidad",
  communityVerifiedBody:
    "Los reportes se publican al momento y la comunidad los mantiene precisos: confirma lo que sigue ahí, señala lo que ya no está y marca lo que es útil.",
  manifestoLink: "Lee el manifiesto",
};
