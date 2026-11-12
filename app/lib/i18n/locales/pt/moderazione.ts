/**
 * moderazione — PT translation. Parity-checked against the English pilot
 * bundle (../../moderazione.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../moderazione";

export const pt: Translation<typeof en> = {
  navigation: "Navegação da publicação",
  homeAria: "Página inicial do OpenSurveillanceDB",
  map: "Mapa",
  directory: "Diretório",
  home: "Início",
  eyebrow: "Como funciona a publicação",
  title: "Publicado de imediato, mantido rigoroso pela comunidade.",
  intro:
    "Cada reporte feito a partir de uma conta verificada é publicado de imediato, no mapa, no diretório e nas exportações. Esta página explica como vive uma ficha, como a comunidade a mantém rigorosa e os limiares automáticos que decidem quando uma ficha é retirada ou reposta.",
  correctionCta: "Pedir uma correção",
  exploreMapCta: "Explorar o mapa",
  flowEyebrow: "A vida de uma ficha",
  flowTitle: "Da observação à ficha pública.",
  flowBody:
    "Um reporte é público assim que é submetido por uma conta verificada. Não há fila nem espera: a comunidade mantém o diretório rigoroso desde o primeiro minuto.",
  stepReceiveTitle: "Submeter",
  stepReceiveBody: "Um contribuidor verificado submete uma observação feita a partir do espaço público. O reporte é publicado de imediato.",
  stepScreenTitle: "Publicar",
  stepScreenBody: "A ficha aparece no mapa, no diretório e nas exportações. As coordenadas são arredondadas a cerca de 4 casas decimais (aproximadamente 10 metros); a localização exata nunca é publicada.",
  stepVerifyTitle: "Agir",
  stepVerifyBody: "Qualquer pessoa com uma conta verificada pode confirmar que a câmara ainda lá está, assinalá-la como já não presente, marcá-la como útil ou levantar um problema. Uma conta, uma ação ativa por ficha.",
  stepMinimiseTitle: "Limiares",
  stepMinimiseBody: "Os limiares automáticos decidem o que muda: sinalizações suficientes ocultam ou removem uma ficha, uma sinalização de privacidade oculta-a de imediato e confirmações suficientes repõem-na. Nenhuma conta controla sozinha a publicação.",
  stepDecideTitle: "Retirar",
  stepDecideBody: "Uma ficha suficientemente sinalizada pela comunidade é ocultada ou removida da lista pública. Continua acessível por ligação direta, com um aviso e o seu histórico público.",
  stepMaintainTitle: "Repor",
  stepMaintainBody: "Uma ficha ocultada ou removida pode regressar com confirmações suficientes da comunidade. Cada transição fica registada no histórico público da ficha.",
  appealsEyebrow: "Correções e emergências legais",
  appealsTitle: "Pedidos privados, um único poder de emergência.",
  appealsBody:
    "Os pedidos de correção permanecem privados: nunca alteram o mapa automaticamente e nunca são incluídos na exportação pública. O único poder de escrita humano que resta é a ocultação por emergência legal, usada por um administrador quando a lei o exige.",
  urgentTitle: "As sinalizações de privacidade são imediatas",
  urgentBody:
    "Uma preocupação de privacidade vinda de uma conta verificada oculta uma ficha de imediato, enquanto aguarda verificação da comunidade. As emergências legais seguem o mesmo percurso imediato; a reversão exige confirmações suficientes e um período de espera.",
  outcomeUpheldTitle: "Oculta",
  outcomeUpheldBody: "Uma ficha retirada enquanto aguarda verificação da comunidade ou legal. Não aparece na lista, mas continua acessível por ligação direta com o seu histórico público.",
  outcomeDismissedTitle: "Removida",
  outcomeDismissedBody: "A comunidade reportou que a câmara já não está lá. Não aparece na lista, e as confirmações podem repô-la.",
  outcomeEscalatedTitle: "Reposta",
  outcomeEscalatedBody: "Confirmações suficientes devolveram a ficha à lista pública. A reversão fica registada no seu histórico público.",
  slaTitle: "Prazos de resposta",
  slaBody:
    "Pedidos de correção e de remoção: primeira resposta em 48 horas, resposta substantiva em 14 dias; as ocultações por emergência legal são imediatas. Estes prazos estão em vigor.",
  safeguardsEyebrow: "Salvaguardas",
  safeguardsTitle: "Controlos sobre o modelo comunitário.",
  safeguardsBody: "O modelo está estruturado de forma a que nenhuma conta controle sozinha a publicação e os erros permaneçam visíveis.",
  safeguardPairTitle: "Apenas contas verificadas",
  safeguardPairBody: "Cada reporte e cada ação da comunidade exigem uma conta de contribuidor verificada — as escritas anónimas são recusadas.",
  safeguardEscalationTitle: "Limiares automáticos e transparentes",
  safeguardEscalationBody: "As retiradas e reposições seguem limiares publicados com mínimos de contribuidores distintos, para que uma única conta nunca possa decidir sozinha.",
  safeguardCredentialsTitle: "Histórico público e sem atribuição",
  safeguardCredentialsBody: "Cada transição fica registada no histórico público da ficha como um evento agregado. Quem confirmou ou assinalou nunca é mostrado nem associado a um perfil.",
  safeguardTrainingTitle: "Consumo e quotas",
  safeguardTrainingBody: "As ações que desencadeiam uma transição são consumidas quando esta ocorre, e as quotas diárias impedem ações automatizadas ou em massa.",
  safeguardAuditTitle: "Auditoria interna e apagamento",
  safeguardAuditBody: "Um registo de auditoria interno, só de acréscimo, mantém a atribuição completa para efeitos de responsabilização, e apagar uma conta remove as suas ações na comunidade.",
  notDashboardTitle: "Esta página não é o painel de moderação",
  notDashboardBody:
    "O painel de moderação é uma ferramenta privada, protegida por controlo de acesso e nunca ligada a partir do site público, reservada às emergências legais e ao fluxo privado de correções. Esta página apenas explica o modelo público.",
};
