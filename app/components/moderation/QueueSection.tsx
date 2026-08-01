"use client";

// Generic moderation queue section: labelled heading, empty state and the
// labelled record list. Extracted from the ModerationDashboard monolith
// (kanban t_c7460073). The dashboard provides the section copy, the item
// list and a renderItem that turns one item into a card; this component
// owns the repeated section shell so the dashboard can stay thin.

import type { ReactNode } from "react";

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
};

export function QueueSection<T>({ id, eyebrow, title, note, listLabel, loading, items, emptyTitle, emptyText, renderItem, itemKey }: Props<T>) {
  return (
    <section className="moderation-section" aria-labelledby={id}>
      <div className="section-heading"><div><p className="eyebrow"><span /> {eyebrow}</p><h2 id={id}>{title}</h2></div><p className="section-note">{note}</p></div>
      {!loading && items.length === 0 && <div className="empty-state"><h3>{emptyTitle}</h3><p>{emptyText}</p></div>}
      {items.length > 0 && <ul className="moderation-list" aria-label={listLabel}>{items.map((item) => <li key={itemKey(item)}>{renderItem(item)}</li>)}</ul>}
    </section>
  );
}
