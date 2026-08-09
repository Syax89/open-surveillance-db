import { useEffect, useRef } from "react";
import type { LayerGroup, Marker } from "leaflet";
import { markersForViewport } from "../map-grid";
import { type ViewportBounds } from "../map-viewport";
import type { MapCamera } from "../../components/SurveillanceMap";

type UseMarkerLayerParams = {
  cameras: MapCamera[];
  selectedId: number | null;
  viewportBounds: ViewportBounds | null;
  mapZoom: number;
  mapReady: boolean;
  onSelect: (id: number) => void;
  leafletRef: React.RefObject<typeof import("leaflet") | null>;
  mapRef: React.RefObject<import("leaflet").Map | null>;
  markersRef: React.RefObject<LayerGroup | null>;
  popupHtmlFor: (camera: MapCamera) => string;
  directoryHref: string;
  labels: {
    gridBadgeTitle: (count: number) => string;
  };
};

/**
 * useMarkerLayer — populate and reconcile the marker layer.
 *
 * The heavy lifter: computes the desired marker set (grid badges + individual
 * markers) from viewport + zoom, diffs against existing markers, keeps/adds/
 * removes only what changed. Open popups survive rebuilds as long as their
 * record stays in the desired set (zero close/reopen, zero widget resets).
 *
 * Complexity: 211 lines in the original. This version keeps the same logic
 * but extracts helper functions for readability.
 */
