"use client";

import { useEffect, useState } from "react";

/**
 * Public record count for the home hub stat (F2, t_52dcb95e).
 *
 * The hub is an SSR-pure orienteering page (criterion Grace: it must work
 * without JS and without a client data dependency). The hero stat is a
 * progressive enhancement: the server renders a neutral placeholder and this
 * hook fetches the server `total` in a SINGLE lightweight request
 * (limit=1 → the API answers { records, total, nextOffset } with the server
 * total, never a first-page count) — no paginated walk, no full list.
 *
 * The shared data layer (use-public-cameras.ts) is deliberately NOT touched
 * (CTO gate, t_f24c3227): this hook is a standalone one-fetch counter, not a
 * consumer of the module cache. The server total is the same number the
 * directory/map walk eventually reports, so the stat stays truthful.
 *
 * States:
 *  - SSR / before the fetch settles: total = null (the UI renders the
 *    neutral placeholder; nothing is invented server-side);
 *  - fetch failure: total stays null (placeholder remains, no fake number);
 *  - success: total = server total.
 */
export function usePublicCount(): { total: number | null; loading: boolean } {
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cameras?limit=1")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ total?: unknown }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (typeof data.total === "number") setTotal(data.total);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { total, loading };
}
