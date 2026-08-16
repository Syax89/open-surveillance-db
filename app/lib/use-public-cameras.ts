"use client";

import { useEffect, useRef, useState } from "react";
import { publicRecords, type Camera } from "./records";
import { isRecordPageStatus } from "./public-status";

/**
 * Shared public-cameras data layer (audit t_c6da60f0, P2; pagination t_cc94f340).
 *
 * One hook, every public surface: the home directory and the record detail
 * page used to duplicate fetch("/api/cameras") + publicRecords() + ad-hoc
 * loading/error handling, and the record page swallowed failures
 * (.catch(() => undefined)) so a dead API rendered "not found".
 *
 * Pagination contract (PR #149): GET /api/cameras answers
 * `{ records, total, nextOffset }` with `limit` (default/max 500) and
 * `offset` (default 0); records are ordered id DESC and `nextOffset` is
 * null on the last page. The default JSON is NOT the full list anymore —
 * at most 500 records per page.
 *
 * This layer hides the pagination from consumers:
 *  - the home directory walks every page (limit 500, following nextOffset)
 *    so the map keeps rendering ALL public records, with `total` from the
 *    server for the hero stat (never a first-page count);
 *  - the record page resolves a single public id with ONE fetch to the
 *    dedicated `GET /api/cameras/[id]` endpoint (QA#5 F1): a deep link
 *    never pays for pages it does not need, and a 404 is the same
 *    fail-closed answer the walk would give after exhausting the list;
 *  - a walk that exhausts the list seeds the module cache, so a record
 *    page visited after the home directory costs zero extra fetches.
 *
 * Contract:
 *  - module-level cache: the public list is fetched at most once per page
 *    load; navigating home -> record detail reuses the payload;
 *  - concurrent consumers share a single in-flight fetch (dedupes the dev
 *    StrictMode double-effect), and the shared fetch is aborted when the
 *    last consumer unmounts;
 *  - explicit states: loading (first fetch in flight), error (network or
 *    non-2xx on ANY page), empty (API answered but no public records);
 *  - on error the records stay empty and the caller decides how to
 *    surface the failure (no synthetic seed filler, removed 2026-08-08).
 *
 * Server-side filters (F4, FRONTEND_PLAN § 3.3): the optional `filters`
 * option ({ kind, freshness }) forwards the URL filter dimensions to the
 * API as query params — the F0 list endpoint filters kind (exact match)
 * and freshness in SQL. A filtered walk NEVER touches the shared module
 * cache (a filtered subset must not seed the full-list cache the home and
 * record pages rely on) and is fetched per consumer (each filter combo is
 * its own query, so caching them all would be pure memory). With no
 * filters — or all-default filters — the behaviour is byte-identical to
 * before: the shared cached walk.
 */

/**
 * Max page size the API accepts (PUBLIC_CAMERAS_PAGE_MAX_LIMIT). Raised from
 * 500 to 2000 with the dataset (kanban t_e11080eb): the directory walk pages
 * through the WHOLE public set, and at 500/page a 31,926-record dataset needs
 * 64 serial requests — more than the per-caller read rate limit (60/min),
 * so the walk could 429 mid-flight on a busy shared bucket and blank the
 * directory. 2000/page → 16 requests, comfortably inside the budget.
 */
const PAGE_LIMIT = 2000;

/** F0 server-side filters forwarded to GET /api/cameras (see the hook doc). */
export type ServerCameraFilters = {
  kind?: string;
  freshness?: "7d" | "30d" | "90d";
  q?: string;
  state?: "confirmed" | "never";
  origin?: "reports" | "imported";
  sort?: "alphabetical" | "useful" | "recent" | "confirmations";
};

type CamerasPage = {
  records: Camera[];
  total: number | null;
  nextOffset: number | null;
};

/**
 * Bounded 429 retry budget for a page of the walk (kanban t_e11080eb). The
 * read rate limit is 60/min per caller; on the container every anonymous
 * caller shares ONE bucket (callerKey "unknown" — no Cloudflare edge, no
 * TRUST_XFF), so a page can 429 mid-walk under concurrent traffic. Waiting
 * the server's Retry-After and retrying a couple of times lets the walk
 * survive a transient rate-limit instead of dying into the empty directory.
 */
const WALK_RATE_LIMIT_RETRIES = 2;

/** Seconds to wait before retrying a 429 (server Retry-After, bounded). */
function retryDelaySeconds(response: Response): number {
  const raw = response.headers.get("retry-after");
  if (!raw) return 1;
  const seconds = Number(raw);
  // Bounded at 10s: a short Retry-After (transient burst) recovers quickly;
  // a genuinely exhausted shared bucket surfaces the honest error state fast
  // instead of freezing the directory for the whole window.
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) : 1;
}

