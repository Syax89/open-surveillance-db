"use client";

// Decision form: required reason + optional note + action buttons for one
// moderation row. Extracted from the ModerationDashboard monolith
// (kanban t_c7460073). The dashboard stays a thin orchestrator; the form
// only knows about the row it owns (entity + id) and the shared
// DecisionFormApi.
//
// Correction rows (H1, t_69891619) get two extra local fields so a
// moderator can associate the request with a record outcome:
//   - "Record outcome" (required on approve): kept | corrected | removed |
//     marked-stale | escalated — the record effect of an approval;
//   - "Record id" (required on associate, optional on approve/reject): the
//     record the request is linked to (re)association.
// Both fields stay correction-only; camera/photo/edit rows render exactly
// the previous form.

import { useMessages } from "../../lib/use-messages";
import { correctionOutcomeOptions, reasonOptions } from "./types";
import type { DecisionFormApi, ModerationAction, QueueEntity } from "./types";

type Props = {
  entity: QueueEntity;
  id: number;
  allowedActions: ModerationAction[];
  api: DecisionFormApi;
};

export function DecisionForm({ entity, id, allowedActions, api }: Props) {
  const t = useMessages().moderation;
  const key = `${entity}-${id}`;
  const reasonId = `${key}-reason`;
  const noteId = `${key}-note`;
  const outcomeId = `${key}-outcome`;
  const cameraIdFieldId = `${key}-camera`;
  const isCorrection = entity === "correction";
  const escalatable = allowedActions.includes("escalate");
  const busy = api.processing === key;
  const disabled = busy || !api.reason(key) || !api.actorId;
  // Correction-specific gating (H1): approve must name a record outcome and
  // associate must name a record id — otherwise the decision would be
  // recorded without associating the request to any record outcome.
  const approveLocked = isCorrection && !api.outcome(key);
  const associateLocked = isCorrection && !api.cameraId(key);
  const photoApproveLocked = entity === "photo" && api.redactionConfirmed(key) !== true;

  return (
    <>
      <fieldset className="report-form" style={{ marginTop: 4, padding: 18 }}>
        <legend>{t.details}</legend>
        <label htmlFor={reasonId}>{t.requiredReason}
          <select id={reasonId} value={api.reason(key)} onChange={(event) => api.setReason(key, event.target.value)} required>
            <option value="">{t.selectReason}</option>
            {reasonOptions.map((option) => <option key={option.value} value={option.value}>{t.reasons[option.value]}</option>)}
          </select>
        </label>
        {isCorrection && (
          <label htmlFor={outcomeId}>{t.recordOutcome}
            <select id={outcomeId} value={api.outcome(key)} onChange={(event) => api.setOutcome(key, event.target.value)} required={allowedActions.includes("approve")}>
              <option value="">{t.selectOutcome}</option>
              {correctionOutcomeOptions.map((option) => <option key={option.value} value={option.value}>{t.outcomeLabels[option.value]}</option>)}
            </select>
            <span className="search-count">{t.recordOutcomeHelp}</span>
          </label>
        )}
        {isCorrection && (
          <label htmlFor={cameraIdFieldId}>{t.recordId}
            <input id={cameraIdFieldId} type="number" min={1} step={1} inputMode="numeric" value={api.cameraId(key)} onChange={(event) => api.setCameraId(key, event.target.value)} aria-describedby={`${cameraIdFieldId}-help`} />
            <span id={`${cameraIdFieldId}-help`} className="search-count">{t.recordIdHelp}</span>
          </label>
        )}
        <label htmlFor={noteId}>{t.moderatorNote}
          <textarea id={noteId} value={api.note(key)} onChange={(event) => api.setNote(key, event.target.value)} maxLength={500} rows={3} aria-describedby={`${noteId}-help`} />
          <span id={`${noteId}-help`} className="search-count">{escalatable ? `${t.escalateHelp} ${t.noteHelp}` : t.noteHelp}</span>
        </label>
      </fieldset>
      <div className="record-list-actions" aria-label={`${t.decisionFor} ${entity} ${id}`}>
        {allowedActions.map((action) => <button key={action} type="button" className={action === "approve" || action === "reverify" ? "button button-primary" : action === "hide" || action === "mark-stale" ? "button button-quiet" : "text-button"} disabled={disabled || (action === "approve" && (photoApproveLocked || approveLocked)) || (action === "associate" && associateLocked)} onClick={() => api.decide(entity, id, action)}>{busy ? t.saving : t.action[action]}</button>)}
      </div>
    </>
  );
}
