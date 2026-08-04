"use client";

/**
 * useCameraFilters — URL as the single source of truth for the tool filters
 * (F4, kanban t_522638a5; docs/FRONTEND_PLAN.md §1.2/2.5/3.3, CTO t_f24c3227).
 *
 * The six filter dimensions (q, type, freshness, sort, focus, page) live in
 * the URL query string and are read via useSearchParams, never mirrored in local
 * state. Every UI change writes the URL with `router.replace(href, { scroll:
 * false })`, so filter edits never pollute browser history (R2 URL churn):
 * back/forward traverse page navigations (push), not filter edits (replace).
 * A new URL — deep link, share, back/forward — re-derives the filters on the
 * next render; there is no other state to synchronise.
 *
 * Debounce: typing in ?q= updates the input instantly but commits the URL
 * (and therefore the filtering) ~400ms after the last keystroke, so history
 * and the aria-live counter are not spammed (R2). The ?q= debounce is
 * deliberately LONGER than the geocode autocomplete debounce (250ms in
 * GeocodeSearch, t_3c4b188e): the place-suggestion dropdown appears BEFORE
 * the points list re-filters, so typing never hides the dropdown behind a
 * list update. Clearing the search commits immediately (no dead air).
 *
 * t_3c4b188e: the keyboard ?q= commit NEVER calls router.replace — it
 * writes the URL with a PURE window.history.replaceState. The deployed
 * vinext RSC navigation error ("Cannot read properties of undefined
 * (reading 'digest')") is thrown ASYNCHRONOUSLY by the navigation
 * controller, so #212's try/catch could not catch it; vinext then forces a
 * full reload that remounts the tool and closes the geocode dropdown. Not
 * calling router.replace for ?q= removes the failure mode entirely (see
 * applyFilters). A committed-filters mirror (see useCameraFilters) keeps
 * the app filtering correctly because useSearchParams never observes a
 * bare replaceState.
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
 * the memo uses lastVerifiedAt ?? (parseable updated), the same field the
 * server freshness windows are anchored on (F0 domain decision). q and sort
 * stay client-side on purpose: the list API has no text filter yet and plan
 * §3.3 leaves current-page ordering client-side.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Camera } from "./records";
import { textMatches } from "./search";
import type { ServerCameraFilters } from "./use-public-cameras";

/** Whitelisted freshness windows (mirrors db/cameras.ts freshnessWindows). */
export const FRESHNESS_WINDOWS = ["all", "7d", "30d", "90d"] as const;
export type FreshnessWindow = (typeof FRESHNESS_WINDOWS)[number];

export const SORT_ORDERS = ["alphabetical", "position", "useful", "recent", "confirmations"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * Confirmation-state filter (?state=, FASE 3 UI): "all" (default),
 * "confirmed" (at least one community confirm) or "never" (lastVerifiedAt
 * null). Client-side predicate over the walked public list — the server has
 * no state dimension and hidden/removed are excluded from the list by
 * design (ADR §6.3), so the only meaningful "state" in the directory is
 * confirmation.
 */
export const STATE_VALUES = ["all", "confirmed", "never"] as const;
export type StateFilter = (typeof STATE_VALUES)[number];

/**
 * Debounce for ?q= commits (R2 URL churn: history + AT announcements).
 * t_3c4b188e: must stay LONGER than the geocode autocomplete debounce
 * (GEOCODE_DEBOUNCE_MS, 250ms) so the suggestion dropdown renders BEFORE
 * the points list re-filters; 400ms keeps typing snappy without spamming
 * the URL.
 */
export const QUERY_DEBOUNCE_MS = 400;
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
  /**
   * Confirmation state (?state=, FASE 3 UI); "all" when unset. Client-side
   * predicate on lastVerifiedAt — see STATE_VALUES.
   */
  state: StateFilter;
  /** Record preselected on /mappa (?focus=ID); null when unset/invalid. */
  focus: number | null;
  /**
   * Result page (?page=, t_f13fcb1c). 1 = first page. Owned by the URL like
   * every other dimension; only /directory renders pagination, /mappa
   * parses it (lenient) but never sets it — so the map round-trip preserves
   * the directory page and /mappa URLs are unaffected (page 1 is omitted
   * by stringifyCameraFilters).
   */
  page: number;
};

