import { useEffect } from "react";
import type { LayerGroup } from "leaflet";
import { recordsInBounds, type ViewportBounds } from "../map-viewport";
import { FOV_MIN_ZOOM, fovCircleRadiusMeters, fovPolygonPoints } from "../field-of-view";
import { isDomeKind } from "../camera-kinds";
import type { MapCamera } from "../../components/SurveillanceMap";

type UseFOVLayerParams = {
  cameras: MapCamera[];
  viewportBounds: ViewportBounds | null;
  mapZoom: number;
  mapReady: boolean;
  leafletRef: React.RefObject<typeof import("leaflet") | null>;
  fovLayerRef: React.RefObject<LayerGroup | null>;
};

/**
 * useFOVLayer — draw field-of-view geometry (cones/circles).
 *
 * Performance contract: FOV is drawn ONLY above FOV_MIN_ZOOM (z12) and ONLY
 * for records inside the current viewport, so a city-wide zoom never
 * materialises geometry for thousands of records.
 *
 * Directional cameras with a stored direction → ~60° wedge polygon.
 * Domes (no direction) → 360° circle (35m radius).
 */
export function useFOVLayer({
  cameras,
  viewportBounds,
  mapZoom,
  mapReady,
  leafletRef,
  fovLayerRef,
}: UseFOVLayerParams): void {
  useEffect(() => {
    const L = leafletRef.current;
    const layer = fovLayerRef.current;
    if (!L || !layer || !mapReady) return;

    layer.clearLayers();

    // Only draw FOV above min zoom
    if (mapZoom < FOV_MIN_ZOOM || !viewportBounds) return;

    // Only draw for visible records
    const visible = recordsInBounds(cameras, viewportBounds);

    visible.forEach((camera) => {
      const { latitude, longitude, direction, kind } = camera;

      if (isDomeKind(kind)) {
        // Dome: 360° circle
        L.circle([latitude, longitude], {
          radius: fovCircleRadiusMeters(),
          className: "osm-fov-circle",
          interactive: false,
          weight: 1.5,
          opacity: 0.3,
          fillOpacity: 0.08,
          color: "rgb(226 117 29)",
          fillColor: "rgb(226 117 29)",
        }).addTo(layer);
      } else if (direction != null) {
        // Directional: wedge polygon
        const points = fovPolygonPoints(latitude, longitude, direction);
        L.polygon(points, {
          className: "osm-fov-wedge",
          interactive: false,
          weight: 1.5,
          opacity: 0.3,
          fillOpacity: 0.08,
          color: "rgb(226 117 29)",
          fillColor: "rgb(226 117 29)",
        }).addTo(layer);
      }
    });
  }, [cameras, viewportBounds, mapZoom, mapReady, leafletRef, fovLayerRef]);
}
