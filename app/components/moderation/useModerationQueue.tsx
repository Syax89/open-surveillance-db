"use client";

// Moderation queue state hook — extracted from the ModerationDashboard monolith (kanban t_c7460073): fetch, decision state, formatters.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../LocaleProvider";
import { useMessages } from "../../lib/use-messages";
import { LOCALE_BCP47 } from "../../lib/i18n";
import type { CameraInQueue, CorrectionInQueue, DecisionFormApi, EditRequestInQueue, ModerationAction, ModerationEvent, PublishedCursor, QueueEntity, QueueItem, QueuePayload, ReasonCode, Reviewer } from "./types";
export function useModerationQueue() {
  const { locale } = useLocale();
  const messages = useMessages();
  const t = messages.moderation;
  const community = messages.community;
  const [cameras, setCameras] = useState<CameraInQueue[]>([]); const [publishedCameras, setPublishedCameras] = useState<CameraInQueue[]>([]);
  // Published-page cursor state; history holds the cursor of each page we came FROM (null = first page) so "previous" needs no total count.
  const [publishedNextCursor, setPublishedNextCursor] = useState<PublishedCursor | null>(null);
  const [publishedHistory, setPublishedHistory] = useState<(PublishedCursor | null)[]>([]); const [publishedLoading, setPublishedLoading] = useState(false);
  const [reviewCameras, setReviewCameras] = useState<CameraInQueue[]>([]); const [corrections, setCorrections] = useState<CorrectionInQueue[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequestInQueue[]>([]); const [recentEvents, setRecentEvents] = useState<ModerationEvent[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]); const [queueItems, setQueueItems] = useState<QueueItem[]>([]); const [actorId, setActorId] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({}); const [notes, setNotes] = useState<Record<string, string>>({});
  // Correction-only decision fields (H1, t_69891619): outcome + linked record id.
  const [outcomes, setOutcomes] = useState<Record<string, string>>({}); const [cameraIds, setCameraIds] = useState<Record<string, string>>({});
  const [metadataPublication, setMetadataPublication] = useState<Record<string, { manufacturer: boolean; observedOn: boolean }>>({});
  const [loading, setLoading] = useState(true); const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  // PATCH/decision error (its own alert) vs queue-load failure, kept separate so a rejected decision is never offered a page retry.
  const [error, setError] = useState(""); const [queueError, setQueueError] = useState("");
  // Current page cursor (ref so a decision refresh targets the page shown NOW) + request generation + synchronous in-flight gate.
  const publishedCursorRef = useRef<PublishedCursor | null>(null); const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null); const inFlightRef = useRef(false);

  function readableDate(value?: string) {
    if (!value) return t.timeUnavailable; const date = new Date(value);
    // BCP 47 tag from the locale registry (LOCALE_BCP47) — no it-IT/en-US ternary (t_6424f961).
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(LOCALE_BCP47[locale]);
  }

  function actionLabel(action: ModerationAction) { return t.action[action]; }
  function readableAction(action?: string) { return action && action in t.actionPast ? t.actionPast[action as ModerationAction] : action ?? t.decisionRecorded; }
  function readableReason(reasonCode?: string) { return reasonCode && reasonCode in t.reasons ? t.reasons[reasonCode as ReasonCode] : reasonCode ?? t.timeUnavailable; }
  function readableStatus(status?: string) { return status && status in t.statusLabels ? t.statusLabels[status as keyof typeof t.statusLabels] : status ?? t.recorded; }
  function readableOutcome(outcome?: string) { return outcome && outcome in t.outcomeLabels ? t.outcomeLabels[outcome as keyof typeof t.outcomeLabels] : outcome ?? t.unavailable; }

  const loadQueue = useCallback(() => {
    // Flip the busy flag here so EVERY trigger (mount, locale-driven effect re-run, decision refresh, page nav) is truthful.
    setPublishedLoading(true); const generation = (generationRef.current += 1); controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const cursor = publishedCursorRef.current; const params = new URLSearchParams();
    if (cursor) { params.set("published_after_created_at", cursor.createdAt); params.set("published_after_id", String(cursor.id)); }
    const query = params.toString(); const url = query ? `/api/moderation?${query}` : "/api/moderation";
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as QueuePayload;
        if (generation !== generationRef.current) return;
        if (!response.ok) throw new Error(data.error || t.loadError);
        setCameras(Array.isArray(data.cameraReports) ? data.cameraReports : []); setPublishedCameras(Array.isArray(data.publishedCameras) ? data.publishedCameras : []);
        setPublishedNextCursor(data.publishedNextCursor ?? null); setReviewCameras(Array.isArray(data.reviewCameras) ? data.reviewCameras : []);
        setCorrections(Array.isArray(data.correctionRequests) ? data.correctionRequests : []); setEditRequests(Array.isArray(data.cameraEditRequests) ? data.cameraEditRequests : []);
        setRecentEvents(Array.isArray(data.recentEvents) ? data.recentEvents : []); setReviewers(Array.isArray(data.reviewers) ? data.reviewers : []);
        setQueueItems(Array.isArray(data.queueItems) ? data.queueItems : []); setQueueError("");
      })
      .catch((reason: unknown) => {
        if (generation !== generationRef.current) return; if (reason instanceof Error && reason.name !== "AbortError") setQueueError(reason.message);
      })
      .finally(() => {
        if (generation !== generationRef.current) return; inFlightRef.current = false; setLoading(false); setPublishedLoading(false);
      });
  }, [t.loadError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadQueue also runs from event handlers; the busy flag must flip synchronously before the async fetch and settles in loadQueue's finally.
    loadQueue();
    return () => { generationRef.current += 1; controllerRef.current?.abort(); };
  }, [loadQueue]);

  /** Move the published section one page forward/backward (no prefetching). */
  function goToPublishedPage(direction: "next" | "previous") {
    if (inFlightRef.current || publishedLoading) return;
    if (direction === "previous") {
      if (publishedHistory.length === 0) return;
      const previous = publishedHistory[publishedHistory.length - 1]; setPublishedHistory(publishedHistory.slice(0, -1)); publishedCursorRef.current = previous;
    } else {
      if (!publishedNextCursor) return;
      const next = publishedNextCursor; setPublishedHistory([...publishedHistory, publishedCursorRef.current]); publishedCursorRef.current = next;
    }
    inFlightRef.current = true; setPublishedCameras([]); setPublishedNextCursor(null); setPublishedLoading(true);
    loadQueue();
  }

  /** Retry the CURRENT cursor after a queue-load failure (busy-guarded). */
  function retryQueueLoad() { if (inFlightRef.current || publishedLoading) return; inFlightRef.current = true; setPublishedLoading(true); loadQueue(); }

  const total = cameras.length + corrections.length + editRequests.length; const summary = useMemo(() => t.awaiting(total), [t, total]);
  const queueByKey = useMemo(() => new Map(queueItems.map((item) => [`${item.entity}-${item.entityId}`, item])), [queueItems]);

  function queueBadge(entity: QueueEntity, id: number) {
    const item = queueByKey.get(`${entity}-${id}`);
    if (!item) return null;
    const labels = t.queueLabels as Record<string, string>;
    const sensitivities = t.sensitivityLabels as Record<string, string>;
    return <p className="card-topline"><span className="status-dot pending" /> {t.queueState}: {labels[item.state] ?? item.state}{item.sensitivity !== "standard" ? ` · ${t.sensitivity}: ${sensitivities[item.sensitivity] ?? item.sensitivity}` : ""}{item.requiresSecondReview === 1 ? ` · ${t.secondReview}` : ""}</p>;
  }

  async function decide(entity: QueueEntity, id: number, action: ModerationAction) {
    const key = `${entity}-${id}`; const reasonCode = reasons[key]; const note = notes[key]?.trim();
    const metadataChoices = metadataPublication[key] ?? { manufacturer: false, observedOn: false }; const actingAs = Number.parseInt(actorId, 10);
    if (!reasonCode) return;
    if (!Number.isInteger(actingAs) || actingAs < 1) { setError(t.actorRequired); return; }
    // Correction association (H1, t_69891619): approve may omit an outcome (server accepts 200); associate
    // requires a record id (server 400 otherwise) — the client check only saves a round-trip.
    const outcome = outcomes[key]; const rawCameraId = cameraIds[key] ?? ""; const parsedCameraId = rawCameraId.trim() === "" ? null : Number.parseInt(rawCameraId, 10);
    if (entity === "correction" && action === "approve" && !outcome) { setError(t.approveRequiresOutcome); return; }
    if (entity === "correction" && action === "associate" && (parsedCameraId === null || !Number.isInteger(parsedCameraId) || parsedCameraId < 1)) { setError(t.associateRequiresCameraId); return; }
    if (entity === "correction" && parsedCameraId !== null && (!Number.isInteger(parsedCameraId) || parsedCameraId < 1)) { setError(t.invalidRecordId); return; }
    setProcessing(key); setMessage(""); setError("");
    try {
      const response = await fetch("/api/moderation", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity, id, action, reasonCode, actorId: actingAs,
          ...(note ? { note } : {}),
          ...(entity === "correction" && action === "approve" && outcome ? { outcome } : {}),
          ...(entity === "correction" && parsedCameraId !== null ? { cameraId: parsedCameraId } : {}),
          ...(entity === "camera" && action === "approve" ? { publishManufacturer: metadataChoices.manufacturer, publishObservedOn: metadataChoices.observedOn } : {}),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t.saveError);
      // Reload the queue so queue state badges and moved items stay truthful.
      setReasons((items) => { const next = { ...items }; delete next[key]; return next; }); setNotes((items) => { const next = { ...items }; delete next[key]; return next; });
      setOutcomes((items) => { const next = { ...items }; delete next[key]; return next; }); setCameraIds((items) => { const next = { ...items }; delete next[key]; return next; });
      setMetadataPublication((items) => { const next = { ...items }; delete next[key]; return next; });
      setMessage(`${entity === "camera" ? t.cameraReport : entity === "camera_edit" ? t.editRequest : t.correctionRequest} #${id} ${t.decisionSaved}: ${actionLabel(action)}. ${t.reason}: ${readableReason(reasonCode)}.`);
      setPublishedLoading(true); loadQueue();
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
    processing,
    actorId,
    decide,
  };

  return {
    loading, message, error, queueError, summary,
    cameras, publishedCameras, reviewCameras, corrections, editRequests, recentEvents, reviewers,
    actorId, setActorId,
    publishedPagination: {
      previousLabel: community.previousPage, nextLabel: community.nextPage, loading: publishedLoading,
      hasPrevious: publishedHistory.length > 0, hasNext: publishedNextCursor !== null, failed: queueError !== "",
      onPrevious: () => goToPublishedPage("previous"), onNext: () => goToPublishedPage("next"), onRetry: retryQueueLoad,
    },
    queueBadge, readableDate, readableAction, readableReason, readableStatus, readableOutcome,
    decisionApi,
  };
}
