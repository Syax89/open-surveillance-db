"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPublicStatus } from "../lib/public-status";
import { BOUNDS_DEBOUNCE_MS, escapeHtml, type ViewportBounds } from "../lib/map-viewport";
import { markersForViewport } from "../lib/map-grid";
import { useMessages } from "../lib/use-messages";
import { isDomeKind } from "../lib/camera-kinds";
import { FOV_MIN_ZOOM, fovCircleRadiusMeters, fovPolygonPoints } from "../lib/field-of-view";
import { formatDirection } from "../lib/compass";
import { mountPopupActions, unmountPopupActions } from "../lib/popup-actions";

export type MapCamera = {
  id: number;
  title: string;
  kind: string;
  status: string;
  latitude: number;
  longitude: number;
  /**
   * Field-of-view bearing (migration 0035, t_1b08fe12): 0-359 clockwise
   * from north for DIRECTIONAL cameras; NULL/absent for domes (which are
   * never directional) and for unknown directions. The map draws a cone
   * from it, or a 360° circle for domes (t_f8b775ec).
   */
  direction?: number | null;
  /** Optional popup fields (present on real API records and the seed). */
  address?: string | null;
  description?: string;
  /**
   * Import provenance (FASE C, t_4dbce318): the raw source value
   * ('import:<slug>' for imported rows, 'Community report' for reports,
   * 'Prototype seed' for the offline demo seed). Present on real API
   * records and the seed; the popup provenance line resolves it.
   */
  source?: string;
  /** Creation date (ISO, `cameras.created_at`). Present on real API records. */
  createdAt?: string;
  /**
   * Community-action counts (ADR 0021 §10.2, FASE 3 UI): the popup action
   * widget renders them from the shared record payload. Optional — the
   * demo seed omits them and the widget falls back to zero.
   */
  usefulCount?: number;
  confirmCount?: number;
  goneCount?: number;
  problemCount?: number;
  privacyCount?: number;
};
export type MapLocation = { latitude: number; longitude: number };
type Props = {
  cameras: MapCamera[];
  selectedId: number;
  onSelect: (id: number) => void;
  onPick: (latitude: number, longitude: number) => void;
  focusLocation?: MapLocation | null;
  /** Where the sr-only "accessible directory" link points: home anchor (#records) or /directory. */
  directoryHref?: string;
  /**
   * Viewport→list sync (t_702c10af): called with the current bounds after
   * moveend/zoomend (debounced) and once after the map is created, so the
   * sidebar list always matches what the map frames. Debouncing is owned
   * here — a pan/zoom burst commits a single list update.
   */
  onBoundsChange?: (bounds: ViewportBounds) => void;
  /**
   * Popup content for a marker (t_702c10af). The parent page builds it with
   * the localized labels and the public-status label helper; the default is
   * a minimal escaped title+kind so the component stays usable standalone.
   */
  popupHtmlFor?: (camera: MapCamera) => string;
};

type LeafletModule = typeof import("leaflet");
type MarkerEntry = { marker: import("leaflet").Marker; camera: MapCamera };

