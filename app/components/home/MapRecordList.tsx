"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { Camera } from "../../lib/records";

/**
 * Render cap for the /mappa points list: at national zoom the viewport holds
 * thousands of points, and one <li> per point (~6 DOM nodes each) made a
 * small pan cost seconds of main-thread work on a phone. The list renders
 * the first MAP_LIST_PAGE_SIZE rows in the existing order and a "Show more"
 * button appends the next page. The heading count and the disclosure label
 * still report the FULL in-view count.
 */
export const MAP_LIST_PAGE_SIZE = 50;

type Props = {
  /** Records after the directory filters are applied (map markers). */
  filteredRecords: Camera[];
  /** Records inside the current map viewport (sidebar list). */
  visibleRecords: Camera[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Localized strings (a subset of the map dictionary). */
  labels: {
    listTitle: string;
    listCount: (visible: number, total: number) => string;
    /**
     * Localized compact disclosure label (verb + in-view count) painted as
     * the ONE visible text of the mobile row control. Zero/one/many wording
     * lives in the dictionary, never concatenated here.
     */
    listShowCount: (count: number) => string;
    listHideCount: (count: number) => string;
    listMapSyncHelp: string;
    listEmptyInView: string;
    emptyTitle: string;
    emptyBody: string;
    clearSearch: string;
    /** "Show more" button label (next page size, remaining count). */
    listShowMore: (next: number, remaining: number) => string;
    /** Polite live summary of how many rows are listed out of the in-view total. */
    listShownOf: (shown: number, total: number) => string;
  };
  /**
   * Whitelisted, localized status label for a camera status (t_d089a17e):
   * rendered next to the status-dot in each row so the status rail colour
   * is never the only signal (WCAG 1.4.1). Comes from the shared
   * publicStatusLabel helper (never a raw status string).
   */
  statusLabel: (status: string) => string;
  /**
   * Mobile map-first panel (t_b7728ad0): whether the points list is
   * collapsed to its header (the map is the primary function on small
   * screens — the list starts compact with its count, expandable from
   * the header toggle). Desktop collapses to the 44px rail (map-first).
   * While collapsed the rows are NOT rendered (perf); the header stays.
   */
  collapsed?: boolean;
  /** Toggle handler for the mobile collapse (optional; renders the toggle). */
  onToggleCollapse?: () => void;
};

/**
 * The /mappa sidebar list (t_702c10af viewport sync, t_b9666d09 empty note).
 * Shows only the points inside the current map view. Map-always-visible
 * contract (t_b9666d09): a filter that matches nothing keeps the map AND
 * the sidebar rendered — the truthful "no record matches" note lives INSIDE
 * this list as a note with a clear action, never replacing the workspace.
 * Extracted from MapPanel so the workspace stays a thin orchestrator
 * (~150-line contract, component-smoke.test.mjs).
 */
function MapRecordListImpl({ filteredRecords, visibleRecords, selectedId, onSelect, labels, statusLabel, collapsed = false, onToggleCollapse }: Props) {
  // Mobile map-first (t_b7728ad0): the "Points in the current view" panel
  // starts compact below the map. The header stays visible (title + count)
  // and carries an accessible disclosure toggle (aria-expanded, keyboard
  // reachable); the scrollable list itself is hidden while collapsed (CSS
  // display:none at every size) and its rows are not rendered at all.
  // B08: the counter refers to the CURRENT VIEW, not the accumulated store —
  // it is the in-view count on both sides (the old denominator was the union
  // of every explored bbox). It is computed once so the heading, the live
  // region and the disclosure label can never disagree.
  const countLabel = labels.listCount(visibleRecords.length, visibleRecords.length);
  // ONE compact label for the row control (mobile): verb + current in-view
  // count, spelled by the dictionary. Desktop paints only the icon, so the
  // label is hidden there by CSS (never removed from the accessible name).
  const toggleLabel = (collapsed ? labels.listShowCount : labels.listHideCount)(visibleRecords.length);
  return (
    <>
      <div className={`map-list-header${onToggleCollapse ? " has-toggle" : ""}`}>
        <h2 id="map-list-title">{labels.listTitle}</h2>
        <p className="map-list-count" id="map-list-count" role="status">{countLabel}</p>
        {/* Points disclosure (t_b7728ad0; ID 2 mobile polish): on a phone the
            ENTIRE header row is ONE native button and it paints ONE compact
            label ("Show 10 points" / "Hide 10 points", dictionary-owned, so a
            320px row stays one line) — the touch target is the row, not a
            44px icon in the corner. The verbose heading/count stay in the DOM
            for the labelled sidebar, the role=status live region and the
            accessible description; CSS clips them on phones. On desktop the
            same button is the accepted 32px icon toggle: only the added
            compact label is hidden there, the chevron is untouched. The
            accessible name is exactly the visible label. */}
        {onToggleCollapse && (
          <button
            type="button"
            className={`map-list-toggle${collapsed ? "" : " is-open"}`}
            aria-expanded={!collapsed}
            aria-controls="map-list-scroll"
            aria-label={toggleLabel}
            aria-describedby="map-list-count"
            onClick={onToggleCollapse}
          >
            <span className="map-list-toggle-state">{toggleLabel}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points={collapsed ? "9 6 15 12 9 18" : "15 6 9 12 15 18"} />
            </svg>
          </button>
        )}
      </div>
      <p id="map-list-sync-help" className="sr-only">{labels.listMapSyncHelp}</p>
      <div className={`map-list-scroll${collapsed ? " is-collapsed" : ""}`} id="map-list-scroll">
        {/* Collapsed (perf): the container stays mounted as the aria-controls
            target, but NO rows are rendered — CSS already hid them
            (display:none), so they were never in the accessibility tree,
            only in the DOM cost. The heading + role=status count above
            stay rendered and keep reporting the full in-view count. */}
        {collapsed ? null : filteredRecords.length === 0
          // The map NEVER disappears (t_b9666d09): a filter that
          // matches nothing keeps the map and the sidebar rendered; the
          // truthful empty state moves INSIDE the list as a note with a
          // clear action, never replacing the workspace.
          ? (
            <div className="map-list-empty-note" role="note">
              <p className="map-list-empty-title">{labels.emptyTitle}</p>
              <p className="map-list-empty-body">{labels.emptyBody}</p>
            </div>
          )
          : visibleRecords.length === 0
            ? <p className="map-list-empty">{labels.listEmptyInView}</p>
            : (
              <MapRecordItems visibleRecords={visibleRecords} selectedId={selectedId} onSelect={onSelect} labels={labels} statusLabel={statusLabel} />
            )}
      </div>
    </>
  );
}

type ItemsProps = Pick<Props, "visibleRecords" | "selectedId" | "onSelect" | "labels" | "statusLabel">;

/**
 * The capped rows + "Show more" control. Reset rule: the page count goes back
 * to ONE page whenever the `visibleRecords` array identity changes — MappaTool
 * memoizes it on (filteredRecords, viewportBounds), so a new identity means a
 * new viewport, a filter change or newly loaded data; re-renders with the same
 * set keep the expanded pages. The selected record (marker click) is always
 * included: the limit grows to the page that holds it, so the map->list
 * aria-current highlight never points at an unrendered row.
 */
function MapRecordItems({ visibleRecords, selectedId, onSelect, labels, statusLabel }: ItemsProps) {
  const [paging, setPaging] = useState({ source: visibleRecords, pages: 1 });
  const [announce, setAnnounce] = useState("");
  let pages = paging.pages;
  if (paging.source !== visibleRecords) {
    // Derived-state reset during render (no effect flash of the old pages).
    pages = 1;
    setPaging({ source: visibleRecords, pages });
    setAnnounce("");
  }
  const selectedIndex = selectedId === null ? -1 : visibleRecords.findIndex((camera) => camera.id === selectedId);
  const limit = Math.max(pages, Math.ceil((selectedIndex + 1) / MAP_LIST_PAGE_SIZE)) * MAP_LIST_PAGE_SIZE;
  const shown = visibleRecords.slice(0, limit);
  const remaining = visibleRecords.length - shown.length;
  const listRef = useRef<HTMLUListElement>(null);
  // When the last page is appended the button unmounts: focus moves to the
  // first newly appended row instead of falling back to <body>.
  const focusRowRef = useRef<number | null>(null);
  useEffect(() => {
    if (focusRowRef.current === null) return;
    listRef.current?.querySelectorAll<HTMLButtonElement>(".map-record")[focusRowRef.current]?.focus();
    focusRowRef.current = null;
  });
  const showMore = () => {
    const nextPages = limit / MAP_LIST_PAGE_SIZE + 1;
    const nextShown = Math.min(visibleRecords.length, nextPages * MAP_LIST_PAGE_SIZE);
    if (nextShown >= visibleRecords.length) focusRowRef.current = shown.length;
    setPaging({ source: visibleRecords, pages: nextPages });
    setAnnounce(labels.listShownOf(nextShown, visibleRecords.length));
  };
  return (
    <>
      <ul ref={listRef} className="map-record-list" aria-describedby="map-list-sync-help">
        {shown.map((camera) => {
          const selected = camera.id === selectedId;
          return (
            <li key={camera.id}>
              <button
                type="button"
                className={`map-record${selected ? " selected" : ""}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(camera.id)}
              >
                <span className="map-record-status"><span className={`status-dot ${camera.status}`} /> {statusLabel(camera.status)}</span>
                <span className="map-record-title">{camera.title}</span>
                <span className="map-record-meta">{camera.kind}{camera.address ? ` · ${camera.address}` : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* Polite live region (like the other counters in the app): announces
          the new listed count after "Show more"; empty until then. */}
      <p className="sr-only" aria-live="polite">{announce}</p>
      {remaining > 0 && (
        <div className="map-list-more">
          <p className="pagination-summary">{labels.listShownOf(shown.length, visibleRecords.length)}</p>
          <button type="button" className="pagination-button" onClick={showMore}>
            {labels.listShowMore(Math.min(MAP_LIST_PAGE_SIZE, remaining), remaining)}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Memoized (perf): MapPanel passes stable props (memoized statusLabel and
 * toggle callbacks), so unrelated MapPanel/MappaTool state changes no longer
 * re-render thousands of rows.
 */
export const MapRecordList = memo(MapRecordListImpl);
