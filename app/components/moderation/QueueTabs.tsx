"use client";

// Moderation queue tabs (2026-11 redesign: the page stacked six long queues
// — ~18,000px on desktop). One queue is on screen at a time; the tab bar
// shows every queue's size so nothing is out of sight. WAI-ARIA tabs:
// roving tabindex, ←/→/Home/End move between tabs, and the selected tab is
// mirrored in the URL hash (#review…) so a reload or a shared link lands on
// the same queue.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export const QUEUE_TABS = ["pending", "review", "corrections", "edits", "published", "history"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

const isQueueTab = (value: string): value is QueueTab => (QUEUE_TABS as readonly string[]).includes(value);

/** Selected tab, initialised from (and mirrored to) the URL hash. */
export function useQueueTab(): [QueueTab, (tab: QueueTab) => void] {
  const [tab, setTab] = useState<QueueTab>("pending");
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL hash is external state read once after hydration (the server cannot see it).
    if (isQueueTab(fromHash)) setTab(fromHash);
  }, []);
  const select = (next: QueueTab) => {
    setTab(next);
    window.history.replaceState(window.history.state, "", `#${next}`);
  };
  return [tab, select];
}

type Props = {
  label: string;
  tab: QueueTab;
  onSelect: (tab: QueueTab) => void;
  labels: Record<QueueTab, string>;
  /** Queue sizes shown as badges (omit for tabs without a count). */
  counts: Partial<Record<QueueTab, number>>;
};

export function QueueTabs({ label, tab, onSelect, labels, counts }: Props) {
  const refs = useRef<Partial<Record<QueueTab, HTMLButtonElement | null>>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = QUEUE_TABS.indexOf(tab);
    const next = event.key === "ArrowRight" ? QUEUE_TABS[(index + 1) % QUEUE_TABS.length]
      : event.key === "ArrowLeft" ? QUEUE_TABS[(index - 1 + QUEUE_TABS.length) % QUEUE_TABS.length]
        : event.key === "Home" ? QUEUE_TABS[0]
          : event.key === "End" ? QUEUE_TABS[QUEUE_TABS.length - 1] : null;
    if (!next) return;
    event.preventDefault();
    onSelect(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="moderation-tabs" role="tablist" aria-label={label}>
      {QUEUE_TABS.map((id) => (
        <button
          key={id}
          ref={(node) => { refs.current[id] = node; }}
          type="button"
          role="tab"
          id={`queue-tab-${id}`}
          aria-selected={tab === id}
          aria-controls={`queue-panel-${id}`}
          tabIndex={tab === id ? 0 : -1}
          className="moderation-tab"
          onClick={() => onSelect(id)}
          onKeyDown={onKeyDown}
        >
          {labels[id]}
          {counts[id] !== undefined ? <span className="moderation-tab-count">{counts[id]}</span> : null}
        </button>
      ))}
    </div>
  );
}
