"use client";

import { useCallback, useEffect, useRef } from "react";
import { isDomeKind } from "../../lib/camera-kinds";
import { fovBearingFromPoint, fovBearingPoint, fovCircleRadiusMeters, fovPolygonPoints } from "../../lib/field-of-view";
import { useMessages } from "../../lib/use-messages";

type ReportCoordinates = { latitude: number; longitude: number };

type Props = {
  /** Currently selected position (null until the contributor picks one). */
  coordinates: ReportCoordinates | null;
  /** Map click → selectCoordinates(lat, lng) in useReportFlow. */
  onSelect: (latitude: number, longitude: number) => void;
  /** Selected camera kind (canonical value) — drives the FOV shape. */
  kind: string;
  /** Bearing 0-359 or null ("non so" / dome). */
  direction: number | null;
  /** Whether the contributor specified a bearing (vs "I don't know"). */
  directionKnown: boolean;
  /** setDirection from useReportFlow — the drag handle publishes to it. */
  setDirection: (value: number | null) => void;
};

/**
 * Report mini-map (CEO 2026-08-08): a small Leaflet map inside the
 * /segnala step-1 location field. Click anywhere to pick the camera
 * position (the coordinate readout and the reverse-geocode prefill update
 * through useReportFlow.selectCoordinates); for directional kinds with a
 * known bearing it also draws the SAME field-of-view cone as /mappa
 * (field-of-view.ts) plus a draggable round handle on the cone's centre
 * line — dragging it re-aims the bearing and updates the form's direction
 * state (the compass slider below stays as the accessible fallback).
 *
 * Contract (task t_ebbe0ea3):
 *  - click = position selection, NEVER an unsolicited popup;
 *  - tiles MUST go through the /api/tiles proxy (the /segnala page CSP is
 *    img-src 'self', like the record page — a direct tile.openstreetmap
 *    hotlink renders an empty grey map);
 *  - SSR-safe: Leaflet imports and mounts in an effect only, SSR emits
 *    just the container + help text; no matchMedia in initial state.
 */
