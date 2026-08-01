"use client";

// Moderation queue state hook — extracted from the ModerationDashboard
// monolith (kanban t_c7460073): owns fetch, decision state, formatters.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useMessages } from "../LocaleProvider";
import type { CameraInQueue, CorrectionInQueue, DecisionFormApi, EditRequestInQueue, ModerationAction, ModerationEvent, PhotoInQueue, QueueEntity, QueueItem, QueuePayload, ReasonCode, Reviewer } from "./types";

export function useModerationQueue() {
  const { locale } = useLocale();
  const t = useMessages().moderation;

  const [cameras, setCameras] = useState<CameraInQueue[]>([]);
  const [publishedCameras, setPublishedCameras] = useState<CameraInQueue[]>([]);
  const [reviewCameras, setReviewCameras] = useState<CameraInQueue[]>([]);
  const [corrections, setCorrections] = useState<CorrectionInQueue[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequestInQueue[]>([]);
  const [photos, setPhotos] = useState<PhotoInQueue[]>([]);
  const [redactionConfirmed, setRedactionConfirmed] = useState<Record<string, boolean>>({});
  const [recentEvents, setRecentEvents] = useState<ModerationEvent[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [actorId, setActorId] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Correction-only decision fields (H1, t_69891619): the record outcome
  // chosen for approve and the record id the request is linked to.
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [cameraIds, setCameraIds] = useState<Record<string, string>>({});
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
  function readableOutcome(outcome?: string) { return outcome && outcome in t.outcomeLabels ? t.outcomeLabels[outcome as keyof typeof t.outcomeLabels] : outcome ?? t.unavailable; }

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
        setEditRequests(Array.isArray(data.cameraEditRequests) ? data.cameraEditRequests : []);
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

  const total = cameras.length + corrections.length + editRequests.length + photos.length;
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
    if (!Number.isInteger(actingAs) || actingAs < 1) { setError(t.actorRequired); return; }

    // Correction association contract (H1, t_69891619): approve must name a
    // record outcome and associate must name a record id. The outcome gate is
    // client-side only — the server accepts approve without an outcome (200,
    // backward-compat) — while associate requires cameraId server-side too
    // (400 otherwise). Checking here gives immediate feedback without a
    // round-trip.
    const outcome = outcomes[key];
    const rawCameraId = cameraIds[key] ?? "";
    const parsedCameraId = rawCameraId.trim() === "" ? null : Number.parseInt(rawCameraId, 10);
    if (entity === "correction" && action === "approve" && !outcome) { setError(t.approveRequiresOutcome); return; }
    if (entity === "correction" && action === "associate" && (parsedCameraId === null || !Number.isInteger(parsedCameraId) || parsedCameraId < 1)) { setError(t.associateRequiresCameraId); return; }
    if (entity === "correction" && parsedCameraId !== null && (!Number.isInteger(parsedCameraId) || parsedCameraId < 1)) { setError(t.invalidRecordId); return; }

    setProcessing(key);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/moderation", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity, id, action, reasonCode, actorId: actingAs,
          ...(note ? { note } : {}),
          ...(entity === "correction" && action === "approve" && outcome ? { outcome } : {}),
          ...(entity === "correction" && parsedCameraId !== null ? { cameraId: parsedCameraId } : {}),
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
      setOutcomes((items) => { const next = { ...items }; delete next[key]; return next; });
      setCameraIds((items) => { const next = { ...items }; delete next[key]; return next; });
      setMetadataPublication((items) => { const next = { ...items }; delete next[key]; return next; });
      setMessage(`${entity === "camera" ? t.cameraReport : entity === "photo" ? t.photoEvidence : entity === "camera_edit" ? t.editRequest : t.correctionRequest} #${id} ${t.decisionSaved}: ${actionLabel(action)}. ${t.reason}: ${readableReason(reasonCode)}.`);
      loadQueue();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.saveError);
    } finally { setProcessing(null); }
  }

  const decisionApi: DecisionFormApi = {
    reason: (key) => reasons[key] ?? "",
    setReason: (key, value) => setReasons((items) => ({ ...items, [key]: value })),
    note: (key) => notes[key] ?? "",
    setNote: (key, value) => setNotes((items) => ({ ...items, [key]: value.slice(0, 500) })),
    outcome: (key) => outcomes[key] ?? "",
    setOutcome: (key, value) => setOutcomes((items) => ({ ...items, [key]: value })),
    cameraId: (key) => cameraIds[key] ?? "",
    setCameraId: (key, value) => setCameraIds((items) => ({ ...items, [key]: value })),
    metadataChoices: (key) => metadataPublication[key] ?? { manufacturer: false, observedOn: false },
    setMetadataChoice: (key, field, value) => setMetadataPublication((items) => ({ ...items, [key]: { ...(metadataPublication[key] ?? { manufacturer: false, observedOn: false }), [field]: value } })),
    redactionConfirmed: (key) => redactionConfirmed[key] === true,
    setRedactionConfirmed: (key, value) => setRedactionConfirmed((items) => ({ ...items, [key]: value })),
    processing,
    actorId,
    decide,
  };

  return {
    loading, message, error, summary,
    cameras, publishedCameras, reviewCameras, corrections, editRequests, photos, recentEvents, reviewers,
    actorId, setActorId,
    queueBadge, readableDate, readableAction, readableReason, readableStatus, readableOutcome,
    decisionApi,
  };
}
