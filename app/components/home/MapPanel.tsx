"use client";

import { useCallback } from "react";
import { SurveillanceMap } from "../SurveillanceMap";
import type { MapCamera } from "../SurveillanceMap";
import { publicStatusLabel } from "../../lib/public-status";
import { escapeHtml } from "../../lib/map-viewport";
import type { ViewportBounds } from "../../lib/map-viewport";
import type { Camera } from "../../lib/records";
import { useMessages } from "../LocaleProvider";

type Props = {
  /** Records after the directory filters are applied (map markers). */
  filteredRecords: Camera[];
  /** Records inside the current map viewport (sidebar list). */
  visibleRecords: Camera[];
  selectedId: number;
  onSelect: (id: number) => void;
  /** Map click / pick: starts the report-flow nearby check. */
  onPick: (latitude: number, longitude: number) => void;
  /** Position chosen for a report (or ?focus= deep link): the map focuses it. */
  coordinates: { latitude: number; longitude: number } | null;
  selectedCamera?: Camera;
  loading: boolean;
  /** Page-level status notice, displayed under the map. */
  notice: string;
  /** Where the popup "Report an issue" link points (default: /correggi tool route). */
  issueHref?: string;
  /** Where the sr-only "accessible directory" alternative points (default: /directory tool route). */
  directoryHref?: string;
  /** Instant search input value (same ?q= filter state as the FiltersBar). */
  search: string;
  setSearch: (value: string) => void;
  /** Viewport→list sync: the map reports its current bounds (debounced). */
  onBoundsChange: (bounds: ViewportBounds) => void;
};

/**
 * Map tool section: viewport-synced sidebar list + interactive map, with
 * loading notice and data-export actions. Used by /mappa (F1 route group
 * (tools), redesign t_702c10af); the home hub (F2) renders only the static
 * MapTeaser and never mounts this component (no Leaflet on the hub).
 *
 * Layout: a scrollable left column (search + list of the points currently
 * framed by the map) and a near-fullscreen OSM map. The list is the
 * keyboard/text equivalent of the map: every row selects the marker (pan +
 * popup), and clicking a marker highlights its row (aria-current).
 */
export function MapPanel({ filteredRecords, visibleRecords, selectedId, onSelect, onPick, coordinates, loading, notice, issueHref = "/correggi", directoryHref = "/directory", search, setSearch, onBoundsChange }: Props) {
  const t = useMessages().map;
  const statuses = useMessages().status;

  // Popup content (t_702c10af): title, kind, status label, id, coordinates,
  // address/description and the correction + detail links. Record fields are
  // HTML-escaped — the popup is assembled client-side and must stay inert;
  // the status label comes from the public safe helper (never a raw value).
  const popupHtmlFor = useCallback((camera: MapCamera) => {
    const coords = `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`;
    const address = camera.address ? `<p class="osm-popup-address">${escapeHtml(camera.address)}</p>` : "";
    const description = camera.description ? `<p class="osm-popup-description">${escapeHtml(camera.description)}</p>` : "";
    return [
      `<div class="osm-popup">`,
      `<h3>${escapeHtml(camera.title)}</h3>`,
      `<p class="osm-popup-kind">${escapeHtml(camera.kind)}</p>`,
      `<p class="osm-popup-status"><span class="status-dot ${camera.status}" aria-hidden="true"></span> ${publicStatusLabel(statuses, camera.status, t.unknown)}</p>`,
      `<dl>`,
      `<div><dt>${t.recordId}</dt><dd>${camera.id}</dd></div>`,
      `<div><dt>${t.location}</dt><dd>${coords}</dd></div>`,
      `</dl>`,
      address,
      description,
      `<p class="osm-popup-actions">`,
      `<a href="/records/${camera.id}">${t.popupDetail} <span aria-hidden="true">→</span></a>`,
      `<a href="${issueHref}?record=${camera.id}">${t.reportIssue} <span aria-hidden="true">→</span></a>`,
      `</p>`,
      `</div>`,
    ].join("");
  }, [statuses, t, issueHref]);

  return (
    <section className="map-section map-layout" id="map" aria-labelledby="map-title">
      <div className="section-heading"><div><p className="eyebrow"><span /> {t.livePrototype}</p><h2 id="map-title">{t.mapTitle}</h2></div><p className="section-note">{t.osmBaseMap} · {t.mapCoverageNote}</p></div>
      <div className="prototype-banner"><b>{t.prototypeMode}</b> {t.prototypeBanner}</div>
      <div className="live-map-workspace map-split">
        <aside className="map-sidebar" aria-labelledby="map-list-title">
          <div className="map-list-search">
            <label htmlFor="map-list-search">{t.listSearchLabel}</label>
            <input id="map-list-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.listSearchPlaceholder} aria-describedby="map-list-help" />
            <p id="map-list-help" className="sr-only">{t.listSearchHelp}</p>
          </div>
          <div className="map-list-header">
            <h3 id="map-list-title">{t.listTitle}</h3>
            <p className="map-list-count" role="status">{t.listCount(visibleRecords.length, filteredRecords.length)}</p>
          </div>
          <p id="map-list-sync-help" className="sr-only">{t.listMapSyncHelp}</p>
          <div className="map-list-scroll">
            {visibleRecords.length === 0
              ? <p className="map-list-empty">{t.listEmptyInView}</p>
              : <ul className="map-record-list" aria-describedby="map-list-sync-help">
                  {visibleRecords.map((camera) => {
                    const selected = camera.id === selectedId;
                    return (
                      <li key={camera.id}>
                        <button
                          type="button"
                          className={`map-record${selected ? " selected" : ""}`}
                          aria-current={selected ? "true" : undefined}
                          onClick={() => onSelect(camera.id)}
                        >
                          <span className="map-record-title">{camera.title}</span>
                          <span className="map-record-meta">{camera.kind}{camera.address ? ` · ${camera.address}` : ""}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>}
          </div>
        </aside>
        <div className="map-panel"><SurveillanceMap cameras={filteredRecords} selectedId={selectedId} focusLocation={coordinates} onSelect={onSelect} onPick={onPick} directoryHref={directoryHref} onBoundsChange={onBoundsChange} popupHtmlFor={popupHtmlFor} /><div className="map-hint">{t.mapHint}</div></div>
      </div>
      {loading && <p className="loading-note">{t.loadingRecords}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <div className="data-actions"><a href="/api/cameras?format=geojson" download="opensurveillancedb-cameras.geojson">{t.downloadGeoJson}</a><span>·</span><a href="/api/cameras?format=csv" download="opensurveillancedb-cameras.csv">{t.downloadCsv}</a><span>·</span><a href="/guide">{t.readDataPolicy}</a></div>
    </section>

  );
}
