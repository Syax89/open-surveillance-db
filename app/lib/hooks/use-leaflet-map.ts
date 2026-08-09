import { useEffect, useRef, useState } from "react";
import type { Map, LayerGroup, Marker } from "leaflet";
import { BOUNDS_DEBOUNCE_MS, type ViewportBounds } from "../map-viewport";

type UseLeafletMapParams = {
  onBoundsChange?: (bounds: ViewportBounds) => void;
  onMapClick: (latlng: { lat: number; lng: number }) => void;
  initialFocus?: { latitude: number; longitude: number } | null;
  geolocateLabel: string;
  onGeolocateClick: () => void;
};

type UseLeafletMapResult = {
  mapReady: boolean;
  mapZoom: number;
  leafletRef: React.RefObject<typeof import("leaflet") | null>;
  mapRef: React.RefObject<Map | null>;
  markersRef: React.RefObject<LayerGroup | null>;
  fovLayerRef: React.RefObject<LayerGroup | null>;
  userLayerRef: React.RefObject<LayerGroup | null>;
  geoButtonRef: React.RefObject<HTMLButtonElement | null>;
  mapUnavailable: boolean;
};

/**
 * useLeafletMap — create and manage the Leaflet map instance.
 *
 * Handles:
 * - Lazy import of Leaflet
 * - Map creation with tile layer
 * - Layer groups (markers, FOV, user location)
 * - Custom controls (zoom, geolocate button)
 * - Viewport bounds sync (debounced moveend/zoomend)
 * - Map click handler
 * - Cleanup on unmount
 */
export function useLeafletMap({
  onBoundsChange,
  onMapClick,
  initialFocus,
  geolocateLabel,
  onGeolocateClick,
}: UseLeafletMapParams): UseLeafletMapResult {
  const [mapReady, setMapReady] = useState(false);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapRef = useRef<Map | null>(null);
  const mapElement = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const fovLayerRef = useRef<LayerGroup | null>(null);
  const userLayerRef = useRef<LayerGroup | null>(null);
  const geoButtonRef = useRef<HTMLButtonElement | null>(null);
  const boundsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    async function createMap() {
      if (!mapElement.current || mapRef.current) return;

      try {
        // Lazy import Leaflet
        const L = await import("leaflet");
        if (disposed || !mapElement.current) return;

        leafletRef.current = L;
        const map = L.map(mapElement.current, { zoomControl: false, scrollWheelZoom: true })
          .setView([41.9028, 12.4964], 13);

        // Custom Geolocation Control
        const GeoLocateControl = L.Control.extend({
          options: { position: "bottomright" },
          onAdd() {
            const container = document.createElement("div");
            container.className = "leaflet-bar leaflet-control osm-geolocate";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "osm-geolocate-btn";
            button.setAttribute("aria-pressed", "false");
            button.setAttribute("aria-label", geolocateLabel);
            button.title = geolocateLabel;
            button.innerHTML =
              '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
            container.appendChild(button);
            geoButtonRef.current = button;

            // Hide if geolocation unsupported
            if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
              button.hidden = true;
            }

            // Click handler — stop propagation so map click doesn't fire
            button.addEventListener("click", (event) => {
              L.DomEvent.stopPropagation(event);
              event.stopPropagation?.();
              onGeolocateClick();
            });

            return container;
          },
        });

        // Add controls
        L.control.zoom({ position: "bottomright" }).addTo(map);
        new GeoLocateControl().addTo(map);

        // Tile layer via same-origin proxy
        L.tileLayer("/api/tiles/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &middot; <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>',
        }).addTo(map);

        // Layer groups
        markersRef.current = L.layerGroup().addTo(map);
        fovLayerRef.current = L.layerGroup().addTo(map);
        userLayerRef.current = L.layerGroup().addTo(map);

        // A11y: FOV geometry is decorative (aria-hidden)
        map.getPane?.("overlayPane")?.setAttribute?.("aria-hidden", "true");

        // Empty-map click handler
        map.on("click", (e) => {
          onMapClick(e.latlng);
        });

        // Bounds sync (debounced)
        const emitBounds = () => {
          if (!mapRef.current) return;
          const bounds = mapRef.current.getBounds();
          const next = {
            south: bounds.getSouth(),
            north: bounds.getNorth(),
            west: bounds.getWest(),
            east: bounds.getEast(),
          };
          onBoundsChange?.(next);
        };

        map.on("moveend zoomend", () => {
          setMapZoom(map.getZoom());
          if (boundsTimerRef.current !== null) window.clearTimeout(boundsTimerRef.current);
          boundsTimerRef.current = window.setTimeout(emitBounds, BOUNDS_DEBOUNCE_MS);
        });

        mapRef.current = map;
        setMapReady(true);

        // Initial focus
        if (initialFocus) {
          map.setView([initialFocus.latitude, initialFocus.longitude], 15, { animate: false });
        }

        // Size fix + initial bounds emit
        window.setTimeout(() => map.invalidateSize(), 100);
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
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
      fovLayerRef.current = null;
      userLayerRef.current = null;
      geoButtonRef.current = null;
      setMapReady(false);
    };
  }, [onBoundsChange, onMapClick, initialFocus, geolocateLabel, onGeolocateClick]);

  // Expose the map element ref setter
  useEffect(() => {
    const el = document.getElementById("surveillance-map");
    if (el) {
      mapElement.current = el as HTMLDivElement;
    }
  }, []);

  return {
    mapReady,
    mapZoom,
    leafletRef,
    mapRef,
    markersRef,
    fovLayerRef,
    userLayerRef,
    geoButtonRef,
    mapUnavailable,
  };
}
