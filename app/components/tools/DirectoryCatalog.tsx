"use client";

import { useEffect, useState } from "react";
import { useLocale, useMessages } from "../LocaleProvider";
import { publicStatusLabel } from "../../lib/public-status";
import { formatDistance } from "../../lib/search";
import { formatPublicDate } from "../../lib/format-date";
import type { Camera } from "../../lib/records";
import { RecordCard } from "../RecordCard";
import { FiltersBar } from "../FiltersBar";
import { EmptyState } from "../EmptyState";
import { usePlaceSearch } from "../../lib/usePlaceSearch";

type Props = {
  filteredRecords: Camera[];
  cameraKinds: string[];
  search: string;
  setSearch: (value: string) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  freshnessFilter: string;
  setFreshnessFilter: (value: string) => void;
  sortOrder: "alphabetical" | "position";
  setSortOrder: (value: "alphabetical" | "position") => void;
  /** Keyboard path: select a record on the map and move focus to it. */
  showRecordOnMap: (id: number) => void;
  /** Place-search hit: focus the map / report position on the area. */
  setCoordinates: (coordinates: { latitude: number; longitude: number } | null) => void;
  /** Atomic reset for URL-backed filters (useCameraFilters). */
  onResetFilters: () => void;
  /** "Submit a private observation" target (empty states). */
  reportHref?: string;
  /** Download links for the filtered set (CSV/GeoJSON). */
  exportHrefs?: { csv: string; geojson: string } | null;
};

/**
 * /directory catalog layout (t_127492f1): the flat, scannable directory —
 * FiltersBar "bare" (controls only) → .directory-meta (count + export +
 * place-search trigger) → collapsible place-search panel → one-column flat
 * rows (RecordCard inside `.directory-tool .record-list`, styled
 * contextually). One result flow: a successful place search replaces the
 * list (banner + Distance fact); empty/not-found render truthful EmptyState.
 * The home hub keeps the classic section via PublicDirectory (hub mode).
 */
