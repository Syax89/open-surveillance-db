/**
 * rules — PT translation. Parity-checked against the English pilot
 * bundle (../../rules.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../rules";

export const pt: Translation<typeof en> = {
  navigation: "Navegação das regras",
  homeAria: "Página inicial do OpenSurveillanceDB",
  map: "Mapa",
  directory: "Diretório",
  guide: "Guia",
  home: "Início",
  eyebrow: "Regras de participação",
  title: "O que publicamos e como podes ajudar.",
  intro:
    "Estas regras explicam o que o OpenSurveillanceDB documenta e o que os contribuidores podem reportar. Abrangem a publicação, as ações da comunidade, as correções e a reutilização dos dados.",
  reportEyebrow: "O que podes reportar",
  reportTitle: "Espaço público, observado a partir do espaço público.",
  reportBody:
    "Só pode ser documentada infraestrutura de vigilância visível em espaços partilhados. Uma ficha pode ser publicada quando tem um propósito claro de transparência cívica e não contém dados pessoais desnecessários.",
  eligibleOneTitle: "Infraestrutura pública de rua",
  eligibleOneBody:
    "Uma câmara visivelmente instalada numa rua, praça, exterior de estação ou exterior de edifício público.",
  eligibleTwoTitle: "Câmaras de trânsito documentadas publicamente",
  eligibleTwoBody:
    "Uma câmara de monitorização de trânsito documentada publicamente, quando publicar a ficha é lícito e seguro.",
  eligibleThreeTitle: "Fontes públicas oficiais",
  eligibleThreeBody:
    "Uma ficha proveniente de uma fonte pública oficial, assinalada com a respetiva fonte e data de verificação.",
  neverTitle: "Nunca reportes",
  neverBody:
    "Os reportes que contenham qualquer um dos seguintes elementos nunca são mantidos no conjunto de dados público.",
  neverOneTitle: "Habitações privadas",
  neverOneBody:
    "Câmaras residenciais ou privadas, incluindo campainhas e câmaras viradas para uma habitação privada.",
  neverTwoTitle: "Pessoas e dados pessoais",
  neverTwoBody:
    "Pessoas identificáveis, matrículas de veículos ou interiores privados.",
  neverThreeTitle: "Transmissões em direto e acessos",
  neverThreeBody:
    "Vídeo em direto, URL de streams, credenciais, informações de rede ou interfaces de controlo.",
  neverFourTitle: "Detalhes sensíveis",
  neverFourBody:
    "Campo de visão detalhado ou capacidades operacionais que possam criar um risco de segurança, ou locais sensíveis onde a publicação possa não ser segura.",
  beforeSubmittingTitle: "Antes de submeter",
  beforeSubmittingBody:
    "Submeter exige uma conta de contribuidor verificada. Não carregues nem descrevas pessoas, matrículas, habitações privadas, falhas de segurança ou locais sensíveis. O teu reporte é publicado de imediato, por isso certifica-te de que é seguro torná-lo público.",
  correctionEyebrow: "Correções",
  correctionTitle: "Uma forma privada de contestar uma ficha.",
  correctionBody:
    "Qualquer contribuidor verificado pode pedir uma correção, contestar uma ficha ou reportar um dano. Os pedidos são privados, analisados por uma pessoa e nunca alteram o mapa automaticamente.",
  correctionOneTitle: "Pedir uma correção",
  correctionOneBody:
    "As fichas incorretas, desatualizadas ou duplicadas podem ser assinaladas para revisão.",
  correctionTwoTitle: "Reportar uma preocupação de privacidade ou segurança",
  correctionTwoBody:
    "Uma preocupação de privacidade oculta uma ficha de imediato, enquanto aguarda verificação da comunidade. As emergências legais seguem o mesmo percurso imediato.",
  correctionThreeTitle: "Não são necessários dados pessoais",
  correctionThreeBody:
    "Descreve apenas o mínimo necessário para identificar o problema. Não incluas dados pessoais, ligações para transmissões em direto, credenciais nem imagens.",
  dataEyebrow: "Reutilização dos dados",
  dataTitle: "Aberto onde é seguro ser aberto.",
  dataBody:
    "As fichas publicadas estão disponíveis em GeoJSON e CSV para reutilização e consulta. O conjunto de dados público contém as fichas ativas; os pedidos de correção privados nunca são incluídos.",
  downloadGeoJson: "Descarregar GeoJSON público",
  downloadCsv: "Descarregar CSV público",
  reuseOneTitle: "Licenciamento e proveniência",
  reuseOneBody:
    "Cada ficha publicada mantém a sua fonte e data de verificação, e os dados estão licenciados para reutilização aberta.",
  reuseTwoTitle: "Sem detalhes operacionais",
  reuseTwoBody:
    "As exportações destinam-se a análise cívica, investigação e ferramentas de mapeamento compatíveis — não a encontrar transmissões de câmaras ou informações operacionais sensíveis.",
  reuseThreeTitle: "Atribuição ao OpenStreetMap",
  reuseThreeBody:
    "O fundo do mapa é fornecido pelos contribuidores do OpenStreetMap e é independente das fichas de câmaras deste projeto.",
  footer: "Criado para a transparência, não para o rastreamento.",
};
