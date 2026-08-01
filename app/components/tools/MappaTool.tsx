"use client";

import { useEffect, useMemo, useState } from "react";
import { useMessages } from "../LocaleProvider";
import { publicRecords, prototypeRecords } from "../../lib/records";
import { usePublicCameras } from "../../lib/use-public-cameras";
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
 * /mappa tool body (F4, t_522638a5): the filters live in the URL
 * (?q= ?type= ?freshness= ?sort= ?focus= — useCameraFilters) and
 * kind/freshness are forwarded to the API (F0 server-side filters). The map
 * keeps needing ALL matching points (plan §3.3: "la mappa ha bisogno di
 * tutti i punti, non della pagina 1"), so it walks the server-filtered
 * list; a viewport-driven GeoJSON bbox layer follows the lat/lng/z viewport
 * state phase. ?focus=ID (deep link from /directory) preselects a record —
 * focus management, FRONTEND_DESIGN §6.2.
 */
export function MappaTool() {
  const t = useMessages().map;
  const { filters, qInput, setQ, setType, setFreshness, setSort, reset } = useCameraFilters();
  const [selectedId, setSelectedId] = useState(() => filters.focus ?? 1);
  const [notice, setNotice] = useState("");

  const { records, loading } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
    filters: serverFiltersFrom(filters),
    onRecords: (next) => setSelectedId((current) => (filters.focus !== null ? current : next[0].id)),
    onError: () => setNotice(t.apiUnavailable),
  });

  const filteredRecords = useMemo(() => applyCameraFilters(records, filters), [records, filters]);
  const cameraKinds = useMemo(() => cameraKindsOf(records), [records]);

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
      <div className="tool-heading"><p className="eyebrow"><span /> {t.livePrototype}</p><h1 id="map-tool-title">{t.pageTitle}</h1><p>{t.pageIntro}</p></div>
      <FiltersBar variant="panel" cameraKinds={cameraKinds} search={qInput} setSearch={setQ} kindFilter={filters.type} setKindFilter={setType} freshnessFilter={filters.freshness} setFreshnessFilter={setFreshness} sortOrder={filters.sort} setSortOrder={setSort} resultCount={filteredRecords.length} onReset={reset} />
      {filteredRecords.length === 0
        ? <EmptyState title={t.emptyTitle} body={t.emptyBody} action={<button type="button" className="text-button" onClick={reset}>{t.clearSearch} <span aria-hidden="true">→</span></button>} />
        : <MapPanel filteredRecords={filteredRecords} selectedId={selectedId} onSelect={setSelectedId} onPick={() => {}} coordinates={null} selectedCamera={selectedCamera} loading={loading} notice={notice} issueHref="/correggi" directoryHref="/directory" />}
    </section>
  );
}
