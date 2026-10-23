"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../LocaleProvider";
import { useMessages } from "../../lib/use-messages";
import { publicStatusLabel } from "../../lib/public-status";
import { formatDistance } from "../../lib/search";
import { formatPublicDate } from "../../lib/format-date";
import { formatLocation } from "../../lib/format-location";
import type { Camera } from "../../lib/records";
import { RecordCard } from "../RecordCard";
import { FiltersBar } from "../FiltersBar";
import { EmptyState } from "../EmptyState";
import { usePlaceSearch } from "../../lib/usePlaceSearch";
import { fetchImportSources, importSourceOf, type ImportSourceInfo } from "../../lib/import-sources";

/** Records per page in the /directory catalog (t_f13fcb1c). */
export const DIRECTORY_PAGE_SIZE = 20;

/**
 * One removable active-filter chip (F1, mobile usability 2026-10-23).
 * `mobileOnly` chips (confirmation state, origin, non-default order) render
 * only in the ≤700px row — on desktop the accepted q/type/freshness row is
 * untouched, so e.g. an origin-only filter adds no empty margin block there.
 */
type FilterChip = { id: string; label: string; clear: () => void; mobileOnly?: boolean };

type Props = {
  filteredRecords: Camera[];
  /** True during the initial walk, before any records arrive. */
  loading?: boolean;
  /**
   * Load failure (kanban t_e11080eb): the public-list walk failed (429 on
   * the shared read bucket, network). Render the truthful error state with
   * retry instead of the empty state — "0 public records found" would be a
   * lie while the map shows the same records.
   */
  loadError?: boolean;
  /** Retry the failed walk. */
  onRetryLoad?: () => void;
  cameraKinds: string[];
  search: string;
  setSearch: (value: string) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  freshnessFilter: string;
  setFreshnessFilter: (value: string) => void;
  sortOrder: "alphabetical" | "position" | "useful" | "recent" | "confirmations";
  setSortOrder: (value: "alphabetical" | "position" | "useful" | "recent" | "confirmations") => void;
  /** Optional (FASE 3 UI): confirmation-state filter (?state=), wired by the /directory tool. */
  stateFilter?: "all" | "confirmed" | "never";
  setStateFilter?: (value: "all" | "confirmed" | "never") => void;
  /** Optional (FASE C, t_4dbce318): import-origin filter (?origin=), wired by the /directory tool. */
  originFilter?: "all" | "reports" | "imported";
  setOriginFilter?: (value: "all" | "reports" | "imported") => void;
  /** Optional (t_f13fcb1c): result page from the URL (?page=, clamped). */
  page?: number;
  /** Optional (t_f13fcb1c): pagination setter (writes ?page=). */
  setPage?: (value: number) => void;
  /**
   * Server-side total of the FILTERED set (cursor pagination): the cursor
   * hook fetches one page at a time, so `filteredRecords` is only the
   * current page — the count, page count and "Showing X–Y of Z" summary
   * must come from the server total, never from the page length.
   */
  totalRecords?: number;
  /**
   * True when the server already paginated (cursor mode): records ARE the
   * current page, so the legacy client-side slice must NOT run again.
   */
  serverPaginated?: boolean;
  /** Server-side A-Z seek used by cursor pagination. */
  onInitialSeek?: (letter: string) => void;
  /** Keyboard path: select a record on the map and move focus to it. */
  showRecordOnMap: (id: number) => void;
  /** Place-search hit: focus the map / report position on the area. */
  setCoordinates: (coordinates: { latitude: number; longitude: number } | null) => void;
  /** Atomic reset for URL-backed filters (useCameraFilters). */
  onResetFilters: () => void;
  /** "Submit a private observation" target (empty states). */
  reportHref?: string;
};

