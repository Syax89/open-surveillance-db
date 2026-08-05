"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMessages } from "../../lib/use-messages";
import { useViewportCameras } from "../../lib/use-viewport-cameras";
import { recordsInBounds } from "../../lib/map-viewport";
import type { ViewportBounds } from "../../lib/map-viewport";
import {
  applyCameraFilters,
  cameraKindsOf,
  serverFiltersFrom,
  useCameraFilters,
} from "../../lib/use-camera-filters";
import { MapPanel } from "../home/MapPanel";
import { FiltersBar } from "../FiltersBar";

/**
 * /mappa tool body (F4, t_522638a5; viewport redesign t_702c10af; integrated
 * layout t_966254a1; heading cleanup t_11e38eab; CEO feedback 2026-08-02:
 * prototype banner removed). No visible tool header: the page starts
 * directly with the single map card. The h1 stays in the DOM as sr-only
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
 * Kind options (FiltersBar dropdown) come from the opt-in facets query
 * (?facets=1, QA#5 F2): with viewport loading the store only sees the kinds
 * inside the boxes fetched so far, and the filter UI must keep offering
 * every kind of the dataset — the facets describe the FULL public set in
 * one cached request. While the facets are in flight the dropdown falls
 * back to the kinds present in the store.
 *
 * Map-always-visible contract (t_b9666d09): the MapPanel (map + sidebar)
 * is rendered UNCONDITIONALLY — a filter that matches nothing must never
 * replace the map with an empty state. The truthful "no record matches"
 * note lives inside the sidebar list (MapPanel), with the Clear filters
 * action wired to onReset. The prototype banner was removed (CEO feedback
 * 2026-08-02): the map is no longer framed as a prototype — the truthfulness
 * contract ("an empty area never proves absence") is carried by pageIntro
 * and the in-list notes.
 */
export function MappaTool() {
  const t = useMessages().map;
  const { filters, qInput, setQ, setType, setFreshness, setSort, setState, setOrigin, reset } = useCameraFilters();
  const [selectedId, setSelectedId] = useState(() => filters.focus ?? 1);
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const [notice, setNotice] = useState("");

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
    // select: keep the current selection (the focus management effect and
    // MapPanel's fallbacks already handle a selectedId that matches
    // nothing), so no spurious popup or deep link can fire.
    onRecords: (next) => setSelectedId((current) => {
      if (filters.focus !== null || next.length === 0) return current;
      return next[0].id;
    }),
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

  const handleBoundsChange = useCallback((bounds: ViewportBounds) => setViewportBounds(bounds), []);

  // Focus management: a ?focus=ID deep link (or back/forward onto one)
  // selects that record; when the filters hide the current selection the
  // card falls back to the first visible record — never a filtered-out card.
  // The setStates are guarded (identity/no-op when nothing changed), so this
  // is the documented "adjusting state when a prop changes" pattern driven
  // by the URL (external system), not a cascading-render loop.
  useEffect(() => {
    if (filters.focus !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL focus (FRONTEND_DESIGN §6.2) is external state: a deep link / back-forward onto ?focus=ID must select that record exactly once; guard makes it a prop-change sync, not a loop.
      setSelectedId(filters.focus);
    } else if (selectedId !== null && !filteredRecords.some((camera) => camera.id === selectedId)) {
      const first = filteredRecords[0];
      setSelectedId(first ? first.id : selectedId);
    }
  }, [filters.focus, filteredRecords, selectedId]);

  const selectedCamera = useMemo(
    () => filteredRecords.find((camera) => camera.id === selectedId) ?? filteredRecords[0],
    [filteredRecords, selectedId],
  );

  return (
    <section className="tool-section map-tool" aria-labelledby="map-tool-title">
      {/* No visible tool header (t_11e38eab): the page starts directly with
          the map. The h1 stays sr-only so the document hierarchy and the
          section's aria-labelledby survive. */}
      <h1 id="map-tool-title" className="sr-only">{t.pageTitle}</h1>
      <div className="map-layout">
        {/* The whole workspace is ONE card: filters attached to the top
            edge (same width, same background, no gap), then the split
            (sidebar list + full map). The prototype banner was removed
            (CEO feedback 2026-08-02) — the page starts directly with the
            map card. */}
        <div className="map-card">
          <FiltersBar variant="panel" hideSearch showCommunitySort stateFilter={filters.state} setStateFilter={setState} originFilter={filters.origin} setOriginFilter={setOrigin} cameraKinds={cameraKinds} search={qInput} setSearch={setQ} kindFilter={filters.type} setKindFilter={setType} freshnessFilter={filters.freshness} setFreshnessFilter={setFreshness} sortOrder={filters.sort} setSortOrder={setSort} resultCount={filteredRecords.length} onReset={reset} />
          {/* Map-always-visible (t_b9666d09): MapPanel renders the map AND
              the sidebar unconditionally. When no record matches the
              filters the sidebar shows the truthful in-list note with the
              Clear filters action (onReset); the map itself never
              disappears. */}
          <MapPanel filteredRecords={filteredRecords} visibleRecords={visibleRecords} selectedId={selectedId} onSelect={setSelectedId} onPick={() => {}} coordinates={focusLocation} selectedCamera={selectedCamera} loading={loading} notice={notice} directoryHref="/directory" search={qInput} setSearch={setQ} onBoundsChange={handleBoundsChange} viewportBounds={viewportBounds} onReset={reset} />
        </div>
      </div>
    </section>
  );
}
