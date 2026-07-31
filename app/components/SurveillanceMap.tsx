"use client";

import { useEffect, useRef, useState } from "react";
import { isPublicStatus } from "../lib/public-status";
import { useMessages } from "./LocaleProvider";

export type MapCamera = { id: number; title: string; kind: string; status: string; latitude: number; longitude: number };
export type MapLocation = { latitude: number; longitude: number };
type Props = { cameras: MapCamera[]; selectedId: number; onSelect: (id: number) => void; onPick: (latitude: number, longitude: number) => void; focusLocation?: MapLocation | null };

export function SurveillanceMap({ cameras, selectedId, onSelect, onPick, focusLocation }: Props) {
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onPickRef = useRef(onPick);
  const focusLocationRef = useRef(focusLocation);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    focusLocationRef.current = focusLocation;
  }, [focusLocation]);

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
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; markersRef.current = null; };
  }, []);

  useEffect(() => {
    const L = leafletRef.current; const layer = markersRef.current; if (!L || !layer) return;
    layer.clearLayers();
    cameras.forEach((camera) => {
      // Defense in depth: only whitelisted public statuses may style a
      // marker; a non-public status renders a plain marker (the parent page
      // already filters through publicRecords(), this is a second gate).
      const statusClass = isPublicStatus(camera.status) ? camera.status : "";
      const marker = L.marker([camera.latitude, camera.longitude], { icon: L.divIcon({ className: "", html: `<span class="osm-camera-marker ${statusClass} ${camera.id === selectedId ? "selected" : ""}" aria-hidden="true"><i></i></span>`, iconSize: [28, 28], iconAnchor: [14, 14] }), title: camera.title });
      marker.bindTooltip(`${camera.title}<br/><small>${camera.kind}</small>`, { direction: "top", offset: [0, -12] }); marker.on("click", () => onSelect(camera.id)); marker.addTo(layer);
    });
  }, [cameras, selectedId, onSelect]);

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

  return <div className="map-region" id="map-region" role="region" aria-label={label} aria-describedby="map-accessibility-description" tabIndex={-1}>
    <p className="sr-only" id="map-accessibility-description">{description} <a href="#records">{directoryLink}</a>.</p>
    {mapUnavailable
      ? <div className="map-fallback" role="note"><p className="map-fallback-title">{fallbackTitle}</p><p>{fallbackBody}</p><p><a className="text-button" href="#records">{directoryLink} <span aria-hidden="true">→</span></a></p></div>
      : <div ref={mapElement} className="live-map" />}
  </div>;
}
