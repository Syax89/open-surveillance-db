"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessages } from "../../lib/use-messages";
import { useViewportCameras } from "../../lib/use-viewport-cameras";
import { recordsInBounds } from "../../lib/map-viewport";
import type { ViewportBounds } from "../../lib/map-viewport";
import {
  applyCameraFilters,
  cameraKindsOf,
  exploreDirectoryHref,
  exploreMapHref,
  serverFiltersFrom,
  useCameraFilters,
} from "../../lib/use-camera-filters";
import { MapPanel } from "../home/MapPanel";
import { GeocodeSearch, type GeocodeSuggestion } from "../home/GeocodeSearch";
import { FiltersBar } from "../FiltersBar";
import { ExploreViewSwitch } from "../ExploreViewSwitch";

/**
 * /mappa tool body (F4, t_522638a5; viewport redesign t_702c10af; integrated
 * layout t_966254a1; heading cleanup t_11e38eab; CEO feedback 2026-08-02:
 * prototype banner removed). A compact explorer toolbar replaces a large
 * tool header; the h1 stays in the DOM as sr-only
 * (a11y — document hierarchy and the section's aria-labelledby keep
 * working). The map card hosts the FiltersBar row (kind/freshness/sort/
 * reset — attached to the card top, width-aligned with the map) and the
 * viewport-synced sidebar list + full map. The filters live in the URL
 * (?q= ?type= ?freshness= ?sort= ?focus= — useCameraFilters) and
 * kind/freshness are forwarded to the API (F0 server-side filters).
 *
 * Viewport data contract (kanban t_bb310428 — P0 map UX regression): the
 * map NO LONGER walks all public pages serially (15 × /api/cameras?limit=500
 * on 7,374 records, ~5.35s before any marker). useViewportCameras fetches
 * ONLY the current viewport through the bounded JSON bbox contract, with a
 * module cache, in-flight dedupe and a merged store. The sidebar list and
 * the markers behave exactly as before — the same applyCameraFilters /
 * recordsInBounds pipeline — just over the records loaded so far. The
 * filter-bar count is the client-side match count over that store (it
 * converges to the dataset total as the user explores; the server total for
 * the current server filters is exposed on the hook result). ?focus=ID
 * (deep link from /directory) preselects a record and pans the map to it —
 * the hook resolves the focused record through the dedicated endpoint even
 * when it lies outside every loaded bbox — focus management,
 * FRONTEND_DESIGN §6.2.
 *
 * Popup policy (PR #326 review — "mantieni strettamente la UX del CEO"):
 * a popup opens ONLY on an explicit marker click, an empty-map click (the
 * report shortcut, a deliberate UX choice of this PR), a ?focus=ID deep
 * link, or a place-search selection (first visible point after the pan
 * lands). Filter changes, viewport data arrival and record churn NEVER
 * auto-open a popup: selectedId falls back to null (never to the first
 * record) so the selection effect stays quiet, and the card/list fall back
 * to the first visible record without opening its popup.
 */
