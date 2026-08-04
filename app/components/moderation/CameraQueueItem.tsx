"use client";

// Camera queue card shared by the pending / published / review sections.
// Extracted from the ModerationDashboard monolith (kanban t_c7460073) so
// the three camera sections stop duplicating the same card markup.

import { useMessages } from "../../lib/use-messages";
import { DecisionForm } from "./DecisionForm";
import type { CameraInQueue, DecisionFormApi, ModerationAction } from "./types";

type CameraVariant = "pending" | "published" | "review";

type Props = {
  camera: CameraInQueue;
  variant: CameraVariant;
  queueBadge: React.ReactNode;
  api: DecisionFormApi;
  readableDate: (value?: string) => string;
};

const variantConfig: Record<CameraVariant, {
  dotClass: string;
  topline: "pendingReport" | "verifiedRecord" | "needsReview";
  lastUpdate: boolean;
  metadataPublication: boolean;
  notesTitle: "submitterNotes" | "recordNotes";
  allowedActions: ModerationAction[];
}> = {
  pending: { dotClass: "pending", topline: "pendingReport", lastUpdate: false, metadataPublication: true, notesTitle: "submitterNotes", allowedActions: ["approve", "hide", "reject", "escalate"] },
  published: { dotClass: "verified", topline: "verifiedRecord", lastUpdate: true, metadataPublication: false, notesTitle: "recordNotes", allowedActions: ["mark-stale", "hide", "escalate"] },
  review: { dotClass: "pending", topline: "needsReview", lastUpdate: true, metadataPublication: false, notesTitle: "recordNotes", allowedActions: ["reverify", "hide", "escalate"] },
};

export function CameraQueueItem({ camera, variant, queueBadge, api, readableDate }: Props) {
  const t = useMessages().moderation;
  const config = variantConfig[variant];
  const key = `camera-${camera.id}`;
  const choices = api.metadataChoices(key);
  const metadataAvailable = Boolean(camera.manufacturer || camera.observedOn);

  return (
    <article className="record-list-card">
      <div><p className="card-topline"><span className={`status-dot ${config.dotClass}`} /> {t[config.topline]}</p><h3>{camera.title}</h3><p className="record-kind">{camera.kind}</p></div>
      {queueBadge}
      <dl>
        <div><dt>{t.approximateLocation}</dt><dd>{camera.address || t.noAddress}<br />{camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}</dd></div>
        <div><dt>{t.source}</dt><dd>{camera.source || t.communityReport}</dd></div>
        <div><dt>{config.lastUpdate ? t.lastUpdate : t.submitted}</dt><dd>{config.lastUpdate ? (camera.updated ? readableDate(camera.updated) : readableDate(camera.createdAt)) : readableDate(camera.createdAt)}</dd></div>
      </dl>
      {metadataAvailable && <dl className="camera-metadata">
        {camera.manufacturer && <div><dt>{t.manufacturer}</dt><dd>{camera.manufacturer}</dd></div>}
        {camera.observedOn && <div><dt>{t.observedOn}</dt><dd>{camera.observedOn}</dd></div>}
      </dl>}
      {camera.notes && <div><h4>{t[config.notesTitle]}</h4><p>{camera.notes}</p></div>}
      {config.metadataPublication && metadataAvailable && (
        <fieldset className="metadata-publication">
          <legend>{t.metadataPublication}</legend>
          <p>{t.metadataPublicationHelp}</p>
          {camera.manufacturer && <label className="check-label"><input type="checkbox" checked={choices.manufacturer} onChange={(event) => api.setMetadataChoice(key, "manufacturer", event.target.checked)} /> <span>{t.publishManufacturer}: {camera.manufacturer}</span></label>}
          {camera.observedOn && <label className="check-label"><input type="checkbox" checked={choices.observedOn} onChange={(event) => api.setMetadataChoice(key, "observedOn", event.target.checked)} /> <span>{t.publishObservedOn}: {camera.observedOn}</span></label>}
        </fieldset>
      )}
      <DecisionForm entity="camera" id={camera.id} allowedActions={config.allowedActions} api={api} />
    </article>
  );
}