const FRESHNESS_SET = new Set<string>(FRESHNESS_WINDOWS);
const SORT_SET = new Set<string>(SORT_ORDERS);
const STATE_SET = new Set<string>(STATE_VALUES);

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
 * True when a stored timestamp string actually parses as a date (P1-2).
 * `cameras.updated` is now always ISO, but the client gate must never drop a
 * verified record because a legacy value (old "Local moderation: ..." label,
 * demo seed "Demo data") is not parseable — records without a freshness
 * signal are kept (except demo-status pins, see applyCameraFilters).
 */
export function isParseableDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
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
  const stateRaw = searchParams.get("state") ?? "all";
  const state = (STATE_SET.has(stateRaw) ? stateRaw : "all") as StateFilter;
  const focusRaw = searchParams.get("focus");
  const focusId = focusRaw === null ? null : Number(focusRaw);
  const focus = focusId !== null && Number.isInteger(focusId) && focusId > 0 ? focusId : null;
  const pageRaw = searchParams.get("page");
  const pageNumber = pageRaw === null ? 1 : Number(pageRaw);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  return { q, type, freshness, sort, state, focus, page };
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
  if (filters.state !== "all") params.set("state", filters.state);
  if (filters.focus !== null) params.set("focus", String(filters.focus));
  // Page 1 is the default and is omitted (R2 minimal URLs); /mappa never
  // sets page, so its URLs never carry ?page=.
  if (filters.page > 1) params.set("page", String(filters.page));
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
 * server-filtered or seeded records — anchors on lastVerifiedAt ?? parseable
 * updated, the server's freshness anchor; a real record with no parseable
 * anchor is kept, never silently dropped, P1-2; demo-status pins keep the
 * truthful empty-note contract and are excluded), sort (client, plan §3.3).
 * Pure and side-effect free so the URL contract is unit-testable; `now` is
 * injectable so freshness-window tests are deterministic.
 */
export function applyCameraFilters(records: Camera[], filters: CameraFilters, now = Date.now()): Camera[] {
  const query = filters.q.trim().toLocaleLowerCase();
  const cutoff = freshnessCutoffFor(filters.freshness, now);
  const matching = records.filter((camera) => {
    if (query && !textMatches(camera, query)) return false;
    if (filters.type !== "all" && camera.kind !== filters.type) return false;
    if (cutoff !== null) {
      // Freshness anchor (P1-2): prefer lastVerifiedAt; fall back to `updated`
      // ONLY when it parses as a date. Legacy prose values (e.g. old
      // "Local moderation: ..." labels) are never written anymore, but a real
      // record whose anchor is not parseable must NOT be silently dropped — it
      // has no freshness signal, so it is kept. The demo seed instead keeps
      // its "Demo data" label and is excluded by status: illustrative pins
      // must never masquerade as "recently verified" under a freshness window
      // (t_b9666d09, truthful in-list empty note).
      const rawAnchor = camera.lastVerifiedAt ?? (isParseableDate(camera.updated) ? camera.updated : undefined);
      if (rawAnchor === undefined) {
        if (camera.status === "demo") return false;
        return true;
      }
      if (new Date(rawAnchor).getTime() < cutoff) return false;
    }
    // Confirmation-state filter (FASE 3 UI): "confirmed" needs a
    // lastVerifiedAt, "never" needs it absent. A record with no anchor at
    // all counts as never confirmed.
    if (filters.state === "confirmed" && !camera.lastVerifiedAt) return false;
    if (filters.state === "never" && camera.lastVerifiedAt) return false;
    return true;
  });
  return matching.sort((first, second) => {
    switch (filters.sort) {
      case "useful":
        // Ranking (ADR §10): most useful first; the API orders by weighted
        // SUM server-side for exports, the client comparator uses the
        // exposed human count (usefulCount) — same spirit, never weights.
        return (second.usefulCount ?? 0) - (first.usefulCount ?? 0) || second.id - first.id;
      case "recent":
        // Freshness: last confirmed first; never-confirmed records sink to
        // the bottom (nulls last, mirroring the server's NULLS LAST).
        return (lastVerifiedMs(second) ?? -Infinity) - (lastVerifiedMs(first) ?? -Infinity) || second.id - first.id;
      case "confirmations":
        return (second.confirmCount ?? 0) - (first.confirmCount ?? 0) || second.id - first.id;
      case "position":
        return first.latitude - second.latitude || first.longitude - second.longitude || first.title.localeCompare(second.title);
      default:
        return first.title.localeCompare(second.title);
    }
  });
}