export function MappaTool() {
  const t = useMessages().map;
  const { filters, qInput, setQ, setType, setFreshness, setSort, setState, setOrigin, reset } = useCameraFilters();
  const [selectedId, setSelectedId] = useState<number | null>(() => filters.focus ?? null);
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const [notice, setNotice] = useState("");
  const [placeFocus, setPlaceFocus] = useState<{ latitude: number; longitude: number } | null>(null);
  const placeFocusRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const viewportAtSelectionRef = useRef<ViewportBounds | null>(null);

  // Viewport-bounded data layer (t_bb310428): only the records inside the
  // current map bounds are requested; the merged store feeds the same
  // filter/list pipeline as before.
  const { records, loading } = useViewportCameras({
    bounds: viewportBounds,
    filters: serverFiltersFrom(filters),
    // ?focus= deep link: the hook resolves the record even when it is
    // outside every loaded bbox (dedicated endpoint), so the pan + popup
    // contract survives viewport loading.
    focusId: filters.focus,
    // P0 hotfix (t_444b15e4, post-#321): the API answers a VALID empty
    // list ({records: []}) when the DB has no public records — never
    // dereference next[0] on it. Without records there is nothing to
    // select: keep the current selection, so no spurious popup or deep
    // link can fire.
    //
    // Popup policy (see the component doc): arriving viewport data must
    // NOT auto-open a popup, so this callback never falls back to
    // next[0].id. It only commits a pending focus from the URL.
    onRecords: () => setSelectedId((current) => (filters.focus !== null ? filters.focus : current)),
    onError: () => setNotice(t.apiUnavailable),
  });

  const filteredRecords = useMemo(() => applyCameraFilters(records, filters), [records, filters]);
  // Kind options: facets (full-dataset kinds, one cached request) while
  // loading, falling back to the kinds seen in the loaded store.
  const [facetsKinds, setFacetsKinds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cameras?facets=1&limit=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.facets?.kinds)) return;
        setFacetsKinds(data.facets.kinds.map((item: { kind: string }) => item.kind).sort((a: string, b: string) => a.localeCompare(b)));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const cameraKinds = facetsKinds ?? cameraKindsOf(records);
  // Viewport→list sync: only the points inside the current map bounds.
  // Zoom in → the list narrows; zoom out → it widens. Before the first
  // bounds emission the list shows everything (never a blank column).
  const visibleRecords = useMemo(() => recordsInBounds(filteredRecords, viewportBounds), [filteredRecords, viewportBounds]);

  // A ?focus=ID deep link pans the map to the record (SurveillanceMap
  // focusLocation effect) and opens its popup once the marker exists.
  const focusLocation = useMemo(() => {
    if (filters.focus === null) return null;
    const record = filteredRecords.find((camera) => camera.id === filters.focus);
    return record ? { latitude: record.latitude, longitude: record.longitude } : null;
  }, [filters.focus, filteredRecords]);
  const mapHref = useMemo(() => exploreMapHref(filters), [filters]);
  const directoryHref = useMemo(() => exploreDirectoryHref(filters), [filters]);

  const handleBoundsChange = useCallback((bounds: ViewportBounds) => setViewportBounds(bounds), []);

  // Place-search selection (PR #326 UX — kept strictly): picking a place
  // pans the map there and, once the pan lands on the new bounds, selects
  // the first visible point so the marker/list pair stays synchronized.
  // This is EXPLICIT user intent (a selection from the geocode list), so
  // the popup that follows is intended.
  const handlePlaceSelect = useCallback((result: GeocodeSuggestion) => {
    setPlaceFocus({ latitude: result.lat, longitude: result.lng });
    placeFocusRef.current = { latitude: result.lat, longitude: result.lng };
    viewportAtSelectionRef.current = viewportBounds;
    setQ("");
  }, [viewportBounds, setQ]);

  // Focus management: a ?focus=ID deep link (or back/forward onto one)
  // selects that record. When the filters hide the current selection the
  // selection falls back to NULL — never to the first record — so a filter
  // change never auto-opens a popup (popup policy above). The card/list
  // fall back to the first visible record for display, without opening it.
  useEffect(() => {
    if (filters.focus !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL focus (FRONTEND_DESIGN §6.2) is external state: a deep link / back-forward onto ?focus=ID must select that record exactly once; guard makes it a prop-change sync, not a loop.
      setSelectedId(filters.focus);
    } else if (selectedId !== null && !filteredRecords.some((camera) => camera.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filters.focus, filteredRecords, selectedId]);

  // Place-search selection landing: the pending flag is consumed only when
  // the map emitted NEW bounds since the selection (the pan landed), then
  // the first visible point is selected — one explicit popup, no churn.
  useEffect(() => {
    if (placeFocusRef.current === null) return;
    if (viewportAtSelectionRef.current !== null && viewportAtSelectionRef.current === viewportBounds) return;
    placeFocusRef.current = null;
    viewportAtSelectionRef.current = null;
    if (visibleRecords.length > 0 && !visibleRecords.some((camera) => camera.id === selectedId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the map emitted new external bounds after a chosen place; selecting its first visible point keeps the marker/list pair synchronized.
      setSelectedId(visibleRecords[0].id);
    }
  }, [viewportBounds, visibleRecords, selectedId]);

  const selectedCamera = useMemo(
    () => filteredRecords.find((camera) => camera.id === selectedId) ?? filteredRecords[0],
    [filteredRecords, selectedId],
  );
  const explorerFocusLocation = useMemo(() => placeFocus ?? focusLocation, [placeFocus, focusLocation]);

  return (
    <section className="tool-section map-tool" aria-labelledby="map-tool-title">
      <h1 id="map-tool-title" className="sr-only">{t.pageTitle}</h1>
      <div className="map-layout">
        {/* The whole workspace is ONE card: a compact explorer switch,
            filters attached to the top edge, then the split
            (sidebar list + full map). The prototype banner was removed
            (CEO feedback 2026-08-02). */}
        <div className="map-card">
          <div className="map-explorer-toolbar">
            <p>{t.pageTitle}</p>
            <ExploreViewSwitch active="map" mapHref={mapHref} directoryHref={directoryHref} />
          </div>
          <div className="map-explorer-search">
            <GeocodeSearch search={qInput} onSearchChange={setQ} onPlaceSelect={handlePlaceSelect} />
          </div>
          <FiltersBar variant="panel" hideSearch showCommunitySort stateFilter={filters.state} setStateFilter={setState} originFilter={filters.origin} setOriginFilter={setOrigin} cameraKinds={cameraKinds} search={qInput} setSearch={setQ} kindFilter={filters.type} setKindFilter={setType} freshnessFilter={filters.freshness} setFreshnessFilter={setFreshness} sortOrder={filters.sort} setSortOrder={setSort} resultCount={filteredRecords.length} onReset={reset} />
          {/* Map-always-visible (t_b9666d09): MapPanel renders the map AND
              the sidebar unconditionally. When no record matches the
              filters the sidebar shows the truthful in-list note; the map itself never
              disappears. */}
          <MapPanel filteredRecords={filteredRecords} visibleRecords={visibleRecords} selectedId={selectedId} onSelect={setSelectedId} onPick={() => {}} coordinates={explorerFocusLocation} selectedCamera={selectedCamera} loading={loading} notice={notice} directoryHref={directoryHref} onBoundsChange={handleBoundsChange} />
        </div>
      </div>
    </section>
  );
}
