/**
 * map — FR translation. Parity-checked against the English pilot
 * bundle (../../map.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../map";

export const fr: Translation<typeof en> = {
  mapLabel: "Carte interactive OpenStreetMap",
  mapDescription:
    "La carte affiche les mêmes fiches publiques que l’annuaire accessible ci-dessous. Vous pouvez utiliser l’annuaire pour rechercher, filtrer et ouvrir les fiches sans passer par la carte.",
  mapDirectoryLink: "Aller à l’annuaire accessible",
  mapFallbackTitle: "La carte interactive n’est pas disponible.",
  mapFallbackBody:
    "Vous pouvez toujours rechercher, filtrer et ouvrir chaque fiche publique depuis l’annuaire accessible, qui fonctionne sans la carte.",
  // Page-level chrome (/mappa).
  pageTitle: "Carte interactive",
  pageIntro:
    "Explorez sur la carte les caméras publiques documentées. Utilisez les filtres pour affiner l’affichage ; chaque marqueur ouvre sa fiche publique. Une zone vide ne prouve jamais l’absence de caméras.",
  // F2 (QA#6): SSR Suspense fallback for the client tool body.
  loading: "Chargement de la carte…",
  // Map tool chrome (t_966254a1, t_11e38eab): no visible tool header — the
  // page starts directly with the map card. The h1 (pageTitle) stays in the
  // DOM as sr-only for a11y; the old "Explore documented cameras" section
  // heading, its coverage note and the "Live prototype" eyebrow were removed
  // with the duplicated header; pageIntro still covers the "an empty area
  // never proves absence" truthfulness contract (SSR metadata + a11y intro).
  // The prototype banner itself was removed (CEO feedback 2026-08-02) — the
  // map is no longer framed as a prototype.
  mapLegendTitle: "Comment utiliser la carte",
  mapLegendMove: "Faites glisser la carte ou utilisez les boutons + et − pour explorer une zone.",
  mapLegendMarker: "Sélectionnez un marqueur pour ouvrir la fiche publique.",
  mapLegendFilters: "Utilisez la recherche et les filtres au-dessus de la carte pour affiner les résultats.",
  mapLegendList: "Ouvrez le panneau latéral pour parcourir les points de la vue actuelle.",
  mapLegendAdd: "Cliquez sur un endroit vide de la carte pour y signaler une caméra.",
  // Field-of-view legend entry (usability Batch C2, P1#6): the shaded wedge/
  // circle drawn around directional cameras (lib/field-of-view) carries the
  // SAME fact the marker popup already states as "Field of view: NE 45°"
  // (fovDirection) — surfacing it here lets a sighted user learn what the
  // shape means without opening a popup first.
  mapLegendFov: "Un cône ou un cercle ombré autour d’un marqueur indique le champ de vision approximatif de la caméra.",
  // Grid-aggregation badge legend entry (usability Batch C2, P1#7): at low
  // zoom the numbered .osm-grid-badge replaces individual markers. The badge
  // itself already names its count (gridBadgeLabel/Tooltip/Zoom), but nothing
  // told the user that zooming in splits one badge into separate cameras.
  mapLegendGridBadge: "Un cercle numéroté regroupe plusieurs caméras à ce niveau de zoom : zoomez pour les voir une par une.",
  mapLegendReport: "Signaler une caméra",
  // Always-visible hint under the map (one line): the empty-click shortcut is
  // otherwise explained ONLY inside the collapsed-by-default .map-legend, so
  // a sighted user could miss it entirely. Deliberately SHORTER than
  // mapLegendAdd — a hint, not the full legend entry.
  mapClickHint: "Cliquez sur un endroit vide pour y commencer un signalement.",
  // Shareable viewport (?lat&lng&zoom): the "Copy link" toolbar button copies
  // the current URL (which carries the map's view) and confirms briefly.
  copyLink: "Copier le lien",
  copyLinkCopied: "Copié !",
  pickTitle: "Nouveau signalement",
  pickCoordinates: "Coordonnées",
  pickReportHere: "Signaler une caméra ici",
  recordId: "ID de la fiche",
  source: "Source",
  freshness: "Fraîcheur",
  location: "Emplacement",
  reportIssue: "Signaler un problème",
  loadingRecords: "Chargement de l’API des fiches publiques…",
  unknown: "Inconnu",
  apiUnavailable:
    "L’API publique est temporairement injoignable ; les points déjà chargés restent disponibles.",
  apiRateLimited: (seconds: number) =>
    `La carte suspend temporairement les nouvelles requêtes de données pour respecter la limite du service. Nouvel essai dans environ ${seconds} secondes ; les points déjà chargés restent disponibles.`,
  // Continental viewport: the API answers a decimated sample (one request).
  viewportDecimated:
    "Cette vue affiche un échantillon des caméras de la zone. Zoomez pour charger le détail complet.",
  // Truthful empty state (never a silent map).
  emptyTitle: "Aucune fiche publiée ne correspond à ces filtres.",
  emptyBody:
    "Cela ne signifie pas qu’il n’y a aucune caméra dans la zone. Vous pouvez réinitialiser les filtres, parcourir l’annuaire ou signaler une caméra observée depuis l’espace public.",
  clearSearch: "Effacer les filtres",
  offlineTitle: "Vous êtes hors ligne",
  offlineBody: "Affichage des dernières fiches chargées.",
  offlineAction: "Réessayer",
  // Map place search (privacy pass 2026-11): ONE purpose — find a place,
  // an address, coordinates or a record number. Nothing is sent while
  // typing; Enter (or the button) searches. Coordinates and "#123" are
  // resolved in the browser; only real place names reach our geocoder proxy.
  // Typing no longer filters the points (the directory search does that).
  listSearchLabel: "Trouver un lieu",
  listSearchPlaceholder: "Lieu, adresse, coordonnées ou #fiche",
  listSearchHelp:
    "Saisissez un lieu, une adresse, des coordonnées comme 41.9068, 12.4808, ou un numéro de fiche comme #6302, puis appuyez sur Entrée. Les résultats situés dans la vue actuelle de la carte s’affichent en premier.",
  listSearchButton: "Rechercher",
  // Visible caption under the field: the privacy promise, in plain words.
  listSearchCaption:
    "Rien n’est envoyé pendant la saisie. Les coordonnées et les numéros #fiche ne quittent jamais votre navigateur.",
  // Geocode autocomplete dropdown (t_b9666d09): the listbox under the
  // sidebar search field. Attribution is required by the ODbL for
  // Nominatim-derived place data (see docs/OSM_INTEGRATION.md §8).
  geocodeLabel: "Suggestions de lieux",
  geocodeNoResults: (query: string) => `Aucun résultat pour « ${query} »`,
  geocodeAttribution: "Lieux © contributeurs OpenStreetMap",
  geocodeUnavailable: "La recherche de lieux est temporairement indisponible.",
  geocodeRateLimited: (seconds: number) =>
    `La recherche de lieux a atteint sa limite de requêtes à court terme. Réessayez dans environ ${seconds} secondes ; les coordonnées et les numéros #fiche fonctionnent toujours.`,
  listTitle: "Points de la vue actuelle",
  // Points disclosure row (mobile, ID 2): the WHOLE header row is ONE button
  // carrying ONE compact label — the verb plus the current in-view count. The
  // zero/one/many wording is spelled here (dictionary function, never a
  // concatenation in the component), so a 320px row stays one short line.
  listShowCount: (count: number) => (count < 2 ? `Afficher ${count} point` : `Afficher ${count} points`),
  listHideCount: (count: number) => (count < 2 ? `Masquer ${count} point` : `Masquer ${count} points`),
  listMapSyncHelp: "La liste se met à jour quand vous déplacez ou zoomez la carte : zoomez pour la restreindre, dézoomez pour l’élargir.",
  listCount: (visible: number, total: number) =>
    visible === 0
      ? "Aucun point dans la vue actuelle"
      : visible === 1
        ? "Affichage du seul point de la vue actuelle"
        : visible === total
          ? `Affichage des ${visible} points de la vue actuelle`
          : `Affichage de ${visible} points sur ${total} dans la vue actuelle`,
  // Capped points list (perf): the list renders one page at a time; the
  // button appends the next page and a polite live region reports the
  // listed count. The heading count above always reports the full total.
  listShowMore: (next: number, remaining: number) =>
    next === remaining
      ? (remaining === 1 ? "Afficher le dernier point" : `Afficher les ${remaining} derniers points`)
      : `Afficher ${next} points de plus (${remaining} pas encore listés)`,
  listShownOf: (shown: number, total: number) => `${shown} points listés sur ${total} dans la vue actuelle`,
  listEmptyInView:
    "Aucun point documenté dans la vue actuelle. Déplacez la carte ou dézoomez pour explorer davantage.",
  // Marker popup (t_702c10af): opens on marker click with the record info
  // and its correction/detail links.
  popupDetail: "Ouvrir la fiche",
  // Field-of-view direction row in the marker popup (t_f8b775ec): the
  // textual, accessible equivalent of the decorative map cone.
  fovDirection: "Champ de vision",
  // Import provenance line in the marker popup (FASE C, t_4dbce318):
  // small secondary text at the bottom — the readable source (entity or
  // "Community report") with its licence, and the record's added date.
  popupAdded: "Ajoutée le",
  popupCommunityReport: "Signalement communautaire",
  // Pixel-grid aggregation badges (t_26ce96f3, CEO 2026-08-05): at low zoom
  // / high density the map renders one count badge per 48px screen cell
  // instead of thousands of DOM markers. The badge is a button with a
  // count; clicking it zooms in toward the cell centroid. The tooltip and
  // the aria-label carry the same message (the count is the badge text).
  gridBadgeLabel: (count: number) => `${count} caméras dans cette zone : zoomez pour les voir`,
  gridBadgeTooltip: (count: number) => `${count} caméras ici`,
  gridBadgeZoom: (count: number) => `${count} caméras : zoomez pour les voir une par une`,
  // Geolocation button (t_18259daa, CEO): a floating control stacked ABOVE
  // the zoom buttons shows the user's own position on the map. Everything
  // stays client-side — the position never leaves the browser (privacy by
  // design). aria-pressed carries the on/off state; the marker is a
  // precision dot + accuracy circle, never a camera marker.
  geolocateLabel: "Afficher ma position",
  geolocateDenied: "L’accès à la position a été refusé. Autorisez l’accès à la position et réessayez.",
  geolocateError: "Impossible de déterminer votre position. Réessayez.",
};
