"use client";

// Photo evidence queue card: private preview, redaction confirmation and
// the approve/reject decision. Extracted from the ModerationDashboard
// monolith (kanban t_c7460073).

import { useMessages } from "../LocaleProvider";
import { DecisionForm } from "./DecisionForm";
import type { DecisionFormApi, PhotoInQueue } from "./types";

type Props = {
  photo: PhotoInQueue;
  api: DecisionFormApi;
  readableDate: (value?: string) => string;
};

export function PhotoQueueItem({ photo, api, readableDate }: Props) {
  const t = useMessages().moderation;
  const key = `photo-${photo.id}`;
  return (
    <article className="record-list-card">
      <div><p className="card-topline"><span className="status-dot pending" /> {t.photoEvidence} #{photo.id}</p><h3>{t.photoEvidence}</h3><p className="record-kind">{photo.mimeType} · {photo.width}×{photo.height} · {(photo.sizeBytes / 1024).toFixed(1)} KB</p></div>
      <dl>
        <div><dt>{t.photoStripState}</dt><dd>{photo.exifStripped === 1 ? t.verified : t.photoNoRedaction}</dd></div>
        <div><dt>{t.photoRedactionState}</dt><dd>{photo.redactionConfirmed === 1 ? t.verified : t.photoNoRedaction}</dd></div>
        <div><dt>{t.relatedRecord}</dt><dd>{photo.cameraId ? `#${photo.cameraId}` : t.unavailable}</dd></div>
        <div><dt>{t.submitted}</dt><dd>{readableDate(photo.createdAt)}</dd></div>
      </dl>
      <div className="photo-preview-frame">{/* eslint-disable @next/next/no-img-element -- auth-gated moderation preview; next/image cannot fetch a cookie-authenticated API route */}<img src={`/api/moderation/photos/${photo.id}`} alt={`${t.photoEvidence} #${photo.id}`} loading="lazy" />{/* eslint-enable @next/next/no-img-element */}</div>
      <div className="photo-moderate-note" role="note">{t.photoRedactionHelp}</div>
      <label className="photo-redaction-check"><input type="checkbox" checked={api.redactionConfirmed(key)} onChange={(event) => api.setRedactionConfirmed(key, event.target.checked)} /> <span>{t.photoRedactionConfirm}</span></label>
      <DecisionForm entity="photo" id={photo.id} allowedActions={["approve", "reject"]} api={api} />
    </article>
  );
}
