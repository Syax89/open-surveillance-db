"use client";

/**
 * Viewport-bounded public-cameras data layer for the interactive map
 * (kanban t_bb310428 — P0 map UX regression).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The /mappa tool used to consume the SAME full-list walk as the home
 * directory (usePublicCameras → 15 serial GET /api/cameras?limit=500 pages,
 * measured ~5.35s on 7,374 records): markers appeared only after the whole
 * walk completed, and the filter bar stayed at 0 while the list loaded.
 *
 * The map does not need the full dataset up front — it renders what the
 * current viewport frames (viewport-first marker culling, t_26ce96f3). This
 * hook fetches ONLY the records inside the CURRENT bounds via the bounded
 * JSON bbox contract (GET /api/cameras?bbox=west,south,east,north), with:
 *
 *  - module-level cache: every fetched bbox is kept for 5 minutes (aligned
 *    with the API Cache-Control window) keyed by the quantized rectangle +
 *    server-filter combo, so panning back over a loaded area is instant;
 *  - in-flight dedupe: concurrent consumers / StrictMode double-effects share
 *    one promise per bbox instead of duplicating requests;
 *  - merge store: records from every fetched bbox accumulate in one
 *    id-keyed store (deduped, newest payload wins), so markers stay visible
 *    while panning and the sidebar count converges as the user explores;
 *  - containment skip: a pan that stays inside an already-loaded (padded)
 *    area performs no network request at all;
 *  - focus resolution: a ?focus=ID deep link resolves the record through the
 *    dedicated GET /api/cameras/[id] endpoint when it is outside every
 *    loaded bbox, so the pan + popup deep-link contract survives viewport
 *    loading (the record may be anywhere in the dataset);
 *  - explicit states: loading (first payload in flight), error (network or
 *    non-2xx), empty (the API answered and no public record exists at all).
 *
 * The module NEVER walks the paginated list: every request carries a bbox.
 * The directory and record pages keep using usePublicCameras unchanged.
 *
 * Contract notes for consumers (MappaTool):
 *  - `records` is the merged store (union of all fetched viewports). The
 *    caller applies its own client-side filters (applyCameraFilters) and
 *    culls by viewport (recordsInBounds) exactly as before — the markers and
 *    the sidebar list behave identically, just on a smaller, faster source;
 *  - `total` is the bbox-scoped server count of the LATEST response (the
 *    records inside the box matching the server filters). The filter-bar
 *    count in the UI stays client-side over the store (same computation as
 *    before) — it converges to the dataset total as the user explores;
 *  - `onRecords` fires ONCE, when the store transitions empty → non-empty
 *    (the caller's initial-selection callback must not steal the selection
 *    on every pan);
 *  - the focused record (focusId) is merged WITHOUT firing onRecords: a deep
 *    link must never be overridden by the first-viewport selection.
 */

import { useEffect, useRef, useState } from "react";
import { publicRecords, type Camera } from "./records";
import type { ViewportBounds } from "./map-viewport";
import type { ServerCameraFilters } from "./use-public-cameras";

/** The client asks for the whole visible set in ONE request (bounded server-side). */
export const VIEWPORT_BBOX_LIMIT = 10_000;
/** Cache TTL: aligned with the API's 5-minute Cache-Control window. */
export const VIEWPORT_CACHE_TTL_MS = 300_000;
/** Coalesce moveend bursts (the map already debounces at BOUNDS_DEBOUNCE_MS). */
export const VIEWPORT_FETCH_DEBOUNCE_MS = 150;
/** Cache-cell quantization (~110 m at the equator — tiny pans hit the cache). */
export const VIEWPORT_QUANTIZE_DECIMALS = 3;
/** A pan is covered (no fetch) when it stays inside a loaded bbox padded by this factor. */
export const VIEWPORT_COVER_PADDING = 0.15;

type ViewportPage = {
  records: Camera[];
  total: number;
  nextOffset: number | null;
};

type CacheEntry = {
  bounds: ViewportBounds;
  filterKey: string;
  records: Camera[];
  total: number;
  fetchedAt: number;
};

// Module-level caches (one per page load; __resetViewportCamerasCache drops
// them for tests and error-state recovery).
const bboxCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ViewportPage>>();
const focusWalks = new Map<number, Promise<Camera | null>>();

