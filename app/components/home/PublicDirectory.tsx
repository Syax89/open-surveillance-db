"use client";

import { FormEvent, useState } from "react";
import { useLocale, useMessages } from "../LocaleProvider";
import { publicStatusLabel } from "../../lib/public-status";
import { formatDistance } from "../../lib/search";
import type { Camera } from "../../lib/records";

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
  /** Setter only: the cutoff value itself is page state (the map shares it). */
  setFreshnessCutoff: (value: number | null) => void;
  sortOrder: "alphabetical" | "position";
  setSortOrder: (value: "alphabetical" | "position") => void;
  /** Keyboard path: select a record on the map and move focus to it. */
  showRecordOnMap: (id: number) => void;
  /** Place-search hit: focus the map / report position on the area. */
  setCoordinates: (coordinates: { latitude: number; longitude: number } | null) => void;
};

/**
 * Home records section: place search, directory controls (search, kind,
 * freshness, sort) and the accessible record list.
 */
export function PublicDirectory({ filteredRecords, cameraKinds, search, setSearch, kindFilter, setKindFilter, freshnessFilter, setFreshnessFilter, setFreshnessCutoff, sortOrder, setSortOrder, showRecordOnMap, setCoordinates }: Props) {
  const t = useMessages().home;
  const statuses = useMessages().status;
  const { locale } = useLocale();
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResult, setPlaceResult] = useState<PlaceSearchResult | null>(null);

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

  return (
    <section className="records-section" id="records" aria-labelledby="records-title">
      <div className="records-heading"><div><p className="eyebrow"><span /> {t.accessibleDirectory}</p><h2 id="records-title">{t.recordsTitle}</h2><p>{t.recordsIntro}</p></div><a className="text-button" href="#map">{t.useMapInstead} <span aria-hidden="true">↑</span></a></div>
      <div className="place-search"><h3>{t.placeSearchTitle}</h3><p>{t.placeSearchHelp}</p><form className="place-search-form" role="search" onSubmit={searchByPlace}><label htmlFor="place-search">{t.placeSearchLabel}</label><div className="place-search-row"><input id="place-search" type="search" value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} maxLength={200} placeholder={t.placeSearchPlaceholder} autoComplete="off" /><button className="button" type="submit">{t.placeSearchSubmit}</button>{placeResult && placeResult.status !== "loading" ? <button type="button" className="text-button" onClick={() => { setPlaceResult(null); setPlaceQuery(""); }}>{t.placeClearResults} <span aria-hidden="true">→</span></button> : null}</div></form><div aria-live="polite">{placeResult?.status === "loading" && <p className="loading-note" role="status">{t.placeSearchLoading}</p>}{placeResult?.status === "error" && <p className="nearby-error" role="alert">{placeResult.message}</p>}{placeResult?.status === "not-found" && <div className="empty-state"><h3>{t.placeNotFoundTitle}</h3><p>{t.placeNotFoundBody}</p></div>}{(placeResult?.status === "success" || placeResult?.status === "empty") && placeResult.area && <div className="place-results"><p className="search-count" role="status">{t.placeAreaLabel(placeResult.area)}</p>{placeResult.status === "success" && placeResult.records && <><p className="search-count">{t.placeResultsFound(placeResult.records.length)}</p><ul className="record-list">{placeResult.records.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className={`status-dot ${camera.status}`} /> {publicStatusLabel(statuses, camera.status, t.unknown)}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.distance}</dt><dd>{formatDistance(camera.distanceMeters)}</dd></div><div><dt>{t.location}</dt><dd>{camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`}</dd></div><div><dt>{t.lastVerification}</dt><dd>{camera.updated}</dd></div></dl><div className="record-list-actions"><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></div></article></li>)}</ul></>}{placeResult.status === "empty" && <div className="empty-state"><h3>{t.placeEmptyTitle}</h3><p>{t.placeEmptyBody}</p><div className="record-list-actions"><a className="text-button" href="#report">{t.placeEmptySubmit} <span aria-hidden="true">→</span></a><a className="text-button" href="/guide">{t.placeEmptyCoverage} <span aria-hidden="true">→</span></a></div></div>}</div>}</div></div>
      <div className="directory-controls"><div className="record-search"><label htmlFor="record-search">{t.searchDirectory}</label><input id="record-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} aria-describedby="record-search-help record-search-count" /><p id="record-search-help">{t.searchHelp}</p></div><div className="record-filter"><label htmlFor="record-kind-filter">{t.cameraType}</label><select id="record-kind-filter" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">{t.allTypes}</option>{cameraKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></div><div className="record-filter"><label htmlFor="record-freshness-filter">{t.freshnessFilter}</label><select id="record-freshness-filter" value={freshnessFilter} onChange={(event) => { const value = event.target.value; setFreshnessFilter(value); setFreshnessCutoff(value === "all" ? null : Date.now() - Number.parseInt(value, 10) * 24 * 60 * 60 * 1000); }}><option value="all">{t.freshnessAll}</option><option value="7d">{t.freshness7d}</option><option value="30d">{t.freshness30d}</option><option value="90d">{t.freshness90d}</option></select></div><div className="record-filter"><label htmlFor="record-sort">{t.orderRecords}</label><select id="record-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "alphabetical" | "position")}><option value="alphabetical">{t.alphabetical}</option><option value="position">{t.positionOrder}</option></select></div></div>
      <p className="search-count" id="record-search-count" role="status">{filteredRecords.length === 1 ? t.oneRecordFound : `${filteredRecords.length} ${t.recordsFound}`}</p>
      {filteredRecords.length ? <ul className="record-list">{filteredRecords.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className={`status-dot ${camera.status}`} /> {publicStatusLabel(statuses, camera.status, t.unknown)}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.recordId}</dt><dd>{camera.id}</dd></div><div><dt>{t.source}</dt><dd>{camera.source}</dd></div><div><dt>{t.lastVerification}</dt><dd>{camera.updated}</dd></div><div><dt>{t.location}</dt><dd>{camera.address || `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`}</dd></div>{camera.manufacturer && <div><dt>{t.manufacturerLabel}</dt><dd>{camera.manufacturer}</dd></div>}{camera.observedOn && <div><dt>{t.observedOnLabel}</dt><dd>{camera.observedOn}</dd></div>}</dl><div className="record-list-actions"><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></div></article></li>)}</ul> : <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p><button type="button" className="text-button" onClick={() => setSearch("")}>{t.clearSearch} <span aria-hidden="true">→</span></button></div>}
    </section>

  );
}
