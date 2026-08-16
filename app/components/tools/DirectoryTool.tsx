"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "../../lib/use-messages";
import { usePublicCameras } from "../../lib/use-public-cameras";
import { usePublicCamerasPage } from "../../lib/use-public-cameras-page";
import {
  applyCameraFilters,
  cameraKindsOf,
  mapHrefWithFocus,
  exploreDirectoryHref,
  exploreMapHref,
  serverFiltersFrom,
  useCameraFilters,
} from "../../lib/use-camera-filters";
import {
  camerasToCsv,
  camerasToGeoJson,
  downloadTextFile,
  exportFileName,
} from "../../lib/directory-export";
import { PublicDirectory } from "../home/PublicDirectory";
import { ExploreViewSwitch } from "../ExploreViewSwitch";

/**
 * /directory tool body (F4, t_522638a5): the filters live in the URL
 * (?q= ?type= ?freshness= ?sort= — useCameraFilters) and kind/freshness are
 * forwarded to the API (F0 server-side filters); the client memo only gates
 * the demo seed fallback and the client-only dimensions (q, sort, plan
 * §3.3). Deep links, shareable URLs and back/forward all re-derive the same
 * with /mappa). The downloads moved here from /mappa (CEO feedback
 * 2026-08-02): the map tool no longer carries the export footer and the
 * text list owns the public data downloads.
 *
 * Catalog mode (t_127492f1, redesign t_f13fcb1c): the page renders the
 * browse-record layout (PublicDirectory variant="catalog" → DirectoryCatalog)
 * — controls row (search + filters + place-search toggle), collapsible
 * place-search card, visible results header (count + active-filter chips),
 * A–Z index, flat record rows and pagination (?page=).
 * "Use the map instead" moves into the tool heading (the records-heading
 * action row no longer exists on the tool page).
 *
 * Export ownership (merge #229 × #231; redesign t_f13fcb1c; t_b98b1734):
 * the CSV/GeoJSON downloads are small text links in the data-actions footer
 * below, on the same row as the data policy link (CEO 2026-08-08: "in basso
 * e più piccoli, sulla riga di 'Read the data policy'") — filter-aware via
 * client-side generation from the visible set (issue #409, t_c319c619), no
 * buttons in the results header.
 *
 * Data walk vs server-side pagination (kanban t_b6cbb655, P2 audit
 * 2026-08-09 — DOCUMENTED, deliberately NOT changed): the tool reads the
 * WHOLE public list through usePublicCameras (module-cached walk) while the
 * visible list is sliced client-side to 20 rows. Server-side limit/offset
 * pagination would break the catalog semantics the page depends on — the
 * A–Z index, the client-side q/sort dimensions and the results count all
 * need the full filtered set, and the walk is already rate-limit-safe since
 * #386: PAGE_LIMIT 2000 → ~17 requests for a 32k dataset (was 64 at
 * limit 500, over the 60/min read bucket). Do not "optimise" this into
 * server-side pagination without a dataset that genuinely exceeds the walk
 * (see use-public-cameras.ts pagination contract).
 */