/**
 * /directory catalog layout (t_127492f1; redesign t_f13fcb1c): the
 * browse-record page. Order: shared FiltersBar "bare" (controls only) with
 * the place-search toggle in the SAME controls row (one search concept per
 * page — the trigger is part of the search cluster) → collapsible place-search
 * panel → VISIBLE results header (h2 + count role=status + CSV/GeoJSON) →
 * active-filter chips (one-shot removal) → alphabetical index (Wikipedia
 * AllPages pattern, only in alphabetical order) → one-column flat rows
 * (RecordCard, sliced to DIRECTORY_PAGE_SIZE) → pagination bar
 * (Previous / "Showing X–Y of Z · Page N of M" / Next, ?page= URL-backed).
 *
 * The result page lives in the URL (?page=, owned by useCameraFilters like
 * every other dimension): deep links, share and back/forward re-derive it,
 * and every filter change resets it to 1 (the setters commit page: 1).
 * A place search replaces the list entirely (one result flow — banner +
 * Distance facts) and hides the index/pagination/chips, which only make
 * sense for the filtered list.
 */
export function DirectoryCatalog({ filteredRecords, loading, loadError, onRetryLoad, cameraKinds, search, setSearch, kindFilter, setKindFilter, freshnessFilter, setFreshnessFilter, sortOrder, setSortOrder, stateFilter, setStateFilter, originFilter, setOriginFilter, page = 1, setPage, totalRecords: serverTotalRecords, serverPaginated = false, onInitialSeek, showRecordOnMap, setCoordinates, onResetFilters, reportHref }: Props) {
  const t = useMessages().directory;
  const statuses = useMessages().status;
  const { locale } = useLocale();
  const place = usePlaceSearch(t, locale, (coordinates) => setCoordinates(coordinates));
  // Offline state: the directory keeps working (records are already on the
  // page — "the last loaded records"). SSR-safe: navigator is undefined on
  // the server, so the banner never appears in first paint.
  const [offline, setOffline] = useState(false);
  // Import provenance (FASE C, t_4dbce318): the list API exposes the raw
  // 'import:<slug>' value; the readable entity name comes from the SAME
  // committed batches the map popup and /fonti use (lib/import-sources, one
  // module-level single-flight cache — never one request per card). A failed
  // endpoint keeps the truthful raw value, and the cancelled guard drops a
  // late resolution that would write into an unmounted list.
  const [sources, setSources] = useState<Map<string, ImportSourceInfo>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetchImportSources().then((map) => { if (!cancelled) setSources(map); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  // The results heading: pagination and the A–Z index move the reading
  // position here (focus follows for AT, scroll is CSS-reduced-motion aware).
  const resultsRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Action row shared by the catalog and the place-search rows: select the
  // record on the map (keyboard path) or open its detail page.
  function cardActions(camera: Camera) {
    return <><button type="button" className="text-button" onClick={() => showRecordOnMap(camera.id)}>{t.showOnMap} <span aria-hidden="true">→</span></button><a className="text-button" href={`/records/${camera.id}`}>{t.openRecord} <span aria-hidden="true">→</span></a></>;
  }

  // The catalog fact set keeps the record ID (the map's text equivalent must
  // expose it — rendered-html contract) plus the three provenance facts;
  // optional manufacturer/observed-on stay on the detail page. F4 (QA#6):
  // demo records (status "demo") show the localized demo labels instead of
  // the raw seed markers ("Development seed"/"Demo data" — DATA_DICTIONARY).
  // Source fact value: the localized demo label wins for the seed rows, then
  // the READABLE batch attribution when it is known (imported rows only).
  // Both values are in the markup: desktop keeps rendering the raw source
  // exactly as before, the ≤700px card shows the readable one (globals.css).
  // Nothing is guessed — an unknown/absent batch keeps the raw value.
  function sourceValue(camera: Camera) {
    if (camera.status === "demo") return t.demoSource;
    const provenance = importSourceOf(camera, sources);
    if (!provenance) return camera.source;
    return (
      <span className="record-source has-name">
        <span className="record-source-raw">{camera.source}</span>
        <span className="record-source-name">{provenance.sourceName}</span>
      </span>
    );
  }

  function mainFacts(camera: Camera) {
    return [
      { label: t.recordId, value: camera.id },
      { label: t.source, value: sourceValue(camera) },
      { label: t.lastUpdated, value: camera.status === "demo" ? t.demoUpdated : formatPublicDate(camera.updated, locale) },
      { label: t.location, value: formatLocation(camera.address, camera.latitude, camera.longitude) },
    ];
  }

  // Locality/address/coordinate search lives in the shared usePlaceSearch
  // hook (same flow as the home hub section — one source of truth).

  // One result flow: a successful place search replaces the filtered list
  // (same list, distance first); empty/not-found render their own truthful
  // EmptyState; the standard list returns once cleared.
  const placeActive = place.placeResult?.status === "success";
  const placeDone = place.placeResult !== null && ["success", "empty", "not-found"].includes(place.placeResult.status);
  const placeRecords = placeActive && place.placeResult?.records ? place.placeResult.records : [];
  const showList = placeActive || (!placeDone && !loadError && filteredRecords.length > 0);
  const countLabel = loadError
    ? t.loadErrorTitle
    : placeDone
      ? t.placeResultsFound(placeActive ? placeRecords.length : 0)
      // No known total yet (first fetch in flight): announce loading, not a false zero.
      : loading && serverTotalRecords == null
        ? t.loading
        : serverTotalRecords === 1 ? t.oneRecordFound : `${serverTotalRecords ?? filteredRecords.length} ${t.recordsFound}`;

  // Pagination: in cursor mode the server already paginated (records ARE
  // the current page, total comes from the API) — the client slice must
  // NOT run again. In legacy-walk mode the memo holds the whole filtered
  // set and the slice gives bounded DOM + ?page= deep links (t_f13fcb1c).
  // Lenient parse: a stale ?page= (narrowed filter set) clamps to the last
  // real page, never a blank list.
  const totalRecords = serverTotalRecords ?? filteredRecords.length;
  const pageCount = Math.max(1, Math.ceil(totalRecords / DIRECTORY_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageRecords = placeActive
    ? placeRecords
    : serverPaginated
      ? filteredRecords
      : filteredRecords.slice((safePage - 1) * DIRECTORY_PAGE_SIZE, safePage * DIRECTORY_PAGE_SIZE);

  // Active-filter chips: one per non-default dimension, one-shot removal
  // (calls the same URL setters as the controls — D4; every setter commits
  // page: 1 through useCameraFilters, so the reset is never forked here).
  // Hidden while a place search owns the results (the place banner
  // communicates that context).
  //
  // F1 (mobile usability 2026-10-23): the desktop set stays exactly the
  // accepted q/type/freshness chips. Confirmation state, origin and a
  // non-default order are `mobileOnly` chips — on a phone the filter
  // disclosure starts closed, so the list state must be visible (and
  // removable) without opening it. The order chip names the ordering
  // ("Order: …"): an order is a choice, never a restrictive filter.
  const activeFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    if (kindFilter && kindFilter !== "all") chips.push({ id: `type-${kindFilter}`, label: kindFilter, clear: () => setKindFilter("all") });
    if (freshnessFilter && freshnessFilter !== "all") {
      const label = ({ "7d": t.freshness7d, "30d": t.freshness30d, "90d": t.freshness90d } as Record<string, string>)[freshnessFilter] ?? freshnessFilter;
      chips.push({ id: `freshness-${freshnessFilter}`, label, clear: () => setFreshnessFilter("all") });
    }
    const q = search.trim();
    if (q) chips.push({ id: "q", label: q, clear: () => setSearch("") });
    if (stateFilter && stateFilter !== "all" && setStateFilter) {
      chips.push({ id: `state-${stateFilter}`, label: stateFilter === "confirmed" ? t.stateConfirmed : t.stateNever, clear: () => setStateFilter("all"), mobileOnly: true });
    }
    if (originFilter && originFilter !== "all" && setOriginFilter) {
      chips.push({ id: `origin-${originFilter}`, label: originFilter === "reports" ? t.originReports : t.originImported, clear: () => setOriginFilter("all"), mobileOnly: true });
    }
    if (sortOrder !== "alphabetical") {
      const orderLabel = ({ position: t.positionOrder, useful: t.sortUseful, recent: t.sortRecent, confirmations: t.sortConfirmations } as Record<string, string>)[sortOrder] ?? sortOrder;
      chips.push({ id: `sort-${sortOrder}`, label: t.filterOrder(orderLabel), clear: () => setSortOrder("alphabetical"), mobileOnly: true });
    }
    return chips;
  }, [kindFilter, freshnessFilter, search, stateFilter, setStateFilter, originFilter, setOriginFilter, sortOrder, setSortOrder, setKindFilter, setFreshnessFilter, setSearch, t]);
  // The desktop row (also the only row from 701px up) keeps the accepted chips.
  const desktopFilters = activeFilters.filter((chip) => !chip.mobileOnly);

  // Alphabetical index (Wikipedia AllPages pattern): ALL 26 letters are
  // shown — the ones present in the filtered set are jump links (to the page
  // holding the first record with that letter), the absent ones are muted
  // placeholders (aria-hidden, decorative). With a sparse set the bar still
  // reads as a real A–Z index. Hidden for positional sorting and while a
  // place search owns the results.
  const alphaIndex = useMemo(() => {
    if (loading || sortOrder !== "alphabetical" || placeActive) return null;
    if (onInitialSeek) {
      return Array.from({ length: 26 }, (_, index) => ({
        letter: String.fromCharCode(65 + index),
        page: 1,
      }));
    }
    if (filteredRecords.length === 0) return null;
    const letters: Array<{ letter: string; page: number | null }> = [];
    for (let code = 65; code <= 90; code += 1) {
      const letter = String.fromCharCode(code);
      const index = filteredRecords.findIndex((camera) => camera.title.trim().toLocaleUpperCase().startsWith(letter));
      letters.push({ letter, page: index === -1 ? null : Math.floor(index / DIRECTORY_PAGE_SIZE) + 1 });
    }
    return letters;
  }, [filteredRecords, sortOrder, placeActive, loading, onInitialSeek]);

  // Letters whose first record sits on the current page → aria-current.
  // In cursor mode the records ARE the current page (no client slice).
  const currentPageLetters = useMemo(() => {
    if (!alphaIndex) return new Set<string>();
    const start = serverPaginated ? 0 : (safePage - 1) * DIRECTORY_PAGE_SIZE;
    const end = serverPaginated ? filteredRecords.length : Math.min(start + DIRECTORY_PAGE_SIZE, totalRecords);
    const set = new Set<string>();
    for (let i = start; i < end; i += 1) {
      const first = filteredRecords[i]?.title.trim().charAt(0).toLocaleUpperCase();
      if (first && /^[A-Z]$/.test(first)) set.add(first);
    }
    return set;
  }, [alphaIndex, safePage, totalRecords, filteredRecords, serverPaginated]);

  // Move the reading position to the results header after a page/index jump
  // (the header is above the list, so it never moves with the slice; the
  // CSS scroll-behavior honours prefers-reduced-motion).
  function moveToResults() {
    resultsRef.current?.scrollIntoView({ block: "start" });
    resultsRef.current?.focus({ preventScroll: true });
  }

  function goToPage(nextPage: number) {
    const clamped = Math.min(Math.max(1, nextPage), pageCount);
    if (clamped === safePage) return;
    setPage?.(clamped);
    moveToResults();
  }

  function goToLetter(letter: string) {
    if (onInitialSeek) {
      onInitialSeek(letter);
      requestAnimationFrame(moveToResults);
      return;
    }
    const hit = alphaIndex?.find((entry) => entry.letter === letter);
    if (!hit || hit.page === null) return;
    if (hit.page !== safePage) {
      setPage?.(hit.page);
      // Let the new slice render before scrolling (the header sits above
      // the list, but the list height changes between pages).
      requestAnimationFrame(moveToResults);
    } else {
      moveToResults();
    }
  }

  // Pagination bar (t_f13fcb1c): Previous / "Showing X–Y of Z · Page N of M" /
  // Next. F2 (mobile usability 2026-10-23): the SAME bar also renders above
  // the first card on phones, so changing page never requires scrolling the
  // whole list. ONE renderer: paging math, ?page= commit, clamping, the
  // disabled first/last bounds and the results-heading focus stay shared; the
  // extra copy is display:none from 701px up (globals.css).
  function pager(className: string) {
    return (
      <nav className={className} aria-label={t.resultsRegion}>
        <button type="button" className="pagination-button" disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}><span aria-hidden="true">←</span> {t.previousPage}</button>
        <p className="pagination-summary">{t.showingRecords((safePage - 1) * DIRECTORY_PAGE_SIZE + 1, Math.min(safePage * DIRECTORY_PAGE_SIZE, totalRecords), totalRecords)} · {t.pageOf(safePage, pageCount)}</p>
        <button type="button" className="pagination-button" disabled={safePage >= pageCount} onClick={() => goToPage(safePage + 1)}>{t.nextPage} <span aria-hidden="true">→</span></button>
      </nav>
    );
  }

  // Chips row renderer (F1): the mobile row carries the full selection, the
  // desktop row the accepted q/type/freshness set. Same markup, one row per
  // breakpoint (CSS), so no chip is ever announced twice.
  function chipList(chips: FilterChip[], className: string) {
    return (
      <ul className={`filter-chips ${className}`} aria-label={t.activeFilters}>
        {chips.map((chip) => (
          <li key={chip.id}>
            <button type="button" className="filter-chip" onClick={chip.clear} aria-label={t.removeFilter(chip.label)}>{chip.label} <span aria-hidden="true">✕</span></button>
          </li>
        ))}
      </ul>
    );
  }

  // Shared gate for BOTH pagination rows: never for a one-page/empty set and
  // never while a place search owns the results.
  const showPager = !placeActive && totalRecords > DIRECTORY_PAGE_SIZE;

  return (
    <section className="records-section" id="records" aria-label={t.accessibleDirectory}>
      {offline && <div className="offline-state" role="status"><b>{t.offlineTitle}.</b> {t.offlineBody} <button type="button" className="text-button" onClick={() => window.location.reload()}>{t.offlineAction} <span aria-hidden="true">→</span></button></div>}
      <FiltersBar variant="bare" showCommunitySort stateFilter={stateFilter} setStateFilter={setStateFilter} originFilter={originFilter} setOriginFilter={setOriginFilter} activeFilterCount={placeActive ? 0 : activeFilters.length} cameraKinds={cameraKinds} search={search} setSearch={(value) => { place.clearPlaceSearch(); setSearch(value); }} onSearchSubmit={() => { void place.searchByQuery(search); }} kindFilter={kindFilter} setKindFilter={setKindFilter} freshnessFilter={freshnessFilter} setFreshnessFilter={setFreshnessFilter} sortOrder={sortOrder} setSortOrder={setSortOrder} resultCount={totalRecords} onReset={onResetFilters} />
      {place.placeResult?.status === "loading" && <p className="loading-note" role="status">{t.placeSearchLoading}</p>}
      {place.placeResult?.status === "error" && <p className="nearby-error" role="alert">{place.placeResult.message}</p>}
      {/* Visible results header (t_f13fcb1c): replaces the sr-only h2 with a
          real browse context — heading + count (role=status, historical id).
          The CSV/GeoJSON downloads live in the data-actions footer
          (DirectoryTool, t_b98b1734) next to the data policy link. The count
          keeps the historical format so the input's aria-describedby and the
          AT announcements work as before. */}
      <div className="directory-results">
        <div className="directory-results-head">
          <h2 id="directory-results-title" tabIndex={-1} ref={resultsRef}>{t.resultsRegion}</h2>
          <p className="search-count" id="record-search-count" role="status">{countLabel}</p>
        </div>
        {/* CEO 2026-08-08: a small circular [+] in the header top-right — a
            direct shortcut to the report form (/segnala). Plain link: the
            write gate on /segnala handles anonymous visitors. */}
        <div className="directory-results-actions">
          <a className="add-button" href={reportHref} aria-label={t.reportCamera}><span aria-hidden="true">+</span></a>
        </div>
      </div>
      {/* Active-filter chips: the state of the list at a glance, removable
          one at a time (Google Maps / CKAN pattern). F1 (mobile usability
          2026-10-23): one row per breakpoint — phones get every active
          selection (state/origin/order included, because the filter
          disclosure starts closed there), from 701px up the accepted
          q/type/freshness row renders exactly as before. Both rows are
          gated by the same expressions, so the count in the filter summary
          and the visible chips can never disagree. */}
      {!placeActive && activeFilters.length > 0 && chipList(activeFilters, "filter-chips-mobile")}
      {!placeActive && desktopFilters.length > 0 && chipList(desktopFilters, "filter-chips-desktop")}
      {/* Alphabetical index: jump bar over the filtered set (Wikipedia
          AllPages pattern), only in alphabetical order. */}
      {alphaIndex && (
        <nav className="alpha-index" aria-label={t.alphaIndexTitle}>
          <ul>
            {alphaIndex.map(({ letter, page: targetPage }) => (
              <li key={letter}>
                {targetPage === null ? (
                  <span className="alpha-index-link is-muted" aria-hidden="true">{letter}</span>
                ) : (
                  <button type="button" className={currentPageLetters.has(letter) ? "alpha-index-link is-current" : "alpha-index-link"} onClick={() => goToLetter(letter)} aria-label={t.alphaIndexAria(letter)} aria-current={currentPageLetters.has(letter) ? "true" : undefined}>{letter}</button>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
      {place.placeResult?.status === "not-found" && <EmptyState title={t.placeNotFoundTitle} body={t.placeNotFoundBody} />}
      {place.placeResult?.status === "empty" && <EmptyState title={t.placeEmptyTitle} body={t.placeEmptyBody} action={<a className="text-button" href={reportHref}>{t.placeEmptySubmit} <span aria-hidden="true">→</span></a>} />}
      {placeActive && place.placeResult?.area && (
        <div className="place-banner" role="status">
          <p className="search-count">{t.placeAreaLabel(place.placeResult.area)}</p>
          <button type="button" className="text-button" onClick={place.clearPlaceSearch}>{t.placeClearResults} <span aria-hidden="true">→</span></button>
        </div>
      )}
      {/* F2 (mobile usability 2026-10-23): the same pager above the first
          card — phones only (display:none from 701px up). */}
      {showPager && pager("directory-pagination directory-pagination-top")}
      {loading && filteredRecords.length === 0
        ? (
          // Loading state: show a truthful note during the initial walk
          // instead of the empty state ("0 public records found" is a lie
          // for 400ms until the first page arrives — audit 2026-08-09).
          // The dedicated class reserves the list area while pending only.
          <p className="loading-note directory-list-loading" role="status">{t.loading}</p>
        )
        : loadError
        ? (
          // Load failure (kanban t_e11080eb): truthful error state with
          // retry. The empty state ("0 public records found") would be a
          // lie — the records exist, the map shows them; only the walk
          // failed (429 on the shared read bucket, network).
          <EmptyState title={t.loadErrorTitle} body={t.loadErrorBody} action={<p className="empty-state-actions"><button type="button" className="text-button" onClick={onRetryLoad}>{t.loadErrorRetry} <span aria-hidden="true">→</span></button><a className="text-button" href="/mappa">{t.useMapInstead} <span aria-hidden="true">↑</span></a></p>} />
        )
        : showList ? <ul className="record-list">{pageRecords.map((camera) => <li key={camera.id}><RecordCard camera={camera} statusLabel={publicStatusLabel(statuses, camera.status, t.unknown)} facts={placeActive ? [{ label: t.distance, value: formatDistance((camera as Camera & { distanceMeters: number }).distanceMeters) }, { label: t.location, value: formatLocation(camera.address, camera.latitude, camera.longitude) }, { label: t.lastUpdated, value: camera.status === "demo" ? t.demoUpdated : formatPublicDate(camera.updated, locale) }] : mainFacts(camera)} actions={cardActions(camera)} /></li>)}</ul> : !placeDone && <EmptyState title={t.emptyTitle} body={t.emptyBody} action={<p className="empty-state-actions"><button type="button" className="text-button" onClick={() => setSearch("")}>{t.clearSearch} <span aria-hidden="true">→</span></button><a className="text-button" href={reportHref}>{t.submitObservation} <span aria-hidden="true">→</span></a></p>} />}
      {/* Pagination bar (t_f13fcb1c): only when the filtered set spans more
          than one page; Previous / "Showing X–Y of Z · Page N of M" / Next.
          The bottom bar stays in place at every width. */}
      {showPager && pager("directory-pagination")}
    </section>
  );
}
