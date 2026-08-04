"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../LocaleProvider";
import { useMessages } from "../../lib/use-messages";
import { publicStatusLabel } from "../../lib/public-status";
import { formatDistance } from "../../lib/search";
import { formatPublicDate } from "../../lib/format-date";
import type { Camera } from "../../lib/records";
import { RecordCard } from "../RecordCard";
import { FiltersBar } from "../FiltersBar";
import { EmptyState } from "../EmptyState";
import { usePlaceSearch } from "../../lib/usePlaceSearch";
import { DirectoryCatalog } from "../tools/DirectoryCatalog";

type Props = {
  /** Records after search/kind/freshness filters and sorting. */
  filteredRecords: Camera[];
  /** Distinct camera kinds present in the records (kind filter options). */
  cameraKinds: string[];
  search: string;
  setSearch: (value: string) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  freshnessFilter: string;
  setFreshnessFilter: (value: string) => void;
  /** Optional (F4): tool pages derive the cutoff from the freshness window inside useCameraFilters. */
  setFreshnessCutoff?: (value: number | null) => void;
  sortOrder: "alphabetical" | "position" | "useful" | "recent" | "confirmations";
  setSortOrder: (value: "alphabetical" | "position" | "useful" | "recent" | "confirmations") => void;
  stateFilter?: "all" | "confirmed" | "never"; setStateFilter?: (value: "all" | "confirmed" | "never") => void;
  /** Optional (t_f13fcb1c): /directory result page (?page=, URL-backed). */
  page?: number;
  /** Optional (t_f13fcb1c): /directory pagination setter. */
  setPage?: (value: number) => void;
  /** Keyboard path: select a record on the map and move focus to it. */
  showRecordOnMap: (id: number) => void;
  /** Place-search hit: focus the map / report position on the area. */
  setCoordinates: (coordinates: { latitude: number; longitude: number } | null) => void;
  /** Atomic reset for URL-backed filters (one replace, unlike the home setters). */
  onResetFilters?: () => void;
  /** "Use the map instead" target: home anchor (#map) or /mappa route. */
  mapHref?: string;
  /** "Submit a private observation" target: home anchor (#report) or /segnala route. */
  reportHref?: string;
  /** P1-5 (F5): tool pages own the page header via .tool-heading (h1). */
  showHeading?: boolean;
  /**
   * t_127492f1/t_f13fcb1c: "hub" (default) = the historical home section,
   * byte-identical (records-heading + place-search block + FiltersBar inline
   * + card grid); "catalog" = the /directory browse layout (DirectoryCatalog).
   */
  variant?: "hub" | "catalog";
  /** Optional (catalog): download links for the filtered set (CSV/GeoJSON). */
  exportHrefs?: { csv: string; geojson: string } | null;
};

/**
 * Public directory section (F1 route group (tools)): place search, shared
 * FiltersBar and the accessible record list. Reads the `directory` i18n
 * bundle; reused by the home page (anchor fallback, hub mode) and by
 * /directory (catalog mode — the actual layout lives in DirectoryCatalog).
 * The place-search flow lives in the shared usePlaceSearch hook.
 */
