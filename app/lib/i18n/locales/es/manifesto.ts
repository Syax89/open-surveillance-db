/**
 * manifesto — ES translation. Parity-checked against the English pilot
 * bundle (../../manifesto.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../manifesto";

export const es: Translation<typeof en> = {
  navigation: "Navegación del manifiesto",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  map: "Mapa",
  directory: "Directorio",
  guide: "Cómo funciona",
  manifesto: "Manifiesto",
  home: "Inicio",
  eyebrow: "Manifiesto del proyecto",
  title: "Un manifiesto por un espacio público legible.",
  intro:
    "OpenSurveillanceDB es una base de datos cívica, abierta y sin ánimo de lucro sobre la infraestructura de videovigilancia pública visible. Esta página expone la finalidad del proyecto, los principios que lo rigen, los límites que acepta y lo que se publica y lo que no.",
  exploreMap: "Explora el mapa",
  browseDirectory: "Consulta el directorio",
  readGuide: "Lee la guía",
  founderEyebrow: "Declaración del fundador",
  founderTitle: "La transparencia es una condición del espacio público.",
  founderBody:
    "Este proyecto parte de una convicción sencilla: lo que observa el espacio público también debe ser legible para quienes viven en él. Las cámaras y los sistemas automatizados que afectan a la vida colectiva no pueden ser una presencia opaca. A medida que crece la vigilancia —desde grandes redes privadas como Flock Safety en Estados Unidos hasta los debates europeos e italianos sobre reconocimiento facial y biometría—, crece también la necesidad de un conocimiento público, verificable y compartido. OpenSurveillanceDB no está en contra de la seguridad ni pretende exponer a personas ni infraestructuras vulnerables. Es una herramienta sin ánimo de lucro para hacer visible, con límites y con responsabilidad, la infraestructura de videovigilancia orientada al espacio público. Publica datos sobre cámaras, no imágenes; contexto, no perfiles; transparencia, no rastreo. Creo que los datos de interés público deben seguir siendo accesibles para la comunidad. Por eso este proyecto es abierto, está documentado y se construye junto con las personas que viven y usan la ciudad.",
  founderSignature: "— Simone Rondina, fundador de OpenSurveillanceDB",
  missionEyebrow: "Misión",
  missionTitle: "Ayudar a las personas a entender los sistemas que las rodean.",
  missionBody:
    "El proyecto cartografía la infraestructura de cámaras visible en los espacios compartidos, para que el público pueda ver qué hay instalado a su alrededor. Solo documenta equipos orientados al espacio público. No es una herramienta para vigilar, rastrear ni eludir la videovigilancia legal.",
  missionOneTitle: "Qué documentamos",
  missionOneBody:
    "Infraestructura de cámaras visible, ubicación aproximada, tipo, fuente y un estado comunitario.",
  missionTwoTitle: "Qué no recopilamos",
  missionTwoBody:
    "Imágenes de las cámaras, credenciales, detalles de viviendas privadas, puntos débiles operativos, rostros, matrículas u otros datos personales.",
  missionThreeTitle: "Qué no pueden demostrar los datos",
  missionThreeBody:
    "La ausencia de una ficha no demuestra que una zona esté libre de videovigilancia. Solo indica que ahora mismo no hay ninguna ficha publicada en ella.",
  principlesEyebrow: "Principios",
  principlesTitle: "Libre, abierta y segura desde el diseño.",
  principlesIntro:
    "Cinco compromisos guían cada decisión de este proyecto, desde el modelo de datos hasta las acciones de la comunidad.",
  principleOneTitle: "De uso gratuito",
  principleOneBody:
    "Sin anuncios, sin elaboración de perfiles, sin funciones de pago. La base de datos y el software son bienes públicos.",
  principleTwoTitle: "Código abierto",
  principleTwoBody:
    "La comunidad puede inspeccionar, reutilizar y mejorar el software.",
  principleThreeTitle: "Datos abiertos con procedencia",
  principleThreeBody:
    "La licencia y la procedencia se registran para cada ficha publicada, de modo que el periodismo, la investigación y el uso cívico puedan confiar en ellas.",
  principleFourTitle: "Privacidad y seguridad desde el diseño",
  principleFourBody:
    "Nada de cámaras de viviendas privadas, detalles operativos sensibles ni enlaces a imágenes en directo. Los rostros y las matrículas se eliminan antes de la publicación.",
  principleFiveTitle: "La precisión comunitaria, primero",
  principleFiveBody:
    "Los reportes de cuentas verificadas se publican de inmediato. La comunidad mantiene preciso el directorio: confirma lo que sigue ahí, señala lo que ya no está y retira lo problemático, según umbrales automáticos y transparentes.",
  nonGoalsEyebrow: "Lo que no buscamos",
  nonGoalsTitle: "Lo que deliberadamente no hacemos.",
  nonGoalsBody:
    "Los límites son tan importantes como la misión. OpenSurveillanceDB nunca se convertirá en nada de lo siguiente:",
  nonGoalFeedsTitle: "Sin imágenes de cámaras",
  nonGoalFeedsBody:
    "Documentamos equipos, no grabaciones. Nunca se enlaza ni se muestra ninguna imagen en directo ni grabada.",
  nonGoalTrackingTitle: "Sin herramientas de rastreo",
  nonGoalTrackingBody:
    "Los datos no pueden utilizarse para vigilar, seguir ni perfilar a personas en el espacio público.",
  nonGoalBypassTitle: "Sin consejos para eludir la vigilancia",
  nonGoalBypassBody:
    "El proyecto no ayuda a nadie a eludir la videovigilancia legal y no publica puntos débiles operativos.",
  nonGoalPrivateTitle: "Sin propiedad privada",
  nonGoalPrivateBody:
    "Las cámaras que vigilan viviendas privadas y los detalles de la vida privada quedan fuera del alcance del proyecto.",
  publishEyebrow: "Qué publicamos",
  publishTitle: "Abiertos donde es seguro que lo sean.",
  publishBody:
    "La infraestructura orientada al espacio público entra en los datos públicos en cuanto se reporta. Cada ficha es un hecho sobre un equipo visible, no sobre una persona, y sigue activa hasta que la comunidad la retira.",
  publishedTitle: "Se publica",
  publishedItemOne: "La infraestructura de cámaras visible y su ubicación aproximada",
  publishedItemTwo: "El tipo, la fuente y el estado comunitario de cada ficha",
  publishedItemThree:
    "Exportaciones en GeoJSON y CSV de las fichas públicas, con licencia y procedencia",
  neverPublishedTitle: "Nunca se publica",
  neverPublishedItemOne: "Imágenes de las cámaras, credenciales o enlaces a grabaciones en directo",
  neverPublishedItemTwo: "Rostros, matrículas o cualquier dato personal",
  neverPublishedItemThree:
    "Detalles de viviendas privadas, ubicaciones sensibles o puntos débiles operativos",
  neverPublishedItemFour:
    "Las solicitudes privadas de corrección, que nunca entran en el conjunto de datos público",
  footerNote: "Creado para la transparencia, no para el rastreo.",
};
