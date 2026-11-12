/**
 * map — PT translation. Parity-checked against the English pilot
 * bundle (../../map.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../map";

export const pt: Translation<typeof en> = {
  mapLabel: "Mapa interativo do OpenStreetMap",
  mapDescription:
    "O mapa mostra as mesmas fichas públicas que o diretório acessível abaixo. Podes usar o diretório para pesquisar, filtrar e abrir fichas sem usar o mapa.",
  mapDirectoryLink: "Ir para o diretório acessível",
  mapFallbackTitle: "O mapa interativo não está disponível.",
  mapFallbackBody:
    "Continuas a poder pesquisar, filtrar e abrir todas as fichas públicas a partir do diretório acessível, que funciona sem o mapa.",
  // Page-level chrome (/mappa).
  pageTitle: "Mapa interativo",
  pageIntro:
    "Explora no mapa as câmaras públicas documentadas. Usa os filtros para restringir a vista; cada marcador abre a respetiva ficha pública. Uma zona vazia nunca prova que não existem câmaras.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "A carregar o mapa…",
  // Map tool chrome (t_966254a1, t_11e38eab): no visible tool header — the
  // page starts directly with the map card. The h1 (pageTitle) stays in the
  // DOM as sr-only for a11y; the old "Explore documented cameras" section
  // heading, its coverage note and the "Live prototype" eyebrow were removed
  // with the duplicated header; pageIntro still covers the "an empty area
  // never proves absence" truthfulness contract (SSR metadata + a11y intro).
  // The prototype banner itself was removed (CEO feedback 2026-08-02) — the
  // map is no longer framed as a prototype.
  mapLegendTitle: "Como usar o mapa",
  mapLegendMove: "Arrasta o mapa ou usa os controlos + e − para explorares uma zona.",
  mapLegendMarker: "Seleciona um marcador para abrires a ficha pública.",
  mapLegendFilters: "Usa a pesquisa e os filtros acima do mapa para refinares os resultados.",
  mapLegendList: "Abre o painel lateral para percorreres os pontos da vista atual.",
  mapLegendAdd: "Clica num local vazio do mapa para reportares uma câmara nesse ponto.",
  // Field-of-view legend entry (usability Batch C2, P1#6): the shaded wedge/
  // circle drawn around directional cameras (lib/field-of-view) carries the
  // SAME fact the marker popup already states as "Field of view: NE 45°"
  // (fovDirection) — surfacing it here lets a sighted user learn what the
  // shape means without opening a popup first.
  mapLegendFov: "Um cone ou círculo sombreado à volta de um marcador mostra o campo de visão aproximado dessa câmara.",
  // Grid-aggregation badge legend entry (usability Batch C2, P1#7): at low
  // zoom the numbered .osm-grid-badge replaces individual markers. The badge
  // itself already names its count (gridBadgeLabel/Tooltip/Zoom), but nothing
  // told the user that zooming in splits one badge into separate cameras.
  mapLegendGridBadge: "Um círculo numerado agrupa várias câmaras neste nível de zoom — aproxima para as veres individualmente.",
  mapLegendReport: "Reportar uma câmara",
  // Always-visible hint under the map (one line): the empty-click shortcut is
  // otherwise explained ONLY inside the collapsed-by-default .map-legend, so
  // a sighted user could miss it entirely. Deliberately SHORTER than
  // mapLegendAdd — a hint, not the full legend entry.
  mapClickHint: "Clica num local vazio para começares aí um reporte de câmara.",
  // Shareable viewport (?lat&lng&zoom): the "Copy link" toolbar button copies
  // the current URL (which carries the map's view) and confirms briefly.
  copyLink: "Copiar ligação",
  copyLinkCopied: "Copiada!",
  pickTitle: "Novo reporte",
  pickCoordinates: "Coordenadas",
  pickReportHere: "Reportar uma câmara aqui",
  recordId: "ID da ficha",
  source: "Fonte",
  freshness: "Atualidade",
  location: "Localização",
  reportIssue: "Reportar um problema",
  loadingRecords: "A carregar a API de fichas públicas…",
  unknown: "Desconhecido",
  apiUnavailable:
    "A API pública está temporariamente inacessível; os pontos já carregados continuam disponíveis.",
  apiRateLimited: (seconds: number) =>
    `O mapa está a pausar temporariamente novos pedidos de dados para respeitar o limite do serviço. Vai tentar novamente dentro de cerca de ${seconds} segundos; os pontos já carregados continuam disponíveis.`,
  // Continental viewport: the API answers a decimated sample (one request).
  viewportDecimated:
    "Esta vista mostra uma amostra das câmaras da zona. Aproxima o zoom para carregares o detalhe completo.",
  // Truthful empty state (never a silent map).
  emptyTitle: "Nenhuma ficha publicada corresponde a esses filtros.",
  emptyBody:
    "Isto não significa que não existam câmaras na zona. Podes limpar os filtros, percorrer o diretório ou reportar uma câmara que observaste a partir do espaço público.",
  clearSearch: "Limpar filtros",
  offlineTitle: "Estás offline",
  offlineBody: "A mostrar as últimas fichas carregadas.",
  offlineAction: "Tentar novamente",
  // Map place search (privacy pass 2026-11): ONE purpose — find a place,
  // an address, coordinates or a record number. Nothing is sent while
  // typing; Enter (or the button) searches. Coordinates and "#123" are
  // resolved in the browser; only real place names reach our geocoder proxy.
  // Typing no longer filters the points (the directory search does that).
  listSearchLabel: "Procurar um local",
  listSearchPlaceholder: "Local, morada, coordenadas ou #ficha",
  listSearchHelp:
    "Escreve um local, uma morada, coordenadas como 41.9068, 12.4808 ou um número de ficha como #6302 e prime Enter. Os resultados dentro da vista atual do mapa aparecem primeiro.",
  listSearchButton: "Procurar",
  // Visible caption under the field: the privacy promise, in plain words.
  listSearchCaption:
    "Nada é enviado enquanto escreves. As coordenadas e os #números de ficha nunca saem do teu navegador.",
  // Geocode autocomplete dropdown (t_b9666d09): the listbox under the
  // sidebar search field. Attribution is required by the ODbL for
  // Nominatim-derived place data (see docs/OSM_INTEGRATION.md §8).
  geocodeLabel: "Sugestões de locais",
  geocodeNoResults: (query: string) => `Sem resultados para “${query}”`,
  geocodeAttribution: "Locais © contribuidores do OpenStreetMap",
  geocodeUnavailable: "A pesquisa de locais está temporariamente indisponível.",
  geocodeRateLimited: (seconds: number) =>
    `A pesquisa de locais atingiu o seu limite de pedidos de curto prazo. Tenta novamente dentro de cerca de ${seconds} segundos; as coordenadas e os #números de ficha continuam a funcionar.`,
  listTitle: "Pontos na vista atual",
  // Points disclosure row (mobile, ID 2): the WHOLE header row is ONE button
  // carrying ONE compact label — the verb plus the current in-view count. The
  // zero/one/many wording is spelled here (dictionary function, never a
  // concatenation in the component), so a 320px row stays one short line.
  listShowCount: (count: number) => (count === 1 ? "Mostrar 1 ponto" : `Mostrar ${count} pontos`),
  listHideCount: (count: number) => (count === 1 ? "Ocultar 1 ponto" : `Ocultar ${count} pontos`),
  listMapSyncHelp: "A lista atualiza-se à medida que moves ou fazes zoom no mapa: aproxima para a restringires, afasta para a alargares.",
  listCount: (visible: number, total: number) =>
    visible === 0
      ? "Nenhum ponto na vista atual"
      : visible === 1
        ? "A mostrar o único ponto na vista atual"
        : visible === total
          ? `A mostrar todos os ${visible} pontos na vista atual`
          : `A mostrar ${visible} de ${total} pontos na vista atual`,
  // Capped points list (perf): the list renders one page at a time; the
  // button appends the next page and a polite live region reports the
  // listed count. The heading count above always reports the full total.
  listShowMore: (next: number, remaining: number) =>
    next === remaining
      ? (remaining === 1 ? "Mostrar o último ponto" : `Mostrar os últimos ${remaining} pontos`)
      : `Mostrar mais ${next} pontos (${remaining} ainda não listados)`,
  listShownOf: (shown: number, total: number) => `A listar ${shown} de ${total} pontos na vista atual`,
  listEmptyInView:
    "Nenhum ponto documentado na vista atual. Move o mapa ou afasta o zoom para explorares mais.",
  // Marker popup (t_702c10af): opens on marker click with the record info
  // and its correction/detail links.
  popupDetail: "Abrir ficha",
  // Field-of-view direction row in the marker popup (t_f8b775ec): the
  // textual, accessible equivalent of the decorative map cone.
  fovDirection: "Campo de visão",
  // Import provenance line in the marker popup (FASE C, t_4dbce318):
  // small secondary text at the bottom — the readable source (entity or
  // "Community report") with its licence, and the record's added date.
  popupAdded: "Adicionada",
  popupCommunityReport: "Reporte da comunidade",
  // Pixel-grid aggregation badges (t_26ce96f3, CEO 2026-08-05): at low zoom
  // / high density the map renders one count badge per 48px screen cell
  // instead of thousands of DOM markers. The badge is a button with a
  // count; clicking it zooms in toward the cell centroid. The tooltip and
  // the aria-label carry the same message (the count is the badge text).
  gridBadgeLabel: (count: number) => `${count} câmaras nesta zona — aproxima para as veres`,
  gridBadgeTooltip: (count: number) => `${count} câmaras aqui`,
  gridBadgeZoom: (count: number) => `${count} câmaras — aproxima para as veres individualmente`,
  // Geolocation button (t_18259daa, CEO): a floating control stacked ABOVE
  // the zoom buttons shows the user's own position on the map. Everything
  // stays client-side — the position never leaves the browser (privacy by
  // design). aria-pressed carries the on/off state; the marker is a
  // precision dot + accuracy circle, never a camera marker.
  geolocateLabel: "Mostrar a minha localização",
  geolocateDenied: "O acesso à localização foi negado. Permite o acesso à localização e tenta novamente.",
  geolocateError: "Não foi possível determinar a tua localização. Tenta novamente.",
};
