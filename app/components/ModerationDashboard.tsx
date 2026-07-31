"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LocaleToggle, useLocale, useMessages } from "./LocaleProvider";

type CameraInQueue = {
  id: number;
  title: string;
  kind: string;
  manufacturer?: string | null;
  observedOn?: string | null;
  publishManufacturer?: boolean;
  publishObservedOn?: boolean;
  address?: string | null;
  notes?: string;
  latitude: number;
  longitude: number;
  status: string;
  source?: string;
  createdAt?: string;
  updated?: string;
};

type CorrectionInQueue = {
  id: number;
  cameraId?: number | null;
  issueType: string;
  message: string;
  contact?: string | null;
  status: string;
  createdAt?: string;
};

type ModerationEvent = {
  id?: number;
  entity?: string;
  entityId?: number;
  previousStatus?: string;
  newStatus?: string;
  action?: string;
  reasonCode?: string;
  reason?: string;
  note?: string | null;
  actor?: string;
  createdAt?: string;
  timestamp?: string;
};

type QueuePayload = {
  cameraReports?: CameraInQueue[];
  publishedCameras?: CameraInQueue[];
  reviewCameras?: CameraInQueue[];
  correctionRequests?: CorrectionInQueue[];
  recentEvents?: ModerationEvent[];
  error?: string;
};

type QueueEntity = "camera" | "correction";
type ModerationAction = "approve" | "reject" | "hide" | "mark-stale" | "reverify";
type ReasonCode = "verified-public-infrastructure" | "insufficient-evidence" | "duplicate" | "private-or-sensitive-location" | "inaccurate-or-outdated" | "privacy-or-safety-concern" | "other";

const reasonOptions: { value: ReasonCode }[] = [
  { value: "verified-public-infrastructure" },
  { value: "insufficient-evidence" },
  { value: "duplicate" },
  { value: "private-or-sensitive-location" },
  { value: "inaccurate-or-outdated" },
  { value: "privacy-or-safety-concern" },
  { value: "other" },
];

