/**
 * footer — ES translation. Parity-checked against the English pilot
 * bundle (../../footer.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../footer";

export const es: Translation<typeof en> = {
  landmarkLabel: "Pie de página del sitio",
  // The footer groups the public routes by task. Legal documents remain
  // available in a native disclosure so they are easy to reach without
  // competing with the primary paths through the site.
  navigation: "Navegación del sitio",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  tagline: "Una base de datos abierta de cámaras de videovigilancia pública, creada para la transparencia, no para el rastreo.",
  toolMap: "Mapa",
  toolDirectory: "Directorio",
  toolReport: "Reportar",
  toolCorrection: "Corregir",
  exploreGroup: "Explorar",
  contributeGroup: "Contribuir",
  projectGroup: "El proyecto",
  legalGroup: "Información legal",
  manifesto: "Manifiesto",
  rules: "Normas",
  moderation: "Moderación",
  apiDocs: "API pública",
  guide: "Guía",
  privacy: "Privacidad",
  terms: "Condiciones de uso",
  licenses: "Licencias",
  // The dedicated /fonti page contains both the public-data attribution and
  // the methodology used to collect and correct records.
  sources: "Método y fuentes",
  faq: "Preguntas frecuentes",
  contact: "Contacto",
  accessibility: "Declaración de accesibilidad",
  dataLicense: "Base de datos y exportaciones bajo licencia ODbL 1.0",
  osmAttribution: "Datos del mapa © colaboradores de OpenStreetMap",
};
