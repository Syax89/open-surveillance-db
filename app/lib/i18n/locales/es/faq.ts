/**
 * faq — ES translation. Parity-checked against the English pilot
 * bundle (../../faq.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../faq";

export const es: Translation<typeof en> = {
  navigation: "Navegación de preguntas frecuentes",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  map: "Mapa",
  directory: "Directorio",
  home: "Inicio",
  faqLabel: "Preguntas frecuentes",
  contactLabel: "Contacto",
  eyebrow: "Preguntas frecuentes",
  title: "Respuestas claras sobre cómo funciona la base de datos.",
  intro:
    "Respuestas breves sobre reportes, precisión del mapa, acciones de la comunidad, correcciones y privacidad. Para cualquier cosa que no aparezca aquí, usa el formulario de corrección o la página de contacto.",
  qReport: "¿Cómo reporto una cámara?",
  aReport:
    "Elige una ubicación aproximada en el mapa o introduce unas coordenadas. Después, añade solo lo que puedas observar desde el espacio público: tipo, orientación, cartel visible, fabricante. No incluyas personas, matrículas, viviendas privadas, credenciales ni enlaces a imágenes en directo. Con una cuenta verificada, tu reporte se publica de inmediato.",
  qAccuracy: "¿Qué precisión tiene el mapa?",
  aAccuracy:
    "El mapa muestra las fichas activas: cada reporte de una cuenta verificada aparece al momento y la comunidad lo mantiene preciso. Las coordenadas publicadas se redondean a unos cuatro decimales, aproximadamente 10 metros. Un estado describe la situación actual, no garantiza que una cámara esté en funcionamiento. Que una zona aparezca vacía no demuestra que no haya cámaras: solo indica que ahora mismo no hay ninguna ficha publicada en ella.",
  qCorrect: "¿Cómo corrijo un error?",
  aCorrect:
    "Usa el formulario privado de corrección o escribe a privacy@opensurveillancedb.org. Las solicitudes de corrección son privadas: no modifican el mapa automáticamente y nunca se incluyen en la exportación pública. Primera respuesta en 48 horas; respuesta de fondo en 14 días.",
  qPrivacy: "¿Y la privacidad?",
  aPrivacy:
    "Los reportes son públicos en cuanto se publican y nunca contienen rostros, matrículas ni datos personales. Las solicitudes privadas de corrección siguen siendo privadas. El responsable del tratamiento es Simone Rondina (syax89) / OpenSurveillanceDB, Italia. Los derechos de los interesados (acceso, rectificación, supresión, oposición) pueden ejercerse a través de privacy@opensurveillancedb.org.",
  qAccount: "¿Necesito una cuenta?",
  aAccount:
    "Para consultar no hace falta cuenta. Para enviar un reporte, mandar una corrección o participar en las acciones de la comunidad necesitas una cuenta gratuita y verificada. Con ella puedes seguir tus reportes, editar tus contribuciones, confirmar fichas y ganar un nivel de confianza.",
  qVerifications: "¿Qué son las confirmaciones?",
  aVerifications:
    "Una confirmación es una comprobación personal de que una cámara sigue existiendo en la ubicación documentada. Cada cuenta puede mantener una sola acción de comunidad por ficha, así que los recuentos reflejan personas distintas. Las páginas públicas muestran solo recuentos agregados y el historial público de la ficha: nunca se muestra quién ha confirmado o señalado una ficha.",
  qEdit: "¿Puedo editar mi contribución?",
  aEdit:
    "Solo quien envió una ficha puede editarla. Una actualización de una ficha ya pública se convierte en una propuesta privada: la versión publicada sigue visible hasta que un moderador la aplica o la descarta. Si una ficha que no enviaste tú necesita un cambio, usa el formulario privado de corrección: por sí solo nunca modifica los datos públicos.",
  qLevels: "¿Qué son los niveles de colaborador?",
  aLevels:
    "Los niveles de confianza reconocen las contribuciones precisas: solo cuentan las fichas activas, con umbrales en 1, 5, 20 y 50 contribuciones. Los niveles son un reconocimiento, no una competición: no existe ninguna clasificación pública.",
  qDeleteAccount: "¿Qué pasa con mis verificaciones si elimino mi cuenta?",
  aDeleteAccount:
    "La eliminación de la cuenta borra el vínculo entre tú y los datos de la comunidad. Las verificaciones que has recibido se eliminan; las que has dado permanecen en la ficha, de forma anonimizada. Tus reportes publicados siguen siendo públicos sin que se te atribuyan.",
  moreTitle: "¿Tienes más preguntas?",
  moreBody:
    "Para correcciones, eliminaciones y solicitudes de privacidad, usa el formulario de corrección o la página de contacto.",
  guideCta: "Lee la guía del proyecto",
  rulesCta: "Lee las normas de participación",
  privacyCta: "Lee los detalles de privacidad",
  contactCta: "Abrir la página de contacto",
  correctionCta: "Ir al formulario de corrección",
  footer: "Creado para la transparencia, no para el rastreo.",
};
