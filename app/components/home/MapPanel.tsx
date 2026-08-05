"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurveillanceMap } from "../SurveillanceMap";
import type { MapCamera } from "../SurveillanceMap";
import type { ViewportBounds } from "../../lib/map-viewport";
import type { Camera } from "../../lib/records";
import { useMessages } from "../../lib/use-messages";
import { useLocale } from "../LocaleProvider";
import { publicStatusLabel } from "../../lib/public-status";
import { popupHtmlFor } from "../../lib/map-popup";
import { fetchImportSources, importSourceOf, type ImportSourceInfo } from "../../lib/import-sources";
import { GeocodeSearch } from "./GeocodeSearch";
import type { GeocodeSuggestion } from "./GeocodeSearch";
import { MapRecordList } from "./MapRecordList";

type Props = {
  /** Records after the directory filters are applied (map markers). */
  filteredRecords: Camera[];
  /** Records inside the current map viewport (sidebar list). */
  visibleRecords: Camera[];
  selectedId: number;
  onSelect: (id: number) => void;
  /** Map click / pick: starts the report-flow nearby check. */
  onPick: (latitude: number, longitude: number) => void;
  /** Position chosen for a report (or ?focus= deep link): the map focuses it. */
  coordinates: { latitude: number; longitude: number } | null;
  selectedCamera?: Camera;
  loading: boolean;
  /** Page-level status notice, displayed under the map. */
  notice: string;
  /** Where the sr-only "accessible directory" alternative points (default: /directory tool route). */
  directoryHref?: string;
  /** Instant search input value (same ?q= filter state as the FiltersBar). */
  search: string;
  setSearch: (value: string) => void;
  /** Viewport→list sync: the map reports its current bounds (debounced). */
  onBoundsChange: (bounds: ViewportBounds) => void;
  /**
   * The map's current bounds (MappaTool state). Used to tell when a
   * geocode-selection pan has actually landed: the "focus first point"
   * effect consumes the pending flag only after the bounds object CHANGES
   * following the selection — a mere identity churn of the records arrays
   * (filter re-render) must not consume it early.
   */
  viewportBounds: ViewportBounds | null;
  /** Clear every filter — the in-list "Clear filters" action (t_b9666d09). */
  onReset?: () => void;
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
 * Layout: a scrollable left column (search + list of the points currently
 * framed by the map) and a near-fullscreen OSM map. The list is the
 * keyboard/text equivalent of the map: every row selects the marker (pan +
 * popup), and clicking a marker highlights its row (aria-current).
 *
 * The sidebar search is DUAL-FUNCTION (t_b9666d09): GeocodeSearch filters
 * the viewport points by title/address/type (as before) AND, while typing,
 * suggests places through the same-origin Nominatim geocoder (/api/geocode)
 * in an ARIA combobox below the field. Selecting a suggestion pans the map
 * to the place (map.setView at ≥ zoom 15, via placeFocus feeding
 * SurveillanceMap's focusLocation effect), the list then follows the new
 * viewport bounds, and the first point in view is selected when one exists.
 * The map and the sidebar are ALWAYS rendered — a filter that matches
 * nothing never replaces the map with an empty state (the truthful "no
 * record matches" note lives inside the list).
 */
export function MapPanel({ filteredRecords, visibleRecords, selectedId, onSelect, onPick, coordinates, loading, notice, directoryHref = "/directory", search, setSearch, onBoundsChange, viewportBounds, onReset }: Props) {
  const t = useMessages().map;
  const statuses = useMessages().status;
  const { locale } = useLocale();

  // Pan target chosen from the dropdown: overrides the ?focus= coordinates
  // while set (both feed SurveillanceMap's focusLocation effect, which does
  // setView([lat,lng], max(zoom, 15))).
  const [placeFocus, setPlaceFocus] = useState<{ latitude: number; longitude: number } | null>(null);
  // Set when a suggestion is selected; consumed by the viewportBounds
  // effect once the pan's bounds land, selecting the first point in view.
  const placeFocusRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const viewportAtSelectionRef = useRef<ViewportBounds | null>(null);
  // Mobile map-first (t_b7728ad0): the points panel starts collapsed on
  // small screens so the map is the first thing users see. Desktop (and
  // SSR/tests without matchMedia) keep it expanded. The toggle in the
  // panel header re-expands it from the keyboard.
  const [pointsCollapsed, setPointsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 768px)").matches;
  });

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

  // Geocode selection (GeocodeSearch → onPlaceSelect): remember the viewport
  // at selection time — the "focus first point" effect below waits until the
  // map emits NEW bounds (the pan landed) before consuming the pending
  // selection, so a filter re-render churn of the records arrays must not
  // consume it early. The local point filter (?q=) is cleared so the list
  // can follow the new viewport unfiltered — searching "Ferrara" must show
  // the cameras near Ferrara, not only the ones whose address contains it.
  const handlePlaceSelect = useCallback((result: GeocodeSuggestion) => {
    setPlaceFocus({ latitude: result.lat, longitude: result.lng });
    placeFocusRef.current = { latitude: result.lat, longitude: result.lng };
    viewportAtSelectionRef.current = viewportBounds;
    setSearch("");
  }, [viewportBounds, setSearch]);

  // Focus the first point in the new viewport after a geocode selection
  // ("focus sul primo punto se presente"). The pending flag is consumed
  // only when the map emitted NEW bounds since the selection (the pan
  // landed and the visible list refreshed): before that, visibleRecords is
  // still the OLD viewport and selecting from it would focus the wrong
  // point. If the new viewport has no points the pending flag is consumed
  // so a later manual pan does not surprise the user by auto-selecting.
  useEffect(() => {
    if (placeFocusRef.current === null) return;
    // Not landed yet: the bounds are still the ones captured at selection
    // (or never emitted). A records-array identity churn (filter
    // re-render) re-runs this effect but must NOT consume the pending
    // selection — the guard below is a bounds-object comparison.
    if (viewportAtSelectionRef.current !== null && viewportAtSelectionRef.current === viewportBounds) return;
    placeFocusRef.current = null;
    viewportAtSelectionRef.current = null;
    if (visibleRecords.length > 0 && !visibleRecords.some((camera) => camera.id === selectedId)) {
      onSelect(visibleRecords[0].id);
    }
  }, [viewportBounds, visibleRecords, selectedId, onSelect]);

  const focusLocation = useMemo(() => placeFocus ?? coordinates, [placeFocus, coordinates]);

  return (
    <>
      <div className="live-map-workspace map-split">
        <aside className="map-sidebar" aria-labelledby="map-list-title">
          <GeocodeSearch search={search} onSearchChange={setSearch} onPlaceSelect={handlePlaceSelect} />
          <MapRecordList filteredRecords={filteredRecords} visibleRecords={visibleRecords} selectedId={selectedId} onSelect={onSelect} onReset={onReset} labels={t} statusLabel={(status) => publicStatusLabel(statuses, status, t.unknown)} collapsed={pointsCollapsed} onToggleCollapse={() => setPointsCollapsed((current) => !current)} />
        </aside>
        <div className="map-panel"><SurveillanceMap cameras={filteredRecords} selectedId={selectedId} focusLocation={focusLocation} onSelect={onSelect} onPick={onPick} directoryHref={directoryHref} onBoundsChange={onBoundsChange} popupHtmlFor={popupHtmlForCamera} /><div className="map-hint">{t.mapHint}</div></div>
      </div>
      {loading && <p className="loading-note">{t.loadingRecords}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    </>
  );
}
