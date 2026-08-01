"use client";

/**
 * useCameraFilters — URL as the single source of truth for the tool filters
 * (F4, kanban t_522638a5; docs/FRONTEND_PLAN.md §1.2/2.5/3.3, CTO t_f24c3227).
 *
 * The five filter dimensions (q, type, freshness, sort, focus) live in the
 * URL query string and are read via useSearchParams, never mirrored in local
 * state. Every UI change writes the URL with `router.replace(href, { scroll:
 * false })`, so filter edits never pollute browser history (R2 URL churn):
 * back/forward traverse page navigations (push), not filter edits (replace).
 * A new URL — deep link, share, back/forward — re-derives the filters on the
 * next render; there is no other state to synchronise.
 *
 * Debounce: typing in ?q= updates the input instantly but commits the URL
 * (and therefore the filtering) ~250ms after the last keystroke, so history
 * and the aria-live counter are not spammed (R2). Clearing the search
 * commits immediately (no dead air).
 *
 * freshnessCutoff is DERIVED from the freshness window at filter time — the
 * plan's "derived from the window, not separate state" — so a stale
 * timestamp can never survive a window change.
 *
 * Filtering split: the hook owns URL state; the pure applyCameraFilters /
 * cameraKindsOf helpers own the filtering/sorting memo that used to live in
 * page.tsx (CTO: "sposta qui il memo oggi in page.tsx"). Both tools call the
 * same helpers over the same URL state → one pattern (D4). kind/freshness are
 * ALSO forwarded to the API as query params (serverFiltersFrom → F0
 * server-side filters): with a reachable API the heavy lifting happens in
 * SQL, and the memo re-applies the same predicates as a last-mile gate that
 * also keeps the demo seed fallback coherent. The freshness anchors agree:
 * the memo uses lastVerifiedAt ?? updated, the same field the server
 * freshness windows are anchored on (F0 domain decision). q and sort stay
 * client-side on purpose: the list API has no text filter yet and plan §3.3
 * leaves current-page ordering client-side.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Camera } from "./records";
import { textMatches } from "./search";
import type { ServerCameraFilters } from "./use-public-cameras";

/** Whitelisted freshness windows (mirrors db/cameras.ts freshnessWindows). */
export const FRESHNESS_WINDOWS = ["all", "7d", "30d", "90d"] as const;
export type FreshnessWindow = (typeof FRESHNESS_WINDOWS)[number];

