/**
 * record — ES translation. Parity-checked against the English pilot
 * bundle (../../record.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../record";

export const es: Translation<typeof en> = {
  navigation: "Navegación de la ficha",
  backToDirectory: "← Volver al directorio",
  loading: "Cargando la ficha pública…",
  publicRecord: "Ficha pública",
  recordId: "ID de la ficha",
  source: "Fuente",
  // Creation date (FASE C, t_4dbce318): `cameras.created_at` — when the
  // record entered the database (import or community report). The detail
  // page shows it alongside provenance and the last update.
  addedOn: "Añadida",
  // M03 (design review 2026-10-22, P1): record.updated is the RECORD's last
  // update (import/edits), never a community confirmation. Labelling it
  // "Last confirmation" produced the contradiction "Never confirmed" +
  // "Last confirmation: 8 August 2026" on imported records. Real
  // confirmations keep their own label (lastConfirmed, from lastVerifiedAt).
  lastUpdated: "Última actualización",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Datos ilustrativos",
  demoUpdated: "Datos de demostración",
  generalLocation: "Ubicación general",
  manufacturer: "Fabricante",
  observedOn: "Observada el",
  viewOnMap: "Ver en el mapa",
  reportIssue: "Señalar un problema",
  recordNote:
    "Esta página contiene solo fichas públicas activas o fichas ilustrativas claramente indicadas. No ofrece imágenes en directo ni detalles operativos de las cámaras.",
  unavailable: "Ficha no disponible",
  notFound: "No hemos encontrado esa ficha pública.",
  notFoundDetail:
    "Puede que se haya eliminado, que no sea pública o que el enlace sea incorrecto.",
  browseDirectory: "Consulta el directorio",
  offlineTitle: "No tienes conexión",
  offlineBody: "Se muestran las últimas fichas cargadas.",
  offlineAction: "Volver a intentarlo",
  loadError: "No se ha podido cargar la ficha pública.",
  loadErrorDetail:
    "El servicio de fichas no es accesible en este momento. Comprueba tu conexión y vuelve a intentarlo.",
  retryLoad: "Volver a intentarlo",
  statusFallback: "Estado",
  changeHistory: "Historial de cambios",
  changeHistoryNote:
    "Este historial solo incluye eventos públicos. Nunca contiene identidades de colaboradores ni notas internas.",
  changeHistoryFallback: "Ficha actualizada",
  changeHistoryLabels: {
    approve: "Publicada",
    "mark-stale": "Señalada como ya no presente",
    reverify: "Verificada de nuevo",
    hide: "Oculta",
  },
  // Contribution edit form (/records/[id]/edit, C6). The page keeps its own
  // field labels here (record.ts is the form bundle per SITEMAP) instead of
  // mixing the report bundle: same per-page isolation rule as statusFilters.
  editTitle: "Título de la ficha",
  editTitlePlaceholder: "p. ej. Cámara de seguridad pública",
  editKind: "Tipo de cámara",
  editKindSelect: "Selecciona una opción",
  editKindOptions: {
    fixedDome: "Domo fijo",
    bullet: "Bullet",
    ptz: "PTZ",
    trafficReader: "Tráfico / lector de matrículas",
    otherUnknown: "Otro / desconocido",
  },
  editManufacturer: "Fabricante (opcional)",
  editManufacturerPlaceholder: "p. ej. nombre del fabricante",
  editObservedOn: "Fecha de observación (opcional)",
  editAddress: "Dirección aproximada (opcional)",
  editAddressPlaceholder: "Calle y ciudad",
  editAddressResolving: "Obteniendo la dirección…",
  editNotes: "¿Qué has observado?",
  editNotesPlaceholder: "Dirección, operador, cartel visible, modelo…",
  editDescription: "Descripción (opcional)",
  editDescriptionPlaceholder: "Contexto adicional sobre la ficha…",
  editBlockedRemovedTitle: "Esta ficha ya no se puede editar",
  editTitleRequired: "El título de la ficha es obligatorio.",
  editFieldTooLong: (limit: number) =>
    `Este campo puede tener como máximo ${limit} caracteres.`,
  editObservedOnInvalid: "Introduce una fecha válida (AAAA-MM-DD).",
  // Field-of-view direction (t_f8b775ec) — edit form, same pattern as the
  // report form: only for directional kinds, compass slider + "don't know".
  editDirectionTitle: "Dirección del campo de visión",
  editDirectionHelp: "El rumbo de brújula hacia el que apunta la cámara, en sentido horario desde el norte (0–359°).",
  editDirectionUnknown: "No sé la dirección",
  editDirectionDegrees: "Dirección",
  // Camera position (t_775c8400): the interactive map moves the record's
  // position — click the map or type the coordinates; directional kinds
  // with a known bearing draw the field-of-view cone (same geometry as the
  // report mini-map and /mappa).
  editPositionTitle: "Posición de la cámara",
  editPositionHelp:
    "Haz clic en el mapa para mover la posición de la cámara o escribe las coordenadas abajo. Para las cámaras direccionales, arrastra el tirador redondo del cono para fijar la dirección de visión.",
  editPositionMapAria: "Mapa — haz clic para mover la posición de la cámara",
  editLatitude: "Latitud",
  editLongitude: "Longitud",
  editPositionInvalid: "Introduce unas coordenadas válidas (latitud de −90 a 90, longitud de −180 a 180).",
  // Record detail fact (t_f8b775ec): "Direction: NE 45°" when the record
  // has a stored bearing (domes and unknown directions omit the row).
  direction: "Dirección",
  // Mini map on the record page (CEO 2026-08-07): a read-only Leaflet
  // display of the camera position and its field-of-view cone/circle —
  // decorative (role="img"), the same facts are textual in the list.
  positionOnMap: "Posición en el mapa",

  // --- Community status badge (ADR 0021 §9, FASE 3 UI): informational
  // freshness line — never a state change. A record with no confirmations
  // shows the neutral "never confirmed" badge; a confirmed one shows the
  // count and the last-confirmed date.
  communityStatus: "Estado comunitario",
  neverConfirmed: "Nunca confirmada",
  confirmedTimes: (count: number) =>
    `Confirmada ${count} ${count === 1 ? "vez" : "veces"}`,
  lastConfirmed: "Última confirmación",
  // Import provenance (import pipeline FASE C, t_4dbce318): imported
  // records carry a provenance line next to the community badge — the
  // source dataset (linked) and its licence (linked), never the raw
  // "import:<slug>" internal value.
  importedFrom: "Importada de",
  // M05 (design review 2026-10-22): the provenance line above already names
  // the dataset and links its licence, so the facts row states the ORIGIN
  // instead of repeating the full source name a second time.
  importedData: "Datos importados",

  // --- Hidden/removed banner (ADR 0021 §6.3, FASE 3 UI): a withdrawn
  // record stays reachable by direct link with an explicit banner; the
  // reversal signals (confirm / gone) stay open, and the public history
  // link is the transparency control.
  hiddenTitle: "Ficha oculta",
  hiddenBody:
    "Esta ficha se ha retirado a la espera de verificación comunitaria o legal. No aparece en el directorio ni en el mapa; aun así, puedes leer su historial público y participar.",
  removedTitle: "Señalada como ya no presente",
  removedBody:
    "La comunidad ha indicado que esta cámara ya no está. No aparece en el directorio ni en el mapa; aun así, puedes leer su historial público y confirmarla si vuelve a estar.",
  bannerHistoryLink: "Ver el historial público",
  bannerNote: "Las señales de reversión (confirmar, ya no está) siguen abiertas en esta ficha.",

  // --- Public per-record event timeline (ADR 0021 §7, FASE 3 UI): the
  // unattributed aggregate history. Labels cover every semantic event type
  // the API can emit; anything unknown falls back to the neutral fallback.
  timeline: "Historial público",
  timelineNote:
    "Solo eventos públicos agregados: nunca identidades de colaboradores, correos electrónicos ni notas internas.",
  timelineEmpty: "Todavía no hay eventos públicos.",
  timelineFallback: "Ficha actualizada",
  timelineLabels: {
    published: "Publicada",
    confirmed: "Presencia confirmada",
    liked: "Marcada como útil",
    "gone-flagged": "Señalada como ya no presente",
    hidden: "Oculta",
    removed: "Eliminada",
    restored: "Restaurada en el directorio",
    "action-consumed": "Acciones desencadenantes restablecidas",
    migration: "Historial migrado",
    "setting-changed": "Configuración modificada",
  },
  hideReasons: {
    problem: "motivo: señalada",
    privacy: "motivo: privacidad",
    adminLegal: "motivo: emergencia legal",
  },
  eventPeople: (count: number) => `${count} ${count === 1 ? "persona" : "personas"}`,
};
