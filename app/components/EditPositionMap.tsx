"use client";

import { useCallback, useEffect, useRef } from "react";
import { isDomeKind } from "../lib/camera-kinds";
import { fovBearingFromPoint, fovBearingPoint, fovCircleRadiusMeters, fovPolygonPoints } from "../lib/field-of-view";
import { useMessages } from "../lib/use-messages";

type Props = {
  /** The record's current camera position (always set once the form loads). */
  latitude: number;
  longitude: number;
  /** Map click / manual coordinate entry → the edit form's lat/lng state. */
  onPositionChange: (latitude: number, longitude: number) => void;
  /** Selected camera kind (canonical value) — drives the FOV shape. */
  kind: string;
  /** Bearing 0-359 or null ("don't know" / dome). */
  direction: number | null;
  /** Whether the contributor specified a bearing (vs "I don't know"). */
  directionKnown: boolean;
  /** setDirection from the edit form — the drag handle publishes to it. */
  setDirection: (value: number | null) => void;
};

/**
 * Edit-page position map (CEO 2026-08-08, kanban t_775c8400): a small
 * interactive Leaflet map on /records/[id]/edit that MOVES the record's
 * camera position. Same pattern and geometry as the /segnala ReportMiniMap
 * (click = position selection, field-of-view cone for directional kinds,
 * draggable round handle to re-aim the bearing) but pre-filled with the
 * record's stored position instead of starting at the national overview.
 *
 * Contract:
 *  - click = position change (rounded to 5-decimal precision, the project
 *    convention), NEVER an unsolicited popup;
 *  - tiles MUST go through the /api/tiles proxy (the record-page CSP is
 *    img-src 'self' — a direct tile.openstreetmap hotlink renders empty);
 *  - SSR-safe: Leaflet imports and mounts in an effect only, SSR emits just
 *    the container + help text; no matchMedia in initial state.
 *  - the manual coordinate fields below the map stay the accessible
 *    fallback: typing there moves the marker through onPositionChange.
 */
