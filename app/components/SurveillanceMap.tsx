"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPublicStatus } from "../lib/public-status";
import { BOUNDS_DEBOUNCE_MS, escapeHtml } from "../lib/map-viewport";
import type { ViewportBounds } from "../lib/map-viewport";
import { useMessages } from "./LocaleProvider";

export type MapCamera = {
  id: number;
  title: string;
  kind: string;
  status: string;
  latitude: number;
  longitude: number;
  /** Optional popup fields (present on real API records and the seed). */
  address?: string | null;
  description?: string;
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

function defaultPopupHtml(camera: MapCamera): string {
  return `<div class="osm-popup"><h3>${escapeHtml(camera.title)}</h3><p class="osm-popup-kind">${escapeHtml(camera.kind)}</p></div>`;
}

export function SurveillanceMap({ cameras, selectedId, onSelect, onPick, focusLocation, directoryHref = "#records", onBoundsChange, popupHtmlFor }: Props) {
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [offline, setOffline] = useState(false);
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
  // (the sidebar list). Called debounced on moveend/zoomend and once after
  // the map is created so the list starts in sync with the initial view.
  const emitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    onBoundsChangeRef.current?.({ south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() });
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
        mapRef.current = map;
        // moveend fires after every pan/zoom settles; zoomend is redundant
        // with it in Leaflet but cheap to listen to as a belt-and-braces
        // trigger. The list refresh is debounced so a drag never spams it.
        map.on("moveend zoomend", () => {
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
      mapRef.current?.remove(); mapRef.current = null; markersRef.current = null; markersByIdRef.current = null;
    };
  }, [emitBounds]);

  // Marker population depends only on the camera list and the click
  // handler — NOT on the selection. Rebuilding every marker on each
  // selection change would recreate N Leaflet DOM nodes per click; the
  // selection is applied by the dedicated effect below.
  useEffect(() => {
    const L = leafletRef.current; const layer = markersRef.current; if (!L || !layer) return;
    layer.clearLayers();
    const byId = new Map<number, MarkerEntry>();
    cameras.forEach((camera) => {
      const marker = L.marker([camera.latitude, camera.longitude], { icon: buildMarkerIcon(L, camera, false), title: camera.title });
      marker.bindTooltip(`${camera.title}<br/><small>${camera.kind}</small>`, { direction: "top", offset: [0, -12] });
      // Popup opens on marker click (Leaflet default) and carries the
      // record info + correction/detail links built by the parent page.
      marker.bindPopup(popupHtmlForRef.current ? popupHtmlForRef.current(camera) : defaultPopupHtml(camera), {
        maxWidth: 300,
        minWidth: 220,
        className: "osm-camera-popup",
      });
      marker.on("click", () => onSelect(camera.id));
      marker.addTo(layer);
      byId.set(camera.id, { marker, camera });
    });
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
  }, [cameras, onSelect]);

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
