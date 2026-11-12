/**
 * correction — ES translation. Parity-checked against the English pilot
 * bundle (../../correction.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../correction";

export const es: Translation<typeof en> = {
  // Page-level chrome (/correggi).
  pageTitle: "Corrige una ficha",
  pageIntro:
    "Las correcciones son privadas. No modifican el mapa automáticamente y nunca se incluyen en la exportación pública de datos.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Cargando…",
  navigation: "Navegación de corrección",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  // Correction section (extracted from the home page bundle in F1).
  accountability: "Responsabilidad",
  correctionTitle: "Corrige una ficha o plantea un problema.",
  correctionIntro:
    "Las correcciones son privadas. No modifican el mapa automáticamente y nunca se incluyen en la exportación pública de datos.",
  urgentConcern: "¿Un problema urgente de privacidad o seguridad?",
  urgentConcernBody:
    "Describe solo lo mínimo necesario para identificar el problema. No incluyas datos personales, enlaces a imágenes en directo, credenciales ni imágenes.",
  stepRecord: "1. Ficha que revisar",
  stepIssue: "2. Describe el problema",
  stepContact: "3. Contacto y envío",
  relatedRecord: "Ficha pública relacionada",
  noSpecificRecord: "Ninguna ficha concreta / problema general",
  needsReview: "¿Qué hay que revisar?",
  selectOne: "Selecciona una opción",
  // Record-id field (CEO 2026-08-12: "un campo di ricerca per id piuttosto
  // che un menu a discesa"): the related-record field is a plain id input
  // instead of a native <select> with ALL records as options (the
  // ~37k-option menu froze the browser).
  recordIdPlaceholder: "Id de la ficha (p. ej. 6745)",
  recordIdHelp: "Escribe el id público de la ficha que aparece en su página; si la ficha existe, se mostrará una línea de confirmación.",
  recordIdNotFound: (id: number) => `No hay ninguna ficha pública con el id ${id}.`,
  recordIdUnavailable: "La búsqueda de fichas no está disponible en este momento.",
  recordIdClear: "Borrar la selección",
  // C4: the select maps 1:1 to the backend issue_type whitelist
  // (inaccurate|missing|removal|abuse|other) — see db/corrections.ts
  // CORRECTION_ISSUE_TYPES. Free text is never accepted for removal/abuse.
  inaccurate: "Información inexacta",
  missing: "Ya no está presente",
  removal: "Solicitud de eliminación",
  abuse: "Denuncia de abuso",
  other: "Otro",
  briefDescription: "Descripción breve",
  correctionPlaceholder:
    "Explica el problema sin incluir datos personales ni detalles operativos.",
  contactEmail: "Correo electrónico de contacto (opcional)",
  contactPlaceholder: "Solo si quieres recibir respuesta",
  correctionConsent:
    "Entiendo que esta solicitud es privada, la revisan personas y puede no dar lugar a un cambio automático.",
  correctionArt13:
    "Los datos de la solicitud y tus datos de contacto los trata el responsable Simone Rondina / OpenSurveillanceDB para gestionar tu solicitud, sobre la base de una obligación legal (art. 6(1)(c) RGPD — arts. 15-22) y del interés legítimo (art. 6(1)(f)). Información completa:",
  correctionArt13Rights: "Puedes ejercer tus derechos del RGPD escribiendo a",
  privacyContact: "privacy@opensurveillancedb.org",
  sendPrivateRequest: "Enviar solicitud privada",
  privacyNotice: "Aviso de privacidad",
  privacyDetails: "Detalles de privacidad",
  termsOfUse: "Condiciones de uso",
  saveRequestError: "No se ha podido guardar la solicitud",
  correctionSaved: "Solicitud privada de corrección guardada con la referencia",
  correctionPrivate: "No se muestra en el directorio público.",
  correctionUnavailable: "El servicio de correcciones no está disponible. Vuelve a intentarlo más tarde.",
  // P1-2 (design review): the write gate answers 401 (no session) and 403
  // (unverified email) with a single canonical body; these map the mid-form
  // session death to localized guidance instead of the raw server string.
  loginRequired:
    "Tu sesión ha finalizado. Vuelve a iniciar sesión para enviar la corrección.",
  verifyRequired:
    "Tu correo electrónico aún no está verificado. Verifícalo desde la página de tu cuenta para enviar la corrección.",
  // ?record=ID prefill announcement (aria-live).
  recordPreselected: (recordId: number, title: string) =>
    `Ficha ${recordId} preseleccionada: ${title}. Describe el problema a continuación.`,
};