export function PublicDirectory({ filteredRecords, cameraKinds, search, setSearch, kindFilter, setKindFilter, freshnessFilter, setFreshnessFilter, setFreshnessCutoff, sortOrder, setSortOrder, stateFilter, setStateFilter, page = 1, setPage, showRecordOnMap, setCoordinates, onResetFilters, mapHref = "#map", reportHref = "#report", showHeading = true, variant = "hub", exportHrefs = null }: Props) {
  const t = useMessages().directory;
  const statuses = useMessages().status;
  const { locale } = useLocale();
  const place = usePlaceSearch(t, locale, (coordinates) => setCoordinates(coordinates));
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function cardActions(camera: Camera) {
    return <><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></>;
  }

  function resetFilters() {
    setSearch("");
    setKindFilter("all");
    setFreshnessFilter("all");
    setFreshnessCutoff?.(null);
    setSortOrder("alphabetical"); setStateFilter?.("all");
  }

  if (variant === "catalog") {
    return (
      <DirectoryCatalog
        filteredRecords={filteredRecords}
        cameraKinds={cameraKinds}
        search={search}
        setSearch={setSearch}
        kindFilter={kindFilter}
        setKindFilter={setKindFilter}
        freshnessFilter={freshnessFilter}
        setFreshnessFilter={setFreshnessFilter}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        stateFilter={stateFilter} setStateFilter={setStateFilter}
        page={page}
        setPage={setPage}
        showRecordOnMap={showRecordOnMap}
        setCoordinates={setCoordinates}
        onResetFilters={onResetFilters ?? resetFilters}
        reportHref={reportHref}
        exportHrefs={exportHrefs}
      />
    );
  }

  return (
    <section className="records-section" id="records" aria-labelledby={showHeading ? "records-title" : undefined} aria-label={showHeading ? undefined : t.accessibleDirectory}>
      {offline && <div className="offline-state" role="status"><b>{t.offlineTitle}.</b> {t.offlineBody} <button type="button" className="text-button" onClick={() => window.location.reload()}>{t.offlineAction} <span aria-hidden="true">→</span></button></div>}
      {showHeading ? <div className="records-heading"><div><p className="eyebrow"><span /> {t.accessibleDirectory}</p><h2 id="records-title">{t.recordsTitle}</h2><p>{t.recordsIntro}</p></div><a className="text-button" href={mapHref}>{t.useMapInstead} <span aria-hidden="true">↑</span></a></div> : <div className="records-heading records-heading-actions"><a className="text-button" href={mapHref}>{t.useMapInstead} <span aria-hidden="true">↑</span></a></div>}
      <div className="place-search">
        {showHeading ? <h3>{t.placeSearchTitle}</h3> : <h2 className="place-search-title">{t.placeSearchTitle}</h2>}
        <p>{t.placeSearchHelp}</p>
        <form className="place-search-form" role="search" onSubmit={place.searchByPlace}>
          <label htmlFor="place-search">{t.placeSearchLabel}</label>
          <div className="place-search-row">
            <input id="place-search" type="search" value={place.placeQuery} onChange={(event) => place.setPlaceQuery(event.target.value)} maxLength={200} placeholder={t.placeSearchPlaceholder} autoComplete="off" />
            <button className="button" type="submit">{t.placeSearchSubmit}</button>
            {place.placeResult && place.placeResult.status !== "loading" ? <button type="button" className="text-button" onClick={place.clearPlaceSearch}>{t.placeClearResults} <span aria-hidden="true">→</span></button> : null}
          </div>
        </form>
        <div aria-live="polite">
          {place.placeResult?.status === "loading" && <p className="loading-note" role="status">{t.placeSearchLoading}</p>}
          {place.placeResult?.status === "error" && <p className="nearby-error" role="alert">{place.placeResult.message}</p>}
          {place.placeResult?.status === "not-found" && <EmptyState title={t.placeNotFoundTitle} body={t.placeNotFoundBody} />}
          {(place.placeResult?.status === "success" || place.placeResult?.status === "empty") && place.placeResult.area && <div className="place-results">
            <p className="search-count" role="status">{t.placeAreaLabel(place.placeResult.area)}</p>
            {place.placeResult.status === "success" && place.placeResult.records && <><p className="search-count">{t.placeResultsFound(place.placeResult.records.length)}</p><ul className="record-list">{place.placeResult.records.map((camera) => <li key={camera.id}><RecordCard camera={camera} statusLabel={publicStatusLabel(statuses, camera.status, t.unknown)} facts={[{ label: t.distance, value: formatDistance(camera.distanceMeters) }, { label: t.location, value: camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}` }, { label: t.lastVerification, value: camera.status === "demo" ? t.demoUpdated : formatPublicDate(camera.updated, locale) }]} actions={cardActions(camera)} /></li>)}</ul></>}
          </div>}
        </div>
      </div>
      <FiltersBar variant="inline" cameraKinds={cameraKinds} search={search} setSearch={setSearch} kindFilter={kindFilter} setKindFilter={setKindFilter} freshnessFilter={freshnessFilter} setFreshnessFilter={setFreshnessFilter} setFreshnessCutoff={setFreshnessCutoff} sortOrder={sortOrder} setSortOrder={setSortOrder} resultCount={filteredRecords.length} onReset={onResetFilters ?? resetFilters} />
      {filteredRecords.length ? <ul className="record-list">{filteredRecords.map((camera) => <li key={camera.id}><RecordCard camera={camera} statusLabel={publicStatusLabel(statuses, camera.status, t.unknown)} facts={[{ label: t.recordId, value: camera.id }, { label: t.source, value: camera.status === "demo" ? t.demoSource : camera.source }, { label: t.lastVerification, value: camera.status === "demo" ? t.demoUpdated : formatPublicDate(camera.updated, locale) }, { label: t.location, value: camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}` }, ...(camera.manufacturer ? [{ label: t.manufacturerLabel, value: camera.manufacturer }] : []), ...(camera.observedOn ? [{ label: t.observedOnLabel, value: formatPublicDate(camera.observedOn, locale) }] : [])]} actions={cardActions(camera)} /></li>)}</ul> : <EmptyState title={t.emptyTitle} body={t.emptyBody} action={<p className="empty-state-actions"><button type="button" className="text-button" onClick={() => setSearch("")}>{t.clearSearch} <span aria-hidden="true">→</span></button><a className="text-button" href={reportHref}>{t.submitObservation} <span aria-hidden="true">→</span></a></p>} />}
    </section>
  );
}
