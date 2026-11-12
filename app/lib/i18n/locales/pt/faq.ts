/**
 * faq — PT translation. Parity-checked against the English pilot
 * bundle (../../faq.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../faq";

export const pt: Translation<typeof en> = {
  navigation: "Navegação das perguntas frequentes",
  homeAria: "Página inicial do OpenSurveillanceDB",
  map: "Mapa",
  directory: "Diretório",
  home: "Início",
  faqLabel: "Perguntas frequentes",
  contactLabel: "Contactos",
  eyebrow: "Perguntas frequentes",
  title: "Respostas claras sobre o funcionamento da base de dados.",
  intro:
    "Respostas curtas sobre reportes, rigor do mapa, ações da comunidade, correções e privacidade. Para tudo o que não esteja aqui, usa o formulário de correção ou a página de contactos.",
  qReport: "Como reporto uma câmara?",
  aReport:
    "Escolhe uma localização aproximada no mapa ou introduz coordenadas. Depois acrescenta apenas o que consegues observar a partir do espaço público: tipo, direção, aviso visível, fabricante. Não incluas pessoas, matrículas, habitações privadas, credenciais nem ligações para transmissões em direto. A partir de uma conta verificada, o teu reporte é publicado de imediato.",
  qAccuracy: "Qual é o rigor do mapa?",
  aAccuracy:
    "O mapa mostra as fichas ativas: cada reporte feito a partir de uma conta verificada aparece de imediato, e a comunidade mantém-no rigoroso. As coordenadas publicadas são arredondadas a cerca de quatro casas decimais, aproximadamente 10 metros. Um estado descreve a situação atual, não é uma garantia de que uma câmara esteja ativa. Uma zona vazia não prova que não existam câmaras — mostra apenas que não há nenhuma ficha publicada nesse local de momento.",
  qCorrect: "Como corrijo um erro?",
  aCorrect:
    "Usa o formulário privado de correção ou escreve para privacy@opensurveillancedb.org. Os pedidos de correção são privados: não alteram o mapa automaticamente e nunca são incluídos na exportação pública. Primeira resposta em 48 horas; resposta substantiva em 14 dias.",
  qPrivacy: "E a privacidade?",
  aPrivacy:
    "Os reportes são públicos assim que são publicados e nunca contêm rostos, matrículas nem dados pessoais. Os pedidos de correção privados permanecem privados. O responsável pelo tratamento dos dados é Simone Rondina (syax89) / OpenSurveillanceDB, Itália. Os direitos dos titulares dos dados (acesso, retificação, apagamento, oposição) podem ser exercidos através de privacy@opensurveillancedb.org.",
  qAccount: "Preciso de uma conta?",
  aAccount:
    "A consulta funciona sem conta. Submeter um reporte, enviar uma correção ou participar nas ações da comunidade exige uma conta gratuita e verificada. Com ela, podes acompanhar os teus reportes, editar as tuas contribuições, confirmar fichas e construir um nível de confiança.",
  qVerifications: "O que são as confirmações?",
  aVerifications:
    "Uma confirmação é uma verificação pessoal de que uma câmara ainda existe no local documentado. Cada conta pode manter uma ação da comunidade por ficha, para que as contagens reflitam pessoas distintas. As páginas públicas mostram apenas contagens agregadas e o histórico público da ficha — nunca é mostrado quem confirmou ou assinalou uma ficha.",
  qEdit: "Posso editar a minha contribuição?",
  aEdit:
    "Só o contribuidor que submeteu uma ficha a pode editar. Uma atualização a uma ficha já pública torna-se uma proposta privada: a versão publicada mantém-se visível até um moderador a aplicar ou descartar. Se uma ficha que não submeteste precisar de uma alteração, usa o formulário privado de correção — este nunca altera os dados públicos por si só.",
  qLevels: "O que são os níveis de contribuidor?",
  aLevels:
    "Os níveis de confiança reconhecem contribuições rigorosas: só contam as fichas ativas, com limiares de 1, 5, 20 e 50 contribuições. Os níveis são um reconhecimento, não uma competição — não existe nenhuma classificação pública nem tabela de líderes.",
  qDeleteAccount: "O que acontece às minhas verificações se eliminar a minha conta?",
  aDeleteAccount:
    "O apagamento da conta elimina a ligação entre ti e os dados da comunidade. As verificações que recebeste são eliminadas; as que deste permanecem na ficha, desidentificadas. Os teus reportes publicados continuam públicos sem atribuição a ti.",
  moreTitle: "Ainda tens perguntas?",
  moreBody:
    "Para correções, remoções e pedidos de privacidade, usa o formulário de correção ou a página de contactos.",
  guideCta: "Ler o guia do projeto",
  rulesCta: "Ler as regras de participação",
  privacyCta: "Ler os detalhes de privacidade",
  contactCta: "Abrir a página de contactos",
  correctionCta: "Ir para o formulário de correção",
  footer: "Criado para a transparência, não para o rastreamento.",
};
