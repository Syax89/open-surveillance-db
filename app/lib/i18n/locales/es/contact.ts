/**
 * contact — ES translation. Parity-checked against the English pilot
 * bundle (../../contact.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../contact";

export const es: Translation<typeof en> = {
  navigation: "Navegación de contacto",
  homeAria: "Página de inicio de OpenSurveillanceDB",
  map: "Mapa",
  directory: "Directorio",
  home: "Inicio",
  faqLabel: "Preguntas frecuentes",
  contactLabel: "Contacto",
  eyebrow: "Contacto y responsabilidad",
  title: "Quién gestiona esto y cómo contactarnos.",
  intro:
    "OpenSurveillanceDB es una base de datos cívica, abierta y sin ánimo de lucro sobre la infraestructura de videovigilancia pública visible. Documenta los equipos orientados al espacio público; nunca ofrece imágenes en directo, herramientas de rastreo ni consejos para eludir la videovigilancia legal.",
  whoTitle: "Quiénes somos",
  whoBody:
    "Un pequeño equipo de voluntarios identificados mantiene el proyecto. Se trata de nombramientos iniciales para la fase piloto, no de una afirmación de que ya exista una gobernanza pública completa.",
  rolesTitle: "Funciones y responsables",
  rolesIntro: "Las funciones iniciales de la fase piloto se asignaron el 2026-07-31:",
  roleMaintainers: "Mantenedores",
  roleMaintainersBody: "Simone (syax89) — propietario del proyecto. El propietario del proyecto es la única persona que puede fusionar cambios en el código.",
  roleOps: "Responsable de operaciones",
  roleOpsBody: "El mantenedor — alojamiento, despliegues y copias de seguridad.",
  roleData: "Responsables de los datos",
  roleDataBody: "Los mantenedores — modelo de datos, calidad y conservación.",
  roleSecurity: "Contacto de seguridad",
  roleSecurityBody: "El mantenedor — canal de reporte privado indicado en SECURITY.md.",
  roleModeration: "Contacto de moderación",
  roleModerationBody: "El mantenedor.",
  controllerTitle: "Responsable del tratamiento",
  controllerBody:
    "Simone Rondina (syax89) / OpenSurveillanceDB — Italia (decisión del 2026-07-31; la denominación definitiva de la entidad jurídica se confirmará en el lanzamiento).",
  correctionTitle: "Correcciones y eliminación",
  correctionBody:
    "Usa el formulario privado de corrección o escribe al contacto de privacidad. Las solicitudes son privadas, las revisa una persona y nunca se publican. Plazos de respuesta: primera respuesta en 48 horas, respuesta de fondo en 14 días y ocultación urgente de contenido en 24 horas.",
  correctionForm: "Abrir el formulario de corrección",
  correctionEmail: "privacy@opensurveillancedb.org",
  correctionEmailNote:
    "Buzón dedicado y supervisado.",
  securityTitle: "Reportar una vulnerabilidad de seguridad",
  securityBody:
    "Usa el procedimiento Private Vulnerability Reporting de GitHub, que crea un aviso confidencial que solo pueden ver los mantenedores. No abras una issue pública para una vulnerabilidad.",
  securityAdvisory: "Abrir el formulario de aviso privado",
  securityPgpTitle: "Cifrar contenidos sensibles",
  securityPgpBody:
    "Si el contenido incluye datos personales o detalles operativos, cífralo con la clave PGP del proyecto (huella 04E8 A3EE 7C72 188B D3AF 925D 496C F0BD 4920 D3F7) e incluye el texto cifrado en el aviso. Los plazos de respuesta son los mismos que los de la sección de correcciones anterior.",
  securityRouteNote:
    "Los reportes de seguridad y las solicitudes de privacidad van por canales separados: avisos privados para las vulnerabilidades; el formulario de corrección y el contacto de privacidad para las solicitudes de los interesados.",
  footer: "Creado para la transparencia, no para el rastreo.",
};