export function ReportMiniMap({ coordinates, onSelect, kind, direction, directionKnown, setDirection }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const t = useMessages().report;

  // Leaflet handlers are bound once and read the LATEST props through
  // refs, so the click/drag handlers never go stale across re-renders.
  const propsRef = useRef({ coordinates, kind, direction, directionKnown });
  const onSelectRef = useRef(onSelect);
  const setDirectionRef = useRef(setDirection);

  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const positionMarkerRef = useRef<import("leaflet").Marker | null>(null);
  // Path base type: a dome draws a Circle, a directional kind a Polygon.
  // setLatLngs is only reached in the polygon branches (dome excluded).
  const fovLayerRef = useRef<import("leaflet").Path | null>(null);
  const handleRef = useRef<import("leaflet").Marker | null>(null);
  // The FOV shape is rebuilt only when position/kind/known-ness changes;
  // bearing-only changes (slider, handle drag) update the layers in place
  // so the drag is never interrupted by a layer rebuild.
  const appliedShapeRef = useRef("");
  const appliedCoordsRef = useRef("");
  // A map click is its own source of truth for the position — the map
  // must NOT re-centre on the point it just received (it is already there).
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
    const { coordinates: pos, kind: kindNow, direction: dir, directionKnown: known } = propsRef.current;

    if (pos) {
      positionMarkerRef.current?.setLatLng([pos.latitude, pos.longitude]);
    }

    const coordsKey = pos ? `${pos.latitude.toFixed(6)},${pos.longitude.toFixed(6)}` : "none";
    const shapeKey = `${coordsKey}|${kindNow}|${known ? "known" : "unknown"}`;
    const dome = isDomeKind(kindNow);
    // Directional kinds draw the cone as soon as the contributor says the
    // bearing is known — at the slider's default bearing (0° = north) until
    // the handle is dragged or the slider moved (the form's hidden input
    // sends `direction ?? 0` the same way).
    const drawable = Boolean(pos) && (dome || known);

    if (appliedShapeRef.current !== shapeKey) {
      // Shape changed (position, kind or known-ness): rebuild the FOV layer.
      appliedShapeRef.current = shapeKey;
      removeFov();
      if (pos && drawable) {
        if (dome) {
          fovLayerRef.current = L.circle([pos.latitude, pos.longitude], {
            radius: fovCircleRadiusMeters(),
            className: "fov-cone fov-circle active",
            interactive: false,
            weight: 1,
            opacity: 0.55,
            fillOpacity: 0.3,
          }).addTo(map);
        } else {
          const bearing = typeof dir === "number" && Number.isFinite(dir) ? dir : 0;
          fovLayerRef.current = L.polygon(fovPolygonPoints(pos.latitude, pos.longitude, bearing), {
            className: "fov-cone active",
            interactive: false,
            weight: 1,
            opacity: 0.55,
            fillOpacity: 0.3,
          }).addTo(map);
          // Rotation handle on the cone's centre line. bubblingMouseEvents
          // false keeps a click on the handle from reaching the map's
          // click-to-select handler; Leaflet suppresses click after a drag
          // anyway, this covers the no-drag click.
          handleRef.current = L.marker(fovBearingPoint(pos.latitude, pos.longitude, bearing), {
            draggable: true,
            bubblingMouseEvents: false,
            icon: L.divIcon({
              className: "fov-rotate-handle-wrap",
              html: '<span class="fov-rotate-handle" aria-hidden="true"></span>',
              // 32 px hit area (visible disc 18 px) — a usable touch target
              // on a map handle without covering the cone.
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            }),
          }).addTo(map);
          handleRef.current.on("drag", (event: import("leaflet").LeafletEvent) => {
            const target = event.target as import("leaflet").Marker;
            const point = target.getLatLng();
            const cam = propsRef.current.coordinates;
            if (!cam || !point) return;
            // Normalise Leaflet LatLng ({lat,lng}) vs the plain array form.
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
    } else if (pos && drawable && !dome && fovLayerRef.current && handleRef.current) {
      // Same shape, bearing changed (slider or handle drag): re-aim in place.
      const bearing = typeof dir === "number" && Number.isFinite(dir) ? dir : 0;
      (fovLayerRef.current as import("leaflet").Polygon).setLatLngs(fovPolygonPoints(pos.latitude, pos.longitude, bearing));
      handleRef.current.setLatLng(fovBearingPoint(pos.latitude, pos.longitude, bearing));
    } else if (!drawable && (fovLayerRef.current || handleRef.current)) {
      // Bearing became unknown ("I don't know" checked): drop the cone.
      appliedShapeRef.current = shapeKey;
      removeFov();
    }

    // External position changes (deep link, manual coordinates) re-centre
    // the map; a point picked ON this map is already in view.
    if (pos && appliedCoordsRef.current !== coordsKey) {
      appliedCoordsRef.current = coordsKey;
      if (selfPickedRef.current) {
        selfPickedRef.current = false;
      } else {
        map.setView([pos.latitude, pos.longitude], Math.max(map.getZoom(), 17));
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
    propsRef.current = { coordinates, kind, direction, directionKnown };
    onSelectRef.current = onSelect;
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
        // National overview until a position is picked (the civic DB is
        // Italy-focused; clicking zooms into the chosen area).
        map.setView([42.5, 12.5], 5);
        L.tileLayer("/api/tiles/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        mapRef.current = map;
        // const alias: the closure below must see a non-null Map (the
        // outer `map` is `Map | null` and TS widens captured lets).
        const mapInstance = map;
        // Position marker: decorative feedback, interactive false so clicks
        // pass through to the click-to-select handler.
        positionMarkerRef.current = L.marker([0, 0], {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: '<span class="report-pick-marker" aria-hidden="true"><i></i></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        }).addTo(map);
        // Click = position selection (CEO contract: never an unsolicited
        // popup). No popup is ever opened on this map. The map may start
        // at the national overview (zoom 5) — a click there is too coarse
        // to see the result, so zoom into the picked point (≥ the FOV
        // legibility zoom used on /mappa and the record mini-map).
        map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          selfPickedRef.current = true;
          onSelectRef.current(event.latlng.lat, event.latlng.lng);
          mapInstance.setView([event.latlng.lat, event.latlng.lng], Math.max(mapInstance.getZoom(), 17));
        });
        // Initial sync with whatever the form already holds (deep link
        // prefill, etc.) — the map exists now, so applyLayers can run.
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
  // shape; bearing/known-ness → re-aim or drop it in place). The raw props
  // are read through propsRef inside applyLayers, so these deps are the
  // change triggers, not the values the sync closure depends on.
  useEffect(() => {
    applyLayersRef.current();
  }, [coordinates, kind]);
  useEffect(() => {
    applyLayersRef.current();
  }, [direction, directionKnown]);

  return (
    <div className="report-map-wrap">
      <div
        ref={containerRef}
        className="report-minimap"
        role="application"
        aria-label={t.mapAria}
        aria-describedby="report-map-help"
      />
      <p className="report-map-help" id="report-map-help">{t.mapHelp}</p>
    </div>
  );
}