function buildMarkerIcon(L: LeafletModule, camera: MapCamera, isSelected: boolean) {
  // Defense in depth: only whitelisted public statuses may style a
  // marker; a non-public status renders a plain marker (the parent page
  // already filters through publicRecords(), this is a second gate).
  const statusClass = isPublicStatus(camera.status) ? camera.status : "";
  return L.divIcon({
    className: "",
    html: `<span class="osm-camera-marker ${statusClass} ${isSelected ? "selected" : ""}" aria-hidden="true"><i></i></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * Grid-badge icon (t_26ce96f3): ONE divIcon per 48px screen cell showing
 * the record count instead of one divIcon per record. The badge is a real
 * interactive marker (Leaflet gives it role=button + tabindex + the title
 * below); the count is the visible text, the tooltip/aria-label carry the
 * same message for screen readers. Clicking zooms in toward the centroid
 * (see the marker-population effect).
 */
function buildGridBadgeIcon(L: LeafletModule, count: number) {
  return L.divIcon({
    className: "osm-grid-badge-wrap",
    html: `<span class="osm-grid-badge" aria-hidden="true">${count}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function defaultPopupHtml(camera: MapCamera): string {
  // Field-of-view direction (t_f8b775ec): even the minimal standalone
  // fallback keeps the direction as TEXT (the a11y contract — the cone is
  // decorative, the popup is the accessible source). Language-neutral:
  // wind name + degrees, no label needed.
  const direction =
    typeof camera.direction === "number" && Number.isFinite(camera.direction)
      ? ` · ${formatDirection(camera.direction)}`
      : "";
  return `<div class="osm-popup"><h3>${escapeHtml(camera.title)}</h3><p class="osm-popup-kind">${escapeHtml(camera.kind)}${direction}</p></div>`;
}

export function SurveillanceMap({ cameras, selectedId, onSelect, onPick, focusLocation, directoryHref = "#records", onBoundsChange, popupHtmlFor }: Props) {
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [offline, setOffline] = useState(false);
  // True once the lazy leaflet import has resolved and the layer group
  // exists. The marker-population effect below depends on it: at mount the
  // import is still in flight (leafletRef.current === null), so without
  // this flag a stable `cameras` array (prototype seed, unreachable API —
  // the realistic case) would make the effect early-return once and never
  // run again, leaving .leaflet-marker-pane empty while the sidebar shows
  // the same records (t_eb2e33a3 regression after #202).
  const [mapReady, setMapReady] = useState(false);
  // Viewport culling (QA#5 F3, t_ab0d4c75 — PM directive: ZERO new
  // libraries, no Leaflet.markercluster, no supercluster): only the records
  // inside the CURRENT map viewport (padded) get a marker. The full dataset
  // is never materialised as N DOM nodes — on a realistic civic DB
  // (thousands of cameras) rendering every record as a divIcon marker is
  // what degraded Leaflet pan/zoom and blew the DOM. The culled set is
  // recomputed on every moveend/zoomend (debounced, same cadence as the
  // sidebar list), so panning/zooming lazily loads exactly the markers the
  // user can see. Null = viewport not emitted yet: keep every marker (the
  // same contract as recordsInBounds, so the first paint is never blank).
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  // Field-of-view layer (t_f8b775ec): the cones/circles live in their own
  // layer group so they can be cleared/redrawn independently of the markers.
  // The group renders into Leaflet's overlayPane (z-index below the marker
  // pane), so the wedge/circle always sits UNDER the marker icon.
  const fovLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  // Current map zoom (t_f8b775ec): cones/circles are only drawn above
  // FOV_MIN_ZOOM (performance — the geometry is never materialised at
  // street-unreadable zooms). Kept in state so the FOV effect re-runs when
  // the user zooms across the threshold even if the bounds object identity
  // does not change.
  const [mapZoom, setMapZoom] = useState(13);
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markersByIdRef = useRef<Map<number, MarkerEntry> | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const onPickRef = useRef(onPick);
  const focusLocationRef = useRef(focusLocation);
  const selectedIdRef = useRef(selectedId);
  const prevSelectedIdRef = useRef(selectedId);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const popupHtmlForRef = useRef(popupHtmlFor);
  const pickPopupHtmlRef = useRef<(latitude: number, longitude: number) => string>(() => "");
  // Latest cameras for the popupopen handler: the map-creation effect runs
  // once and would otherwise close over the FIRST camera list (same pattern
  // as popupHtmlForRef — the popup mount needs the CURRENT counts).
  const camerasRef = useRef(cameras);
  const boundsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    focusLocationRef.current = focusLocation;
  }, [focusLocation]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);

  useEffect(() => {
    popupHtmlForRef.current = popupHtmlFor;
  }, [popupHtmlFor]);
  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  // Map-click report picker (t_6abb96ac): clicking empty map space opens a
  // popup with the click coordinates and a direct link to /segnala,
  // pre-filled with that position. Rebuilt whenever the locale changes,
  // read through a ref inside the map click handler (same pattern as
  // popupHtmlForRef). Coordinate strings come from toFixed(5) on numbers —
  // no user input, nothing to escape.
  const t = useMessages().map;
  useEffect(() => {
    const build = (latitude: number, longitude: number) => {
      const lat = latitude.toFixed(5);
      const lng = longitude.toFixed(5);
      const href = `/segnala?lat=${lat}&lng=${lng}`;
      return [
        `<div class="osm-popup">`,
        `<h3>${t.pickTitle}</h3>`,
        `<dl>`,
        `<div><dt>${t.pickCoordinates}</dt><dd>${lat}, ${lng}</dd></div>`,
        `</dl>`,
        `<p class="osm-popup-actions"><a href="${href}">${t.pickReportHere} <span aria-hidden="true">→</span></a></p>`,
        `</div>`,
      ].join("");
    };
    pickPopupHtmlRef.current = build;
  }, [t]);

  // Offline state: the tiles cannot load and the records are the last ones
  // the browser received. The map stays visible (the markers are already on
  // the page); a status notice explains why nothing refreshes. SSR-safe:
  // navigator is undefined on the server, so first paint never shows it.
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Viewport→list sync: read the current bounds and hand them to the parent
  // (the sidebar list) AND keep a local copy for marker culling (QA#5 F3).
  // Called debounced on moveend/zoomend and once after the map is created
  // so the list starts in sync with the initial view.
  const emitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const next = { south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() };
    onBoundsChangeRef.current?.(next);
    // Identity-guarded: a moveend burst during a pan emits the same
    // rectangle; skipping the state write avoids a pointless marker
    // rebuild (the culling effect keys on this object).
    setViewportBounds((current) => (
      current && current.south === next.south && current.north === next.north && current.west === next.west && current.east === next.east
        ? current
        : next
    ));
  }, []);

  useEffect(() => {
    let disposed = false;
    async function createMap() {
      if (!mapElement.current || mapRef.current) return;
      try {
        // The map bundle is loaded lazily. If it (or the tile layer) cannot
        // start — blocked script, offline tile host, runtime error — the map
        // must degrade to a visible text alternative instead of an empty box.
        const L = await import("leaflet");
        if (disposed || !mapElement.current) return;
        leafletRef.current = L;
        const map = L.map(mapElement.current, { zoomControl: false, scrollWheelZoom: true }).setView([41.9028, 12.4964], 13);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        // Tiles are served through the same-origin tile proxy
        // (/api/tiles/{z}/{x}/{y}.png, see docs/OSM_INTEGRATION.md): the
        // client never hotlinks a tile server directly, the upstream request
        // carries an identifying User-Agent and the end user's Referer, and
        // responses are cached server-side. The upstream provider is switched
        // with the TILE_PROVIDER_URL environment variable, no rebuild needed.
        L.tileLayer("/api/tiles/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &middot; <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>',
        }).addTo(map);
        markersRef.current = L.layerGroup().addTo(map);
        // Field-of-view layer (t_f8b775ec): separate group so the cones and
        // circles can be cleared/redrawn without touching the markers. The
        // default renderer draws paths into the overlayPane, which sits
        // BELOW the marker pane in Leaflet's z-index stack — the wedge is
        // always under the marker icon, never on top of it.
        fovLayerRef.current = L.layerGroup().addTo(map);
        // A11y (t_f8b775ec, PM directive): the FOV geometry is purely
        // decorative — the same information is available as TEXT inside the
        // marker popup (popupHtmlFor renders "Field of view: NE 45°" when a
        // direction exists). Marking the whole overlay pane aria-hidden
        // removes every path (cones AND circles) from the accessibility
        // tree; markers live in a separate pane and stay exposed.
        map.getPane?.("overlayPane")?.setAttribute?.("aria-hidden", "true");
        // Map-click report picker (t_6abb96ac): clicking empty map space
        // opens a popup with the click coordinates and a direct link to
        // /segnala?lat=&lng= (the pre-filled report form). The picker
        // complements onPick: onPick keeps its contract (nearby-check
        // start), the popup gives the click a visible, actionable outcome.
        map.on("click", (event) => {
          onPickRef.current(event.latlng.lat, event.latlng.lng);
          map.openPopup(pickPopupHtmlRef.current(event.latlng.lat, event.latlng.lng), event.latlng, {
            maxWidth: 300,
            minWidth: 220,
            className: "osm-camera-popup",
          });
        });
        // Community action widget mount (ADR 0021 §3, FASE 3 UI): when a
        // marker popup opens, render the compact widget into its mount node
        // (a separate React root — see lib/popup-actions). The pick popup
        // has no mount node and is skipped; popupclose unmounts the root so
        // a destroyed Leaflet popup never leaks a React tree.
        map.on("popupopen", (event: { popup?: { getElement?: () => HTMLElement | null } }) => {
          const content = event.popup?.getElement?.();
          const node = content?.querySelector?.(".osm-popup-community");
          if (!node) return;
          const raw = node.getAttribute("data-record-id");
          const id = raw ? Number(raw) : NaN;
          if (!Number.isInteger(id) || id <= 0) return;
          const camera = camerasRef.current.find((item) => item.id === id);
          if (!camera) return;
          try {
            mountPopupActions(node as HTMLElement, id, {
              like: camera.usefulCount,
              confirm: camera.confirmCount,
              gone: camera.goneCount,
              problem: camera.problemCount,
              privacy: camera.privacyCount,
            });
          } catch (error) {
            console.error("popup action widget mount failed", error);
          }
        });
        map.on("popupclose", () => unmountPopupActions());
        mapRef.current = map;
        // The layer group now exists: the marker-population effect can run
        // (it also depends on this flag, see the state declaration above).
        // Must be set AFTER markersRef so the effect never observes a ready
        // flag with a missing layer.
        setMapReady(true);
        // moveend fires after every pan/zoom settles; zoomend is redundant
        // with it in Leaflet but cheap to listen to as a belt-and-braces
        // trigger. The list refresh is debounced so a drag never spams it.
        map.on("moveend zoomend", () => {
          // Zoom is read synchronously (cheap) so the FOV layer can cross
          // the FOV_MIN_ZOOM threshold immediately; the bounds/list update
          // below stays debounced at its usual cadence.
          setMapZoom(map.getZoom());
          if (boundsTimerRef.current !== null) window.clearTimeout(boundsTimerRef.current);
          boundsTimerRef.current = window.setTimeout(emitBounds, BOUNDS_DEBOUNCE_MS);
        });
        const initialFocus = focusLocationRef.current;
        if (initialFocus) map.setView([initialFocus.latitude, initialFocus.longitude], 15, { animate: false });
        window.setTimeout(() => map.invalidateSize(), 100);
        // Initial viewport: the sidebar list must match the first frame.
        emitBounds();
      } catch {
        if (!disposed) setMapUnavailable(true);
      }
    }
    createMap();
    return () => {
      disposed = true;
      if (boundsTimerRef.current !== null) {
        window.clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = null;
      }
      mapRef.current?.remove(); mapRef.current = null; markersRef.current = null; fovLayerRef.current = null; markersByIdRef.current = null;
      // Reset the ready flag so a StrictMode remount (or any future
      // recreate) re-runs the population effect against the fresh layer
      // group — otherwise mapReady stays true, the deps do not change and
      // the new map would render with an empty marker pane again.
      setMapReady(false);
    };
  }, [emitBounds]);

  // Marker population depends on the camera list, the click handler, the
  // viewport culling rectangle and the CURRENT ZOOM (the grid-vs-individual
  // decision reads it) — NOT on the selection. Rebuilding every marker on
  // each selection change would recreate N Leaflet DOM nodes per click; the
  // selection is applied by the dedicated effect below.
  //
  // `mapReady` guards the first run: leaflet is imported lazily, so at
  // mount `leafletRef.current` is null and the effect must no-op; once the
  // map creation effect flips the flag, this effect re-runs and populates
  // the markers even when `cameras` never changes identity (prototype seed
  // with an unreachable/empty API — the t_eb2e33a3 marker-pane regression
  // after #202: the sidebar listed the records while .leaflet-marker-pane
  // stayed empty because the effect had early-returned before the import
  // resolved and no later render re-triggered it).
  //
  // t_26ce96f3 (CEO 2026-08-05, "visualizzazione lenta" with 7.374+
  // points): two changes over the QA#5 F3 culling.
  //
  //  VIEWPORT-FIRST — the OLD first paint materialised EVERY record: at
  //  mount viewportBounds is null, recordsInBounds(null) returns the full
  //  dataset and the effect created 7.374 divIcon DOM nodes before the
  //  first emitBounds culled them (measured: 7.378 nodes at z5, pan fell
  //  to ~6-14 fps). Now bounds === null renders an EMPTY pane: the first
  //  emitBounds arrives one frame after the map is created (end of
  //  createMap), so the wait is invisible, and the full dataset is NEVER
  //  materialised. The sidebar list keeps its "never blank" contract
  //  (recordsInBounds(records, null) — text, cheap).
  //
  //  PIXEL-GRID AGGREGATION — zero new libraries (PM directive): above the
  //  density threshold (or below GRID_MAX_ZOOM) markersForViewport buckets
  //  the visible records into 48px screen cells; each cell renders ONE
  //  badge divIcon with the count, and clicking it zooms in 2 levels toward
  //  the centroid (the rebuild then shows smaller cells or individual
  //  markers). Individual markers (popup + tooltip + click->select) render
  //  only when the visible set is small (<= MAX_INDIVIDUAL_MARKERS) or the
  //  zoom is high (>= GRID_MAX_ZOOM). No record is lost: every visible
  //  record lands in exactly one cell, and a deep-linked selectedId is
  //  ALWAYS rendered as an individual marker on top of the grid (see the
  //  selected-overlay block below), so ?focus=ID keeps its popup.
  useEffect(() => {
    const L = leafletRef.current; const layer = markersRef.current; if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    const byId = new Map<number, MarkerEntry>();
    // Viewport-first: never materialise the dataset before the first
    // bounds. (The sidebar list still shows everything via its own
    // recordsInBounds(records, null) call — text is cheap, DOM markers are
    // not.)
    if (!viewportBounds) {
      markersByIdRef.current = byId;
      return;
    }
    const { visible, cells, individual } = markersForViewport(cameras, viewportBounds, mapZoom);
    // Grid badges: one marker per aggregated cell. Clicking zooms in toward
    // the centroid (2 levels — enough to split the cell into readable
    // pieces or individual markers). The badge is a button (Leaflet
    // interactive marker: role=button + tabindex) whose aria-label/tooltip
    // carry the count; the visible text is the count itself.
    cells.forEach((cell) => {
      const marker = L.marker([cell.centroidLat, cell.centroidLng], {
        icon: buildGridBadgeIcon(L, cell.count),
        title: t.gridBadgeTooltip(cell.count),
      });
      marker.bindTooltip(t.gridBadgeTooltip(cell.count), { direction: "top", offset: [0, -16] });
      marker.on("click", () => {
        const map = mapRef.current;
        if (!map) return;
        map.setView([cell.centroidLat, cell.centroidLng], map.getZoom() + 2, { animate: true });
      });
      marker.addTo(layer);
      marker.getElement()?.setAttribute?.("aria-label", t.gridBadgeLabel(cell.count));
    });
    // Individual markers: only the records NOT aggregated into a multi-
    // record cell (single-record cells render directly). Popup opens on
    // marker click (Leaflet default) and carries the record info +
    // correction/detail links built by the parent page.
    individual.forEach((camera) => {
      const marker = L.marker([camera.latitude, camera.longitude], { icon: buildMarkerIcon(L, camera, false), title: camera.title });
      marker.bindTooltip(`${camera.title}<br/><small>${camera.kind}</small>`, { direction: "top", offset: [0, -12] });
      marker.bindPopup(popupHtmlForRef.current ? popupHtmlForRef.current(camera) : defaultPopupHtml(camera), {
        maxWidth: 300,
        minWidth: 220,
        className: "osm-camera-popup",
      });
      marker.on("click", () => onSelect(camera.id));
      marker.addTo(layer);
      byId.set(camera.id, { marker, camera });
    });
    // Deep-link contract (t_26ce96f3): the selected record is ALWAYS
    // rendered as an individual marker, even when the rest of the view is
    // aggregated into a grid cell — a ?focus=ID deep link must be visible
    // and its popup must open. (If the selection is inside a multi-record
    // cell, its badge would swallow the individual popup.)
    const selectedIdNow = selectedIdRef.current;
    if (selectedIdNow !== null && !byId.has(selectedIdNow)) {
      const camera = visible.find((item) => item.id === selectedIdNow);
      if (camera) {
        const marker = L.marker([camera.latitude, camera.longitude], { icon: buildMarkerIcon(L, camera, true), title: camera.title });
        marker.bindTooltip(`${camera.title}<br/><small>${camera.kind}</small>`, { direction: "top", offset: [0, -12] });
        marker.bindPopup(popupHtmlForRef.current ? popupHtmlForRef.current(camera) : defaultPopupHtml(camera), {
          maxWidth: 300,
          minWidth: 220,
          className: "osm-camera-popup",
        });
        marker.on("click", () => onSelect(camera.id));
        marker.addTo(layer);
        byId.set(camera.id, { marker, camera });
        if (focusLocationRef.current) marker.openPopup();
      }
    }
    markersByIdRef.current = byId;
    // Freshly built markers start unselected; re-apply the current
    // selection icon here so a rebuild (filter/directory change) keeps the
    // same selected marker even when selectedId itself did not change.
    // A URL focus deep link (?focus=ID) also opens the popup once the
    // marker exists, so the record's balloon is visible after the pan.
    // NOTE: prevSelectedIdRef is deliberately NOT updated here — it tracks
    // "the last id the selection effect processed". A rebuild may run in
    // the same commit as a selection change (the parent passes a fresh
    // array identity); resetting the ref here would make the selection
    // effect early-return and swallow the pan+popup. Icons stay correct in
    // both cases: the rebuild applies the current selection, the selection
    // effect re-applies it idempotently when it actually fires.
    const current = selectedIdRef.current;
    const entry = byId.get(current);
    if (entry) {
      entry.marker.setIcon(buildMarkerIcon(L, entry.camera, true));
      if (focusLocationRef.current) entry.marker.openPopup();
    }
  }, [cameras, onSelect, mapReady, viewportBounds, mapZoom, t]);

  // Field-of-view layer (t_f8b775ec): draw the camera's field of view with
  // native Leaflet only — a ~60°/35 m wedge (L.polygon, points computed by
  // field-of-view.ts trig) for directional cameras with a stored direction,
  // a 360° circle (L.circle) for domes. Performance contracts, same as the
  // marker culling: geometry is drawn ONLY above FOV_MIN_ZOOM and ONLY for
  // records inside the current viewport, so a city-wide zoom never
  // materialises hundreds of paths. The layer is decorative — the overlay
  // pane carries aria-hidden and the same information is textual inside the
  // marker popup (map-popup.ts renders "Field of view: NE 45°"). Colors
  // come from the status CSS classes (.fov-cone.<status>), never from JS.
  useEffect(() => {
    const L = leafletRef.current; const layer = fovLayerRef.current; if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    if (mapZoom < FOV_MIN_ZOOM) return;
    // t_26ce96f3 viewport-first: FOV geometry follows the SAME marker
    // contract (markersForViewport) — never materialise geometry for
    // records before the first bounds, and only for the records that are
    // actually rendered individually (at FOV_MIN_ZOOM=16 the grid is
    // inactive by construction: GRID_MAX_ZOOM=14 < 16).
    const { visible } = markersForViewport(cameras, viewportBounds, mapZoom);
    visible.forEach((camera) => {
      if (isDomeKind(camera.kind)) {
        // Dome: 360° vision — a circle around the marker (same radius as the
        // wedge, so both render at the same visual scale).
        L.circle([camera.latitude, camera.longitude], {
          radius: fovCircleRadiusMeters(),
          className: `fov-cone fov-circle ${camera.status}`,
          interactive: false,
          weight: 1,
          opacity: 0.55,
          fillOpacity: 0.3,
        }).addTo(layer);
      } else if (typeof camera.direction === "number" && Number.isFinite(camera.direction)) {
        // Directional camera with a known bearing: the cone points TOWARDS
        // the direction the camera looks (vertex on the marker).
        const points = fovPolygonPoints(camera.latitude, camera.longitude, camera.direction);
        L.polygon(points, {
          className: `fov-cone ${camera.status}`,
          interactive: false,
          weight: 1,
          opacity: 0.55,
          fillOpacity: 0.3,
        }).addTo(layer);
      }
    });
  }, [cameras, mapReady, viewportBounds, mapZoom]);

  // Selection: swap the `selected` class only on the previously and the
  // newly selected marker (two setIcon calls, no layer rebuild). When the
  // selection comes from the sidebar list (or a deep link) the marker is
  // panned into view and its popup opens — the reverse direction of the
  // marker click, which already selects + opens the popup natively.
  useEffect(() => {
    const L = leafletRef.current; const byId = markersByIdRef.current; if (!L || !byId) return;
    const prev = prevSelectedIdRef.current;
    if (prev === selectedId) return;
    const prevEntry = byId.get(prev);
    if (prevEntry) prevEntry.marker.setIcon(buildMarkerIcon(L, prevEntry.camera, false));
    const nextEntry = byId.get(selectedId);
    if (nextEntry) {
      nextEntry.marker.setIcon(buildMarkerIcon(L, nextEntry.camera, true));
      const map = mapRef.current;
      if (map) {
        const latlng = nextEntry.marker.getLatLng();
        if (!map.getBounds().contains(latlng)) map.panTo(latlng);
        nextEntry.marker.openPopup();
      }
    }
    prevSelectedIdRef.current = selectedId;
  }, [selectedId]);

  const focusLat = focusLocation?.latitude;
  const focusLng = focusLocation?.longitude;
  useEffect(() => {
    if (focusLat === undefined || focusLng === undefined || !mapRef.current) return;
    mapRef.current.setView(
      [focusLat, focusLng],
      Math.max(mapRef.current.getZoom(), 15),
      { animate: false },
    );
  }, [focusLat, focusLng]);
  const label = t.mapLabel;
  const description = t.mapDescription;
  const directoryLink = t.mapDirectoryLink;
  const fallbackTitle = t.mapFallbackTitle;
  const fallbackBody = t.mapFallbackBody;
  const offlineTitle = t.offlineTitle;
  const offlineBody = t.offlineBody;
  const offlineAction = t.offlineAction;

  return <div className="map-region" id="map-region" role="region" aria-label={label} aria-describedby="map-accessibility-description" tabIndex={-1}>
    <p className="sr-only" id="map-accessibility-description">{description} <a href={directoryHref}>{directoryLink}</a>.</p>
    {offline && <div className="offline-state" role="status"><b>{offlineTitle}.</b> {offlineBody} <button type="button" className="text-button" onClick={() => window.location.reload()}>{offlineAction} <span aria-hidden="true">→</span></button></div>}
    {mapUnavailable
      ? <div className="map-fallback" role="note"><p className="map-fallback-title">{fallbackTitle}</p><p>{fallbackBody}</p><p><a className="text-button" href={directoryHref}>{directoryLink} <span aria-hidden="true">→</span></a></p></div>
      : <div ref={mapElement} className="live-map" />}
  </div>;
}
