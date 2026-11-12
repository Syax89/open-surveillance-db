/**
 * guide — PT translation. Parity-checked against the English pilot
 * bundle (../../guide.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../guide";

export const pt: Translation<typeof en> = {
  navigation: "Navegação do guia",
  homeAria: "Página inicial do OpenSurveillanceDB",
  map: "Mapa",
  directory: "Diretório",
  home: "Início",
  manifesto: "Manifesto",
  eyebrow: "Guia do projeto",
  title: "Uma base de dados pública, construída com cuidado.",
  intro:
    "Este guia explica o que o OpenSurveillanceDB documenta e como usar o mapa e o diretório. Mostra também como um reporte se torna um dado público e o que a base de dados não afirma.",
  exploreMap: "Explorar o mapa",
  browseDirectory: "Percorrer o diretório",
  overviewEyebrow: "Guia rápido",
  overviewTitle: "Encontra o que precisas.",
  overviewPurpose: "O que a base de dados documenta",
  overviewPublication: "Como é publicado um reporte",
  overviewStatuses: "Como ler os estados das fichas",
  overviewAccount: "Contas e contribuições",
  overviewConfirmations: "Confirmações e confiança",
  overviewData: "Dados abertos e exportações",
  missionEyebrow: "Objetivo e limites",
  missionTitle: "Visibilidade sem vigilância operacional.",
  missionBody:
    "O OpenSurveillanceDB ajuda as pessoas a compreender a infraestrutura de vigilância visível no espaço público. É um registo cívico de equipamentos virados para o público, não uma ferramenta para observar, seguir ou contornar a vigilância legítima.",
  missionOneTitle: "O que documentamos",
  missionOneBody:
    "Infraestrutura de câmaras visível, localização aproximada, tipo, fonte e um estado atribuído pela comunidade.",
  missionTwoTitle: "O que não recolhemos",
  missionTwoBody:
    "Transmissões das câmaras, credenciais, pormenores de habitações privadas, fragilidades operacionais, rostos, matrículas ou outros dados pessoais.",
  missionThreeTitle: "O que o mapa não pode provar",
  missionThreeBody:
    "A ausência de uma ficha não mostra que uma zona está livre de vigilância. Mostra apenas que, de momento, não há nenhuma ficha publicada nesse local.",
  cycleEyebrow: "Um processo comunitário",
  cycleTitle: "Da observação à ficha pública.",
  cycleBody:
    "Um reporte feito a partir de uma conta verificada torna-se imediatamente uma ficha pública. Depois, é a comunidade que mantém o diretório rigoroso: o que ainda existe é confirmado, o que desapareceu é assinalado, o que é útil é marcado.",
  cycleRuleTitle: "A publicação é imediata.",
  cycleRuleBody:
    "Um reporte é publicado assim que um contribuidor verificado o envia. Sem filas, sem esperas: o rigor é mantido pela comunidade, não por um revisor.",
  cycleStepsLabel: "Ciclo de publicação",
  submitLabel: "Enviar",
  submitTitle: "É enviada uma observação",
  submitBody:
    "Um contribuidor escolhe uma localização aproximada no espaço público e acrescenta uma breve descrição. O reporte é publicado de imediato.",
  moderateLabel: "Comunidade",
  moderateTitle: "A comunidade mantém-na rigorosa",
  moderateBody:
    "As pessoas podem confirmar que uma câmara ainda existe, assinalá-la como já não presente, marcá-la como útil ou levantar um problema. Cada ação exige uma conta verificada; os limiares decidem o que muda.",
  publishLabel: "Manter",
  publishTitle: "As fichas mantêm-se ativas até a comunidade decidir o contrário",
  publishBody:
    "Uma ficha só sai da lista pública depois de assinalamentos suficientes da comunidade — ou de uma emergência legal — e cada transição fica registada no histórico público da ficha.",
  publicationDetailsEyebrow: "A publicação em detalhe",
  publicationDetailsTitle: "O modelo de publicação pública.",
  publicationDetailsSummary: "Lê as regras de publicação detalhadas",
  statusEyebrow: "Ler as fichas",
  statusTitle: "Cada estado diz o que a ficha pode sustentar.",
  statusIntro:
    "Um estado descreve a situação atual, não uma garantia de que uma câmara está ativa, completa ou permanentemente correta.",
  verifiedTitle: "Publicada e ativa",
  verifiedBody:
    "A ficha é pública: aparece no mapa, no diretório e na exportação GeoJSON. A comunidade pode agir sobre ela a qualquer momento.",
  reviewTitle: "Oculta",
  reviewBody:
    "A ficha foi retirada enquanto aguarda verificação da comunidade ou legal. Não aparece listada, mas o seu histórico público continua visível e as confirmações podem trazê-la de volta.",
  pendingTitle: "Reportada como já não presente",
  pendingBody:
    "A comunidade reportou que esta câmara já não existe. A ficha não aparece listada e pode ser restaurada se as confirmações mostrarem que a câmara voltou.",
  accountEyebrow: "A tua conta",
  accountTitle: "Porquê criar uma conta?",
  accountBody:
    "Consultar os dados não exige conta. Com uma conta podes enviar reportes, participar nas ações da comunidade, acompanhar as tuas contribuições e construir um nível de confiança.",
  accountWhyTitle: "O que uma conta te dá",
  accountWhyBody:
    "Os reportes ficam associados à tua conta. Podes editar as tuas contribuições, confirmar fichas, assinalar problemas e ver o teu nível de confiança crescer.",
  accountHowTitle: "Como funcionam as contas",
  accountHowBody:
    "Registas-te com um endereço de email e uma palavra-passe, guardada como hash e nunca exposta. A verificação do email é obrigatória antes de poderes publicar ou participar nas ações da comunidade. Também podes adicionar uma chave de acesso ou um início de sessão social à mesma conta.",
  accountAnonymousTitle: "A consulta continua aberta",
  accountAnonymousBody:
    "Podes explorar o mapa, o diretório e as exportações sem conta. Enviar um reporte, enviar uma correção ou participar nas ações da comunidade exige uma conta de contribuidor verificada.",
  editEyebrow: "Editar uma contribuição",
  editTitle: "Podes editar as tuas próprias contribuições.",
  editBody:
    "Só o contribuidor que enviou uma ficha a pode editar. Uma atualização a uma ficha já pública torna-se uma proposta privada: a versão publicada continua visível até um moderador a aplicar ou descartar. Para tudo o resto, usa o formulário privado de correção.",
  editOwnerTitle: "Só o autor",
  editOwnerBody:
    "Só podes editar uma ficha se tiveres sido tu a enviá-la. As fichas de outras pessoas não podem ser editadas diretamente; indica o que precisa de mudar através do formulário privado de correção.",
  editRemoderationTitle: "As atualizações tornam-se propostas",
  editRemoderationBody:
    "Quando uma ficha já é pública, uma edição nunca a substitui: a alteração é guardada como proposta privada e um moderador aplica-a ou descarta-a. A versão pública atual continua visível durante todo o processo.",
  editNotImmediateTitle: "A proposta mantém-se privada",
  editNotImmediateBody:
    "Só a alteração proposta é privada enquanto está a ser revista. A ficha publicada continua a aparecer no mapa, no diretório e nas exportações até a proposta ser decidida.",
  verifyEyebrow: "Confirmações",
  verifyTitle: "O que significam as confirmações.",
  verifyBody:
    "Uma confirmação é uma verificação pessoal de que uma câmara continua presente no local documentado. Ajuda os leitores a confiar numa ficha sem revelar quem a confirmou.",
  verifyWhatTitle: "Uma verificação pessoal",
  verifyWhatBody:
    "Ao confirmares, declaras, com base na tua própria observação, que a câmara ainda existe onde a ficha indica.",
  verifyOneTitle: "Uma por utilizador",
  verifyOneBody:
    "Cada conta pode manter uma ação da comunidade por ficha. É uma verificação, não um concurso de popularidade: uma pessoa, um sinal.",
  verifyFairTitle: "Com regras justas",
  verifyFairBody:
    "As ações da comunidade exigem uma conta verificada, as contas novas pesam menos do que as de confiança e os limites diários travam ações automatizadas ou em massa. Não podes confirmar nem marcar a tua própria ficha.",
  verifyPrivateTitle: "Sem atribuição pública",
  verifyPrivateBody:
    "As páginas públicas mostram apenas contagens agregadas e o histórico público da ficha. Quem confirmou ou assinalou uma ficha nunca é mostrado nem associado a um perfil.",
  levelEyebrow: "Níveis de confiança",
  levelTitle: "Reconhecimento, não competição.",
  levelBody:
    "Os níveis de confiança refletem quantas das tuas contribuições estão ativas no diretório. São um reconhecimento discreto de trabalho rigoroso, não uma classificação.",
  levelThresholdsTitle: "Níveis e limiares",
  levelThresholdsBody:
    "Só contam as contribuições ativas. Os limiares são 1, 5, 20 e 50; as fichas ocultas ou removidas não contam.",
  levelBadgeTitle: "Três distintivos",
  levelBadgeBody:
    "O teu perfil mostra um de três distintivos: Novo contribuidor, Contribuidor de confiança ou Contribuidor experiente. O distintivo é informativo, nunca uma posição hierárquica.",
  levelRecognitionTitle: "Não é uma tabela de classificação",
  levelRecognitionBody:
    "Os níveis são pessoais. Não existe nenhuma classificação pública nem tabela de líderes, e o nível de outras pessoas nunca é apresentado.",
  dataEyebrow: "Dados abertos e mapa de base",
  dataTitle: "Abertos onde é seguro ser aberto.",
  dataBody:
    "As fichas publicadas estão disponíveis em GeoJSON e CSV para reutilização e inspeção. O conjunto de dados público contém as fichas ativas; os pedidos privados de correção nunca são incluídos.",
  downloadGeoJson: "Descarregar GeoJSON público",
  downloadCsv: "Descarregar CSV público",
  geoJsonTitle: "Uma exportação pública reutilizável",
  geoJsonBody:
    "O GeoJSON é um formato comum de dados geográficos. Destina-se a análise cívica, investigação e ferramentas cartográficas compatíveis — não a encontrar transmissões de câmaras ou informação operacional sensível.",
  osmTitle: "O OpenStreetMap fornece o mapa de base",
  osmBody:
    "O fundo do mapa é fornecido pelos contribuidores do OpenStreetMap. É independente das fichas de câmaras deste projeto e exige sempre atribuição visível e utilização responsável.",
  localLabel: "Estado do projeto",
  localTitle: "Um projeto em desenvolvimento",
  localBody:
    "O OpenSurveillanceDB está em desenvolvimento ativo. As fichas são publicadas de imediato a partir de contas verificadas e mantidas rigorosas pela comunidade, e o projeto não afirma que os dados sejam completos, atuais ou oficiais.",
  footer: "Feito para a transparência, não para a vigilância.",
};
