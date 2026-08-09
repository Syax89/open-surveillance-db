import { useCallback, useState } from "react";
import type { Map, LayerGroup } from "leaflet";

type GeolocationState = {
  active: boolean;
  notice: string;
};

type UseGeolocationResult = {
  geoNotice: string;
  toggleGeolocation: () => void;
};

/**
 * useGeolocation — manage user's position layer on the map.
 *
 * The floating button above zoom controls turns ON/OFF the user's position.
 * ON → ask browser for position (client-side ONLY, coordinate never leaves
 * browser), pan/zoom to it (zoom ≥15), draw accuracy circle + centered dot.
 * OFF → clear the layer. Errors show a discreet toast (role=status), never
 * crash. The button is hidden at creation when browser has no geolocation API.
 */
export function useGeolocation(
  mapRef: React.RefObject<Map | null>,
  leafletRef: React.RefObject<typeof import("leaflet") | null>,
  userLayerRef: React.RefObject<LayerGroup | null>,
  geoButtonRef: React.RefObject<HTMLButtonElement | null>,
  geoActiveRef: React.MutableRefObject<boolean>,
  labels: { geolocateError: string; geolocateDenied: string }
): UseGeolocationResult {
  const [geoNotice, setGeoNotice] = useState("");

  const toggleGeolocation = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layer = userLayerRef.current;
    if (!map || !L || !layer) return;

    // Turn OFF
    if (geoActiveRef.current) {
      layer.clearLayers();
      geoActiveRef.current = false;
      geoButtonRef.current?.setAttribute("aria-pressed", "false");
      setGeoNotice("");
      return;
    }

    // Turn ON
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoNotice(labels.geolocateError);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        layer.clearLayers();

        // Precision circle: radius = browser's accuracy estimate in meters
        // (min 5m so a 0/undefined estimate still renders)
        L.circle([latitude, longitude], {
          radius: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 25,
          className: "osm-user-accuracy",
          interactive: false,
          weight: 1.5,
          opacity: 0.55,
          fillOpacity: 0.15,
          color: "rgb(11 112 92)",
          fillColor: "rgb(11 112 92)",
        }).addTo(layer);

        // Centered dot — deliberately NOT a camera marker (distinct style)
        L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: "osm-user-location",
            html: '<span class="osm-user-dot" aria-hidden="true"></span>',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          keyboard: false,
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(layer);

        map.setView([latitude, longitude], Math.max(map.getZoom(), 15), { animate: true });
        geoActiveRef.current = true;
        geoButtonRef.current?.setAttribute("aria-pressed", "true");
        setGeoNotice("");
      },
      (error) => {
        // code 1 = PERMISSION_DENIED; codes 2/3 = unavailable/timeout
        const denied = error?.code === 1 || error?.code === error?.PERMISSION_DENIED;
        setGeoNotice(denied ? labels.geolocateDenied : labels.geolocateError);
        geoActiveRef.current = false;
        geoButtonRef.current?.setAttribute("aria-pressed", "false");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [mapRef, leafletRef, userLayerRef, geoButtonRef, geoActiveRef, labels]);

  return { geoNotice, toggleGeolocation };
}
