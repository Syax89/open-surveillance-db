"use client";

// Decision form: required reason + optional note + action buttons for one
// moderation row. Extracted from the ModerationDashboard monolith
// (kanban t_c7460073). The dashboard stays a thin orchestrator; the form
// only knows about the row it owns (entity + id) and the shared
// DecisionFormApi.

import { useMessages } from "../LocaleProvider";
import { reasonOptions } from "./types";
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
  const escalatable = allowedActions.includes("escalate");
  const busy = api.processing === key;
  const disabled = busy || !api.reason(key) || !api.actorId;
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
        <label htmlFor={noteId}>{t.moderatorNote}
          <textarea id={noteId} value={api.note(key)} onChange={(event) => api.setNote(key, event.target.value)} maxLength={500} rows={3} aria-describedby={`${noteId}-help`} />
          <span id={`${noteId}-help`} className="search-count">{escalatable ? `${t.escalateHelp} ${t.noteHelp}` : t.noteHelp}</span>
        </label>
      </fieldset>
      <div className="record-list-actions" aria-label={`${t.decisionFor} ${entity} ${id}`}>
        {allowedActions.map((action) => <button key={action} type="button" className={action === "approve" || action === "reverify" ? "button button-primary" : action === "hide" || action === "mark-stale" ? "button button-quiet" : "text-button"} disabled={disabled || (action === "approve" && photoApproveLocked)} onClick={() => api.decide(entity, id, action)}>{busy ? t.saving : t.action[action]}</button>)}
      </div>
    </>
  );
}
