"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type PhotoInQueue = {
  id: number;
  cameraId?: number | null;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  status: string;
  exifStripped: number;
  redactionConfirmed: number;
  createdAt?: string;
  updatedAt?: string;
};

type Reviewer = {
  id: number;
  displayName: string;
  role: string;
  active?: number;
  mfaEnabled?: number;
};

type QueueItem = {
  id: number | null;
  entity: "camera" | "correction";
  entityId: number;
  state: "queued" | "assigned" | "second_review" | "escalated" | "closed";
  assigneeId?: number | null;
  sensitivity: "standard" | "sensitive" | "urgent";
  requiresSecondReview?: number;
  secondReviewerId?: number | null;
  escalationReason?: string | null;
  assignee?: string | null;
  secondReviewer?: string | null;
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
  actorRole?: string | null;
  recused?: number;
  escalated?: number;
  secondReviewerId?: number | null;
  createdAt?: string;
  timestamp?: string;
};

type QueuePayload = {
  cameraReports?: CameraInQueue[];
  publishedCameras?: CameraInQueue[];
  reviewCameras?: CameraInQueue[];
  correctionRequests?: CorrectionInQueue[];
  photoReports?: PhotoInQueue[];
  recentEvents?: ModerationEvent[];
  reviewers?: Reviewer[];
  queueItems?: QueueItem[];
  error?: string;
};

type QueueEntity = "camera" | "correction" | "photo";
type ModerationAction = "approve" | "reject" | "hide" | "mark-stale" | "reverify" | "escalate";
type ReasonCode = "verified-public-infrastructure" | "insufficient-evidence" | "duplicate" | "private-or-sensitive-location" | "inaccurate-or-outdated" | "privacy-or-safety-concern" | "requires-senior-review" | "other";

const reasonOptions: { value: ReasonCode }[] = [
  { value: "verified-public-infrastructure" },
  { value: "insufficient-evidence" },
  { value: "duplicate" },
  { value: "private-or-sensitive-location" },
  { value: "inaccurate-or-outdated" },
  { value: "privacy-or-safety-concern" },
  { value: "requires-senior-review" },
  { value: "other" },
];

