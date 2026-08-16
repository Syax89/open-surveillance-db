"use client";

import { useEffect, useRef, useState } from "react";
import { publicRecords, type Camera } from "./records";

/**
 * Cursor-based pagination hook for the directory (sort=alphabetical only).
 * 
 * With 160k+ records, the full-walk pattern (usePublicCameras) becomes
 * unsustainable (80+ requests, 4+ MB, 16+ seconds). This hook loads ONE page
 * at a time via the cursor API (?after_title=...&after_id=...), avoiding
 * the OFFSET scan on large datasets.
 * 
 * Contract:
 * - `page` prop controls which page to load (1-indexed)
 * - `limit` records per page (default 20, the DIRECTORY_PAGE_SIZE)
 * - Returns records for THAT page only, plus total and hasMore
 * - Each page change triggers a new fetch; no walk, no cache
 * 
 * Use ONLY when sort=alphabetical is active. For other sorts and the map,
 * keep using usePublicCameras (the full-walk pattern).
 */

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

export function usePublicCamerasPage({ page, limit = 20, filters = {} }: UsePublicCamerasPageOptions): UsePublicCamerasPageResult {
  const [records, setRecords] = useState<Camera[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // Walk from page 1 to the target page via cursor.
    const walkToPage = async () => {
      let cursor: { title: string; id: number } | null = null;
      let currentTotal: number | null = null;
      
      // Fetch pages 1..N to reach the target page.
      for (let i = 1; i <= page; i += 1) {
        const result = await fetchCursorPage(filtersRef.current, cursor, limit, controller.signal);
        if (currentTotal === null) currentTotal = result.total;
        if (i === page) {
          // Target page reached.
          return { records: result.records, total: currentTotal, nextCursor: result.nextCursor };
        }
        cursor = result.nextCursor;
        if (!cursor) {
          // Ran out of pages before reaching target.
          return { records: [], total: currentTotal, nextCursor: null };
        }
      }
      return { records: [], total: currentTotal, nextCursor: null };
    };

    setLoading(true);
    setError(false);
    walkToPage()
      .then(({ records: fetched, total: fetchedTotal, nextCursor }) => {
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
  }, [page, limit, filters.kind, filters.freshness, filters.q, filters.state, filters.origin, filters.sort, attempt]);

  const reload = () => setAttempt((prev) => prev + 1);
  const hasMore = total !== null && records.length > 0 && (page * limit < total);

  return { records, total, hasMore, loading, error, reload };
}
