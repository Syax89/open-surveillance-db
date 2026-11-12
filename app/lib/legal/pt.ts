/**
 * Portuguese (pt-PT) legal content — translation of the English pilot
 * (app/lib/legal/en.ts).
 *
 * Web adaptation of the legal documents:
 *   - docs/TERMS_OF_USE.md          → terms
 *   - docs/legal/PRIVACY_NOTICE.md  → privacy
 *   - docs/OPEN_SOURCE.md           → licenses
 *
 * The repository copies of those documents remain the canonical source
 * of record; this file is the presentation layer for the public pages.
 * Inline markup: **bold** and [label](url) (see app/lib/legal/types.ts).
 * Pinned to the same LegalContent type as en.ts/it.ts, so missing/extra
 * keys fail `tsc` — parity per ADR 0007.
 */
import type { LegalContent } from "./types";

export const ptLegal: LegalContent = {
  privacy: {
    eyebrow: "Legal · Privacidade",
    title: "Política de privacidade",
    intro:
      "Como o OpenSurveillanceDB trata dados pessoais, o que publicamos, o que nunca recolhemos e como podes exercer os teus direitos ao abrigo do RGPD.",
    versionNote:
      "Versão 0.8 — 9 de agosto de 2026. Alinhamento com a auditoria jurídica: ressincronizada com a PRIVACY_NOTICE canónica v0.14 (docs/legal/PRIVACY_NOTICE.md continua a ser canónico). O § 5 acrescenta o subcontratante de geocodificação Nominatim (PR6); o § 7 documenta as regras de eliminação definitiva dos registos legados `pending`/`rejected` (R19/R20); § 10 secção sobre cookies; referências aos subcontratantes OIDC corrigidas para PR4/PR5; nota sobre categorias especiais reformulada para o modelo apenas de texto (provas em imagem removidas).",
    sections: [
      {
        heading: "1. Quem somos (responsável pelo tratamento)",
        blocks: [
          {
            type: "paragraph",
            text: "**Responsável pelo tratamento:** Simone Rondina (syax89) / OpenSurveillanceDB — Itália.",
          },
          {
            type: "paragraph",
            text: "**Contacto de privacidade:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — uma caixa de correio dedicada — para qualquer pergunta, pedido de titular dos dados ou comunicação. Primeira resposta em 48 horas, resposta substantiva em 14 dias.",
          },
        ],
      },
      {
        heading: "2. O que faz o serviço",
        blocks: [
          {
            type: "paragraph",
            text: "O OpenSurveillanceDB publica um mapa de interesse público da **infraestrutura de vigilância pública e visível** (por exemplo, câmaras instaladas em ruas, praças e exteriores de estações), publicada de imediato a partir de contas de contribuidores verificadas e mantida rigorosa pela comunidade através de confirmações, sinalizações e limiares automáticos (ADR 0021). É um projeto de transparência cívica, não uma plataforma comercial: sem publicidade comportamental, sem rastreamento, sem venda de dados.",
          },
        ],
      },
      {
        heading: "3. Que dados pessoais tratamos",
        blocks: [
          {
            type: "paragraph",
            text: "A tabela abaixo descreve os dados pessoais tratados pelo Serviço, a respetiva origem, finalidade e fundamento jurídico.",
          },
          {
            type: "table",
            caption: "Dados pessoais tratados pelo Serviço",
            headers: ["Dados", "Origem", "Finalidade", "Fundamento jurídico"],
            rows: [
              [
                "Conteúdo do reporte: localização, descrição, fabricante / data de observação (opcionais), notas privadas",
                "Autor do reporte (titular dos dados)",
                "Construir a ficha pública; ações de rigor da comunidade",
                "Art. 6.º, n.º 1, alínea f), do RGPD",
              ],
              [
                "ID interno pseudonimizado do contribuidor + data e hora de submissão",
                "Autor do reporte",
                "Prevenção de abusos, proveniência",
                "Art. 6.º, n.º 1, alínea f), do RGPD",
              ],
              [
                "Conta de contribuidor (email, nome de apresentação opcional, hash da palavra-passe)",
                "Contribuidor (registo voluntário)",
                "Início de sessão, atribuição das submissões, prevenção de abusos",
                "Art. 6.º, n.º 1, alínea f), do RGPD — minimização: identificador opcional e pseudonimizado, palavra-passe com hash PBKDF2-SHA256, nunca exposta nas respostas da API",
              ],
              [
                "Registos de sessão (token com hash, token CSRF, datas e horas)",
                "O projeto (início de sessão)",
                "Manter o contribuidor com sessão iniciada; proteção CSRF",
                "Art. 6.º, n.º 1, alínea f), do RGPD; token guardado apenas como SHA-256, expira ao fim de 30 dias ou ao terminar sessão",
              ],
              [
                "Pedido de correção / remoção (dados de contacto fornecidos pelo requerente, por exemplo, email)",
                "Requerente",
                "Exercício de direitos, comunicações de danos",
                "Art. 6.º, n.º 1, alínea c), do RGPD (artigos 15.º a 22.º) e 6.º, n.º 1, alínea f)",
              ],
              [
                "Ações da comunidade sobre fichas (tipo de ação `like` / `confirm` / `gone` / `problem` / `privacy`, instantâneo do peso, data e hora)",
                "Contribuidor (conta verificada)",
                "Rigor do conjunto de dados — moderação conduzida pela comunidade",
                "Art. 6.º, n.º 1, alínea f), do RGPD; uma ação por utilizador por ficha (`UNIQUE(camera_id, contributor_id)`), instantâneo do peso no momento da ação, **apenas agregados nos dados públicos** — nunca atribuídos a qualquer perfil (ADR 0021 §3/§13)",
              ],
              [
                "Atributos de identidade OIDC (fornecedor, id do titular, nome de apresentação, indicador de verificação — nunca o email)",
                "GitHub / Google (fornecedor de identidade — apenas se escolheres esse método)",
                "Início de sessão opcional do contribuidor; associação da conta ao contribuidor",
                "Art. 6.º, n.º 1, alínea f), do RGPD; nenhum email importado; o fornecedor observa o início de sessão e o IP (§ 5/§ 6)",
              ],
              [
                "Entradas de auditoria da moderação (decisão, código do motivo, data e hora, pseudónimo do revisor)",
                "O projeto",
                "Responsabilização; recursos históricos encerrados por migração (ADR 0021 §7)",
                "Art. 6.º, n.º 1, alínea f), do RGPD; nunca públicas (apenas relatórios de transparência agregados)",
              ],
              [
                "Fichas publicadas",
                "Reportes publicados / fontes públicas oficiais",
                "O conjunto de dados público (ODbL 1.0)",
                "Art. 6.º, n.º 1, alíneas f) / e), do RGPD",
              ],
            ],
          },
          {
            type: "note",
            text: "**Fichas provenientes de fontes públicas oficiais:** quando uma ficha é republicada a partir de uma fonte pública oficial, os dados não foram recolhidos junto do titular dos dados. Categorias de fontes: registos públicos e portais de transparência das administrações públicas (por exemplo, em Itália, os conjuntos de dados do D.Lgs. 33/2013), documentos publicados por autoridades públicas e outras fontes oficiais de acesso público. Essas fichas são verificadas uma a uma ao abrigo do regime jurídico próprio da fonte.",
          },
          {
            type: "note",
            text: "**Histórico público de eventos por ficha (ADR 0021 § 7):** cada transição da comunidade (publicada, confirmada, marcada como útil, assinalada como desaparecida, oculta, removida, reposta) fica registada num **histórico público do ciclo de vida sem qualquer atribuição** — sem ids de contribuidores, emails ou dados derivados do IP nas linhas públicas. Trata-se de um controlo de transparência do responsável pelo tratamento, não de uma nova recolha de dados pessoais (apenas agregados).",
          },
          {
            type: "note",
            text: "**Fornecimento voluntário:** fornecer dados para um reporte é **voluntário** — não constitui uma obrigação legal nem contratual. A única consequência de não os fornecer é que o reporte não pode ser processado. Não existe obrigação de fornecer dados nem qualquer penalização por recusar.",
          },
          {
            type: "note",
            text: "**Categorias especiais (art. 9.º do RGPD):** nenhuma é recolhida intencionalmente. As fichas são **apenas metadados de texto** — a funcionalidade de provas em imagem foi removida (2026-08-08, tabela `photos` eliminada pela migração 0043), pelo que não existe qualquer carregamento de ficheiros multimédia. O texto de um reporte que contenha dados pessoais acidentais (por exemplo, um nome ou uma matrícula na descrição) viola as regras de conteúdo e é tratado pela moderação da comunidade e pelas correções.",
          },
          {
            type: "note",
            text: "**Crianças:** o serviço destina-se a adultos. Em Itália, submeter um reporte exige a idade de consentimento para serviços da sociedade da informação (14 anos, art. 2-quinquies do D.Lgs. 196/2003); outras jurisdições aplicam os seus próprios limites de idade.",
          },
        ],
      },
      {
        heading: "4. O que NÃO recolhemos nem publicamos",
        blocks: [
          {
            type: "list",
            items: [
              "**Nenhum vídeo, transmissão em direto, credencial, informação de rede ou interface de controlo** — o projeto documenta a *existência* de infraestrutura de vigilância visível, nunca o que ela produz nem o acesso a ela.",
              "**Nenhuma câmara de habitações privadas** nem câmaras apontadas para interiores privados.",
              "**Nenhum nome de pessoas, rosto, matrícula de veículo ou detalhe operacional preciso.**",
              "**Nenhuma coordenada com precisão superior ao nível de zona:** as localizações publicadas são arredondadas a **~4 casas decimais (~10 m)**; a localização exata permanece na base de dados e nunca é publicada.",
              "**Sem publicidade comportamental, sem rastreamento, sem venda de dados**, sem bibliotecas de análise estatística.",
              "Os reportes são publicados de imediato a partir de contas verificadas e fazem parte do conjunto de dados público desde o momento em que são submetidos. O conteúdo que viole as regras é retirado pela comunidade ou por uma emergência legal, e o conteúdo retirado nunca volta a ser publicado.",
            ],
          },
        ],
      },
      {
        heading: "5. Destinatários e transferências",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare, Inc.** — alojamento e base de dados (Workers + D1). Subcontratante (art. 28.º) ao abrigo do Cloudflare Data Processing Addendum (DPA v6.3, junho de 2025), que incorpora as **Cláusulas Contratuais-Tipo da UE (2021/914)**; a Cloudflare está certificada ao abrigo do **Quadro de Privacidade de Dados UE-EUA**. O D1 está configurado com residência na UE.",
              "**OpenStreetMap Foundation (Nominatim — nominatim.openstreetmap.org, subcontratante PR6).** Geocodificação para o fluxo de reporte e as páginas das fichas: pesquisa direta por nome de local (`GET /api/geocode`, até 5 sugestões) e inversa coordenadas→morada (`GET /api/geocode/reverse`, pré-preenchimento do formulário de reporte). Só é enviada a própria consulta — cadeias de texto livre de local/morada e coordenadas arredondadas a ~4 casas decimais (~11 m); a resposta (morada apresentada) é guardada na cache do D1 (`geocode_reverse_cache`). **Nenhum dado pessoal, nenhum dado de conta, nenhuma definição de perfis; os dados de quem faz o pedido nunca são enviados nem registados.** A utilização respeita a política do Nominatim: máximo de **1 pedido/s**, User-Agent identificativo, cache em primeiro lugar.",
              "**GitHub, Inc. / Google LLC (fornecedores de identidade OIDC — opcionais, apenas se escolheres esse método).** São **responsáveis pelo tratamento independentes dos seus próprios serviços de autenticação** (as respetivas políticas de privacidade aplicam-se no início de sessão); nenhum dado do OpenSurveillanceDB lhes é enviado — recebemos apenas os atributos de identidade indicados no § 3 (fornecedor, id do titular, nome de apresentação, indicador de verificação; nunca o email). O fornecedor observa o início de sessão e o teu IP. Nunca publicados, nunca registados.",
              "**A própria publicação:** as fichas publicadas passam a fazer parte de um conjunto de dados público licenciado ao abrigo da ODbL 1.0 e podem ser descarregadas ou exportadas (JSON/CSV/GeoJSON). As cópias já descarregadas não podem ser recuperadas; as fichas retiradas são excluídas das exportações futuras.",
              "Nenhum outro destinatário; sem publicidade comportamental; sem bibliotecas de análise estatística.",
            ],
          },
        ],
      },
      {
        heading: "6. Transferências internacionais de dados",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare:** transferências abrangidas pelo DPA da Cloudflare, que incorpora as **Cláusulas Contratuais-Tipo da UE (2021/914)**; medidas suplementares avaliadas para o tratamento nos EUA (cifragem em trânsito, residência na UE para o D1).",
              "**Início de sessão OIDC (GitHub/Google, se escolheres esse método):** os atributos de identidade (fornecedor, id do titular, nome de apresentação, indicador de verificação) são trocados com os serviços do fornecedor no início de sessão; o fluxo rege-se pelos termos e pela política de privacidade do fornecedor.",
            ],
          },
        ],
      },
      {
        heading: "7. Conservação",
        blocks: [
          {
            type: "paragraph",
            text: "Os reportes são publicados de imediato e permanecem públicos enquanto a comunidade os continuar a confirmar; as fichas retiradas pela comunidade ou por uma emergência legal são excluídas dos resultados públicos e seguem o calendário de conservação do repositório (docs/legal/RETENTION_SCHEDULE.md). Pedidos de correção e entradas de auditoria: 2 anos. Registos operacionais: até 12 meses (agregados). Cópias de segurança: rodadas pelo fornecedor (até 30 dias de recuperação para um ponto no tempo).",
          },
          {
            type: "paragraph",
            text: "As regras detalhadas constam do calendário de conservação do repositório (docs/legal/RETENTION_SCHEDULE.md), incluindo: dados da comunidade (R14) — as ações da comunidade acompanham a conta (ativa → apagamento; as ações sobre outras fichas são eliminadas juntamente com o contribuidor, ADR 0021 § 13, e o histórico público do ciclo de vida mantém apenas agregados); dados dos métodos de autenticação (R15, ADR 0020) — tokens de verificação de email 24 horas, tokens de redefinição 3 horas (de utilização única, eliminados após a utilização); chaves de acesso (passkeys) e códigos de recuperação enquanto a conta estiver ativa, eliminados definitivamente no apagamento da conta — nada subsiste que associe a conta a um fornecedor ou a um dispositivo; contadores de inícios de sessão falhados (R16), registo do limite de registos por IP (R17) e registo de emails transacionais (R18) limpos pela tarefa periódica de conservação; fichas de demonstração (R12) purgadas pela tarefa periódica de conservação fora do ambiente de desenvolvimento.",
          },
          {
            type: "paragraph",
            text: "As regras de eliminação e expiração são aplicadas automaticamente pela limpeza diária de conservação (agendada em `worker/index.ts`, diariamente às 03:00 UTC — RETENTION_SCHEDULE.md § 3): a tarefa periódica elimina as linhas expiradas (R12/R16/R17/R18), elimina definitivamente as submissões legadas `pending` 90 dias após a submissão (**R19**) e as fichas legadas `rejected` 30 dias após a decisão (**R20**, ambas ignoradas enquanto houver um recurso pendente ou uma retenção legal ativa), arquiva as entradas de auditoria ao fim de 2 anos (R4/R5/R9) e nunca altera o estado do ciclo de vida das fichas publicadas (modelo comunitário, ADR 0021 § 2.2).",
          },
        ],
      },
      {
        heading: "8. Os teus direitos (artigos 15.º a 22.º do RGPD)",
        blocks: [
          {
            type: "paragraph",
            text: "Podes pedir, gratuitamente:",
          },
          {
            type: "list",
            items: [
              "**Acesso** (art. 15.º) — confirmação e cópia dos teus dados.",
              "**Retificação** (art. 16.º) — correção de dados inexatos.",
              "**Apagamento** (art. 17.º) — eliminação, sem prejuízo das exceções previstas no art. 17.º, n.º 3, e do calendário de conservação.",
              "**Limitação** (art. 18.º) e **oposição** (art. 21.º).",
              "**Portabilidade** (art. 20.º) — quando tecnicamente aplicável.",
              "Não são tomadas decisões automatizadas, incluindo a definição de perfis (art. 22.º).",
            ],
          },
          {
            type: "paragraph",
            text: "**Como os exercer:** escreve para [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Para proteger os titulares dos dados, podemos pedir-te que confirmes a tua identidade, de forma proporcional ao pedido.",
          },
          {
            type: "paragraph",
            text: "**Prazo:** respondemos no prazo de **1 mês** (art. 12.º, n.º 3); este prazo pode ser prorrogado por até mais 2 meses no caso de pedidos complexos, mediante aviso. Se recusarmos, explicamos porquê e lembramos-te do teu direito de apresentar reclamação.",
          },
          {
            type: "paragraph",
            text: "**Reclamações:** podes apresentar reclamação junto da autoridade de controlo competente — em Itália, o [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Contacto e acompanhamento",
        blocks: [
          {
            type: "paragraph",
            text: "Contacto de privacidade: [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — primeira resposta em 48 horas, resposta substantiva em 14 dias.",
          },
          {
            type: "paragraph",
            text: "Esta política é revista pelo menos uma vez por ano, ou sempre que ocorra uma alteração relevante; o histórico de versões é mantido no repositório.",
          },
        ],
      },
      {
        heading: "10. Cookies",
        blocks: [
          {
            type: "paragraph",
            text: "O OpenSurveillanceDB utiliza um único cookie funcional:",
          },
          {
            type: "paragraph",
            text: "**opensurveillancedb-locale** — memoriza o idioma que selecionaste neste dispositivo/navegador (italiano ou inglês). É definido **apenas quando mudas de idioma**; nunca é usado para te rastrear.",
          },
          {
            type: "list",
            items: [
              "**Tipo:** funcional — estritamente necessário para fornecer a preferência de idioma que pediste expressamente",
              "**Finalidade:** guardar o idioma da tua interface",
              "**Duração:** 1 ano (`max-age=31536000`)",
              "**Conteúdo:** nenhum dado teu — um simples código de idioma (`it` / `en`)",
              "**Propriedades:** `SameSite=Lax`, `path=/`, não legível entre sites (sem superfície de rastreamento ou de sessão)",
              "**Fundamento jurídico:** art. 122 do D.Lgs. 196/2003 (que transpõe o art. 5.º, n.º 3, da Diretiva 2002/58/CE, com a redação dada pela Diretiva 2009/136/CE) — o consentimento **não** é exigido para cookies estritamente necessários à prestação de um serviço expressamente pedido pelo utilizador, pelo que não é apresentado nenhum aviso de consentimento.",
              "**Gestão:** podes eliminá-lo a qualquer momento nas definições do teu navegador; sem ele, a interface assume por defeito o idioma piloto (inglês) neste dispositivo.",
            ],
          },
          {
            type: "paragraph",
            text: "A mesma preferência é replicada no `localStorage` do teu navegador para sincronização entre separadores. O `localStorage` é uma tecnologia de armazenamento do navegador, não um cookie, e nunca é transmitido aos nossos servidores.",
          },
          {
            type: "note",
            text: "**Compromisso:** se o redesenho ou qualquer funcionalidade futura introduzir cookies que não sejam estritamente necessários (análise estatística, publicidade, definição de perfis), pediremos o teu consentimento expresso através de um aviso **antes** de os instalar, nos termos do art. 122 do D.Lgs. 196/2003.",
          },
        ],
      },
    ],
  },

  terms: {
    eyebrow: "Legal · Termos de utilização",
    title: "Termos de utilização",
    intro:
      "Estes termos regem a utilização do OpenSurveillanceDB, a base de dados aberta e mantida pela comunidade sobre a infraestrutura de vigilância pública visível. Aplicam-se à aplicação web, à API pública, às exportações de dados e aos serviços relacionados (\"o Serviço\").",
    versionNote:
      "Versão 0.5 — 8 de agosto de 2026. Alinhamento com o estado atual (pronto para modelo): ressincronizada com os TERMS_OF_USE canónicos v0.8 (docs/TERMS_OF_USE.md continua a ser canónico). § 3.7 divulgação sobre autenticação (verificação de email para acesso de escrita, chaves de acesso, OIDC — ADR 0020, controlado no servidor); § 5 publicação imediata e ações da comunidade; § 6 correções privadas e o poder de emergência legal; provas em imagem removidas (2026-08-08).",
    sections: [
      {
        heading: "1. Quem somos",
        blocks: [
          {
            type: "paragraph",
            text: "**Responsável pelo tratamento / operador:** Simone Rondina (syax89) / OpenSurveillanceDB — Itália.",
          },
          {
            type: "paragraph",
            text: "**Contacto:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — uma caixa de correio dedicada — para qualquer pergunta, correção, remoção ou pedido de privacidade. Prazos de resposta: primeira resposta em 48 horas, decisão substantiva em 14 dias.",
          },
        ],
      },
      {
        heading: "2. O que estes termos abrangem",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "O OpenSurveillanceDB é um **projeto de transparência cívica sem fins comerciais e governado pela comunidade** que documenta a **infraestrutura de vigilância pública visível** (por exemplo, câmaras instaladas em ruas, praças e exteriores de estações). A sua utilização é gratuita: sem publicidade, sem definição de perfis comportamentais, sem venda de dados.",
              "Ao utilizar o Serviço, aceitas estes termos. Se **submeteres um reporte**, aceitas adicionalmente as obrigações de submissão da secção 5.",
              "O Serviço não disponibiliza transmissões de vídeo, ferramentas de rastreamento, acesso a câmaras privadas nem conselhos para evitar a vigilância legal.",
            ],
          },
        ],
      },
      {
        heading: "3. Utilização permitida do Serviço",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Consulta:** percorrer o mapa, o diretório de fichas e as páginas individuais das fichas; pesquisar e ler o conjunto de dados público.",
              "**Exportações:** descarregar dados públicos através das exportações JSON/CSV/GeoJSON e da API pública, e reutilizá-los, nos termos da licença ODbL 1.0 (secção 7) e dos limites contra abusos da secção 4.",
              "**Reportes:** submeter observações de infraestrutura de vigilância pública visível. Um reporte feito a partir de uma conta verificada é **publicado de imediato** e faz parte do conjunto de dados público desde a submissão (secção 5).",
              "**Finalidades lícitas:** os dados podem ser usados para investigação, jornalismo, intervenção cívica e qualquer finalidade compatível com estes termos e com a licença ODbL 1.0. Consultar os dados públicos nunca exige uma conta. Submeter um reporte ou uma correção exige uma conta de contribuidor verificada (secção 3.5; ADR 0020), e cada submissão é-lhe atribuída através de um **ID interno pseudonimizado** — nunca é exigido o nome real.",
              "**Métodos de autenticação (vários métodos, ADR 0020).** As contas de contribuidor suportam **três métodos**, à tua escolha: **(a) email + palavra-passe** — o método de base, com **verificação de email obrigatória para acesso de escrita** (ligação de utilização única, 24 h; até verificares, a tua sessão é apenas de leitura); **(b) chaves de acesso (passkeys, WebAuthn)** — opcionais, sem palavra-passe; **(c) OIDC através do GitHub ou do Google** — opcional, por adesão. As regras:",
            ],
          },
          {
            type: "list",
            items: [
              "**Verificação de email.** Após o registo, tens de verificar o endereço de email antes de poderes submeter, editar ou verificar fichas; até lá, a tua sessão é apenas de leitura. Os emails de verificação e de redefinição da palavra-passe são enviados através do Cloudflare Email Routing, sem conteúdo de rastreamento. Um endereço de email = uma conta; mantém-no acessível caso percas a palavra-passe.",
              "**Chaves de acesso.** Se registares uma chave de acesso, o site guarda apenas material de chave pública; a chave privada permanece no teu dispositivo. **Nota sobre fornecedores:** as chaves de acesso *sincronizadas* são guardadas na nuvem do fornecedor do sistema operativo (Apple/Google/Microsoft), por tua escolha — o fornecedor fica a saber que tens uma conta aqui, o site não partilha nada com ele e és tu que controlas a sincronização. Guarda num local seguro os 10 códigos de recuperação emitidos no registo; sem eles, a perda de um dispositivo pode significar perder o acesso pelo método da chave de acesso (o percurso email + palavra-passe mantém-se).",
              "**OIDC através do GitHub/Google — divulgação sobre rastreamento.** Iniciar sessão com o GitHub ou o Google significa que **o GitHub ou o Google observa que inicias sessão neste Serviço, bem como o teu endereço IP**, em cada início de sessão; os termos e a política de privacidade do próprio fornecedor aplicam-se no início de sessão. **Não importamos o teu email** do fornecedor (apenas o id do titular, o nome de apresentação e o indicador de verificação) e nunca fundimos contas automaticamente com base na coincidência do email — um conflito exige uma fusão manual e verificada. Este método é **opcional, por adesão, e divulgado** (matriz de riscos na página de início de sessão); os botões só são apresentados quando o operador ativou o fornecedor (credenciais configuradas nesta implementação).",
              "Podes adicionar, alterar ou remover métodos na página da tua conta a qualquer momento; eliminar a tua conta elimina os dados de todos os métodos (política de privacidade § 7 R15, § 8).",
            ],
          },
        ],
      },
      {
        heading: "4. O que não podes fazer",
        blocks: [
          {
            type: "paragraph",
            text: "**Conteúdo proibido.** As exclusões das regras de publicação aplicam-se a tudo o que envias, incluindo reportes e notas. Em particular, não submetas:",
          },
          {
            type: "list",
            items: [
              "câmaras residenciais ou privadas, incluindo campainhas e câmaras viradas para uma habitação privada;",
              "vídeo em direto, URL de streams, credenciais, informações de rede ou interfaces de controlo;",
              "campo de visão detalhado ou capacidades operacionais que possam criar um risco de segurança;",
              "instalações ou locais sensíveis onde a publicação possa aumentar significativamente o risco;",
              "alegações não verificáveis sobre pessoas ou organizações;",
              "conteúdo que não tenhas o direito de partilhar.",
            ],
          },
          {
            type: "paragraph",
            text: "**Nenhum dado pessoal desnecessário.** Os reportes e as notas não podem conter dados pessoais que não sirvam a ficha pública (minimização dos dados).",
          },
          {
            type: "paragraph",
            text: "**Nenhum abuso.** Não excedas os limites de pedidos aplicáveis, não faças recolha automatizada (scraping) do Serviço para além de uma utilização pessoal razoável, não tentes aceder a fichas não públicas (fichas retiradas, pedidos de correção) e não contornes os controlos de acesso nem uses o Serviço para assediar ou facilitar danos.",
          },
          {
            type: "paragraph",
            text: "**Nenhuma revenda comercial do próprio Serviço.** A reutilização dos *dados* ao abrigo da ODbL 1.0 (incluindo a reutilização comercial) continua a ser permitida; esta cláusula diz respeito à revenda do Serviço enquanto produto.",
          },
        ],
      },
      {
        heading: "5. Reportes e publicação",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Publicação imediata.** Um reporte de um contribuidor verificado é publicado de imediato: entra no conjunto de dados público assim que é submetido. Não há fila de revisão nem espera. A comunidade mantém o diretório rigoroso: as fichas são confirmadas, assinaladas como já não presentes, marcadas como úteis ou retiradas através de limiares automáticos (ADR 0021). Uma ficha pode ser ocultada ou removida a qualquer momento por sinais suficientes da comunidade ou por uma decisão de emergência legal; as fichas retiradas continuam acessíveis por ligação direta com um aviso e um histórico público de eventos, e podem ser repostas com confirmações suficientes.",
              "**O que manténs e o que concedes.** Manténs quaisquer direitos que tenhas sobre o conteúdo que submetes. Ao submeter, concedes ao projeto uma licença não exclusiva, mundial e isenta de royalties para guardar, rever e publicar o reporte como parte da base de dados aberta, disponibilizada ao abrigo da **ODbL 1.0**, com atribuição aos contribuidores nos termos do aviso ODbL. A publicação ocorre no momento da submissão, não após uma etapa de aprovação.",
              "**As tuas garantias.** Ao submeter, confirmas que: o conteúdo é exato tanto quanto é do teu conhecimento; tens o direito de o partilhar; cumpre a secção 4; e tens a idade mínima para utilizar o Serviço na tua jurisdição (em Itália, 14 anos).",
              "**Rigor da comunidade.** As fichas republicadas a partir de fontes públicas oficiais seguem o seu próprio regime jurídico, verificado ficha a ficha; os reportes da comunidade são mantidos rigorosos pelas confirmações e sinalizações da comunidade, segundo os limiares automáticos, e não por comparação com registos oficiais.",
            ],
          },
        ],
      },
      {
        heading: "6. Ações da comunidade, correções, emergências legais",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Ações da comunidade.** Qualquer conta verificada pode marcar uma ficha como útil, confirmar que ainda está presente, assinalá-la como já não presente ou levantar um problema ou uma preocupação de privacidade. Uma conta, uma ação ativa por ficha. Os limiares automáticos — incluindo um limiar de privacidade deliberadamente baixo — decidem quando uma ficha é ocultada ou removida; cada transição fica registada no histórico público da ficha, sem atribuição a qualquer perfil.",
              "**Correções.** Qualquer pessoa pode pedir uma correção ou remoção através do formulário privado de correção (página inicial, secção \"Reportar um problema / correção\") ou de [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Os pedidos são privados, analisados por uma pessoa e nunca alteram o mapa automaticamente. Prazos de resposta: primeira resposta em **48 horas**, resposta substantiva em **14 dias**; as ocultações por emergência legal são imediatas.",
              "**Emergências legais.** O único poder de escrita humano que resta é a ocultação ou remoção por emergência legal pelo administrador, usada quando a lei o exige e revista a posteriori. Os administradores não podem repor nem desocultar unilateralmente: o consenso da comunidade previsto na secção 5 é a única via de reversão.",
              "Os direitos dos titulares dos dados (acesso, retificação, apagamento, limitação, oposição, portabilidade) estão descritos na [política de privacidade](/privacy) e são exercidos através do mesmo contacto.",
            ],
          },
        ],
      },
      {
        heading: "7. Licenças",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Dados:** a base de dados pública e as respetivas exportações estão licenciadas ao abrigo da **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** — a reutilização é permitida, incluindo para fins comerciais, desde que atribuas a base de dados e, se criares uma base de dados derivada, a partilhes ao abrigo da ODbL 1.0. As exportações incluem o aviso ODbL. As fichas ilustrativas de demonstração fazem parte da base de dados licenciada.",
              "**Software:** o código-fonte da aplicação está licenciado ao abrigo da **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)**.",
              "**Documentação:** a documentação do projeto é proposta ao abrigo da [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).",
              "**OpenStreetMap:** os dados do fundo do mapa são utilizados nos termos OSM/ODbL; aplicam-se os requisitos de atribuição do OSM.",
            ],
          },
        ],
      },
      {
        heading: "8. Exoneração quanto ao rigor",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "O OpenSurveillanceDB é um **conjunto de dados cívico, mantido pela comunidade — não é um registo oficial nem uma declaração de facto jurídico.** As fichas podem estar incompletas, desatualizadas ou incorretas apesar da manutenção pela comunidade; a publicação é imediata, não conservadora.",
              "Não confies no conjunto de dados para decisões oficiais ou críticas para a segurança. Verifica-o junto das fontes oficiais (por exemplo, a administração pública competente) antes de agir com base nele. O Serviço fornece informação apenas sobre infraestrutura visível — não é um diretório de todas as câmaras, e a ausência de uma ficha não prova nada.",
              "As fichas provenientes de fontes oficiais estão assinaladas com a respetiva fonte e data de verificação; as fichas da comunidade não oferecem essa garantia.",
              "As coordenadas publicadas são arredondadas a **~4 casas decimais (~10 m)** — precisão ao nível de zona. A localização exata nunca é publicada e permanece na base de dados.",
            ],
          },
        ],
      },
      {
        heading: "9. Privacidade",
        blocks: [
          {
            type: "paragraph",
            text: "A tua utilização do Serviço rege-se pela [política de privacidade](/privacy). Pontos essenciais: sem rastreamento, sem publicidade comportamental; os reportes são públicos assim que são publicados e os pedidos de correção privados permanecem privados; os teus direitos ao abrigo do RGPD podem ser exercidos através de [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) nos prazos legais (art. 12.º, n.º 3, do RGPD).",
          },
        ],
      },
      {
        heading: "10. Disponibilidade e limitação de responsabilidade",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "O Serviço é fornecido **\"tal como está\" e \"conforme disponível\"**, sem garantias de exatidão, completude, disponibilidade ou adequação a uma finalidade específica.",
              "Na máxima medida permitida por lei, o projeto e os seus contribuidores **não são responsáveis** por quaisquer danos — incluindo perdas indiretas, acidentais ou consequenciais — decorrentes da utilização do Serviço ou dos seus dados, ou da confiança neles depositada. Em particular, o projeto não é responsável por decisões tomadas com base no conjunto de dados.",
              "Nada nestes termos exclui ou limita a responsabilidade que não possa ser excluída ou limitada por lei (por exemplo, fraude, morte ou lesões corporais causadas por negligência, direitos imperativos de proteção dos consumidores).",
              "O Serviço não se destina a utilização em situações de emergência ou críticas para a segurança; não substitui os canais de informação oficiais.",
            ],
          },
        ],
      },
      {
        heading: "11. Suspensão e remoção",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Podemos suspender ou limitar o acesso, ou remover conteúdos, quando necessário para fazer cumprir estes termos, para proteger os utilizadores ou os titulares dos dados, ou ao abrigo das regras de publicação — procurando notificar a pessoa afetada sempre que tal seja proporcionado e possível.",
              "Os contribuidores podem pedir a eliminação dos seus reportes através de [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org); as fichas publicadas permanecem públicas enquanto a comunidade as continuar a confirmar e seguem as vias de correção e retirada da secção 6.",
            ],
          },
        ],
      },
      {
        heading: "12. Lei aplicável e foro competente",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Estes termos regem-se pelo **direito da UE e, quando aplicável, pelo direito italiano** — em particular o RGPD e o D.Lgs. 196/2003 (Codice Privacy, com a redação dada pelo D.Lgs. 101/2018).",
              "**Litígios:** são competentes os tribunais do local onde o responsável pelo tratamento está estabelecido (Itália), **sem prejuízo** do direito dos consumidores residentes na UE de intentarem ações nos tribunais do seu próprio país de residência e da proteção conferida pelas disposições nacionais imperativas desse país.",
              "**Reclamações:** podes apresentar reclamação junto da autoridade de controlo competente — em Itália, o [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
            ],
          },
        ],
      },
      {
        heading: "13. Alterações a estes termos",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Estes termos têm controlo de versões e estão guardados no repositório. As **alterações substanciais** (finalidade, licenciamento, publicação de dados, governação) exigem uma proposta pública documentada e um período razoável para comentários.",
              "As alterações não substanciais produzem efeitos com a sua publicação, acompanhada de um aviso. A utilização continuada do Serviço após a data de entrada em vigor constitui aceitação; quando a lei exigir consentimento, este será obtido separadamente.",
            ],
          },
        ],
      },
      {
        heading: "14. Contacto",
        blocks: [
          {
            type: "list",
            items: [
              "**Privacidade, correções, direitos:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) (caixa de correio dedicada).",
              "As emergências legais e os reportes de abuso usam o mesmo canal (ocultação imediata).",
            ],
          },
        ],
      },
    ],
  },

  licenses: {
    eyebrow: "Legal · Licenças",
    title: "Licenças",
    intro:
      "Como estão licenciados o software, a documentação e os dados do OpenSurveillanceDB, e o que isso significa para a reutilização.",
    versionNote:
      "Atualizado a 31 de julho de 2026 (decisão sobre a licença dos dados — ADR 0008) e a 5 de agosto de 2026 (conjuntos de dados públicos importados). A cópia do repositório (docs/OPEN_SOURCE.md) continua a ser canónica.",
    sections: [
      {
        heading: "1. Software",
        blocks: [
          {
            type: "paragraph",
            text: "O código-fonte da aplicação está licenciado como **AGPL-3.0-or-later**. Isto garante que as versões modificadas disponibilizadas como serviço de rede continuam acessíveis à comunidade. Consulta o ficheiro [LICENSE](https://github.com/Syax89/open-surveillance-db/blob/main/LICENSE).",
          },
        ],
      },
      {
        heading: "2. Documentação",
        blocks: [
          {
            type: "paragraph",
            text: "Salvo indicação em contrário num documento, a documentação do projeto é proposta ao abrigo da [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Os contribuidores mantêm o crédito pelas suas contribuições através do histórico normal do repositório.",
          },
        ],
      },
      {
        heading: "3. Base de dados e exportações",
        blocks: [
          {
            type: "paragraph",
            text: "A base de dados pública e todos os formatos de exportação estão licenciados ao abrigo da **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)**, com avisos claros de atribuição e de partilha nos mesmos termos (decisão de 31 de julho de 2026, [ADR 0008](https://github.com/Syax89/open-surveillance-db/blob/main/docs/decisions/0008-data-licence-precision-retention-contact.md)). A reutilização é permitida, incluindo para fins comerciais, desde que atribuas a base de dados e, se criares uma base de dados derivada, a partilhes ao abrigo da ODbL 1.0.",
          },
          {
            type: "note",
            text: "As fontes importadas mantêm a sua própria licença e atribuição; a licença ODbL aplica-se à compilação própria do projeto (ver secção 6).",
          },
        ],
      },
      {
        heading: "4. Dados do OpenStreetMap",
        blocks: [
          {
            type: "paragraph",
            text: "Os dados do OpenStreetMap estão disponíveis ao abrigo da [Open Database License](https://www.openstreetmap.org/copyright). Utilizar um fundo de mapa OSM não torna automaticamente cada ficha do projeto uma contribuição para o OSM. Se forem importados dados do OSM, derivados deles ou combinados numa base de dados derivada, o projeto tem de documentar essa relação, fornecer a atribuição exigida e cumprir as obrigações da ODbL.",
          },
        ],
      },
      {
        heading: "5. Compromisso dos contribuidores",
        blocks: [
          {
            type: "paragraph",
            text: "Os contribuidores só podem submeter material que tenham o direito de partilhar. Concedem ao projeto os direitos necessários para publicar o código, a documentação e os dados aceites ao abrigo da licença do projeto aplicável. ",
          },
        ],
      },
      {
        heading: "6. Conjuntos de dados públicos importados",
        blocks: [
          {
            type: "paragraph",
            text: "O projeto pode integrar conjuntos de dados públicos disponibilizados por administrações públicas e projetos de dados abertos (por exemplo, inventários municipais de câmaras ou elementos de vigilância do OpenStreetMap). Cada fonte integrada mantém a sua própria licença e atribuição: a licença da base de dados acima aplica-se à compilação própria do projeto e nunca substitui a licença de uma fonte individual. A página [Fontes de dados](/fonti) apresenta cada conjunto de dados importado com a respetiva fonte, licença, data de importação, número de fichas e o texto de atribuição exigido.",
          },
          {
            type: "note",
            text: "As fichas importadas de uma fonte estão assinaladas com a sua proveniência na página da ficha. Estão sujeitas à mesma verificação pela comunidade que qualquer outra ficha e nunca estão isentas de revisão.",
          },
        ],
      },
    ],
  },

  accessibility: {
    eyebrow: "Informação · Acessibilidade",
    title: "Declaração de acessibilidade",
    intro:
      "O OpenSurveillanceDB é uma base de dados cívica de interesse público. Esta declaração descreve o nosso compromisso com a acessibilidade, o estado atual de conformidade e a forma como podes comunicar uma barreira.",
    versionNote:
      "Versão 0.2 — 8 de agosto de 2026. Em vigor (projeto pessoal open source). A cópia do repositório (docs/ACCESSIBILITY_STATEMENT.md) continua a ser canónica.",
    sections: [
      {
        heading: "1. Compromisso",
        blocks: [
          {
            type: "paragraph",
            text: "Os percursos essenciais — consultar, pesquisar, submeter e corrigir/remover — têm de ser utilizáveis com teclado, com tecnologias de apoio e em ecrãs pequenos, no idioma piloto e em inglês. O objetivo do produto é a conformidade com as **WCAG 2.2 AA** para o site público, com testes manuais realizados por utilizadores com deficiência antes do alargamento da fase piloto.",
          },
        ],
      },
      {
        heading: "2. Estado de conformidade",
        blocks: [
          {
            type: "paragraph",
            text: "**Parcialmente conforme.** O projeto implementa uma base de acessibilidade significativa e executa **verificações automáticas de acessibilidade (Lighthouse ≥ 0.95) em cada pull request**; continua planeada uma auditoria manual completa de conformidade com as WCAG 2.2 A/AA por utilizadores de tecnologias de apoio. As limitações conhecidas são indicadas abaixo.",
          },
        ],
      },
      {
        heading: "3. O que já está implementado",
        blocks: [
          {
            type: "list",
            items: [
              "Uma ligação para saltar para o conteúdo e um destino de conteúdo principal em todas as páginas.",
              "Estados de foco do teclado visíveis e uma ordem de foco lógica.",
              "Suporte para `prefers-reduced-motion` (animações reduzidas quando solicitado).",
              "Um diretório de texto pesquisável e páginas de detalhe das fichas que funcionam **sem interação com o mapa**; o mapa e o diretório apresentam os mesmos campos públicos.",
              "Seleção da localização do reporte através de um pedido explícito de localização do dispositivo (quando o navegador concede a permissão), clique no mapa **ou** coordenadas manuais validadas; as alternativas pelo mapa/manuais continuam disponíveis.",
              "Uma interface em inglês/italiano com uma preferência de idioma guardada localmente no dispositivo; a escolha do idioma não afeta os dados da API.",
              "Um guia bilingue na aplicação, em [/guide](/guide), que explica os estados dos dados e o fluxo de publicação.",
              "A informação de estado nunca é transmitida apenas pela cor (são usadas etiquetas de texto e ícones).",
            ],
          },
        ],
      },
      {
        heading: "4. Limitações conhecidas",
        blocks: [
          {
            type: "list",
            items: [
              "**As tarefas no mapa podem ser realizadas com teclado.** Os marcadores do mapa podem receber foco e respondem a Enter/Espaço (abrir/fechar a janela de informação); a alternativa em lista de texto permite consultar e pesquisar fichas sem o mapa.",
              "**Ainda não foi feita uma auditoria manual de conformidade.** Ainda não foi realizada uma auditoria manual completa com leitores de ecrã, zoom a 200%, verificação de contraste e dispositivos de ecrã pequeno; as verificações automáticas são executadas em cada pull request e a auditoria manual está planeada.",
              "**Alguns textos visíveis para o utilizador ainda estão definidos diretamente** nos componentes, enquanto decorrem a externalização dos textos da interface e a revisão do idioma piloto.",
              "**A página dedicada de feedback (/feedback) ainda não está disponível.** As barreiras são comunicadas através dos canais da secção 5.",
            ],
          },
        ],
      },
      {
        heading: "5. Comunicar uma barreira",
        blocks: [
          {
            type: "paragraph",
            text: "O projeto disponibiliza **canais de feedback de usabilidade não sensíveis**, para que qualquer pessoa possa comunicar uma barreira na interface **sem criar uma conta e sem fornecer dados pessoais**. Os canais pedem apenas:",
          },
          {
            type: "list",
            items: [
              "o tipo de barreira (navegação/teclado, leitor de ecrã, cor/contraste, zoom/disposição, outra);",
              "uma descrição em linguagem simples do que aconteceu;",
              "um URL opcional da página onde ocorreu a barreira;",
              "um endereço de contacto opcional, **apenas se** quiseres uma resposta (nunca obrigatório, nunca usado para outros fins e eliminado quando a troca de mensagens estiver concluída).",
            ],
          },
          {
            type: "paragraph",
            text: "Comunica barreiras de acessibilidade através de um destes canais:",
          },
          {
            type: "list",
            items: [
              "abre uma issue no repositório do projeto (apenas conteúdo público e não sensível — não incluas dados pessoais nem locais privados);",
              "usa o [formulário de correção](/) na página pública para problemas relacionados com uma ficha específica;",
              "escreve para o contacto de privacidade indicado na [política de privacidade](/privacy): [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org).",
            ],
          },
          {
            type: "paragraph",
            text: "**Compromisso de resposta:** o feedback é tratado com os mesmos prazos que os pedidos de correção e de remoção — um aviso de receção em **48 horas** e uma resposta substantiva em **14 dias**, no idioma da mensagem sempre que possível.",
          },
        ],
      },
      {
        heading: "6. Calendário de revisão",
        blocks: [
          {
            type: "paragraph",
            text: "Esta declaração é revista após cada versão que altere a interface ou o comportamento de acessibilidade; pelo menos trimestralmente quando o serviço estiver em funcionamento; e antes de qualquer lançamento público, registando-se aqui os resultados finais de conformidade e as exceções conhecidas.",
          },
        ],
      },
    ],
  },
};