/** Parseable lastVerifiedAt timestamp, or null. Shared by the recent sort. */
function lastVerifiedMs(camera: Camera): number | null {
  if (!camera.lastVerifiedAt) return null;
  const ms = new Date(camera.lastVerifiedAt).getTime();
  return Number.isFinite(ms) ? ms : null;
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
  /** The seven dimensions parsed from the current URL. */
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
  /** Commit the confirmation-state filter immediately (FASE 3 UI). */
  setState: (value: StateFilter) => void;
  /** Commit the result page (?page=, /directory pagination). */
  setPage: (value: number) => void;
  /** Clear every filter dimension (replace to the bare pathname). */
  reset: () => void;
};

/**
 * URL state for the shared filter pattern (/mappa and /directory — D4).
 * Reads the five dimensions from useSearchParams into a COMMITTED mirror
 * (t_3c4b188e); the URL stays the shareable source of truth, so deep links
 * and back/forward just work — every EXTERNAL URL change re-derives the
 * mirror. Writes go through applyFilters: explicit changes (selects, reset)
 * use router.replace(href, { scroll: false }); keyboard ?q= commits use a
 * PURE window.history.replaceState so no RSC navigation (and therefore no
 * vinext digest error / remount) can ever fire while the user is typing.
 * A local revision bump re-renders after each write even in environments
 * where router.replace is stubbed without a real navigation (dom-harness).
 */
