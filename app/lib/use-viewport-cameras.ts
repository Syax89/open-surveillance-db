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
import { viewportRectangles, type ViewportBounds } from "./map-viewport";
import type { ServerCameraFilters } from "./use-public-cameras";

/** The client asks for the whole visible set in ONE request (bounded server-side). */
export const VIEWPORT_BBOX_LIMIT = 10_000;
/**
 * Above this geographic area the map is in overview mode: let the existing
 * server count/decimation contract cap the payload rather than allow a bbox
 * page walk. Street/city views keep the cheaper count=false probe.
 */
export const VIEWPORT_OVERVIEW_AREA_SQ_DEG = 1;
/** Cache TTL: aligned with the API's 5-minute Cache-Control window. */
export const VIEWPORT_CACHE_TTL_MS = 300_000;
/** Coalesce moveend bursts (the map already debounces at BOUNDS_DEBOUNCE_MS). */
export const VIEWPORT_FETCH_DEBOUNCE_MS = 150;
/**
 * Debounce for continental viewports (area over the server decimation cap):
 * a zoom-OUT gesture sweeps many oversized bboxes in quick succession — each
 * one would fetch a sample the user never stops to look at. Waiting until
 * the gesture settles (~0.8 s of quiet) turns a whole zoom-out into ONE
 * request instead of one per zoom step.
 */
export const VIEWPORT_ZOOMOUT_DEBOUNCE_MS = 800;
/**
 * Server-side decimation cap (db/cameras.ts BBOX_MAX_AREA_SQ_DEG): viewports
 * over this area answer a decimated sample and get the long debounce.
 */
export const VIEWPORT_MAX_AREA_SQ_DEG = 50;
/** Cache-cell quantization (~110 m at the equator — tiny pans hit the cache). */
export const VIEWPORT_QUANTIZE_DECIMALS = 3;
/** One server-directed retry is enough; never turn a 429 into a request loop. */
export const VIEWPORT_RATE_LIMIT_AUTO_RETRIES = 1;
/** A malformed intermediary header must not freeze the map for an unbounded time. */
const MAX_RETRY_AFTER_SECONDS = 120;

type ViewportPage = {
  records: Camera[];
  total: number;
  nextOffset: number | null;
  /** True when the server answered a decimated sample (continental viewport). */
  decimated?: boolean;
};

class ViewportRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Viewport request rate limited");
    this.name = "ViewportRateLimitError";
  }
}

function retryAfterSeconds(response: Response): number {
  const parsed = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_RETRY_AFTER_SECONDS);
}

