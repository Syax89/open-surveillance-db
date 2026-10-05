"use client";

// Moderation queue state hook (kanban t_c7460073): fetch, decision state, formatters.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../LocaleProvider";
import { useMessages } from "../../lib/use-messages";
import { LOCALE_BCP47 } from "../../lib/i18n";
import type { CameraInQueue, CorrectionInQueue, DecisionFormApi, EditRequestInQueue, ModerationAction, ModerationEvent, PublishedCursor, QueueEntity, QueueItem, QueuePayload, ReasonCode, Reviewer } from "./types";
// Per-row decision form: reasonCode/note, the correction-only outcome + linked record id (H1, t_69891619)
// and the camera approve publication choices.
type FormFields = { reason?: string; note?: string; outcome?: string; cameraId?: string; publication?: { manufacturer: boolean; observedOn: boolean } };

export function useModerationQueue() {
  const { locale } = useLocale();
  const messages = useMessages();
  const t = messages.moderation;

  const [cameras, setCameras] = useState<CameraInQueue[]>([]);
  const [reviewCameras, setReviewCameras] = useState<CameraInQueue[]>([]);
  const [publishedCameras, setPublishedCameras] = useState<CameraInQueue[]>([]);
  const [corrections, setCorrections] = useState<CorrectionInQueue[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequestInQueue[]>([]);
  const [recentEvents, setRecentEvents] = useState<ModerationEvent[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  // Published pagination: history holds the cursor of each page we came FROM (null = first page).
  const [publishedNextCursor, setPublishedNextCursor] = useState<PublishedCursor | null>(null);
  const [publishedHistory, setPublishedHistory] = useState<(PublishedCursor | null)[]>([]);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [actorId, setActorId] = useState("");
  const [forms, setForms] = useState<Record<string, FormFields>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  // PATCH/decision error (own alert) vs queue-load failure, kept separate so a rejected decision is never offered a page retry.
  const [error, setError] = useState("");
  const [queueError, setQueueError] = useState("");
  // Current-page cursor (ref, so a decision refresh targets the page shown NOW) + request generation.
  const publishedCursorRef = useRef<PublishedCursor | null>(null);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  // BCP 47 tag from the locale registry (LOCALE_BCP47) — no it-IT/en-US ternary (t_6424f961).
  function readableDate(value?: string) { if (!value) return t.timeUnavailable; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(LOCALE_BCP47[locale]); }
  const actionLabel = (action: ModerationAction) => t.action[action];
  const readableAction = (action?: string) => action && action in t.actionPast ? t.actionPast[action as ModerationAction] : action ?? t.decisionRecorded;
  const readableReason = (reasonCode?: string) => reasonCode && reasonCode in t.reasons ? t.reasons[reasonCode as ReasonCode] : reasonCode ?? t.timeUnavailable;
  const readableStatus = (status?: string) => status && status in t.statusLabels ? t.statusLabels[status as keyof typeof t.statusLabels] : status ?? t.recorded;
  const readableOutcome = (outcome?: string) => outcome && outcome in t.outcomeLabels ? t.outcomeLabels[outcome as keyof typeof t.outcomeLabels] : outcome ?? t.unavailable;
  const loadQueue = useCallback(() => {
    const generation = (generationRef.current += 1);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const cursor = publishedCursorRef.current;
    const params = new URLSearchParams();
    if (cursor) { params.set("published_after_created_at", cursor.createdAt); params.set("published_after_id", String(cursor.id)); }
    const query = params.toString();
    const list = <T,>(value: T[] | undefined) => (Array.isArray(value) ? value : []);
    fetch(query ? `/api/moderation?${query}` : "/api/moderation", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as QueuePayload;
        // A superseded request must never write state (its Response.json may still be pending at abort).
        if (generation !== generationRef.current) return;
        if (!response.ok) throw new Error(data.error || t.loadError);
        setCameras(list(data.cameraReports)); setReviewCameras(list(data.reviewCameras)); setPublishedCameras(list(data.publishedCameras));
        setCorrections(list(data.correctionRequests)); setEditRequests(list(data.cameraEditRequests)); setRecentEvents(list(data.recentEvents));
        setReviewers(list(data.reviewers)); setQueueItems(list(data.queueItems)); setPublishedNextCursor(data.publishedNextCursor ?? null);
        setQueueError("");
      })
      .catch((reason: unknown) => {
        if (generation !== generationRef.current) return;
        if (reason instanceof Error && reason.name !== "AbortError") setQueueError(reason.message);
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        setLoading(false); setPublishedLoading(false);
      });
  }, [t.loadError]);
  useEffect(() => {
    loadQueue();
    return () => { generationRef.current += 1; controllerRef.current?.abort(); };
  }, [loadQueue]);
  // One page forward/backward (no prefetching); clears the old page so no stale card renders mid-fetch.
  function goToPublishedPage(direction: "next" | "previous") {
    if (publishedLoading) return;
    if (direction === "previous") {
      if (publishedHistory.length === 0) return;
      const previous = publishedHistory[publishedHistory.length - 1];
      setPublishedHistory(publishedHistory.slice(0, -1));
      publishedCursorRef.current = previous;
    } else {
      if (!publishedNextCursor) return;
      setPublishedHistory([...publishedHistory, publishedCursorRef.current]);
      publishedCursorRef.current = publishedNextCursor;
    }
    setPublishedCameras([]); setPublishedNextCursor(null); setPublishedLoading(true);
    loadQueue();
  }
  // Retry the CURRENT cursor after a queue-load failure (busy-guarded).
  function retryQueueLoad() { if (publishedLoading) return; setPublishedLoading(true); loadQueue(); }
  const summary = useMemo(() => t.awaiting(cameras.length + corrections.length + editRequests.length), [t, cameras.length, corrections.length, editRequests.length]);
  const queueByKey = useMemo(() => new Map(queueItems.map((item) => [`${item.entity}-${item.entityId}`, item])), [queueItems]);
  function queueBadge(entity: QueueEntity, id: number) {
    const item = queueByKey.get(`${entity}-${id}`);
    if (!item) return null;
    const labels = t.queueLabels as Record<string, string>;
    const sensitivities = t.sensitivityLabels as Record<string, string>;
    return <p className="card-topline"><span className="status-dot pending" /> {t.queueState}: {labels[item.state] ?? item.state}{item.sensitivity !== "standard" ? ` · ${t.sensitivity}: ${sensitivities[item.sensitivity] ?? item.sensitivity}` : ""}{item.requiresSecondReview === 1 ? ` · ${t.secondReview}` : ""}</p>;
  }
  async function decide(entity: QueueEntity, id: number, action: ModerationAction) {
    const key = `${entity}-${id}`;
    const fields = forms[key] ?? {};
    const reasonCode = fields.reason;
    const note = fields.note?.trim();
    const outcome = fields.outcome;
    const actingAs = Number.parseInt(actorId, 10);
    const rawCameraId = fields.cameraId ?? "";
    const parsedCameraId = rawCameraId.trim() === "" ? null : Number.parseInt(rawCameraId, 10);
    if (!reasonCode) return;
    if (!Number.isInteger(actingAs) || actingAs < 1) { setError(t.actorRequired); return; }
    // Correction association (H1 t_69891619): approve needs a record outcome, associate a record id.
    // Both are also enforced server-side (association is 400), so this only saves a round-trip.
    if (entity === "correction" && action === "approve" && !outcome) { setError(t.approveRequiresOutcome); return; }
    if (entity === "correction" && action === "associate" && (parsedCameraId === null || !Number.isInteger(parsedCameraId) || parsedCameraId < 1)) { setError(t.associateRequiresCameraId); return; }
    if (entity === "correction" && parsedCameraId !== null && (!Number.isInteger(parsedCameraId) || parsedCameraId < 1)) { setError(t.invalidRecordId); return; }
    setProcessing(key); setMessage(""); setError("");
    try {
      const response = await fetch("/api/moderation", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity, id, action, reasonCode, actorId: actingAs, ...(note ? { note } : {}),
          ...(entity === "correction" && action === "approve" && outcome ? { outcome } : {}),
          ...(entity === "correction" && parsedCameraId !== null ? { cameraId: parsedCameraId } : {}),
          ...(entity === "camera" && action === "approve" ? { publishManufacturer: fields.publication?.manufacturer ?? false, publishObservedOn: fields.publication?.observedOn ?? false } : {}),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t.saveError);
      // Drop the decided row's form state, then reload so badges/moved items stay truthful.
      setForms((all) => { const next = { ...all }; delete next[key]; return next; });
      setMessage(`${entity === "camera" ? t.cameraReport : entity === "camera_edit" ? t.editRequest : t.correctionRequest} #${id} ${t.decisionSaved}: ${actionLabel(action)}. ${t.reason}: ${readableReason(reasonCode)}.`);
      setPublishedLoading(true); loadQueue(); // refresh in place (current cursor ref)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.saveError);
    } finally { setProcessing(null); }
  }

  const decisionApi: DecisionFormApi = {
    reason: (key) => forms[key]?.reason ?? "", setReason: (key, value) => setForms((all) => ({ ...all, [key]: { ...all[key], reason: value } })),
    note: (key) => forms[key]?.note ?? "", setNote: (key, value) => setForms((all) => ({ ...all, [key]: { ...all[key], note: value.slice(0, 500) } })),
    outcome: (key) => forms[key]?.outcome ?? "", setOutcome: (key, value) => setForms((all) => ({ ...all, [key]: { ...all[key], outcome: value } })),
    cameraId: (key) => forms[key]?.cameraId ?? "", setCameraId: (key, value) => setForms((all) => ({ ...all, [key]: { ...all[key], cameraId: value } })),
    metadataChoices: (key) => forms[key]?.publication ?? { manufacturer: false, observedOn: false },
    setMetadataChoice: (key, field, value) => setForms((all) => ({ ...all, [key]: { ...all[key], publication: { ...(all[key]?.publication ?? { manufacturer: false, observedOn: false }), [field]: value } } })),
    processing, actorId, decide,
  };

  return {
    loading, message, error, queueError, summary,
    cameras, publishedCameras, reviewCameras, corrections, editRequests, recentEvents, reviewers,
    actorId, setActorId,
    publishedPagination: {
      previousLabel: messages.community.previousPage, nextLabel: messages.community.nextPage,
      loading: publishedLoading, hasPrevious: publishedHistory.length > 0, hasNext: publishedNextCursor !== null,
      failed: queueError !== "", onPrevious: () => goToPublishedPage("previous"), onNext: () => goToPublishedPage("next"), onRetry: retryQueueLoad,
    },
    queueBadge, readableDate, readableAction, readableReason, readableStatus, readableOutcome,
    decisionApi,
  };
}
