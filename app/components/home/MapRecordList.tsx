"use client";

import type { Camera } from "../../lib/records";

type Props = {
  /** Records after the directory filters are applied (map markers). */
  filteredRecords: Camera[];
  /** Records inside the current map viewport (sidebar list). */
  visibleRecords: Camera[];
  selectedId: number;
  onSelect: (id: number) => void;
  /** Clear every filter — the in-list "Clear filters" action (t_b9666d09). */
  onReset?: () => void;
  /** Localized strings (a subset of the map dictionary). */
  labels: {
    listTitle: string;
    listCount: (visible: number, total: number) => string;
    listMapSyncHelp: string;
    listEmptyInView: string;
    emptyTitle: string;
    emptyBody: string;
    clearSearch: string;
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
   * the header toggle). Desktop ignores the flag entirely.
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
export function MapRecordList({ filteredRecords, visibleRecords, selectedId, onSelect, onReset, labels, statusLabel, collapsed = false, onToggleCollapse }: Props) {
  // Mobile map-first (t_b7728ad0): the "Points in the current view" panel
  // starts compact below the map. The header stays visible (title + count)
  // and carries an accessible disclosure toggle (aria-expanded, keyboard
  // reachable); the scrollable list itself is hidden while collapsed. On
  // desktop the flag is ignored — the sidebar column always shows the list.
  return (
    <>
      <div className="map-list-header">
        <h2 id="map-list-title">{labels.listTitle}</h2>
        <p className="map-list-count" role="status">{labels.listCount(visibleRecords.length, filteredRecords.length)}</p>
        {onToggleCollapse && (
          <button
            type="button"
            className={`map-list-toggle${collapsed ? "" : " is-open"}`}
            aria-expanded={!collapsed}
            aria-controls="map-list-scroll"
            aria-label={`${labels.listTitle}: ${labels.listCount(visibleRecords.length, filteredRecords.length)}`}
            onClick={onToggleCollapse}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span className="sr-only">{collapsed ? labels.listTitle : `${labels.listTitle}: ${labels.listCount(visibleRecords.length, filteredRecords.length)}`}</span>
          </button>
        )}
      </div>
      <p id="map-list-sync-help" className="sr-only">{labels.listMapSyncHelp}</p>
      <div className={`map-list-scroll${collapsed ? " is-collapsed" : ""}`} id="map-list-scroll">
        {filteredRecords.length === 0
          // The map NEVER disappears (t_b9666d09): a filter that
          // matches nothing keeps the map and the sidebar rendered; the
          // truthful empty state moves INSIDE the list as a note with a
          // clear action, never replacing the workspace.
          ? (
            <div className="map-list-empty-note" role="note">
              <p className="map-list-empty-title">{labels.emptyTitle}</p>
              <p className="map-list-empty-body">{labels.emptyBody}</p>
              {onReset ? (
                <button type="button" className="text-button" onClick={onReset}>{labels.clearSearch} <span aria-hidden="true">→</span></button>
              ) : null}
            </div>
          )
          : visibleRecords.length === 0
            ? <p className="map-list-empty">{labels.listEmptyInView}</p>
            : (
              <ul className="map-record-list" aria-describedby="map-list-sync-help">
                {visibleRecords.map((camera) => {
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
            )}
      </div>
    </>
  );
}