type CacheEntry = {
  bounds: ViewportBounds;
  filterKey: string;
  records: Camera[];
  total: number;
  fetchedAt: number;
  decimated?: boolean;
  /**
   * True only for a COMPLETE response (every record in the box). A decimated
   * sample is cached — so panning back over it is still cheap — but must
   * NEVER cover a subsequent detail fetch (B04): an incomplete sample cannot
   * erase the decimated flag or suppress city detail.
   */
  complete: boolean;
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

/**
 * Exact (non-quantized) geometry key (B04). The fetch effect depends on THIS
 * — not on the quantized cache cell — so two rectangles that round to the
 * same cell but are NOT identical (bboxA 0..0.1 vs bboxB 0.0001..0.1001) still
 * trigger a fresh coverage decision instead of silently reusing a payload the
 * cell never fetched. The cache MAP stays quantized (shares storage); the
 * REUSE decision is coverage-based (see `cachedEntryCovers`).
 */
function bboxExactKey(bounds: ViewportBounds): string {
  return `${bounds.south}|${bounds.north}|${bounds.west}|${bounds.east}`;
}

/**
 * FULL request identity (B04/R3a): the semantic server-filter combo (kind/
 * freshness/…) PLUS the exact geometry. The MERGE-dedupe and IN-FLIGHT maps
 * must key on this — geometry alone would let a consumer with a different
 * server filter skip (or join) a request for another filter's records, so a
 * native filter change would never display the newly fetched data. The cache
 * map keeps its own `bboxCacheKey` (also filter-scoped).
 */
function bboxRequestKey(bounds: ViewportBounds, filterKey: string): string {
  return `${filterKey}|${bboxExactKey(bounds)}`;
}

/**
 * The exact geometry key of a viewport (B04/B09/B10): the same key the fetch
 * effect keys on, exposed so a caller can identify WHICH viewport a settlement
 * belongs to (a place-search landing must wait for its OWN destination, never
 * for an unrelated settled event).
 */
export function viewportGeometryKey(bounds: ViewportBounds): string {
  return viewportRectangles(bounds).map(bboxExactKey).join("+");
}

/**
 * The outcome of the last completed viewport resolution (B10/R3c): `key` is the
 * exact geometry that settled, `status` distinguishes a real answer (`ok`,
 * including an empty one) from a failed request (`error`), and `filterKey` is
 * the server-filter combo of THAT request — so a caller never lets an older,
 * different-filter settlement consume a newer intent for the same geometry.
 * An ABORTED request never settles.
 */
export type ViewportSettlement = { key: string; status: "ok" | "error"; filterKey: string };

function filterKeyOf(filters: ServerCameraFilters): string {
  return `${filters.kind ?? ""}|${filters.freshness ?? ""}`;
}

/** True when `inner` is fully inside `outer` (normalized rectangles: west<east). */
function containsBounds(outer: ViewportBounds, inner: ViewportBounds): boolean {
  return (
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

/**
 * True when a fresh, COMPLETE cached bbox contains the requested rectangle.
 * The containment uses the rectangle that was ACTUALLY fetched — no virtual
 * padding (B04): the old 15% padding claimed a strip the server never sent,
 * so a small pan into that strip was silently treated as covered. An
 * incomplete (decimated) sample never covers — it only holds a few points.
 */
function cachedEntryCovers(entry: CacheEntry, bounds: ViewportBounds, filterKey: string, now: number): boolean {
  if (!entry.complete) return false;
  if (entry.fetchedAt + VIEWPORT_CACHE_TTL_MS < now) return false;
  if (entry.filterKey !== filterKey) return false;
  return containsBounds(entry.bounds, bounds);
}

/** Is the requested rectangle already covered by a fresh COMPLETE cached bbox (same filters)? */
function isCovered(bounds: ViewportBounds, filterKey: string): boolean {
  const now = Date.now();
  for (const entry of bboxCache.values()) {
    if (cachedEntryCovers(entry, bounds, filterKey, now)) return true;
  }
  return false;
}

/** The fresh COMPLETE cached bbox that covers the requested rectangle, or null. */
function coveringEntry(bounds: ViewportBounds, filterKey: string): CacheEntry | null {
  const now = Date.now();
  let best: CacheEntry | null = null;
  for (const entry of bboxCache.values()) {
    if (!cachedEntryCovers(entry, bounds, filterKey, now)) continue;
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
  // Street/city views use the limit+1 probe to avoid a COUNT. At overview
  // scale, omitting count=false activates the existing bounded server-side
  // decimation contract — one sample response, never a client page walk.
  if (boxArea(bounds) <= VIEWPORT_OVERVIEW_AREA_SQ_DEG) params.set("count", "false");
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
  if (first.status === 429) throw new ViewportRateLimitError(retryAfterSeconds(first));
  if (!first.ok) throw new Error(`HTTP ${first.status}`);
  const data = (await first.json()) as Partial<ViewportPage>;
  if (!Array.isArray(data.records)) throw new Error("Malformed bbox payload");
  const collected = publicRecords(data.records);
  const decimated = data.decimated === true;
  let total = typeof data.total === "number" ? data.total : collected.length;
  let nextOffset: number | null = data.nextOffset ?? null;
  // A decimated sample (continental viewport) never walks: the server
  // answers ~threshold points with nextOffset null — one request, done.
  if (decimated) nextOffset = null;
  // Page through the bbox subset ONLY while it keeps advancing (same guard
  // as the directory walk: a server that fails to advance must not loop).
  while (nextOffset !== null && nextOffset > 0) {
    const page = await fetch(viewportQuery(bounds, filters, nextOffset), { signal });
    if (page.status === 429) throw new ViewportRateLimitError(retryAfterSeconds(page));
    if (!page.ok) throw new Error(`HTTP ${page.status}`);
    const body = (await page.json()) as Partial<ViewportPage>;
    if (!Array.isArray(body.records) || body.records.length === 0) break;
    collected.push(...publicRecords(body.records));
    if ((body.nextOffset ?? null) === nextOffset) break; // no advance → stop
    nextOffset = body.nextOffset ?? null;
    total = typeof body.total === "number" ? body.total : total;
  }
  return { records: collected, total, nextOffset: null, decimated };
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
  /** Fired when the API requests a bounded cooldown through Retry-After. */
  onRateLimited?: (retryAfterSeconds: number) => void;
};

export type UseViewportCamerasResult = {
  /** Merged store: the union of every fetched viewport (id-deduped). */
  records: Camera[];
  /** Bbox-scoped server total of the latest response (null until the first answer). */
  total: number | null;
  /** True when the latest response is a decimated sample (continental viewport). */
  decimated: boolean;
  /** True while the FIRST payload is in flight (no markers to show yet). */
  loading: boolean;
  /** The API fetch failed (network error or non-2xx response). */
  error: boolean;
  /** Server-directed wait for the current rate-limit cooldown, if any. */
  retryAfterSeconds: number | null;
  /** The API answered but no public record exists at all. */
  empty: boolean;
  /**
   * The last COMPLETED viewport resolution (B10): its exact geometry key and
   * whether it was a real answer or a failure. Null until the first viewport
   * settles. Aborted (superseded) requests never settle.
   */
  settled: ViewportSettlement | null;
  /** Drop the caches and refetch the current viewport (error-state recovery). */
  reload: () => void;
};

export function useViewportCameras({ bounds, filters, focusId, onRecords, onError, onRateLimited }: UseViewportCamerasOptions = {}): UseViewportCamerasResult {
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
  const onRateLimitedRef = useRef(onRateLimited);
  useEffect(() => { onRateLimitedRef.current = onRateLimited; });

  const [records, setRecords] = useState<Camera[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [decimated, setDecimated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [rateLimitCooldown, setRateLimitCooldown] = useState<{ until: number; retry: boolean } | null>(null);
  const [empty, setEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // B10: the last COMPLETED viewport resolution (exact geometry + outcome).
  const [settled, setSettled] = useState<ViewportSettlement | null>(null);

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
  // A 429 may receive one automatic recovery attempt after Retry-After;
  // repeated 429s remain visible states rather than becoming a retry loop.
  const rateLimitRetriesRef = useRef(0);
  // Tracks the last emitted viewport area. A zoom step grows area by roughly
  // 4×, while a same-level pan only shifts it slightly: the ratio avoids
  // delaying ordinary pans but coalesces every stage of a zoom-out gesture.
  const previousViewportAreaRef = useRef<number | null>(null);

  // Exact-geometry key for the CURRENT viewport (B04): one key per
  // SERVER-VALID geographic rectangle (B03) at FULL precision, so the effect
  // re-runs whenever the requested geometry really changes — including two
  // rectangles that the quantized cache CELL would conflate. The cache map
  // below stays quantized, and reuse is gated on actual coverage.
  const boundsKey = bounds ? viewportGeometryKey(bounds) : null;

  // A deliberately NEW navigation identity restarts the rate-limit budget
  // (B05/R3d): the single auto-retry is per REQUEST identity — the exact
  // geometry PLUS the semantic server-filter combo. A filter change on the same
  // viewport is a deliberate new navigation and gets its own one-retry budget,
  // while a single identity can never be driven to a third request by the
  // cooldown. `reload()` keeps its explicit reset.
  const requestIdentity = boundsKey === null ? null : `${filterKey}|${boundsKey}`;
  const retryBudgetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (requestIdentity === retryBudgetKeyRef.current) return;
    retryBudgetKeyRef.current = requestIdentity;
    rateLimitRetriesRef.current = 0;
  }, [requestIdentity]);

  // Viewport fetch: debounced, cache/dedupe/containment-aware, aborted when
  // the viewport or the server filters change.
  useEffect(() => {
    if (boundsRef.current == null) return; // no viewport yet — the map emits its first bounds right after creation
    if (rateLimitCooldown !== null) {
      const wait = Math.max(0, rateLimitCooldown.until - Date.now());
      const cooldownTimer = window.setTimeout(() => {
        setRateLimitCooldown(null);
        if (rateLimitCooldown.retry) setAttempt((value) => value + 1);
      }, wait);
      return () => window.clearTimeout(cooldownTimer);
    }
    const controller = new AbortController();
    const currentBounds = boundsRef.current!;
    // Normalize the RAW Leaflet viewport into server-valid rectangles ONCE and
    // use the same geometry for containment, cache keys and every bbox fetch.
    const currentRectangles = viewportRectangles(currentBounds);
    const currentArea = currentRectangles.reduce((sum, rect) => sum + boxArea(rect), 0);
    const previousArea = previousViewportAreaRef.current;
    previousViewportAreaRef.current = currentArea;
    // Every zoom-out stage gets the long debounce, not just the point where
    // the bbox reaches the continental server cap. Abort happens too late to
    // save a request already sent to the Worker; delaying its start makes the
    // latest settled viewport win instead.
    const zoomingOut = previousArea !== null && currentArea > previousArea * 1.25;
    const debounceMs = zoomingOut || currentArea > VIEWPORT_MAX_AREA_SQ_DEG
      ? VIEWPORT_ZOOMOUT_DEBOUNCE_MS
      : VIEWPORT_FETCH_DEBOUNCE_MS;
    const timer = window.setTimeout(() => {
      const liveRectangles = viewportRectangles(boundsRef.current!);
      const liveKeys = liveRectangles.map((rect) => bboxCacheKey(rect, filterKey));
      // Merge-dedupe uses the EXACT geometry: two rects that share a quantized
      // cache cell (bboxA 0..0.1 vs bboxB 0.0001..0.1001) are different areas,
      // so B's payload must still merge even though the CACHE cell is shared
      // (B04 — otherwise the cell key silently swallows the new strip).
      const liveMergeKeys = liveRectangles.map((rect) => bboxRequestKey(rect, filterKey));
      // Geometry-only key for the SETTLEMENT (B10): the pending landing is
      // geometry-based; the filter is matched separately via `filterKey`.
      const liveGeometryKey = liveRectangles.map(bboxExactKey).join("+");
      // Resolve ONE rectangle through the module cache / in-flight dedupe /
      // network, recording the fetched rectangle (and completeness) in cache.
      // B04: the quantized cache cell is only REUSED when its entry actually
      // COVERS this rectangle — a same-cell entry fetched for different
      // geometry is never handed out, and the in-flight dedupe is keyed on the
      // exact rectangle so a concurrent consumer of other geometry never joins
      // the wrong request.
      const resolveRectangle = async (rect: ViewportBounds, key: string): Promise<ViewportPage> => {
        const cached = bboxCache.get(key);
        if (cached && cachedEntryCovers(cached, rect, filterKey, Date.now())) {
          return { records: cached.records, total: cached.total, nextOffset: null, decimated: cached.decimated };
        }
        const flightKey = bboxRequestKey(rect, filterKey);
        if (inFlight.has(flightKey)) return inFlight.get(flightKey)!;
        const promise = fetchViewportPage(rect, filtersRef.current, controller.signal);
        inFlight.set(flightKey, promise);
        let page: ViewportPage;
        try {
          page = await promise;
        } finally {
          inFlight.delete(flightKey);
        }
        if (!controller.signal.aborted) {
          bboxCache.set(key, { bounds: rect, filterKey, records: page.records, total: page.total, fetchedAt: Date.now(), decimated: page.decimated, complete: page.decimated !== true });
        }
        return page;
      };
      (async () => {
        // 1) Containment: EVERY requested rectangle is already inside a fresh
        //    COMPLETE cached bbox → the store already has every record; no
        //    request. (A warm module cache on a SECOND visit must also settle
        //    the loading/error/total states — never leave the map spinning.)
        if (liveRectangles.every((rect) => isCovered(rect, filterKey))) {
          // Complete warm resolution: settle the SUCCESS state INDEPENDENTLY of
          // the merge-dedupe. An already-merged geometry must not skip the state
          // cleanup — a warm return has to clear a prior unrelated error /
          // cooldown notice (B05/R3f) and any stale decimated flag. Only the
          // RECORD merge stays deduped; the covering entry is always COMPLETE
          // (B04), so the warm decimated flag is never stale.
          let covering: CacheEntry | null = null;
          for (let i = 0; i < liveRectangles.length; i += 1) {
            const entry = coveringEntry(liveRectangles[i], filterKey);
            if (entry && !covering) covering = entry;
            if (mergedKeysRef.current.has(liveMergeKeys[i])) continue;
            mergedKeysRef.current.add(liveMergeKeys[i]);
            if (entry) commitRecords(entry.records);
          }
          setLoading(false);
          setError(false);
          setRetryAfter(null);
          rateLimitRetriesRef.current = 0;
          setDecimated(covering ? covering.decimated === true : false);
          if (covering && covering.records.length > 0) setEmpty(false);
          if (covering) setTotal(covering.total);
          setSettled({ key: liveGeometryKey, status: "ok", filterKey });
          return;
        }
        // 2) Resolve every rectangle (cache / in-flight dedupe / fetch).
        const pages: ViewportPage[] = [];
        for (let i = 0; i < liveRectangles.length; i += 1) {
          pages.push(await resolveRectangle(liveRectangles[i], liveKeys[i]));
        }
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(false);
        setRetryAfter(null);
        rateLimitRetriesRef.current = 0;
        setDecimated(pages.some((page) => page.decimated === true));
        const combinedTotal = pages.reduce((sum, page) => sum + page.total, 0);
        if (combinedTotal === 0 && !pages.some((page) => page.records.length > 0)) setEmpty(true);
        setTotal(combinedTotal);
        for (let i = 0; i < liveRectangles.length; i += 1) {
          if (mergedKeysRef.current.has(liveMergeKeys[i])) continue;
          mergedKeysRef.current.add(liveMergeKeys[i]);
          const merged = commitRecords(pages[i].records);
          // The first non-empty payload fires onRecords ONCE (initial
          // selection); later pans/merges must not steal the selection.
          if (!notifiedRef.current && merged.length > 0) {
            notifiedRef.current = true;
            queueMicrotask(() => onRecordsRef.current?.(merged));
          }
        }
        setSettled({ key: liveGeometryKey, status: "ok", filterKey });
      })().catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(true);
        setSettled({ key: liveGeometryKey, status: "error", filterKey });
        if (failure instanceof ViewportRateLimitError) {
          const retry = rateLimitRetriesRef.current < VIEWPORT_RATE_LIMIT_AUTO_RETRIES;
          if (retry) rateLimitRetriesRef.current += 1;
          setRetryAfter(failure.retryAfterSeconds);
          // B05: only an ALLOWED retry arms a cooldown that reopens this
          // effect. Once the budget is spent the 429 is TERMINAL — leaving
          // the cooldown null means the same viewport cannot schedule a
          // third request; reload() or a deliberately new viewport/filter
          // (which resets the budget above) recovers.
          setRateLimitCooldown(retry ? { until: Date.now() + (failure.retryAfterSeconds * 1_000), retry } : null);
          onRateLimitedRef.current?.(failure.retryAfterSeconds);
          return;
        }
        setRetryAfter(null);
        onErrorRef.current?.();
      });
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // Re-run ONLY on the quantized bounds (a tiny pan that maps to the same
    // cache cell does not refetch) and on the semantic filter combo — never
    // on the `bounds`/`filters` object identities (unstable; see the same
    // pattern in use-public-cameras, PR #165 review blocker t_6e9c812d).
  }, [boundsKey, filterKey, attempt, rateLimitCooldown]);

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
    decimated,
    loading,
    error,
    retryAfterSeconds: retryAfter,
    empty,
    // R3c: a settlement from a DIFFERENT server filter is not valid for the
    // current request — expose null so an older response can never consume a
    // newer same-geometry intent before the current-filter response arrives.
    settled: settled && settled.filterKey === filterKey ? settled : null,
    reload: () => {
      __resetViewportCamerasCache();
      mergedKeysRef.current.clear();
      notifiedRef.current = false;
      rateLimitRetriesRef.current = 0;
      setRetryAfter(null);
      setRateLimitCooldown(null);
      setSettled(null);
      setError(false);
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}
