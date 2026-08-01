"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocale, useMessages } from "../LocaleProvider";
import { publicStatusLabel } from "../../lib/public-status";
import { formatDistance } from "../../lib/search";
import type { Camera } from "../../lib/records";
import { RecordCard } from "../RecordCard";
import { FiltersBar } from "../FiltersBar";
import { EmptyState } from "../EmptyState";

type PlaceSearchArea = { kind: "coordinates" | "place"; displayName?: string; latitude: number; longitude: number; radiusMeters: number; radiusLabel: string };

type PlaceSearchResult = {
  status: "loading" | "success" | "empty" | "not-found" | "error";
  message?: string;
  area?: PlaceSearchArea;
  records?: Array<Camera & { distanceMeters: number }>;
};

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
  /**
   * Optional (F4): the tool pages derive the cutoff from the freshness
   * window inside useCameraFilters; the home page still owns it locally.
   */
  setFreshnessCutoff?: (value: number | null) => void;
  sortOrder: "alphabetical" | "position";
  setSortOrder: (value: "alphabetical" | "position") => void;
  /** Keyboard path: select a record on the map and move focus to it. */
  showRecordOnMap: (id: number) => void;
  /** Place-search hit: focus the map / report position on the area. */
  setCoordinates: (coordinates: { latitude: number; longitude: number } | null) => void;
  /**
   * Optional (F4): atomic reset for URL-backed filters (useCameraFilters)
   * — ONE replace, unlike the local multi-setter reset used by the home
   * page. Without it (home) the internal resetFilters calls the setters,
   * which is correct for local state but would re-apply stale dimensions
   * when the setters write the URL.
   */
  onResetFilters?: () => void;
  /** "Use the map instead" target: home anchor (#map) or /mappa route. */
  mapHref?: string;
  /** "Submit a private observation" target: home anchor (#report) or /segnala route. */
  reportHref?: string;
};

/**
 * Public directory section (F1 route group (tools)): place search, the
 * shared FiltersBar (search, kind, freshness, sort, reset, counter) and the
 * accessible record list. Every record card is the shared RecordCard
 * component. Reads the `directory` i18n bundle; reused by the home page
 * (anchor fallback) and by /directory.
 */
