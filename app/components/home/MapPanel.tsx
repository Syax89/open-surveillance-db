"use client";

import { SurveillanceMap } from "../SurveillanceMap";
import { publicStatusLabel } from "../../lib/public-status";
import type { Camera } from "../../lib/records";
import { useMessages } from "../LocaleProvider";

type Props = {
  /** Records after the directory filters are applied (map + card). */
  filteredRecords: Camera[];
  selectedId: number;
  onSelect: (id: number) => void;
  /** Map click / pick: starts the report-flow nearby check. */
  onPick: (latitude: number, longitude: number) => void;
  /** Position chosen for a report: the map focuses it. */
  coordinates: { latitude: number; longitude: number } | null;
  selectedCamera?: Camera;
  loading: boolean;
  /** Page-level status notice, displayed under the map. */
  notice: string;
  /** Where the "Report an issue" card action points (home anchor vs /correggi). */
  issueHref?: string;
  /** Where the sr-only "accessible directory" alternative points (home anchor vs /directory). */
  directoryHref?: string;
};

/**
 * Map tool section: interactive map, selected-record card, loading
 * notice and data-export actions. Reused by the home page (anchor
 * fallback, F2 simplifies) and by /mappa (F1 route group (tools)).
 */
export function MapPanel({ filteredRecords, selectedId, onSelect, onPick, coordinates, selectedCamera, loading, notice, issueHref = "#correction", directoryHref = "#records" }: Props) {
  const t = useMessages().map;
  const statuses = useMessages().status;
  return (
    <section className="map-section" id="map" aria-labelledby="map-title">
      <div className="section-heading"><div><p className="eyebrow"><span /> {t.livePrototype}</p><h2 id="map-title">{t.mapTitle}</h2></div><p className="section-note">{t.osmBaseMap} · {t.mapCoverageNote}</p></div>
      <div className="prototype-banner"><b>{t.prototypeMode}</b> {t.prototypeBanner}</div>
      <div className="live-map-workspace"><div className="map-panel"><SurveillanceMap cameras={filteredRecords} selectedId={selectedId} focusLocation={coordinates} onSelect={onSelect} onPick={onPick} directoryHref={directoryHref} /><div className="map-hint">{t.mapHint}</div></div>
      {selectedCamera && <article className="camera-card" aria-live="polite"><div className="card-topline"><span className={`status-dot ${selectedCamera.status}`} /> {publicStatusLabel(statuses, selectedCamera.status, t.unknown)}</div><h3>{selectedCamera.title}</h3><p>{selectedCamera.kind}</p><dl><div><dt>{t.recordId}</dt><dd>{selectedCamera.id}</dd></div><div><dt>{t.source}</dt><dd>{selectedCamera.source}</dd></div><div><dt>{t.freshness}</dt><dd>{selectedCamera.updated}</dd></div><div><dt>{t.location}</dt><dd>{selectedCamera.latitude.toFixed(4)}, {selectedCamera.longitude.toFixed(4)}</dd></div></dl><p className="record-description">{selectedCamera.description}</p><a className="text-button" href={issueHref}>{t.reportIssue} <span aria-hidden="true">→</span></a></article>}</div>
      {loading && <p className="loading-note">{t.loadingRecords}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <div className="data-actions"><a href="/api/cameras?format=geojson" download="opensurveillancedb-cameras.geojson">{t.downloadGeoJson}</a><span>·</span><a href="/api/cameras?format=csv" download="opensurveillancedb-cameras.csv">{t.downloadCsv}</a><span>·</span><a href="/guide">{t.readDataPolicy}</a></div>
    </section>

  );
}