export function ModerationDashboard() {
  const { locale } = useLocale();
  const t = useMessages().moderation;
  const [cameras, setCameras] = useState<CameraInQueue[]>([]);
  const [publishedCameras, setPublishedCameras] = useState<CameraInQueue[]>([]);
  const [reviewCameras, setReviewCameras] = useState<CameraInQueue[]>([]);
  const [corrections, setCorrections] = useState<CorrectionInQueue[]>([]);
  const [photos, setPhotos] = useState<PhotoInQueue[]>([]);
  const [redactionConfirmed, setRedactionConfirmed] = useState<Record<string, boolean>>({});
  const [recentEvents, setRecentEvents] = useState<ModerationEvent[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [actorId, setActorId] = useState("");
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

  const loadQueue = useCallback(() => {
    const controller = new AbortController();
    fetch("/api/moderation", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as QueuePayload;
        if (!response.ok) throw new Error(data.error || t.loadError);
        setCameras(Array.isArray(data.cameraReports) ? data.cameraReports : []);
        setPublishedCameras(Array.isArray(data.publishedCameras) ? data.publishedCameras : []);
        setReviewCameras(Array.isArray(data.reviewCameras) ? data.reviewCameras : []);
        setCorrections(Array.isArray(data.correctionRequests) ? data.correctionRequests : []);
        setPhotos(Array.isArray(data.photoReports) ? data.photoReports : []);
        setRecentEvents(Array.isArray(data.recentEvents) ? data.recentEvents : []);
        setReviewers(Array.isArray(data.reviewers) ? data.reviewers : []);
        setQueueItems(Array.isArray(data.queueItems) ? data.queueItems : []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [t.loadError]);

  useEffect(() => loadQueue(), [loadQueue]);

  const total = cameras.length + corrections.length + photos.length;
  const summary = useMemo(() => t.awaiting(total), [t, total]);

  const queueByKey = useMemo(() => new Map(
    queueItems.map((item) => [`${item.entity}-${item.entityId}`, item]),
  ), [queueItems]);

  function queueBadge(entity: QueueEntity, id: number) {
    const item = queueByKey.get(`${entity}-${id}`);
    if (!item) return null;
    const labels = t.queueLabels as Record<string, string>;
    const sensitivities = t.sensitivityLabels as Record<string, string>;
    return <p className="card-topline"><span className="status-dot pending" /> {t.queueState}: {labels[item.state] ?? item.state}{item.sensitivity !== "standard" ? ` · ${t.sensitivity}: ${sensitivities[item.sensitivity] ?? item.sensitivity}` : ""}{item.requiresSecondReview === 1 ? ` · ${t.secondReview}` : ""}</p>;
  }

  async function decide(entity: QueueEntity, id: number, action: ModerationAction) {
    const key = `${entity}-${id}`;
    const reasonCode = reasons[key];
    const note = notes[key]?.trim();
    const metadataChoices = metadataPublication[key] ?? { manufacturer: false, observedOn: false };
    const actingAs = Number.parseInt(actorId, 10);
    if (!reasonCode) return;
    if (!Number.isInteger(actingAs) || actingAs < 1) {
      setError(t.actorRequired);
      return;
    }

    setProcessing(key);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/moderation", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity, id, action, reasonCode, actorId: actingAs,
          ...(note ? { note } : {}),
          ...(entity === "camera" && action === "approve" ? { publishManufacturer: metadataChoices.manufacturer, publishObservedOn: metadataChoices.observedOn } : {}),
          ...(entity === "photo" && action === "approve" ? { redactionConfirmed: redactionConfirmed[key] === true } : {}),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t.saveError);

      // Reload the queue so queue state badges and moved items stay truthful.
      setReasons((items) => { const next = { ...items }; delete next[key]; return next; });
      setRedactionConfirmed((items) => { const next = { ...items }; delete next[key]; return next; });
      setNotes((items) => { const next = { ...items }; delete next[key]; return next; });
      setMetadataPublication((items) => { const next = { ...items }; delete next[key]; return next; });
      setMessage(`${entity === "camera" ? t.cameraReport : entity === "photo" ? t.photoEvidence : t.correctionRequest} #${id} ${t.decisionSaved}: ${actionLabel(action)}. ${t.reason}: ${readableReason(reasonCode)}.`);
      loadQueue();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.saveError);
    } finally { setProcessing(null); }
  }

  function decisionFields(entity: QueueEntity, id: number, allowedActions: ModerationAction[]) {
    const key = `${entity}-${id}`;
    const reasonId = `${key}-reason`;
    const noteId = `${key}-note`;
    const escalatable = allowedActions.includes("escalate");
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
        <span id={`${noteId}-help`} className="search-count">{escalatable ? `${t.escalateHelp} ${t.noteHelp}` : t.noteHelp}</span>
      </label>
    </fieldset>;
  }

  function decisionActions(entity: QueueEntity, id: number, allowedActions: ModerationAction[]) {
    const key = `${entity}-${id}`;
    const busy = processing === key;
    const disabled = busy || !reasons[key] || !actorId;
    return <div className="record-list-actions" aria-label={`${t.decisionFor} ${entity} ${id}`}>
      {allowedActions.map((action) => <button key={action} type="button" className={action === "approve" || action === "reverify" ? "button button-primary" : action === "hide" || action === "mark-stale" ? "button button-quiet" : "text-button"} disabled={disabled || (entity === "photo" && action === "approve" && redactionConfirmed[key] !== true)} onClick={() => decide(entity, id, action)}>{busy ? t.saving : actionLabel(action)}</button>)}
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

      <section className="moderation-section" aria-labelledby="actor-selector-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.localAudit}</p><h2 id="actor-selector-title">{t.selectActor}</h2></div><p className="section-note">{t.actorRequired}</p></div>
        <fieldset className="report-form" style={{ marginTop: 4, padding: 18 }}>
          <label htmlFor="actor-select">{t.selectActor}
            <select id="actor-select" value={actorId} onChange={(event) => setActorId(event.target.value)} required>
              <option value="">{t.selectReason.replace("reason", "reviewer")}</option>
              {reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} · {reviewer.role}</option>)}
            </select>
            <span className="search-count">{t.actorHelp}</span>
          </label>
        </fieldset>
      </section>

      <section className="moderation-section" aria-labelledby="pending-cameras-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.reports}</p><h2 id="pending-cameras-title">{t.pendingReports}</h2></div><p className="section-note">{cameras.length} {t.pending}</p></div>
        {!loading && cameras.length === 0 && <div className="empty-state"><h3>{t.noPendingTitle}</h3><p>{t.noPendingText}</p></div>}
        <ul className="moderation-list" aria-label={t.pendingReports}>{cameras.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {t.pendingReport}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div>{queueBadge("camera", camera.id)}<dl><div><dt>{t.approximateLocation}</dt><dd>{camera.address || t.noAddress}<br />{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</dd></div><div><dt>{t.source}</dt><dd>{camera.source || t.communityReport}</dd></div><div><dt>{t.submitted}</dt><dd>{readableDate(camera.createdAt)}</dd></div></dl>{cameraMetadata(camera)}{camera.notes && <div><h4>{t.submitterNotes}</h4><p>{camera.notes}</p></div>}{metadataPublicationFields(camera)}{decisionFields("camera", camera.id, ["approve", "hide", "reject", "escalate"])}{decisionActions("camera", camera.id, ["approve", "hide", "reject", "escalate"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="published-cameras-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.lifecycle}</p><h2 id="published-cameras-title">{t.publishedRecords}</h2></div><p className="section-note">{publishedCameras.length} {t.verified}</p></div>
        {!loading && publishedCameras.length === 0 && <div className="empty-state"><h3>{t.noPublishedTitle}</h3><p>{t.noPublishedText}</p></div>}
        <ul className="moderation-list" aria-label={t.publishedRecords}>{publishedCameras.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot verified" /> {t.verifiedRecord}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div>{queueBadge("camera", camera.id)}<dl><div><dt>{t.approximateLocation}</dt><dd>{camera.address || t.noAddress}<br />{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</dd></div><div><dt>{t.source}</dt><dd>{camera.source || t.communityReport}</dd></div><div><dt>{t.lastUpdate}</dt><dd>{camera.updated || readableDate(camera.createdAt)}</dd></div></dl>{cameraMetadata(camera)}{camera.notes && <div><h4>{t.recordNotes}</h4><p>{camera.notes}</p></div>}{decisionFields("camera", camera.id, ["mark-stale", "hide", "escalate"])}{decisionActions("camera", camera.id, ["mark-stale", "hide", "escalate"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="review-cameras-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.lifecycle}</p><h2 id="review-cameras-title">{t.recordsNeedReview}</h2></div><p className="section-note">{reviewCameras.length} {t.awaitingReview}</p></div>
        {!loading && reviewCameras.length === 0 && <div className="empty-state"><h3>{t.noReviewTitle}</h3><p>{t.noReviewText}</p></div>}
        <ul className="moderation-list" aria-label={t.recordsNeedReview}>{reviewCameras.map((camera) => <li key={camera.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {t.needsReview}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div>{queueBadge("camera", camera.id)}<dl><div><dt>{t.approximateLocation}</dt><dd>{camera.address || t.noAddress}<br />{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</dd></div><div><dt>{t.source}</dt><dd>{camera.source || t.communityReport}</dd></div><div><dt>{t.lastUpdate}</dt><dd>{camera.updated || readableDate(camera.createdAt)}</dd></div></dl>{cameraMetadata(camera)}{camera.notes && <div><h4>{t.recordNotes}</h4><p>{camera.notes}</p></div>}{decisionFields("camera", camera.id, ["reverify", "hide", "escalate"])}{decisionActions("camera", camera.id, ["reverify", "hide", "escalate"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="correction-requests-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.corrections}</p><h2 id="correction-requests-title">{t.privateCorrections}</h2></div><p className="section-note">{corrections.length} {t.pending}</p></div>
        {!loading && corrections.length === 0 && <div className="empty-state"><h3>{t.noCorrectionsTitle}</h3><p>{t.noCorrectionsText}</p></div>}
        <ul className="moderation-list" aria-label={t.privateCorrections}>{corrections.map((correction) => <li key={correction.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {t.privateCorrection}</p><h3>{correction.issueType}</h3><p className="record-kind">{correction.cameraId ? `${t.relatedRecord} #${correction.cameraId}` : t.generalConcern}</p></div>{queueBadge("correction", correction.id)}<dl><div><dt>{t.submitted}</dt><dd>{readableDate(correction.createdAt)}</dd></div><div><dt>{t.contact}</dt><dd>{correction.contact || t.noContact}</dd></div><div><dt>{t.status}</dt><dd>{readableStatus(correction.status)}</dd></div></dl><div><h4>{t.request}</h4><p>{correction.message}</p></div>{decisionFields("correction", correction.id, ["approve", "reject", "escalate"])}{decisionActions("correction", correction.id, ["approve", "reject", "escalate"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="photo-queue-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.photoEvidence}</p><h2 id="photo-queue-title">{t.pendingPhotos}</h2></div><p className="section-note">{photos.length} {t.pending}</p></div>
        {!loading && photos.length === 0 && <div className="empty-state"><h3>{t.noPhotosTitle}</h3><p>{t.noPhotosText}</p></div>}
        <ul className="moderation-list" aria-label={t.pendingPhotos}>{photos.map((photo) => <li key={photo.id}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {t.photoEvidence} #{photo.id}</p><h3>{t.photoEvidence}</h3><p className="record-kind">{photo.mimeType} · {photo.width}×{photo.height} · {(photo.sizeBytes / 1024).toFixed(1)} KB</p></div><dl><div><dt>{t.photoStripState}</dt><dd>{photo.exifStripped === 1 ? t.verified : t.photoNoRedaction}</dd></div><div><dt>{t.photoRedactionState}</dt><dd>{photo.redactionConfirmed === 1 ? t.verified : t.photoNoRedaction}</dd></div><div><dt>{t.relatedRecord}</dt><dd>{photo.cameraId ? `#${photo.cameraId}` : t.unavailable}</dd></div><div><dt>{t.submitted}</dt><dd>{readableDate(photo.createdAt)}</dd></div></dl><div className="photo-preview-frame">{/* eslint-disable @next/next/no-img-element -- auth-gated moderation preview; next/image cannot fetch a cookie-authenticated API route */}<img src={`/api/moderation/photos/${photo.id}`} alt={`${t.photoEvidence} #${photo.id}`} loading="lazy" />{/* eslint-enable @next/next/no-img-element */}</div><div className="photo-moderate-note" role="note">{t.photoRedactionHelp}</div><label className="photo-redaction-check"><input type="checkbox" checked={redactionConfirmed[`photo-${photo.id}`] === true} onChange={(event) => setRedactionConfirmed((items) => ({ ...items, [`photo-${photo.id}`]: event.target.checked }))} /> <span>{t.photoRedactionConfirm}</span></label>{decisionFields("photo", photo.id, ["approve", "reject"])}{decisionActions("photo", photo.id, ["approve", "reject"])}</article></li>)}</ul>
      </section>

      <section className="moderation-section" aria-labelledby="moderation-history-title">
        <div className="section-heading"><div><p className="eyebrow"><span /> {t.localAudit}</p><h2 id="moderation-history-title">{t.recentDecisions}</h2></div><p className="section-note">{t.readOnlyHistory}</p></div>
        {recentEvents.length === 0 ? <div className="empty-state"><h3>{t.noDecisionsTitle}</h3><p>{t.noDecisionsText}</p></div> : <ul className="moderation-list" aria-label={t.recentDecisions}>{recentEvents.map((event, index) => <li key={event.id ?? `${event.entity ?? "event"}-${event.entityId ?? index}-${event.createdAt ?? event.timestamp ?? index}`}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {event.entity ?? t.moderation}</p><h3>{readableAction(event.action)}</h3><p className="record-kind">{readableStatus(event.previousStatus) || t.unknown} → {readableStatus(event.newStatus) || t.recorded}</p></div><dl><div><dt>{t.reason}</dt><dd>{readableReason(event.reasonCode ?? event.reason)}</dd></div><div><dt>{t.timestamp}</dt><dd>{readableDate(event.createdAt ?? event.timestamp)}</dd></div><div><dt>{t.item}</dt><dd>{event.entityId ? `#${event.entityId}` : t.unavailable}</dd></div><div><dt>{t.actor}</dt><dd>{event.actor ?? t.localModerator}{event.actorRole ? ` · ${event.actorRole}` : ""}{event.recused === 1 ? ` · ${t.recusedBadge}` : ""}{event.escalated === 1 ? ` · ${t.escalatedBadge}` : ""}</dd></div>{event.secondReviewerId !== undefined && event.secondReviewerId !== null && <div><dt>{t.secondReviewer}</dt><dd>#{event.secondReviewerId}</dd></div>}</dl>{event.note && <div><h4>{t.moderatorNoteTitle}</h4><p>{event.note}</p></div>}</article></li>)}</ul>}
      </section>
    </section>
  </main>;
}
