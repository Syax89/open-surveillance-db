"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMessages } from "../LocaleProvider";
import { publicRecords, prototypeRecords } from "../../lib/records";
import { usePublicCameras } from "../../lib/use-public-cameras";
import { textMatches } from "../../lib/search";
import { MapPanel } from "../home/MapPanel";
import { FiltersBar } from "../FiltersBar";
import { EmptyState } from "../EmptyState";

/**
 * /mappa tool body (F1 route group (tools), D3-qualified shell): the map
 * with its record panel, exports and the shared FiltersBar. Filters are
 * applied client-side for now (the API filters land in F0); the URL shell
 * (?type=&freshness=&lat=&lng=&z=) seeds the initial filter state so deep
 * links work, and F4 (useCameraFilters) wires the full read/write contract.
 */
export function MappaTool() {
  const t = useMessages().map;
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(1);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState(searchParams.get("type") ?? "all");
  const [freshnessFilter, setFreshnessFilter] = useState(searchParams.get("freshness") ?? "all");
  const [freshnessCutoff, setFreshnessCutoff] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"alphabetical" | "position">("alphabetical");

  const { records, loading } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
    onRecords: (next) => setSelectedId(next[0].id),
    onError: () => setNotice(t.apiUnavailable),
  });

  const cameraKinds = useMemo(() => Array.from(new Set(records.map((camera) => camera.kind).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matchingRecords = records.filter((camera) => {
      const matchesSearch = !query || textMatches(camera, query);
      const matchesKind = kindFilter === "all" || camera.kind === kindFilter;
      const updatedAt = new Date(camera.updated).getTime();
      const matchesFreshness = freshnessCutoff === null || (Number.isFinite(updatedAt) && updatedAt >= freshnessCutoff);
      return matchesSearch && matchesKind && matchesFreshness;
    });
    return matchingRecords.sort((first, second) => sortOrder === "alphabetical"
      ? first.title.localeCompare(second.title)
      : first.latitude - second.latitude || first.longitude - second.longitude || first.title.localeCompare(second.title));
  }, [freshnessCutoff, kindFilter, records, search, sortOrder]);

  const selectedCamera = useMemo(() => filteredRecords.find((camera) => camera.id === selectedId) ?? filteredRecords[0], [filteredRecords, selectedId]);

  function resetFilters() {
    setSearch("");
    setKindFilter("all");
    setFreshnessFilter("all");
    setFreshnessCutoff(null);
    setSortOrder("alphabetical");
  }

  return (
    <section className="tool-section map-tool" aria-labelledby="map-tool-title">
      <div className="tool-heading"><p className="eyebrow"><span /> {t.livePrototype}</p><h1 id="map-tool-title">{t.pageTitle}</h1><p>{t.pageIntro}</p></div>
      <FiltersBar variant="panel" cameraKinds={cameraKinds} search={search} setSearch={setSearch} kindFilter={kindFilter} setKindFilter={setKindFilter} freshnessFilter={freshnessFilter} setFreshnessFilter={setFreshnessFilter} setFreshnessCutoff={setFreshnessCutoff} sortOrder={sortOrder} setSortOrder={setSortOrder} resultCount={filteredRecords.length} onReset={resetFilters} />
      {filteredRecords.length === 0
        ? <EmptyState title={t.emptyTitle} body={t.emptyBody} action={<button type="button" className="text-button" onClick={resetFilters}>{t.clearSearch} <span aria-hidden="true">→</span></button>} />
        : <MapPanel filteredRecords={filteredRecords} selectedId={selectedId} onSelect={setSelectedId} onPick={() => {}} coordinates={null} selectedCamera={selectedCamera} loading={loading} notice={notice} issueHref="/correggi" directoryHref="/directory" />}
    </section>
  );
}
