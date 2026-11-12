/**
 * manifesto — PT translation. Parity-checked against the English pilot
 * bundle (../../manifesto.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../manifesto";

export const pt: Translation<typeof en> = {
  navigation: "Navegação do manifesto",
  homeAria: "Página inicial do OpenSurveillanceDB",
  map: "Mapa",
  directory: "Diretório",
  guide: "Como funciona",
  manifesto: "Manifesto",
  home: "Início",
  eyebrow: "Manifesto do projeto",
  title: "Um manifesto por um espaço público legível.",
  intro:
    "O OpenSurveillanceDB é uma base de dados cívica, aberta e sem fins comerciais sobre a infraestrutura de vigilância pública visível. Esta página expõe o propósito do projeto, os princípios que o regem, os limites que aceita e o que é — e não é — publicado.",
  exploreMap: "Explorar o mapa",
  browseDirectory: "Consultar o diretório",
  readGuide: "Ler o guia",
  founderEyebrow: "Declaração do fundador",
  founderTitle: "A transparência é uma condição do espaço público.",
  founderBody:
    "Este projeto parte de uma convicção simples: aquilo que observa o espaço público tem também de ser legível para as pessoas que nele vivem. As câmaras e os sistemas automatizados que afetam a vida coletiva não podem ser uma presença opaca. À medida que a vigilância cresce — das grandes redes privadas como a Flock Safety, nos Estados Unidos, aos debates europeus e italianos sobre reconhecimento facial e biometria —, cresce também a necessidade de um conhecimento público, verificável e partilhado. O OpenSurveillanceDB não é contra a segurança, nem pretende expor pessoas ou infraestruturas vulneráveis. É uma ferramenta sem fins comerciais para tornar visível a infraestrutura de vigilância virada para o espaço público, com limites e com responsabilidade. Publica dados sobre câmaras, não transmissões; contexto, não perfis; transparência, não rastreamento. Acredito que os dados de interesse público devem permanecer acessíveis à comunidade. É por isso que este projeto é aberto, documentado e construído em conjunto com as pessoas que vivem e usam a cidade.",
  founderSignature: "— Simone Rondina, fundador do OpenSurveillanceDB",
  missionEyebrow: "Missão",
  missionTitle: "Ajudar as pessoas a compreender os sistemas que as rodeiam.",
  missionBody:
    "O projeto mapeia a infraestrutura de câmaras visível em espaços partilhados, para que o público possa ver o que está instalado nas proximidades. Documenta apenas equipamento virado para o espaço público. Não é uma ferramenta para vigiar, rastrear ou contornar a vigilância legal.",
  missionOneTitle: "O que documentamos",
  missionOneBody:
    "Infraestrutura de câmaras visível, localização aproximada, tipo, fonte e um estado atribuído pela comunidade.",
  missionTwoTitle: "O que não recolhemos",
  missionTwoBody:
    "Transmissões de câmaras, credenciais, detalhes de habitações privadas, vulnerabilidades operacionais, rostos, matrículas ou outros dados pessoais.",
  missionThreeTitle: "O que os dados não podem provar",
  missionThreeBody:
    "A ausência de uma ficha não demonstra que uma zona esteja livre de vigilância. Mostra apenas que não há nenhuma ficha publicada nesse local de momento.",
  principlesEyebrow: "Princípios",
  principlesTitle: "Livre, aberto e seguro desde a conceção.",
  principlesIntro:
    "Cinco compromissos orientam todas as decisões deste projeto, do modelo de dados às ações da comunidade.",
  principleOneTitle: "Gratuito",
  principleOneBody:
    "Sem publicidade, sem definição de perfis, sem funcionalidades pagas. A base de dados e o software são bens públicos.",
  principleTwoTitle: "Open source",
  principleTwoBody:
    "O software pode ser inspecionado, reutilizado e melhorado pela comunidade.",
  principleThreeTitle: "Dados abertos com proveniência",
  principleThreeBody:
    "O licenciamento e a proveniência são registados para cada ficha publicada, para que o jornalismo, a investigação e o uso cívico possam confiar neles.",
  principleFourTitle: "Privacidade e segurança desde a conceção",
  principleFourBody:
    "Sem câmaras de habitações privadas, sem detalhes operacionais sensíveis, sem ligações para transmissões em direto. Os rostos e as matrículas são removidos antes da publicação.",
  principleFiveTitle: "O rigor da comunidade em primeiro lugar",
  principleFiveBody:
    "Os reportes feitos a partir de contas verificadas são publicados de imediato. A comunidade mantém o diretório rigoroso: confirma o que ainda lá está, assinala o que desapareceu e retira o que é problemático — segundo limiares automáticos e transparentes.",
  nonGoalsEyebrow: "Não objetivos",
  nonGoalsTitle: "O que deliberadamente não fazemos.",
  nonGoalsBody:
    "Os limites são tão importantes como a missão. O OpenSurveillanceDB nunca se tornará nenhuma das seguintes coisas:",
  nonGoalFeedsTitle: "Sem transmissões de câmaras",
  nonGoalFeedsBody:
    "Documentamos equipamento, não imagens. Nenhuma transmissão, em direto ou gravada, é alguma vez ligada ou apresentada.",
  nonGoalTrackingTitle: "Sem ferramentas de rastreamento",
  nonGoalTrackingBody:
    "Os dados não podem ser usados para vigiar, seguir ou definir perfis de pessoas no espaço público.",
  nonGoalBypassTitle: "Sem conselhos de evasão",
  nonGoalBypassBody:
    "O projeto não ajuda ninguém a evitar a vigilância legal e não publica vulnerabilidades operacionais.",
  nonGoalPrivateTitle: "Sem propriedade privada",
  nonGoalPrivateBody:
    "As câmaras que vigiam habitações privadas, bem como os detalhes da vida privada, estão fora do âmbito.",
  publishEyebrow: "O que publicamos",
  publishTitle: "Aberto onde é seguro ser aberto.",
  publishBody:
    "A infraestrutura virada para o espaço público entra nos resultados públicos assim que é reportada. Cada ficha é um facto sobre equipamento visível, não sobre uma pessoa, e mantém-se ativa até a comunidade a retirar.",
  publishedTitle: "Publicado",
  publishedItemOne: "Infraestrutura de câmaras visível e a sua localização aproximada",
  publishedItemTwo: "Tipo, fonte e estado atribuído pela comunidade para cada ficha",
  publishedItemThree:
    "Exportações GeoJSON e CSV das fichas públicas, com licenciamento e proveniência",
  neverPublishedTitle: "Nunca publicado",
  neverPublishedItemOne: "Transmissões de câmaras, credenciais ou ligações para imagens em direto",
  neverPublishedItemTwo: "Rostos, matrículas ou quaisquer dados pessoais",
  neverPublishedItemThree:
    "Detalhes de habitações privadas, locais sensíveis ou vulnerabilidades operacionais",
  neverPublishedItemFour:
    "Pedidos de correção privados, que nunca entram no conjunto de dados público",
  footerNote: "Criado para a transparência, não para o rastreamento.",
};
