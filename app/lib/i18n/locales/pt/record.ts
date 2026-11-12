/**
 * record — PT translation. Parity-checked against the English pilot
 * bundle (../../record.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../record";

export const pt: Translation<typeof en> = {
  navigation: "Navegação da ficha",
  backToDirectory: "← Voltar ao diretório",
  loading: "A carregar a ficha pública…",
  publicRecord: "Ficha pública",
  recordId: "ID da ficha",
  source: "Fonte",
  // Creation date (FASE C, t_4dbce318): `cameras.created_at` — when the
  // record entered the database (import or community report). The detail
  // page shows it alongside provenance and the last update.
  addedOn: "Adicionada",
  // M03 (design review 2026-10-22, P1): record.updated is the RECORD's last
  // update (import/edits), never a community confirmation. Labelling it
  // "Last confirmation" produced the contradiction "Never confirmed" +
  // "Last confirmation: 8 August 2026" on imported records. Real
  // confirmations keep their own label (lastConfirmed, from lastVerifiedAt).
  lastUpdated: "Última atualização",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Dados ilustrativos",
  demoUpdated: "Dados de demonstração",
  generalLocation: "Localização geral",
  manufacturer: "Fabricante",
  observedOn: "Observada em",
  viewOnMap: "Ver no mapa",
  reportIssue: "Reportar um problema",
  recordNote:
    "Esta página contém apenas fichas públicas ativas ou fichas ilustrativas claramente identificadas. Não disponibiliza transmissões em direto nem detalhes operacionais das câmaras.",
  unavailable: "Ficha indisponível",
  notFound: "Não conseguimos encontrar essa ficha pública.",
  notFoundDetail:
    "Pode ter sido removida, não ser pública ou a ligação estar incorreta.",
  browseDirectory: "Consultar o diretório",
  offlineTitle: "Estás offline",
  offlineBody: "A mostrar as últimas fichas carregadas.",
  offlineAction: "Tentar novamente",
  loadError: "Não foi possível carregar a ficha pública.",
  loadErrorDetail:
    "O serviço de fichas não está acessível de momento. Verifica a tua ligação e tenta novamente.",
  retryLoad: "Tentar novamente",
  statusFallback: "Estado",
  changeHistory: "Histórico de alterações",
  changeHistoryNote:
    "Este histórico lista apenas eventos públicos. Nunca inclui a identidade dos contribuidores nem notas internas.",
  changeHistoryFallback: "Ficha atualizada",
  changeHistoryLabels: {
    approve: "Publicada",
    "mark-stale": "Assinalada como já não presente",
    reverify: "Verificada novamente",
    hide: "Oculta",
  },
  // Contribution edit form (/records/[id]/edit, C6). The page keeps its own
  // field labels here (record.ts is the form bundle per SITEMAP) instead of
  // mixing the report bundle: same per-page isolation rule as statusFilters.
  editTitle: "Título da ficha",
  editTitlePlaceholder: "ex.: Câmara de segurança pública",
  editKind: "Tipo de câmara",
  editKindSelect: "Seleciona uma opção",
  editKindOptions: {
    fixedDome: "Dome fixa",
    bullet: "Bullet",
    ptz: "PTZ",
    trafficReader: "Trânsito / leitor de matrículas",
    otherUnknown: "Outro / desconhecido",
  },
  editManufacturer: "Fabricante (opcional)",
  editManufacturerPlaceholder: "ex.: nome do fabricante",
  editObservedOn: "Data da observação (opcional)",
  editAddress: "Morada aproximada (opcional)",
  editAddressPlaceholder: "Rua e localidade",
  editAddressResolving: "A obter a morada…",
  editNotes: "O que observaste?",
  editNotesPlaceholder: "Direção, operador, aviso visível, modelo…",
  editDescription: "Descrição (opcional)",
  editDescriptionPlaceholder: "Contexto adicional sobre a ficha…",
  editBlockedRemovedTitle: "Esta ficha já não pode ser editada",
  editTitleRequired: "O título da ficha é obrigatório.",
  editFieldTooLong: (limit: number) =>
    `Este campo pode ter no máximo ${limit} carateres.`,
  editObservedOnInvalid: "Introduz uma data válida (AAAA-MM-DD).",
  // Field-of-view direction (t_f8b775ec) — edit form, same pattern as the
  // report form: only for directional kinds, compass slider + "don't know".
  editDirectionTitle: "Direção do campo de visão",
  editDirectionHelp: "O rumo da bússola para onde a câmara aponta, no sentido dos ponteiros do relógio a partir do norte (0–359°).",
  editDirectionUnknown: "Não sei a direção",
  editDirectionDegrees: "Direção",
  // Camera position (t_775c8400): the interactive map moves the record's
  // position — click the map or type the coordinates; directional kinds
  // with a known bearing draw the field-of-view cone (same geometry as the
  // report mini-map and /mappa).
  editPositionTitle: "Posição da câmara",
  editPositionHelp:
    "Clica no mapa para mover a posição da câmara ou escreve as coordenadas abaixo. Para câmaras direcionais, arrasta a pega redonda do cone para definir a direção de visão.",
  editPositionMapAria: "Mapa — clica para mover a posição da câmara",
  editLatitude: "Latitude",
  editLongitude: "Longitude",
  editPositionInvalid: "Introduz coordenadas válidas (latitude −90 a 90, longitude −180 a 180).",
  // Record detail fact (t_f8b775ec): "Direction: NE 45°" when the record
  // has a stored bearing (domes and unknown directions omit the row).
  direction: "Direção",
  // Mini map on the record page (CEO 2026-08-07): a read-only Leaflet
  // display of the camera position and its field-of-view cone/circle —
  // decorative (role="img"), the same facts are textual in the list.
  positionOnMap: "Posição no mapa",

  // --- Community status badge (ADR 0021 §9, FASE 3 UI): informational
  // freshness line — never a state change. A record with no confirmations
  // shows the neutral "never confirmed" badge; a confirmed one shows the
  // count and the last-confirmed date.
  communityStatus: "Estado na comunidade",
  neverConfirmed: "Nunca confirmada",
  confirmedTimes: (count: number) =>
    `Confirmada ${count} ${count === 1 ? "vez" : "vezes"}`,
  lastConfirmed: "Última confirmação",
  // Import provenance (import pipeline FASE C, t_4dbce318): imported
  // records carry a provenance line next to the community badge — the
  // source dataset (linked) and its licence (linked), never the raw
  // "import:<slug>" internal value.
  importedFrom: "Importada de",
  // M05 (design review 2026-10-22): the provenance line above already names
  // the dataset and links its licence, so the facts row states the ORIGIN
  // instead of repeating the full source name a second time.
  importedData: "Dados importados",

  // --- Hidden/removed banner (ADR 0021 §6.3, FASE 3 UI): a withdrawn
  // record stays reachable by direct link with an explicit banner; the
  // reversal signals (confirm / gone) stay open, and the public history
  // link is the transparency control.
  hiddenTitle: "Ficha oculta",
  hiddenBody:
    "Esta ficha foi retirada enquanto aguarda verificação da comunidade ou legal. Não aparece no diretório nem no mapa; podes ainda assim ler o seu histórico público e participar.",
  removedTitle: "Reportada como já não presente",
  removedBody:
    "A comunidade reportou que esta câmara já não está lá. Não aparece no diretório nem no mapa; podes ainda assim ler o seu histórico público e confirmá-la se tiver regressado.",
  bannerHistoryLink: "Ver o histórico público",
  bannerNote: "Os sinais de reversão (confirmar, já não está lá) continuam abertos nesta ficha.",

  // --- Public per-record event timeline (ADR 0021 §7, FASE 3 UI): the
  // unattributed aggregate history. Labels cover every semantic event type
  // the API can emit; anything unknown falls back to the neutral fallback.
  timeline: "Histórico público",
  timelineNote:
    "Apenas eventos públicos agregados — nunca identidades de contribuidores, emails ou notas internas.",
  timelineEmpty: "Ainda não há eventos públicos.",
  timelineFallback: "Ficha atualizada",
  timelineLabels: {
    published: "Publicada",
    confirmed: "Confirmada como presente",
    liked: "Marcada como útil",
    "gone-flagged": "Assinalada como já não presente",
    hidden: "Oculta",
    removed: "Removida",
    restored: "Reposta no diretório",
    "action-consumed": "Ações de desencadeamento reiniciadas",
    migration: "Histórico migrado",
    "setting-changed": "Definições alteradas",
  },
  hideReasons: {
    problem: "motivo: sinalizada",
    privacy: "motivo: privacidade",
    adminLegal: "motivo: emergência legal",
  },
  eventPeople: (count: number) => `${count} ${count === 1 ? "pessoa" : "pessoas"}`,
};
