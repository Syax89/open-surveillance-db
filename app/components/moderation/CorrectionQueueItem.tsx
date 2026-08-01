"use client";

// Correction request queue card. Extracted from the ModerationDashboard
// monolith (kanban t_c7460073).

import { useMessages } from "../LocaleProvider";
import { DecisionForm } from "./DecisionForm";
import type { CorrectionInQueue, DecisionFormApi } from "./types";

type Props = {
  correction: CorrectionInQueue;
  queueBadge: React.ReactNode;
  api: DecisionFormApi;
  readableDate: (value?: string) => string;
  readableStatus: (status?: string) => string;
};

export function CorrectionQueueItem({ correction, queueBadge, api, readableDate, readableStatus }: Props) {
  const t = useMessages().moderation;
  return (
    <article className="record-list-card">
      <div><p className="card-topline"><span className="status-dot pending" /> {t.privateCorrection}</p><h3>{correction.issueType}</h3><p className="record-kind">{correction.cameraId ? `${t.relatedRecord} #${correction.cameraId}` : t.generalConcern}</p></div>
      {queueBadge}
      <dl>
        <div><dt>{t.submitted}</dt><dd>{readableDate(correction.createdAt)}</dd></div>
        <div><dt>{t.contact}</dt><dd>{correction.contact || t.noContact}</dd></div>
        <div><dt>{t.status}</dt><dd>{readableStatus(correction.status)}</dd></div>
      </dl>
      <div><h4>{t.request}</h4><p>{correction.message}</p></div>
      <DecisionForm entity="correction" id={correction.id} allowedActions={["approve", "reject", "escalate"]} api={api} />
    </article>
  );
}
