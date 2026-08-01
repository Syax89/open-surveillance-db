"use client";

import { useMessages } from "./LocaleProvider";

/**
 * Shared filter bar (F1 route group (tools), D4): search + kind + freshness +
 * sort + reset + result counter. Extracted from the home PublicDirectory
 * controls so /mappa and /directory share ONE filter pattern (identical
 * labels, ids and keyboard behaviour — docs/FRONTEND_DESIGN.md §4).
 *
 * The rendered markup keeps the exact home ids (record-search,
 * record-search-count, …) so the home page output stays byte-identical while
 * the controls now live in a shared component. Only one instance renders per
 * page, so the ids never collide.
 *
 * @param variant "inline" renders the classic directory-controls row;
 *                "panel" is the /mappa variant (same controls, panel class).
 */
export function FiltersBar({
  variant,
  cameraKinds,
  search,
  setSearch,
  kindFilter,
  setKindFilter,
  freshnessFilter,
  setFreshnessFilter,
  setFreshnessCutoff,
  sortOrder,
  setSortOrder,
  resultCount,
  onReset,
}: {
  variant: "inline" | "panel";
  cameraKinds: string[];
  search: string;
  setSearch: (value: string) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  freshnessFilter: string;
  setFreshnessFilter: (value: string) => void;
  /**
   * Optional (F4): the tool pages derive the cutoff from the freshness
   * window inside useCameraFilters (no separate state), so they omit this
   * prop; the home page still owns the cutoff in local state and passes it.
   */
  setFreshnessCutoff?: (value: number | null) => void;
  sortOrder: "alphabetical" | "position";
  setSortOrder: (value: "alphabetical" | "position") => void;
  resultCount: number;
  onReset: () => void;
}) {
  const t = useMessages().directory;
  return (
    <>
      <div className={`directory-controls filters-${variant}`}>
        <div className="record-search">
          <label htmlFor="record-search">{t.searchDirectory}</label>
          <input id="record-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} aria-describedby="record-search-help record-search-count" />
          <p id="record-search-help">{t.searchHelp}</p>
        </div>
        <div className="record-filter">
          <label htmlFor="record-kind-filter">{t.cameraType}</label>
          <select id="record-kind-filter" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
            <option value="all">{t.allTypes}</option>
            {cameraKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </div>
        <div className="record-filter">
          <label htmlFor="record-freshness-filter">{t.freshnessFilter}</label>
          <select id="record-freshness-filter" value={freshnessFilter} onChange={(event) => { const value = event.target.value; setFreshnessFilter(value); setFreshnessCutoff?.(value === "all" ? null : Date.now() - Number.parseInt(value, 10) * 24 * 60 * 60 * 1000); }}>
            <option value="all">{t.freshnessAll}</option>
            <option value="7d">{t.freshness7d}</option>
            <option value="30d">{t.freshness30d}</option>
            <option value="90d">{t.freshness90d}</option>
          </select>
        </div>
        <div className="record-filter">
          <label htmlFor="record-sort">{t.orderRecords}</label>
          <select id="record-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "alphabetical" | "position")}>
            <option value="alphabetical">{t.alphabetical}</option>
            <option value="position">{t.positionOrder}</option>
          </select>
        </div>
        <button type="button" className="text-button" onClick={onReset}>{t.resetFilters} <span aria-hidden="true">→</span></button>
      </div>
      <p className="search-count" id="record-search-count" role="status">{resultCount === 1 ? t.oneRecordFound : `${resultCount} ${t.recordsFound}`}</p>
    </>
  );
}
