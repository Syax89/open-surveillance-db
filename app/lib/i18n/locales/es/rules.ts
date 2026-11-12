/**
 * rules — ES translation. Parity-checked against the English pilot
 * bundle (../../rules.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../rules";

export const es: Translation<typeof en> = {
  navigation: "Navegación de las normas",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  map: "Mapa",
  directory: "Directorio",
  guide: "Guía",
  home: "Inicio",
  eyebrow: "Normas de participación",
  title: "Qué publicamos y cómo puedes ayudar.",
  intro:
    "Estas normas explican qué documenta OpenSurveillanceDB y qué pueden reportar los colaboradores. Abarcan la publicación, las acciones de la comunidad, las correcciones y la reutilización de los datos.",
  reportEyebrow: "Qué puedes reportar",
  reportTitle: "Espacio público, observado desde el espacio público.",
  reportBody:
    "Solo puede documentarse la infraestructura de videovigilancia visible en espacios compartidos. Una ficha es publicable cuando tiene una finalidad clara de transparencia cívica y no contiene datos personales innecesarios.",
  eligibleOneTitle: "Infraestructura en la vía pública",
  eligibleOneBody:
    "Una cámara instalada de forma visible en una calle, una plaza, el exterior de una estación o el exterior de un edificio público.",
  eligibleTwoTitle: "Cámaras de tráfico documentadas públicamente",
  eligibleTwoBody:
    "Una cámara de control del tráfico documentada públicamente, cuando publicar la ficha es legal y seguro.",
  eligibleThreeTitle: "Fuentes públicas oficiales",
  eligibleThreeBody:
    "Una ficha procedente de una fuente pública oficial, indicando su fuente y la fecha de verificación.",
  neverTitle: "Nunca reportes",
  neverBody:
    "Los reportes que contengan cualquiera de los siguientes elementos nunca se conservan en el conjunto de datos público.",
  neverOneTitle: "Viviendas privadas",
  neverOneBody:
    "Cámaras residenciales o privadas, incluidos los videoporteros y las cámaras orientadas hacia una vivienda privada.",
  neverTwoTitle: "Personas y datos personales",
  neverTwoBody:
    "Personas identificables, matrículas de vehículos o interiores privados.",
  neverThreeTitle: "Imágenes en directo y accesos",
  neverThreeBody:
    "Vídeo en directo, URL de streaming, credenciales, información de red o interfaces de control.",
  neverFourTitle: "Detalles sensibles",
  neverFourBody:
    "Campo de visión detallado o capacidades operativas que puedan suponer un riesgo para la seguridad, o ubicaciones sensibles cuya publicación pueda no ser segura.",
  beforeSubmittingTitle: "Antes de enviar",
  beforeSubmittingBody:
    "Para enviar se necesita una cuenta de colaborador verificada. No subas ni describas personas, matrículas, viviendas privadas, puntos débiles de seguridad ni ubicaciones sensibles. Tu reporte se publica de inmediato, así que asegúrate de que puede ser público sin riesgos.",
  correctionEyebrow: "Correcciones",
  correctionTitle: "Una vía privada para cuestionar una ficha.",
  correctionBody:
    "Cualquier colaborador verificado puede solicitar una corrección, cuestionar una ficha o señalar un daño. Las solicitudes son privadas, las revisa una persona y nunca modifican el mapa automáticamente.",
  correctionOneTitle: "Solicita una corrección",
  correctionOneBody:
    "Las fichas inexactas, desactualizadas o duplicadas pueden señalarse para su revisión.",
  correctionTwoTitle: "Señala un problema de privacidad o seguridad",
  correctionTwoBody:
    "Un aviso de privacidad oculta una ficha de inmediato, a la espera de la verificación de la comunidad. Las emergencias legales siguen la misma vía inmediata.",
  correctionThreeTitle: "No hacen falta datos personales",
  correctionThreeBody:
    "Describe solo lo mínimo necesario para identificar el problema. No incluyas datos personales, enlaces a imágenes en directo, credenciales ni imágenes.",
  dataEyebrow: "Reutilización de datos",
  dataTitle: "Abiertos donde es seguro que lo sean.",
  dataBody:
    "Las fichas publicadas están disponibles en GeoJSON y CSV para su reutilización y consulta. El conjunto de datos público contiene las fichas activas; las solicitudes privadas de corrección nunca se incluyen.",
  downloadGeoJson: "Descargar el GeoJSON público",
  downloadCsv: "Descargar el CSV público",
  reuseOneTitle: "Licencia y procedencia",
  reuseOneBody:
    "Cada ficha publicada conserva su fuente y su fecha de verificación, y los datos tienen una licencia que permite su reutilización abierta.",
  reuseTwoTitle: "Sin detalles operativos",
  reuseTwoBody:
    "Las exportaciones están pensadas para el análisis cívico, la investigación y herramientas cartográficas compatibles, no para encontrar imágenes de cámaras ni información operativa sensible.",
  reuseThreeTitle: "Atribución a OpenStreetMap",
  reuseThreeBody:
    "El fondo del mapa lo proporcionan los colaboradores de OpenStreetMap y es independiente de las fichas de cámaras de este proyecto.",
  footer: "Creado para la transparencia, no para el rastreo.",
};
