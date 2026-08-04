"use client";

// Private per-record correction history (H1, t_69891619). A moderator types
// a record id and sees every correction request linked to that record —
// pending and resolved — with the request's decision trail (approve /
// reject / associate / escalate from the append-only audit log).
//
// Data comes from GET /api/moderation/corrections?cameraId=N, which is
// moderator-only (worker edge gate + coarse role). The public record page
// never exposes this payload: it keeps the filtered
// listPublicCameraRevisions projection (AC-5).

import { useState } from "react";
import { useMessages } from "../../lib/use-messages";
import type { ModerationEvent } from "./types";

type HistoryRequest = {
  id: number;
  cameraId: number | null;
  issueType: string;
  message: string;
  contact: string | null;
  status: string;
  outcome: string | null;
  createdAt: string;
  resolvedAt: string | null;
  events: ModerationEvent[];
};

type HistoryPayload = {
  camera: { id: number; title: string; status: string } | null;
  requests: HistoryRequest[];
};

type Props = {
  readableDate: (value?: string) => string;
  readableAction: (action?: string) => string;
  readableReason: (reasonCode?: string) => string;
  readableStatus: (status?: string) => string;
  readableOutcome: (outcome?: string) => string;
};

export function CorrectionHistorySection({ readableDate, readableAction, readableReason, readableStatus, readableOutcome }: Props) {
  const t = useMessages().moderation;
  const [recordId, setRecordId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryPayload | null>(null);

  async function showHistory() {
    const cameraId = Number.parseInt(recordId, 10);
    if (!Number.isInteger(cameraId) || cameraId < 1) {
      setError(t.invalidRecordId);
      setHistory(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/moderation/corrections?cameraId=${cameraId}`);
      const data = await response.json() as HistoryPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || t.historyError);
      setHistory(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.historyError);
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="moderation-section" aria-labelledby="correction-history-title">
      <div className="section-heading"><div><p className="eyebrow"><span /> {t.corrections}</p><h2 id="correction-history-title">{t.recordHistoryTitle}</h2></div><p className="section-note">{t.recordHistoryHelp}</p></div>
      <form className="report-form" style={{ marginTop: 4, padding: 18 }} onSubmit={(event) => { event.preventDefault(); showHistory(); }}>
        <label htmlFor="correction-history-record">{t.recordId}
          <input id="correction-history-record" type="number" min={1} step={1} inputMode="numeric" value={recordId} onChange={(event) => setRecordId(event.target.value)} aria-describedby="correction-history-help" />
          <span id="correction-history-help" className="search-count">{t.recordIdHistoryHelp}</span>
        </label>
        <button type="submit" className="button button-primary" disabled={loading || recordId.trim() === ""}>{loading ? t.historyLoading : t.historyShow}</button>
      </form>
      {error && <p className="notice" role="alert">{error}</p>}
      {loading && <p className="loading-note" aria-live="polite">{t.historyLoading}</p>}
      {!loading && history && history.camera && (
        <>
          <p className="record-kind">{t.relatedRecord} #{history.camera.id} — {history.camera.title} · {readableStatus(history.camera.status)}</p>
          {history.requests.length === 0 ? (
            <div className="empty-state"><h3>{t.historyEmptyTitle}</h3><p>{t.historyEmptyText}</p></div>
          ) : (
            <ul className="moderation-list" aria-label={t.recordHistoryTitle}>{history.requests.map((request) => (
              <li key={request.id}>
                <article className="record-list-card">
                  <div><p className="card-topline"><span className="status-dot pending" /> {t.privateCorrection} #{request.id}</p><h3>{request.issueType}</h3><p className="record-kind">{request.cameraId ? `${t.relatedRecord} #${request.cameraId}` : t.generalConcern}</p></div>
                  <dl>
                    <div><dt>{t.status}</dt><dd>{readableStatus(request.status)}</dd></div>
                    {request.outcome ? <div><dt>{t.recordOutcome}</dt><dd>{readableOutcome(request.outcome)}</dd></div> : null}
                    <div><dt>{t.submitted}</dt><dd>{readableDate(request.createdAt)}</dd></div>
                    {request.resolvedAt ? <div><dt>{t.resolvedAt}</dt><dd>{readableDate(request.resolvedAt)}</dd></div> : null}
                    <div><dt>{t.contact}</dt><dd>{request.contact || t.noContact}</dd></div>
                  </dl>
                  <div><h4>{t.request}</h4><p>{request.message}</p></div>
                  {request.events.length > 0 && (
                    <div>
                      <h4>{t.decisionTrail}</h4>
                      <ul className="moderation-list">
                        {request.events.map((event, index) => (
                          <li key={event.id ?? `${request.id}-event-${index}`}>
                            <article className="record-list-card">
                              <div><p className="card-topline"><span className="status-dot pending" /> {t.localAudit}</p><h3>{readableAction(event.action)}</h3><p className="record-kind">{readableStatus(event.previousStatus) || t.unknown} → {readableStatus(event.newStatus) || t.recorded}</p></div>
                              <dl>
                                <div><dt>{t.reason}</dt><dd>{readableReason(event.reasonCode ?? event.reason)}</dd></div>
                                <div><dt>{t.timestamp}</dt><dd>{readableDate(event.createdAt ?? event.timestamp)}</dd></div>
                                <div><dt>{t.actor}</dt><dd>{event.actor ?? t.localModerator}{event.actorRole ? ` · ${event.actorRole}` : ""}{event.recused === 1 ? ` · ${t.recusedBadge}` : ""}{event.escalated === 1 ? ` · ${t.escalatedBadge}` : ""}</dd></div>
                              </dl>
                              {event.note ? <div><h4>{t.moderatorNoteTitle}</h4><p>{event.note}</p></div> : null}
                            </article>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              </li>
            ))}</ul>
          )}
        </>
      )}
      {!loading && history && history.camera === null && <div className="empty-state"><h3>{t.historyNotFoundTitle}</h3><p>{t.historyNotFoundText}</p></div>}
    </section>
  );
}