export function DirectoryCatalog({ filteredRecords, cameraKinds, search, setSearch, kindFilter, setKindFilter, freshnessFilter, setFreshnessFilter, sortOrder, setSortOrder, showRecordOnMap, setCoordinates, onResetFilters, reportHref = "/segnala", exportHrefs = null }: Props) {
  const t = useMessages().directory;
  const statuses = useMessages().status;
  const { locale } = useLocale();
  const place = usePlaceSearch(t, locale, (coordinates) => setCoordinates(coordinates));
  // The place-search lives in a collapsible panel (unhidden by the
  // .directory-meta trigger) so /directory has exactly ONE visible search
  // input at a time.
  const [placeOpen, setPlaceOpen] = useState(false);
  // Offline state: the directory keeps working (records are already on the
  // page — "the last loaded records"). SSR-safe: navigator is undefined on
  // the server, so the banner never appears in first paint.
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

  // Action row shared by the catalog and the place-search rows: select the
  // record on the map (keyboard path) or open its detail page.
  function cardActions(camera: Camera) {
    return <><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></>;
  }

  // The catalog fact set keeps the record ID (the map's text equivalent must
  // expose it — rendered-html contract) plus the three provenance facts;
  // optional manufacturer/observed-on stay on the detail page.
  function mainFacts(camera: Camera) {
    return [
      { label: t.recordId, value: camera.id },
      { label: t.source, value: camera.source },
      { label: t.lastVerification, value: formatPublicDate(camera.updated, locale) },
      { label: t.location, value: camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}` },
    ];
  }

  // Locality/address/coordinate search lives in the shared usePlaceSearch
  // hook (same flow as the home hub section — one source of truth).

  // One result flow: a successful place search replaces the filtered list
  // (same list, distance first); empty/not-found render their own truthful
  // EmptyState; the standard list returns once cleared.
  const placeActive = place.placeResult?.status === "success";
  const placeDone = place.placeResult !== null && ["success", "empty", "not-found"].includes(place.placeResult.status);
  const placeRecords = placeActive && place.placeResult?.records ? place.placeResult.records : [];
  const showList = placeActive || (!placeDone && filteredRecords.length > 0);
  const countLabel = placeDone
    ? t.placeResultsFound(placeActive ? placeRecords.length : 0)
    : filteredRecords.length === 1 ? t.oneRecordFound : `${filteredRecords.length} ${t.recordsFound}`;

  return (
    <section className="records-section" id="records" aria-label={t.accessibleDirectory}>
      {offline && <div className="offline-state" role="status"><b>{t.offlineTitle}.</b> {t.offlineBody} <button type="button" className="text-button" onClick={() => window.location.reload()}>{t.offlineAction} <span aria-hidden="true">→</span></button></div>}
      <FiltersBar variant="bare" cameraKinds={cameraKinds} search={search} setSearch={setSearch} kindFilter={kindFilter} setKindFilter={setKindFilter} freshnessFilter={freshnessFilter} setFreshnessFilter={setFreshnessFilter} sortOrder={sortOrder} setSortOrder={setSortOrder} resultCount={filteredRecords.length} onReset={onResetFilters} />
      {/* Results meta row (t_127492f1): count + export + place-search
          trigger — the "filtri → count/export → lista" order the CEO
          asked for. The count keeps the historical id and role=status so
          the input's aria-describedby and the AT announcements work as
          before. */}
      <div className="directory-meta">
        <p className="search-count" id="record-search-count" role="status">{countLabel}</p>
        <div className="directory-meta-actions">
          <button type="button" className="text-button" aria-expanded={placeOpen} aria-controls="directory-place-panel" onClick={() => setPlaceOpen((value) => !value)}>{placeOpen ? t.placeHide : t.searchNearPlace} <span aria-hidden="true">↓</span></button>
          {exportHrefs && (
            <div className="data-actions" aria-describedby="directory-export-hint"><a href={exportHrefs.csv}>{t.exportCsv} <span aria-hidden="true">→</span></a><span aria-hidden="true">·</span><a href={exportHrefs.geojson}>{t.exportGeoJson} <span aria-hidden="true">→</span></a></div>
          )}
          <p className="sr-only" id="directory-export-hint">{t.exportHint}</p>
        </div>
      </div>
      {/* Place-search panel (collapsed until the trigger opens it): keeps
          the historical ids/classes so the a11y suite and the AT labels
          keep matching. Collapse via the .place-search-closed class — the
          raw `hidden` attribute is forbidden by the pages-render leak
          contract; display:none keeps the form out of the tab order and
          the a11y tree while closed. */}
      <div className={placeOpen ? "place-search" : "place-search place-search-closed"} id="directory-place-panel">
        <h2 className="place-search-title">{t.placeSearchTitle}</h2>
        <p>{t.placeSearchHelp}</p>
        <form className="place-search-form" role="search" onSubmit={place.searchByPlace}><label htmlFor="place-search">{t.placeSearchLabel}</label><div className="place-search-row"><input id="place-search" type="search" value={place.placeQuery} onChange={(event) => place.setPlaceQuery(event.target.value)} maxLength={200} placeholder={t.placeSearchPlaceholder} autoComplete="off" /><button className="button" type="submit">{t.placeSearchSubmit}</button>{place.placeResult && place.placeResult.status !== "loading" ? <button type="button" className="text-button" onClick={place.clearPlaceSearch}>{t.placeClearResults} <span aria-hidden="true">→</span></button> : null}</div></form>
        <div aria-live="polite">{place.placeResult?.status === "loading" && <p className="loading-note" role="status">{t.placeSearchLoading}</p>}{place.placeResult?.status === "error" && <p className="nearby-error" role="alert">{place.placeResult.message}</p>}</div>
      </div>
      {/* sr-only results heading: keeps the h1 → h2 → h3 ladder on the
          tool page now that the place-search h2 is a collapsed panel. */}
      <h2 className="sr-only">{t.resultsRegion}</h2>
      {place.placeResult?.status === "not-found" && <EmptyState title={t.placeNotFoundTitle} body={t.placeNotFoundBody} />}
      {place.placeResult?.status === "empty" && <EmptyState title={t.placeEmptyTitle} body={t.placeEmptyBody} action={<a className="text-button" href={reportHref}>{t.placeEmptySubmit} <span aria-hidden="true">→</span></a>} />}
      {placeActive && place.placeResult?.area && (
        <div className="place-banner" role="status">
          <p className="search-count">{t.placeAreaLabel(place.placeResult.area)}</p>
          <button type="button" className="text-button" onClick={place.clearPlaceSearch}>{t.placeClearResults} <span aria-hidden="true">→</span></button>
        </div>
      )}
      {showList ? <ul className="record-list">{(placeActive ? placeRecords : filteredRecords).map((camera) => <li key={camera.id}><RecordCard camera={camera} statusLabel={publicStatusLabel(statuses, camera.status, t.unknown)} facts={placeActive ? [{ label: t.distance, value: formatDistance((camera as Camera & { distanceMeters: number }).distanceMeters) }, { label: t.location, value: camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}` }, { label: t.lastVerification, value: formatPublicDate(camera.updated, locale) }] : mainFacts(camera)} actions={cardActions(camera)} /></li>)}</ul> : !placeDone && <EmptyState title={t.emptyTitle} body={t.emptyBody} action={<p className="empty-state-actions"><button type="button" className="text-button" onClick={() => setSearch("")}>{t.clearSearch} <span aria-hidden="true">→</span></button><a className="text-button" href={reportHref}>{t.submitObservation} <span aria-hidden="true">→</span></a></p>} />}
    </section>
  );
}