export function PublicDirectory({ filteredRecords, cameraKinds, search, setSearch, kindFilter, setKindFilter, freshnessFilter, setFreshnessFilter, setFreshnessCutoff, sortOrder, setSortOrder, showRecordOnMap, setCoordinates, onResetFilters, mapHref = "#map", reportHref = "#report" }: Props) {
  const t = useMessages().directory;
  const statuses = useMessages().status;
  const { locale } = useLocale();
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResult, setPlaceResult] = useState<PlaceSearchResult | null>(null);
  // Offline state: the directory keeps working (records are already on the
  // page — "the last loaded records"); the notice explains that searches and
  // updates need a connection. SSR-safe: navigator is undefined on the
  // server, so the banner never appears in first paint.
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

  // Action row shared by the directory and the place-search cards: select the
  // record on the map (keyboard path) or open its detail page.
  function cardActions(camera: Camera) {
    return <><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></>;
  }

  // Locality/address/coordinate search: resolve the place server-side
  // (coordinates are parsed locally, other text is geocoded), then render the
  // searched area, the result count, and a truthful zero-result state.
  async function searchByPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = placeQuery.trim();
    if (!query) {
      setPlaceResult({ status: "error", message: t.placeSearchEmptyQuery });
      return;
    }
    setPlaceResult({ status: "loading" });
    try {
      const params = new URLSearchParams({ q: query, lang: locale });
      const response = await fetch(`/api/cameras/search?${params}`);
      if (response.status === 404) {
        setPlaceResult({ status: "not-found", message: t.placeNotFoundTitle });
        return;
      }
      if (response.status === 429) {
        setPlaceResult({ status: "error", message: t.placeSearchRateLimited });
        return;
      }
      if (!response.ok) {
        setPlaceResult({ status: "error", message: t.placeSearchUnavailable });
        return;
      }
      const data = await response.json() as { area: PlaceSearchArea; records: Array<Camera & { distanceMeters: number }> };
      setPlaceResult({ status: data.records.length ? "success" : "empty", area: data.area, records: data.records });
      if (data.records.length) setCoordinates({ latitude: data.area.latitude, longitude: data.area.longitude });
    } catch {
      setPlaceResult({ status: "error", message: t.placeSearchUnavailable });
    }
  }

  function resetFilters() {
    setSearch("");
    setKindFilter("all");
    setFreshnessFilter("all");
    setFreshnessCutoff?.(null);
    setSortOrder("alphabetical");
  }

  return (
    <section className="records-section" id="records" aria-labelledby="records-title">
      {offline && <div className="offline-state" role="status"><b>{t.offlineTitle}.</b> {t.offlineBody} <button type="button" className="text-button" onClick={() => window.location.reload()}>{t.offlineAction} <span aria-hidden="true">→</span></button></div>}
      <div className="records-heading"><div><p className="eyebrow"><span /> {t.accessibleDirectory}</p><h2 id="records-title">{t.recordsTitle}</h2><p>{t.recordsIntro}</p></div><a className="text-button" href={mapHref}>{t.useMapInstead} <span aria-hidden="true">↑</span></a></div>
      <div className="place-search"><h3>{t.placeSearchTitle}</h3><p>{t.placeSearchHelp}</p><form className="place-search-form" role="search" onSubmit={searchByPlace}><label htmlFor="place-search">{t.placeSearchLabel}</label><div className="place-search-row"><input id="place-search" type="search" value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} maxLength={200} placeholder={t.placeSearchPlaceholder} autoComplete="off" /><button className="button" type="submit">{t.placeSearchSubmit}</button>{placeResult && placeResult.status !== "loading" ? <button type="button" className="text-button" onClick={() => { setPlaceResult(null); setPlaceQuery(""); }}>{t.placeClearResults} <span aria-hidden="true">→</span></button> : null}</div></form><div aria-live="polite">{placeResult?.status === "loading" && <p className="loading-note" role="status">{t.placeSearchLoading}</p>}{placeResult?.status === "error" && <p className="nearby-error" role="alert">{placeResult.message}</p>}{placeResult?.status === "not-found" && <EmptyState title={t.placeNotFoundTitle} body={t.placeNotFoundBody} />}{(placeResult?.status === "success" || placeResult?.status === "empty") && placeResult.area && <div className="place-results"><p className="search-count" role="status">{t.placeAreaLabel(placeResult.area)}</p>{placeResult.status === "success" && placeResult.records && <><p className="search-count">{t.placeResultsFound(placeResult.records.length)}</p><ul className="record-list">{placeResult.records.map((camera) => <li key={camera.id}><RecordCard camera={camera} statusLabel={publicStatusLabel(statuses, camera.status, t.unknown)} facts={[{ label: t.distance, value: formatDistance(camera.distanceMeters) }, { label: t.location, value: camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}` }, { label: t.lastVerification, value: camera.updated }]} actions={cardActions(camera)} /></li>)}</ul></>}{placeResult.status === "empty" && <EmptyState title={t.placeEmptyTitle} body={t.placeEmptyBody} action={<p className="place-empty-actions"><a className="text-button" href={reportHref}>{t.placeEmptySubmit} <span aria-hidden="true">→</span></a><a className="text-button" href="/guide">{t.placeEmptyCoverage} <span aria-hidden="true">→</span></a></p>} />}</div>}</div></div>
      <FiltersBar variant="inline" cameraKinds={cameraKinds} search={search} setSearch={setSearch} kindFilter={kindFilter} setKindFilter={setKindFilter} freshnessFilter={freshnessFilter} setFreshnessFilter={setFreshnessFilter} setFreshnessCutoff={setFreshnessCutoff} sortOrder={sortOrder} setSortOrder={setSortOrder} resultCount={filteredRecords.length} onReset={onResetFilters ?? resetFilters} />
      {filteredRecords.length ? <ul className="record-list">{filteredRecords.map((camera) => <li key={camera.id}><RecordCard camera={camera} statusLabel={publicStatusLabel(statuses, camera.status, t.unknown)} facts={[{ label: t.recordId, value: camera.id }, { label: t.source, value: camera.source }, { label: t.lastVerification, value: camera.updated }, { label: t.location, value: camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}` }, ...(camera.manufacturer ? [{ label: t.manufacturerLabel, value: camera.manufacturer }] : []), ...(camera.observedOn ? [{ label: t.observedOnLabel, value: camera.observedOn }] : [])]} actions={cardActions(camera)} /></li>)}</ul> : <EmptyState title={t.emptyTitle} body={t.emptyBody} action={<button type="button" className="text-button" onClick={() => setSearch("")}>{t.clearSearch} <span aria-hidden="true">→</span></button>} />}
    </section>

  );
}