export function useMarkerLayer({
  cameras,
  selectedId,
  viewportBounds,
  mapZoom,
  mapReady,
  onSelect,
  leafletRef,
  mapRef,
  markersRef,
  popupHtmlFor,
  directoryHref,
  labels,
}: UseMarkerLayerParams): void {
  const rebuildingRef = useRef(false);
  const activePopupIdRef = useRef<number | null>(null);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = markersRef.current;
    const map = mapRef.current;
    if (!L || !layer || !map || !mapReady) return;

    rebuildingRef.current = true;

    try {
      // 1) Compute desired set: grid badges + individual markers
      const desiredBadges = new Map<string, { lat: number; lng: number; count: number }>();
      const desiredMarkers = new Map<number, MapCamera>();
      let visible: MapCamera[] = [];

      if (viewportBounds) {
        const viewport = markersForViewport(cameras, viewportBounds, mapZoom);
        visible = viewport.visible;
        const { cells, individual } = viewport;

        cells.forEach((cell) =>
          desiredBadges.set(`${cell.x}:${cell.y}`, {
            lat: cell.centroidLat,
            lng: cell.centroidLng,
            count: cell.count,
          })
        );

        individual.forEach((cam) => desiredMarkers.set(cam.id, cam));
      }

      // Add selected overlay if selected record is out of view
      if (selectedId != null && !desiredMarkers.has(selectedId)) {
        const selected = cameras.find((c) => c.id === selectedId);
        if (selected) desiredMarkers.set(selected.id, selected);
      }

      // 2) Reconcile: diff existing vs desired
      const existingBadges = new Map<string, Marker>();
      const existingMarkers = new Map<number, { marker: Marker; camera: MapCamera }>();

      layer.eachLayer((m) => {
        const marker = m as Marker & { __osm_badge_key?: string; __osm_camera_id?: number };
        if (marker.__osm_badge_key) {
          existingBadges.set(marker.__osm_badge_key, marker);
        } else if (marker.__osm_camera_id != null) {
          const camera = cameras.find((c) => c.id === marker.__osm_camera_id);
          if (camera) existingMarkers.set(marker.__osm_camera_id, { marker, camera });
        }
      });

      // Remove badges no longer in desired set
      existingBadges.forEach((marker, key) => {
        if (!desiredBadges.has(key)) {
          layer.removeLayer(marker);
        }
      });

      // Remove markers no longer in desired set
      existingMarkers.forEach(({ marker }, id) => {
        if (!desiredMarkers.has(id)) {
          if (marker.isPopupOpen()) {
            activePopupIdRef.current = id; // Remember for restoration
          }
          layer.removeLayer(marker);
        }
      });

      // Add new badges
      desiredBadges.forEach((badge, key) => {
        if (!existingBadges.has(key)) {
          const icon = buildGridBadgeIcon(L, badge.count);
          const marker = L.marker([badge.lat, badge.lng], {
            icon,
            title: labels.gridBadgeTitle(badge.count),
            alt: labels.gridBadgeTitle(badge.count),
            keyboard: true,
          }) as Marker & { __osm_badge_key?: string };
          marker.__osm_badge_key = key;

          marker.on("click keydown", (event) => {
            const isKey = event.type === "keydown";
            if (isKey) {
              const key = (event as any).originalEvent?.key;
              if (key !== "Enter" && key !== " ") return;
              event.originalEvent?.preventDefault?.();
            }
            L.DomEvent.stopPropagation(event as any);
            // Zoom in toward centroid
            map.setView([badge.lat, badge.lng], Math.min(map.getZoom() + 2, 19), { animate: true });
          });

          layer.addLayer(marker);
        }
      });

      // Add new markers
      desiredMarkers.forEach((camera) => {
        const existing = existingMarkers.get(camera.id);

        if (!existing) {
          const isSelected = camera.id === selectedId;
          const icon = buildMarkerIcon(L, camera, isSelected);
          const marker = L.marker([camera.latitude, camera.longitude], {
            icon,
            title: camera.title,
            alt: camera.title,
            keyboard: true,
            zIndexOffset: isSelected ? 1000 : 0,
          }) as Marker & { __osm_camera_id?: number };
          marker.__osm_camera_id = camera.id;

          marker.bindPopup(popupHtmlFor(camera), {
            maxWidth: popupMaxWidth(),
            className: "osm-popup",
            keepInView: true,
            autoPanPadding: [48, 48],
          });

          marker.on("keydown", (event: any) => {
            const key = event.originalEvent?.key;
            if (key !== "Enter" && key !== " ") return;
            L.DomEvent.stopPropagation(event);
            event.originalEvent?.preventDefault?.();
            onSelect(camera.id);
            if (!marker.isPopupOpen()) marker.openPopup();
          });

          marker.on("click", (event: any) => {
            L.DomEvent.stopPropagation(event);
            onSelect(camera.id);
            if (!marker.isPopupOpen()) marker.openPopup();
          });

          marker.on("popupopen", () => {
            activePopupIdRef.current = camera.id;
            const popupElement = marker.getPopup()?.getElement();
            if (popupElement) {
              const mountNode = popupElement.querySelector(".osm-popup-actions-mount");
              if (mountNode) {
                mountPopupActions(mountNode as HTMLElement, camera.id);
              }
            }
          });

          marker.on("popupclose", () => {
            if (activePopupIdRef.current === camera.id) {
              activePopupIdRef.current = null;
            }
            unmountPopupActions();
          });

          layer.addLayer(marker);

          // Open popup if this is the selected record
          if (isSelected && selectedId != null) {
            marker.openPopup();
          }
        } else {
          // Update existing marker icon if selection changed
          const isSelected = camera.id === selectedId;
          const currentlySelected = existing.marker.options.zIndexOffset === 1000;
          if (isSelected !== currentlySelected) {
            existing.marker.setIcon(buildMarkerIcon(L, camera, isSelected));
            existing.marker.setZIndexOffset(isSelected ? 1000 : 0);
          }
        }
      });

      // Restore popup if record came back into view
      if (activePopupIdRef.current != null) {
        const restoreEntry = existingMarkers.get(activePopupIdRef.current);
        if (restoreEntry && !restoreEntry.marker.isPopupOpen()) {
          restoreEntry.marker.openPopup();
        }
      }
    } finally {
      rebuildingRef.current = false;
    }
  }, [cameras, selectedId, viewportBounds, mapZoom, mapReady, onSelect, leafletRef, mapRef, markersRef, popupHtmlFor, directoryHref, labels]);
}

// Helper: build grid badge icon
function buildGridBadgeIcon(L: typeof import("leaflet"), count: number) {
  return L.divIcon({
    className: "osm-grid-badge-wrap",
    html: `<span class="osm-grid-badge" role="button" aria-label="${count} cameras"><b>${count}</b></span>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

// Helper: build marker icon
function buildMarkerIcon(L: typeof import("leaflet"), camera: MapCamera, isSelected: boolean) {
  const statusClass = `status-${camera.status}`;
  return L.divIcon({
    className: "",
    html: `<span class="osm-camera-marker ${statusClass} ${isSelected ? "selected" : ""}" aria-hidden="true"><i></i></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Helper: popup max width
function popupMaxWidth(): number {
  return typeof window !== "undefined" && window.innerWidth < 480 ? window.innerWidth - 48 : 360;
}

// Import popup actions helpers
import { mountPopupActions, unmountPopupActions } from "../popup-actions";