export function DirectoryTool() {
  const t = useMessages().directory;
  const router = useRouter();
  const { filters, qInput, setQ, setType, setFreshness, setSort, setState, setOrigin, setPage, reset } = useCameraFilters();
  const serverFilters = useMemo(() => serverFiltersFrom(filters), [filters]);
  
  // Cursor pagination (160k+ records): when sort=alphabetical, use the new
  // cursor hook to load only 20 records per page instead of the full walk.
  // With 160k+ dataset, the walk is unsustainable (80+ requests, 4+ MB, 16+ s).
  // For other sorts (useful/recent/confirmations), keep the legacy walk.
  const usesCursor = filters.sort === "alphabetical";
  
  // Legacy walk (map, other sorts, no filters)
  const legacyWalk = usePublicCameras({
    filters: usesCursor ? undefined : serverFilters,
  });
  
  // Cursor pagination (alphabetical + filters)
  const cursorPage = usePublicCamerasPage({
    page: filters.page,
    limit: 20,
    filters: usesCursor ? serverFilters : undefined,
  });
  
  const { records, loading, error, reload } = usesCursor ? cursorPage : legacyWalk;

  // Client-side filters (legacy walk only): when using cursor pagination,
  // ALL filters are server-side (q, type, freshness, state, origin) so
  // applyCameraFilters would be redundant. For legacy walk, apply client filters.
  const filteredRecords = useMemo(() => 
    usesCursor ? records : applyCameraFilters(records, filters), 
    [records, filters, usesCursor]
  );
  const cameraKinds = useMemo(() => cameraKindsOf(records), [records]);
  const mapHref = useMemo(() => exploreMapHref(filters), [filters]);
  const directoryHref = useMemo(() => exploreDirectoryHref(filters), [filters]);

  // Navigation (push, not replace — R2): the map opens with the SAME
  // filters and the record preselected via ?focus=ID. /mappa reads focus
  // from the URL (focus management, FRONTEND_DESIGN §6.2).
  function showRecordOnMap(id: number) {
    router.push(mapHrefWithFocus(filters, id));
  }

  // Export links (issue #409, t_c319c619): the CSV/GeoJSON downloads are
  // generated IN THE BROWSER from `filteredRecords` — the exact set the user
  // is looking at, after EVERY active filter (q, type, freshness, state,
  // origin) and the current sort order. The API cannot express the
  // client-side dimensions (?state=, ?origin=, ?q=, ?sort= have no SQL
  // counterpart), so a server href alone would still download the whole
  // kind/freshness match; serialising the walked records costs zero extra
  // fetches and gives the export exactly the visible set. The filename
  // reflects the active filters (osdb-traffic-confirmed.geojson, AC3).
  //
  // Fallback contract: while the walk is loading or failed (error), the
  // browser follows the plain server href (kind + freshness — the same
  // server-side filters the list fetch already sent), so a transient
  // failure never dead-ends the download; the export hint below states what
  // the download contains in each case.
  function exportHref(format: "csv" | "geojson"): string {
    const params = new URLSearchParams({ format });
    if (serverFilters.kind) params.set("kind", serverFilters.kind);
    if (serverFilters.freshness) params.set("freshness", serverFilters.freshness);
    return `/api/cameras?${params.toString()}`;
  }

  function downloadExport(format: "csv" | "geojson") {
    const content = format === "csv" ? camerasToCsv(filteredRecords) : JSON.stringify(camerasToGeoJson(filteredRecords));
    const mime = format === "csv" ? "text/csv;charset=utf-8" : "application/geo+json";
    downloadTextFile(content, exportFileName(filters, format), mime);
  }

  // onClick guard: only intercept once the walked records are available
  // (loading/error fall through to the server href). Matches the aria
  // described-by hint, which states the download contents for both paths.
  function exportOnClick(format: "csv" | "geojson") {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (error || loading) return;
      event.preventDefault();
      downloadExport(format);
    };
  }

  return (
    <section className="tool-section directory-tool" aria-labelledby="directory-tool-title">
      <h1 id="directory-tool-title" className="sr-only">{t.pageTitle}</h1>
      <div className="directory-explorer-card">
        <div className="directory-explorer-toolbar">
          <p>{t.pageTitle}</p>
          <ExploreViewSwitch active="directory" mapHref={mapHref} directoryHref={directoryHref} />
        </div>
        <PublicDirectory
          variant="catalog"
          filteredRecords={filteredRecords}
          loading={loading}
          loadError={error}
          onRetryLoad={reload}
          cameraKinds={cameraKinds}
          search={qInput}
          setSearch={setQ}
          kindFilter={filters.type}
          setKindFilter={setType}
          freshnessFilter={filters.freshness}
          setFreshnessFilter={setFreshness}
          sortOrder={filters.sort}
          setSortOrder={setSort}
          stateFilter={filters.state}
          setStateFilter={setState}
          originFilter={filters.origin}
          setOriginFilter={setOrigin}
          page={filters.page}
          setPage={setPage}
          showRecordOnMap={showRecordOnMap}
          setCoordinates={() => {}}
          onResetFilters={reset}
          mapHref={mapHref}
          reportHref="/segnala"
          showMapLink={false}
          showHeading={false}
        />
      </div>
      {/* Data actions footer (t_b98b1734, CEO 2026-08-08): the CSV/GeoJSON
          downloads moved here from the results header — small text links on
          the same row as the data policy link, same font (no buttons). The
          data policy link keeps the guide/regole pattern (merge #229 × #231). */}
      <div className="data-actions">
        <a href={exportHref("csv")} onClick={exportOnClick("csv")} download={error || loading ? undefined : exportFileName(filters, "csv")} aria-describedby="directory-export-hint">{t.exportCsv}</a>
        <span aria-hidden="true">·</span>
        <a href={exportHref("geojson")} onClick={exportOnClick("geojson")} download={error || loading ? undefined : exportFileName(filters, "geojson")} aria-describedby="directory-export-hint">{t.exportGeoJson}</a>
        <span aria-hidden="true">·</span>
        <a href="/guide">{t.readDataPolicy}</a>
        <p className="sr-only" id="directory-export-hint">{t.exportHint}</p>
      </div>
    </section>
  );
}