export function useCameraFilters(): UseCameraFiltersResult {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // The COMMITTED mirror (t_3c4b188e): the filters the app actually filters
  // on. The URL stays the shareable source of truth (deep links, back/
  // forward), but keyboard-driven ?q= writes now commit via a PURE
  // window.history.replaceState (see applyFilters) — which Next's router
  // never observes — so the mirror is the only place the committed values
  // are guaranteed to live between a replaceState write and the next
  // EXTERNAL URL change. It is initialized from the URL, updated by every
  // write, and re-derived from the URL whenever an external change (deep
  // link, back/forward) shows up through useSearchParams.
  const [committed, setCommitted] = useState<CameraFilters>(() => parseCameraFilters(searchParams));
  const [qInput, setQInput] = useState(() => parseCameraFilters(searchParams).q);
  const [revision, setRevision] = useState(0);

  // Latest-value refs so the debounce timer and the write callback never act
  // on a stale URL/filter snapshot (the user may change a select while the
  // q timer is pending — the commit must not clobber it). Kept in effects:
  // ref writes during render are forbidden, and the debounce/write callbacks
  // only ever run AFTER a render (user events / timers), so the effect has
  // always refreshed the refs by the time they are read.
  const filtersRef = useRef<CameraFilters>({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", focus: null, page: 1 });
  useEffect(() => {
    filtersRef.current = committed;
  });
  const searchParamsRef = useRef<string>("");
  useEffect(() => {
    searchParamsRef.current = searchParams.toString();
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // t_3c4b188e: the router-visible URL (useSearchParams) as last seen. A
  // PURE history.replaceState ?q= write is NEVER observed by Next's router,
  // so useSearchParams keeps returning the PREVIOUS URL until the next
  // router navigation — the mirror is AHEAD of the router-visible URL by
  // design. The external-sync effect below therefore compares the current
  // searchParams against THIS ref (not against the mirror): an unchanged
  // router-visible URL means "no external change — keep the mirror" (this
  // covers both the no-op renders and the replaceState-write renders).
  const routerVisibleSearchRef = useRef(searchParams.toString());

  // External URL change (deep link, back/forward, reset): re-derive the
  // committed filters from the URL. A router self-write makes useSearchParams
  // advance to exactly the URL we just committed (the serialized comparison
  // sees no difference → keep the mirror); a genuine external change differs
  // and re-syncs. A pure history.replaceState write leaves useSearchParams
  // untouched (current === routerVisibleSearchRef) → the mirror is kept,
  // which is exactly the point of the t_3c4b188e fix.
  useEffect(() => {
    const current = searchParams.toString();
    if (current === routerVisibleSearchRef.current) return;
    routerVisibleSearchRef.current = current;
    const fromUrl = parseCameraFilters(searchParams);
    if (stringifyCameraFilters(fromUrl) === stringifyCameraFilters(committed)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external URL sync (deep link / back-forward): the committed mirror re-derives from the URL — the documented "adjusting state when a prop changes" pattern; the serialized-filters guard makes it a one-shot sync, not a loop.
    setCommitted(fromUrl);
  }, [searchParams, committed]);

  // External URL change: keep the input in sync with the committed q — but
  // never clobber text the user is actively typing (the debounce timer has
  // not fired yet, so qInput !== committed.q). The setState is guarded
  // (identity write → no re-render), so this is the documented "adjusting
  // state when a prop changes" pattern — not a loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded sync of the URL-controlled input (see comment above): identity-guarded setState keeps the input in sync with the committed URL q (deep link / back-forward); the guard means this is the documented "adjusting state when a prop changes" pattern, not a loop.
    setQInput((current) => (current === committed.q ? current : committed.q));
  }, [committed.q]);

  // Clear a pending debounce on unmount.
  useEffect(() => () => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
  }, []);

  // Build the target href for a filter state: the owned params are
  // serialized from `filters` (the committed mirror), while params the hook
  // does NOT own (e.g. future ?lat=&lng=&z= viewport state) survive from
  // the current URL. The mirror is the base for owned params on purpose:
  // after a pure history.replaceState ?q= write the router-visible URL lags
  // the mirror, and re-serializing the mirror is what keeps a later select
  // or reset write from silently dropping the typed q.
  const hrefFor = useCallback((filters: CameraFilters) => {
    const params = new URLSearchParams(searchParamsRef.current);
    for (const key of ["q", "type", "freshness", "sort", "state", "focus", "page"]) params.delete(key);
    const q = filters.q.trim();
    if (q) params.set("q", q);
    if (filters.type && filters.type !== "all") params.set("type", filters.type);
    if (filters.freshness !== "all") params.set("freshness", filters.freshness);
    if (filters.sort !== "alphabetical") params.set("sort", filters.sort);
    if (filters.state !== "all") params.set("state", filters.state);
    if (filters.focus !== null) params.set("focus", String(filters.focus));
    if (filters.page > 1) params.set("page", String(filters.page));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname]);

  // Write the URL. Never called during render: only from the setters and the
  // debounce timer, so the SSR smoke (whose useRouter stub has no replace)
  // never touches it. Two commit paths (t_3c4b188e):
  //
  //   via="history" — KEYBOARD-driven ?q= writes (setQ, including the
  //   immediate clear). A PURE window.history.replaceState: it updates the
  //   address bar and the committed mirror, and NEVER triggers a Next RSC
  //   navigation. This is the actual fix for the persistent vinext error:
  //   #212's try/catch could not catch it because the deployed error
  //   ('Cannot read properties of undefined (reading "digest")') is thrown
  //   ASYNCHRONOUSLY by the navigation controller, after router.replace has
  //   already returned; vinext then forces window.location.href =
  //   currentHref (a full reload), which remounts the tool and closes
  //   GeocodeSearch's dropdown right after it opens. Not calling
  //   router.replace for ?q= removes the failure mode entirely.
  //
  //   via="router" — EXPLICIT writes (kind/freshness/sort selects, reset):
  //   router.replace(href, { scroll: false }) as before, hardened by the
  //   t_b1e192e1 no-op guard + try/catch → silent history.replaceState
  //   fallback for a synchronously-throwing navigation. These are rare,
  //   non-typing actions, so an async-error reload would not disrupt the
  //   autocomplete UX; if vinext's error later proves to hit them too,
  //   they can move to the same history path (one argument).
  //
  // The revision bump below re-renders either way (the hook's documented
  // render trigger for stubbed/navigation-less environments).
  const applyFilters = useCallback((next: CameraFilters, via: "router" | "history" = "router") => {
    const href = hrefFor(next);
    const currentHref = hrefFor(filtersRef.current);
    if (href === currentHref) {
      // No-op guard (R2 URL churn — the guard the CEO asked to verify): the
      // write would produce the URL we are already on; the mirror is still
      // updated so the committed state always reflects `next`.
      setCommitted(next);
      setRevision((value) => value + 1);
      return;
    }
    if (via === "history") {
      // Pure History API: no RSC navigation → no vinext digest error → no
      // reload → no remount → the geocode dropdown stays open and stable
      // while the points list re-filters underneath it.
      window.history.replaceState(null, "", href);
    } else {
      try {
        router.replace(href, { scroll: false });
      } catch {
        // Silent commit: the URL is the single source of truth — a failed
        // client-side navigation must never take the tree down.
        window.history.replaceState(null, "", href);
      }
    }
    setCommitted(next);
    setRevision((value) => value + 1);
  }, [hrefFor, router]);

  function setQ(value: string) {
    setQInput(value);
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = value.trim();
    // No-op when the committed value is unchanged (backspace to the same
    // text must not churn the URL). Compare against the RENDER-SCOPE
    // `committed`, never filtersRef.current: the ref is refreshed in a
    // passive effect that can lag the committed mirror by one flush cycle
    // (V8-coverage load in CI), so an immediate clear after the debounced
    // commit used to be misread as "unchanged" and swallowed — the empty
    // note stayed on screen and the clear never reached applyFilters. The
    // event handler always closes over the LATEST render's committed, so
    // this comparison is both fresher and deterministic.
    if (trimmed === committed.q.trim()) return;
    // Clearing the search commits immediately (no dead air on reset-like UX)
    // — same pure-history path as the debounced commit. Spread from the
    // render-scope committed: filtersRef.current may still lag it, and a
    // stale spread would resurrect the cleared q in the URL write.
    if (trimmed === "") {
      applyFilters({ ...committed, q: "", page: 1 }, "history");
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      applyFilters({ ...filtersRef.current, q: trimmed, page: 1 }, "history");
    }, QUERY_DEBOUNCE_MS);
  }

  function setType(value: string) {
    applyFilters({ ...filtersRef.current, type: value, page: 1 });
  }

  function setFreshness(value: string) {
    // Select values are whitelisted by the markup; a stray value (or a
    // tampered option) falls back to "all" instead of writing a bad URL.
    applyFilters({ ...filtersRef.current, freshness: (FRESHNESS_SET.has(value) ? value : "all") as FreshnessWindow, page: 1 });
  }

  function setSort(value: SortOrder) {
    applyFilters({ ...filtersRef.current, sort: value, page: 1 });
  }

  function setState(value: StateFilter) {
    applyFilters({ ...filtersRef.current, state: (STATE_SET.has(value) ? value : "all") as StateFilter, page: 1 });
  }

  /** /directory pagination (t_f13fcb1c): clamp to >= 1, write ?page=. */
  function setPage(value: number) {
    const page = Number.isInteger(value) && value > 0 ? value : 1;
    applyFilters({ ...filtersRef.current, page });
  }

  function reset() {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQInput("");
    applyFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", focus: null, page: 1 });
  }

  // The revision value itself is intentionally unused: it exists so the
  // renderer re-runs after every URL write (see the hook docs).
  void revision;

  return { filters: committed, qInput, setQ, setType, setFreshness, setSort, setState, setPage, reset };
}
