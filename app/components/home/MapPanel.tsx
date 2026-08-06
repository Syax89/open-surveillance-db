"use client";

import { useCallback, useEffect, useState } from "react";
import { SurveillanceMap } from "../SurveillanceMap";
import type { MapCamera } from "../SurveillanceMap";
import type { ViewportBounds } from "../../lib/map-viewport";
import type { Camera } from "../../lib/records";
import { useMessages } from "../../lib/use-messages";
import { useLocale } from "../LocaleProvider";
import { publicStatusLabel } from "../../lib/public-status";
import { popupHtmlFor } from "../../lib/map-popup";
import { fetchImportSources, importSourceOf, type ImportSourceInfo } from "../../lib/import-sources";
import { MapRecordList } from "./MapRecordList";

type Props = {
  /** Records after the directory filters are applied (map markers). */
  filteredRecords: Camera[];
  /** Records inside the current map viewport (sidebar list). */
  visibleRecords: Camera[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Empty-map click: starts a report flow for the chosen coordinates. */
  onPick: (latitude: number, longitude: number) => void;
  /** Position chosen from a deep link or place search: the map focuses it. */
  coordinates: { latitude: number; longitude: number } | null;
  selectedCamera?: Camera;
  loading: boolean;
  /** Page-level status notice, displayed under the map. */
  notice: string;
  /** Where the sr-only "accessible directory" alternative points (default: /directory tool route). */
  directoryHref?: string;
  /** Viewport→list sync: the map reports its current bounds (debounced). */
  onBoundsChange: (bounds: ViewportBounds) => void;
};

/**
 * Map tool workspace (F1 route group (tools), redesign t_702c10af;
 * integrated layout t_966254a1): the viewport-synced sidebar list + the
 * interactive map split, with loading notice. The tool page (MappaTool)
 * owns the single header and the FiltersBar row — this component renders
 * ONLY the split workspace, so /mappa has exactly one header and the map
 * gets the full remaining height. Used by /mappa; the home hub (F2)
 * renders only the static MapTeaser and never mounts this component (no
 * Leaflet on the hub). The download GeoJSON/CSV row moved to /directory
 * (CEO feedback 2026-08-02): the map tool no longer carries the data-export
 * footer — /directory owns the export row next to its text list.
 *
 * Layout: a scrollable left column (list of the points currently
 * framed by the map) and a near-fullscreen OSM map. The list is the
 * keyboard/text equivalent of the map: every row selects the marker (pan +
 * popup), and clicking a marker highlights its row (aria-current).
 *
 * Search and filters are kept above the map by MappaTool, leaving the sidebar
 * focused solely on the points in the current view. A compact, expandable
 * legend on the canvas explains the available interactions without obscuring
 * the map.
 * The map and the sidebar are ALWAYS rendered — a filter that matches
 * nothing never replaces the map with an empty state (the truthful "no
 * record matches" note lives inside the list).
 */
export function MapPanel({ filteredRecords, visibleRecords, selectedId, onSelect, onPick, coordinates, loading, notice, directoryHref = "/directory", onBoundsChange }: Props) {
  const t = useMessages().map;
  const statuses = useMessages().status;
  const { locale } = useLocale();

  // Map-first at every size: the points column starts compact and expands
  // only on demand. The deterministic initial state is hydration-safe and
  // gives the map the dominant visual area on desktop as well as mobile.
  const [pointsCollapsed, setPointsCollapsed] = useState<boolean>(true);

  // Popup content (t_702c10af): built by the shared lib/map-popup (escaped
  // + safe labels). Import provenance (FASE C, t_4dbce318): committed
  // batches fetched ONCE — the bottom line shows the readable source +
  // licence and the added date, never the raw 'import:<slug>'.
  const [sources, setSources] = useState<Map<string, ImportSourceInfo>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetchImportSources().then((map) => { if (!cancelled) setSources(map); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const popupHtmlForCamera = useCallback(
    (camera: MapCamera) => popupHtmlFor(camera, statuses, t, { provenance: importSourceOf(camera, sources), locale }),
    [statuses, t, sources, locale],
  );

  return (
    <>
      <div className={`live-map-workspace map-split${pointsCollapsed ? " map-points-collapsed" : " map-points-expanded"}`}>
        <aside className={`map-sidebar${pointsCollapsed ? " is-collapsed" : ""}`} aria-labelledby="map-list-title">
          <MapRecordList filteredRecords={filteredRecords} visibleRecords={visibleRecords} selectedId={selectedId} onSelect={onSelect} labels={t} statusLabel={(status) => publicStatusLabel(statuses, status, t.unknown)} collapsed={pointsCollapsed} onToggleCollapse={() => setPointsCollapsed((current) => !current)} />
        </aside>
        <div className="map-panel">
          <SurveillanceMap cameras={filteredRecords} selectedId={selectedId} focusLocation={coordinates} onSelect={onSelect} onPick={onPick} directoryHref={directoryHref} onBoundsChange={onBoundsChange} popupHtmlFor={popupHtmlForCamera} />
          <details className="map-legend">
            <summary>{t.mapLegendTitle}</summary>
            <div>
              <p>{t.mapLegendMove}</p>
              <p>{t.mapLegendMarker}</p>
              <p>{t.mapLegendFilters}</p>
              <p>{t.mapLegendList}</p>
              <p>{t.mapLegendAdd}</p>
              <a href="/segnala">{t.mapLegendReport} <span aria-hidden="true">→</span></a>
            </div>
          </details>
        </div>
      </div>
      {loading && <p className="loading-note">{t.loadingRecords}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    </>
  );
}
