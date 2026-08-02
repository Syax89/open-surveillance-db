"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "../LocaleProvider";
import { publicRecords, prototypeRecords } from "../../lib/records";
import { usePublicCameras } from "../../lib/use-public-cameras";
import {
  applyCameraFilters,
  cameraKindsOf,
  mapHrefWithFocus,
  serverFiltersFrom,
  useCameraFilters,
} from "../../lib/use-camera-filters";
import { PublicDirectory } from "../home/PublicDirectory";

/**
 * /directory tool body (F4, t_522638a5): the filters live in the URL
 * (?q= ?type= ?freshness= ?sort= — useCameraFilters) and kind/freshness are
 * forwarded to the API (F0 server-side filters); the client memo only gates
 * the demo seed fallback and the client-only dimensions (q, sort, plan
 * §3.3). Deep links, shareable URLs and back/forward all re-derive the same
 * state from the URL — no local filter state to desync (D4, one pattern
 * with /mappa). The data export row (GeoJSON/CSV + data policy) lives HERE
 * (CEO feedback 2026-08-02): the text list owns the downloads, /mappa no
 * longer carries the export footer.
 */
export function DirectoryTool() {
  const t = useMessages().directory;
  const router = useRouter();
  const { filters, qInput, setQ, setType, setFreshness, setSort, reset } = useCameraFilters();
  const { records } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
    filters: serverFiltersFrom(filters),
  });

  const filteredRecords = useMemo(() => applyCameraFilters(records, filters), [records, filters]);
  const cameraKinds = useMemo(() => cameraKindsOf(records), [records]);

  // Navigation (push, not replace — R2): the map opens with the SAME
  // filters and the record preselected via ?focus=ID. /mappa reads focus
  // from the URL (focus management, FRONTEND_DESIGN §6.2).
  function showRecordOnMap(id: number) {
    router.push(mapHrefWithFocus(filters, id));
  }

  return (
    <section className="tool-section directory-tool" aria-labelledby="directory-tool-title">
      <div className="tool-heading"><p className="eyebrow"><span /> {t.accessibleDirectory}</p><h1 id="directory-tool-title">{t.pageTitle}</h1><p>{t.pageIntro}</p></div>
      <PublicDirectory
        filteredRecords={filteredRecords}
        cameraKinds={cameraKinds}
        search={qInput}
        setSearch={setQ}
        kindFilter={filters.type}
        setKindFilter={setType}
        freshnessFilter={filters.freshness}
        setFreshnessFilter={setFreshness}
        sortOrder={filters.sort}
        setSortOrder={setSort}
        showRecordOnMap={showRecordOnMap}
        setCoordinates={() => {}}
        onResetFilters={reset}
        mapHref="/mappa"
        reportHref="/segnala"
      />
      {/* Data export row (CEO feedback 2026-08-02): moved from /mappa — the
          accessible text list owns the public data downloads, matching the
          guide/regole pattern (data-actions footer). */}
      <div className="data-actions"><a href="/api/cameras?format=geojson" download="opensurveillancedb-cameras.geojson">{t.downloadGeoJson}</a><span>·</span><a href="/api/cameras?format=csv" download="opensurveillancedb-cameras.csv">{t.downloadCsv}</a><span>·</span><a href="/guide">{t.readDataPolicy}</a></div>
    </section>
  );
}
