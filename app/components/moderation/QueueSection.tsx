"use client";

// Generic moderation queue section: labelled heading, empty state and the
// labelled record list. Extracted from the ModerationDashboard monolith
// (kanban t_c7460073). The dashboard provides the section copy, the item
// list and a renderItem that turns one item into a card; this component
// owns the repeated section shell so the dashboard can stay thin.

import type { ReactNode } from "react";

/** "Load more" state for a bounded queue (built by useModerationQueue.queuePaging). */
export type QueuePaging = {
  /** Live "Showing N of M" copy. */
  showing: string;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  /** True once a further page was appended (keeps the control, and focus, in place on the last page). */
  expanded: boolean;
  loadMoreLabel: string;
  loadingLabel: string;
  errorLabel: string;
  onLoadMore: () => void;
};

type Props<T> = {
  /** id used by aria-labelledby on the section and the h2. */
  id: string;
  eyebrow: string;
  title: string;
  /** section-note copy (usually a count). */
  note: string;
  /** aria-label for the record list. */
  listLabel: string;
  loading: boolean;
  items: T[];
  emptyTitle: string;
  emptyText: string;
  renderItem: (item: T) => ReactNode;
  /** Stable React key per item (preserves the monolith's id-based keys). */
  itemKey: (item: T) => string | number;
  /** Optional footer rendered after the record list (e.g. pagination nav). */
  footer?: ReactNode;
  /** True when an empty list is a LATER page (has history), not global emptiness. */
  hasHistory?: boolean;
  /** Optional "load more" control for a bounded queue. */
  paging?: QueuePaging;
};

export function QueueSection<T>({ id, eyebrow, title, note, listLabel, loading, items, emptyTitle, emptyText, renderItem, itemKey, footer, hasHistory, paging }: Props<T>) {
  return (
    <section className="moderation-section" aria-labelledby={id}>
      <div className="section-heading"><div><p className="eyebrow"><span /> {eyebrow}</p><h2 id={id}>{title}</h2></div><p className="section-note">{note}</p></div>
      {!loading && items.length === 0 && !hasHistory && <div className="empty-state"><h3>{emptyTitle}</h3><p>{emptyText}</p></div>}
      {items.length > 0 && <ul className="moderation-list" aria-label={listLabel}>{items.map((item) => <li key={itemKey(item)}>{renderItem(item)}</li>)}</ul>}
      {paging && items.length > 0 && (paging.hasMore || paging.failed || paging.expanded) && (
        // aria-disabled (not disabled) keeps keyboard focus on the button while a page
        // loads and after the last one; the click handler is guarded by the hook.
        <nav className="directory-pagination" aria-label={listLabel} aria-busy={paging.loading}>
          <p className="search-count" aria-live="polite">{paging.showing}</p>
          {paging.failed && <p className="notice" role="alert">{paging.errorLabel}</p>}
          <button type="button" className="pagination-button" aria-disabled={!paging.hasMore || paging.loading} onClick={() => { if (paging.hasMore && !paging.loading) paging.onLoadMore(); }}>
            {paging.loading ? paging.loadingLabel : paging.loadMoreLabel}
          </button>
        </nav>
      )}
      {footer}
    </section>
  );
}
