"use client";

// Bounded moderation queues (pending / needs review / corrections / edits).
// GET /api/moderation returns ONE keyset page per queue plus a whole-queue
// COUNT (`queueTotals`) and a next cursor (`queueNextCursors`). This hook
// owns that paging state and the "load more" fetch, which asks for the next
// page of a single queue (`<queue>_after_created_at` + `<queue>_after_id`) and
// appends it; the other queues in that reply are ignored. A full reload
// (useModerationQueue.loadQueue) resets every queue to its first page.

import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useMessages } from "../../lib/use-messages";
import type { CameraInQueue, CorrectionInQueue, EditRequestInQueue, PagedQueue, PublishedCursor, QueueItem, QueuePayload } from "./types";

/** Queues the dashboard renders with a "load more" control (stale has no section yet). */
export type DashboardPagedQueue = Exclude<PagedQueue, "stale">;
type QueueTotals = Partial<Record<PagedQueue | "published", number>>;
type QueueCursors = Partial<Record<PagedQueue, PublishedCursor | null>>;

/** Append a further page, dropping any id already shown (a row can shift pages between requests). */
function appendUnique<T extends { id: number }>(current: T[], more: T[] | undefined): T[] {
  if (!Array.isArray(more)) return current;
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...more.filter((item) => !seen.has(item.id))];
}

/** Merge queue badges for appended rows (the newer state wins per entity/id). */
function mergeQueueItems(current: QueueItem[], more: QueueItem[]): QueueItem[] {
  const keys = new Set(more.map((item) => `${item.entity}-${item.entityId}`));
  return [...current.filter((item) => !keys.has(`${item.entity}-${item.entityId}`)), ...more];
}

type Options = {
  /** Full-load generation: a load-more reply from an older generation is dropped. */
  generationRef: RefObject<number>;
  /** Synchronous gate of the published page navigation. */
  busyRef: RefObject<boolean>;
  /** Dashboard list setters a load-more reply appends to. */
  setters: {
    setCameras: Dispatch<SetStateAction<CameraInQueue[]>>;
    setReviewCameras: Dispatch<SetStateAction<CameraInQueue[]>>;
    setCorrections: Dispatch<SetStateAction<CorrectionInQueue[]>>;
    setEditRequests: Dispatch<SetStateAction<EditRequestInQueue[]>>;
    setQueueItems: Dispatch<SetStateAction<QueueItem[]>>;
  };
};

export function useBoundedQueues({ generationRef, busyRef, setters }: Options) {
  const t = useMessages().moderation;
  const [totals, setTotals] = useState<QueueTotals>({}); const [nextCursors, setNextCursors] = useState<QueueCursors>({});
  const [loadingMore, setLoadingMore] = useState<DashboardPagedQueue | null>(null); const [failed, setFailed] = useState<DashboardPagedQueue | null>(null);
  // Queues that grew past their first page keep their control (and focus) on the last page.
  const [expanded, setExpanded] = useState<Partial<Record<DashboardPagedQueue, boolean>>>({});
  const moreGenerationRef = useRef(0); const controllerRef = useRef<AbortController | null>(null);

  /** A full load is starting (or the dashboard unmounts): drop any in-flight load-more. */
  const invalidate = useCallback(() => {
    moreGenerationRef.current += 1; controllerRef.current?.abort(); setLoadingMore(null);
  }, []);

  /** A full load succeeded: every queue is back on its first page. */
  const reset = useCallback((data: QueuePayload) => {
    setTotals(data.queueTotals ?? {}); setNextCursors(data.queueNextCursors ?? {}); setExpanded({}); setFailed(null);
  }, []);

  function loadMore(queue: DashboardPagedQueue) {
    const cursor = nextCursors[queue];
    if (!cursor || loadingMore || busyRef.current) return;
    const generation = generationRef.current; const more = (moreGenerationRef.current += 1);
    const controller = new AbortController(); controllerRef.current = controller;
    const stale = () => generation !== generationRef.current || more !== moreGenerationRef.current;
    const params = new URLSearchParams({ [`${queue}_after_created_at`]: cursor.createdAt, [`${queue}_after_id`]: String(cursor.id) });
    setLoadingMore(queue); setFailed(null);
    fetch(`/api/moderation?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as QueuePayload;
        if (stale()) return;
        if (!response.ok) throw new Error(data.error || t.loadError);
        if (queue === "pending") setters.setCameras((items) => appendUnique(items, data.cameraReports));
        else if (queue === "review") setters.setReviewCameras((items) => appendUnique(items, data.reviewCameras));
        else if (queue === "corrections") setters.setCorrections((items) => appendUnique(items, data.correctionRequests));
        else setters.setEditRequests((items) => appendUnique(items, data.cameraEditRequests));
        if (Array.isArray(data.queueItems)) setters.setQueueItems((items) => mergeQueueItems(items, data.queueItems ?? []));
        setNextCursors((cursors) => ({ ...cursors, [queue]: data.queueNextCursors?.[queue] ?? null }));
        if (data.queueTotals) setTotals(data.queueTotals);
        setExpanded((flags) => ({ ...flags, [queue]: true }));
      })
      .catch((reason: unknown) => { if (stale()) return; if (!(reason instanceof Error && reason.name === "AbortError")) setFailed(queue); })
      .finally(() => { if (stale()) return; setLoadingMore(null); });
  }

  /** Paging props for one bounded queue section ("N of M" + load more). */
  function queuePaging(queue: DashboardPagedQueue, shown: number) {
    const total = totals[queue] ?? shown;
    return {
      note: t.shownOf(shown, total), showing: t.queueShowing(shown, total),
      hasMore: Boolean(nextCursors[queue]), loading: loadingMore === queue, failed: failed === queue, expanded: Boolean(expanded[queue]),
      loadMoreLabel: t.loadMore, loadingLabel: t.loadingMore, errorLabel: t.loadMoreError,
      onLoadMore: () => loadMore(queue),
    };
  }

  return { totals, invalidate, reset, queuePaging };
}
