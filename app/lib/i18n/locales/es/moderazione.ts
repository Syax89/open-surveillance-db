/**
 * moderazione — ES translation. Parity-checked against the English pilot
 * bundle (../../moderazione.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../moderazione";

export const es: Translation<typeof en> = {
  navigation: "Navegación de publicación",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  map: "Mapa",
  directory: "Directorio",
  home: "Inicio",
  eyebrow: "Cómo funciona la publicación",
  title: "Publicadas al momento, mantenidas precisas por la comunidad.",
  intro:
    "Cada reporte de una cuenta verificada se publica al momento en el mapa, en el directorio y en las exportaciones. Esta página explica cómo vive una ficha, cómo la mantiene precisa la comunidad y qué umbrales automáticos deciden cuándo se retira o se restaura.",
  correctionCta: "Solicita una corrección",
  exploreMapCta: "Explora el mapa",
  flowEyebrow: "La vida de una ficha",
  flowTitle: "De la observación a la ficha pública.",
  flowBody:
    "Un reporte es público en cuanto lo envía una cuenta verificada. No hay cola ni espera: la comunidad mantiene preciso el directorio desde el primer minuto.",
  stepReceiveTitle: "Enviar",
  stepReceiveBody: "Un colaborador verificado envía una observación hecha desde el espacio público. El reporte se publica de inmediato.",
  stepScreenTitle: "Publicar",
  stepScreenBody: "La ficha aparece en el mapa, en el directorio y en las exportaciones. Las coordenadas se redondean a unos 4 decimales (aproximadamente 10 metros); la ubicación exacta nunca se publica.",
  stepVerifyTitle: "Actuar",
  stepVerifyBody: "Cualquier persona con una cuenta verificada puede confirmar que la cámara sigue ahí, señalar que ya no está, marcarla como útil o plantear un problema. Una cuenta, una acción activa por ficha.",
  stepMinimiseTitle: "Umbrales",
  stepMinimiseBody: "Unos umbrales automáticos deciden qué cambia: suficientes avisos ocultan o eliminan una ficha, un aviso de privacidad la oculta de inmediato y suficientes confirmaciones la recuperan. Ninguna cuenta controla por sí sola la publicación.",
  stepDecideTitle: "Retirar",
  stepDecideBody: "Una ficha que la comunidad señala suficientes veces se oculta o se elimina de la lista pública. Sigue siendo accesible mediante enlace directo, con un aviso y su historial público.",
  stepMaintainTitle: "Restaurar",
  stepMaintainBody: "Una ficha oculta o eliminada puede volver con suficientes confirmaciones de la comunidad. Cada cambio de estado queda registrado en el historial público de la ficha.",
  appealsEyebrow: "Correcciones y emergencias legales",
  appealsTitle: "Solicitudes privadas, un único poder de emergencia.",
  appealsBody:
    "Las solicitudes de corrección siguen siendo privadas: nunca modifican el mapa automáticamente y nunca se incluyen en la exportación pública. El único poder de escritura humano que queda es la ocultación por emergencia legal, que utiliza un administrador cuando la ley lo exige.",
  urgentTitle: "Los avisos de privacidad son inmediatos",
  urgentBody:
    "Un problema de privacidad señalado por una cuenta verificada oculta una ficha de inmediato, a la espera de la verificación de la comunidad. Las emergencias legales siguen la misma vía inmediata; para revertirlo se necesitan suficientes confirmaciones y un periodo de espera.",
  outcomeUpheldTitle: "Oculta",
  outcomeUpheldBody: "Una ficha retirada a la espera de verificación comunitaria o legal. No aparece en la lista, pero es accesible mediante enlace directo con su historial público.",
  outcomeDismissedTitle: "Eliminada",
  outcomeDismissedBody: "La comunidad ha indicado que la cámara ya no está. No aparece en la lista y las confirmaciones pueden restaurarla.",
  outcomeEscalatedTitle: "Restaurada",
  outcomeEscalatedBody: "Suficientes confirmaciones han devuelto la ficha a la lista pública. La reversión queda registrada en su historial público.",
  slaTitle: "Plazos de respuesta",
  slaBody:
    "Solicitudes de corrección y de retirada: primera respuesta en 48 horas, respuesta de fondo en 14 días; las ocultaciones por emergencia legal son inmediatas. Estos plazos están en vigor.",
  safeguardsEyebrow: "Garantías",
  safeguardsTitle: "Controles sobre el modelo comunitario.",
  safeguardsBody: "El modelo está diseñado para que ninguna cuenta controle por sí sola la publicación y para que los errores sigan siendo visibles.",
  safeguardPairTitle: "Solo cuentas verificadas",
  safeguardPairBody: "Cada reporte y cada acción de la comunidad requieren una cuenta de colaborador verificada: las escrituras anónimas se rechazan.",
  safeguardEscalationTitle: "Umbrales automáticos y transparentes",
  safeguardEscalationBody: "Las retiradas y restauraciones siguen umbrales publicados con un mínimo de colaboradores distintos, de modo que una sola cuenta nunca puede decidir por sí sola.",
  safeguardCredentialsTitle: "Historial público y sin atribución",
  safeguardCredentialsBody: "Cada cambio de estado queda registrado en el historial público de la ficha como evento agregado. Nunca se muestra quién ha confirmado o señalado ni se vincula a un perfil.",
  safeguardTrainingTitle: "Consumo y cuotas",
  safeguardTrainingBody: "Las acciones que desencadenan un cambio de estado se consumen al producirse este, y las cuotas diarias frenan las acciones automatizadas o masivas.",
  safeguardAuditTitle: "Auditoría interna y supresión",
  safeguardAuditBody: "Un registro de auditoría interno, de solo anexado, conserva la atribución completa a efectos de rendición de cuentas, y al eliminar una cuenta se eliminan sus acciones de comunidad.",
  notDashboardTitle: "Esta página no es el panel de moderación",
  notDashboardBody:
    "El panel de moderación es una herramienta privada, protegida por control de acceso y nunca enlazada desde el sitio público, reservada a las emergencias legales y al flujo privado de corrección. Esta página solo explica el modelo público.",
};
