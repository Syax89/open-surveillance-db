/**
 * guide — ES translation. Parity-checked against the English pilot
 * bundle (../../guide.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../guide";

export const es: Translation<typeof en> = {
  navigation: "Navegación de la guía",
  homeAria: "Inicio de OpenSurveillanceDB",
  map: "Mapa",
  directory: "Directorio",
  home: "Inicio",
  manifesto: "Manifiesto",
  eyebrow: "Guía del proyecto",
  title: "Una base de datos pública, construida con cuidado.",
  intro:
    "Esta guía explica qué documenta OpenSurveillanceDB y cómo usar el mapa y el directorio. También muestra cómo un reporte se convierte en dato público y qué no afirma la base de datos.",
  exploreMap: "Explorar el mapa",
  browseDirectory: "Consultar el directorio",
  overviewEyebrow: "Guía rápida",
  overviewTitle: "Encuentra lo que necesitas.",
  overviewPurpose: "Qué documenta la base de datos",
  overviewPublication: "Cómo se publica un reporte",
  overviewStatuses: "Cómo leer los estados de las fichas",
  overviewAccount: "Cuentas y aportaciones",
  overviewConfirmations: "Confirmaciones y confianza",
  overviewData: "Datos abiertos y exportaciones",
  missionEyebrow: "Finalidad y límites",
  missionTitle: "Visibilidad sin vigilancia operativa.",
  missionBody:
    "OpenSurveillanceDB ayuda a entender la infraestructura de vigilancia visible en el espacio público. Es un registro cívico de equipos orientados al público, no una herramienta para vigilar, rastrear ni eludir la vigilancia legal.",
  missionOneTitle: "Qué documentamos",
  missionOneBody:
    "Infraestructura de cámaras visible, ubicación aproximada, tipo, fuente y un estado comunitario.",
  missionTwoTitle: "Qué no recogemos",
  missionTwoBody:
    "Imágenes de las cámaras, credenciales, detalles de viviendas privadas, puntos débiles operativos, rostros, matrículas ni otros datos personales.",
  missionThreeTitle: "Qué no puede demostrar el mapa",
  missionThreeBody:
    "La ausencia de una ficha no demuestra que una zona esté libre de vigilancia. Solo indica que ahora mismo no hay ninguna ficha publicada allí.",
  cycleEyebrow: "Un proceso comunitario",
  cycleTitle: "De la observación a la ficha pública.",
  cycleBody:
    "Un reporte de una cuenta verificada se convierte en ficha pública al instante. Después, la comunidad mantiene el directorio al día: lo que sigue ahí se confirma, lo que ya no está se señala, lo que es útil se marca.",
  cycleRuleTitle: "La publicación es inmediata.",
  cycleRuleBody:
    "Un reporte se publica en cuanto un colaborador verificado lo envía. Sin colas ni esperas: la precisión la mantiene la comunidad, no un revisor.",
  cycleStepsLabel: "Ciclo de publicación",
  submitLabel: "Enviar",
  submitTitle: "Se envía una observación",
  submitBody:
    "Un colaborador elige una ubicación aproximada en el espacio público y añade una breve descripción. El reporte se publica de inmediato.",
  moderateLabel: "Comunidad",
  moderateTitle: "La comunidad lo mantiene preciso",
  moderateBody:
    "Cualquiera puede confirmar que una cámara sigue ahí, señalar que ya no está, marcarla como útil o plantear un problema. Cada acción requiere una cuenta verificada; los umbrales deciden qué cambia.",
  publishLabel: "Mantener",
  publishTitle: "Las fichas siguen vigentes hasta que la comunidad diga lo contrario",
  publishBody:
    "Una ficha sale de la lista pública solo después de suficientes señalamientos de la comunidad (o de una urgencia legal), y cada cambio de estado queda registrado en el historial público de la ficha.",
  publicationDetailsEyebrow: "La publicación en detalle",
  publicationDetailsTitle: "El modelo de publicación pública.",
  publicationDetailsSummary: "Lee las normas de publicación detalladas",
  statusEyebrow: "Cómo leer las fichas",
  statusTitle: "Cada estado indica lo que la ficha puede respaldar.",
  statusIntro:
    "Un estado describe la situación actual, no garantiza que una cámara esté activa, completa o sea siempre exacta.",
  verifiedTitle: "Publicada y vigente",
  verifiedBody:
    "La ficha es pública: aparece en el mapa, en el directorio y en la exportación GeoJSON. La comunidad puede actuar sobre ella en cualquier momento.",
  reviewTitle: "Oculta",
  reviewBody:
    "La ficha se ha retirado a la espera de una verificación comunitaria o legal. No aparece en la lista, pero su historial público sigue visible y las confirmaciones pueden recuperarla.",
  pendingTitle: "Reportada como ya no presente",
  pendingBody:
    "La comunidad ha reportado que esta cámara ya no está. No aparece en la lista, y la ficha puede restaurarse si las confirmaciones indican que ha vuelto.",
  accountEyebrow: "Tu cuenta",
  accountTitle: "¿Por qué crear una cuenta?",
  accountBody:
    "Para consultar los datos no hace falta cuenta. Con una cuenta puedes enviar reportes, participar en las acciones de la comunidad, seguir tus aportaciones y ganar un nivel de confianza.",
  accountWhyTitle: "Qué te aporta una cuenta",
  accountWhyBody:
    "Los reportes quedan vinculados a tu cuenta. Puedes editar tus aportaciones, confirmar fichas, señalar problemas y ver cómo crece tu nivel de confianza.",
  accountHowTitle: "Cómo funcionan las cuentas",
  accountHowBody:
    "Te registras con una dirección de correo y una contraseña, que se guarda como hash y nunca se expone. Debes verificar tu correo antes de poder publicar o participar en las acciones de la comunidad. También puedes añadir una llave de acceso o un inicio de sesión social a la misma cuenta.",
  accountAnonymousTitle: "La consulta sigue abierta",
  accountAnonymousBody:
    "Puedes explorar el mapa, el directorio y las exportaciones sin cuenta. Para enviar un reporte, mandar una corrección o participar en las acciones de la comunidad necesitas una cuenta de colaborador verificada.",
  editEyebrow: "Editar una aportación",
  editTitle: "Puedes editar tus propias aportaciones.",
  editBody:
    "Solo el colaborador que envió una ficha puede editarla. Una actualización de una ficha ya pública se convierte en una propuesta privada: la versión publicada sigue visible hasta que un moderador la aplique o la descarte. Para cualquier otra cosa, usa el formulario de corrección privado.",
  editOwnerTitle: "Solo el autor",
  editOwnerBody:
    "Solo puedes editar una ficha si la enviaste tú. Las fichas de otras personas no se pueden editar directamente; indica lo que hay que cambiar a través del formulario de corrección privado.",
  editRemoderationTitle: "Las actualizaciones se convierten en propuestas",
  editRemoderationBody:
    "Cuando una ficha ya es pública, una edición nunca la sobrescribe: el cambio se guarda como propuesta privada y un moderador la aplica o la descarta. La versión pública actual sigue visible todo el tiempo.",
  editNotImmediateTitle: "La propuesta sigue siendo privada",
  editNotImmediateBody:
    "Solo el cambio propuesto es privado mientras se revisa. La ficha publicada sigue apareciendo en el mapa, el directorio y las exportaciones hasta que se decida sobre la propuesta.",
  verifyEyebrow: "Confirmaciones",
  verifyTitle: "Qué significan las confirmaciones.",
  verifyBody:
    "Una confirmación es una comprobación personal de que una cámara sigue presente en la ubicación documentada. Ayuda a confiar en una ficha sin revelar quién la ha confirmado.",
  verifyWhatTitle: "Una comprobación personal",
  verifyWhatBody:
    "Al confirmar, declaras por tu propia observación que la cámara sigue existiendo donde indica la ficha.",
  verifyOneTitle: "Una por usuario",
  verifyOneBody:
    "Cada cuenta puede mantener una acción de la comunidad por ficha. Es una comprobación, no un concurso de popularidad: una persona, una señal.",
  verifyFairTitle: "Con juego limpio",
  verifyFairBody:
    "Las acciones de la comunidad requieren una cuenta verificada, las cuentas nuevas pesan menos que las de confianza y los límites diarios frenan las acciones automatizadas o masivas. No puedes confirmar ni marcar tu propia ficha.",
  verifyPrivateTitle: "Sin atribución pública",
  verifyPrivateBody:
    "Las páginas públicas muestran solo recuentos agregados y el historial público de la ficha. Quién ha confirmado o señalado una ficha nunca se muestra ni se vincula a un perfil.",
  levelEyebrow: "Niveles de confianza",
  levelTitle: "Reconocimiento, no competición.",
  levelBody:
    "Los niveles de confianza reflejan cuántas de tus aportaciones están vigentes en el directorio. Son un reconocimiento discreto del trabajo preciso, no una clasificación.",
  levelThresholdsTitle: "Niveles y umbrales",
  levelThresholdsBody:
    "Solo cuentan las aportaciones vigentes. Los umbrales son 1, 5, 20 y 50; las fichas ocultas o eliminadas no cuentan.",
  levelBadgeTitle: "Tres insignias",
  levelBadgeBody:
    "Tu perfil muestra una de tres insignias: Nuevo colaborador, Colaborador de confianza o Colaborador experimentado. La insignia es informativa, nunca un rango.",
  levelRecognitionTitle: "Sin tabla de clasificación",
  levelRecognitionBody:
    "Los niveles son personales. No existe ninguna clasificación pública ni tabla de líderes, y nunca se muestra el nivel de otra persona.",
  dataEyebrow: "Datos abiertos y mapa base",
  dataTitle: "Abiertos donde es seguro serlo.",
  dataBody:
    "Las fichas publicadas están disponibles en GeoJSON y CSV para su reutilización y consulta. El conjunto de datos público contiene las fichas vigentes; las solicitudes de corrección privadas nunca se incluyen.",
  downloadGeoJson: "Descargar GeoJSON público",
  downloadCsv: "Descargar CSV público",
  geoJsonTitle: "Una exportación pública reutilizable",
  geoJsonBody:
    "GeoJSON es un formato habitual de datos geográficos. Está pensado para análisis cívicos, investigación y herramientas cartográficas compatibles, no para encontrar imágenes de cámaras ni información operativa sensible.",
  osmTitle: "OpenStreetMap proporciona el mapa base",
  osmBody:
    "El fondo del mapa lo proporcionan los colaboradores de OpenStreetMap. Es independiente de las fichas de cámaras de este proyecto y siempre requiere una atribución visible y un uso responsable.",
  localLabel: "Estado del proyecto",
  localTitle: "Un proyecto en desarrollo",
  localBody:
    "OpenSurveillanceDB está en desarrollo activo. Las fichas se publican de inmediato desde cuentas verificadas y la comunidad las mantiene al día; el proyecto no afirma que los datos sean completos, actuales ni oficiales.",
  footer: "Creado para la transparencia, no para el rastreo.",
};
