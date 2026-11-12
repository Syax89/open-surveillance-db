/**
 * contact — PT translation. Parity-checked against the English pilot
 * bundle (../../contact.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../contact";

export const pt: Translation<typeof en> = {
  navigation: "Navegação dos contactos",
  homeAria: "Página inicial do OpenSurveillanceDB",
  map: "Mapa",
  directory: "Diretório",
  home: "Início",
  faqLabel: "Perguntas frequentes",
  contactLabel: "Contactos",
  eyebrow: "Contactos e responsabilização",
  title: "Quem gere o projeto e como nos contactar.",
  intro:
    "O OpenSurveillanceDB é uma base de dados cívica, aberta e sem fins comerciais sobre a infraestrutura de vigilância pública visível. Documenta equipamento virado para o espaço público; nunca disponibiliza transmissões, ferramentas de rastreamento nem conselhos para evitar a vigilância legal.",
  whoTitle: "Quem somos",
  whoBody:
    "Uma pequena equipa de voluntários identificados mantém o projeto. Estas são nomeações iniciais para a fase piloto, não uma afirmação de que já existe uma governação pública completa.",
  rolesTitle: "Funções e responsáveis",
  rolesIntro: "As funções iniciais da fase piloto foram atribuídas a 2026-07-31:",
  roleMaintainers: "Mantenedores",
  roleMaintainersBody: "Simone (syax89) — responsável pelo projeto. O responsável pelo projeto é a única pessoa que pode integrar alterações ao código.",
  roleOps: "Responsável pelas operações",
  roleOpsBody: "O mantenedor — alojamento, implementações, cópias de segurança.",
  roleData: "Curadores dos dados",
  roleDataBody: "Os mantenedores — modelo de dados, qualidade e conservação.",
  roleSecurity: "Contacto de segurança",
  roleSecurityBody: "O mantenedor — canal privado de comunicação descrito em SECURITY.md.",
  roleModeration: "Contacto de moderação",
  roleModerationBody: "O mantenedor.",
  controllerTitle: "Responsável pelo tratamento",
  controllerBody:
    "Simone Rondina (syax89) / OpenSurveillanceDB — Itália (decisão de 2026-07-31; a designação definitiva da entidade jurídica será confirmada no lançamento).",
  correctionTitle: "Correções e remoção",
  correctionBody:
    "Usa o formulário privado de correção ou escreve para o contacto de privacidade. Os pedidos são privados, analisados por uma pessoa e nunca publicados. Prazos de resposta: primeira resposta em 48 horas, resposta substantiva em 14 dias, ocultação urgente de conteúdos em 24 horas.",
  correctionForm: "Abrir o formulário de correção",
  correctionEmail: "privacy@opensurveillancedb.org",
  correctionEmailNote:
    "Caixa de correio dedicada e monitorizada.",
  securityTitle: "Comunicar uma vulnerabilidade de segurança",
  securityBody:
    "Usa o fluxo Private Vulnerability Reporting do GitHub, que cria um aviso confidencial que só os mantenedores podem ver. Não abras uma issue pública para uma vulnerabilidade.",
  securityAdvisory: "Abrir o formulário de aviso privado",
  securityPgpTitle: "Cifrar conteúdos sensíveis",
  securityPgpBody:
    "Para conteúdos que contenham dados pessoais ou detalhes operacionais, cifra-os com a chave PGP do projeto (impressão digital 04E8 A3EE 7C72 188B D3AF 925D 496C F0BD 4920 D3F7) e inclui o texto cifrado no aviso. Os prazos de resposta são os mesmos da secção de correções acima.",
  securityRouteNote:
    "As comunicações de segurança e os pedidos de privacidade seguem por canais separados: avisos privados para vulnerabilidades; o formulário de correção e o contacto de privacidade para pedidos dos titulares dos dados.",
  footer: "Criado para a transparência, não para o rastreamento.",
};
