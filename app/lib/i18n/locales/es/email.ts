/**
 * Transactional email copy — ES translation (see app/lib/email-templates.ts).
 * {SITE} is replaced with the brand name; <strong> is the only markup allowed.
 */
import type { EmailCopy } from "../../../email-templates";

export const es: EmailCopy = {
  greeting: (displayName) => (displayName ? `Hola, ${displayName}:` : "Hola:"),
  divider: "— Español —",
  buttonFallback: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  verify: {
    intro:
      "Confirma que esta dirección de correo electrónico es tuya para empezar a contribuir a {SITE}. Este enlace es válido durante <strong>24 horas</strong> y solo puede usarse una vez.",
    button: "Verificar la dirección de correo",
    ignore: "Si no has creado una cuenta en {SITE}, puedes ignorar este correo.",
  },
  reset: {
    intro:
      "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de {SITE}. Este enlace es válido durante <strong>3 horas</strong> y solo puede usarse una vez.",
    button: "Restablecer la contraseña",
    ignore: "Si no has solicitado restablecer la contraseña, puedes ignorar este correo: tu contraseña no cambiará.",
  },
  accountExists: {
    intro:
      "Alguien ha intentado crear una cuenta en {SITE} con esta dirección de correo electrónico. Si has sido tú, ya tienes una cuenta: inicia sesión o restablece tu contraseña si la has olvidado.",
    button: "Iniciar sesión",
    secondaryButton: "Restablecer la contraseña",
    ignore: "Si no has sido tú, puedes ignorar este correo: no ha cambiado nada.",
  },
};