/** Sleep that aborts with the caller's signal (the walk is abortable). */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Fetch one page of the public list. Tolerant of the pre-pagination shape
 * (`{ records }` with no total/nextOffset): a payload without nextOffset is
 * a complete list, never a truncated page, so single-fetch consumers and
 * older fixtures keep working unchanged.
 */
async function fetchCamerasPage(offset: number, signal: AbortSignal, extraQuery = ""): Promise<CamerasPage> {
  // count=false (D1 rows-read optimization, 2026-08-12): the walk paginates
  // on nextOffset alone; skipping the server COUNT scan on every page keeps
  // the free-plan D1 rows-read quota intact. The API answers total: null.
  const query = `count=false${extraQuery ? `&${extraQuery}` : ""}`;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`/api/cameras?limit=${PAGE_LIMIT}&offset=${offset}${query ? `&${query}` : ""}`, { signal });
    if (response.status === 429 && attempt < WALK_RATE_LIMIT_RETRIES) {
      await sleep(retryDelaySeconds(response) * 1000, signal);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as Partial<CamerasPage>;
    if (!Array.isArray(data.records)) throw new Error("Malformed /api/cameras payload");
    return {
      // Defense-in-depth client gate (publicRecords): the API already filters
      // server-side, but a non-public record that ever reaches the client
      // bundle is dropped before any component can display it.
      records: publicRecords(data.records),
      total: typeof data.total === "number" ? data.total : null,
      // `?? null` normalizes both the new contract (null on last page) and
      // the legacy shape (field absent) to "stop the walk".
      nextOffset: data.nextOffset ?? null,
    };
  }
}

type WalkResult = {
  records: Camera[];
  /** Server total when known; null when the walk ran with count=false. */
  total: number | null;
};

/**
 * Walk the public list following nextOffset (limit 2000/page since
 * t_e11080eb; 500 before the dataset grew past ~30k records) to the end.
 * Stops on nextOffset null/absent and guards against a server that fails to
 * advance the offset (would otherwise loop forever on a bad reply). Used by
 * the home directory walk; the record page resolves single ids through the
 * dedicated endpoint instead (QA#5 F1) — this walk never early-exits.
 */
async function walkPages(signal: AbortSignal): Promise<WalkResult> {
  const collected: Camera[] = [];
  let offset = 0;
  let total: number | null = null;
  for (;;) {
    const page = await fetchCamerasPage(offset, signal);
    collected.push(...page.records);
    total = page.total;
    // Stop when the server reports the list is exhausted (nextOffset null /
    // non-advancing) OR when we have collected the server's own `total`
    // (kanban t_e86c91c4): the walk must never request offsets beyond the
    // dataset — a fixed API cap (MAX_PAGE_OFFSET = 10000) used to answer
    // 400 there, failing the whole walk into an empty /directory. The
    // `collected >= total` guard is the client-side mirror of the db
    // boundary guard: it stops exactly at the last record, no more pages.
    // With count=false the server answers total: null, so the guard only
    // applies when a numeric total is present (nextOffset alone drives).
    if (page.nextOffset === null || page.nextOffset <= offset || (typeof total === "number" && collected.length >= total)) break;
    offset = page.nextOffset;
  }
  return { records: collected, total };
}

/**
 * Walk every page of a SERVER-FILTERED list (F4): same pagination contract
 * as walkPages but with kind/freshness forwarded as query params. The result
 * is intentionally NOT written into the shared module cache — a filtered
 * subset must never masquerade as the full public list for the home and
 * record pages. `total` comes from the server (never a first-page count).
 */
async function walkFilteredPages(filters: ServerCameraFilters, signal: AbortSignal): Promise<{ records: Camera[]; total: number | null }> {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.freshness) query.set("freshness", filters.freshness);
  if (filters.q) query.set("q", filters.q);
  if (filters.state) query.set("state", filters.state);
  if (filters.origin) query.set("origin", filters.origin);
  if (filters.sort) query.set("sort", filters.sort);
  const extraQuery = query.toString();
  const collected: Camera[] = [];
  let offset = 0;
  let total: number | null = null;
  for (;;) {
    const page = await fetchCamerasPage(offset, signal, extraQuery);
    collected.push(...page.records);
    total = page.total;
    // Same exhaustion + total guards as walkPages (kanban t_e86c91c4): a
    // filtered walk must also stop at the server-reported total, never
    // requesting offsets past the dataset (a fixed API cap used to 400
    // there and blank the filtered directory). With count=false the total
    // is null and nextOffset alone drives the walk.
    if (page.nextOffset === null || page.nextOffset <= offset || (typeof total === "number" && collected.length >= total)) break;
    offset = page.nextOffset;
  }
  return { records: collected, total };
}

