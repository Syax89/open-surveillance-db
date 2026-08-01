"use client";

import { useEffect, useRef, useState } from "react";
import { isPublicStatus } from "../lib/public-status";
import { useMessages } from "./LocaleProvider";

export type MapCamera = { id: number; title: string; kind: string; status: string; latitude: number; longitude: number };
export type MapLocation = { latitude: number; longitude: number };
type Props = {
  cameras: MapCamera[];
  selectedId: number;
  onSelect: (id: number) => void;
  onPick: (latitude: number, longitude: number) => void;
  focusLocation?: MapLocation | null;
  /** Where the sr-only "accessible directory" link points: home anchor (#records) or /directory. */
  directoryHref?: string;
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

export function SurveillanceMap({ cameras, selectedId, onSelect, onPick, focusLocation, directoryHref = "#records" }: Props) {
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

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    focusLocationRef.current = focusLocation;
  }, [focusLocation]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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
        map.on("click", (event) => onPickRef.current(event.latlng.lat, event.latlng.lng)); mapRef.current = map;
        const initialFocus = focusLocationRef.current;
        if (initialFocus) map.setView([initialFocus.latitude, initialFocus.longitude], 15, { animate: false });
        window.setTimeout(() => map.invalidateSize(), 100);
      } catch {
        if (!disposed) setMapUnavailable(true);
      }
    }
    createMap();
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; markersRef.current = null; markersByIdRef.current = null; };
  }, []);

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
      marker.bindTooltip(`${camera.title}<br/><small>${camera.kind}</small>`, { direction: "top", offset: [0, -12] }); marker.on("click", () => onSelect(camera.id)); marker.addTo(layer);
      byId.set(camera.id, { marker, camera });
    });
    markersByIdRef.current = byId;
    // Freshly built markers start unselected; re-apply the current
    // selection here so a rebuild (filter/directory change) keeps the
    // same selected marker even when selectedId itself did not change.
    const current = selectedIdRef.current;
    const entry = byId.get(current);
    if (entry) entry.marker.setIcon(buildMarkerIcon(L, entry.camera, true));
    prevSelectedIdRef.current = current;
  }, [cameras, onSelect]);

  // Selection: swap the `selected` class only on the previously and the
  // newly selected marker (two setIcon calls, no layer rebuild).
  useEffect(() => {
    const L = leafletRef.current; const byId = markersByIdRef.current; if (!L || !byId) return;
    const prev = prevSelectedIdRef.current;
    if (prev === selectedId) return;
    const prevEntry = byId.get(prev);
    if (prevEntry) prevEntry.marker.setIcon(buildMarkerIcon(L, prevEntry.camera, false));
    const nextEntry = byId.get(selectedId);
    if (nextEntry) nextEntry.marker.setIcon(buildMarkerIcon(L, nextEntry.camera, true));
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
  const t = useMessages().map;
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
