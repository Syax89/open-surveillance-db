/**
 * Transactional email copy — PT translation (see app/lib/email-templates.ts).
 * {SITE} is replaced with the brand name; <strong> is the only markup allowed.
 */
import type { EmailCopy } from "../../../email-templates";

export const pt: EmailCopy = {
  greeting: (displayName) => (displayName ? `Olá, ${displayName},` : "Olá,"),
  divider: "— Português —",
  buttonFallback: "Se o botão não funcionar, copia e cola esta ligação no teu navegador:",
  verify: {
    intro:
      "Confirma que este endereço de email te pertence para poderes começar a contribuir para o {SITE}. Esta ligação é válida durante <strong>24 horas</strong> e só pode ser usada uma vez.",
    button: "Verificar endereço de email",
    ignore: "Se não criaste uma conta no {SITE}, podes ignorar este email.",
  },
  reset: {
    intro:
      "Recebemos um pedido para redefinir a palavra-passe da tua conta no {SITE}. Esta ligação é válida durante <strong>3 horas</strong> e só pode ser usada uma vez.",
    button: "Redefinir palavra-passe",
    ignore: "Se não pediste a redefinição da palavra-passe, podes ignorar este email — a tua palavra-passe mantém-se inalterada.",
  },
};
