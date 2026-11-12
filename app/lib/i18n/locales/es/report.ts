/**
 * report — ES translation. Parity-checked against the English pilot
 * bundle (../../report.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../report";

export const es: Translation<typeof en> = {
  // Page-level chrome (/segnala).
  pageTitle: "Reporta una cámara",
  pageIntro:
    "Elige una ubicación en el mapa o introduce unas coordenadas y, después, añade solo lo que puedas observar desde el espacio público. Tu reporte se publica de inmediato.",
  navigation: "Navegación de reporte",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  // Report section (extracted from the home page bundle in F1).
  contribute: "Contribuir",
  reportTitle: "Ayuda a hacer legible el espacio público.",
  reportIntro:
    "Elige una ubicación en el mapa o introduce unas coordenadas y, después, añade solo lo que puedas observar desde el espacio público. Tu reporte se publica de inmediato.",
  beforeSubmitting: "Antes de enviar",
  beforeSubmittingBody:
    "No describas personas, matrículas, viviendas privadas, puntos débiles de seguridad ni ubicaciones sensibles.",
  stepLocation: "1. Ubicación",
  stepObservation: "2. Qué has observado",
  stepEvidence: "3. Confirma y publica",
  selectedPoint: "Punto seleccionado",
  // Report mini-map (t_ebbe0ea3): click to pick the position, drag the
  // cone's rotation handle to aim the field of view. The manual coordinate
  // fields below stay as the accessible fallback.
  mapAria: "Mapa — haz clic para elegir la posición de la cámara",
  mapHelp:
    "Haz clic en el mapa para elegir la posición de la cámara. Para las cámaras direccionales, arrastra el tirador redondo del cono para fijar la dirección de visión.",
  manualCoordinatesTitle: "O introduce unas coordenadas",
  manualCoordinatesHelp:
    "Usa grados decimales. La latitud debe estar entre -90 y 90, y la longitud entre -180 y 180. Se admite la coma como separador decimal.",
  latitude: "Latitud",
  longitude: "Longitud",
  useCoordinates: "Usar estas coordenadas",
  // One-tap geolocation (CEO 2026-08-09): the primary way to set a position
  // on a phone, standing in front of the camera. The map and the manual
  // fields stay as the alternatives when the device or the user says no.
  useMyPosition: "Usar mi ubicación",
  locatingPosition: "Buscando tu ubicación…",
  // Address search with autocomplete (issue #432): the /segnala location
  // row pairs a debounced place search (same-origin /api/geocode proxy)
  // with the one-tap geolocation button on its right.
  addressSearchLabel: "Buscar una dirección",
  addressSearchPlaceholder: "Calle, lugar o coordenadas…",
  addressSearchHelp:
    "Escribe una calle, una plaza o un lugar, o pega unas coordenadas (p. ej. 41.9068, 12.4808), y pulsa Intro o Buscar. No se envía nada mientras escribes.",
  addressSearchButton: "Buscar",
  addressSearchNoResults: (query: string) => `No se han encontrado lugares para «${query}».`,
  addressSearchRateLimited: (seconds: number) =>
    `Demasiadas búsquedas. Vuelve a intentarlo dentro de ${seconds} segundo${seconds === 1 ? "" : "s"}.`,
  addressSearchUnavailable: "La búsqueda de direcciones no está disponible en este momento.",
  addressSearchAttribution: "Lugares © colaboradores de OpenStreetMap",
  geolocationDenied:
    "Se ha denegado el permiso de ubicación. Elige el punto en el mapa o escribe las coordenadas abajo.",
  geolocationTimeout:
    "Tu ubicación ha tardado demasiado en llegar. Vuelve a intentarlo, elige el punto en el mapa o escribe las coordenadas abajo.",
  geolocationUnavailable:
    "Tu dispositivo no ha podido proporcionar una ubicación. Elige el punto en el mapa o escribe las coordenadas abajo.",
  checkingNearby: "Comprobando fichas públicas cercanas…",
  possibleDuplicate: "Posible duplicado cerca",
  duplicateBody:
    "Estas fichas públicas están a menos de 75 metros. Aun así, puedes enviar un nuevo reporte; se publicará de inmediato.",
  metresAway: "m de distancia",
  matchVeryClose: "coincidencia muy cercana",
  matchLikely: "coincidencia probable",
  duplicateGuidance:
    "Si es la misma cámara, usa el formulario de corrección en lugar de crear un duplicado.",
  // Horizon 1 duplicate gate (ADR 0019): a high-strength match must be
  // acknowledged before the report can be stored.
  duplicateConfirmNotice:
    "Se ha encontrado una coincidencia muy cercana. Confirma que se trata de una cámara distinta para enviarla o usa el formulario de corrección para la ficha existente.",
  duplicateConfirmTitle: "Ya existe una coincidencia muy cercana",
  duplicateConfirmBody:
    "Ya hay una ficha publicada casi en el mismo punto. Si es la misma cámara, usa el formulario de corrección. Si es una cámara diferente, confírmalo abajo para publicarla.",
  duplicateConfirmLabel:
    "Confirmo que es una cámara distinta y quiero enviarla igualmente.",
  nearbyUnavailable:
    "No hemos podido comprobar las fichas cercanas. Aun así, puedes enviar este reporte.",
  recordTitle: "Título de la ficha",
  recordTitlePlaceholder: "p. ej. Cámara de seguridad pública",
  selectOne: "Selecciona una opción",
  cameraType: "Tipo de cámara",
  fixedDome: "Domo fijo",
  bullet: "Bullet",
  ptz: "PTZ",
  trafficReader: "Tráfico / lector de matrículas",
  otherUnknown: "Otro / desconocido",
  // Field-of-view direction (t_f8b775ec): shown only for directional kinds
  // (never for domes). A compass slider 0-359 with an arrow preview plus a
  // "don't know" option that stores NULL.
  directionTitle: "Dirección del campo de visión",
  directionHelp: "El rumbo de brújula hacia el que apunta la cámara, en sentido horario desde el norte (0–359°).",
  directionUnknown: "No sé la dirección",
  directionDegrees: "Dirección",
  manufacturer: "Fabricante (opcional)",
  manufacturerPlaceholder: "p. ej. nombre del fabricante",
  observedOn: "Fecha de observación (opcional)",
  approximateAddress: "Dirección aproximada",
  addressPlaceholder: "Calle y ciudad (opcional)",
  resolvingAddress: "Obteniendo la dirección…",
  whatObserved: "¿Qué has observado?",
  observedPlaceholder: "Dirección, operador, cartel visible, modelo…",
  reportConsent:
    "Confirmo que esta observación se ha realizado desde el espacio público y no contiene datos personales.",
  privacyNotice: "Aviso de privacidad",
  privacyDetails: "Detalles de privacidad",
  termsOfUse: "Condiciones de uso",
  reportArt13:
    "Los datos que introduces (ubicación, notas) los trata el responsable Simone Rondina / OpenSurveillanceDB sobre la base del interés legítimo (art. 6(1)(f) RGPD) para documentar la infraestructura de videovigilancia pública. Información completa:",
  reportArt13Rights: "Puedes ejercer tus derechos del RGPD (arts. 15-22) escribiendo a",
  privacyContact: "privacy@opensurveillancedb.org",
  sendModeration: "Publicar el reporte",
  positionSelected: "Posición seleccionada",
  nearbyCheckError: "No se han podido comprobar las fichas cercanas",
  choosePosition:
    "Elige la posición aproximada de la cámara en el mapa o introduce unas coordenadas válidas antes de enviar.",
  invalidCoordinates:
    "Introduce una latitud (de -90 a 90) y una longitud (de -180 a 180) válidas.",
  defaultReportTitle: "Reporte de cámara pública",
  unknown: "Desconocido",
  submitReportError: "No se ha podido enviar el reporte",
  reportSaved:
    "Reporte publicado: ya es visible en el directorio y en el mapa.",
  reportSavedWithNearby:
    "Se han encontrado fichas cerca de esta posición: la comunidad comprobará si se trata de un duplicado.",
  // P1-2 (design review): the write gate (Fase E1) refuses submissions from
  // anonymous (401) and unverified (403) sessions. The login wall gates the
  // form itself; these messages cover a session that dies mid-form.
  loginRequired:
    "Tu sesión ha finalizado. Vuelve a iniciar sesión para enviar el reporte.",
  verifyRequired:
    "Tu correo electrónico aún no está verificado. Verifícalo desde la página de tu cuenta para enviar el reporte.",
  moderationUnavailable:
    "La publicación no está disponible. Vuelve a intentarlo más tarde.",
};
