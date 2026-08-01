"use client";

// Moderation history section: read-only list of recent decisions.
// Extracted from the ModerationDashboard monolith (kanban t_c7460073).
// Unlike the queue sections the history is not gated on the loading flag
// (the monolith rendered empty/records directly), so it keeps its own
// section shell instead of reusing QueueSection.

import { useMessages } from "../LocaleProvider";
import type { ModerationEvent } from "./types";

type Props = {
  events: ModerationEvent[];
  readableDate: (value?: string) => string;
  readableAction: (action?: string) => string;
  readableReason: (reasonCode?: string) => string;
  readableStatus: (status?: string) => string;
};

export function HistorySection({ events, readableDate, readableAction, readableReason, readableStatus }: Props) {
  const t = useMessages().moderation;
  return (
    <section className="moderation-section" aria-labelledby="moderation-history-title">
      <div className="section-heading"><div><p className="eyebrow"><span /> {t.localAudit}</p><h2 id="moderation-history-title">{t.recentDecisions}</h2></div><p className="section-note">{t.readOnlyHistory}</p></div>
      {events.length === 0 ? <div className="empty-state"><h3>{t.noDecisionsTitle}</h3><p>{t.noDecisionsText}</p></div> : <ul className="moderation-list" aria-label={t.recentDecisions}>{events.map((event, index) => <li key={event.id ?? `${event.entity ?? "event"}-${event.entityId ?? index}-${event.createdAt ?? event.timestamp ?? index}`}><article className="record-list-card"><div><p className="card-topline"><span className="status-dot pending" /> {event.entity ?? t.moderation}</p><h3>{readableAction(event.action)}</h3><p className="record-kind">{readableStatus(event.previousStatus) || t.unknown} → {readableStatus(event.newStatus) || t.recorded}</p></div><dl><div><dt>{t.reason}</dt><dd>{readableReason(event.reasonCode ?? event.reason)}</dd></div><div><dt>{t.timestamp}</dt><dd>{readableDate(event.createdAt ?? event.timestamp)}</dd></div><div><dt>{t.item}</dt><dd>{event.entityId ? `#${event.entityId}` : t.unavailable}</dd></div><div><dt>{t.actor}</dt><dd>{event.actor ?? t.localModerator}{event.actorRole ? ` · ${event.actorRole}` : ""}{event.recused === 1 ? ` · ${t.recusedBadge}` : ""}{event.escalated === 1 ? ` · ${t.escalatedBadge}` : ""}</dd></div>{event.secondReviewerId !== undefined && event.secondReviewerId !== null && <div><dt>{t.secondReviewer}</dt><dd>#{event.secondReviewerId}</dd></div>}</dl>{event.note && <div><h4>{t.moderatorNoteTitle}</h4><p>{event.note}</p></div>}</article></li>)}</ul>}
    </section>
  );
}
