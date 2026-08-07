"use client";

import { useEffect, useRef } from "react";
import { isDomeKind } from "../lib/camera-kinds";
import { fovCircleRadiusMeters, fovPolygonPoints } from "../lib/field-of-view";
import { useMessages } from "../lib/use-messages";

/**
 * Record-page mini map (CEO 2026-08-07): a small Leaflet map on
 * /records/[id] showing WHERE the camera is and — for directional kinds
 * with a stored bearing — the field-of-view cone (or the 360° dome
 * circle), the same geometry the main /mappa draws (field-of-view.ts).
 *
 * Interactive (CEO follow-up 2026-08-07): the user wanted to be able to
 * pan and zoom the mini map, so dragging + zoom controls are enabled —
 * it is a real map, just smaller. It stays free of the popup/selection
 * machinery of /mappa: no record popups, no picker, no ?focus handling.
 *
 * Tiles MUST go through the /api/tiles proxy (same as SurveillanceMap):
 * the record page CSP is `img-src 'self'`, so a direct tile.openstreetmap
 * hotlink is blocked by the browser and the map renders as an empty
 * grey box with only the marker + FOV cone (reproduced live 2026-08-07).
 *
 * Hydration-safe: Leaflet is imported and mounted in an effect only
 * (same pattern as SurveillanceMap), so SSR emits just the container.
 */
export function RecordMiniMap({
  latitude,
  longitude,
  kind,
  direction,
  title,
}: {
  latitude: number;
  longitude: number;
  kind: string;
  direction?: number | null;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const t = useMessages().record;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let map: import("leaflet").Map | null = null;

    void import("leaflet")
      .then((L) => {
        if (disposed || !containerRef.current) return;
        // Interactive mini map: pan + zoom allowed (CEO request). The
        // record page has no map state to keep in sync, so the default
        // Leaflet interactions are fine as-is.
        map = L.map(container, {
          zoomControl: true,
          attributionControl: true,
        });
        // Same tile proxy as /mappa — the CSP (img-src 'self') blocks any
        // direct tile server hotlink, so the map would show no streets.
        L.tileLayer("/api/tiles/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        L.marker([latitude, longitude], { title }).addTo(map);

        // Field of view: same rules as the main map (field-of-view.ts) —
        // domes get a 360° circle, directional kinds with a bearing get the
        // ~60°/35 m cone, unknown directions draw nothing.
        if (isDomeKind(kind)) {
          L.circle([latitude, longitude], {
            radius: fovCircleRadiusMeters(),
            className: `fov-cone fov-circle ${"active"}`,
            interactive: false,
            weight: 1,
            opacity: 0.55,
            fillOpacity: 0.3,
          }).addTo(map);
        } else if (typeof direction === "number" && Number.isFinite(direction)) {
          L.polygon(fovPolygonPoints(latitude, longitude, direction), {
            className: "fov-cone active",
            interactive: false,
            weight: 1,
            opacity: 0.55,
            fillOpacity: 0.3,
          }).addTo(map);
        }

        map.setView([latitude, longitude], 17);
      })
      .catch(() => {
        // Leaflet failed to load: the facts list still carries the
        // coordinates and direction — nothing else to do.
      });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [latitude, longitude, kind, direction, title]);

  return (
    <div
      ref={containerRef}
      className="record-minimap"
      role="img"
      aria-label={t.positionOnMap}
    />
  );
}
