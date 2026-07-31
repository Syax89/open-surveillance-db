"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./LocaleProvider";

export type MapCamera = { id: number; title: string; kind: string; status: string; latitude: number; longitude: number };
export type MapLocation = { latitude: number; longitude: number };
type Props = { cameras: MapCamera[]; selectedId: number; onSelect: (id: number) => void; onPick: (latitude: number, longitude: number) => void; focusLocation?: MapLocation | null };

export function SurveillanceMap({ cameras, selectedId, onSelect, onPick, focusLocation }: Props) {
  const { locale } = useLocale();
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
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
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
      const marker = L.marker([camera.latitude, camera.longitude], { icon: L.divIcon({ className: "", html: `<span class="osm-camera-marker ${camera.status} ${camera.id === selectedId ? "selected" : ""}" aria-hidden="true"><i></i></span>`, iconSize: [28, 28], iconAnchor: [14, 14] }), title: camera.title });
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
  const isItalian = locale === "it";
  const label = isItalian ? "Mappa interattiva OpenStreetMap" : "Interactive OpenStreetMap map";
  const description = isItalian
    ? "La mappa mostra gli stessi record pubblici dell'elenco accessibile sottostante. Puoi usare l'elenco per cercare, filtrare e aprire i record senza usare la mappa."
    : "The map shows the same public records as the accessible directory below. You can use the directory to search, filter, and open records without using the map.";
  const directoryLink = isItalian ? "Vai all'elenco accessibile" : "Go to the accessible directory";
  const fallbackTitle = isItalian ? "La mappa interattiva non è disponibile." : "The interactive map is unavailable.";
  const fallbackBody = isItalian
    ? "Puoi comunque cercare, filtrare e aprire ogni record pubblico dall'elenco accessibile sottostante, che funziona senza la mappa."
    : "You can still search, filter, and open every public record from the accessible directory below, which works without the map.";

  return <div className="map-region" id="map-region" role="region" aria-label={label} aria-describedby="map-accessibility-description" tabIndex={-1}>
    <p className="sr-only" id="map-accessibility-description">{description} <a href="#records">{directoryLink}</a>.</p>
    {mapUnavailable
      ? <div className="map-fallback" role="note"><p className="map-fallback-title">{fallbackTitle}</p><p>{fallbackBody}</p><p><a className="text-button" href="#records">{directoryLink} <span aria-hidden="true">→</span></a></p></div>
      : <div ref={mapElement} className="live-map" />}
  </div>;
}