export function EditPositionMap({ latitude, longitude, onPositionChange, kind, direction, directionKnown, setDirection }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const t = useMessages().record;

  // Leaflet handlers are bound once and read the LATEST props through refs,
  // so the click/drag handlers never go stale across re-renders.
  const propsRef = useRef({ latitude, longitude, kind, direction, directionKnown });
  const onPositionChangeRef = useRef(onPositionChange);
  const setDirectionRef = useRef(setDirection);

  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const positionMarkerRef = useRef<import("leaflet").Marker | null>(null);
  const fovLayerRef = useRef<import("leaflet").Path | null>(null);
  const handleRef = useRef<import("leaflet").Marker | null>(null);
  const appliedShapeRef = useRef("");
  const appliedCoordsRef = useRef("");
  // A click on THIS map is its own source of truth for the position — the
  // map must NOT re-centre on the point it just received (it is already
  // there). Manual coordinate entry (external change) does re-centre.
  const selfPickedRef = useRef(false);

  const removeFov = useCallback(() => {
    const map = mapRef.current;
    if (map && fovLayerRef.current) {
      map.removeLayer(fovLayerRef.current);
      fovLayerRef.current = null;
    }
    if (map && handleRef.current) {
      map.removeLayer(handleRef.current);
      handleRef.current = null;
    }
  }, []);

  const applyLayers = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return; // Leaflet not mounted yet — the mount effect syncs when ready
    const { latitude: lat, longitude: lng, kind: kindNow, direction: dir, directionKnown: known } = propsRef.current;

    positionMarkerRef.current?.setLatLng([lat, lng]);

    const coordsKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const shapeKey = `${coordsKey}|${kindNow}|${known ? "known" : "unknown"}`;
    const dome = isDomeKind(kindNow);
    // Directional kinds draw the cone as soon as the bearing is known; domes
    // draw the 360° circle; unknown directions draw nothing (same rules as
    // /mappa and the report mini-map).
    const drawable = dome || known;

    if (appliedShapeRef.current !== shapeKey) {
      // Shape changed (position, kind or known-ness): rebuild the FOV layer.
      appliedShapeRef.current = shapeKey;
      removeFov();
      if (drawable) {
        if (dome) {
          fovLayerRef.current = L.circle([lat, lng], {
            radius: fovCircleRadiusMeters(),
            className: "fov-cone fov-circle active",
            interactive: false,
            weight: 1,
            opacity: 0.55,
            fillOpacity: 0.3,
          }).addTo(map);
        } else {
          const bearing = typeof dir === "number" && Number.isFinite(dir) ? dir : 0;
          fovLayerRef.current = L.polygon(fovPolygonPoints(lat, lng, bearing), {
            className: "fov-cone active",
            interactive: false,
            weight: 1,
            opacity: 0.55,
            fillOpacity: 0.3,
          }).addTo(map);
          // Rotation handle on the cone's centre line. bubblingMouseEvents
          // false keeps a click on the handle from reaching the map's
          // click-to-move handler.
          handleRef.current = L.marker(fovBearingPoint(lat, lng, bearing), {
            draggable: true,
            bubblingMouseEvents: false,
            icon: L.divIcon({
              className: "fov-rotate-handle-wrap",
              html: '<span class="fov-rotate-handle" aria-hidden="true"></span>',
              // 44 px hit area (visible disc 18 px) — WCAG 2.5.8 touch
              // target on a map handle without covering the cone.
              iconSize: [44, 44],
              iconAnchor: [22, 22],
            }),
          }).addTo(map);
          handleRef.current.on("drag", (event: import("leaflet").LeafletEvent) => {
            const target = event.target as import("leaflet").Marker;
            const point = target.getLatLng();
            const cam = propsRef.current;
            if (!point) return;
            const pointArr = point as unknown as [number, number];
            const pointLat = typeof point.lat === "number" ? point.lat : pointArr[0];
            const pointLng = typeof point.lng === "number" ? point.lng : pointArr[1];
            const bearing = fovBearingFromPoint(cam.latitude, cam.longitude, pointLat, pointLng);
            // Re-aim the cone in place immediately (no React round-trip
            // mid-drag), then publish the bearing to the form state.
            if (fovLayerRef.current) {
              (fovLayerRef.current as import("leaflet").Polygon).setLatLngs(fovPolygonPoints(cam.latitude, cam.longitude, bearing));
            }
            setDirectionRef.current(bearing);
          });
        }
      }
    } else if (drawable && !dome && fovLayerRef.current && handleRef.current) {
      // Same shape, bearing changed (slider or handle drag): re-aim in place.
      const bearing = typeof dir === "number" && Number.isFinite(dir) ? dir : 0;
      (fovLayerRef.current as import("leaflet").Polygon).setLatLngs(fovPolygonPoints(lat, lng, bearing));
      handleRef.current.setLatLng(fovBearingPoint(lat, lng, bearing));
    } else if (!drawable && (fovLayerRef.current || handleRef.current)) {
      // Bearing became unknown ("I don't know" checked): drop the cone.
      appliedShapeRef.current = shapeKey;
      removeFov();
    }

    // External position changes (manual coordinate entry) re-centre the map;
    // a point picked ON this map is already in view.
    if (appliedCoordsRef.current !== coordsKey) {
      appliedCoordsRef.current = coordsKey;
      if (selfPickedRef.current) {
        selfPickedRef.current = false;
      } else {
        map.setView([lat, lng], Math.max(map.getZoom(), 17));
      }
    }
  }, [removeFov]);

  // Keep the latest sync function reachable from the mount effect (which
  // runs once) without re-binding the map handlers. Assigned in the
  // no-deps effect below (never during render — react-compiler rule).
  const applyLayersRef = useRef(applyLayers);

  // Freshest props/callbacks + sync function for the once-bound Leaflet
  // handlers; runs after every render (no deps).
  useEffect(() => {
    propsRef.current = { latitude, longitude, kind, direction, directionKnown };
    onPositionChangeRef.current = onPositionChange;
    setDirectionRef.current = setDirection;
    applyLayersRef.current = applyLayers;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let map: import("leaflet").Map | null = null;

    void import("leaflet")
      .then((L) => {
        if (disposed || !containerRef.current) return;
        leafletRef.current = L;
        map = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
        // Start at the record's stored position (the form pre-fills it), at
        // the FOV-legibility zoom used by /mappa and the record mini-map.
        const { latitude: startLat, longitude: startLng } = propsRef.current;
        map.setView([startLat, startLng], 17);
        L.tileLayer("/api/tiles/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        mapRef.current = map;
        const mapInstance = map;
        // Position marker (issue #434): draggable — a drag moves the
        // camera position through the same path as a map click (rounded
        // 5-decimal). bubblingMouseEvents false keeps a drag/click on the
        // marker from also firing the map's click-to-move handler.
        positionMarkerRef.current = L.marker([startLat, startLng], {
          draggable: true,
          interactive: true,
          bubblingMouseEvents: false,
          icon: L.divIcon({
            className: "",
            html: '<span class="report-pick-marker" aria-hidden="true"><i></i></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        }).addTo(map);
        positionMarkerRef.current.on("dragend", (event: import("leaflet").LeafletEvent) => {
          const target = event.target as import("leaflet").Marker;
          const point = target.getLatLng();
          if (!point) return;
          const pointArr = point as unknown as [number, number];
          const pointLat = typeof point.lat === "number" ? point.lat : pointArr[0];
          const pointLng = typeof point.lng === "number" ? point.lng : pointArr[1];
          selfPickedRef.current = true;
          onPositionChangeRef.current(
            Math.round(pointLat * 1e5) / 1e5,
            Math.round(pointLng * 1e5) / 1e5,
          );
        });
        // Click = position change (CEO contract: never an unsolicited
        // popup). Rounded to 5-decimal precision — the report-flow
        // convention — so the stored position stays stable under float noise.
        map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          selfPickedRef.current = true;
          onPositionChangeRef.current(
            Math.round(event.latlng.lat * 1e5) / 1e5,
            Math.round(event.latlng.lng * 1e5) / 1e5,
          );
        });
        // Initial sync with the form's pre-filled state — the map exists
        // now, so applyLayers can run.
        applyLayersRef.current();
      })
      .catch(() => {
        // Leaflet failed to load: the manual coordinate fields remain the
        // usable path — the map is an enhancement, never a blocker.
      });

    return () => {
      disposed = true;
      mapRef.current = null;
      leafletRef.current = null;
      positionMarkerRef.current = null;
      fovLayerRef.current = null;
      handleRef.current = null;
      appliedShapeRef.current = "";
      appliedCoordsRef.current = "";
      map?.remove();
    };
    // Mount-only: applyLayersRef is the stable ref indirection to the
    // freshest sync (updated in the no-deps effect above).
  }, []);

  // Re-sync when the form state changes (position/kind → rebuild the FOV
  // shape; bearing/known-ness → re-aim or drop it in place).
  useEffect(() => {
    applyLayersRef.current();
  }, [latitude, longitude, kind]);
  useEffect(() => {
    applyLayersRef.current();
  }, [direction, directionKnown]);

  return (
    <div className="report-map-wrap">
      <div
        ref={containerRef}
        className="report-minimap"
        role="application"
        aria-label={t.editPositionMapAria}
        aria-describedby="edit-position-map-help"
      />
      <p className="report-map-help" id="edit-position-map-help">{t.editPositionHelp}</p>
    </div>
  );
}
