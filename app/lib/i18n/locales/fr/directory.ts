/**
 * directory — FR translation. Parity-checked against the English pilot
 * bundle (../../directory.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../directory";

export const fr: Translation<typeof en> = {
  // Page-level chrome (/directory).
  pageTitle: "Répertoire public",
  pageIntro:
    "Recherchez, filtrez et triez les fiches publiques sans la carte. Un résultat n’est jamais la preuve qu’une zone est exempte de surveillance.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Chargement du répertoire…",
  navigation: "Navigation du répertoire",
  homeAria: "Accueil OpenSurveillanceDB",
  useMapInstead: "Utiliser plutôt la carte",
  // Directory section (extracted from the home page bundle in F1).
  accessibleDirectory: "Répertoire accessible",
  recordsTitle: "Parcourir les fiches publiques sans la carte",
  recordsIntro:
    "La recherche porte sur les mêmes fiches publiques que celles affichées sur la carte. Un résultat n’est jamais la preuve qu’une zone est exempte de surveillance.",
  // Catalog mode (t_127492f1): the sr-only heading of the results region —
  // keeps the h1 → h2 → h3 ladder on /directory now that the place-search
  // block is a collapsible panel instead of the section heading.
  resultsRegion: "Résultats du répertoire",
  searchDirectory: "Rechercher dans le répertoire public",
  searchPlaceholder: "Nom, type, adresse ou lieu",
  // Search-as-you-type (2026-11): record suggestions from our own data;
  // the last item runs the existing place search (Enter does the same).
  suggestLabel: "Suggestions",
  suggestCount: (count: number) => (count === 1 ? "1 suggestion disponible" : `${count} suggestions disponibles`),
  suggestCoordinates: (text: string) => `Rechercher près des coordonnées ${text}`,
  suggestRecordNumber: (id: number) => `Ouvrir la fiche #${id}`,
  suggestPlace: (query: string) => `Rechercher près du lieu « ${query} » (OpenStreetMap)`,
  searchHelp:
    "La recherche se fait pendant la saisie ; appuyez sur Entrée pour chercher autour d’un lieu.",
  filters: "Filtres",
  // Catalog mode: data export of the filtered set (issue #409). The
  // downloads are generated client-side from the exact visible records, so
  // EVERY active filter applies (search, type, freshness, state, origin)
  // plus the sort order; the hint below says exactly what the export
  // contains.
  exportCsv: "Télécharger le CSV",
  exportGeoJson: "Télécharger le GeoJSON",
  exportHint: "Les exports contiennent les fiches affichées par la recherche et les filtres actuels.",
  // Catalog mode (CEO 2026-08-08): the small circular [+] in the results
  // header top-right — a direct shortcut to the report form (/segnala).
  reportCamera: "Signaler une caméra",
  // Catalog mode (t_f13fcb1c): the visible results header, the active-filter
  // chips, the alphabetical index and the pagination bar.
  activeFilters: "Filtres actifs",
  removeFilter: (label: string) => `Retirer le filtre : ${label}`,
  // F1 (mobile usability 2026-10-23): the native filter disclosure summary
  // states how many selections are active — the SAME count as the removable
  // chips, so the closed disclosure still tells the truth. Singular/plural;
  // an all-default state renders no count at all.
  filtersActiveOne: "1 filtre actif",
  filtersActiveMany: (count: number) => `${count} filtres actifs`,
  // F1: the chip of a non-default order names the ordering ("Order: Most
  // useful") so it is never read as a restrictive filter.
  filterOrder: (label: string) => `Tri : ${label}`,
  alphaIndexTitle: "Index alphabétique",
  alphaIndexAria: (letter: string) => `Aller aux fiches commençant par ${letter}`,
  showingRecords: (from: number | string, to: number | string, total: number | string) => `Fiches ${from}–${to} sur ${total}`,
  pageOf: (page: number | string, pages: number | string) => `Page ${page} sur ${pages}`,
  previousPage: "Page précédente",
  nextPage: "Page suivante",
  // Catalog mode: the place-search panel trigger in the results meta row
  // (the panel itself keeps the historical place-search strings).
  searchNearPlace: "Rechercher près d’un lieu…",
  placeHide: "Masquer la recherche par lieu",
  cameraType: "Type de caméra",
  allTypes: "Tous les types",
  freshnessFilter: "Fraîcheur de la fiche",
  freshnessAll: "N’importe quand",
  freshness7d: "7 derniers jours",
  freshness30d: "30 derniers jours",
  freshness90d: "90 derniers jours",
  orderRecords: "Trier les fiches",
  alphabetical: "Alphabétique",
  positionOrder: "Position (du sud au nord)",
  // Community ranking (ADR 0021 §10, FASE 3 UI): the three server sort
  // options surface usefulness (weighted likes), freshness (last confirm)
  // and confirmation volume. Same frozen vocabulary as the action widget.
  sortUseful: "Les plus utiles",
  sortRecent: "Confirmées récemment",
  sortConfirmations: "Les plus confirmées",
  // Confirmation-status filter (?state=, FASE 3 UI): a record's "state"
  // in the directory sense is its community confirmation — never
  // hidden/removed, which are excluded from the public list by design
  // (ADR §6.3).
  stateFilter: "État de confirmation",
  stateAll: "Tous",
  stateConfirmed: "Confirmées",
  stateNever: "Jamais confirmées",
  advancedFilters: "Plus de filtres",
  advancedFiltersActive: (count: number) =>
    `Plus de filtres · ${count} ${count < 2 ? "actif" : "actifs"}`,
  // Import-origin filter (?origin=, FASE C, t_4dbce318): where a record
  // comes from — a community report or an imported public dataset.
  originFilter: "Origine",
  originAll: "Toutes",
  originReports: "Signalements communautaires",
  originImported: "Données importées",
  oneRecordFound: "1 fiche publique trouvée",
  recordsFound: "fiches publiques trouvées",
  // M03: the card shows `record.updated` (record update, not a community
  // confirmation) — the label must say so.
  lastUpdated: "Dernière mise à jour",
  showOnMap: "Voir sur la carte",
  openRecord: "Ouvrir la fiche",
  emptyTitle: "Aucune fiche publiée ne correspond à cette recherche.",
  emptyBody:
    "Cela ne signifie pas qu’il n’y a aucune caméra dans la zone. Vous pouvez effacer la recherche, explorer la carte ou envoyer un signalement depuis un compte vérifié.",
  clearSearch: "Effacer la recherche",
  submitObservation: "Envoyer un signalement",
  resetFilters: "Réinitialiser les filtres",
  offlineTitle: "Vous êtes hors ligne",
  offlineBody: "Affichage des dernières fiches chargées.",
  offlineAction: "Réessayer",
  distance: "Distance",
  placeSearchTitle: "Rechercher par lieu",
  placeSearchLabel: "Localité, adresse ou coordonnées",
  placeSearchPlaceholder: "p. ex. Centre-ville, rue de la République ou 45.46420, 9.19000",
  placeSearchHelp:
    "Trouve les fiches publiques proches du lieu saisi. Un résultat n’est jamais la preuve qu’une zone est exempte de surveillance.",
  placeSearchSubmit: "Rechercher",
  placeSearchLoading: "Recherche des fiches publiques près de ce lieu…",
  placeSearchUnavailable: "La recherche est temporairement indisponible. Veuillez réessayer dans un instant.",
  placeSearchRateLimited: "Trop de recherches. Patientez un instant et réessayez.",
  placeSearchEmptyQuery: "Saisissez une localité, une adresse ou des coordonnées pour lancer la recherche.",
  placeClearResults: "Effacer les résultats",
  placeAreaLabel: (area: { kind: string; displayName?: string; radiusLabel: string; latitude: number; longitude: number }) =>
    area.kind === "place"
      ? `Zone de recherche : près de ${area.displayName} (dans un rayon de ${area.radiusLabel})`
      : `Zone de recherche : dans un rayon de ${area.radiusLabel} autour de ${area.latitude.toFixed(5)}, ${area.longitude.toFixed(5)}`,
  placeResultsFound: (count: number) =>
    `${count} ${count < 2 ? "fiche publique trouvée" : "fiches publiques trouvées"} près de ce lieu`,
  placeNotFoundTitle: "Nous n’avons pas trouvé ce lieu.",
  placeNotFoundBody: "Vérifiez l’orthographe, ou saisissez plutôt des coordonnées (latitude, longitude).",
  placeEmptyTitle: "Aucune fiche publiée n’a été trouvée dans cette zone.",
  placeEmptyBody:
    "Cela signifie seulement qu’aucune fiche publique de cette base de données ne se trouve dans la zone de recherche. Ce n’est pas la preuve qu’il n’y a pas de caméras.",
  placeEmptySubmit: "Envoyer un signalement",
  placeEmptyCoverage: "À propos des limites de couverture des données",
  // Data actions footer (t_b98b1734, CEO 2026-08-08): the CSV/GeoJSON
  // downloads live here as small text links next to the data policy link
  // (DirectoryTool — exportCsv/exportGeoJson, filter-aware); same row/font.
  readDataPolicy: "Lire la politique des données",
  recordId: "ID de la fiche",
  source: "Source",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Development seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Données d’exemple",
  communityReportSource: "Signalement communautaire",
  demoUpdated: "Données de démonstration",
  location: "Emplacement",
  unknown: "Inconnu",
  manufacturerLabel: "Fabricant",
  observedOnLabel: "Observée le",
  // Load failure (kanban t_e11080eb): the walk could not complete — a
  // transient API error (rate limit, network) must NEVER masquerade as "0
  // public records found". The directory shows this truthful error state
  // with a retry action instead of the empty state.
  loadErrorTitle: "Impossible de charger le répertoire.",
  loadErrorBody: "Les fiches publiques sont toujours là : il s’agit d’un problème temporaire de chargement. Réessayez, ou explorez la carte.",
  loadErrorRetry: "Réessayer",
};
