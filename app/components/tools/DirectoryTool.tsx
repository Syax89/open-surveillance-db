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
 * with /mappa).
 *
 * Catalog mode (t_127492f1): the page renders the flat catalog layout
 * (PublicDirectory variant="catalog") — controls row, then the results meta
 * row (count + CSV/GeoJSON export + place-search trigger), then the flat
 * record rows. "Use the map instead" moves into the tool heading (the
 * records-heading action row no longer exists on the tool page).
 */
export function DirectoryTool() {
  const t = useMessages().directory;
  const router = useRouter();
  const { filters, qInput, setQ, setType, setFreshness, setSort, reset } = useCameraFilters();
  const serverFilters = useMemo(() => serverFiltersFrom(filters), [filters]);
  const { records } = usePublicCameras({
    seed: publicRecords(prototypeRecords),
    filters: serverFilters,
  });

  const filteredRecords = useMemo(() => applyCameraFilters(records, filters), [records, filters]);
  const cameraKinds = useMemo(() => cameraKindsOf(records), [records]);

  // Navigation (push, not replace — R2): the map opens with the SAME
  // filters and the record preselected via ?focus=ID. /mappa reads focus
  // from the URL (focus management, FRONTEND_DESIGN §6.2).
  function showRecordOnMap(id: number) {
    router.push(mapHrefWithFocus(filters, id));
  }

  // Export links (t_127492f1): the API applies the server-side filters
  // (kind + freshness — the same params the list fetch already sends);
  // q and sort are client-side, so the export hint (directory-export-hint)
  // says exactly what the download contains.
  function exportHref(format: "csv" | "geojson"): string {
    const params = new URLSearchParams({ format });
    if (serverFilters.kind) params.set("kind", serverFilters.kind);
    if (serverFilters.freshness) params.set("freshness", serverFilters.freshness);
    return `/api/cameras?${params.toString()}`;
  }

  return (
    <section className="tool-section directory-tool" aria-labelledby="directory-tool-title">
      <div className="tool-heading directory-tool-heading">
        <div>
          <p className="eyebrow"><span /> {t.accessibleDirectory}</p>
          <h1 id="directory-tool-title">{t.pageTitle}</h1>
          <p>{t.pageIntro}</p>
        </div>
        <a className="text-button" href="/mappa">{t.useMapInstead} <span aria-hidden="true">↑</span></a>
      </div>
      <PublicDirectory
        variant="catalog"
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
        exportHrefs={{ csv: exportHref("csv"), geojson: exportHref("geojson") }}
        showHeading={false}
      />
    </section>
  );
}
