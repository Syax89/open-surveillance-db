"use client";

// Community edit-request queue card (ADR 0018 §4, C3). The moderator reviews
// the contributor's per-column diff (old vs proposed) and applies or discards
// it with the standard DecisionForm (approve / reject). Only the changed
// columns are shown; an unchanged column is never proposed (NULL in the
// payload). The card is a11y-consistent with the other queue cards: labelled
// rows, dt/dd pairs, and the DecisionForm's aria-labelled action group.

import { useMessages } from "../../lib/use-messages";
import { DecisionForm } from "./DecisionForm";
import type { DecisionFormApi, EditRequestInQueue } from "./types";

type Props = {
  editRequest: EditRequestInQueue;
  queueBadge: React.ReactNode;
  api: DecisionFormApi;
  readableDate: (value?: string) => string;
};

const diffRows = [
  { field: "title", proposed: "proposedTitle", current: "currentTitle" },
  { field: "kind", proposed: "proposedKind", current: "currentKind" },
  { field: "address", proposed: "proposedAddress", current: "currentAddress" },
  { field: "notes", proposed: "proposedNotes", current: "currentNotes" },
  { field: "manufacturer", proposed: "proposedManufacturer", current: "currentManufacturer" },
  { field: "observedOn", proposed: "proposedObservedOn", current: "currentObservedOn" },
  { field: "description", proposed: "proposedDescription", current: "currentDescription" },
] as const;

export function EditQueueItem({ editRequest, queueBadge, api, readableDate }: Props) {
  const t = useMessages().moderation;
  const changedRows = diffRows.filter((row) => editRequest[row.proposed] !== null && editRequest[row.proposed] !== undefined);
  const recordTitle = editRequest.currentTitle ?? t.unavailable;
  const displayValue = (value: string | null | undefined, clearedLabel: string) =>
    value === null || value === undefined || value === "" ? clearedLabel : value;

  return (
    <article className="record-list-card">
      <div>
        <p className="card-topline"><span className="status-dot pending" /> {t.editRequest}</p>
        <h3>{recordTitle}</h3>
        <p className="record-kind">{t.editRequest} #{editRequest.id}</p>
      </div>
      {queueBadge}
      <dl>
        <div><dt>{t.relatedRecord}</dt><dd>#{editRequest.cameraId ?? t.unavailable} · {t.status}: {editRequest.cameraStatus ?? t.unavailable}</dd></div>
        <div><dt>{t.submitted}</dt><dd>{readableDate(editRequest.createdAt)}</dd></div>
      </dl>
      <div>
        <h4>{t.editDiffTitle}</h4>
        <p className="search-count">{t.editDiffHelp}</p>
        {changedRows.length === 0
          ? <p className="search-count">{t.editDiffEmpty}</p>
          : <dl className="edit-diff">
              {changedRows.map((row) => (
                <div key={row.field}>
                  <dt>{t.fieldLabels[row.field]}</dt>
                  <dd>
                    <span className="edit-diff-old">{t.current}: {displayValue(editRequest[row.current], t.notSet)}</span>
                    <span className="edit-diff-new">{t.proposed}: {displayValue(editRequest[row.proposed], t.editDiffCleared)}</span>
                  </dd>
                </div>
              ))}
            </dl>}
      </div>
      <DecisionForm entity="camera_edit" id={editRequest.id} allowedActions={["approve", "reject"]} api={api} />
    </article>
  );
}