/** Quantized cache key: server-filter combo + the ~110 m bbox cell. */
function bboxCacheKey(bounds: ViewportBounds, filterKey: string): string {
  const d = VIEWPORT_QUANTIZE_DECIMALS;
  const q = (value: number) => value.toFixed(d);
  return `${filterKey}|${q(bounds.south)}|${q(bounds.north)}|${q(bounds.west)}|${q(bounds.east)}`;
}

function filterKeyOf(filters: ServerCameraFilters): string {
  return `${filters.kind ?? ""}|${filters.freshness ?? ""}`;
}

/** Expand a rectangle by a relative padding (for the containment skip). */
function paddedBounds(bounds: ViewportBounds, factor: number): ViewportBounds {
  const latPad = (bounds.north - bounds.south) * factor;
  const lngPad = (bounds.east - bounds.west) * factor;
  return {
    south: bounds.south - latPad,
    north: bounds.north + latPad,
    west: bounds.west - lngPad,
    east: bounds.east + lngPad,
  };
}

/** True when `inner` is fully inside `outer` (non-antimeridian rectangles). */
function containsBounds(outer: ViewportBounds, inner: ViewportBounds): boolean {
  if (outer.west >= outer.east || inner.west >= inner.east) return false; // antimeridian — never covered by the simple path
  return (
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

/** Is the requested rectangle already covered by a fresh cached bbox (same filters)? */
function isCovered(bounds: ViewportBounds, filterKey: string): boolean {
  const now = Date.now();
  for (const entry of bboxCache.values()) {
    if (entry.fetchedAt + VIEWPORT_CACHE_TTL_MS < now) continue;
    if (entry.filterKey !== filterKey) continue;
    if (containsBounds(paddedBounds(entry.bounds, VIEWPORT_COVER_PADDING), bounds)) return true;
  }
  return false;
}

/** The fresh cached bbox that covers the requested rectangle, or null. */
function coveringEntry(bounds: ViewportBounds, filterKey: string): CacheEntry | null {
  const now = Date.now();
  let best: CacheEntry | null = null;
  for (const entry of bboxCache.values()) {
    if (entry.fetchedAt + VIEWPORT_CACHE_TTL_MS < now) continue;
    if (entry.filterKey !== filterKey) continue;
    if (!containsBounds(paddedBounds(entry.bounds, VIEWPORT_COVER_PADDING), bounds)) continue;
    // Prefer the SMALLEST covering box (tightest fit — most precise).
    if (!best || boxArea(entry.bounds) < boxArea(best.bounds)) best = entry;
  }
  return best;
}

function boxArea(bounds: ViewportBounds): number {
  return Math.max(0, bounds.north - bounds.south) * Math.max(0, bounds.east - bounds.west);
}

/**
 * Merge a fetched page into the store: id-deduped, first position kept,
 * newest payload wins for the fields (fresh community counts after a
 * moderation action).
 */
function mergeRecords(current: Camera[], incoming: Camera[]): Camera[] {
  if (incoming.length === 0) return current;
  const index = new Map(current.map((record) => [record.id, record]));
  let changed = false;
  for (const record of incoming) {
    const existing = index.get(record.id);
    if (!existing) {
      index.set(record.id, record);
      changed = true;
    } else if (existing !== record) {
      index.set(record.id, record);
      changed = true;
    }
  }
  if (!changed) return current;
  return [...index.values()];
}

/** One viewport request URL (bbox + server filters + bounded limit). */
export function viewportQuery(bounds: ViewportBounds, filters: ServerCameraFilters, offset = 0): string {
  const params = new URLSearchParams();
  params.set("bbox", `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
  params.set("limit", String(VIEWPORT_BBOX_LIMIT));
  params.set("offset", String(offset));
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.freshness) params.set("freshness", filters.freshness);
  return `/api/cameras?${params.toString()}`;
}

/**
 * Fetch one bbox page (or walk the bbox subset when nextOffset says there is
 * more — a dense national viewport still lands in one request at the max
 * limit, and the walk never escapes the box). Records pass the same
 * defense-in-depth publicRecords gate as every other client data path.
 */
async function fetchViewportPage(bounds: ViewportBounds, filters: ServerCameraFilters, signal: AbortSignal): Promise<ViewportPage> {
  const first = await fetch(viewportQuery(bounds, filters, 0), { signal });
  if (!first.ok) throw new Error(`HTTP ${first.status}`);
  const data = (await first.json()) as Partial<ViewportPage>;
  if (!Array.isArray(data.records)) throw new Error("Malformed bbox payload");
  const collected = publicRecords(data.records);
  let total = typeof data.total === "number" ? data.total : collected.length;
  let nextOffset: number | null = data.nextOffset ?? null;
  // Page through the bbox subset ONLY while it keeps advancing (same guard
  // as the directory walk: a server that fails to advance must not loop).
  while (nextOffset !== null && nextOffset > 0) {
    const page = await fetch(viewportQuery(bounds, filters, nextOffset), { signal });
    if (!page.ok) throw new Error(`HTTP ${page.status}`);
    const body = (await page.json()) as Partial<ViewportPage>;
    if (!Array.isArray(body.records) || body.records.length === 0) break;
    collected.push(...publicRecords(body.records));
    if ((body.nextOffset ?? null) === nextOffset) break; // no advance → stop
    nextOffset = body.nextOffset ?? null;
    total = typeof body.total === "number" ? body.total : total;
  }
  return { records: collected, total, nextOffset: null };
}

/** Resolve ONE record for a ?focus= deep link (dedicated endpoint, 1 request). */
function ensureFocusRecord(id: number): Promise<Camera | null> {
  const existing = focusWalks.get(id);
  if (existing) return existing;
  const promise = fetch(`/api/cameras/${id}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as { record?: Camera };
      // Strict public gate: the MAP is a list surface (ADR 0021 §6.3) — a
      // withdrawn record reachable on the record page is NOT a marker here.
      return data.record ? (publicRecords([data.record])[0] ?? null) : null;
    })
    .catch(() => null)
    .finally(() => { focusWalks.delete(id); });
  focusWalks.set(id, promise);
  return promise;
}

/** Test-only: drop every cache and in-flight request. */
export function __resetViewportCamerasCache(): void {
  bboxCache.clear();
  inFlight.clear();
  focusWalks.clear();
}

export type UseViewportCamerasOptions = {
  /** Current map bounds (undefined/null until the map emits its first viewport). */
  bounds?: ViewportBounds | null;
  /** F0 server-side filters (kind/freshness), forwarded to the bbox query. */
  filters?: ServerCameraFilters;
  /** ?focus= deep link: resolve this record even when outside every loaded bbox. */
  focusId?: number | null;
  /** Fired ONCE when the store transitions empty → non-empty. */
  onRecords?: (records: Camera[]) => void;
  /** Fired once when the API fetch fails (callers surface the notice). */
  onError?: () => void;
};

export type UseViewportCamerasResult = {
  /** Merged store: the union of every fetched viewport (id-deduped). */
  records: Camera[];
  /** Bbox-scoped server total of the latest response (null until the first answer). */
  total: number | null;
  /** True while the FIRST payload is in flight (no markers to show yet). */
  loading: boolean;
  /** The API fetch failed (network error or non-2xx response). */
  error: boolean;
  /** The API answered but no public record exists at all. */
  empty: boolean;
  /** Drop the caches and refetch the current viewport (error-state recovery). */
  reload: () => void;
};

export function useViewportCameras({ bounds, filters, focusId, onRecords, onError }: UseViewportCamerasOptions = {}): UseViewportCamerasResult {
  const filterKey = filterKeyOf(filters ?? {});
  const filtersRef = useRef<ServerCameraFilters>(filters ?? {});
  useEffect(() => { filtersRef.current = filters ?? {}; });
  // Mirror of `bounds` for the fetch effect: the effect must re-run ONLY on
  // the quantized bounds key (a tiny pan that maps to the same cache cell
  // must not refetch) — reading the current bounds through a ref keeps the
  // closure fresh without putting the unstable object in the dependency
  // array (same pattern as filtersRef, PR #165 review blocker t_6e9c812d).
  const boundsRef = useRef<ViewportBounds | null>(bounds ?? null);
  useEffect(() => { boundsRef.current = bounds ?? null; });
  const onRecordsRef = useRef(onRecords);
  useEffect(() => { onRecordsRef.current = onRecords; });
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  const [records, setRecords] = useState<Camera[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Synchronous store mirror: the merge/notify logic runs OUTSIDE the React
  // state updater (updaters may be double-invoked in StrictMode and must
  // stay side-effect free), so the store is kept in a ref and committed with
  // one setState. The focus effect reads the same ref without re-running on
  // every merge.
  const storeRef = useRef<Camera[]>([]);
  /** Merge `incoming` into the store; returns the new store. */
  const commitRecords = (incoming: Camera[]): Camera[] => {
    const next = mergeRecords(storeRef.current, incoming);
    if (next !== storeRef.current) {
      storeRef.current = next;
      setRecords(next);
    }
    return next;
  };
  // Keys already merged into THIS hook instance's store (cache hits and
  // fetches alike) — a pan that stays inside a loaded area must not re-merge
  // and re-render the whole tree.
  const mergedKeysRef = useRef<Set<string>>(new Set());
  // The first non-empty payload fires onRecords exactly once per load/reload.
  const notifiedRef = useRef(false);

  const boundsKey = bounds ? bboxCacheKey(bounds, filterKey) : null;

  // Viewport fetch: debounced, cache/dedupe/containment-aware, aborted when
  // the viewport or the server filters change.
  useEffect(() => {
    if (boundsRef.current == null) return; // no viewport yet — the map emits its first bounds right after creation
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const currentBounds = boundsRef.current!;
      const key = bboxCacheKey(currentBounds, filterKey);
      (async () => {
        // 1) Containment: the requested rectangle is already inside a fresh
        //    cached bbox → the store already has every record; no request.
        //    (A warm module cache on a SECOND visit must also settle the
        //    loading/error/total states — never leave the map spinning.)
        if (isCovered(currentBounds, filterKey)) {
          if (!mergedKeysRef.current.has(key)) {
            mergedKeysRef.current.add(key);
            const covering = coveringEntry(currentBounds, filterKey);
            if (covering) {
              setLoading(false);
              setError(false);
              if (covering.records.length > 0) setEmpty(false);
              setTotal(covering.total);
              commitRecords(covering.records);
            }
          }
          return;
        }
        // 2) In-flight dedupe + module cache (shared across consumers).
        let page: ViewportPage;
        const cached = bboxCache.get(key);
        if (cached && cached.fetchedAt + VIEWPORT_CACHE_TTL_MS > Date.now()) {
          page = { records: cached.records, total: cached.total, nextOffset: null };
        } else if (inFlight.has(key)) {
          page = await inFlight.get(key)!;
        } else {
          const promise = fetchViewportPage(currentBounds, filtersRef.current, controller.signal);
          inFlight.set(key, promise);
          try {
            page = await promise;
          } finally {
            inFlight.delete(key);
          }
          bboxCache.set(key, { bounds: currentBounds, filterKey, records: page.records, total: page.total, fetchedAt: Date.now() });
        }
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(false);
        if (page.total === 0 && page.records.length === 0) setEmpty(true);
        setTotal(page.total);
        if (!mergedKeysRef.current.has(key)) {
          mergedKeysRef.current.add(key);
          const merged = commitRecords(page.records);
          // The first non-empty payload fires onRecords ONCE (initial
          // selection); later pans/merges must not steal the selection.
          if (!notifiedRef.current && merged.length > 0) {
            notifiedRef.current = true;
            queueMicrotask(() => onRecordsRef.current?.(merged));
          }
        }
      })().catch(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(true);
        onErrorRef.current?.();
      });
    }, VIEWPORT_FETCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // Re-run ONLY on the quantized bounds (a tiny pan that maps to the same
    // cache cell does not refetch) and on the semantic filter combo — never
    // on the `bounds`/`filters` object identities (unstable; see the same
    // pattern in use-public-cameras, PR #165 review blocker t_6e9c812d).
  }, [boundsKey, filterKey, attempt]);

  // Focus resolution: ?focus=ID must render even when the record lies
  // outside every loaded bbox. Merged WITHOUT onRecords — a deep link must
  // not be overridden by the first-viewport selection callback.
  useEffect(() => {
    if (focusId == null) return;
    if (storeRef.current.some((record) => record.id === focusId)) return;
    let cancelled = false;
    ensureFocusRecord(focusId).then((record) => {
      if (cancelled || !record) return;
      commitRecords([record]);
    });
    return () => { cancelled = true; };
  }, [focusId, attempt]);

  return {
    records,
    total,
    loading,
    error,
    empty,
    reload: () => {
      __resetViewportCamerasCache();
      mergedKeysRef.current.clear();
      notifiedRef.current = false;
      setError(false);
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}
