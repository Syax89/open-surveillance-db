"use client";

import { useEffect, useRef, useState } from "react";
import { publicRecords, type Camera } from "./records";

/**
 * Page-at-a-time pagination hook for the directory (sort=alphabetical only).
 *
 * With 160k+ records, the full-walk pattern (usePublicCameras) becomes
 * unsustainable (80+ requests, 4+ MB, 16+ seconds). This hook loads ONE page
 * at a time.
 *
 * Contract:
 * - `page` prop controls which page to load (1-indexed)
 * - `limit` records per page (default 20, the DIRECTORY_PAGE_SIZE)
 * - Returns records for THAT page only, plus total and hasMore
 * - Each page change triggers exactly ONE request (perf pass 2026-11): the
 *   page is addressed directly with `offset=(page-1)*limit` on the same
 *   `ORDER BY title COLLATE NOCASE ASC, id DESC` the keyset cursor
 *   (?after_title/&after_id) walks, so the rows are identical — but
 *   /directory?page=50 no longer issues 50 serial requests. The server walks
 *   the (status, title COLLATE NOCASE, id DESC) index (migration 0046), so
 *   the OFFSET skip is an in-order index walk, not a sort.
 * - The full-set COUNT is requested once per filter set (`count=true` on the
 *   first request, `count=false` afterwards, reusing the known total).
 *
 * Use ONLY when sort=alphabetical is active. For other sorts and the map,
 * keep using usePublicCameras (the full-walk pattern).
 */

export type ServerCameraFilters = {
  kind?: string;
  freshness?: "7d" | "30d" | "90d";
  q?: string;
  initial?: string;
  state?: "confirmed" | "never";
  origin?: "reports" | "imported";
  sort?: "alphabetical" | "useful" | "recent" | "confirmations";
};

type CamerasPage = {
  records: Camera[];
  total: number | null;
  nextOffset: number | null;
};

export type UsePublicCamerasPageOptions = {
  /** Current page number (1-indexed). */
  page: number;
  /** Records per page. */
  limit?: number;
  /** Server-side filters. */
  filters?: ServerCameraFilters;
};

export type UsePublicCamerasPageResult = {
  /** Records for the current page. */
  records: Camera[];
  /** Server total count (null until first fetch completes). */
  total: number | null;
  /** True if there are more pages after this one. */
  hasMore: boolean;
  /** True while the fetch is in flight. */
  loading: boolean;
  /** The fetch failed. */
  error: boolean;
  /** Retry after error. */
  reload: () => void;
};

async function fetchPage(
  filters: ServerCameraFilters,
  offset: number,
  limit: number,
  withCount: boolean,
  signal: AbortSignal,
): Promise<{ records: Camera[]; total: number | null }> {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.freshness) query.set("freshness", filters.freshness);
  if (filters.q) query.set("q", filters.q);
  if (filters.initial) query.set("initial", filters.initial);
  if (filters.state) query.set("state", filters.state);
  if (filters.origin) query.set("origin", filters.origin);
  if (filters.sort) query.set("sort", filters.sort);
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  query.set("count", withCount ? "true" : "false");
  const response = await fetch(`/api/cameras?${query.toString()}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as Partial<CamerasPage>;
  if (!Array.isArray(data.records)) throw new Error("Malformed /api/cameras payload");
  return { records: publicRecords(data.records), total: typeof data.total === "number" ? data.total : null };
}

/** Identity of a result set: the total is reusable while this stays equal. */
function totalKey(filters: ServerCameraFilters, limit: number): string {
  return JSON.stringify([limit, filters.kind, filters.freshness, filters.q, filters.initial, filters.state, filters.origin, filters.sort]);
}

export function usePublicCamerasPage({ page, limit = 20, filters = {} }: UsePublicCamerasPageOptions): UsePublicCamerasPageResult {
  const [records, setRecords] = useState<Camera[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const filtersRef = useRef(filters);
  // The server total of the last counted filter set (see loadPage).
  const knownTotalRef = useRef<{ key: string; total: number } | null>(null);

  useEffect(() => {
    filtersRef.current = filters;
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // ONE request for the target page: jump straight to its offset, and ask
    // for the COUNT only when the total for this filter set is not known yet.
    const loadPage = async () => {
      const key = totalKey(filtersRef.current, limit);
      const known = knownTotalRef.current?.key === key ? knownTotalRef.current.total : null;
      const result = await fetchPage(filtersRef.current, (page - 1) * limit, limit, known === null, controller.signal);
      if (known !== null) return { records: result.records, total: known };
      if (result.total !== null) knownTotalRef.current = { key, total: result.total };
      return result;
    };

    // This effect owns the request lifecycle; reset its visible state before
    // launching the replacement request so stale records are never presented
    // as the result for a new page/filter key.
    //
    // Clear the stale page (not just flag it) so the pending note can show;
    // `total` stays, a known total is still a true answer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    setRecords((previous) => (previous.length === 0 ? previous : []));
    loadPage()
      .then(({ records: fetched, total: fetchedTotal }) => {
        if (cancelled) return;
        setLoading(false);
        setRecords(fetched);
        setTotal(fetchedTotal);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [page, limit, filters.kind, filters.freshness, filters.q, filters.initial, filters.state, filters.origin, filters.sort, attempt]);

  const reload = () => {
    // A retry re-counts: the failure may have hidden a changed dataset.
    knownTotalRef.current = null;
    setAttempt((prev) => prev + 1);
  };
  const hasMore = total !== null && records.length > 0 && (page * limit < total);

  return { records, total, hasMore, loading, error, reload };
}
