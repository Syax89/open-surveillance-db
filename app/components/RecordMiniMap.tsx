"use client";

import { useEffect, useRef } from "react";
import { isDomeKind } from "../lib/camera-kinds";
import { fovCircleRadiusMeters, fovPolygonPoints } from "../lib/field-of-view";
import { useMessages } from "../lib/use-messages";

/**
 * Record-page mini map (CEO 2026-08-07): a small, non-interactive Leaflet
 * map on /records/[id] showing WHERE the camera is and — for directional
 * kinds with a stored bearing — the field-of-view cone (or the 360° dome
 * circle), the same geometry the main /mappa draws (field-of-view.ts).
 *
 * Deliberately minimal:
 * - fixed zoom 17 (≥ FOV_MIN_ZOOM so the cone/circle is meaningful),
 * - no pan/drag/zoom controls: it is a read-only "you are here" display,
 * - decorative (role="img" + the same information is already textual in
 *   the record facts list — coordinates, direction), so no interactive
 *   popup/selection lifecycle is needed here.
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
        // Read-only display: no dragging, no scroll zoom, no zoom buttons —
        // it exists to show position + field of view, not to browse.
        map = L.map(container, {
          zoomControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          touchZoom: false,
          attributionControl: true,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
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
