/**
 * report — PT translation. Parity-checked against the English pilot
 * bundle (../../report.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../report";

export const pt: Translation<typeof en> = {
  // Page-level chrome (/segnala).
  pageTitle: "Reportar uma câmara",
  pageIntro:
    "Escolhe uma localização no mapa ou introduz coordenadas e acrescenta apenas o que consegues observar a partir do espaço público. O teu reporte é publicado de imediato.",
  navigation: "Navegação do reporte",
  homeAria: "Página inicial do OpenSurveillanceDB",
  // Report section (extracted from the home page bundle in F1).
  contribute: "Contribuir",
  reportTitle: "Ajuda a tornar o espaço público legível.",
  reportIntro:
    "Escolhe uma localização no mapa ou introduz coordenadas e acrescenta apenas o que consegues observar a partir do espaço público. O teu reporte é publicado de imediato.",
  beforeSubmitting: "Antes de submeter",
  beforeSubmittingBody:
    "Não descrevas pessoas, matrículas, habitações privadas, falhas de segurança nem locais sensíveis.",
  stepLocation: "1. Localização",
  stepObservation: "2. O que observaste",
  stepEvidence: "3. Confirmar e publicar",
  selectedPoint: "Ponto selecionado",
  // Report mini-map (t_ebbe0ea3): click to pick the position, drag the
  // cone's rotation handle to aim the field of view. The manual coordinate
  // fields below stay as the accessible fallback.
  mapAria: "Mapa — clica para escolher a posição da câmara",
  mapHelp:
    "Clica no mapa para escolher a posição da câmara. Para câmaras direcionais, arrasta a pega redonda do cone para definir a direção de visão.",
  manualCoordinatesTitle: "Ou introduz coordenadas",
  manualCoordinatesHelp:
    "Usa graus decimais. A latitude tem de estar entre -90 e 90; a longitude entre -180 e 180. A vírgula é aceite como separador decimal.",
  latitude: "Latitude",
  longitude: "Longitude",
  useCoordinates: "Usar estas coordenadas",
  // One-tap geolocation (CEO 2026-08-09): the primary way to set a position
  // on a phone, standing in front of the camera. The map and the manual
  // fields stay as the alternatives when the device or the user says no.
  useMyPosition: "Usar a minha posição",
  locatingPosition: "A determinar a tua posição…",
  // Address search with autocomplete (issue #432): the /segnala location
  // row pairs a debounced place search (same-origin /api/geocode proxy)
  // with the one-tap geolocation button on its right.
  addressSearchLabel: "Pesquisar uma morada",
  addressSearchPlaceholder: "Rua, local ou coordenadas…",
  addressSearchHelp:
    "Escreve uma rua, praça ou local, ou cola coordenadas (ex.: 41.9068, 12.4808), e prime Enter ou Pesquisar. Nada é enviado enquanto escreves.",
  addressSearchButton: "Pesquisar",
  addressSearchNoResults: (query: string) => `Não foram encontrados locais para «${query}».`,
  addressSearchRateLimited: (seconds: number) =>
    `Demasiadas pesquisas. Tenta novamente daqui a ${seconds} segundo${seconds === 1 ? "" : "s"}.`,
  addressSearchUnavailable: "A pesquisa de moradas não está disponível de momento.",
  addressSearchAttribution: "Locais © contribuidores do OpenStreetMap",
  geolocationDenied:
    "A permissão de localização foi recusada. Escolhe o ponto no mapa ou escreve as coordenadas abaixo.",
  geolocationTimeout:
    "A tua posição demorou demasiado a chegar. Tenta novamente, escolhe o ponto no mapa ou escreve as coordenadas abaixo.",
  geolocationUnavailable:
    "O teu dispositivo não conseguiu fornecer uma posição. Escolhe o ponto no mapa ou escreve as coordenadas abaixo.",
  checkingNearby: "A verificar fichas públicas próximas…",
  possibleDuplicate: "Possível duplicado nas proximidades",
  duplicateBody:
    "Estas fichas públicas estão a menos de 75 metros. Podes ainda assim submeter um novo reporte; será publicado de imediato.",
  metresAway: "m de distância",
  matchVeryClose: "correspondência muito próxima",
  matchLikely: "correspondência provável",
  duplicateGuidance:
    "Se for a mesma câmara, usa o formulário de correção em vez de criar um duplicado.",
  // Horizon 1 duplicate gate (ADR 0019): a high-strength match must be
  // acknowledged before the report can be stored.
  duplicateConfirmNotice:
    "Foi encontrada uma correspondência muito próxima nas proximidades. Confirma que se trata de uma câmara distinta para submeter, ou usa o formulário de correção para a ficha existente.",
  duplicateConfirmTitle: "Já existe uma correspondência muito próxima nas proximidades",
  duplicateConfirmBody:
    "Já existe uma ficha publicada praticamente no mesmo sítio. Se for a mesma câmara, usa o formulário de correção. Se for uma câmara diferente, confirma abaixo para a publicar.",
  duplicateConfirmLabel:
    "Confirmo que se trata de uma câmara distinta e quero submetê-la na mesma.",
  nearbyUnavailable:
    "Não foi possível verificar as fichas próximas. Podes ainda assim submeter este reporte.",
  recordTitle: "Título da ficha",
  recordTitlePlaceholder: "ex.: Câmara de segurança pública",
  selectOne: "Seleciona uma opção",
  cameraType: "Tipo de câmara",
  fixedDome: "Dome fixa",
  bullet: "Bullet",
  ptz: "PTZ",
  trafficReader: "Trânsito / leitor de matrículas",
  otherUnknown: "Outro / desconhecido",
  // Field-of-view direction (t_f8b775ec): shown only for directional kinds
  // (never for domes). A compass slider 0-359 with an arrow preview plus a
  // "don't know" option that stores NULL.
  directionTitle: "Direção do campo de visão",
  directionHelp: "O rumo da bússola para onde a câmara aponta, no sentido dos ponteiros do relógio a partir do norte (0–359°).",
  directionUnknown: "Não sei a direção",
  directionDegrees: "Direção",
  manufacturer: "Fabricante (opcional)",
  manufacturerPlaceholder: "ex.: nome do fabricante",
  observedOn: "Data da observação (opcional)",
  approximateAddress: "Morada aproximada",
  addressPlaceholder: "Rua e localidade (opcional)",
  resolvingAddress: "A obter a morada…",
  whatObserved: "O que observaste?",
  observedPlaceholder: "Direção, operador, aviso visível, modelo…",
  reportConsent:
    "Confirmo que esta observação foi feita a partir do espaço público e não contém dados pessoais.",
  privacyNotice: "Política de privacidade",
  privacyDetails: "Detalhes de privacidade",
  termsOfUse: "Termos de utilização",
  reportArt13:
    "Os dados que introduzes (localização, notas) são tratados pelo responsável pelo tratamento Simone Rondina / OpenSurveillanceDB com base no interesse legítimo (art. 6.º, n.º 1, alínea f), do RGPD) para documentar a infraestrutura de vigilância pública. Informação completa:",
  reportArt13Rights: "Podes exercer os teus direitos ao abrigo do RGPD (arts. 15.º-22.º) escrevendo para",
  privacyContact: "privacy@opensurveillancedb.org",
  sendModeration: "Publicar reporte",
  positionSelected: "Posição selecionada",
  nearbyCheckError: "Não foi possível verificar as fichas próximas",
  choosePosition:
    "Escolhe a posição aproximada da câmara no mapa ou introduz coordenadas válidas antes de submeter.",
  invalidCoordinates:
    "Introduz uma latitude (-90 a 90) e uma longitude (-180 a 180) válidas.",
  defaultReportTitle: "Reporte de câmara pública",
  unknown: "Desconhecido",
  submitReportError: "Não foi possível submeter o reporte",
  reportSaved:
    "Reporte publicado — já está visível no diretório e no mapa.",
  reportSavedWithNearby:
    "Foram encontradas fichas perto desta posição — a comunidade irá verificar se se trata de um duplicado.",
  // P1-2 (design review): the write gate (Fase E1) refuses submissions from
  // anonymous (401) and unverified (403) sessions. The login wall gates the
  // form itself; these messages cover a session that dies mid-form.
  loginRequired:
    "A tua sessão terminou. Inicia sessão novamente para submeter o reporte.",
  verifyRequired:
    "O teu email ainda não está verificado. Verifica-o na página da tua conta para submeter o reporte.",
  moderationUnavailable:
    "A publicação não está disponível. Tenta novamente mais tarde.",
};
