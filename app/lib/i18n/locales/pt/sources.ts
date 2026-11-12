/**
 * sources — PT translation. Parity-checked against the English pilot
 * bundle (../../sources.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../sources";

export const pt: Translation<typeof en> = {
  navigation: "Navegação do site",
  homeAria: "Página inicial do OpenSurveillanceDB",
  eyebrow: "Dados · Método e fontes",
  title: "Metodologia e fontes de dados",
  intro:
    "Documentamos a infraestrutura de vigilância pública visível com observações da comunidade e conjuntos de dados públicos com licenças abertas. Eis como os dados são recolhidos, verificados e atribuídos.",
  methodologyTitle: "Como funciona a base de dados",
  methodologyIntro: "A base de dados é um registo público do que pode ser observado no espaço público. Não é um sistema de monitorização em tempo real e nunca contém transmissões das câmaras.",
  scopeTitle: "Âmbito",
  scopeBody: "Registamos equipamento visível no espaço público e os detalhes necessários para o identificar: localização, tipo, direção (quando conhecida) e fonte.",
  collectionTitle: "Recolha",
  collectionBody: "As fichas provêm de observações da comunidade e de conjuntos de dados públicos compatíveis. Os dados importados mantêm a fonte, a licença e a atribuição originais.",
  correctionTitle: "Verificação e correção",
  correctionBody: "Qualquer pessoa pode confirmar que uma ficha continua presente, reportar um problema ou pedir uma correção. As correções são revistas antes de alterarem os dados públicos.",
  limitsTitle: "Limites",
  limitsBody: "Uma zona vazia não prova que não existam câmaras. Uma ficha descreve a melhor informação disponível no momento, e as coordenadas públicas são arredondadas para proteger o contexto.",
  sourcesTitle: "Fontes de dados importadas",
  sourcesIntro: "Cada conjunto de dados importado é apresentado abaixo com o editor original, a licença, a data de importação, o número de fichas e a atribuição exigida.",
  // Table / card labels (per-source attribution contract, licence matrix
  // docs/data-sources/licenze-compatibilita.md).
  sourceColumn: "Fonte",
  licenseColumn: "Licença",
  importedOnColumn: "Importado em",
  recordsColumn: "Fichas",
  attributionColumn: "Atribuição",
  recordsCount: (count: number) => `${count.toLocaleString("pt-PT")} ${count === 1 ? "ficha" : "fichas"}`,
  openSource: "Abrir o conjunto de dados de origem (nova janela)",
  openLicense: "Abrir o texto da licença (nova janela)",
  // Honest empty state: no committed import batch yet — the page exists and
  // explains itself without inventing sources.
  emptyTitle: "Ainda não há conjuntos de dados importados",
  emptyBody:
    "Até agora não foi importado nenhum conjunto de dados público. Os reportes da comunidade são sempre publicados individualmente e nunca precisam desta página. Quando chegar a primeira importação, cada fonte será apresentada aqui com a respetiva licença e atribuição.",
  // Dynamic freshness line: the date is derived from the committed batches
  // at request time (app/fonti/page.tsx), never hardcoded — a static date
  // here would go stale the moment a new import lands (copy-finale rule:
  // the page must always tell the truth about its own content).
  lastUpdatedLabel: "Última atualização",
  descriptorsNote: "Os descritores de importação no repositório (docs/data-sources/imports/) continuam a ser a referência canónica.",
};