export const SORT_ORDERS = ["alphabetical", "position"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Debounce for ?q= commits (R2 URL churn: history + AT announcements). */
export const QUERY_DEBOUNCE_MS = 250;
/** Max length of ?q= (same limit as the place-search input). */
export const MAX_QUERY_LENGTH = 200;

export type CameraFilters = {
  /** Free-text search (?q=), committed (post-debounce) value. */
  q: string;
  /** Camera kind (?type=); "all" when unset. */
  type: string;
  /** Freshness window (?freshness=); "all" when unset. */
  freshness: FreshnessWindow;
  /** Sort order (?sort=); "alphabetical" is the default. */
  sort: SortOrder;
  /** Record preselected on /mappa (?focus=ID); null when unset/invalid. */
  focus: number | null;
};

const FRESHNESS_SET = new Set<string>(FRESHNESS_WINDOWS);
const SORT_SET = new Set<string>(SORT_ORDERS);

/**
 * Milliseconds cutoff for a freshness window, or null for "any time".
 * `now` is injectable so tests can anchor the window deterministically.
 */
export function freshnessCutoffFor(window: FreshnessWindow, now = Date.now()): number | null {
  if (window === "all") return null;
  const days = Number.parseInt(window, 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return now - days * 24 * 60 * 60 * 1000;
}

/**
 * Lenient URL parse (URL contract, QA t_8bc7f4e2 punto 1): invalid values
 * fall back to the safe default and NEVER throw — a malformed ?freshness=99d
 * or ?focus=abc renders the page with defaults, never a 500. Unknown params
 * are ignored (the hook owns exactly these five).
 */
export function parseCameraFilters(searchParams: URLSearchParams): CameraFilters {
  const q = (searchParams.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  const type = (searchParams.get("type") ?? "").slice(0, 60) || "all";
  const freshnessRaw = searchParams.get("freshness") ?? "all";
  const freshness = (FRESHNESS_SET.has(freshnessRaw) ? freshnessRaw : "all") as FreshnessWindow;
  const sortRaw = searchParams.get("sort") ?? "alphabetical";
  const sort = (SORT_SET.has(sortRaw) ? sortRaw : "alphabetical") as SortOrder;
  const focusRaw = searchParams.get("focus");
  const focusId = focusRaw === null ? null : Number(focusRaw);
  const focus = focusId !== null && Number.isInteger(focusId) && focusId > 0 ? focusId : null;
  return { q, type, freshness, sort, focus };
}

/**
 * URL serialization: omits default values so a fresh page has no query
 * string and filter edits keep the URL minimal (R2). Values are encoded via
 * URLSearchParams (spaces, non-ASCII and reserved chars survive round-trips).
 */
export function stringifyCameraFilters(filters: CameraFilters): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.freshness !== "all") params.set("freshness", filters.freshness);
  if (filters.sort !== "alphabetical") params.set("sort", filters.sort);
  if (filters.focus !== null) params.set("focus", String(filters.focus));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The API params for the F0 server-side filters. The list endpoint accepts
 * kind (exact match) and freshness (whitelist, "all" means unset); q and
 * sort have no server counterpart yet and stay client-side (plan §3.3).
 */
export function serverFiltersFrom(filters: CameraFilters): ServerCameraFilters {
  const server: ServerCameraFilters = {};
  if (filters.type && filters.type !== "all") server.kind = filters.type;
  if (filters.freshness !== "all") server.freshness = filters.freshness;
  return server;
}

/**
 * The filtering + sorting memo (moved here from the tool pages): q (client,
 * no API text filter yet), type + freshness (last-mile gate over the
 * server-filtered or seeded records — anchors on lastVerifiedAt ?? updated,
 * the server's freshness anchor), sort (client, plan §3.3). Pure and
 * side-effect free so the URL contract is unit-testable; `now` is injectable
 * so freshness-window tests are deterministic.
 */
export function applyCameraFilters(records: Camera[], filters: CameraFilters, now = Date.now()): Camera[] {
  const query = filters.q.trim().toLocaleLowerCase();
  const cutoff = freshnessCutoffFor(filters.freshness, now);
  const matching = records.filter((camera) => {
    if (query && !textMatches(camera, query)) return false;
    if (filters.type !== "all" && camera.kind !== filters.type) return false;
    if (cutoff !== null) {
      const anchor = new Date(camera.lastVerifiedAt ?? camera.updated).getTime();
      if (!Number.isFinite(anchor) || anchor < cutoff) return false;
    }
    return true;
  });
  return matching.sort((first, second) => filters.sort === "alphabetical"
    ? first.title.localeCompare(second.title)
    : first.latitude - second.latitude || first.longitude - second.longitude || first.title.localeCompare(second.title));
}

/** Distinct camera kinds present in a record set (kind filter options). */
export function cameraKindsOf(records: Camera[]): string[] {
  return Array.from(new Set(records.map((camera) => camera.kind).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/** /mappa deep link carrying the current filters plus a record to focus. */
export function mapHrefWithFocus(filters: CameraFilters, focusId: number): string {
  return `/mappa${stringifyCameraFilters({ ...filters, focus: focusId })}`;
}

export type UseCameraFiltersResult = {
  /** The five dimensions parsed from the current URL. */
  filters: CameraFilters;
  /** Instant search input value (the URL q lags it by the debounce). */
  qInput: string;
  /** Commit q after the debounce (clearing commits immediately). */
  setQ: (value: string) => void;
  /** Commit the kind filter immediately (replace, scroll:false). */
  setType: (value: string) => void;
  /** Commit the freshness window immediately (invalid values fall back to "all"). */
  setFreshness: (value: string) => void;
  /** Commit the sort order immediately (replace, scroll:false). */
  setSort: (value: SortOrder) => void;
  /** Clear every filter dimension (replace to the bare pathname). */
  reset: () => void;
};

/**
 * URL state for the shared filter pattern (/mappa and /directory — D4).
 * Reads the five dimensions from useSearchParams; every write goes through
 * router.replace(href, { scroll: false }). Because the URL is the only
 * source of truth, deep links and back/forward just work: the next render
 * re-parses the params. A local revision bump re-renders after each write
 * even in environments where router.replace is stubbed without a real
 * navigation (dom-harness); values still come from useSearchParams, so it
 * is a render trigger, not a state mirror.
 */
export function useCameraFilters(): UseCameraFiltersResult {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => parseCameraFilters(searchParams), [searchParams]);
  const [qInput, setQInput] = useState(filters.q);
  const [revision, setRevision] = useState(0);

  // Latest-value refs so the debounce timer and the write callback never act
  // on a stale URL/filter snapshot (the user may change a select while the
  // q timer is pending — the commit must not clobber it). Kept in effects:
  // ref writes during render are forbidden, and the debounce/write callbacks
  // only ever run AFTER a render (user events / timers), so the effect has
  // always refreshed the refs by the time they are read.
  const filtersRef = useRef<CameraFilters>({ q: "", type: "all", freshness: "all", sort: "alphabetical", focus: null });
  useEffect(() => {
    filtersRef.current = filters;
  });
  const searchParamsRef = useRef<string>("");
  useEffect(() => {
    searchParamsRef.current = searchParams.toString();
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External URL change (deep link, back/forward, reset): keep the input in
  // sync with the committed q — but never clobber text the user is actively
  // typing (the debounce timer has not fired yet, so current !== filters.q).
  // The setState is guarded (identity write → no re-render), so this is the
  // documented "adjusting state when a prop changes" pattern — not a loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded sync of the URL-controlled input (see comment above): identity-guarded setState keeps the input in sync with the committed URL q (deep link / back-forward); the guard means this is the documented "adjusting state when a prop changes" pattern, not a loop.
    setQInput((current) => (current === filters.q ? current : filters.q));
  }, [filters.q]);

  // Clear a pending debounce on unmount.
  useEffect(() => () => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
  }, []);

  // Write the URL. Never called during render: only from the setters and the
  // debounce timer, so the SSR smoke (whose useRouter stub has no replace)
  // never touches it. Owned params are rewritten; params the hook does not
  // own (e.g. future ?lat=&lng=&z= viewport state) survive the edit.
  const applyFilters = useCallback((next: CameraFilters) => {
    const params = new URLSearchParams(searchParamsRef.current);
    for (const key of ["q", "type", "freshness", "sort", "focus"]) params.delete(key);
    const q = next.q.trim();
    if (q) params.set("q", q);
    if (next.type && next.type !== "all") params.set("type", next.type);
    if (next.freshness !== "all") params.set("freshness", next.freshness);
    if (next.sort !== "alphabetical") params.set("sort", next.sort);
    if (next.focus !== null) params.set("focus", String(next.focus));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setRevision((value) => value + 1);
  }, [pathname, router]);

  function setQ(value: string) {
    setQInput(value);
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = value.trim();
    // No-op when the committed value is unchanged (backspace to the same
    // text must not churn the URL).
    if (trimmed === filtersRef.current.q.trim()) return;
    // Clearing the search commits immediately (no dead air on reset-like UX).
    if (trimmed === "") {
      applyFilters({ ...filtersRef.current, q: "" });
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      applyFilters({ ...filtersRef.current, q: trimmed });
    }, QUERY_DEBOUNCE_MS);
  }

  function setType(value: string) {
    applyFilters({ ...filtersRef.current, type: value });
  }

  function setFreshness(value: string) {
    // Select values are whitelisted by the markup; a stray value (or a
    // tampered option) falls back to "all" instead of writing a bad URL.
    applyFilters({ ...filtersRef.current, freshness: (FRESHNESS_SET.has(value) ? value : "all") as FreshnessWindow });
  }

  function setSort(value: SortOrder) {
    applyFilters({ ...filtersRef.current, sort: value });
  }

  function reset() {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQInput("");
    applyFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", focus: null });
  }

  // The revision value itself is intentionally unused: it exists so the
  // renderer re-runs after every URL write (see the hook docs).
  void revision;

  return { filters, qInput, setQ, setType, setFreshness, setSort, reset };
}
