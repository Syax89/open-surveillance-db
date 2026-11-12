/**
 * sources — ES translation. Parity-checked against the English pilot
 * bundle (../../sources.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../sources";

export const es: Translation<typeof en> = {
  navigation: "Navegación del sitio",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  eyebrow: "Datos · Método y fuentes",
  title: "Metodología y fuentes de datos",
  intro:
    "Documentamos la infraestructura de videovigilancia pública visible mediante observaciones de la comunidad y conjuntos de datos públicos con licencia abierta. Aquí te explicamos cómo se recopilan, comprueban y atribuyen los datos.",
  methodologyTitle: "Cómo funciona la base de datos",
  methodologyIntro: "La base de datos es un registro público de lo que puede observarse en el espacio público. No es un sistema de monitorización en directo y nunca contiene imágenes de las cámaras.",
  scopeTitle: "Alcance",
  scopeBody: "Registramos los equipos visibles en el espacio público y los datos necesarios para identificarlos: ubicación, tipo, orientación cuando se conoce y fuente.",
  collectionTitle: "Recopilación",
  collectionBody: "Las fichas proceden de observaciones de la comunidad y de conjuntos de datos públicos compatibles. Los datos importados conservan su fuente, licencia y atribución originales.",
  correctionTitle: "Verificación y corrección",
  correctionBody: "Cualquiera puede confirmar que una ficha sigue presente, señalar un problema o solicitar una corrección. Las correcciones se revisan antes de modificar los datos públicos.",
  limitsTitle: "Límites",
  limitsBody: "Que una zona aparezca vacía no demuestra que no haya cámaras. Una ficha describe la mejor información disponible en ese momento, y las coordenadas públicas se redondean para proteger el contexto.",
  sourcesTitle: "Fuentes de datos importadas",
  sourcesIntro: "Cada conjunto de datos importado aparece a continuación con su editor original, licencia, fecha de importación, número de fichas y atribución requerida.",
  // Table / card labels (per-source attribution contract, licence matrix
  // docs/data-sources/licenze-compatibilita.md).
  sourceColumn: "Fuente",
  licenseColumn: "Licencia",
  importedOnColumn: "Importado el",
  recordsColumn: "Fichas",
  attributionColumn: "Atribución",
  recordsCount: (count: number) => `${count.toLocaleString()} ${count === 1 ? "ficha" : "fichas"}`,
  openSource: "Abrir el conjunto de datos de origen (nueva ventana)",
  openLicense: "Abrir el texto de la licencia (nueva ventana)",
  // Honest empty state: no committed import batch yet — the page exists and
  // explains itself without inventing sources.
  emptyTitle: "Todavía no hay conjuntos de datos importados",
  emptyBody:
    "Hasta ahora no se ha importado ningún conjunto de datos público. Los reportes de la comunidad siempre se publican de forma individual y nunca necesitan esta página. Cuando llegue la primera importación, todas las fuentes aparecerán aquí con su licencia y atribución.",
  // Dynamic freshness line: the date is derived from the committed batches
  // at request time (app/fonti/page.tsx), never hardcoded — a static date
  // here would go stale the moment a new import lands (copy-finale rule:
  // the page must always tell the truth about its own content).
  lastUpdatedLabel: "Última actualización",
  descriptorsNote: "Los descriptores de importación del repositorio (docs/data-sources/imports/) siguen siendo la referencia canónica.",
};