export function ModerationDashboard() {
  const { locale } = useLocale();
  const t = useMessages().moderation;
  const [cameras, setCameras] = useState<CameraInQueue[]>([]);
  const [publishedCameras, setPublishedCameras] = useState<CameraInQueue[]>([]);
  const [reviewCameras, setReviewCameras] = useState<CameraInQueue[]>([]);
  const [corrections, setCorrections] = useState<CorrectionInQueue[]>([]);
  const [recentEvents, setRecentEvents] = useState<ModerationEvent[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [metadataPublication, setMetadataPublication] = useState<Record<string, { manufacturer: boolean; observedOn: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function readableDate(value?: string) {
    if (!value) return t.timeUnavailable;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === "it" ? "it-IT" : "en-US");
  }

  function actionLabel(action: ModerationAction) { return t.action[action]; }
  function readableAction(action?: string) { return action && action in t.actionPast ? t.actionPast[action as ModerationAction] : action ?? t.decisionRecorded; }
  function readableReason(reasonCode?: string) { return reasonCode && reasonCode in t.reasons ? t.reasons[reasonCode as ReasonCode] : reasonCode ?? t.timeUnavailable; }
  function readableStatus(status?: string) { return status && status in t.statusLabels ? t.statusLabels[status as keyof typeof t.statusLabels] : status ?? t.recorded; }

  function cameraMetadata(camera: CameraInQueue) {
    if (!camera.manufacturer && !camera.observedOn) return null;
    return <dl className="camera-metadata">
      {camera.manufacturer && <div><dt>{t.manufacturer}</dt><dd>{camera.manufacturer}</dd></div>}
      {camera.observedOn && <div><dt>{t.observedOn}</dt><dd>{camera.observedOn}</dd></div>}
    </dl>;
  }

  function metadataPublicationFields(camera: CameraInQueue) {
    if (!camera.manufacturer && !camera.observedOn) return null;
    const key = `camera-${camera.id}`;
    const choices = metadataPublication[key] ?? { manufacturer: false, observedOn: false };
    return <fieldset className="metadata-publication">
      <legend>{t.metadataPublication}</legend>
      <p>{t.metadataPublicationHelp}</p>
      {camera.manufacturer && <label className="check-label"><input type="checkbox" checked={choices.manufacturer} onChange={(event) => setMetadataPublication((items) => ({ ...items, [key]: { ...choices, manufacturer: event.target.checked } }))} /> <span>{t.publishManufacturer}: {camera.manufacturer}</span></label>}
      {camera.observedOn && <label className="check-label"><input type="checkbox" checked={choices.observedOn} onChange={(event) => setMetadataPublication((items) => ({ ...items, [key]: { ...choices, observedOn: event.target.checked } }))} /> <span>{t.publishObservedOn}: {camera.observedOn}</span></label>}
    </fieldset>;
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/moderation", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as QueuePayload;
        if (!response.ok) throw new Error(data.error || t.loadError);
        setCameras(Array.isArray(data.cameraReports) ? data.cameraReports : []);
        setPublishedCameras(Array.isArray(data.publishedCameras) ? data.publishedCameras : []);
        setReviewCameras(Array.isArray(data.reviewCameras) ? data.reviewCameras : []);
        setCorrections(Array.isArray(data.correctionRequests) ? data.correctionRequests : []);
        setRecentEvents(Array.isArray(data.recentEvents) ? data.recentEvents : []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [t.loadError]);

  const total = cameras.length + corrections.length;
  const summary = useMemo(() => t.awaiting(total), [t, total]);

  async function decide(entity: QueueEntity, id: number, action: ModerationAction) {
    const key = `${entity}-${id}`;
    const reasonCode = reasons[key];
    const note = notes[key]?.trim();
    const metadataChoices = metadataPublication[key] ?? { manufacturer: false, observedOn: false };
    if (!reasonCode) return;

    setProcessing(key);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/moderation", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, action, reasonCode, ...(note ? { note } : {}), ...(entity === "camera" && action === "approve" ? { publishManufacturer: metadataChoices.manufacturer, publishObservedOn: metadataChoices.observedOn } : {}) }),
      });
      const data = await response.json() as { error?: string; event?: ModerationEvent; item?: CameraInQueue | CorrectionInQueue };
      if (!response.ok) throw new Error(data.error || t.saveError);

      if (entity === "camera") {
        const camera = data.item as CameraInQueue | undefined;
        setCameras((items) => items.filter((item) => item.id !== id));
        setPublishedCameras((items) => camera?.status === "verified" ? [camera, ...items.filter((item) => item.id !== id)] : items.filter((item) => item.id !== id));
        setReviewCameras((items) => camera?.status === "needs_review" ? [camera, ...items.filter((item) => item.id !== id)] : items.filter((item) => item.id !== id));
      } else setCorrections((items) => items.filter((item) => item.id !== id));
      setReasons((items) => { const next = { ...items }; delete next[key]; return next; });
      setNotes((items) => { const next = { ...items }; delete next[key]; return next; });
      setMetadataPublication((items) => { const next = { ...items }; delete next[key]; return next; });
      if (data.event) setRecentEvents((events) => [data.event!, ...events]);
      setMessage(`${entity === "camera" ? t.cameraReport : t.correctionRequest} #${id} ${t.decisionSaved}: ${actionLabel(action)}. ${t.reason}: ${readableReason(reasonCode)}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.saveError);
    } finally { setProcessing(null); }
  }

  function decisionFields(entity: QueueEntity, id: number) {
    const key = `${entity}-${id}`;
    const reasonId = `${key}-reason`;
    const noteId = `${key}-note`;
    return <fieldset className="report-form" style={{ marginTop: 4, padding: 18 }}>
      <legend>{t.details}</legend>
      <label htmlFor={reasonId}>{t.requiredReason}
        <select id={reasonId} value={reasons[key] ?? ""} onChange={(event) => setReasons((items) => ({ ...items, [key]: event.target.value }))} required>
          <option value="">{t.selectReason}</option>
          {reasonOptions.map((option) => <option key={option.value} value={option.value}>{t.reasons[option.value]}</option>)}
        </select>
      </label>
      <label htmlFor={noteId}>{t.moderatorNote}
        <textarea id={noteId} value={notes[key] ?? ""} onChange={(event) => setNotes((items) => ({ ...items, [key]: event.target.value.slice(0, 500) }))} maxLength={500} rows={3} aria-describedby={`${noteId}-help`} />
        <span id={`${noteId}-help`} className="search-count">{t.noteHelp}</span>
      </label>
    </fieldset>;
  }

  function decisionActions(entity: QueueEntity, id: number, allowedActions: ModerationAction[]) {
    const key = `${entity}-${id}`;
    const busy = processing === key;
    const disabled = busy || !reasons[key];
    return <div className="record-list-actions" aria-label={`${t.decisionFor} ${entity} ${id}`}>
      {allowedActions.map((action) => <button key={action} type="button" className={action === "approve" || action === "reverify" ? "button button-primary" : action === "hide" || action === "mark-stale" ? "button button-quiet" : "text-button"} disabled={disabled} onClick={() => decide(entity, id, action)}>{busy ? t.saving : actionLabel(action)}</button>)}
    </div>;
  }

  return <main id="main-content">
    <nav className="nav-shell" aria-label={t.navigation}>
      <Link className="brand" href="/" aria-label={t.home}><span className="brand-mark" aria-hidden="true">◉</span><span>OpenSurveillanceDB</span></Link>
      <div className="nav-actions"><LocaleToggle /><Link className="text-button" href="/">{t.returnPublic} <span aria-hidden="true">→</span></Link></div>
    </nav>

    <section className="moderation-page" aria-labelledby="moderation-title">
      <p className="eyebrow"><span /> {t.localAdministration}</p>
      <h1 id="moderation-title">{t.title}</h1>
      <p>{t.intro}</p>
      <div className="prototype-banner" role="note"><b>{t.localTool}</b> {t.localWarning}</div>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      {loading ? <p className="loading-note" aria-live="polite">{t.loading}</p> : <p className="search-count" aria-live="polite">{summary}</p>}

      <section className="moderation-section" aria-labelledby="pending-cameras-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.reports}</p><h2 id="pending-cameras-title">{t.pendingReports}</h2></div><p className="section-note">{cameras.length} {t.pending}</p></div>
        {!loading && cameras.length === 0 && <div className="empty-state"><h3>{t.noPendingTitle}</h3><p>{t.noPendingText}</p></div>}
        <ul className="moderation-list" aria-label={t.pendingReports}>{cameras.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {t.pendingReport}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.approximateLocation}</dt><dd>{camera.address || t.noAddress}<br />{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</dd></div><div><dt>{t.source}</dt><dd>{camera.source || t.communityReport}</dd></div><div><dt>{t.submitted}</dt><dd>{readableDate(camera.createdAt)}</dd></div></dl>{cameraMetadata(camera)}{camera.notes && <div><h4>{t.submitterNotes}</h4><p>{camera.notes}</p></div>}{metadataPublicationFields(camera)}{decisionFields("camera", camera.id)}{decisionActions("camera", camera.id, ["approve", "hide", "reject"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="published-cameras-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.lifecycle}</p><h2 id="published-cameras-title">{t.publishedRecords}</h2></div><p className="section-note">{publishedCameras.length} {t.verified}</p></div>
        {!loading && publishedCameras.length === 0 && <div className="empty-state"><h3>{t.noPublishedTitle}</h3><p>{t.noPublishedText}</p></div>}
        <ul className="moderation-list" aria-label={t.publishedRecords}>{publishedCameras.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot verified" /> {t.verifiedRecord}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.approximateLocation}</dt><dd>{camera.address || t.noAddress}<br />{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</dd></div><div><dt>{t.source}</dt><dd>{camera.source || t.communityReport}</dd></div><div><dt>{t.lastUpdate}</dt><dd>{camera.updated || readableDate(camera.createdAt)}</dd></div></dl>{cameraMetadata(camera)}{camera.notes && <div><h4>{t.recordNotes}</h4><p>{camera.notes}</p></div>}{decisionFields("camera", camera.id)}{decisionActions("camera", camera.id, ["mark-stale", "hide"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="review-cameras-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.lifecycle}</p><h2 id="review-cameras-title">{t.recordsNeedReview}</h2></div><p className="section-note">{reviewCameras.length} {t.awaitingReview}</p></div>
        {!loading && reviewCameras.length === 0 && <div className="empty-state"><h3>{t.noReviewTitle}</h3><p>{t.noReviewText}</p></div>}
        <ul className="moderation-list" aria-label={t.recordsNeedReview}>{reviewCameras.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {t.needsReview}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div><dl><div><dt>{t.approximateLocation}</dt><dd>{camera.address || t.noAddress}<br />{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</dd></div><div><dt>{t.source}</dt><dd>{camera.source || t.communityReport}</dd></div><div><dt>{t.lastUpdate}</dt><dd>{camera.updated || readableDate(camera.createdAt)}</dd></div></dl>{cameraMetadata(camera)}{camera.notes && <div><h4>{t.recordNotes}</h4><p>{camera.notes}</p></div>}{decisionFields("camera", camera.id)}{decisionActions("camera", camera.id, ["reverify", "hide"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="correction-requests-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.corrections}</p><h2 id="correction-requests-title">{t.privateCorrections}</h2></div><p className="section-note">{corrections.length} {t.pending}</p></div>
        {!loading && corrections.length === 0 && <div className="empty-state"><h3>{t.noCorrectionsTitle}</h3><p>{t.noCorrectionsText}</p></div>}
        <ul className="moderation-list" aria-label={t.privateCorrections}>{corrections.map((correction) => <li key={correction.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {t.privateCorrection}</p><h3>{correction.issueType}</h3><p className="record-kind">{correction.cameraId ? `${t.relatedRecord} #${correction.cameraId}` : t.generalConcern}</p></div><dl><div><dt>{t.submitted}</dt><dd>{readableDate(correction.createdAt)}</dd></div><div><dt>{t.contact}</dt><dd>{correction.contact || t.noContact}</dd></div><div><dt>{t.status}</dt><dd>{readableStatus(correction.status)}</dd></div></dl><div><h4>{t.request}</h4><p>{correction.message}</p></div>{decisionFields("correction", correction.id)}{decisionActions("correction", correction.id, ["approve", "reject"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="moderation-history-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.localAudit}</p><h2 id="moderation-history-title">{t.recentDecisions}</h2></div><p className="section-note">{t.readOnlyHistory}</p></div>
        {recentEvents.length === 0 ? <div className="empty-state"><h3>{t.noDecisionsTitle}</h3><p>{t.noDecisionsText}</p></div> : <ul className="moderation-list" aria-label={t.recentDecisions}>{recentEvents.map((event, index) => <li key={event.id ?? `${event.entity ?? "event"}-${event.entityId ?? index}-${event.createdAt ?? event.timestamp ?? index}`}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {event.entity ?? t.moderation}</p><h3>{readableAction(event.action)}</h3><p className="record-kind">{readableStatus(event.previousStatus) || t.unknown} → {readableStatus(event.newStatus) || t.recorded}</p></div><dl><div><dt>{t.reason}</dt><dd>{readableReason(event.reasonCode ?? event.reason)}</dd></div><div><dt>{t.timestamp}</dt><dd>{readableDate(event.createdAt ?? event.timestamp)}</dd></div><div><dt>{t.item}</dt><dd>{event.entityId ? `#${event.entityId}` : t.unavailable}</dd></div><div><dt>{t.actor}</dt><dd>{event.actor ?? t.localModerator}</dd></div></dl>{event.note && <div><h4>{t.moderatorNoteTitle}</h4><p>{event.note}</p></div>}</article></li>)}</ul>}
      </section>
    </section>
  </main>;
}
