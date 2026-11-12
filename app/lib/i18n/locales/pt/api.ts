/**
 * api — PT translation. Parity-checked against the English pilot
 * bundle (../../api.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../api";

export const pt: Translation<typeof en> = {
  navigation: "Navegação principal",
  homeAria: "Página inicial do OpenSurveillanceDB",
  title: "API pública",
  intro:
    "Todas as câmaras da base de dados estão disponíveis através de uma API pública. A leitura não precisa de chave nem de registo: os endpoints abaixo são teus ao abrigo da Open Database Licence. Os contribuidores verificados também podem escrever através da API com chaves privadas.",
  apiNote:
    "Sem chave por conceção para a leitura: o diretório continua simples de consultar. A escrita é possível através da API, mas apenas com uma chave privada emitida para uma conta verificada. As respostas são em JSON (exceto mosaicos e exportações) e as coordenadas são arredondadas a ~10 m.",
  endpointsTitle: "Endpoints de leitura",
  endpointsIntro:
    "Todos os endpoints de leitura aceitam GET e devolvem JSON (exceto mosaicos e exportações). Os parâmetros de caminho aparecem entre {chavetas}; tudo o resto é um parâmetro da query string.",
  endpointMethod: "Método",
  endpointPath: "Caminho",
  endpointDescription: "Descrição",
  endpointExample: "Experimentar",
  queryParams: "Parâmetros da query",
  endpointParamsNone: "Nenhum — o id da ficha é o único dado de entrada.",
  endpointParamsList:
    "limit (tamanho da página, máx. 2000) · offset (início da página) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=oeste,sul,este,norte (separados por vírgulas) · kind · freshness · count=false. Devolve as câmaras públicas dentro da área visível — é o que o mapa interativo usa. count=false salta a contagem COUNT completa e responde total: null (o cliente avança com nextOffset). Com format=geojson aplicam-se os mesmos filtros kind e freshness, a caixa pode cobrir no máximo 50 graus quadrados (caixas maiores respondem 400) e a FeatureCollection contém no máximo 10 000 elementos — quando há mais correspondências, inclui truncated: true (aproxima o zoom para veres o resto).",
  endpointParamsExport:
    "format=geojson ou format=csv (predefinido: geojson). Sem paginação: a exportação é o conjunto de dados completo. As exportações têm limites de pedidos mais rigorosos.",
  endpointParamsRecord:
    "Apenas o caminho. Devolve 404 quando a ficha não está publicamente em vigor.",
  endpointParamsSearch:
    "q (texto livre, comparado com títulos, moradas e tipos). Os resultados são ordenados por relevância.",
  endpointParamsNearby:
    "latitude · longitude (graus decimais, obrigatórios) · radius (metros, predefinido 100, máx. 5000). Ordenados por distância.",
  endpointParamsRevisions:
    "cameraId (obrigatório). Devolve o histórico público de alterações de uma ficha, da mais antiga para a mais recente.",
  endpointParamsGeocode:
    "q (nome do local, obrigatório). Preenchimento automático de locais através de proxy para o OpenStreetMap Nominatim, com cache no servidor.",
  endpointParamsReverse:
    "lat · lng (obrigatórios, graus decimais). Devolve a morada mais próxima, guardada em cache na primeira consulta.",
  endpointParamsTiles:
    "z (zoom 0-19) · x · y (coordenadas do mosaico). Mosaicos raster servidos por proxy a partir do OpenStreetMap.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", example: "/api/cameras?kind=Fixed%20dome&limit=20", description: "Lista JSON paginada de todas as câmaras públicas. O principal ponto de entrada: filtra por tipo ou atualidade, ordena e percorre o conjunto de dados página a página. Acrescenta count=false para saltar a contagem COUNT completa (responde total: null e avança com nextOffset)." },
    bbox: { method: "GET", path: "/api/cameras?bbox=…", example: "/api/cameras?bbox=8.5,47.3,8.6,47.5", description: "Todas as câmaras públicas dentro de uma área visível do mapa, em GeoJSON. É o endpoint que o mapa interativo chama quando deslocas e fazes zoom." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", example: "/api/cameras?format=geojson", description: "O conjunto de dados completo em GeoJSON — um pedido, sem paginação. Ideal para ferramentas SIG e análise de dados." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", example: "/api/cameras?format=csv", description: "O conjunto de dados completo em CSV, pronto para folhas de cálculo. O mesmo conteúdo da exportação GeoJSON, em formato tabular." },
    record: { method: "GET", path: "/api/cameras/{id}", example: "/api/cameras/1", description: "A ficha de uma câmara por id numérico, com todos os detalhes públicos: localização, morada, estado de verificação e histórico de alterações." },
    search: { method: "GET", path: "/api/cameras/search?q=…", example: "/api/cameras/search?q=zurich", description: "Pesquisa de texto em títulos, moradas e tipos. Uma forma rápida de encontrar uma câmara específica sem percorrer o mapa." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=", example: "/api/cameras/nearby?latitude=47.41&longitude=8.57&radius=200", description: "Câmaras perto de uma posição, ordenadas por distância. É a verificação de duplicados que o formulário de reporte usa." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", example: "/api/cameras/revisions?cameraId=1", description: "Histórico público de alterações de uma ficha: o que mudou, quando e por quem (anónimo ou contribuidor)." },
    geocode: { method: "GET", path: "/api/geocode?q=…", example: "/api/geocode?q=zurich+hb", description: "Preenchimento automático de locais para caixas de pesquisa, através de proxy para o OpenStreetMap Nominatim. Os resultados ficam em cache, por isso as consultas repetidas nunca chegam ao serviço de origem." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", example: "/api/geocode/reverse?lat=47.4123&lng=8.5709", description: "A morada mais próxima de uma posição — a mesma consulta que preenche o campo da morada no formulário de reporte." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", example: "/api/tiles/14/8570/5694.png", description: "Mosaicos raster do OpenStreetMap, servidos por proxy e com cache. Usa-os para criares o teu próprio mapa sobre os dados das câmaras." },
  },
  // API keys (epic api-keys, T19 + t_10e3585e): the write API. The read
  // endpoints above stay keyless — private keys unlock WRITE access only.
  keysTitle: "Chaves de API",
  keysIntro:
    "Os contribuidores verificados podem criar chaves privadas para escrever a partir de scripts e ferramentas: enviar reportes e correções, confirmar câmaras, editar fichas e registar ações da comunidade. As chaves são criadas na tua conta, mostradas uma única vez na criação, expiram ao fim de 365 dias por predefinição e podem ser revogadas a qualquer momento; cada conta pode ter até 5 chaves ativas.",
  keysNote:
    "As chaves privadas dão acesso de escrita à API — trata-as como uma palavra-passe: nunca as partilhes, nunca as coloques em repositórios públicos, nunca as registes em logs. Uma chave divulgada permite a qualquer pessoa escrever em teu nome: revoga-a e cria uma nova.",
  authHeaderTitle: "Autenticação",
  authHeaderIntro:
    "Envia a chave no cabeçalho Authorization do pedido. Uma chave continua válida até expirar ou até a revogares na tua conta. Nunca coloques a chave na query string: as credenciais em URL acabam nos logs de proxy e de acesso e nos cabeçalhos Referer, e a API rejeita-as com 400.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Cria as tuas chaves de API na tua conta.",
  writeEndpointsTitle: "Endpoints de escrita",
  writeEndpointsIntro:
    "Estes endpoints alteram dados públicos e exigem uma conta verificada. Autentica-te com uma chave privada no cabeçalho Authorization; cada endpoint precisa do âmbito indicado no respetivo cartão.",
  scopeRequiredLabel: "Âmbito necessário",
  writeEndpoints: {
    cameras: { method: "POST", path: "/api/cameras", scope: "submit", description: "Publica um novo reporte de câmara." },
    corrections: { method: "POST", path: "/api/corrections", scope: "submit", description: "Envia uma correção ou um pedido de remoção." },
    confirmation: { method: "PUT / DELETE", path: "/api/cameras/{id}/confirmation", scope: "confirm", description: "Ativa ou desativa a confirmação comunitária de uma câmara." },
    actions: { method: "PUT / DELETE", path: "/api/cameras/{id}/actions", scope: "action", description: "Regista ou retira uma ação da comunidade: útil, já não existe, problema, privacidade." },
    edit: { method: "PATCH", path: "/api/cameras/{id}", scope: "edit", description: "Atualiza os detalhes da câmara — edições do proprietário e pedidos de edição." },
  },
  scopesTitle: "Permissões",
  scopesIntro:
    "Cada chave tem um âmbito: escolhes o que pode fazer e podes revogá-la a qualquer momento na tua conta.",
  scopes: {
    submit: { name: "Enviar", grants: "Publicar reportes de câmaras e correções.", endpoints: "POST /api/cameras · POST /api/corrections" },
    confirm: { name: "Confirmar", grants: "Marcar câmaras como confirmadas.", endpoints: "PUT/DELETE /api/cameras/{id}/confirmation" },
    edit: { name: "Editar", grants: "Atualizar os detalhes das câmaras (edições do proprietário e pedidos de edição).", endpoints: "PATCH /api/cameras/{id}" },
    action: { name: "Ações da comunidade", grants: "Registar ações da comunidade: útil, já não existe, problema, privacidade.", endpoints: "PUT/DELETE /api/cameras/{id}/actions" },
  },
  lifecycleTitle: "Ciclo de vida das chaves",
  lifecycleIntro:
    "As chaves são geridas na tua conta. A chave completa é mostrada uma única vez, na criação: copia-a imediatamente — nunca é guardada nos nossos servidores.",
  lifecycle: {
    create: { name: "Criar", body: "As chaves são criadas na tua conta, em Chaves de API. A validade predefinida é de 365 dias; na criação podes restringir as permissões, mas nunca alargá-las depois." },
    reveal: { name: "Mostrada uma vez", body: "A chave completa só aparece na janela de criação. Depois disso, a conta mostra apenas um prefixo curto (osdb_…)." },
    expire: { name: "Validade", body: "Uma chave deixa de funcionar na data de expiração (365 dias após a criação, por predefinição). As chaves expiradas respondem 401 a qualquer escrita." },
    revoke: { name: "Revogar", body: "A revogação tem efeito imediato: os scripts que usam a chave começam logo a falhar com 401." },
    cap: { name: "Limite", body: "Até 5 chaves ativas por conta. Ao atingir o limite, a resposta é 409 — revoga uma chave para libertar espaço." },
  },
  securityTitle: "Segurança",
  securityIntro: "As chaves de API são credenciais da tua conta — trata-as como palavras-passe.",
  security: {
    queryString: { name: "Nunca em URL", body: "As chaves pertencem apenas ao cabeçalho Authorization. Uma chave na query string (parâmetros api_key, apikey ou key) é rejeitada com 400 nos pedidos de escrita antes de qualquer processamento — as credenciais em URL acabam nos logs de proxy e de acesso e nos cabeçalhos Referer." },
    logging: { name: "Nunca registes nem partilhes chaves", body: "Não imprimas as chaves, não as guardes em ficheiros incluídos em repositórios públicos nem as coles em relatórios de erros ou mensagens de chat. Se uma chave for divulgada, revoga-a e cria uma nova." },
    storage: { name: "Apenas o hash em repouso", body: "Só é guardada uma impressão digital SHA-256 da chave. A chave completa existe numa única resposta — a da criação — e não pode ser recuperada." },
  },
  errorsTitle: "Respostas de erro",
  errorsIntro:
    "Os pedidos de escrita falham com um código de estado claro e um formato de resposta canónico único. Os endpoints de leitura continuam a devolver 404 para fichas que não estão publicamente em vigor.",
  errors: {
    "400": "Pedido mal formado: um campo em falta ou inválido, ou credenciais na query string.",
    "401": "Chave em falta, inválida, expirada ou revogada.",
    "403": "A chave é válida, mas não inclui a permissão necessária.",
    "404": "Ficha não encontrada — a API nunca revela se um identificador existe.",
    "409": "Limite atingido: demasiadas chaves ativas (máx. 5) ou um estado em conflito.",
    "429": "Limite de pedidos excedido — por chave e por endereço IP.",
    "503": "Serviço temporariamente indisponível.",
  },
  keysLimitsTitle: "Limites de pedidos por chave",
  keysLimitsIntro:
    "Cada chave tem o seu próprio limite, além dos limites por IP acima: um script não consegue esgotar a quota partilhada de todos os outros clientes do mesmo endereço.",
  limitsTitle: "Limites de pedidos",
  limitsIntro:
    "Cada endpoint é limitado por cliente (endereço IP) numa janela de 60 segundos. Os limites protegem o serviço e os fornecedores de origem (OpenStreetMap); generosos para uso interativo, apertados para scrapers.",
  limits: {
    read: { name: "Lista, bbox, ficha, pesquisa", requests: "300 pedidos / minuto" },
    export: { name: "Exportações CSV / GeoJSON", requests: "10 pedidos / minuto" },
    nearby: { name: "Proximidade (verificação de duplicados)", requests: "30 pedidos / minuto" },
    revisions: { name: "Histórico de alterações", requests: "30 pedidos / minuto" },
    geocode: { name: "Geocodificação (direta + inversa)", requests: "30 pedidos / minuto" },
    tiles: { name: "Mosaicos do mapa", requests: "1200 pedidos / minuto" },
  },
  licenseTitle: "Licença e atribuição",
  licenseBody:
    "A base de dados e as suas exportações estão licenciadas ao abrigo da Open Database Licence (ODbL) 1.0: podes partilhar e adaptar os dados desde que atribuas a fonte e disponibilizes qualquer base de dados derivada sob a mesma licença.",
  attribution: "Dados e mosaicos do mapa © contribuidores do OpenStreetMap, licenciados sob a ODbL.",
  backToHome: "Voltar ao início",
};
