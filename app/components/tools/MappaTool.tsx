"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMessages } from "../LocaleProvider";
import { publicRecords, prototypeRecords } from "../../lib/records";
import { usePublicCameras } from "../../lib/use-public-cameras";
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
import { EmptyState } from "../EmptyState";

/**
 * /mappa tool body (F4, t_522638a5; viewport redesign t_702c10af; integrated
 * layout t_966254a1; heading cleanup t_11e38eab). No visible tool header:
 * the page starts directly with the compact prototype banner and the single
 * map card. The h1 stays in the DOM as sr-only (a11y — document hierarchy
 * and the section's aria-labelledby keep working). The map card hosts the
 * FiltersBar row (kind/freshness/sort/reset — attached to the card top,
 * width-aligned with the map) and the viewport-synced sidebar list + full
 * map. The filters live in the URL (?q= ?type= ?freshness= ?sort= ?focus= —
 * useCameraFilters) and kind/freshness are forwarded to the API (F0
 * server-side filters). The map keeps needing ALL matching points (plan
 * §3.3), so it walks the server-filtered list; the left sidebar shows only
 * the points inside the current viewport (map.getBounds() → recordsInBounds,
 * debounced by SurveillanceMap). ?focus=ID (deep link from /directory)
 * preselects a record and pans the map to it — focus management,
 * FRONTEND_DESIGN §6.2.
 */
export function MappaTool() {
  const t = useMessages().map;
  const { filters, qInput, setQ, setType, setFreshness, setSort, reset } = useCameraFilters();
  const [selectedId, setSelectedId] = useState(() => filters.focus ?? 1);
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const [notice, setNotice] = useState("");

  const { records, loading } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
    filters: serverFiltersFrom(filters),
    onRecords: (next) => setSelectedId((current) => (filters.focus !== null ? current : next[0].id)),
    onError: () => setNotice(t.apiUnavailable),
  });

  const filteredRecords = useMemo(() => applyCameraFilters(records, filters), [records, filters]);
  const cameraKinds = useMemo(() => cameraKindsOf(records), [records]);
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
        {/* Compact prototype banner (t_966254a1): a slim one-liner between
            the map card — only when the map is
            actually rendered (never over the truthful empty state). */}
        {filteredRecords.length > 0 && (
          <div className="prototype-banner prototype-banner-compact" role="note"><b>{t.prototypeMode}</b> {t.prototypeBanner}</div>
        )}
        {/* The whole workspace is ONE card: filters attached to the top
            edge (same width, same background, no gap), then the split
            (sidebar list + full map) and the export footer below. */}
        <div className="map-card">
          <FiltersBar variant="panel" hideSearch cameraKinds={cameraKinds} search={qInput} setSearch={setQ} kindFilter={filters.type} setKindFilter={setType} freshnessFilter={filters.freshness} setFreshnessFilter={setFreshness} sortOrder={filters.sort} setSortOrder={setSort} resultCount={filteredRecords.length} onReset={reset} />
          {filteredRecords.length === 0
            ? <EmptyState heading="h2" title={t.emptyTitle} body={t.emptyBody} action={<button type="button" className="text-button" onClick={reset}>{t.clearSearch} <span aria-hidden="true">→</span></button>} />
            : <MapPanel filteredRecords={filteredRecords} visibleRecords={visibleRecords} selectedId={selectedId} onSelect={setSelectedId} onPick={() => {}} coordinates={focusLocation} selectedCamera={selectedCamera} loading={loading} notice={notice} issueHref="/correggi" directoryHref="/directory" search={qInput} setSearch={setQ} onBoundsChange={handleBoundsChange} />}
        </div>
      </div>
    </section>
  );
}