/**
 * Fetch one page via cursor (alphabetical sort only). The cursor avoids
 * OFFSET scan on large datasets. Returns records + nextCursor for the next page.
 */
async function fetchCursorPage(
  filters: ServerCameraFilters,
  after: { title: string; id: number } | null,
  limit: number,
  signal: AbortSignal,
): Promise<{ records: Camera[]; nextCursor: { title: string; id: number } | null; total: number | null }> {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.freshness) query.set("freshness", filters.freshness);
  if (filters.q) query.set("q", filters.q);
  if (filters.state) query.set("state", filters.state);
  if (filters.origin) query.set("origin", filters.origin);
  if (filters.sort) query.set("sort", filters.sort);
  if (after) {
    query.set("after_title", after.title);
    query.set("after_id", String(after.id));
  }
  query.set("limit", String(limit));
  query.set("count", "true");
  const response = await fetch(`/api/cameras?${query.toString()}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as Partial<CamerasPage>;
  if (!Array.isArray(data.records)) throw new Error("Malformed /api/cameras payload");
  const records = publicRecords(data.records);
  const nextCursor = records.length > 0 ? { title: records[records.length - 1].title, id: records[records.length - 1].id } : null;
  return { records, nextCursor, total: typeof data.total === "number" ? data.total : null };
}

function hasServerFilters(filters: ServerCameraFilters | undefined): filters is ServerCameraFilters {
  return Boolean(filters && (filters.kind || filters.freshness || filters.q || filters.state || filters.origin || filters.sort));
}

function usesCursorPagination(filters: ServerCameraFilters | undefined): boolean {
  return Boolean(filters?.sort === "alphabetical" && hasServerFilters(filters));
}

let cachedRecords: Camera[] | null = null;
let cachedTotal: number | null = null;

type WalkState<T> = {
  promise: Promise<T>;
  controller: AbortController;
  listeners: number;
};

// Full-list walk (home directory) and per-id walks (record page) share the
// module cache but are separate in-flight operations: a record deep link
// early-exits and must never be confused with a complete list walk.
let listWalk: WalkState<Camera[]> | null = null;
const recordWalks = new Map<number, WalkState<Camera | null>>();

function abortList() {
  if (!listWalk) return;
  listWalk.controller.abort();
  listWalk = null;
}

function abortRecord(id: number) {
  const walk = recordWalks.get(id);
  if (!walk) return;
  walk.controller.abort();
  recordWalks.delete(id);
}

/**
 * Register one full-list consumer. Returns the shared walk (a resolved cache
 * promise when the walk already happened, the in-flight promise otherwise).
 */
function ensureAll(): Promise<Camera[]> {
  if (cachedRecords !== null) return Promise.resolve(cachedRecords);
  if (!listWalk) {
    const controller = new AbortController();
    const promise = walkPages(controller.signal)
      .then(({ records, total }) => {
        cachedRecords = records;
        cachedTotal = total;
        return records;
      })
      .finally(() => { listWalk = null; });
    // The shared promise may reject with no consumer left attached (abort
    // path); mark it handled so the rejection never becomes unhandled.
    promise.catch(() => {});
    listWalk = { promise, controller, listeners: 0 };
  }
  listWalk.listeners += 1;
  return listWalk.promise;
}

function releaseAll() {
  if (!listWalk) return;
  listWalk.listeners -= 1;
  if (listWalk.listeners <= 0) abortList();
}

/**
 * Resolve ONE public record by id (QA#5 F1, t_ab0d4c75): module cache first,
 * then a full list walk already in flight, then the DEDICATED endpoint
 * `GET /api/cameras/[id]` — one round trip instead of a client-side
 * paginated walk (ceil((maxId − id)/500) + 1 serialised fetches on deep
 * links to old records, which also burned the shared READ_LIMITER bucket and
 * could self-429 the caller). The endpoint shares the exact public
 * predicate and ~10 m coordinate rounding of the list, and fails closed
 * with 404 for anything that is not publicly current — so a 404 here is
 * the same answer the walk would give after exhausting every page, at 1/N
 * of the cost. The record page only falls back to the walk when the
 * dedicated endpoint answers 404 for an id that might still be public on a
 * stale list (belt-and-braces; the endpoint and the list use the same
 * predicate, so in practice this never triggers).
 */
function ensureRecord(id: number): Promise<Camera | null> {
  if (cachedRecords !== null) {
    const found = cachedRecords.find((record) => record.id === id);
    if (found) return Promise.resolve(found);
    // Fall through to the dedicated endpoint (ADR 0021 §6.3, FASE 3 UI):
    // the list cache only carries public records, while a withdrawn record
    // (hidden/removed) stays reachable by DIRECT LINK through
    // GET /api/cameras/[id] — the banner contract must survive a warm
    // directory cache.
  }
  if (listWalk) {
    return listWalk.promise.then((records) => records?.find((record) => record.id === id) ?? null);
  }
  const existing = recordWalks.get(id);
  if (existing) {
    existing.listeners += 1;
    return existing.promise;
  }
  const controller = new AbortController();
  const promise = fetch(`/api/cameras/${id}`, { signal: controller.signal })
    .then(async (response) => {
      if (response.ok) {
        const data = (await response.json()) as { record?: Camera };
        // Record-page whitelist (ADR 0021 §6.3): active/demo plus the
        // hidden/removed direct-link banner contract. LIST surfaces keep
        // the strict isPublicStatus gate (publicRecords) — only this
        // single-record resolver widens, and only for the record page.
        if (!data.record || !isRecordPageStatus(data.record.status)) return null;
        return data.record;
      }
      if (response.status === 404) {
        // Fail-closed answer from the shared predicate: the record is not
        // publicly current. No walk fallback (QA#5 F1) — the walk would
        // repeat the same public check N times for zero extra information.
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    })
    .finally(() => { recordWalks.delete(id); });
  promise.catch(() => {});
  const walk: WalkState<Camera | null> = { promise, controller, listeners: 1 };
  recordWalks.set(id, walk);
  return walk.promise;
}

function releaseRecord(id: number) {
  const walk = recordWalks.get(id);
  if (!walk) return;
  walk.listeners -= 1;
  if (walk.listeners <= 0) abortRecord(id);
}

/** Drop every cache and in-flight walk (error-state recovery, test reset). */
function resetCamerasCache() {
  abortList();
  for (const id of Array.from(recordWalks.keys())) abortRecord(id);
  cachedRecords = null;
  cachedTotal = null;
}

export type UsePublicCamerasOptions = {
  /** Fired once when the API returns a non-empty public payload. */
  onRecords?: (records: Camera[]) => void;
  /** Fired once when the API fetch fails (callers surface the notice). */
  onError?: () => void;
  /**
   * F0 server-side filters (F4): when kind/freshness are set, the walk
   * fetches ?kind=&freshness= from the API instead of the shared full-list
   * cache, and the filtered result never seeds that cache. Undefined or
   * all-defaults keeps the shared cached walk (home/record-page behaviour).
   */
  filters?: ServerCameraFilters;
};

export type UsePublicCamerasResult = {
  /** Current display records ([] until the API answers). */
  records: Camera[];
  /** Server total of public records (null until the first page answers). */
  total: number | null;
  /** True while the first API fetch is in flight. */
  loading: boolean;
  /** The API fetch failed (network error or non-2xx response). */
  error: boolean;
  /** The API answered but returned no public records. */
  empty: boolean;
  /** Drop the cache and fetch again (error-state recovery). */
  reload: () => void;
};

export function usePublicCameras({ onRecords, onError, filters }: UsePublicCamerasOptions = {}): UsePublicCamerasResult {
  // Server-filtered walks re-run when the filter combo changes (each combo
  // is its own query). The shared full-list walk never re-runs for filters.
  const serverActive = hasServerFilters(filters);
  const filterKey = serverActive ? `${filters.kind ?? ""}|${filters.freshness ?? ""}` : "";

  // No demo seed (removed 2026-08-08, design review F1): records are always
  // the real API payload, never synthetic filler. On API failure callers
  // surface their own honest error state.
  const [records, setRecords] = useState<Camera[]>(() => []);
  const [total, setTotal] = useState<number | null>(() => (serverActive ? null : cachedTotal));
  const [loading, setLoading] = useState(() => (serverActive ? true : cachedRecords === null));
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(() => (serverActive ? false : cachedRecords !== null && cachedRecords.length === 0));
  const [attempt, setAttempt] = useState(0);
  const onRecordsRef = useRef(onRecords);
  const onErrorRef = useRef(onError);
  useEffect(() => { onRecordsRef.current = onRecords; });
  useEffect(() => { onErrorRef.current = onError; });

  // Latest-value ref for the filters object. The walk effect below keys on
  // the SEMANTIC filter values (filterKey/serverActive) and must never
  // re-run for the `filters` OBJECT identity: the tool call sites build
  // `serverFiltersFrom(filters)` inline, so a NEW object arrives on every
  // parent render (PR #165 review blocker t_6e9c812d: with server filters
  // active the walk looped forever — fetch → setRecords → re-render → new
  // filters object → effect re-runs → abort + new walk → fetch → LOOP ∞).
  // Reading the current filters through a ref keeps the effect closure
  // fresh without putting the unstable object in the dependency array.
  const filtersRef = useRef<ServerCameraFilters>(filters ?? {});
  useEffect(() => {
    filtersRef.current = filters ?? {};
  });

  // All state transitions happen in async continuations of the shared fetch,
  // so a consumer that mounts after the cache was populated settles in the
  // same microtask without a visible loading flash.
  useEffect(() => {
    let cancelled = false;
    // Filtered walks own their AbortController (aborted on unmount/filter
    // change); the shared walk keeps its module-level dedupe/abort contract.
    const controller = new AbortController();
    const run = serverActive
      ? walkFilteredPages(filtersRef.current, controller.signal).then((page) => ({ records: page.records, total: page.total }))
      : ensureAll().then((fetched) => ({ records: fetched, total: cachedTotal ?? fetched.length }));
    run
      .then((fetched) => {
        if (cancelled) return;
        setLoading(false);
        setError(false);
        setTotal(fetched.total);
        if (fetched.records.length) {
          setEmpty(false);
          setRecords(fetched.records);
          onRecordsRef.current?.(fetched.records);
        } else {
          // API answered with an empty public list: expose the empty state
          // so callers can render an honest "no records".
          setEmpty(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
        // Records stay empty: callers surface their own error state.
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      if (serverActive) controller.abort();
      else releaseAll();
    };
    // The effect re-runs ONLY on the semantic filter values (filterKey
    // encodes kind+freshness; serverActive is derived from them) and on
    // reload — never on the `filters` object identity, which is unstable
    // (call sites build serverFiltersFrom(filters) inline). The current
    // filters are read through filtersRef so the closure is always fresh.
    // (PR #165 review blocker t_6e9c812d: filters in the deps looped the
    // filtered walk forever — every setRecords re-rendered the tool, which
    // rebuilt the filters object and restarted the effect.)
  }, [attempt, filterKey, serverActive]);

  return {
    records,
    total,
    loading,
    error,
    empty,
    reload: () => {
      resetCamerasCache();
      setError(false);
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}

export type UsePublicCameraResult = {
  /** The resolved public record, or null while loading / when not found. */
  record: Camera | null;
  /** True while the targeted walk is in flight. */
  loading: boolean;
  /** The API fetch failed (network error or non-2xx response). */
  error: boolean;
  /** Walk completed and the id is not among the public records. */
  notFound: boolean;
  /** Drop the cache and fetch again (error-state recovery). */
  reload: () => void;
};

/**
 * Resolve a single public record by id (record detail page). Shares the
 * module cache with usePublicCameras: after the home directory loaded, this
 * settles without any fetch; on a deep link it walks pages until the id
 * shows up (early exit, id DESC order) or the list is exhausted.
 */
export function usePublicCamera(id: number): UsePublicCameraResult {
  const [record, setRecord] = useState<Camera | null>(() => cachedRecords === null
    ? null
    : cachedRecords.find((item) => item.id === id) ?? null);
  // Loading stays true when the warm cache does NOT contain the id: the
  // dedicated endpoint may still resolve a withdrawn record (direct-link
  // banner, ADR §6.3) — a flash of "not found" before the answer would be
  // a lie. Found-in-cache ids are instant, as before.
  const [loading, setLoading] = useState(() => cachedRecords === null
    ? true
    : !cachedRecords.some((item) => item.id === id));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    ensureRecord(id)
      .then((found) => {
        if (cancelled) return;
        setLoading(false);
        setError(false);
        setRecord(found);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
      });
    return () => {
      cancelled = true;
      releaseRecord(id);
    };
  }, [attempt, id]);

  return {
    record,
    loading,
    error,
    notFound: !loading && !error && record === null,
    reload: () => {
      resetCamerasCache();
      setError(false);
      setLoading(true);
      setAttempt((value) => value + 1);
    },
  };
}

/** Test-only: drop the module cache between DOM-harness tests. */
export function __resetPublicCamerasCache() {
  resetCamerasCache();
}
